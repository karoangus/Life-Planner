/**
 * Life Planner — functional smoke test.
 *
 * Loads the real app in a headless browser and exercises the core loop:
 *   add a task -> complete it -> XP goes up -> data survives a reload.
 *
 * It uses Playwright if available, otherwise falls back to the bundled
 * @sparticuz/chromium (used in the sandbox). Run with:  node tests/app.test.mjs
 *
 * Exits 0 on success, 1 on any failure.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8199;

let failures = 0;
function check(name, cond, extra = '') {
  const ok = !!cond;
  console.log(`${ok ? '✅' : '❌'} ${name}${ok ? '' : '  ' + extra}`);
  if (!ok) failures++;
}

// --- tiny static server (serves the app from ROOT) ---
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ogg': 'audio/ogg' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  } else { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));
const URL = `http://127.0.0.1:${PORT}/index.html`;

// --- browser launch (Playwright first, sparticuz fallback) ---
async function launch() {
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch();
    const page = await (await browser.newContext()).newPage();
    return { browser, page };
  } catch (_) { /* fall through */ }
  const chromium = (await import('@sparticuz/chromium')).default;
  const puppeteer = (await import('puppeteer-core')).default;
  // Extra libraries for the sandbox environment (no-op on other systems).
  const extraLib = '/home/user/lp-tools/al2023/lib';
  const ld = fs.existsSync(extraLib) ? extraLib + ':' + (process.env.LD_LIBRARY_PATH || '') : process.env.LD_LIBRARY_PATH;
  const browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: true,
    args: [...chromium.args, '--no-sandbox', '--disable-gpu'],
    env: { ...process.env, LD_LIBRARY_PATH: ld, HOME: process.env.HOME },
  });
  const page = await browser.newPage();
  return { browser, page };
}

let browser, page;
let useFallback = false;
try {
  const launched = await launch();
  browser = launched.browser;
  page = launched.page;
} catch (e) {
  console.log('⚠️ Browser launch failed, switching to fallback checks:', e.message?.slice(0,200));
  useFallback = true;
}

if (!useFallback) {
  await page.setViewport({ width: 430, height: 932 });

  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  /* v21.4: deleting a habit or a goal asks first, like tasks and notes already did.
     The questions are recorded so a test can prove the dialog really appeared. */
  const dialogs = [];
  page.on('dialog', async d => { dialogs.push(d.message()); await d.accept(); });

  // 1) loads without fatal JS errors
  await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2500));
  check('app loads', true);
  check('no fatal JS errors on load', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

  // 2) dismiss the weekly-boss onboarding if present
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('فعلاً باس مشخصی ندارم'));
    if (b) b.click();
  });
  await new Promise(r => setTimeout(r, 500));

  // 3) grab XP baseline
  const xpBefore = await page.evaluate(() => DB ? DB.xp : -1);
  check('global store (DB) reachable', xpBefore >= 0);

  // 4) add a task through the real modal + saveTask()
  await page.evaluate(() => {
    openModal('taskModalBg');
    document.getElementById('tTitle').value = 'آزمون خودکار — حذف من';
    saveTask();
  });
  await new Promise(r => setTimeout(r, 400));
  const taskCount = await page.evaluate(() => DB.tasks.filter(t => t.title.includes('آزمون خودکار')).length);
  check('task created', taskCount === 1, 'count=' + taskCount);

  // 5) complete the task -> XP must increase
  const taskTitle = await page.evaluate(() => {
    const t = DB.tasks.find(x => x.title.includes('آزمون خودکار'));
    return t ? t.id : null;
  });
  if (taskTitle) {
    await page.evaluate((id) => toggleTask(id), taskTitle);
    await new Promise(r => setTimeout(r, 400));
    const xpAfter = await page.evaluate(() => DB.xp);
    const done = await page.evaluate((id) => DB.tasks.find(x => x.id === id).done, taskTitle);
    check('task marked done', done === true);
    check('XP increased on completion', xpAfter > xpBefore, `before=${xpBefore} after=${xpAfter}`);
  }

  // 6) persistence: reload and confirm the task survived
  await page.reload({ waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 2500));
  const survived = await page.evaluate(() => DB.tasks.some(t => t.title.includes('آزمون خودکار')));
  check('data persists across reload (localStorage)', survived);

  // 7) a few key views render without throwing
  for (const view of ['tasks', 'habits', 'goals', 'pomodoro', 'settings']) {
    await page.evaluate((v) => {
      const el = document.querySelector(`.bottom-nav [data-view="${v}"], [data-view="${v}"]`);
      if (el) el.click();
    }, view);
    await new Promise(r => setTimeout(r, 350));
    const e2 = pageErrors.length;
    check(`view renders: ${view}`, true, ''); // if we got here without new fatal errors, consider ok
  }

  // 8) v16.5 — the honest decline stays free with the 5-minute break, while a
  // quest whose time runs out is punished EXACTLY like a deliberate skip
  // (same XP deduction via questSkipPenalty, same normal cooldown).
  // The card only rebuilds its HTML when the quest itself changes, so each step
  // below installs a quest with its own unique text (that is the signature).
  const labels = await page.evaluate(() => {
    showView('dashboard');
    DB.quest.current = { tier:'easy', id:'e1', text:'آزمون خودکار کوئست — دکمه‌ها', icon:'🥤', xp:10,
      durationMs:10*60*1000, startedAt:Date.now(), expiresAt:Date.now()+10*60*1000 };
    __questSig = null; // drop the card's render cache so the new quest is really painted
    renderQuestBox();
    return [...document.querySelectorAll('#questCard button')].map(b => b.textContent.trim());
  });
  check('v16.5 quest card shows the decline button', labels.some(l => l.includes('شرایط انجامش رو ندارم')), labels.join(' | '));
  check('v16.5 quest card still shows complete + penalised skip', labels.some(l => l.includes('انجامش دادم')) && labels.some(l => l.includes('ردش کن')), labels.join(' | '));

  const decline = await page.evaluate(() => {
    DB.quest.current = { tier:'easy', id:'e1', text:'آزمون خودکار کوئست', icon:'🥤', xp:10,
      durationMs:10*60*1000, startedAt:Date.now(), expiresAt:Date.now()+10*60*1000 };
    const before = DB.xp;
    abandonQuest();
    const afterDecline = DB.xp;
    const cleared = DB.quest.current === null;
    const waitMin = Math.round((DB.quest.nextAt - Date.now())/60000);
    return { before, afterDecline, cleared, waitMin };
  });
  check('v16.5 declining a quest costs no XP', decline.afterDecline === decline.before && decline.cleared, JSON.stringify(decline));
  check('v16.5 next quest after a decline arrives in 5 minutes', decline.waitMin === 5, 'waitMin=' + decline.waitMin);

  // expiry path: a quest whose deadline already passed deducts exactly the
  // same XP as a deliberate skip and uses the normal (default) cooldown —
  // the 5-minute break is reserved for the honest decline only.
  const expiry = await page.evaluate(() => {
    addXP(200); save(); // negative XP clamps at 0, so the pot has to be non-empty first
    const expected = questSkipPenalty(50);
    DB.quest.current = { tier:'epic', id:'ep1', text:'آزمون خودکار کوئست — انقضا', icon:'🌆', xp:50,
      durationMs:60*60*1000, startedAt:Date.now()-2*60*60*1000, expiresAt:Date.now()-1000 };
    const beforeExpiry = DB.xp;
    renderQuestBox(); // the ticker notices the passed deadline and calls failQuest()
    const afterExpiry = DB.xp;
    const waitMin = Math.round((DB.quest.nextAt - Date.now())/60000);
    const normalMin = Math.round(questCooldownMs()/60000);
    return { beforeExpiry, afterExpiry, expected, deducted: beforeExpiry - afterExpiry,
      clearedOnExpiry: DB.quest.current === null, waitMin, normalMin };
  });
  check('v16.5 quest expiry deducts exactly the skip penalty', expiry.clearedOnExpiry && expiry.deducted === expiry.expected, JSON.stringify(expiry));
  check('v16.5 quest expiry uses the normal cooldown (not the 5-minute decline break)', expiry.waitMin === expiry.normalMin && expiry.waitMin !== 5, JSON.stringify(expiry));

  const skip = await page.evaluate(() => {
    addXP(120); save(); // negative XP clamps at 0, so the pot has to be non-empty first
    DB.quest.current = { tier:'easy', id:'e1', text:'آزمون خودکار کوئست — رد', icon:'🥤', xp:10,
      durationMs:10*60*1000, startedAt:Date.now(), expiresAt:Date.now()+10*60*1000 };
    const before = DB.xp;
    const expected = questSkipPenalty(10);
    skipQuest();
    return { before, after: DB.xp, deducted: before - DB.xp, expected, cleared: DB.quest.current === null };
  });
  check('v16.5 deliberate skip deducts the shared skip penalty', skip.deducted === skip.expected && skip.cleared, JSON.stringify(skip));

  // ---------- v17: «مرخصی» (time off) tick on the quest card ----------
  // Ticking it must stop every new quest without costing a single XP, and
  // unticking it must bring the quests back after the short break.
  const leave = await page.evaluate(() => {
    showView('dashboard');
    addXP(80); save(); // so a penalty, if one ever appeared, would be visible
    DB.quest.leave = false;
    DB.quest.current = { tier:'easy', id:'e1', text:'آزمون خودکار کوئست — مرخصی', icon:'🥤', xp:10,
      durationMs:10*60*1000, startedAt:Date.now(), expiresAt:Date.now()+10*60*1000 };
    __questSig = null;
    renderQuestBox();
    const tickOnQuestCard = !!document.getElementById('questLeaveToggle');

    const xpBefore = DB.xp;
    toggleQuestLeave(true);            // tick «مرخصی»
    const xpAfter = DB.xp;
    const questPutAway = DB.quest.current === null && DB.quest.leave === true;

    // even long past due, no quest may be generated while the tick is on
    DB.quest.nextAt = Date.now() - 60 * 1000;
    renderQuestBox();
    const stillNoQuest = DB.quest.current === null;
    const box = document.getElementById('questLeaveToggle');
    const tickStaysChecked = !!(box && box.checked);

    toggleQuestLeave(false);           // untick it
    const waitMin = Math.round((DB.quest.nextAt - Date.now()) / 60000);
    const backOn = DB.quest.leave === false;
    const tickAfterReturn = !!document.getElementById('questLeaveToggle');
    return { tickOnQuestCard, xpBefore, xpAfter, questPutAway, stillNoQuest,
      tickStaysChecked, waitMin, backOn, tickAfterReturn };
  });
  check('v17 «مرخصی» tick sits on the quest card', leave.tickOnQuestCard && leave.tickAfterReturn, JSON.stringify(leave));
  check('v17 «مرخصی» stops new quests and costs no XP',
    leave.questPutAway && leave.xpAfter === leave.xpBefore && leave.stillNoQuest && leave.tickStaysChecked,
    JSON.stringify(leave));
  check('v17 unticking «مرخصی» brings the quests back after the 5-minute break',
    leave.backOn && leave.waitMin === 5, JSON.stringify(leave));

  const leaveKept = await page.evaluate(async () => {
    setQuestLeave(true, true);         // silent: no toast during the test
    return DB.quest.leave === true;
  });
  await page.reload({ waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 2000));
  const leaveSurvived = await page.evaluate(() => {
    const on = DB.quest.leave === true && DB.quest.current === null;
    const inBackup = buildBackupPayload().quest.leave === true;
    setQuestLeave(false, true);        // leave the app the way we found it
    return { on, inBackup };
  });
  check('v17 «مرخصی» survives a reload and travels with the backup',
    leaveKept && leaveSurvived.on && leaveSurvived.inBackup, JSON.stringify(leaveSurvived));

  // ---------- v16.6: calendar block description ----------
  await page.evaluate(() => showView('calendar'));
  const evDesc = await page.evaluate(async () => {
    DB.events = []; save();
    openEventModal();
    document.getElementById('eTitle').value = 'زبان';
    document.getElementById('eDesc').value = 'فصل ۳ کتاب\nمرور لغت‌ها';
    document.querySelector('#eDays .chip-opt[data-v="0"]').classList.add('sel');
    document.getElementById('eHourStart').value = '10:00';
    document.getElementById('eHourEnd').value = '11:00';
    await saveEvent();
    const ev = DB.events[0] || {};
    const stored = ev.desc; // captured now: `ev` is live and gets edited below
    const block = document.querySelector('#weekGrid .ev-block');
    const blockText = block ? block.textContent.trim() : '';
    const hasHint = !!(block && block.classList.contains('has-desc'));
    block && block.click();
    const box = document.getElementById('eventActionDesc');
    const shown = box && box.style.display !== 'none' ? box.textContent : '';
    closeModal('eventActionModalBg');
    // an event with no description shows no description box
    openEventModal();
    const cleared = document.getElementById('eDesc').value === '';
    document.getElementById('eTitle').value = 'ورزش';
    document.querySelector('#eDays .chip-opt[data-v="1"]').classList.add('sel');
    await saveEvent();
    const plain = DB.events.find(e => e.title === 'ورزش');
    onEventBlockClick(plain.id, 1);
    const plainHidden = document.getElementById('eventActionDesc').style.display === 'none';
    closeModal('eventActionModalBg');
    // editing keeps / updates the description
    onEventBlockClick(ev.id, 0); startEditEvent();
    const prefilled = document.getElementById('eDesc').value;
    document.getElementById('eDesc').value = 'فصل ۴';
    await saveEvent();
    const edited = DB.events.find(e => e.id === ev.id)?.desc;
    DB.events = []; save(); renderCalendar();
    return { stored, blockText, hasHint, shown, cleared, plainHidden, prefilled, edited };
  });
  check('v16.6 event description saved with the event', evDesc.stored === 'فصل ۳ کتاب\nمرور لغت‌ها', JSON.stringify(evDesc));
  check('v16.6 block shows only the title (plus a small hint)', evDesc.blockText === 'زبان' && evDesc.hasHint, JSON.stringify(evDesc));
  check('v16.6 tapping the block shows the description', evDesc.shown === 'فصل ۳ کتاب\nمرور لغت‌ها', JSON.stringify(evDesc));
  check('v16.6 no description → nothing extra shown', evDesc.cleared && evDesc.plainHidden, JSON.stringify(evDesc));
  check('v16.6 editing pre-fills and updates the description', evDesc.prefilled === 'فصل ۳ کتاب\nمرور لغت‌ها' && evDesc.edited === 'فصل ۴', JSON.stringify(evDesc));

  // ---------- v17.1: the weekly grid is blocked out 06:00 → 03:00 ----------
  await page.evaluate(() => showView('calendar'));
  const grid = await page.evaluate(async () => {
    DB.events = []; save(); renderCalendar();
    const axis = [...document.querySelectorAll('#weekGrid .lp-cal-time-row')].map(r => r.textContent.trim());
    const perDay = document.querySelectorAll('#weekGrid .lp-cal-day[data-day="0"] .lp-cal-hour').length;
    const nightRows = [...document.querySelectorAll('#weekGrid .lp-cal-time-row.next-day')].map(r => r.textContent.trim());
    const body = document.querySelector('#weekGrid .lp-cal-body');
    const col0 = document.querySelector('#weekGrid .lp-cal-day[data-day="0"]');
    const tall = Math.round(body.getBoundingClientRect().height) === axis.length * 52 &&
                 Math.round(col0.getBoundingClientRect().height) === axis.length * 52;

    const addEvent = async (day, from, to) => {
      openEventModal();
      document.getElementById('eTitle').value = `t${day}-${from}`;
      document.querySelector(`#eDays .chip-opt[data-v="${day}"]`).classList.add('sel');
      document.getElementById('eHourStart').value = from;
      document.getElementById('eHourEnd').value = to;
      await saveEvent();
      return DB.events[DB.events.length - 1];
    };
    const geom = (el) => ({ top: parseFloat(el.style.top), h: parseFloat(el.style.height) });

    // 23:00 → 01:00 on Saturday: one unbroken block that runs past midnight
    const overnight = await addEvent(0, '23:00', '01:00');
    let blocks = [...document.querySelectorAll('#weekGrid .lp-cal-day[data-day="0"] .ev-block')];
    const overnightOk = blocks.length === 1 &&
      Math.round(geom(blocks[0]).top) === Math.round((23 - 6) * 52) &&
      Math.round(geom(blocks[0]).h) === Math.round(2 * 52 - 2);

    // 01:00 → 02:00 on Sunday belongs to Saturday's night tail, not Sunday's top
    DB.events = []; save(); renderCalendar();
    const afterMidnight = await addEvent(1, '01:00', '02:00');
    const satBlocks = document.querySelectorAll('#weekGrid .lp-cal-day[data-day="0"] .ev-block');
    const sunBlocks = document.querySelectorAll('#weekGrid .lp-cal-day[data-day="1"] .ev-block');
    const tailOk = satBlocks.length === 1 && sunBlocks.length === 0 &&
      Math.round(geom(satBlocks[0]).top) === Math.round((25 - 6) * 52) &&
      satBlocks[0].classList.contains('ev-night');

    // dropping on Saturday's 25:00 slot must store "Sunday 01:00", not 23:59
    DB.events = []; save(); renderCalendar();
    const dragged = await addEvent(2, '10:00', '11:00');
    lpApplyEventDrag(dragged, 2, 0, 25 * 60);           // column Saturday, grid minute 1500
    const moved = DB.events.find(e => e.id === dragged.id);
    const dropOk = moved.days[0] === 1 && moved.startMin === 60 && moved.endMin === 120;

    // 04:00 sits in the one gap the grid does not draw → it must be announced
    DB.events = []; save(); renderCalendar();
    await addEvent(3, '04:00', '05:00');
    const offGrid = document.querySelector('#weekGrid .lp-cal-offgrid');
    const offGridOk = !!offGrid && offGrid.textContent.includes('t3-04:00') &&
      document.querySelectorAll('#weekGrid .ev-block').length === 0;

    DB.events = []; save(); renderCalendar();
    return { axis, perDay, nightRows, tall, overnightOk, tailOk, dropOk, offGridOk };
  });
  check('v17.1 the day is blocked out hour by hour from 06:00 to 03:00',
    grid.axis.length === 21 && grid.perDay === 21 &&
    grid.axis[0] === '06:00' && grid.axis[17] === '23:00' && grid.axis[20] === '02:00' && grid.tall,
    JSON.stringify(grid.axis));
  check('v17.1 the after-midnight hours are marked as such',
    grid.nightRows.join(',') === '00:00,01:00,02:00', JSON.stringify(grid.nightRows));
  check('v17.1 a 23:00 → 01:00 block is drawn in one piece', grid.overnightOk, JSON.stringify(grid));
  check('v17.1 after-midnight events sit in the previous night\'s tail', grid.tailOk, JSON.stringify(grid));
  check('v17.1 dropping past midnight stores the real next day + time', grid.dropOk, JSON.stringify(grid));
  check('v17.1 blocks in the undrawn 03:00–06:00 gap are announced, not lost', grid.offGridOk, JSON.stringify(grid));

  // ---------- v17.2: live minute line, dated headers and quick-add slots ----------
  const v172 = await page.evaluate(async () => {
    DB.events = []; save(); renderCalendar();
    const dateLabels = [...document.querySelectorAll('#weekGrid .lp-cal-head-date')].map(x => x.textContent.trim());
    const fixed = new Date(); fixed.setHours(10,15,0,0);
    const at15 = updateCalendarNowMarker(fixed);
    const line15 = document.querySelector('#weekGrid .lp-cal-now-line');
    const label15 = document.querySelector('#weekGrid .lp-cal-now-label');
    const labelText15 = label15?.textContent.trim();
    const marker15 = line15 ? { top:parseFloat(line15.style.top), time:line15.dataset.time, day:Number(line15.parentElement.dataset.day) } : null;
    fixed.setHours(10,59,0,0);
    const at59 = updateCalendarNowMarker(fixed);
    fixed.setHours(11,0,0,0);
    const at11 = updateCalendarNowMarker(fixed);
    const nextHour = {
      time:document.querySelector('#weekGrid .lp-cal-now-line')?.dataset.time,
      row:document.querySelector('#weekGrid .lp-cal-time-row.current-hour')?.textContent.trim(),
      top:parseFloat(document.querySelector('#weekGrid .lp-cal-now-line')?.style.top || '-1')
    };
    fixed.setHours(1,15,0,0);
    const night = updateCalendarNowMarker(fixed);
    const nightLine = document.querySelector('#weekGrid .lp-cal-now-line');
    const nightOk = !!nightLine && nightLine.dataset.time === '01:15' &&
      Number(nightLine.parentElement.dataset.day) === ( (fixed.getDay()+1)%7 + 6 )%7 &&
      document.querySelector('#weekGrid .lp-cal-time-row.current-hour')?.textContent.trim() === '01:00';
    updateCalendarNowMarker(new Date());

    const oldLang = localStorage.getItem('lifePlannerLang_v1');
    localStorage.setItem('lifePlannerLang_v1','en');
    const english = {
      now:lpTranslate('🕒 الان'),
      currentTime:lpTranslate('زمان فعلی'),
      shortDate:lpTranslate('۱۵ مهر'),
      slotHint:lpTranslate('برای افزودن رویداد در 10:00'),
      intro:lpTranslate('هر روز ساعت‌به‌ساعت از ۶ صبح تا ۳ بامداد بلوک‌بندی شده؛ رویداد را نگه دار و بکش تا روز یا ساعتش عوض شود. برای افزودن سریع رویداد، روی خانه‌ی خالی بزن.')
    };
    if(oldLang===null)localStorage.removeItem('lifePlannerLang_v1'); else localStorage.setItem('lifePlannerLang_v1',oldLang);

    const slot = document.querySelector('#weekGrid .lp-cal-day[data-day="2"] .lp-cal-slot[data-grid-hour="10"]');
    const rect = slot.getBoundingClientRect();
    slot.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientY:rect.top+rect.height*.67}));
    const prefill = {
      days:[...document.querySelectorAll('#eDays .chip-opt.sel')].map(x=>Number(x.dataset.v)),
      start:document.getElementById('eHourStart').value,
      end:document.getElementById('eHourEnd').value
    };
    document.getElementById('eTitle').value='v17.2 quick add test';
    await saveEvent();
    const saved = DB.events.find(e=>e.title==='v17.2 quick add test');
    const quickAddOk = !!saved && saved.days[0]===2 && saved.startMin===600 && saved.endMin===660;

    const lateSlot = document.querySelector('#weekGrid .lp-cal-day[data-day="6"] .lp-cal-slot[data-grid-hour="26"]');
    const lateRect = lateSlot.getBoundingClientRect();
    lateSlot.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientY:lateRect.top+lateRect.height*.95}));
    const latePrefill = {
      days:[...document.querySelectorAll('#eDays .chip-opt.sel')].map(x=>Number(x.dataset.v)),
      start:document.getElementById('eHourStart').value,
      end:document.getElementById('eHourEnd').value
    };
    closeModal('eventModalBg');
    DB.events=[]; save(); renderCalendar();
    return {
      dateLabels, marker15, label15:labelText15, at15, at59, at11, nextHour, nightOk,
      quickAddOk, prefill, latePrefill, english,
      nowButton:!!document.querySelector('.calendar-now-btn[onclick*="scrollCalendarToNow"]'),
      slotCount:document.querySelectorAll('#weekGrid .lp-cal-slot').length
    };
  });
  check('v17.2 calendar shows dates under all seven weekdays', v172.dateLabels.length===7 && v172.dateLabels.every(Boolean), JSON.stringify(v172.dateLabels));
  check('v17.2 current-time line matches the exact minute and pixel position',
    v172.marker15?.time==='10:15' && v172.label15==='10:15' && Math.abs(v172.marker15.top-221)<.02,
    JSON.stringify(v172.marker15));
  check('v17.2 current-time line advances to the next hour exactly',
    v172.at59.time==='10:59' && v172.at11.time==='11:00' && v172.nextHour.time==='11:00' &&
    v172.nextHour.row==='11:00' && Math.abs(v172.nextHour.top-260)<.02,
    JSON.stringify({at59:v172.at59,at11:v172.at11,next:v172.nextHour}));
  check('v17.2 current-time line still maps after midnight to the previous day column', v172.nightOk);
  check('v17.2 tapping an empty hour opens a prefilled one-hour event from the hour start',
    v172.quickAddOk && v172.prefill.days.join(',')==='2' && v172.prefill.start==='10:00' && v172.prefill.end==='11:00',
    JSON.stringify(v172.prefill));
  check('v17.2 quick-add clamps the last night slot at 03:00 on the next day',
    v172.latePrefill.days.join(',')==='0' && v172.latePrefill.start==='02:00' && v172.latePrefill.end==='03:00',
    JSON.stringify(v172.latePrefill));
  check('v17.2 the Now button and all 147 quick-add slots are present', v172.nowButton && v172.slotCount===147);
  check('v17.2 calendar labels and help are translated to English',
    v172.english.now==='🕒 Now' && v172.english.currentTime==='Current time' &&
    v172.english.shortDate==='15 Mehr' && v172.english.slotHint==='Tap to add an event at 10:00' &&
    v172.english.intro.includes('tap an empty time slot'), JSON.stringify(v172.english));

  // ---------- v18.2: drag a block's edge to resize it on the grid ----------
  const v182 = await page.evaluate(async () => {
    showView('calendar');
    DB.events = []; save();
    const mk = (id, title, days, s, e) => {
      const ev = { id, title, days, startMin:s, endMin:e,
        startHour:Math.floor(s/60), endHour:Math.min(24, Math.floor(e/60)) };
      DB.events.push(ev); return ev;
    };
    const evA = mk('v182-a', 'ریزایز اصلی', [2], 600, 660);       // Tue 10:00–11:00
    mk('v182-b', 'همسایه', [2], 780, 840);                        // Tue 13:00–14:00
    save(); renderCalendar();
    const col = () => document.querySelector('#weekGrid .lp-cal-day[data-day="2"]');
    const blockA = () => col().querySelector('.ev-block');
    const yFor = (gridMin) => col().getBoundingClientRect().top + (gridMin - 360) / 60 * 52;
    const xFor = () => { const r = col().getBoundingClientRect(); return r.left + r.width / 2; };
    const ptr = (type, target, y) => target.dispatchEvent(new PointerEvent(type,
      { bubbles:true, cancelable:true, pointerType:'mouse', button:0, clientX:xFor(), clientY:y }));
    const get = (id) => DB.events.find(e => e.id === id);

    const handles = blockA() ? blockA().querySelectorAll('.ev-resize-handle').length : 0;

    // A tap / small finger jitter on the visible or invisible edge must not resize.
    let b = blockA();
    ptr('pointerdown', b.querySelector('.ev-resize-handle-bottom'), yFor(660)-8);
    ptr('pointermove', document, yFor(660)-4);
    ptr('pointerup', document, yFor(660)-4);
    const tapNoResize = get('v182-a').startMin===600 && get('v182-a').endMin===660;

    // real bottom-edge drag: 11:00 → 12:30, with a live preview + bubble
    b = blockA();
    ptr('pointerdown', b.querySelector('.ev-resize-handle-bottom'), yFor(660));
    ptr('pointermove', document, yFor(750));
    const preview = { h: parseFloat(b.style.height),
      tip: document.querySelector('.ev-resize-tip')?.textContent || '',
      guide: !!document.querySelector('.ev-resize-guide') };
    ptr('pointerup', document, yFor(750));
    const bottomDrag = { start:get('v182-a').startMin, end:get('v182-a').endMin };

    // undo offered in the toast brings the bottom edge straight back
    lpUndoEventResize();
    const undoOk = get('v182-a').startMin === 600 && get('v182-a').endMin === 660;

    // real top-edge drag: 10:00 → 09:15
    b = blockA();
    ptr('pointerdown', b.querySelector('.ev-resize-handle-top'), yFor(600));
    ptr('pointermove', document, yFor(555));
    ptr('pointerup', document, yFor(555));
    const topDrag = { start:get('v182-a').startMin, end:get('v182-a').endMin };

    // keyboard: ↓ stretches the end, Shift+↑ pulls the start earlier
    b = blockA(); b.focus();
    b.dispatchEvent(new KeyboardEvent('keydown', { key:'ArrowDown', bubbles:true, cancelable:true }));
    const kbEnd = get('v182-a').endMin;
    b = blockA(); b.focus();
    b.dispatchEvent(new KeyboardEvent('keydown', { key:'ArrowUp', shiftKey:true, bubbles:true, cancelable:true }));
    const kbStart = get('v182-a').startMin;

    // a resize that would overlap the neighbour is refused, nothing changes
    lpApplyEventResize(get('v182-a'), 2, 0, kbStart, 810, 'end');
    const conflictOk = get('v182-a').endMin === kbEnd;

    // resizing one day of a multi-day series splits only that day off
    const series = mk('v182-c', 'سری چندروزه', [1, 3], 900, 960); save(); renderCalendar();
    lpApplyEventResize(series, 3, 0, 900, 1020, 'end');
    const split = DB.events.filter(e => e.title === 'سری چندروزه');
    const splitOk = split.length === 2 &&
      split.some(e => e.days.join(',') === '1' && e.endMin === 960) &&
      split.some(e => e.days.join(',') === '3' && e.endMin === 1020);

    // night tail: Sunday 01:00–02:00 is drawn in Saturday's column (shift 1440)
    const night = mk('v182-d', 'نیمه‌شب', [1], 60, 120); save(); renderCalendar();
    const nightBlock = document.querySelector('#weekGrid .lp-cal-day[data-day="0"] .ev-block');
    const nightDrawn = !!nightBlock && !!nightBlock.querySelector('.ev-resize-handle-bottom');
    lpApplyEventResize(night, 1, 1440, 1500, 1590, 'end');       // → ends 02:30 real time
    const nightOk = get('v182-d').startMin === 60 && get('v182-d').endMin === 150;

    const oldLang = localStorage.getItem('lifePlannerLang_v1');
    localStorage.setItem('lifePlannerLang_v1', 'en');
    const english = {
      intro: lpTranslate('هر روز ساعت‌به‌ساعت از ۶ صبح تا ۳ بامداد بلوک‌بندی شده؛ رویداد را نگه دار و بکش تا روز یا ساعتش عوض شود، لبه‌ی بالا یا پایینش را بکش تا ساعتش کم‌وزیاد شود — بدون رفتن توی تنظیمات. برای افزودن سریع رویداد، روی خانه‌ی خالی بزن.'),
      handle: lpTranslate('لبه پایین را بکش تا ساعت پایان عوض شود'),
      tip: lpTranslate('10:00 تا 12:30 · 2 ساعت و 30 دقیقه'),
      blocked: lpTranslate('⚠️ «همسایه» مانع این تغییر است؛ ساعت‌ها تداخل دارند')
    };
    if (oldLang === null) localStorage.removeItem('lifePlannerLang_v1');
    else localStorage.setItem('lifePlannerLang_v1', oldLang);

    DB.events = []; save(); renderCalendar();
    return { handles, tapNoResize, preview, bottomDrag, undoOk, topDrag, kbEnd, kbStart, conflictOk, splitOk, nightDrawn, nightOk, english };
  });
  check('v18.2 every calendar block has top + bottom resize hit zones', v182.handles === 2, JSON.stringify(v182));
  check('v18.3 a tap or small edge jitter never changes the event time', v182.tapNoResize, JSON.stringify(v182));
  check('v18.2 dragging the bottom edge live-previews and stores the new end',
    Math.abs(v182.preview.h - 128) < 1 && v182.preview.tip.includes('12:30') && v182.preview.guide &&
    v182.bottomDrag.start === 600 && v182.bottomDrag.end === 750, JSON.stringify(v182));
  check('v18.2 the resize toast undo restores the previous time', v182.undoOk, JSON.stringify(v182));
  check('v18.2 dragging the top edge stores the new start', v182.topDrag.start === 555 && v182.topDrag.end === 660, JSON.stringify(v182));
  check('v18.2 keyboard resizes the end (↓) and the start (Shift+↑) in 15-minute steps',
    v182.kbEnd === 675 && v182.kbStart === 540, JSON.stringify(v182));
  check('v18.2 a resize into a neighbouring event is refused', v182.conflictOk, JSON.stringify(v182));
  check('v18.2 resizing one day of a series splits only that day off', v182.splitOk, JSON.stringify(v182));
  check('v18.2 resizing works in the after-midnight night tail', v182.nightDrawn && v182.nightOk, JSON.stringify(v182));
  check('v18.2 resize strings are translated for English mode',
    v182.english.intro.includes('drag its top or bottom edge') &&
    v182.english.handle === 'Drag the bottom edge to change the end time' &&
    v182.english.tip === '10:00 to 12:30 · 2 h 30 min' &&
    v182.english.blocked.includes('blocks this change'), JSON.stringify(v182.english));

  // ---------- v18.3: quiet resize edges + hour-start / free-gap quick-add ----------
  const v183 = await page.evaluate(async () => {
    showView('calendar');
    /* the previous block ended with real drags: those deliberately swallow the
       trailing click for 600 ms (a drag must never count as a tap). Clear that
       window, otherwise every simulated tap below is ignored by design. */
    lpDragState.suppressClickUntil = 0;
    DB.events=[]; save(); renderCalendar();
    const mk=(id,title,day,s,e)=>{
      const ev={id,title,days:[].concat(day),startMin:s,endMin:e,
        startHour:Math.floor(s/60),endHour:Math.min(24,Math.floor(e/60))};
      DB.events.push(ev); return ev;
    };
    const readForm=()=>({
      days:[...document.querySelectorAll('#eDays .chip-opt.sel')].map(x=>Number(x.dataset.v)),
      start:document.getElementById('eHourStart').value,
      end:document.getElementById('eHourEnd').value
    });
    const clickSlot=(day,h,fraction)=>{
      const slot=document.querySelector(`#weekGrid .lp-cal-day[data-day="${day}"] .lp-cal-slot[data-grid-hour="${h}"]`);
      const rect=slot.getBoundingClientRect();
      slot.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientY:rect.top+rect.height*fraction}));
      return readForm();
    };

    // A 45-minute gap follows an event that ends at 06:15 and precedes one at 07:00.
    mk('v183-prev','v183 previous',[2],360,375);
    mk('v183-next','v183 next',[2],420,480);
    save(); renderCalendar();
    const gapTapA=clickSlot(2,6,.50);
    closeModal('eventModalBg');
    const gapTapB=clickSlot(2,6,.95);
    const sameHourStart=gapTapA.start==='06:15'&&gapTapA.end==='07:00'&&
      gapTapB.start===gapTapA.start&&gapTapB.end===gapTapA.end;
    document.getElementById('eTitle').value='v183 45-minute gap';
    await saveEvent();
    const saved=DB.events.find(e=>e.title==='v183 45-minute gap');
    const exactGap=!!saved&&saved.days[0]===2&&saved.startMin===375&&saved.endMin===420;

    // With no surrounding events, the tap position is ignored and the hour's start is used.
    DB.events=[]; save(); renderCalendar();
    const emptyA=clickSlot(3,8,.10);
    closeModal('eventModalBg');
    const emptyB=clickSlot(3,8,.90);
    const hourStart=emptyA.start==='08:00'&&emptyA.end==='09:00'&&
      emptyB.start===emptyA.start&&emptyB.end===emptyA.end;
    closeModal('eventModalBg');

    // If the tapped hour begins occupied, quick-add starts at the first free minute.
    mk('v183-busy','v183 occupied',[4],360,375);
    save(); renderCalendar();
    const afterBusy=clickSlot(4,6,.80);
    const bumpToFree=afterBusy.days.join(',')==='4'&&afterBusy.start==='06:15'&&afterBusy.end==='07:15';
    closeModal('eventModalBg');

    // The night-tail schedule uses the same logic (Sunday 01:00 is in Saturday's 25:00 row).
    DB.events=[]; mk('v183-night','v183 night',[1],60,120); save(); renderCalendar();
    const night=calQuickAddWindow(0,25);
    const nightFree=!!night&&night.start.day===1&&night.start.min===120&&
      night.end.day===1&&night.end.min===180;

    const oldLang=localStorage.getItem('lifePlannerLang_v1');
    localStorage.setItem('lifePlannerLang_v1','en');
    const english={
      intro:lpTranslate('هر روز از ۶ صبح تا ۳ بامداد بلوک‌بندی شده؛ رویداد را نگه دار و بکش تا جابه‌جا شود، لبه‌ی بالا یا پایینش را بکش تا ساعتش عوض شود. روی خانه‌ی خالی هر ساعت بزن تا رویداد از ابتدای ساعت یا اولین دقیقه‌ی آزاد شروع شود و مدت آن با فاصله تا رویداد بعدی (حداکثر یک ساعت) هماهنگ شود.'),
      noFree:lpTranslate('⚠️ این ساعت زمان خالی ندارد')
    };
    if(oldLang===null)localStorage.removeItem('lifePlannerLang_v1'); else localStorage.setItem('lifePlannerLang_v1',oldLang);
    DB.events=[]; save(); renderCalendar();
    return {sameHourStart,exactGap,hourStart,bumpToFree,nightFree,english};
  });
  check('v18.3 tap location no longer changes the selected start within an hour',
    v183.sameHourStart&&v183.hourStart,JSON.stringify(v183));
  check('v18.3 a 45-minute opening between two events becomes a 45-minute event',
    v183.exactGap,JSON.stringify(v183));
  check('v18.3 a busy hour advances to its first free minute, including the night tail',
    v183.bumpToFree&&v183.nightFree,JSON.stringify(v183));
  check('v18.3 calendar guidance and no-free-space message translate to English',
    v183.english.intro.includes('first free minute')&&v183.english.noFree==='⚠️ There is no free time left in this hour',JSON.stringify(v183.english));


  // ---------- v21.2: an edge never steals a move, and «↩️ برگرداندن» really works ----------
  const v212 = await page.evaluate(async () => {
    showView('calendar');
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const mk = (id, title, days, s, e) => ({ id, title, days, startMin: s, endMin: e,
      startHour: Math.floor(s / 60), endHour: Math.min(24, Math.floor(e / 60)) });
    const get = (id) => DB.events.find(x => x.id === id);
    const col = (d) => document.querySelector(`#weekGrid .lp-cal-day[data-day="${d}"]`);
    const block = (d) => col(d).querySelector('.ev-block');
    const yFor = (d, m) => col(d).getBoundingClientRect().top + (m - 360) / 60 * 52;
    const midX = (d) => { const r = col(d).getBoundingClientRect(); return r.left + r.width / 2; };
    const ptr = (type, target, x, y, pointerType) => target.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerType, button: 0,
      buttons: (type === 'pointerup' || type === 'pointercancel') ? 0 : 1, clientX: x, clientY: y
    }));
    /* save() repaints on the next frame, so a gesture that follows it must be
       given the fresh grid — otherwise it measures blocks that are already gone. */
    const fresh = async (events) => {
      DB.events = events; save(); await wait(320); renderCalendar();
      lpDragState.suppressClickUntil = 0;
    };
    const out = {};

    /* 1 — the reported annoyance: on touch, a drag that happens to start on the
       edge moves the block; it no longer changes the event's time. */
    await fresh([mk('v212-a', 'لبهٔ لمسی', [2], 600, 660)]);
    let b = block(2), h = b.querySelector('.ev-resize-handle-bottom');
    ptr('pointerdown', h, midX(2), yFor(2, 660), 'touch');
    ptr('pointermove', document, midX(2), yFor(2, 700), 'touch');
    ptr('pointermove', document, midX(2), yFor(2, 760), 'touch');
    ptr('pointerup', document, midX(2), yFor(2, 760), 'touch');
    out.touchEdgeMoves = get('v212-a').days.join(',') === '2' &&
      get('v212-a').startMin === 705 && get('v212-a').endMin === 765;
    out.moveOffersUndo = !!document.querySelector('#toast .dp-undo-btn');
    out.moveUndoMsg = (document.querySelector('#toast .dp-undo-msg') || {}).textContent || '';

    /* 2 — touch resizes only when the edge is deliberately held: the block lights
       up, the grip appears, and from then on the drag stretches it. */
    await fresh([mk('v212-b', 'نگه‌داشتن لبه', [2], 600, 660)]);
    b = block(2); h = b.querySelector('.ev-resize-handle-bottom');
    ptr('pointerdown', h, midX(2), yFor(2, 660), 'touch');
    await wait(430);
    out.armedClass = b.classList.contains('lp-edge-armed');
    out.armedGrip = getComputedStyle(b.querySelector('.ev-resize-grip')).display === 'block';
    ptr('pointermove', document, midX(2), yFor(2, 750), 'touch');
    out.armedPreview = Math.abs(parseFloat(b.style.height) - 128) < 2;
    ptr('pointerup', document, midX(2), yFor(2, 750), 'touch');
    out.holdResizes = get('v212-b').startMin === 600 && get('v212-b').endMin === 750;
    out.armedCleared = !document.querySelector('#weekGrid .lp-edge-armed');

    /* 3 — with a mouse the edge still resizes, but a clearly sideways first
       movement is handed over to the move. */
    await fresh([mk('v212-c', 'sideways', [2], 600, 660)]);
    b = block(2); h = b.querySelector('.ev-resize-handle-bottom');
    const r3 = col(3).getBoundingClientRect(), y2 = yFor(2, 660);
    ptr('pointerdown', h, midX(2), y2, 'mouse');
    ptr('pointermove', document, r3.left + r3.width / 2, y2 + 2, 'mouse');
    ptr('pointerup', document, r3.left + r3.width / 2, y2 + 2, 'mouse');
    out.mouseSidewaysMoves = get('v212-c').days.join(',') === '3' &&
      get('v212-c').endMin - get('v212-c').startMin === 60;

    await fresh([mk('v212-d', 'vertical', [2], 600, 660)]);
    b = block(2); h = b.querySelector('.ev-resize-handle-bottom');
    ptr('pointerdown', h, midX(2), yFor(2, 660), 'mouse');
    ptr('pointermove', document, midX(2), yFor(2, 705), 'mouse');
    ptr('pointerup', document, midX(2), yFor(2, 705), 'mouse');
    out.mouseVerticalResizes = get('v212-d').startMin === 600 && get('v212-d').endMin === 705;

    /* 4 — a tap or finger jitter on the edge changes nothing and still opens the event */
    await fresh([mk('v212-e', 'tap', [2], 600, 660)]);
    b = block(2); h = b.querySelector('.ev-resize-handle-bottom');
    ptr('pointerdown', h, midX(2), yFor(2, 656), 'touch');
    ptr('pointermove', document, midX(2), yFor(2, 662), 'touch');
    ptr('pointerup', document, midX(2), yFor(2, 662), 'touch');
    out.jitterIgnored = get('v212-e').startMin === 600 && get('v212-e').endMin === 660 &&
      lpDragState.edgeGrab === null;
    b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    out.tapOpensEvent = document.getElementById('eventActionModalBg').classList.contains('open');
    closeModal('eventActionModalBg');

    /* 5 — undo gives back exactly the one event it came from, and only once */
    await fresh([mk('v212-f', 'target', [2], 600, 660), mk('v212-g', 'other', [4], 600, 660)]);
    lpApplyEventResize(get('v212-f'), 2, 0, 600, 720, 'end');
    get('v212-g').startMin = 480; get('v212-g').endMin = 540; save();   // unrelated edit while the toast is up
    document.querySelector('#toast .dp-undo-btn').click();
    out.undoIsSurgical = get('v212-f').startMin === 600 && get('v212-f').endMin === 660 &&
      get('v212-g').startMin === 480 && get('v212-g').endMin === 540;
    out.undoSaidRestored = document.getElementById('toast').textContent.includes('برگردانده شد');
    out.undoButtonGone = !document.querySelector('#toast .dp-undo-btn');

    /* 6 — undoing a split day merges it back into the series */
    await fresh([mk('v212-h', 'series', [1, 3], 900, 960)]);
    lpApplyEventResize(get('v212-h'), 3, 0, 900, 1020, 'end');
    out.splitHappened = DB.events.filter(e => e.title === 'series').length === 2;
    document.querySelector('#toast .dp-undo-btn').click();
    const back = DB.events.filter(e => e.title === 'series');
    out.splitUndone = back.length === 1 && back[0].days.join(',') === '1,3' && back[0].endMin === 960;

    /* 7 — the undo step expires together with the toast that offers it */
    await fresh([mk('v212-i', 'expire', [2], 600, 660)]);
    lpApplyEventResize(get('v212-i'), 2, 0, 600, 720, 'end');
    lpEventUndoRecord.at = Date.now() - 60000;
    lpUndoEventResize();
    out.undoExpires = get('v212-i').endMin === 720 &&
      document.getElementById('toast').textContent.includes('مهلت');

    /* 8 — Escape drops a running gesture and leaves the event alone */
    await fresh([mk('v212-j', 'escape', [2], 600, 660)]);
    b = block(2); h = b.querySelector('.ev-resize-handle-bottom');
    ptr('pointerdown', h, midX(2), yFor(2, 660), 'mouse');
    ptr('pointermove', document, midX(2), yFor(2, 750), 'mouse');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    out.escapeCancels = get('v212-j').endMin === 660 && lpDragState.resize === null &&
      !document.querySelector('.ev-resize-tip');

    DB.events = []; save(); renderCalendar();
    return out;
  });
  check('v21.2 on touch, dragging off the edge moves the event instead of resizing it',
    v212.touchEdgeMoves && v212.moveOffersUndo && v212.moveUndoMsg.includes('منتقل شد'), JSON.stringify(v212));
  check('v21.2 holding the edge arms the resize: grip shows, block lights up, drag stretches it',
    v212.armedClass && v212.armedGrip && v212.armedPreview && v212.holdResizes && v212.armedCleared, JSON.stringify(v212));
  check('v21.2 with a mouse the edge still resizes, and a sideways drag moves instead',
    v212.mouseVerticalResizes && v212.mouseSidewaysMoves, JSON.stringify(v212));
  check('v21.2 a tap or finger jitter on the edge changes nothing and still opens the event',
    v212.jitterIgnored && v212.tapOpensEvent, JSON.stringify(v212));
  check('v21.2 undo restores only its own event, once, and says so',
    v212.undoIsSurgical && v212.undoSaidRestored && v212.undoButtonGone, JSON.stringify(v212));
  check('v21.2 undo merges a split day back into its series', v212.splitHappened && v212.splitUndone, JSON.stringify(v212));
  check('v21.2 a stale undo is refused instead of rolling back later edits', v212.undoExpires, JSON.stringify(v212));
  check('v21.2 Escape cancels a running resize', v212.escapeCancels, JSON.stringify(v212));

  /* The undo button used to be painted but unreachable: the toast strip is
     pointer-events:none and, with no max-width, a long message pushed the button
     outside the viewport. Prove it is hittable with a real mouse click. */
  const v212btn = await page.evaluate(async () => {
    showView('calendar');
    DB.events = [{ id: 'v212-btn', title: 'دکمهٔ بازگشت', days: [2], startMin: 600, endMin: 660, startHour: 10, endHour: 11 }];
    save(); renderCalendar();
    lpApplyEventResize(DB.events[0], 2, 0, 600, 750, 'end');
    const toastEl = document.getElementById('toast');
    const btn = toastEl.querySelector('.dp-undo-btn');
    const r = btn.getBoundingClientRect();
    return {
      shown: toastEl.classList.contains('show'),
      wired: btn.dataset.lpUndo === 'event' && !btn.getAttribute('onclick'),
      wrapped: !!toastEl.querySelector('.dp-undo-msg'),
      takesPointer: getComputedStyle(btn).pointerEvents === 'auto',
      stripIsClickThrough: getComputedStyle(toastEl).pointerEvents === 'none',
      fitsViewport: r.width > 0 && r.left >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight,
      toastFits: toastEl.getBoundingClientRect().width <= window.innerWidth,
      hitTarget: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === btn,
      center: { x: r.left + r.width / 2, y: r.top + r.height / 2 },
      resized: DB.events[0].endMin
    };
  });
  check('v21.2 the undo button is on-screen, hit-testable and wired by delegation',
    v212btn.shown && v212btn.wired && v212btn.wrapped && v212btn.takesPointer &&
    v212btn.stripIsClickThrough && v212btn.fitsViewport && v212btn.toastFits && v212btn.hitTarget &&
    v212btn.resized === 750, JSON.stringify(v212btn));
  if (v212btn.hitTarget) {
    await page.mouse.click(v212btn.center.x, v212btn.center.y);
    const clicked = await page.evaluate(() => ({
      start: DB.events[0].startMin, end: DB.events[0].endMin,
      toast: document.getElementById('toast').textContent
    }));
    check('v21.2 a real click on «↩️ برگرداندن» puts the previous time back',
      clicked.start === 600 && clicked.end === 660 && clicked.toast.includes('برگردانده شد'), JSON.stringify(clicked));
  } else {
    check('v21.2 a real click on «↩️ برگرداندن» puts the previous time back', false, 'button was not hittable');
  }
  check('no fatal JS errors after the calendar gesture tests', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

  // ---------- v20: the per-day calendar plan is completely gone ----------
  const v20browser = await page.evaluate(() => {
    showView('calendar');
    renderCalendar();
    const heads = [...document.querySelectorAll('#weekGrid .lp-cal-head')];
    return {
      card: !!document.getElementById('calDayTasksCard'),
      clickableHeads: heads.filter(h => h.tagName === 'BUTTON').length,
      dayPlanFns: typeof openCalDayTasks === 'undefined' && typeof dpStats === 'undefined',
      randomPicker: typeof pickRandomTask === 'undefined',
      noteField: !!document.getElementById('tNote')
    };
  });
  check('v20 the calendar day-plan panel is gone', !v20browser.card && v20browser.clickableHeads === 0 && v20browser.dayPlanFns, JSON.stringify(v20browser));
  check('v20 the task random picker and the note field are gone', v20browser.randomPicker && !v20browser.noteField, JSON.stringify(v20browser));

  check('no fatal JS errors after quest flow', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

  // Prove the two-button selection survives an actual page restart.
  await page.evaluate(() => {
    PINNED_VIEWS=['dashboard','calendar'];
    PINNED_VIEW_COUNT=2;
    PINNED_VIEWS_EXTRA=[];
    localStorage.setItem(PINNED_NAV_KEY,JSON.stringify(PINNED_VIEWS));
    localStorage.setItem(PINNED_NAV_COUNT_KEY,'2');
    localStorage.setItem(PINNED_NAV_EXTRA_KEY,'[]');
    renderPinnedNav();
  });
  await page.reload({waitUntil:'load',timeout:30000});
  await new Promise(resolve=>setTimeout(resolve,350));
  const navReloadOk=await page.evaluate(() => {
    const visible=[...document.querySelectorAll('#bottomNav > .bnav-item[data-view]')]
      .filter(el=>getComputedStyle(el).display!=='none').length;
    return PINNED_VIEW_COUNT===2 && PINNED_VIEWS.length===2 && visible===2 &&
      getComputedStyle(document.getElementById('bnavMoreBtn')).display!=='none' &&
      localStorage.getItem(PINNED_NAV_COUNT_KEY)==='2';
  });
  check('v18 selected two-button quick bar is restored after reopening the app', navReloadOk);
  check('no fatal JS errors after quick-bar reload', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

  // ---------- v21: «کیبورد آرام» — no self-opening keyboard, no Chrome bar ----------
  const v21 = await page.evaluate(async () => {
    const typing = el => {
      if (!el) return false;
      if (el.tagName === 'TEXTAREA') return true;
      if (el.tagName !== 'INPUT') return false;
      const t = (el.getAttribute('type') || 'text').toLowerCase();
      return ['text','search','number','email','tel','url','password','date','time'].includes(t);
    };
    const fields = [...document.querySelectorAll('input, textarea')].filter(typing);
    const hardened = fields.filter(el => el.getAttribute('autocomplete') === 'off' &&
      el.getAttribute('spellcheck') === 'false' && el.getAttribute('autocorrect') === 'off' &&
      el.getAttribute('data-lp-kb') === '1');

    const focusedId = () => (document.activeElement && document.activeElement.id) || '';
    const after = fn => { document.activeElement?.blur?.(); fn(); return focusedId(); };
    const sheets = {};
    sheets.task = after(() => openTaskModal());
    sheets.inbox = after(() => openInboxQuickAdd());
    sheets.note = after(() => openNoteModal());
    sheets.event = after(() => openEventModal());
    ['taskModalBg','inboxQuickModalBg','noteModalBg','eventModalBg'].forEach(id => closeModal(id));

    /* adding a subtask row must not jump into the fresh input either */
    openTaskModal();
    sheets.subtask = after(() => addSubtaskInput());
    /* rows built in JS (subtask title + extra deadline) must be hardened too */
    addExtraDeadline();
    await new Promise(r => setTimeout(r, 0));
    const dynamic = [...document.querySelectorAll('#subtaskWrap .subtask-edit-title, #extraDeadlinesWrap input[type="text"]')];
    const dynamicOk = dynamic.length >= 2 && dynamic.every(el =>
      el.getAttribute('data-lp-kb') === '1' && el.getAttribute('autocomplete') === 'off' &&
      el.getAttribute('spellcheck') === 'false');
    openTaskModal(); /* resets both wrappers */
    closeModal('taskModalBg');

    /* the guard itself: a script focus without a tap is refused, a tapped
       field takes focus normally, and the helper can opt a field in */
    openModal('taskModalBg');
    const title = document.getElementById('tTitle');
    document.activeElement?.blur?.();
    title.focus();
    const autoBlocked = document.activeElement !== title;
    /* a tap somewhere else in the sheet does not authorise the field either */
    document.querySelector('#taskModalBg button')
      ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    const allowNoTap = !lpKbFocusAllowed(title);
    /* but a tap on the field itself does */
    title.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    title.focus();
    const tapAllowed = document.activeElement === title;
    title.blur();
    lpFocusField(title);
    const helperAllowed = document.activeElement === title;
    title.blur();
    title.removeAttribute('data-lp-allow-focus');
    closeModal('taskModalBg');

    return {
      fields: fields.length,
      hardened: hardened.length,
      forms: document.querySelectorAll('form').length,
      dynamic: dynamic.length,
      dynamicOk,
      sheets,
      autoBlocked, tapAllowed, helperAllowed,
      hasGuard: typeof lpKbFocusAllowed === 'function',
      allowNoTap
    };
  });
  check('v21 every typing field is hardened for a plain keyboard (no autofill bar)',
    v21.fields >= 20 && v21.hardened === v21.fields,
    `fields=${v21.fields} hardened=${v21.hardened}`);
  check('v21 the app stays form-free, so Chrome has nothing to autofill',
    v21.forms === 0, 'forms=' + v21.forms);
  check('v21 rows created in JS are hardened on arrival (subtask + extra deadline)',
    v21.dynamicOk, `dynamic=${v21.dynamic}`);
  check('v21 opening a task / inbox / note / event sheet never opens the keyboard',
    Object.values(v21.sheets).every(id => id === ''),
    JSON.stringify(v21.sheets));
  check('v21 a programmatic focus without a tap is refused, a tap is honoured',
    v21.hasGuard && v21.autoBlocked && v21.allowNoTap && v21.tapAllowed && v21.helperAllowed,
    JSON.stringify(v21));

  /* the old automatic focus calls must not come back */
  const v21CoreJs = fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf-8');
  const v21Enh = fs.readFileSync(path.join(ROOT, 'js/enhancements.js'), 'utf-8');
  const v21Js = fs.readFileSync(path.join(ROOT, 'js/v21.js'), 'utf-8');
  const leftoverFocus = [
    ...v21CoreJs.matchAll(/getElementById\('(tTitle|inboxTitle|nTitle|eTitle)'\)[^;]{0,40}\.focus\(\)/g),
    ...v21Enh.matchAll(/getElementById\('dashboardMotivationInput'\)[^;]{0,40}\.focus\(\)/g)
  ];
  check('v21 no sheet focuses a field by itself any more', leftoverFocus.length === 0,
    leftoverFocus.map(m => m[0]).join(' | '));
  const v21IndexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
  check('v21 the calm-keyboard module is loaded before the page ends',
    /js\/v21\.js\?v=\d/.test(v21IndexHtml) &&
    /\.\/js\/v21\.js\?v=\$\{VERSION\}/.test(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf-8')));
  check('v21 the guard and the hardening are both implemented',
    v21Js.includes('HTMLElement.prototype.focus') && v21Js.includes('autocomplete'),
    'v21.js');

  /* ---------- v21.1: performance mode keeps every popup readable ---------- */
  /* The blur used to be the only thing hiding the page behind a popup. With
     `html.lp-perf` on, the panel must be painted solid and the scrim behind it
     darker — otherwise the task sheet turns into a window onto the list. */
  const v211 = await page.evaluate(() => {
    const alpha = c => {
      if (!c || c === 'transparent') return 0;
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return 1;
      const p = m[1].split(',').map(Number);
      return p.length > 3 ? p[3] : 1;
    };
    const read = () => {
      openModal('taskModalBg');
      openSheet();
      const scrim = getComputedStyle(document.getElementById('taskModalBg'));
      const modal = getComputedStyle(document.querySelector('#taskModalBg .modal'));
      const drawer = getComputedStyle(document.getElementById('sheetDrawer'));
      const nav = getComputedStyle(document.querySelector('.bottom-nav'));
      const out = {
        modalAlpha: alpha(modal.backgroundColor),
        drawerAlpha: alpha(drawer.backgroundColor),
        navAlpha: alpha(nav.backgroundColor),
        scrimAlpha: alpha(scrim.backgroundColor),
        pomoBlur: (() => {
          const el = document.createElement('div');
          el.className = 'pomo-custom-modal';
          document.body.appendChild(el);
          const v = getComputedStyle(el).backdropFilter;
          el.remove();
          return v;
        })(),
        blurs: [modal.backdropFilter, drawer.backdropFilter, nav.backdropFilter, scrim.backdropFilter],
      };
      closeSheet(); closeModal('taskModalBg');
      return out;
    };
    lpSetPerfMode(true);
    const perf = read();
    lpSetPerfMode(false);
    const normal = read();
    return { perf, normal };
  });
  const perfBlurs = v211.perf.blurs.map(b => b || 'none');
  perfBlurs.push(v211.perf.pomoBlur || 'none');
  check('v21.1 performance mode paints popups solid instead of see-through',
    v211.perf.modalAlpha === 1 && v211.perf.drawerAlpha === 1 && v211.perf.navAlpha === 1,
    JSON.stringify(v211.perf));
  check('v21.1 performance mode dims the page harder behind a popup',
    v211.perf.scrimAlpha >= 0.8, 'scrim=' + v211.perf.scrimAlpha);
  check('v21.1 performance mode still costs zero backdrop-filter', 
    perfBlurs.every(b => b === 'none'), perfBlurs.join(' | '));
  check('v21.1 normal mode keeps its frosted glass exactly as before',
    v211.normal.modalAlpha < 1 && v211.normal.blurs.some(b => /blur/.test(b)),
    JSON.stringify(v211.normal));

  /* ---------- v21.3: section guides + «سه قدم اول» ---------- */
  /* The three simplified sections each carry one ❓ that opens a shared guide.
     Nothing here may block the screen: the guide is a modal the user opens,
     and the welcome of a first visit is a slim line inside the section. */
  const v213 = await page.evaluate(() => {
    const clean = () => document.querySelectorAll('.modal-bg.open').forEach(m => m.classList.remove('open'));
    clean();
    const bg = document.getElementById('guideModalBg');
    const isOpen = () => bg.classList.contains('open');
    const q = s => document.querySelector(s);
    const out = {};

    out.helpButtons = document.querySelectorAll(
      '#view-dashboard .guide-btn, #view-tasks .guide-btn, #view-calendar .guide-open-btn,' +
      ' #view-habits .guide-btn, #view-goals .guide-btn, #view-notes .guide-btn,' +
      /* v21.7: the last four sections carry the same single ❓ */
      ' #view-pomodoro .guide-btn, #view-shop .guide-btn, #view-skills .guide-btn, #view-boss .guide-btn').length;
    out.slotAnchors = ['guideSlot-dashboard', 'guideSlot-tasks', 'guideSlot-habits', 'guideSlot-goals', 'guideSlot-notes',
      'guideSlot-pomodoro', 'guideSlot-shop', 'guideSlot-skills', 'guideSlot-boss']
      .filter(id => document.getElementById(id)).length;
    out.panels = [...document.querySelectorAll('#guideModalBg .guide-panel[data-g]')].map(p => p.dataset.g).join(',');
    out.rowsPerPanel = [...document.querySelectorAll('#guideModalBg .guide-panel')].map(p => p.querySelectorAll('.guide-row').length).join(',');

    /* the calendar's long gesture text moved into the guide, the intro is one line */
    out.introChars = q('#view-calendar .calendar-intro-copy span').textContent.trim().length;
    out.guideKeepsGestures = q('#guideModalBg .guide-panel[data-g="calendar"]')
      .textContent.includes('لبهٔ بالا یا پایینش را یک لحظه نگه دار و بعد بکش');

    /* opening it from the Tasks section lands on the Tasks panel */
    window.openGuide('tasks');
    out.open = isOpen();
    out.title = q('#guideTitle').textContent;
    out.tabSel = q('#guideTabs .chip-opt.sel').dataset.g;
    out.panelSel = q('#guideModalBg .guide-panel.sel').dataset.g;
    out.visiblePanels = [...document.querySelectorAll('#guideModalBg .guide-panel')]
      .filter(p => getComputedStyle(p).display !== 'none').length;
    out.cta = q('#guideCta').textContent;
    out.modalOnTop = getComputedStyle(bg).zIndex;

    /* a real click on another tab follows with panel, title and action */
    q('#guideTabs [data-g="calendar"]').click();
    out.afterTab = q('#guideModalBg .guide-panel.sel').dataset.g + '|' + q('#guideTitle').textContent + '|' + q('#guideCta').textContent;

    /* the action button drops the user straight into that section's own sheet */
    window.openGuide('calendar');
    q('#guideCta').click();
    out.ctaClosedGuide = !isOpen();
    out.ctaOpenedSheet = document.getElementById('eventModalBg').classList.contains('open');
    clean();

    /* leaving is easy: ✕, Escape or the backdrop — but never a click inside */
    window.openGuide('dashboard');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    out.escClosed = !isOpen();
    window.openGuide('dashboard');
    bg.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    out.backdropClosed = !isOpen();
    window.openGuide('dashboard');
    q('#guideModalBg .guide-panel').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    out.insideKeptOpen = isOpen();
    window.closeGuide();
    out.readingMarksSeen = window.lpGuide.state().seen.calendar === 1;
    out.noNewPopupBlur = getComputedStyle(q('#guideModalBg .modal')).backdropFilter;
    return out;
  });
  check('v21.3 every simplified section has its own ❓ and one guide modal explains them all',
    v213.helpButtons === 10 && v213.slotAnchors === 9 &&
    v213.panels === 'dashboard,tasks,calendar,habits,goals,notes,pomodoro,shop,skills,boss' &&
    v213.rowsPerPanel === '4,4,4,4,4,4,4,4,4,4', JSON.stringify(v213));
  check('v21.3 the calendar intro is one quiet line and the guide kept the full gestures',
    v213.introChars < 90 && v213.guideKeepsGestures, JSON.stringify(v213));
  check('v21.3 opening the guide shows exactly one panel with the right action',
    v213.open && v213.title.includes('تسک') && v213.tabSel === 'tasks' && v213.panelSel === 'tasks' &&
    v213.visiblePanels === 1 && v213.cta === '➕ تسک جدید', JSON.stringify(v213));
  check('v21.3 switching section follows panel, title and action button together',
    v213.afterTab === 'calendar|📖 راهنمای تقویم|➕ رویداد جدید', v213.afterTab);
  check('v21.3 the action button closes the guide and opens that section’s own sheet',
    v213.ctaClosedGuide && v213.ctaOpenedSheet, JSON.stringify(v213));
  check('v21.3 the guide closes with ✕, Escape and the backdrop, never on a click inside',
    v213.escClosed && v213.backdropClosed && v213.insideKeptOpen && v213.readingMarksSeen,
    JSON.stringify(v213));
  check('v21.3 the guide costs no new blur and sits on the usual modal layer',
    (v213.noNewPopupBlur === 'none' || v213.noNewPopupBlur === '') && Number(v213.modalOnTop) === 200,
    JSON.stringify(v213));

  /* the welcome of a first visit: exactly one slim card, never a blocking popup */
  const v213welcome = await page.evaluate(() => {
    localStorage.removeItem('lifePlannerGuides_v213');
    window.lpGuide.reset();
    window.showView('dashboard');
    const slot = document.getElementById('guideSlot-dashboard');
    const html = slot.innerHTML;
    return {
      empty: window.lpGuide.isEmptyAccount(),
      card: html.includes('qs-card'),
      hint: html.includes('guide-hint-txt'),
      steps: slot.querySelectorAll('.qs-step').length,
      nothingModalOpen: !document.querySelector('.modal-bg.open'),
      insideView: !!slot.closest('#view-dashboard')
    };
  });
  check('v21.3 a first visit is welcomed by exactly one inline card, inside the section',
    (v213welcome.empty ? (v213welcome.card && !v213welcome.hint && v213welcome.steps === 3)
                        : (v213welcome.hint && !v213welcome.card)) &&
    v213welcome.nothingModalOpen && v213welcome.insideView, JSON.stringify(v213welcome));

  const v213hint = await page.evaluate(() => {
    const out = {};
    localStorage.removeItem('lifePlannerGuides_v213');
    window.lpGuide.reset();
    window.showView('tasks');
    out.tasksHint = document.getElementById('guideSlot-tasks').innerHTML.includes('guide-hint-txt');
    /* ✕ retires it for good … */
    document.querySelector('#guideSlot-tasks [data-hint-x]').click();
    out.xCleared = document.getElementById('guideSlot-tasks').innerHTML === '';
    out.xStored = JSON.parse(localStorage.getItem('lifePlannerGuides_v213')).seen.tasks === 1;
    /* … and so does simply walking to another section */
    window.lpGuide.reset();
    window.showView('dashboard');
    out.dashboardHint = document.getElementById('guideSlot-dashboard').innerHTML.length > 0;
    window.showView('habits');
    out.leavingMarkedSeen = JSON.parse(localStorage.getItem('lifePlannerGuides_v213')).seen.dashboard === 1;
    window.showView('dashboard');
    out.neverNags = document.getElementById('guideSlot-dashboard').innerHTML === '' ||
      document.getElementById('guideSlot-dashboard').innerHTML.includes('qs-card');
    /* the calendar is exempt — it already carries a permanent one-line intro */
    window.lpGuide.reset();
    window.showView('calendar');
    out.calendarHasNoHint = !document.querySelector('#view-calendar .guide-hint');
    window.showView('dashboard');
    return out;
  });
  check('v21.3 a hint is shown once and retires on ✕, on reading or on walking away',
    v213hint.tasksHint && v213hint.xCleared && v213hint.xStored && v213hint.dashboardHint &&
    v213hint.leavingMarkedSeen && v213hint.neverNags && v213hint.calendarHasNoHint,
    JSON.stringify(v213hint));

  /* «سه قدم اول» — write one task, tick it, give it a place in the calendar */
  await page.evaluate(() => {
    localStorage.setItem('lifePlannerAI_v1', JSON.stringify(
      { tasks: [], habits: [], goals: [], notes: [], events: [], xp: 0, level: 1, history: {}, dayPlans: {} }));
    localStorage.removeItem('lifePlannerGuides_v213');
  });
  await page.reload({ waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 700));
  const v213qs = await page.evaluate(() => {
    document.querySelectorAll('.modal-bg.open').forEach(m => m.classList.remove('open'));
    const slot = document.getElementById('guideSlot-dashboard');
    const out = { steps: slot.querySelectorAll('.qs-step').length, done: slot.querySelectorAll('.qs-step.done').length };

    /* step 1 — write one task through the real sheet */
    slot.querySelector('[data-qs-go="0"]').click();
    out.step1OpenedTask = document.getElementById('taskModalBg').classList.contains('open');
    document.getElementById('tTitle').value = 'قدم اول — آزمون v21.3';
    window.saveTask();
    out.step1Done = document.getElementById('guideSlot-dashboard').querySelectorAll('.qs-step.done').length === 1;
    out.cardStillThere = document.getElementById('guideSlot-dashboard').innerHTML.includes('qs-card');

    /* step 2 — walk to Tasks and tick it off */
    document.getElementById('guideSlot-dashboard').querySelector('[data-qs-go="1"]').click();
    out.step2WentToTasks = document.getElementById('view-tasks').classList.contains('active');
    window.showView('dashboard');
    out.cardSurvivedTrip = document.getElementById('guideSlot-dashboard').innerHTML.includes('qs-card');
    const id = DB.tasks.find(t => t.title.includes('آزمون v21.3')).id;
    window.toggleTask(id);
    out.step2Done = document.getElementById('guideSlot-dashboard').querySelectorAll('.qs-step.done').length === 2;

    /* step 3 — give it a place in the calendar */
    document.getElementById('guideSlot-dashboard').querySelector('[data-qs-go="2"]').click();
    out.step3OpenedEvent = document.getElementById('eventModalBg').classList.contains('open');
    document.getElementById('eventModalBg').classList.remove('open');
    DB.events.push({ id: 'e-qs', title: 'قدم سوم', days: [(new Date().getDay() + 1) % 7], startMin: 600, endMin: 660 });
    window.save();
    const after = document.getElementById('guideSlot-dashboard');
    out.cardRetired = after.innerHTML === '';
    out.stored = JSON.parse(localStorage.getItem('lifePlannerGuides_v213'));
    out.noHintTookItsPlace = !after.innerHTML.includes('guide-hint-txt');
    return out;
  });
  check('v21.3 an empty account gets the three-step card, and each step ticks itself off',
    v213qs.steps === 3 && v213qs.done === 0 && v213qs.step1OpenedTask && v213qs.step1Done &&
    v213qs.step2WentToTasks && v213qs.step2Done && v213qs.step3OpenedEvent, JSON.stringify(v213qs));
  check('v21.3 the card is sticky: it survives a trip to another section',
    v213qs.cardStillThere && v213qs.cardSurvivedTrip, JSON.stringify(v213qs));
  await new Promise(r => setTimeout(r, 1500));
  const v213qsEnd = await page.evaluate(() => ({
    toast: document.getElementById('toast').textContent,
    slot: document.getElementById('guideSlot-dashboard').innerHTML
  }));
  check('v21.3 finishing the last step retires the card and says congratulations once',
    v213qs.cardRetired && v213qs.noHintTookItsPlace && v213qs.stored.qs === 'off' &&
    v213qs.stored.seen.dashboard === 1 && v213qsEnd.toast.includes('سه قدم اول تمام شد') &&
    v213qsEnd.slot === '', JSON.stringify({ v213qs, toast: v213qsEnd.toast, slot: v213qsEnd.slot.slice(0, 40) }));
  check('no fatal JS errors after the v21.3 guide flow', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

  /* the card must never come back, and the guides must be reachable from Settings */
  await page.reload({ waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 700));
  const v213after = await page.evaluate(() => {
    document.querySelectorAll('.modal-bg.open').forEach(m => m.classList.remove('open'));
    const out = {};
    out.slot = document.getElementById('guideSlot-dashboard').innerHTML;
    out.settingsCard = [...document.querySelectorAll('#view-settings .settings-card')]
      .some(c => c.textContent.includes('راهنمای بخش‌ها') && c.querySelectorAll('[onclick^="openGuide("]').length === 10);
    /* «نمایش دوباره» brings the automatic guides back */
    window.lpResetGuides();
    out.resetState = JSON.parse(localStorage.getItem('lifePlannerGuides_v213'));
    out.cardIsBack = document.getElementById('guideSlot-dashboard').innerHTML.includes('qs-card');
    /* English mode reads the whole guide */
    localStorage.setItem('lifePlannerLang_v1', 'en');
    out.translated = ['سه قدم اول', 'راهنمای بخش‌ها', 'راهنمای تسک‌ها', 'تیکش بزن',
      'داشبورد یعنی «امروز چه‌کار داری؟» — همین سه کارت، نه چیز دیگر.',
      /* v21.4: the three new guides and their strings */
      'راهنمای عادت‌ها', '📖 راهنمای اهداف', '🔥 عادت‌ها', '🗑️ هدف حذف شد',
      'خانه‌ی امروز', 'استریک و XP', 'چهار دکمه روی کارت', 'سنجاق و ترتیب',
      'تغییر به نمای لیستی', 'فقط خانه‌ی امروز را تیک بزن؛ استریک و XP خودش می‌آید.']
      .map(s => window.lpTranslate(s));
    localStorage.setItem('lifePlannerLang_v1', 'fa');
    return out;
  });
  check('v21.3 the card never comes back on its own, but Settings can bring it',
    v213after.slot === '' && v213after.settingsCard && v213after.resetState.qs === '' &&
    v213after.cardIsBack, JSON.stringify(v213after));
  check('v21.3 every new string has an English translation',
    v213after.translated.every(t => t && !/[\u0600-\u06FF]/.test(t)), JSON.stringify(v213after.translated));

  /* ---------- v21.4: habits, goals and notes joined the same guide ---------- */
  /* Nothing was removed from those three sections; they only became explainable. */
  const v214 = await page.evaluate(() => {
    const clean = () => document.querySelectorAll('.modal-bg.open').forEach(m => m.classList.remove('open'));
    clean();
    const q = sel => document.querySelector(sel);
    const out = {};
    const trip = (sec) => {
      window.openGuide(sec);
      return [q('#guideModalBg .guide-panel.sel').dataset.g, q('#guideTitle').textContent, q('#guideCta').textContent].join('|');
    };
    out.habits = trip('habits');
    out.goals = trip('goals');
    out.notes = trip('notes');
    out.tabs = [...document.querySelectorAll('#guideTabs [data-g]')].map(t => t.dataset.g).join(',');
    out.visiblePanels = [...document.querySelectorAll('#guideModalBg .guide-panel')]
      .filter(p => getComputedStyle(p).display !== 'none').length;
    /* the closing button of a guide opens that section's own sheet */
    window.openGuide('goals');
    q('#guideCta').click();
    out.ctaClosedGuide = !document.getElementById('guideModalBg').classList.contains('open');
    out.ctaOpenedSheet = document.getElementById('goalModalBg').classList.contains('open');
    clean();
    /* a real click on another tab follows with panel, title and action */
    window.openGuide('tasks');
    q('#guideTabs [data-g="notes"]').click();
    out.afterTab = q('#guideModalBg .guide-panel.sel').dataset.g + '|' + q('#guideTitle').textContent + '|' + q('#guideCta').textContent;
    out.readingMarksSeen = window.lpGuide.state().seen.notes === 1;
    clean();
    return out;
  });
  check('v21.4 each new section opens its own panel, title and action',
    v214.habits === 'habits|📖 راهنمای عادت‌ها|➕ عادت جدید' &&
    v214.goals === 'goals|📖 راهنمای اهداف|➕ هدف جدید' &&
    v214.notes === 'notes|📖 راهنمای یادداشت‌ها|➕ یادداشت جدید', JSON.stringify(v214));
  check('v21.4 six tabs, one visible panel, and the action opens that section’s sheet',
    v214.tabs === 'dashboard,tasks,calendar,habits,goals,notes,pomodoro,shop,skills,boss' && v214.visiblePanels === 1 &&
    v214.ctaClosedGuide && v214.ctaOpenedSheet, JSON.stringify(v214));
  check('v21.4 switching tab follows panel, title and action together, and reading marks it seen',
    v214.afterTab === 'notes|📖 راهنمای یادداشت‌ها|➕ یادداشت جدید' && v214.readingMarksSeen,
    JSON.stringify(v214));

  /* the one-time hint of the three new sections: once, and gone for good */
  const v214hint = await page.evaluate(() => {
    localStorage.removeItem('lifePlannerGuides_v213');
    window.lpGuide.reset();
    const seen = (k) => JSON.parse(localStorage.getItem('lifePlannerGuides_v213')).seen[k] === 1;
    const slot = (s) => document.getElementById('guideSlot-' + s).innerHTML;
    const out = {};
    window.showView('habits');
    out.habitsHint = slot('habits').includes('خانه‌ی امروز را تیک بزن') && slot('habits').includes('guide-hint');
    out.hintInsideView = !!document.getElementById('guideSlot-habits').closest('#view-habits');
    /* ✕ retires it for good */
    document.querySelector('#guideSlot-habits [data-hint-x]').click();
    out.habitsGone = slot('habits') === '';
    out.habitsStored = seen('habits');
    /* walking away retires it too */
    window.showView('goals');
    out.goalsHint = slot('goals').includes('یک هدف بساز');
    window.showView('notes');
    out.goalsGoneAfterWalk = slot('goals') === '';
    out.goalsStored = seen('goals');
    /* reading the guide retires it */
    out.notesHint = slot('notes').includes('یک عنوان بنویس');
    window.openGuide('notes'); window.closeGuide();
    out.notesGoneAfterRead = slot('notes') === '';
    out.notesStored = seen('notes');
    /* and none of them ever comes back — a hint is not a nag */
    window.showView('habits'); window.showView('goals'); window.showView('notes');
    out.neverNags = slot('habits') === '' && slot('goals') === '' && slot('notes') === '';
    out.nothingModalOpen = !document.querySelector('.modal-bg.open');
    return out;
  });
  check('v21.4 a first visit to habits / goals / notes gets one slim hint, inside the section',
    v214hint.habitsHint && v214hint.goalsHint && v214hint.notesHint &&
    v214hint.hintInsideView && v214hint.nothingModalOpen, JSON.stringify(v214hint));
  check('v21.4 each hint retires for good on ✕, on walking away and on reading the guide',
    v214hint.habitsGone && v214hint.habitsStored && v214hint.goalsGoneAfterWalk && v214hint.goalsStored &&
    v214hint.notesGoneAfterRead && v214hint.notesStored && v214hint.neverNags, JSON.stringify(v214hint));

  /* the five behaviours that were made honest */
  const v214fix = await page.evaluate(() => {
    const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const today = iso(new Date());
    const out = {};

    /* (1) the habit week grid belongs to the habits, not to the calendar's week switch */
    DB.habits = [{ id: 'v214-habit', name: 'آزمون v21.4', icon: '📚', log: {} }];
    window.calWeekShift(0);                /* start from this week, whatever ran before */
    window.calWeekStep(1);                 /* the calendar walks to next week… */
    window.showView('habits');
    const cells = () => [...document.querySelectorAll('#habitList .week-dots .wd')];
    out.cells = cells().length;
    out.days = cells().map(c => c.textContent).join('');
    out.todayMarked = cells().filter(c => c.classList.contains('today')).length;
    out.todayClickable = cells().filter(c => (c.getAttribute('onclick') || '').includes('toggleHabitDay')).length;
    /* the calendar itself must still follow its own week switch */
    out.calendarFollowsOffset = window.weekDates()[0] !== window.weekDates(0)[0];
    window.calWeekStep(-1);                /* …and back */
    out.calendarOffsetBack = window.weekDates()[0] !== window.weekDates(1)[0];

    /* (2) the 6 XP is earned once per habit per day, not on every re-tick.
       Measured on totalXPEarned, which a level-up cannot subtract from, and
       with the XP boost off so the expected number is exactly 6. */
    DB.xpBoost = { activeUntil: 0 };
    const earned0 = DB.stats.totalXPEarned || 0;
    window.toggleHabitDay('v214-habit', today);
    const afterFirst = (DB.stats.totalXPEarned || 0) - earned0;
    window.toggleHabitDay('v214-habit', today);      /* un-tick */
    window.toggleHabitDay('v214-habit', today);      /* tick the same day again */
    out.xpFirstTick = afterFirst;
    out.xpReTick = (DB.stats.totalXPEarned || 0) - earned0 - afterFirst;
    out.rewardFlag = DB.habits[0].rewardDate === today;
    out.stillTicked = DB.habits[0].log[today] === true;
    out.streakText = document.querySelector('#habitList .habit-streak').textContent.trim();
    out.streakFaDigits = /[۰-۹]/.test(out.streakText);
    out.bestStreak = DB.stats.bestStreak;
    out.noHabitCounter = !Object.prototype.hasOwnProperty.call(DB.history[today] || {}, 'habits');

    /* (3) deleting a habit asks first, then reports */
    window.deleteHabit('v214-habit');
    out.habitDeleted = DB.habits.length === 0;
    out.habitToast = document.getElementById('toast').textContent;

    /* (4) goals: Persian digits on the card, and the same question before deleting */
    DB.goals = [{ id: 'v214-goal', title: 'آزمون v21.4', level: 'weekly', progress: 45 }];
    window.showView('goals');
    out.goalPct = document.querySelector('#goalList .num').textContent.trim();
    out.goalFaDigits = /[۰-۹]/.test(out.goalPct);
    out.goalBar = document.querySelector('#goalList .bar-fill').style.width;
    window.deleteGoal('v214-goal');
    out.goalDeleted = DB.goals.length === 0;
    out.goalToast = document.getElementById('toast').textContent;

    /* (5) the ▦ button tells you which view you are in */
    window.showView('notes');
    const vt = document.getElementById('noteViewToggle');
    const snap = () => [vt.textContent, vt.title, vt.getAttribute('aria-pressed'),
      document.getElementById('noteGrid').classList.contains('notes-list')].join('|');
    out.toggleGrid = snap();
    window.toggleNoteViewMode();
    out.toggleList = snap();
    window.toggleNoteViewMode();
    out.toggleBack = snap();

    /* (6) the dead layer is really gone at runtime, the live chart painter is not */
    out.deadGone = ['renderCharts', 'renderHabitMini', 'renderGoalMini', 'drawDoughnut', 'drawLineChart', 'drawHBarChart']
      .every(fn => typeof window[fn] === 'undefined') && !document.getElementById('hShieldHabits');
    out.pomoChartAlive = ['drawBarChart', 'last7', 'setupCanvas', 'cssVar', 'roundRect']
      .every(fn => typeof window[fn] === 'function');
    return out;
  });
  check('v21.4 the habit week grid stays on the current week and only today is clickable',
    v214fix.cells === 7 && v214fix.days === ['ش','ی','د','س','چ','پ','ج'].join('') &&
    v214fix.todayMarked === 1 && v214fix.todayClickable === 1 &&
    v214fix.calendarFollowsOffset && v214fix.calendarOffsetBack, JSON.stringify(v214fix));
  check('v21.4 a habit pays 6 XP once a day, keeps its streak and stops writing a dead counter',
    v214fix.xpFirstTick === 6 && v214fix.xpReTick === 0 && v214fix.rewardFlag && v214fix.stillTicked &&
    v214fix.streakFaDigits && v214fix.streakText === '🔥 ۱ روز پیاپی' && v214fix.bestStreak >= 1 &&
    v214fix.noHabitCounter, JSON.stringify(v214fix));
  check('v21.4 deleting a habit or a goal asks first and then says what happened',
    dialogs.includes('این عادت حذف بشه؟') && dialogs.includes('این هدف حذف بشه؟') &&
    v214fix.habitDeleted && v214fix.habitToast.includes('عادت حذف شد') &&
    v214fix.goalDeleted && v214fix.goalToast.includes('هدف حذف شد'),
    JSON.stringify({ dialogs, habit: v214fix.habitToast, goal: v214fix.goalToast }));
  check('v21.4 goal percentages read like the rest of the app and the bar still follows',
    v214fix.goalFaDigits && v214fix.goalPct === '۴۵٪' && v214fix.goalBar === '45%', JSON.stringify(v214fix));
  check('v21.4 the notes layout button shows the view you are in and the one a tap leads to',
    v214fix.toggleGrid === '▦|تغییر به نمای لیستی|false|false' &&
    v214fix.toggleList === '☰|تغییر به نمای شبکه‌ای|true|true' &&
    v214fix.toggleBack === v214fix.toggleGrid, JSON.stringify(v214fix));
  check('v21.4 the dead chart layer and its leftovers are gone, the Pomodoro chart is not',
    v214fix.deadGone && v214fix.pomoChartAlive, JSON.stringify(v214fix));
  check('no fatal JS errors after the v21.4 flow', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));


  /* ---------- v21.7: the last four sections joined the guide ---------- */
  /* The Pomodoro, the XP Shop, the skill tree and the weekly boss now explain
     themselves; the XP Shop kept every feature it had. */
  const v215 = await page.evaluate(() => {
    const clean = () => document.querySelectorAll('.modal-bg.open').forEach(m => m.classList.remove('open'));
    clean();
    const q = sel => document.querySelector(sel);
    const out = {};
    const trip = (sec) => {
      window.openGuide(sec);
      return [q('#guideModalBg .guide-panel.sel').dataset.g, q('#guideTitle').textContent, q('#guideCta').textContent].join('|');
    };
    out.pomodoro = trip('pomodoro');
    out.shop = trip('shop');
    out.skills = trip('skills');
    DB.boss.active = null;
    out.bossIdle = trip('boss');
    out.tabs = [...document.querySelectorAll('#guideTabs [data-g]')].map(t => t.dataset.g).join(',');
    out.rowsPerPanel = [...document.querySelectorAll('#guideModalBg .guide-panel')]
      .map(p => p.querySelectorAll('.guide-row').length).join(',');
    out.visiblePanels = [...document.querySelectorAll('#guideModalBg .guide-panel')]
      .filter(p => getComputedStyle(p).display !== 'none').length;

    /* the Pomodoro's action really starts a session (and is refused while one runs) */
    window.showView('pomodoro');
    DB.pomodoro.session = null; DB.pomodoro.pendingNext = null;
    window.openGuide('pomodoro'); q('#guideCta').click();
    out.pomoCtaStarted = !!(DB.pomodoro.session && DB.pomodoro.session.mode === 'focus');
    out.pomoCtaClosedGuide = !document.getElementById('guideModalBg').classList.contains('open');
    window.endSession();                       /* 0 minutes → nothing is logged */
    out.pomoNothingLogged = (DB.pomodoro.sessionHistory || []).length === 0 || DB.pomodoro.session === null;

    /* the shop's action shows the odds — it never spends a single XP */
    const wallet = DB.xpWallet;
    window.openGuide('shop'); q('#guideCta').click();
    out.shopCtaOpenedOdds = document.getElementById('mysteryInfoModalBg').classList.contains('open');
    out.shopCtaSpentNothing = DB.xpWallet === wallet;
    out.oddsListed = document.querySelectorAll('#mysteryInfoList > div').length === 10;
    clean();

    /* the skill tree has no sheet of its own: its action walks to the shop */
    window.showView('skills');
    window.openGuide('skills'); q('#guideCta').click();
    out.skillsCtaClosedGuide = !document.getElementById('guideModalBg').classList.contains('open');
    out.skillsCtaWentToShop = document.getElementById('view-shop').classList.contains('active');

    /* the boss's action follows the data: build a fight, or edit the running one */
    window.showView('boss');
    DB.boss.active = { name: 'آزمون v21.7', hp: 100, maxHp: 100, taskIds: [], hitTaskIds: [], deadlineAt: Date.now() + 86400000 };
    window.openGuide('boss');
    out.bossRunning = q('#guideCta').textContent;
    q('#guideCta').click();
    out.bossCtaOpenedEdit = document.getElementById('bossSetupModalBg').classList.contains('open') &&
      document.getElementById('bossSetupTitle').textContent.includes('ویرایش باس');
    out.bossCtaKeptTheFight = !!DB.boss.active && DB.boss.active.hp === 100;
    clean();
    DB.boss.active = null;
    return out;
  });
  check('v21.7 each new section opens its own panel, title and action',
    v215.pomodoro === 'pomodoro|📖 راهنمای پومودورو|▶️ شروع جلسه‌ی فوکوس' &&
    v215.shop === 'shop|📖 راهنمای XP Shop|🎁 شانس‌های جعبه' &&
    v215.skills === 'skills|📖 راهنمای درخت مهارت|🛍️ برو به XP Shop' &&
    v215.bossIdle === 'boss|📖 راهنمای باس هفتگی|⚔️ ساخت باس', JSON.stringify(v215));
  check('v21.7 ten tabs, four rows each, and only one panel on screen',
    v215.tabs === 'dashboard,tasks,calendar,habits,goals,notes,pomodoro,shop,skills,boss' &&
    v215.rowsPerPanel === '4,4,4,4,4,4,4,4,4,4' && v215.visiblePanels === 1, JSON.stringify(v215));
  check('v21.7 each action lands in the real thing, and the shop one spends nothing',
    v215.pomoCtaStarted && v215.pomoCtaClosedGuide && v215.shopCtaOpenedOdds && v215.shopCtaSpentNothing &&
    v215.oddsListed && v215.skillsCtaWentToShop && v215.skillsCtaClosedGuide, JSON.stringify(v215));
  check('v21.7 the boss guide edits a running fight instead of building a second one',
    v215.bossRunning === '✏️ ویرایش باس' && v215.bossCtaOpenedEdit && v215.bossCtaKeptTheFight,
    JSON.stringify(v215));

  /* the one-time hint of the four new sections: once, and gone for good */
  const v215hint = await page.evaluate(() => {
    /* leaving a section is what retires its hint, so reset from a section that
       has no guide of its own and then walk the four in turn (boss first). */
    window.showView('city');
    localStorage.removeItem('lifePlannerGuides_v213');
    window.lpGuide.reset();
    const slot = (s) => document.getElementById('guideSlot-' + s).innerHTML;
    const seen = (k) => JSON.parse(localStorage.getItem('lifePlannerGuides_v213')).seen[k] === 1;
    const out = {};
    window.showView('boss');
    out.bossHint = slot('boss').includes('guide-hint') && slot('boss').includes('هر تیک یک ضربه به باس است');
    out.hintInsideView = !!document.getElementById('guideSlot-boss').closest('#view-boss');
    out.nothingModalOpen = !document.querySelector('.modal-bg.open');
    window.showView('pomodoro');
    out.bossGoneOnWalk = slot('boss') === '' && seen('boss');
    out.pomoHint = slot('pomodoro').includes('فقط «▶️ شروع» را بزن');
    window.showView('shop');
    out.pomoGoneOnWalk = slot('pomodoro') === '' && seen('pomodoro');
    out.shopHint = slot('shop').includes('موجودی XP Shop از نوارِ سطح جداست');
    document.querySelector('#guideSlot-shop [data-hint-x]').click();
    out.shopGoneOnX = slot('shop') === '' && seen('shop');
    window.showView('skills');
    out.skillsHint = slot('skills').includes('هر لول‌آپ ۱ امتیاز مهارت می‌دهد');
    window.openGuide('skills'); window.closeGuide();
    out.skillsGoneAfterRead = slot('skills') === '' && seen('skills');
    window.showView('pomodoro'); window.showView('shop'); window.showView('skills'); window.showView('boss');
    out.neverNags = ['pomodoro', 'shop', 'skills', 'boss'].every(s => slot(s) === '');
    return out;
  });
  check('v21.7 a first visit to the four sections gets one slim hint, inside the section',
    v215hint.pomoHint && v215hint.shopHint && v215hint.skillsHint && v215hint.bossHint &&
    v215hint.hintInsideView && v215hint.nothingModalOpen, JSON.stringify(v215hint));
  check('v21.7 each new hint retires for good on ✕, on walking away and on reading the guide',
    v215hint.bossGoneOnWalk && v215hint.pomoGoneOnWalk && v215hint.shopGoneOnX &&
    v215hint.skillsGoneAfterRead && v215hint.neverNags,
    JSON.stringify(v215hint));

  /* the Pomodoro lost exactly one thing: the notification that rewrote itself */
  const v215notify = await page.evaluate(async () => {
    const clean = () => document.querySelectorAll('.modal-bg.open').forEach(m => m.classList.remove('open'));
    clean();
    const out = {};
    const sent = [];
    const origSend = window.sendNotification;
    const origPerm = window.notifyPermissionStatus;
    window.sendNotification = (title, body, options) => {
      sent.push([title, body || '', (options && options.tag) || ''].join('|'));
      return Promise.resolve(true);
    };
    window.notifyPermissionStatus = () => 'granted';
    DB.pomodoro.notifications = true;
    DB.pomodoro.session = null; DB.pomodoro.pendingNext = null;
    DB.pomodoro.currentSession = 1; DB.pomodoro.currentRound = 1;

    window.startFocus();
    out.startNotified = sent.length === 1 && sent[0].includes('🍅 فوکوس شروع شد');
    /* pausing and resuming used to rewrite the live notification — now: silence */
    window.pauseSession();
    window.resumeSession();
    await new Promise(r => setTimeout(r, 600));
    out.pauseResumeSilent = sent.length === 1;
    out.noLiveTag = !sent.some(x => x.includes('lp-pomo-live'));
    window.completePomoSession();
    out.sessionEndNotified = sent.length === 2 && sent[1].includes('🎉 جلسه فوکوس کامل شد');
    clean();
    DB.pomodoro.session = null; DB.pomodoro.pendingNext = null;

    /* the switch is real: off means off, and the status tells the truth */
    window.togglePomoNotifications(false);
    out.statusOff = document.getElementById('pomoNotifyStatus').textContent;
    out.switchOff = document.getElementById('pomoNotifyToggle').checked === false;
    window.startFocus();
    out.silentWhenOff = sent.length === 2;
    window.endSession();
    window.togglePomoNotifications(true);
    out.statusOn = document.getElementById('pomoNotifyStatus').textContent;
    out.switchOn = document.getElementById('pomoNotifyToggle').checked === true;
    window.startFocus();
    out.notifiesAgain = sent.length === 3;
    window.endSession();
    clean();

    /* without the browser's permission the switch says so and stays out of reach */
    window.notifyPermissionStatus = () => 'denied';
    window.renderPomoNotifyStatus();
    out.statusDenied = document.getElementById('pomoNotifyStatus').textContent;
    out.switchDisabled = document.getElementById('pomoNotifyToggle').disabled === true;

    window.sendNotification = origSend;
    window.notifyPermissionStatus = origPerm;
    DB.pomodoro.notifications = true;
    DB.pomodoro.session = null; DB.pomodoro.pendingNext = null;
    DB.pomodoro.currentSession = 1; DB.pomodoro.currentRound = 1;
    window.renderPomoUI(); window.renderPomoV66();
    return out;
  });
  check('v21.7 the countdown notification is gone and the three real ones stayed',
    v215notify.startNotified && v215notify.pauseResumeSilent && v215notify.noLiveTag &&
    v215notify.sessionEndNotified, JSON.stringify(v215notify));
  check('v21.7 the notification switch really switches, and tells the truth about permission',
    v215notify.statusOff.includes('خاموش') && v215notify.switchOff && v215notify.silentWhenOff &&
    v215notify.statusOn.includes('روشن') && v215notify.switchOn && v215notify.notifiesAgain &&
    v215notify.statusDenied.includes('اجازه') && v215notify.switchDisabled, JSON.stringify(v215notify));

  /* the Pomodoro reads like the rest of the app, and its stats say each thing once */
  const v215pomo = await page.evaluate(() => {
    const clean = () => document.querySelectorAll('.modal-bg.open').forEach(m => m.classList.remove('open'));
    clean();
    const out = {};
    const today = window.todayISO();
    window.showView('pomodoro');
    DB.pomodoro.session = null;
    DB.pomodoro.currentRound = 2; DB.pomodoro.currentSession = 3;
    DB.pomodoro.settings.cycleCount = 4;
    window.renderPomoV66();
    out.cycleTitle = document.getElementById('pomoSessionTitle').textContent;
    out.dots = document.querySelectorAll('#pomoSessionDots .pomo-dot').length;

    DB.pomodoro.session = {
      mode: 'focus', status: 'paused', startAt: Date.now() - 5 * 60000, endAt: Date.now() + 20 * 60000,
      totalMs: 25 * 60000, remainingMs: 20 * 60000, pauseCount: 1, plannedMinutes: 25, taskId: ''
    };
    window.renderPomoV66();
    out.minuteBadge = document.getElementById('pomoMinuteBadge').textContent;
    DB.pomodoro.session = null;

    /* the stats tab: one card language, every number written once */
    DB.pomodoro.history = {};
    DB.pomodoro.history[today] = { focus: 80, break: 15, sessions: 2 };
    DB.pomodoro.sessionHistory = [
      { id: 'v215a', date: today, mode: 'focus', minutes: 45, score: 90, pauseCount: 1, taskId: '' },
      { id: 'v215b', date: today, mode: 'focus', minutes: 35, score: 100, pauseCount: 0, taskId: '' }
    ];
    DB.pomodoro.focusStreak = 3;
    DB.pomodoro.settings.goalMinutes = 60;
    window.showPomoTab('stats');
    window.renderPomoStats(); window.renderPomoChart(); window.renderPomoV66();
    out.todayFocus = document.getElementById('pomoTodayFocus').textContent;
    out.goalStatus = document.getElementById('pomoGoalStatus').textContent;
    out.weekChip = document.querySelector('#pomoWeekChecklist .pomo-day-chip:last-child .d.num').textContent;
    out.summaryCards = document.querySelectorAll('#pomoV66StatsTools .card').length;
    out.oldCardsGone = document.querySelectorAll('#pomoV66StatsTools .pomo-v66-card').length;
    out.tiles = [...document.querySelectorAll('#pomoV66StatsTools .pomo-stat-mini')]
      .map(t => t.querySelector('.n').textContent.trim() + '/' + t.querySelector('.l').textContent.trim());
    out.historyFirst = document.querySelector('#pomoV66StatsTools .pomo-history-meta').textContent;
    out.historyScore = document.querySelector('#pomoV66StatsTools .pomo-history-score').textContent;
    out.chartAlive = document.getElementById('chartPomo').width > 0;

    /* the ⚙️ tab and the preset grid can no longer disagree */
    const setVal = (id, v) => { document.getElementById(id).value = v; };
    setVal('pomoSetFocus', 45); setVal('pomoSetBreak', 10);
    window.savePomoSettings();
    out.presetFollowsStudy = DB.pomodoro.presetId === 'study';
    out.studyChipActive = document.querySelector('.pomo-preset.active')?.dataset.pomoPreset === 'study';
    setVal('pomoSetFocus', 33); setVal('pomoSetBreak', 8);
    window.savePomoSettings();
    out.presetBecomesCustom = DB.pomodoro.presetId === 'custom' &&
      DB.pomodoro.customPreset.focus === 33 && DB.pomodoro.customPreset.break === 8;
    out.customChipLabel = document.querySelector('.pomo-preset[data-pomo-preset="custom"] small').textContent;
    setVal('pomoSetFocus', 25); setVal('pomoSetBreak', 5);
    window.savePomoSettings();
    out.presetBackToClassic = DB.pomodoro.presetId === 'classic';
    out.settingsFormKept = document.getElementById('pomoSetFocus').value === '25';

    /* the legacy migration is a one-pass job now */
    DB.pomodoro.manualMigrated = false;
    DB.pomodoro.manualData = [{ id: 'v215legacy', kind: 'focus', minutes: 30, date: today, createdAt: Date.now(), note: '' }];
    const before = (DB.pomodoro.history[today] || {}).focus || 0;
    window.migrateLegacyManualPomoData();
    out.migrated = DB.pomodoro.manualMigrated === true && DB.pomodoro.manualData[0].migratedToHistory === true &&
      DB.pomodoro.history[today].focus === before + 30;
    window.migrateLegacyManualPomoData();
    window.migrateLegacyManualPomoData();
    out.migratedOnce = DB.pomodoro.history[today].focus === before + 30;
    DB.pomodoro.manualData = [];
    DB.pomodoro.presets = undefined; delete DB.pomodoro.presets;
    window.renderPomoV66();
    out.noPresetsMirror = !('presets' in DB.pomodoro);

    clean();
    window.showPomoTab('focus');
    DB.pomodoro.currentRound = 1; DB.pomodoro.currentSession = 1;
    DB.pomodoro.history = {}; DB.pomodoro.sessionHistory = []; DB.pomodoro.focusStreak = 0;
    DB.pomodoro.settings.goalMinutes = 0;
    window.renderPomoUI(); window.renderPomoV66();
    return out;
  });
  check('v21.7 rounds, sessions and minutes read in the app’s own digits',
    v215pomo.cycleTitle === '🍅 دور ۲ • جلسه ۳ از ۴' && v215pomo.dots === 4 &&
    v215pomo.minuteBadge === '⏱️ دقیقه ۶ از ۲۵ (۲۰ دقیقه باقی‌مانده)', JSON.stringify(v215pomo));
  check('v21.7 the stats tab has one voice: same cards, each number written once',
    v215pomo.summaryCards === 2 && v215pomo.oldCardsGone === 0 &&
    v215pomo.todayFocus === '۱ ساعت و ۲۰ دقیقه' &&
    v215pomo.tiles.join(' | ') === '۱ ساعت و ۲۰ دقیقه/مجموع فوکوس | ۲/جلسات کامل | ۹۵/میانگین کیفیت | 🔥 ۳/استریک روزانه | ۱ ساعت و ۲۰ دقیقه/میانگین فوکوس روزانه' &&
    v215pomo.historyFirst.includes('۴۵ دقیقه') && !v215pomo.historyFirst.includes('(45m)') &&
    !v215pomo.historyFirst.includes('2026-') && v215pomo.weekChip === '۱.۳ ساعت' &&
    v215pomo.historyScore === '۹۰/۱۰۰' && v215pomo.goalStatus.includes('هدف امروز رو کامل کردی') &&
    v215pomo.chartAlive, JSON.stringify(v215pomo));
  check('v21.7 one setting, one truth: the preset grid follows the ⚙️ tab',
    v215pomo.presetFollowsStudy && v215pomo.studyChipActive && v215pomo.presetBecomesCustom &&
    v215pomo.customChipLabel === '۳۳/۸ دقیقه' && v215pomo.presetBackToClassic && v215pomo.settingsFormKept,
    JSON.stringify(v215pomo));
  check('v21.7 the legacy migration runs once and the presets mirror is gone',
    v215pomo.migrated && v215pomo.migratedOnce && v215pomo.noPresetsMirror, JSON.stringify(v215pomo));

  /* the weekly boss builds its own tasks, and its numbers read like the rest */
  const v215boss = await page.evaluate(() => {
    const clean = () => document.querySelectorAll('.modal-bg.open').forEach(m => m.classList.remove('open'));
    clean();
    const out = {};
    window.showView('boss');
    DB.boss.active = null;
    DB.boss.nextAvailableAt = 0;
    const tasksBefore = DB.tasks.length;
    window.openBossSetup();
    out.rowExists = !!document.getElementById('bossNewTaskInput') && !!document.getElementById('bossTaskPicker');
    document.getElementById('bossNameInput').value = 'باس آزمون v21.7';
    window.addBossTaskInline();                       /* an empty line is refused */
    out.emptyRefused = DB.tasks.length === tasksBefore &&
      document.getElementById('toast').textContent.includes('اسم تسک');
    document.getElementById('bossNewTaskInput').value = 'تسکِ ساخته‌شده داخل باس';
    window.addBossTaskInline();
    const t = DB.tasks[DB.tasks.length - 1];
    out.taskCreated = DB.tasks.length === tasksBefore + 1 && t.title === 'تسکِ ساخته‌شده داخل باس';
    out.taskIsARealTask = t.inbox === false && t.done === false && !!t.date && Array.isArray(t.subtasks);
    out.pickerShowsIt = document.getElementById('bossTaskPicker').textContent.includes('تسکِ ساخته‌شده داخل باس');
    out.pickerSelected = document.querySelectorAll('#bossTaskPicker .boss-task-pick-row.sel').length === 1;
    out.counter = document.getElementById('bossTaskCount').textContent;
    out.inputCleared = document.getElementById('bossNewTaskInput').value === '';
    out.toast = document.getElementById('toast').textContent;
    window.confirmBossSetup();
    const b = DB.boss.active;
    out.fightStarted = !!b && b.name === 'باس آزمون v21.7' && b.taskIds.length === 1 && b.hp === 100;
    clean();
    window.renderBossContent();
    out.hpText = document.querySelector('.boss-hp-text').textContent;
    out.deadline = document.querySelector('.boss-deadline').textContent;
    /* ticking the boss task lands the only hit and wins the fight */
    window.toggleTask(b.taskIds[0]);
    out.bossBeaten = DB.boss.active === null;
    out.victory = document.getElementById('bossVictoryText').textContent;
    clean();
    /* the task itself stays in the tasks section, done, like any other task */
    out.taskStillThere = DB.tasks.some(x => x.title === 'تسکِ ساخته‌شده داخل باس' && x.done === true);
    DB.boss.nextAvailableAt = Date.now() + 7 * 24 * 3600 * 1000;
    window.renderBossContent();
    out.countdown = document.querySelector('.boss-countdown-val').textContent;
    return out;
  });
  check('v21.7 the boss picker builds a task, selects it and starts the fight with it',
    v215boss.rowExists && v215boss.emptyRefused && v215boss.taskCreated && v215boss.taskIsARealTask &&
    v215boss.pickerShowsIt && v215boss.pickerSelected && v215boss.counter === '(۱ تسک)' &&
    v215boss.inputCleared && v215boss.toast.includes('ساخته و برای باس انتخاب شد') && v215boss.fightStarted,
    JSON.stringify(v215boss));
  check('v21.7 the boss task hits like any other and the task stays in the tasks section',
    v215boss.bossBeaten && v215boss.victory.includes('شکست خورد') && v215boss.taskStillThere,
    JSON.stringify(v215boss));
  check('v21.7 HP and the boss countdowns read in the app’s own digits',
    v215boss.hpText === '۱۰۰ / ۱۰۰ HP' && /۱۳ روز و ۲۳ ساعت|۱۴ روز و ۰ ساعت/.test(v215boss.deadline) &&
    /۷ روز و ۰ ساعت|۶ روز و ۲۳ ساعت/.test(v215boss.countdown), JSON.stringify(v215boss));

  /* the XP Shop kept everything and only reads better */
  const v215shop = await page.evaluate(() => {
    const clean = () => document.querySelectorAll('.modal-bg.open').forEach(m => m.classList.remove('open'));
    clean();
    const out = {};
    window.showView('shop');
    DB.xpWallet = 1234;
    DB.skillTiers.shopDiscount = 0;
    DB.streakShields = 0;
    DB.streakShieldWeekly = { weekStart: 0, count: 0 };
    const ownedThemes = (DB.themes.owned || []).slice();
    DB.themes.owned = [];                        /* so the three price tags are all on screen */
    window.renderXPShop();
    out.wallet = document.getElementById('xpWalletVal').textContent;
    out.costs = ['costBoost', 'costMystery', 'costShield'].map(id => document.getElementById(id).textContent).join(' | ');
    out.shieldCap = document.getElementById('streakShieldWeeklyLimit').textContent;
    out.themes = [...document.querySelectorAll('#shopThemes .theme-card')].length;
    out.themeCost = document.querySelector('#shopThemes .theme-cost')?.textContent || '';
    /* every feature of the shop is still there */
    out.buttons = ['buyXPBoost()', 'buyMysteryBox()', 'openMysteryInfo()', 'buyStreakShield()']
      .every(fn => document.getElementById('view-shop').innerHTML.includes(fn));
    DB.skillTiers.shopDiscount = 1;
    window.renderXPShop();
    out.discounted = document.getElementById('costMystery').textContent;
    DB.skillTiers.shopDiscount = 0;
    window.openMysteryInfo();
    out.odds = document.querySelector('#mysteryInfoList b').textContent;
    clean();
    /* the skill tree: five tiers for «کوئست سریع», and the wait really drops */
    window.showView('skills');
    DB.skillPoints = 5;
    DB.skillTiers.questCooldown = 0;
    window.renderSkillTree();
    out.points = document.getElementById('skillPointsVal').textContent;
    const card = () => [...document.querySelectorAll('#skillTreeGrid .skill-card')]
      .find(c => c.textContent.includes('کوئست سریع'));
    out.qcDots = card().querySelectorAll('.skill-tier-dot').length;
    out.qcDesc = card().querySelector('.skill-desc').textContent;
    out.qcButton = card().querySelector('button').textContent;
    out.cooldownBefore = window.questCooldownMs();
    for (let i = 0; i < 5; i++) window.buySkillTier('questCooldown');
    out.qcTier = DB.skillTiers.questCooldown;
    out.cooldownAfter = window.questCooldownMs();
    out.qcMaxed = card().textContent.includes('✓ تکمیل شده (۵/۵)');
    out.pointsLeft = DB.skillPoints;
    DB.skillPoints = 3;
    window.buySkillTier('questCooldown');                 /* refused at the ceiling */
    out.refused = DB.skillTiers.questCooldown === 5 && DB.skillPoints === 3;
    /* every other skill kept its tiers and its flat price */
    out.otherSkills = [...document.querySelectorAll('#skillTreeGrid .skill-card')].length === 7;
    out.flatPrice = [...document.querySelectorAll('#skillTreeGrid .skill-card button')]
      .every(b => b.textContent.includes('۱ امتیاز'));
    DB.themes.owned = ownedThemes;
    DB.skillTiers.questCooldown = 0; DB.skillPoints = 0;
    window.renderSkillTree(); window.renderXPShop();
    return out;
  });
  check('v21.7 the XP Shop kept every feature and reads in the app’s own digits',
    v215shop.wallet === '۱,۲۳۴' && v215shop.costs === '۱۰۰ XP | ۲۰۰ XP | ۵۰۰ XP' &&
    v215shop.shieldCap.includes('۰/۳') && v215shop.shieldCap.includes('۳ خرید باقی‌مانده') &&
    v215shop.themes === 3 && v215shop.themeCost === '۲۰۰ XP' && v215shop.buttons &&
    v215shop.discounted === '۱۸۰ XP' && /٪$/.test(v215shop.odds), JSON.stringify(v215shop));
  check('v21.7 «کوئست سریع» has five tiers and the wait drops from 20 to 15 minutes',
    v215shop.qcDots === 5 && v215shop.qcDesc.includes('۲۰ به ۱۵ دقیقه') &&
    v215shop.qcButton === 'تیر بعدی (۰/۵) — ۱ امتیاز' && v215shop.cooldownBefore === 20 * 60000 &&
    v215shop.cooldownAfter === 15 * 60000 && v215shop.qcTier === 5 && v215shop.qcMaxed &&
    v215shop.pointsLeft === 0 && v215shop.refused && v215shop.otherSkills && v215shop.flatPrice &&
    v215shop.points === '۵', JSON.stringify(v215shop));
  check('no fatal JS errors after the v21.7 flow', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

  await browser.close();
} else {
  // FALLBACK: no browser available (restricted sandbox). Verify core logic via file inspection.
  console.log('🔍 Running fallback checks (no browser)...');
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
  const coreJs = fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf-8');
  const appCss = fs.readFileSync(path.join(ROOT, 'css/app.css'), 'utf-8');
  const cssApp = appCss;
  const v20Css = fs.readFileSync(path.join(ROOT, 'css/v20.css'), 'utf-8');
  const swJsRegister = fs.readFileSync(path.join(ROOT, 'js/sw-register.js'), 'utf-8');
  const versionJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app-version.json'), 'utf-8'));
  const pkgJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
  const pkgLockJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf-8'));

  // 1-2: app loads & no fatal syntax
  check('app loads', indexHtml.includes('id="taskFilters"') && indexHtml.includes('id="allTasks"'));
  let syntaxOk = true;
  try { new Function(coreJs); } catch(e){ syntaxOk = false; console.log('syntax error', e.message.slice(0,300)); }
  check('no fatal JS errors on load', syntaxOk);

  // 3: DB reachable - check loadStore and DB var
  check('global store (DB) reachable', coreJs.includes('let DB = loadStore()') && coreJs.includes('function loadStore'));

  // 4: task created - check saveTask and openTaskModal exist, and inbox functions
  check('task created', coreJs.includes('function saveTask') && coreJs.includes('function openInboxQuickAdd') && coreJs.includes('function saveInboxTask'));

  // 5: task marked done & XP increased - check toggleTask and addXP and applyTaskCompletion
  check('task marked done', coreJs.includes('function toggleTask') && coreJs.includes('applyTaskCompletion'));
  check('XP increased on completion', coreJs.includes('function addXP') && coreJs.includes('DB.xp'));

  // 6: persistence
  check('data persists across reload (localStorage)', coreJs.includes('localStorage.setItem') && coreJs.includes('STORE_KEY'));

  // 7: views render
  for (const view of ['tasks', 'habits', 'goals', 'pomodoro', 'settings']) {
    const hasView = indexHtml.includes(`id="view-${view}"`) || indexHtml.includes(`data-view="${view}"`);
    check(`view renders: ${view}`, hasView);
  }

  // ---------- extra guards (beyond the 12 required checks) ----------
  const swJs = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf-8');
  const langJs = fs.readFileSync(path.join(ROOT, 'js/lang.js'), 'utf-8');
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf-8');
  const v16Path = path.join(ROOT, 'js/v16.js');
  const v16Js = fs.existsSync(v16Path) ? fs.readFileSync(v16Path, 'utf-8') : '';
  const v162Path = path.join(ROOT, 'js/v162.js');
  const v162Js = fs.existsSync(v162Path) ? fs.readFileSync(v162Path, 'utf-8') : '';

  // v16 (1) — the in-progress / queued / paused tabs are gone, the rest stayed.
  const removedTabs = ['inprogress', 'queued', 'paused'].every(f => !indexHtml.includes(`data-f="${f}"`));
  const keptTabs = ['all', 'notstarted', 'inbox', 'done'].every(f => indexHtml.includes(`data-f="${f}"`));
  check('v16 task tabs trimmed to all / notstarted / inbox / done', removedTabs && keptTabs,
    `removed=${removedTabs} kept=${keptTabs}`);

  // v16 (2) — "Completed" is a tab now, not a permanently open block.
  const doneChip = /data-f="done"[^>]*>\s*✅ تکمیل‌شده/.test(indexHtml);
  const oldCompletedBlockGone = !indexHtml.includes('id="completedTasks"');
  const counterKept = indexHtml.includes('id="completedCount"');
  check('v16 completed moved into a tab (counter kept)', doneChip && oldCompletedBlockGone && counterKept,
    `chip=${doneChip} oldBlockGone=${oldCompletedBlockGone} counter=${counterKept}`);

  // v16 (3) — skeleton loading + scroll reveal.
  check('v16 skeleton loading + scroll reveal present',
    indexHtml.includes('lp-sk') && appCss.includes('.lp-pending') && v16Js.includes('showSkeletons') && v16Js.includes('IntersectionObserver'));

  // v16 (4) — low-end phone helpers exist and are opt-in by device capability.
  check('v16 low-end phone mode present',
    appCss.includes('html.lp-lite') && v16Js.includes('hardwareConcurrency') && appCss.includes('content-visibility:auto'));

  // v16 (5) — goals got ±2% next to ±10%.
  check('v16 goal ±2% buttons present',
    coreJs.includes('${g.progress-2}') && coreJs.includes('${g.progress+2}') &&
    coreJs.includes('${g.progress-10}') && coreJs.includes('${g.progress+10}'));

  // v16 (6) — habits and goals can be edited.
  check('v16 habit & goal editing present',
    coreJs.includes('editingHabitId') && coreJs.includes('editingGoalId') &&
    coreJs.includes('function openHabitModal(id=null)') && coreJs.includes('function openGoalModal(id=null)') &&
    indexHtml.includes('id="habitModalTitle"') && indexHtml.includes('id="goalModalTitle"'));

  // the new file must be precached, otherwise the offline PWA loses it
  check('v16 script is precached by the service worker',
    /['"`]\.\/js\/v16\.js(?:\?v=[^'"`]*)?['"`]/.test(swJs) && indexHtml.includes('js/v16.js'));

  // every new user-facing Persian string needs an English translation
  check('v16 strings translated for English mode',
    ['✏️ ویرایش عادت', '✏️ ویرایش هدف', '✏️ عادت ویرایش شد', '✏️ هدف ویرایش شد']
      .every(k => langJs.includes(k)));

  // ---------- v16.2: notes workspace ----------
  const notesToolbar =
    indexHtml.includes('id="noteSearch"') &&   // the original search box must survive
    indexHtml.includes('id="noteTagFilter"') &&
    indexHtml.includes('id="noteSort"') &&
    indexHtml.includes('id="noteCount"') &&
    indexHtml.includes('id="noteResetFilters"') &&
    indexHtml.includes('id="noteViewToggle"');
  check('v16.2 notes toolbar present (search kept, filters/sort/counter added)', notesToolbar);

  const notesFns = ['function renderNoteToolbar', 'function setNoteTagFilter', 'function setNoteSort',
    'function toggleNoteViewMode', 'function resetNoteFilters', 'function toggleNoteExpand',
    'function duplicateNote', 'function copyNoteText', 'function noteHighlight',
    'function renderNoteColorRow', 'function updateNoteBodyCounter'];
  check('v16.2 notes functions present', notesFns.every(f => coreJs.includes(f)),
    notesFns.filter(f => !coreJs.includes(f)).join(', '));

  // the original note actions must still be there, the new ones are additive
  check('v16.2 note card keeps its original actions and adds new ones',
    coreJs.includes(`openNoteModal('`) && coreJs.includes('toggleNotePin(') &&
    coreJs.includes('deleteNote(') && coreJs.includes('duplicateNote(') &&
    coreJs.includes('copyNoteText(') && coreJs.includes('>📄 کپی<') && coreJs.includes('>📋 متن<'));

  check('v16.2 note cards carry colour, meta and highlighted search hits',
    coreJs.includes('--note-accent') && coreJs.includes('note-meta') &&
    coreJs.includes('noteHighlight(n.body,q)') && coreJs.includes('note-tag'));

  // ---------- v16.2: performance mode ----------
  check('v16.2 performance switch present in Settings',
    indexHtml.includes('id="settingsPerfMode"') && indexHtml.includes('⚡ پرفورمنس') &&
    indexHtml.includes('setSettingsPerfMode(this.checked)'));

  check('v16.2 performance mode kills every animation',
    v162Js.includes("'lp-perf'") && v162Js.includes('setSettingsPerfMode') &&
    appCss.includes('html.lp-perf *') && appCss.includes('animation-duration:.001ms !important') &&
    appCss.includes('transition-duration:.001ms !important') &&
    appCss.includes('backdrop-filter:none !important'));

  // the switch must survive a reload and a backup round-trip of the setting
  check('v16.2 performance mode is persisted and travels with the backup',
    v162Js.includes('localStorage.setItem(PERF_KEY') && v162Js.includes('lifePlannerPerfMode_v1') &&
    indexHtml.includes('lifePlannerPerfMode_v1') &&
    coreJs.includes("perfMode:localStorage.getItem('lifePlannerPerfMode_v1')"));

  // v21.1: the blur is gone, so every floating surface gets an opaque base and a
  // heavier dim behind it — otherwise the page shows straight through a popup.
  check('v21.1 perf mode gives popups an opaque base instead of a see-through one',
    appCss.includes('html.lp-perf .modal,\nhtml.lp-perf .toast{background-color:var(--panel2);}') &&
    appCss.includes('html.lp-perf .sheet-drawer,\nhtml.lp-perf .bottom-nav{background-color:var(--bg2);}'));
  check('v21.1 perf mode darkens the page behind every popup (dark + light theme)',
    appCss.includes('html.lp-perf .modal-bg{background:rgba(3,5,12,.88);}') &&
    appCss.includes('html.lp-perf .sheet-overlay{background:rgba(3,5,12,.8);}') &&
    appCss.includes('html[data-theme="light"].lp-perf .modal-bg{background:rgba(28,38,66,.62);}'));

  // ---------- v16.2: smoother scrolling ----------
  check('v16.2 scroll work reduced (off-screen rows, paused blur, coalesced typing)',
    appCss.includes('html.lp-scrolling .bottom-nav') &&
    appCss.includes('.pomo-history-item{content-visibility:auto') &&
    appCss.includes('.shop-inv-row{content-visibility:auto') &&
    v162Js.includes('lp-scrolling') && v162Js.includes("id === 'noteSearch'"));

  // the new file must be precached, otherwise the offline PWA loses it
  check('v16.2 script is precached by the service worker',
    /['"`]\.\/js\/v162\.js(?:\?v=[^'"`]*)?['"`]/.test(swJs) && indexHtml.includes('js/v162.js'));

  check('v16.2 strings translated for English mode',
    ['⚡ پرفورمنس', '⚡ حالت پرفورمنس (خاموش کردن انیمیشن‌ها)', '⚡ حالت پرفورمنس فعال شد',
     '🧹 پاک کردن فیلتر', '➕ اولین یادداشت رو بنویس', '📄 کپی یادداشت ساخته شد',
     '📋 متن یادداشت کپی شد', '🗂️ همه', '🔤 عنوان (الف‌با)', 'رنگ یادداشت (اختیاری)', 'بدون رنگ']
      .every(k => langJs.includes(k)));

  // the notes counter and the editor counter are built from digits + unit, so
  // both units need a plural rule for the English mode
  check('v16.2 counters translated (یادداشت / کلمه)',
    langJs.includes("یادداشت$/") && langJs.includes("'note',     'notes'") &&
    langJs.includes("کلمه$/") && langJs.includes("'word',     'words'"));

  // ---------- v16.3: quest timers, streak shield midnight protection & habits toggle ----------
  check('v16.3 quest durations & timer logic present',
    coreJs.includes('getQuestDurationMs') && coreJs.includes('failQuest') &&
    coreJs.includes('durationMin') && coreJs.includes('quest-active-countdown'));

  check('v16.3 streak shield midnight protection & toggle present',
    coreJs.includes('toggleStreakShieldActive') && coreJs.includes('checkMidnightTransition') &&
    indexHtml.includes('id="habitStreakShieldToggle"') && indexHtml.includes('id="habitShieldSection"'));

  check('v16.3 strings translated for English mode',
    ['فعال‌سازی محافظت خودکار از استریک عادت‌ها', '🛡️ محافظت Streak Shield فعال شد',
     '🛡️ محافظت Streak Shield غیرفعال شد', '⏳ مهلت انجام:', 'آماده شروع']
      .every(k => langJs.includes(k)));

  // ---------- v16.4: quest decline button (kept in v16.5) ----------
  // Pull the real function bodies out of core.js.
  const fnBody = (name) => (coreJs.match(new RegExp('function ' + name + '\\(\\)\\{[\\s\\S]*?\\n\\}')) || [''])[0];
  const failBody = fnBody('failQuest'), abandonBody = fnBody('abandonQuest'), skipBody = fnBody('skipQuest');

  check('v16.5 honest decline still costs no XP (5-minute break only)',
    abandonBody.length > 0 && !abandonBody.includes('addXP(-') && abandonBody.includes('discardQuest()'),
    `abandonBody=${abandonBody.length}`);

  // ---------- v16.5: quest expiry punished exactly like a deliberate skip ----------
  // Both paths must share one penalty helper and the normal cooldown; only the
  // honest decline keeps the short 5-minute break.
  check('v16.5 skip & expiry share one penalty helper (questSkipPenalty)',
    coreJs.includes('function questSkipPenalty') &&
    skipBody.includes('questSkipPenalty(') && failBody.includes('questSkipPenalty('),
    `skipBody=${skipBody.length} failBody=${failBody.length}`);

  check('v16.5 quest expiry deducts XP with the normal cooldown (not the 5-minute break)',
    failBody.includes('addXP(-') && failBody.includes('questCooldownMs()') &&
    !failBody.includes('discardQuest()') && !failBody.includes('questDeclineCooldownMs()'));

  check('v16.5 deliberate skip still costs XP with the normal cooldown',
    skipBody.includes('addXP(-') && skipBody.includes('questCooldownMs()'));

  check('v16.5 decline button, no-penalty hint & 5-minute cooldown present',
    coreJs.includes('QUEST_DECLINE_COOLDOWN_MIN = 5') && coreJs.includes('function discardQuest') &&
    coreJs.includes('function questDeclineCooldownMs') &&
    coreJs.includes('🚫 شرایط انجامش رو ندارم') && coreJs.includes('⏭️ ردش کن (با جریمه)') &&
    coreJs.includes('quest-actions-sub') && coreJs.includes('quest-no-penalty') &&
    appCss.includes('.quest-actions-sub') && appCss.includes('.quest-no-penalty'));

  check('v16.5 strings translated for English mode',
    ['🚫 شرایط انجامش رو ندارم', '⏭️ ردش کن (با جریمه)', '🍃 بدون جریمه — اگه شرایطش رو نداری راحت رد کن',
     '🚫 اشکالی نداره — این مأموریت بدون کسر XP رد شد', '⏰ زمان این مأموریت تموم شد — بدون کسر XP']
      .every(k => langJs.includes(k)) &&
    // the restored expiry toast reuses the v16.3 wording, translated via PATTERNS
    langJs.includes('مهلت انجام مأموریت تمام شد') && langJs.includes('Quest time expired'));

  // ---------- v16.6: calendar block description ----------
  check('v16.6 description field in the event modal + action sheet',
    indexHtml.includes('id="eDesc"') && indexHtml.includes('id="eventActionDesc"') &&
    coreJs.includes('function eventDesc') && coreJs.includes('function lpReadEventDesc') &&
    appCss.includes('.lp-ev-desc') && appCss.includes('.ev-block.has-desc'));
  check('v16.6 description kept on save, edit and drag-split',
    (coreJs.match(/id:uid\(\),title,desc,/g) || []).length === 2 && coreJs.includes('ev.desc=desc') &&
    coreJs.includes('desc:eventDesc(ev)') && (coreJs.match(/  lpFillEventDesc\(ev\);/g) || []).length === 2);
  check('v16.6 description is user content (never translated) and labels are translated',
    langJs.includes('.lp-ev-desc') && langJs.includes('توضیحات (اختیاری) — با زدن روی بلوک در تقویم نمایش داده می‌شود'));

  // ---------- v17.1: the weekly grid is blocked out 06:00 → 03:00 ----------
  check('v17.1 the day is blocked out hour by hour from 06:00 to 03:00',
    coreJs.includes('const CAL_START_HOUR=6, CAL_END_HOUR=27,') &&
    coreJs.includes('const CAL_SPAN_MIN=(CAL_END_HOUR-CAL_START_HOUR)*60') &&
    coreJs.includes('for(let h=START;h<END;h++)') && coreJs.includes('calHourLabel(h)'));

  // the grid height follows the row count instead of the old hard-coded 884px
  check('v17.1 the grid grows with the number of hour rows',
    coreJs.includes('--lp-cal-rows:${END-START}') &&
    appCss.includes('height:calc(var(--lp-cal-rows) * var(--lp-cal-px-hour))') &&
    !appCss.includes('height:884px'));

  // after-midnight hours are a visually distinct band
  check('v17.1 the after-midnight hours are marked as such',
    coreJs.includes("h>=24?' next-day':''") && coreJs.includes("h===24?' midnight':''") &&
    appCss.includes('.lp-cal-time-row.next-day') && appCss.includes('.lp-cal-hour.next-day') &&
    appCss.includes('.legend-dot-night') && indexHtml.includes('legend-dot legend-dot-night'));

  // a block can now live in the previous column's night tail, and a drop past
  // midnight has to come back as a real {day, clock time} pair
  check('v17.1 after-midnight blocks map onto the previous night\'s tail',
    coreJs.includes('function calEventPlacements') && coreJs.includes('function calNormalizeSlot') &&
    coreJs.includes('[[day,0],[(day+6)%7,CAL_DAY_MIN]]') &&
    coreJs.includes('const slot=calNormalizeSlot(toCol, gridStart);') &&
    coreJs.includes('attachEventDrag(el,e,d,shift)'));

  // times past 24:00 must wrap (01:00), never clamp to the old 23:59
  check('v17.1 times past midnight are labelled, not clamped',
    coreJs.includes('function calClockLabel') &&
    !/formatTimeMinutes\(Math\.min\(ne,1439\)\)/.test(coreJs) &&
    coreJs.includes('calClockLabel(ne)'));

  // 03:00–06:00 is the only hidden stretch, and it is announced
  check('v17.1 blocks in the undrawn 03:00–06:00 gap are announced, not lost',
    coreJs.includes('lp-cal-offgrid') && coreJs.includes('بیرون از بازهٔ نمایش تقویم') &&
    appCss.includes('.lp-cal-offgrid'));

  check('v17.1 strings translated for English mode',
    ['بلوک‌بندی ساعتی از ۶ صبح تا ۳ بامداد', 'بامداد', 'بیرون از بازهٔ نمایش تقویم',
     'هر روز ساعت‌به‌ساعت از ۶ صبح تا ۳ بامداد بلوک‌بندی شده؛ رویداد را نگه دار و بکش تا روز یا ساعتش عوض شود.',
     '🌙 هر روزِ تقویم از ۶ صبح تا ۳ بامداد بلوک‌بندی شده؛ ساعت‌های بعد از نیمه‌شب در انتهای ستونِ شبِ قبلش می‌نشینند.']
      .every(k => langJs.includes(k)) && langJs.includes('Hourly blocks from 6 AM to 3 AM'));

  // ---------- v17.2: live calendar time, dated headers and quick-add ----------
  check('v17.2 current-time line follows the minute and hour boundary',
    coreJs.includes('function updateCalendarNowMarker(now=new Date())') &&
    coreJs.includes('now.getMinutes()') && coreJs.includes('now.getSeconds()') &&
    coreJs.includes('line.style.top=position.toFixed(3)+\'px\'') &&
    coreJs.includes('function scheduleCalendarMinuteTick') && appCss.includes('.lp-cal-now-line') &&
    appCss.includes('.lp-cal-now-label'));
  check('v17.2 calendar dates, Now shortcut and quick-add slots are present',
    coreJs.includes('function calendarHeaderDate') && coreJs.includes('lp-cal-head-date') &&
    coreJs.includes('function openCalendarSlot') && coreJs.includes('data-grid-hour=') &&
    coreJs.includes('function scrollCalendarToNow') &&
    indexHtml.includes('onclick="scrollCalendarToNow()"') &&
    indexHtml.includes('روی خانه‌ی خالی بزن'));
  check('v17.2 English translations cover the new calendar labels, hints and short Jalali dates',
    ['🕒 الان', 'زمان فعلی', 'Tap to add an event at $1', 'Every day is blocked out hour by hour from 6 AM to 3 AM; hold and drag an event to move it, or tap an empty time slot to quickly add one.']
      .every(k => langJs.includes(k)) && langJs.includes('translateJalaliMonthDay'));

  // ---------- v18: day-scoped Tasks view, inbox badge and 2-button navigation ----------
  check('v18 Inbox chip has a live red count and updates after task mutations',
    indexHtml.includes('id="inboxCount"') && indexHtml.includes('chip-count-red') &&
    coreJs.includes('function inboxTaskCount()') && coreJs.includes('renderInboxBadges();') &&
    indexHtml.includes('aria-live="polite"') && coreJs.includes("ic.setAttribute('aria-label'"));
  check('v18 quick bar count options 2, 3 and 4 are all selectable',
    ['2','3','4'].every(n => indexHtml.includes(`class="chip-opt pnav-count-opt" data-count="${n}"`)) &&
    coreJs.includes("#pinnedNavCountOptions .pnav-count-opt") &&
    coreJs.includes('if(!Number.isInteger(n)||n<PINNED_NAV_MIN||n>PINNED_NAV_MAX) return;') &&
    coreJs.includes('pinnedNavCount:PINNED_VIEW_COUNT') &&
    coreJs.includes('localStorage.setItem(PINNED_NAV_COUNT_KEY,String(selected.length))'));
  check('v18 quick bar enforces the 2–4 range and keeps More when only 2 are pinned',
    coreJs.includes('const PINNED_NAV_MIN = 2;') && coreJs.includes('const PINNED_NAV_MAX = 4;') &&
    indexHtml.includes('۲» یعنی دو میان‌بر') && indexHtml.includes('id="bnavMoreBtn"'));
  check('v18 quick-bar count restores from local storage after reopening',
    coreJs.includes('function getPinnedNavCount()') &&
    coreJs.includes("localStorage.getItem(PINNED_NAV_COUNT_KEY)||'0'") &&
    coreJs.includes('let PINNED_VIEW_COUNT=getPinnedNavCount();'));
  // ---------- v20: simplification pass (dashboard / tasks / calendar) ----------
  check('v20 dashboard keeps only the greeting, quote, quest and today list',
    indexHtml.includes('id="greetTitle"') && indexHtml.includes('id="motivationText"') &&
    indexHtml.includes('id="questCard"') && indexHtml.includes('id="todayTasks"') &&
    ['dashXpLevel','donutWrap','statDone','statStreak','statGoals','statScore','habitMini','goalMini','dash-quick']
      .every(id => !indexHtml.includes(`id="${id}"`)) &&
    !indexHtml.includes('dash-quick') && !coreJs.includes("setEl('dashXp"),
    'dashboard still carries removed widgets');

  check('v20 tasks dropped the note field, the random picker and every v19 toolbar',
    !indexHtml.includes('id="tNote"') && !coreJs.includes("getElementById('tNote')") &&
    !indexHtml.includes('pickRandomTask') && !coreJs.includes('function pickRandomTask') &&
    !indexHtml.includes('v19TasksToolbar') && !indexHtml.includes('v19TaskSearch') &&
    !fs.existsSync(path.join(ROOT, 'js/v19.js')) && !fs.existsSync(path.join(ROOT, 'css/v19.css')));

  check('v20 the whole calendar day plan is removed (UI, renderers and storage UI)',
    !indexHtml.includes('calDayTasksCard') && !indexHtml.includes('calDayAddInput') &&
    !indexHtml.includes('calDayNoteInput') && !indexHtml.includes('dplan-card') &&
    !coreJs.includes('function dpStats(') && !coreJs.includes('function dpAddItem(') &&
    !coreJs.includes('function openCalDayTasks(') && !coreJs.includes('function renderCalDayTasks(') &&
    !coreJs.includes('dplan-row') && !indexHtml.includes('dplan'));

  check('v20 old day-plan data is preserved, never displayed',
    coreJs.includes("if(!db.dayPlans || typeof db.dayPlans !== 'object' || Array.isArray(db.dayPlans)) db.dayPlans = {};") &&
    !coreJs.includes('dpStore()') && !coreJs.includes('__calOpenDayISO = iso'));

  check('v20 calendar keeps one simple week switch and no agenda/templates',
    indexHtml.includes('onclick="calWeekStep(-1)"') && indexHtml.includes('onclick="calWeekStep(1)"') &&
    indexHtml.includes('onclick="calWeekToday()"') && indexHtml.includes('id="calWeekLabel"') &&
    coreJs.includes('function calWeekStep(') && coreJs.includes('let CAL_WEEK_OFFSET = 0;') &&
    /* v21.4: one week is still exactly 7 days of offset — the offset just became
       a parameter, so the Habits grid can ask for the current week. */
    coreJs.includes('function weekDates(offset=CAL_WEEK_OFFSET)') &&
    coreJs.includes('(Number(offset)||0)*7') &&
    !indexHtml.includes('v19AgendaToggle') && !indexHtml.includes('v19CalTemplates') &&
    !coreJs.includes('v19Agenda'));

  check('v20 calendar day headers are plain, non-clickable labels',
    coreJs.includes('class="lp-cal-head${thisWeek&&i===today?\' today current-day\':\'\'}"') &&
    !coreJs.includes('data-cal-head-iso') && !coreJs.includes('aria-controls="calDayTasksCard"'));

  check('v20 the UI layer is simpler and still lightweight',
    indexHtml.includes('css/v20.css') && fs.existsSync(path.join(ROOT, 'css/v20.css')) &&
    v20Css.includes('.cal-week-bar') && v20Css.includes('display:none;}      /* no decorative glow */') &&
    v20Css.includes('#view-dashboard .dash-grid{grid-template-columns:minmax(0,1fr) !important;}'));

  check('v20 week-switch labels are translated for English mode',
    ['هفته قبل', 'هفته بعد', 'این هفته'].every(k => langJs.includes(`"${k}"`)) &&
    langJs.includes('"این هفته": "This week"'));

  // ---------- v18.2: drag an event's edge to resize it on the grid ----------
  check('v18.2 edge-resize handles, live preview and apply/undo are wired in',
    coreJs.includes('function attachEventResize') && coreJs.includes('function lpBeginResize') &&
    coreJs.includes('function lpResizeMove') && coreJs.includes('function lpApplyEventResize') &&
    coreJs.includes('function lpUndoEventResize') && coreJs.includes('attachEventResize(el,e,d,shift,from,to)') &&
    coreJs.includes("if(e.target?.closest?.('.ev-resize-handle')) return;") &&
    coreJs.includes('ev-resize-handle-bottom') && coreJs.includes('ev-resize-tip') && appCss.includes('.ev-resize-grip') &&
    appCss.includes('.ev-resize-guide') && appCss.includes('cursor:ns-resize'));
  check('v18.2 resize snaps to 15 minutes, keeps 15 minutes minimum and refuses overlaps',
    coreJs.includes('function lpResizeConflict') && coreJs.includes('r.curTo-CAL_SNAP_MIN') &&
    coreJs.includes('r.curFrom+CAL_SNAP_MIN') && coreJs.includes('lpCandidateConflicts(candidate,others)') &&
    coreJs.includes('مانع این تغییر است؛ ساعت‌ها تداخل دارند'));
  check('v18.2 resizing one day of a series splits only that day, night tail included',
    coreJs.includes('ev.days=days.filter(dd=>dd!==dayIdx);') &&
    coreJs.includes("startMin: r.edge==='start' && r.curFrom!==r.origFrom ? r.curFrom-r.shift : r.origStart") &&
    coreJs.includes("endMin:   r.edge==='end' && r.curTo!==r.origTo ? r.curTo-r.shift : r.origEnd"));
  check('v18.2 keyboard resize and English strings are present',
    coreJs.includes("e.key!=='ArrowDown' && e.key!=='ArrowUp'") && coreJs.includes('lpDurationLabel') &&
    indexHtml.includes('رویداد را بکش تا جابه‌جا شود') &&
    ['لبه بالا را بکش تا ساعت شروع عوض شود', 'لبه پایین را بکش تا ساعت پایان عوض شود']
      .every(k => langJs.includes(k)) && langJs.includes('drag its top or bottom edge'));

  // ---------- v18.3: quieter, guarded resize + first-free-time quick-add ----------
  check('v18.3 edge handles are visually quiet and ignore touch jitter',
    coreJs.includes('const CAL_RESIZE_INTENT_PX=12') && coreJs.includes('Math.abs(deltaY)<CAL_RESIZE_INTENT_PX') &&
    coreJs.includes('startY:e.clientY') && appCss.includes('@media(hover:none){.ev-resize-grip{display:none;}}') &&
    appCss.includes('.ev-resize-grip{width:12px;height:2px;'));
  check('v18.3 quick-add starts at the hour or first free minute and fits the next gap',
    coreJs.includes('function calEventIntervalsInColumn') && coreJs.includes('function calQuickAddWindow') &&
    coreJs.includes('const duration=Math.min(60,available)') &&
    coreJs.includes('const addWindow=calQuickAddWindow(dayIdx,gridHour)') &&
    coreJs.includes('clientY is intentionally ignored') && indexHtml.includes('روی خانه‌ی خالی بزن'));
  check('v18.3 new calendar guidance and error translate to English',
    langJs.includes('Every day is blocked out from 6 AM to 3 AM; hold and drag an event to move it') &&
    langJs.includes('There is no free time left in this hour'));

  // ---------- v21.2: the edge is judged before it resizes, and the undo button works ----------
  check('v21.2 an edge press is judged before it becomes a resize or a move',
    coreJs.includes('function lpBeginEdgeGrab') && coreJs.includes('function lpEdgeGrabToResize') &&
    coreJs.includes('function lpEdgeGrabToMove') && coreJs.includes('function lpDragBindPointer') &&
    /* v21.8: touch gestures arm faster and with less travel (see CAL_HOLD_ARM_MS) */
    coreJs.includes('const CAL_EDGE_ARM_MS=200, CAL_EDGE_MOVE_PX=6, CAL_EDGE_SIDE_PX=6') &&
    coreJs.includes('const CAL_HOLD_ARM_MS=170, CAL_DRAG_START_PX=6') &&
    coreJs.includes('lpDragState={ drag:null, resize:null, edgeGrab:null,') &&
    coreJs.includes('// the edge runs its own gesture (lpBeginEdgeGrab)') &&
    coreJs.includes('if(lpGestureBusy()) return;') &&
    appCss.includes('.ev-block.lp-edge-armed .ev-resize-grip{display:block;') &&
    appCss.includes('@media(hover:none){.ev-resize-handle{height:9px;}}'));
  check('v21.2 the undo button is a reachable tap target inside the click-through toast',
    appCss.includes('.toast .dp-undo-btn{') &&
    /pointer-events:auto/.test(appCss.slice(appCss.indexOf('.toast .dp-undo-btn{'))) &&
    appCss.includes('max-width:min(92vw,540px)') && appCss.includes('flex-wrap:wrap') &&
    appCss.includes('.toast .dp-undo-msg{flex:1 1 auto;min-width:0;}') &&
    coreJs.includes('data-lp-undo="event"') && coreJs.includes("t.addEventListener('click'") &&
    !coreJs.includes('onclick=\\"lpUndoEventResize'));
  check('v21.2 undo is one surgical step that expires with its toast',
    coreJs.includes('function lpCaptureEventUndo') && coreJs.includes('const LP_UNDO_WINDOW_MS=8000') &&
    coreJs.includes('undo.removedIds.push(newId)') && coreJs.includes('Date.now()-rec.at>LP_UNDO_WINDOW_MS') &&
    (coreJs.match(/lpAnnounceEventChange\(/g) || []).length >= 3 &&
    !coreJs.includes('__evResizeUndo') &&
    coreJs.includes("if(lpDragState.edgeGrab){ lpEdgeGrabCleanup(lpDragState.edgeGrab); }"));
  check('v21.2 the new gesture hints and undo messages translate to English',
    langJs.includes('"لبه را نگه دار و بکش تا زمانش عوض شود"') && langJs.includes('"وسط را بکش تا جابه‌جا شود"') &&
    langJs.includes('hold its top or bottom edge for a moment') && langJs.includes('The undo window has closed') &&
    langJs.includes('There is nothing to undo') &&
    indexHtml.includes('لبهٔ بالا یا پایینش را یک لحظه نگه دار و بعد بکش') &&
    coreJs.includes('· لبه را نگه دار و بکش تا زمانش عوض شود؛ وسط را بکش تا جابه‌جا شود'));

  // ---------- v17: «مرخصی» (time off) tick on the quest card ----------
  const questBoxBody = (coreJs.match(/function renderQuestBox\(\)\{[\s\S]*?\n\}/) || [''])[0];
  const leaveBody = (coreJs.match(/function setQuestLeave\([\s\S]*?\n\}/) || [''])[0];

  // the tick is rendered in all three states of the card (active / waiting / on leave)
  check('v17 «مرخصی» tick present on the quest card',
    coreJs.includes('function questLeaveRowHtml') && coreJs.includes('id="questLeaveToggle"') &&
    coreJs.includes('toggleQuestLeave(this.checked)') && coreJs.includes('🌴 مرخصی') &&
    (coreJs.match(/\$\{questLeaveRowHtml\(\)\}/g) || []).length === 3 &&
    appCss.includes('.quest-leave-row') && appCss.includes('.quest-box-leave'),
    `rows=${(coreJs.match(/\$\{questLeaveRowHtml\(\)\}/g) || []).length}`);

  // the guard runs before anything else in the ticker, so no quest can slip through
  check('v17 no quest is generated while «مرخصی» is ticked',
    coreJs.includes('function questLeaveOn') && questBoxBody.includes('if(questLeaveOn()){') &&
    questBoxBody.indexOf('if(questLeaveOn()){') < questBoxBody.indexOf('generateQuest()'),
    `body=${questBoxBody.length}`);

  // it is a pause, never a punishment — and it is remembered like every setting
  check('v17 «مرخصی» never costs XP and is remembered (reload + backup)',
    leaveBody.length > 0 && !leaveBody.includes('addXP(') &&
    leaveBody.includes('DB.quest.leave = on') && leaveBody.includes('questDeclineCooldownMs()') &&
    leaveBody.includes('save()') &&
    (coreJs.match(/DB\.quest\.leave = false;/g) || []).length === 2,
    `body=${leaveBody.length}`);

  check('v17 strings translated for English mode',
    ['🌴 مرخصی', 'تیک بزنی، دیگه کوئست نمیاد', '🍃 توی مرخصی هیچ XP ای کم نمی‌شه',
     '🌴 مرخصی فعال شد — تا تیکش رو برنداری کوئستی نمیاد',
     '🎯 مرخصی تموم شد — کوئست بعدی تا ۵ دقیقه دیگه میاد',
     'کوئست‌ها متوقف شدن — هر وقت خواستی تیک «مرخصی» رو بردار تا دوباره شروع بشن.']
      .every(k => langJs.includes(k)) && langJs.includes('Time off'));

  // all five themes must still be defined in both JS and CSS.
  // "dark" is the default theme: its variables live in the plain :root block.
  const themeIds = ['dark', 'light', 'neonPurple', 'fireSunset', 'legendaryGold'];
  check('all 5 themes still defined',
    themeIds.every(t => coreJs.includes(`${t}:`) &&
      (t === 'dark' ? /:root\{/.test(appCss) : appCss.includes(`html[data-theme="${t}"]`))));

  // kept from earlier versions — these must not regress
  check('inbox quick-add modal present', indexHtml.includes('inboxQuickModalBg'));
  check('status sorting present', coreJs.includes('STATUS_ORDER') && coreJs.includes('inprogress:0'));
  check('reward display fixed', coreJs.includes('reward-grid') && appCss.includes('reward-grid'));

  // ---------- v20.1: a release can never hide behind a stale cache ----------
  const assetRefs = [...indexHtml.matchAll(/(?:src|href)="((?:css|js)\/[^"]+)"/g)].map(m => m[1]);
  check('v20.1 every local CSS/JS asset is requested with its version',
    assetRefs.length >= 9 && assetRefs.every(u => /\?v=\d/.test(u)),
    assetRefs.filter(u => !/\?v=\d/.test(u)).join(', '));

  const assetVer = (indexHtml.match(/[?&]v=([\d.]+)/) || [])[1];
  check('v20.1 the service worker is network-first for code and cache-first for media',
    assetVer && swJs.includes(`const VERSION = '${assetVer}';`) &&
    swJs.includes('const CACHE_NAME') && swJs.includes("cache: 'no-store'") &&
    swJs.includes("cache: 'reload'") && swJs.includes('isFreshFirst') &&
    swJs.includes('caches.keys()') && swJs.includes('self.skipWaiting()') &&
    swJs.includes("self.clients.claim()"));

  check('v20.1 the worker cache list carries the same version query as the page',
    /`\.\/js\/core\.js\?v=\$\{VERSION\}`/.test(swJs) &&
    /`\.\/css\/v20\.css\?v=\$\{VERSION\}`/.test(swJs));

  check('v20.1 a new build reloads the app once, by itself',
    swJsRegister.includes("updateViaCache: 'none'") &&
    swJsRegister.includes("controllerchange") && swJsRegister.includes('lpForceUpdate') &&
    swJsRegister.includes('15 * 60 * 1000') &&
    coreJs.includes('window.lpForceUpdate'));

  // ---------- v21: «کیبورد آرام» — plain keyboard, no self-focus ----------
  const v21JsSrc = fs.readFileSync(path.join(ROOT, 'js/v21.js'), 'utf-8');
  const v21Tags = [...indexHtml.matchAll(/<(input|textarea)\b[^>]*>/g)].map(m => m[0]).filter(t => {
    if (t.startsWith('<textarea')) return true;
    const type = ((t.match(/type="([^"]+)"/) || [ , 'text'])[1]).toLowerCase();
    return ['text','search','number','email','tel','url','password','date','time'].includes(type);
  });
  check('v21 every typing field asks the browser for a plain keyboard',
    v21Tags.length >= 20 && v21Tags.every(t => t.includes('autocomplete="off"') && t.includes('spellcheck="false"')),
    `${v21Tags.filter(t => !t.includes('autocomplete="off"')).length}/${v21Tags.length} missing`);
  check('v21 the app is form-free and no sheet focuses a field by itself',
    !/<form\b/i.test(indexHtml) &&
    !/getElementById\('(tTitle|inboxTitle|nTitle|eTitle)'\)[^;]{0,40}\.focus\(\)/.test(coreJs) &&
    v21JsSrc.includes('HTMLElement.prototype.focus') && /js\/v21\.js\?v=\d/.test(indexHtml));

  // ---------- v21.3: «راهنمای سه بخش» — guides, one-time hints and the three-step card ----------
  const v213Js = fs.readFileSync(path.join(ROOT, 'js/v213.js'), 'utf-8');
  const v213Css = fs.readFileSync(path.join(ROOT, 'css/v213.css'), 'utf-8');

  check('v21.3 every simplified section carries its own ❓ into one shared guide',
    ['dashboard', 'tasks', 'calendar', 'habits', 'goals', 'notes']
      .every(v => indexHtml.includes(`onclick="openGuide('${v}')"`)) &&
    indexHtml.includes('id="guideSlot-dashboard"') && indexHtml.includes('id="guideSlot-tasks"') &&
    indexHtml.includes('id="guideModalBg"') && indexHtml.includes('id="guideTabs"') &&
    indexHtml.includes('id="guideCta"') && indexHtml.includes('onclick="guidePrimaryAction()"'));

  check('v21.3 one guide modal holds one panel per section, four short rows each',
    ['dashboard', 'tasks', 'calendar', 'habits', 'goals', 'notes']
      .every(g => indexHtml.includes(`data-g="${g}" role="tabpanel"`)) &&
    (indexHtml.match(/class="guide-row"/g) || []).length === 40 &&
    (indexHtml.match(/class="guide-lead"/g) || []).length === 10 &&
    /var SECTIONS = \['dashboard', 'tasks', 'calendar', 'habits', 'goals', 'notes',[\s\S]{0,80}?'pomodoro', 'shop', 'skills', 'boss'\];/.test(v213Js));

  check('v21.3 each guide ends in the action it explains, not in more reading',
    ['openInboxQuickAdd', 'openTaskModal', 'openEventModal', 'openHabitModal', 'openGoalModal', 'openNoteModal']
      .every(fn => v213Js.includes(`fn: '${fn}'`)) &&
    v213Js.includes('function guidePrimaryAction') && v213Js.includes('closeGuide();'));

  check('v21.3 a first visit gets a slim hint that is gone for good',
    v213Js.includes("'lifePlannerGuides_v213'") && v213Js.includes('function markSeen') &&
    /var HINTED = \{[\s\S]{0,220}?pomodoro: true, shop: true, skills: true, boss: true/.test(v213Js) &&
    v213Js.includes('data-hint-x') && v213Js.includes('function clearSlot') &&
    /* a hint is never a popup: nothing in this file opens a modal by itself */
    !/openModal\('(?!guideModalBg)/.test(v213Js));

  check('v21.3 the three-step card only ever appears on an empty account and retires itself',
    v213Js.includes('function isEmptyAccount') &&
    v213Js.includes("['tasks', 'habits', 'goals', 'notes', 'events']") &&
    v213Js.includes('function quickStartWanted') && v213Js.includes('سه قدم اول') &&
    v213Js.includes("state.qs = 'off'") && v213Js.includes('data-qs-go') &&
    v213Js.includes('function quickSteps') && v213Js.includes('function quickStartDismiss'));

  check('v21.3 the calendar intro shrank to one line and its long text moved into the guide',
    indexHtml.includes('رویداد را بکش تا جابه‌جا شود؛ لبه‌اش را نگه دار تا مدتش عوض شود.') &&
    indexHtml.includes('لبهٔ بالا یا پایینش را یک لحظه نگه دار و بعد بکش تا مدتش کم‌وزیاد شود. روی خانه‌ی خالی بزن تا رویداد جدید بسازی.') &&
    /calendar-intro-copy"><span class="calendar-spark">✦<\/span><div><span>[^<]{0,90}<\/span>/.test(indexHtml));

  /* Only the title is required — every other field of the task sheet says so. */
  const taskSheet = indexHtml.split('id="taskModalBg"')[1].split('id="inboxQuickModalBg"')[0];
  check('v21.3 the task sheet says out loud that only the title is needed',
    ['دسته‌بندی', 'ددلاین اول', 'اولویت', 'وضعیت', 'زمان تخمینی (دقیقه)'].every(label =>
      taskSheet.includes(`<label>${label} <span style="color:var(--txt-dim2); font-weight:500;">(اختیاری)</span></label>`)) &&
    taskSheet.includes('<label>عنوان تسک</label>') &&
    langJs.includes('"(اختیاری)": "(optional)"'));

  check('v21.3 the quote card shows one control instead of two',
    !indexHtml.includes('motivation-custom-actions') && !appCss.includes('.motivation-custom-actions{') &&
    /id="moodPicker"[\s\S]{0,900}openCustomMotivationComposer\(\)/.test(indexHtml) &&
    v213Css.includes('#moodPicker .btn') &&
    coreJs.includes('function toggleMoodPicker()'));

  check('v21.3 an empty category row leaves no hole above the task list',
    v213Css.includes('#categoryFilters:empty{display:none;}'));

  check('v21.3 the guides are reachable from Settings and can be brought back',
    indexHtml.includes('❓ راهنمای بخش‌ها') && indexHtml.includes('onclick="lpResetGuides()"') &&
    v213Js.includes('window.lpResetGuides') && v213Js.includes('window.lpGuide'));

  check('v21.3 the new files ship with the page and with the worker cache',
    fs.existsSync(path.join(ROOT, 'js/v213.js')) && fs.existsSync(path.join(ROOT, 'css/v213.css')) &&
    /js\/v213\.js\?v=\d/.test(indexHtml) && /css\/v213\.css\?v=\d/.test(indexHtml) &&
    /`\.\/js\/v213\.js\?v=\$\{VERSION\}`/.test(swJs) &&
    /`\.\/css\/v213\.css\?v=\$\{VERSION\}`/.test(swJs));

  // ---------- v21.4: three more guided sections + the tidy-up of habits / goals / notes ----------
  const v214Sections = ['habits', 'goals', 'notes'];
  check('v21.4 habits, goals and notes carry the same single ❓, slot and panel',
    v214Sections.every(v => indexHtml.includes(`onclick="openGuide('${v}')"`) &&
      indexHtml.includes(`id="guideSlot-${v}"`) && indexHtml.includes(`data-g="${v}" role="tab"`)) &&
    (indexHtml.match(/class="guide-btn"/g) || []).length === 9 &&
    (indexHtml.match(/onclick="openGuide\('/g) || []).length === 20 &&
    v213Js.includes("habits: { label: '➕ عادت جدید', fn: 'openHabitModal' }") &&
    v213Js.includes("goals: { label: '➕ هدف جدید', fn: 'openGoalModal' }") &&
    v213Js.includes("notes: { label: '➕ یادداشت جدید', fn: 'openNoteModal' }"));

  check('v21.4 the guide engine grew data, not files, layers or storage keys',
    v213Js.includes("'lifePlannerGuides_v213'") &&
    /* v21.7: the stored state is built from SECTIONS, so it grew by itself */
    v213Js.includes('SECTIONS.forEach(function (s) { seen[s] = 0; });') &&
    ['فقط خانه‌ی امروز را تیک بزن؛ استریک و XP خودش می‌آید.',
     'یک هدف بساز و هر روز با +۲٪ یا +۱۰٪ جلویش ببر — همین.',
     'یک عنوان بنویس و ذخیره کن؛ برچسب و رنگ و سنجاق همه اختیاری‌اند.']
      .every(h => v213Js.includes(h)) &&
    !fs.existsSync(path.join(ROOT, 'js/v214.js')) && !fs.existsSync(path.join(ROOT, 'css/v214.css')));

  check('v21.4 the guides in Settings grew with the sections',
    /* v21.7: the sentence no longer lists the sections one by one — there are ten */
    indexHtml.includes('راهنمای کوتاهِ هر ده بخشِ برنامه. داخل خود هر بخش هم با دکمه‌ی ❓ باز می‌شود.') &&
    langJs.includes('"راهنمای کوتاهِ هر ده بخشِ برنامه. داخل خود هر بخش هم با دکمه‌ی ❓ باز می‌شود."'));

  check('v21.4 every new string has an English translation',
    ['راهنمای عادت‌ها', 'راهنمای اهداف', 'راهنمای یادداشت‌ها', 'عادت جدید', 'هدف جدید', 'یادداشت جدید',
     'خانه‌ی امروز', 'استریک و XP', 'چهار دکمه روی کارت', 'پیشرفتِ امروز جدا ثبت می‌شود', 'پاداش و روز عالی',
     'جست‌وجو و برچسب', 'سنجاق و ترتیب', 'کارت‌ها', '🗑️ عادت حذف شد', '🗑️ هدف حذف شد',
     'تغییر به نمای لیستی', 'تغییر به نمای شبکه‌ای']
      .every(k => langJs.includes(`"${k}":`)) &&
    langJs.includes('var EXTRA_V214 = {') && langJs.includes('EXACT[_k214] = EXTRA_V214[_k214];') &&
    ['Habits guide', 'Goals guide', 'Notes guide', '🗑️ Habit deleted', '🗑️ Goal deleted',
     'Switch to the list view', 'Switch to the grid view']
      .every(en => langJs.includes(en)));

  /* Comments in core.js name the removed functions on purpose (they say why the
     code is gone), so these two assertions read the code with comments stripped. */
  const coreCode = coreJs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  check('v21.4 the dead chart layer is out and the living Pomodoro chart stayed',
    ['function renderCharts', 'function drawLineChart', 'function drawDoughnut', 'function drawHBarChart',
     'chartHabits', 'chartGoals', 'chartPriority']
      .every(dead => !coreCode.includes(dead) && !indexHtml.includes(dead)) &&
    ['function drawBarChart', 'drawBarChart(canvas', 'function setupCanvas', 'function roundRect',
     'function last7', 'function cssVar']
      .every(alive => coreJs.includes(alive)));

  check('v21.4 the leftovers of the old dashboard tiles and the hidden shield picker are gone',
    ['renderHabitMini', 'renderGoalMini', 'hShieldHabits', 'streakShieldHabits', 'streakShieldArmedAt',
     "logHistory('habits'", 'shield-habit-options']
      .every(dead => !coreCode.includes(dead) && !indexHtml.includes(dead) && !appCss.includes(dead)) &&
    coreJs.includes('DB.history[d] = DB.history[d] || {tasks:0};') &&
    !coreJs.includes('{tasks:0, habits:0}'));

  check('v21.4 the habit week grid belongs to the habits, not to the calendar’s week switch',
    coreJs.includes('function weekDates(offset=CAL_WEEK_OFFSET)') &&
    coreJs.includes('sat.setDate(now.getDate() - dayOfWeek + (Number(offset)||0)*7);') &&
    /function renderHabits\(\)\{[\s\S]{0,200}?weekDates\(0\)/.test(coreJs) &&
    /function renderCalendar\(\)[\s\S]{0,2000}?weekDates\(\)/.test(coreJs));

  check('v21.4 a habit pays its 6 XP once a day, not on every re-tick',
    coreJs.includes('if(h.rewardDate !== date){ h.rewardDate = date; addXP(6); }') &&
    !/toggleHabitDay[\s\S]{0,400}?addXP\(6\); logHistory/.test(coreJs));

  check('v21.4 all four deletes ask the same question and then say what happened',
    ['این تسک حذف بشه؟', 'این یادداشت حذف بشه؟', 'این عادت حذف بشه؟', 'این هدف حذف بشه؟']
      .every(q => coreJs.includes(`confirm('${q}')`)) &&
    coreJs.includes("toast('🗑️ عادت حذف شد')") && coreJs.includes("toast('🗑️ هدف حذف شد')"));

  check('v21.4 streaks and goal percentages use the app’s own digits',
    coreJs.includes('${toFaDigits(streak)} روز پیاپی') && coreJs.includes('${toFaDigits(g.progress)}٪') &&
    coreJs.includes('function toFaDigits(n)'));

  check('v21.4 the notes layout button reports the view you are in and the one a tap leads to',
    coreJs.includes("vt.textContent=asList?'☰':'▦'") && coreJs.includes("vt.title='تغییر به '+next;") &&
    coreJs.includes("vt.setAttribute('aria-pressed',asList?'true':'false');") &&
    indexHtml.includes('id="noteViewToggle"'));

  const readmeGoals = readme.split('### 6. 🎯')[1].split('### 7. 📝')[0];
  check('v21.4 the README describes what the app really does',
    !readmeGoals.includes('Milestones') && !readmeGoals.includes('نقاط عطف') &&
    readme.includes('نسخه 21.4') &&
    readme.includes('راهنمای شش بخش') && readme.includes('۶ XP') &&
    readme.includes('دکمه‌ی نما وضعیت را نشان می‌دهد'));


  // ---------- v21.7: ten guided sections + the tidy-up of the last four ----------
  const pomoJs = fs.readFileSync(path.join(ROOT, 'js/pomodoro.js'), 'utf-8');
  const v215Sections = ['pomodoro', 'shop', 'skills', 'boss'];

  check('v21.7 the last four sections carry the same single ❓, slot, tab and panel',
    v215Sections.every(v => indexHtml.includes(`onclick="openGuide('${v}')"`) &&
      indexHtml.includes(`id="guideSlot-${v}"`) && indexHtml.includes(`data-g="${v}" role="tab"`) &&
      indexHtml.includes(`data-g="${v}" role="tabpanel"`)) &&
    (indexHtml.match(/class="guide-btn"/g) || []).length === 9 &&
    (indexHtml.match(/onclick="openGuide\('/g) || []).length === 20 &&
    (indexHtml.match(/data-g="/g) || []).length === 20 &&
    v213Js.includes("pomodoro: '📖 راهنمای پومودورو'") && v213Js.includes("shop: '📖 راهنمای XP Shop'") &&
    v213Js.includes("skills: '📖 راهنمای درخت مهارت'") && v213Js.includes("boss: '📖 راهنمای باس هفتگی'"));

  check('v21.7 the guide engine still grew data, not files, layers or storage keys',
    v213Js.includes("'lifePlannerGuides_v213'") &&
    ['pomodoro: true, shop: true, skills: true, boss: true'].every(h => v213Js.includes(h)) &&
    ['فقط «▶️ شروع» را بزن؛ دور، استراحت و XP خودش می‌آید.',
     'موجودی XP Shop از نوارِ سطح جداست — خرج کردنش لولت را کم نمی‌کند.',
     'هر لول‌آپ ۱ امتیاز مهارت می‌دهد؛ یک تیر بخر و اثرش را همان لحظه ببین.',
     'یک اسم بنویس و چند تسک انتخاب کن؛ هر تیک یک ضربه به باس است.']
      .every(h => v213Js.includes(h)) &&
    !fs.existsSync(path.join(ROOT, 'js/v215.js')) && !fs.existsSync(path.join(ROOT, 'css/v215.css')));

  check('v21.7 a guide action is the section’s own action, and the boss one follows the data',
    v213Js.includes("pomodoro: { label: '▶️ شروع جلسه‌ی فوکوس', fn: 'pomoQuickStart' }") &&
    v213Js.includes("shop: { label: '🎁 شانس‌های جعبه', fn: 'openMysteryInfo' }") &&
    v213Js.includes("window.showView('shop')") &&
    v213Js.includes("call(active ? 'startEditBoss' : 'openBossSetup')") &&
    v213Js.includes("return (db && db.boss && db.boss.active) ? '✏️ ویرایش باس' : '⚔️ ساخت باس';"));

  check('v21.7 the live countdown notification is gone and the three real ones stayed',
    ['startLivePomoNotification', 'pushLivePomoNotification', 'stopLivePomoNotification',
     'LIVE_NOTIFY_TAG', 'liveNotifyTimer', 'lastLiveNotifyBody', 'livePomoNotifyBody']
      .every(dead => !pomoJs.includes(dead)) &&
    !/setInterval\(pushLive/.test(pomoJs) &&
    (pomoJs.match(/sendNotification\(/g) || []).length === 5 &&
    ['🍅 فوکوس شروع شد', '☕ استراحت کوتاه شروع شد', '✅ جلسه ثبت شد',
     '🎉 دور پومودورو کامل شد!', '☕ استراحت کامل شد'].every(t => pomoJs.includes(t)));

  check('v21.7 the notification card is a real control instead of a fixed claim',
    indexHtml.includes('id="pomoNotifyToggle"') &&
    indexHtml.includes('onchange="togglePomoNotifications(this.checked)"') &&
    coreJs.includes('function togglePomoNotifications(on)') &&
    coreJs.includes("el.textContent = !allowed") &&
    !indexHtml.includes('🔔 نوتیفیکیشن هوشمند فعاله') && !pomoJs.includes('🔔 نوتیفیکیشن هوشمند فعاله') &&
    !langJs.includes('🔔 نوتیفیکیشن هوشمند فعاله') &&
    indexHtml.includes('اعلانِ دائمیِ شمارش معکوس حذف شده تا مزاحم نباشد.'));

  check('v21.7 «کوئست سریع» grew to five tiers and the wait really drops to 15 minutes',
    /name:'کوئست سریع'[\s\S]{0,140}?maxTier:5/.test(coreJs) &&
    coreJs.includes('(از ۲۰ به ۱۵ دقیقه)') && !coreJs.includes('۲۰ به ۱۷ دقیقه') &&
    coreJs.includes('const QUEST_COOLDOWN_MIN = 20;') && coreJs.includes('const QUEST_COOLDOWN_STEP_MIN = 1;') &&
    coreJs.includes('Math.max(5, QUEST_COOLDOWN_MIN - tier*QUEST_COOLDOWN_STEP_MIN)') &&
    langJs.includes('"هر تیر ۱ دقیقه از زمان انتظار کوئست بعدی کم می‌کنه (از ۲۰ به ۱۵ دقیقه)":') &&
    readme.includes('در ۵ تیر (از ۲۰ به ۱۵ دقیقه)'));

  check('v21.7 the boss picker builds its own task and selects it for the fight',
    indexHtml.includes('id="bossNewTaskInput"') && indexHtml.includes('onclick="addBossTaskInline()"') &&
    coreJs.includes('function addBossTaskInline()') &&
    /addBossTaskInline\(\)\{[\s\S]{0,900}?DB\.tasks\.push\(t\);[\s\S]{0,200}?bossSetupSelected\.push\(t\.id\);[\s\S]{0,200}?renderBossTaskPicker\(\);/.test(coreJs) &&
    /inbox:false, color:null/.test(coreJs) &&
    coreJs.includes('تسک انجام‌نشده‌ای نداری — همین پایین یکی بساز') &&
    /openBossSetup\(\)\{[\s\S]{0,500}?bossNewTaskInput/.test(coreJs) &&
    /startEditBoss\(\)\{[\s\S]{0,600}?bossNewTaskInput/.test(coreJs) &&
    appCss.includes('.boss-new-task{'));

  check('v21.7 counts, prices, HP and skill points read in the app’s own digits',
    coreJs.includes('function faNum(n)') &&
    coreJs.includes('faNum(DB.xpWallet)') && coreJs.includes("faNum(applyShopDiscount(100))+' XP'") &&
    coreJs.includes('${toFaDigits(count)}/${toFaDigits(STREAK_SHIELD_WEEKLY_LIMIT)}') &&
    coreJs.includes('${faNum(b.hp)} / ${faNum(b.maxHp)} HP') &&
    coreJs.includes('ptsEl.textContent = faNum(DB.skillPoints)') &&
    coreJs.includes('return `${toFaDigits(days)} روز و ${toFaDigits(hours)} ساعت`;') &&
    coreJs.includes('${toFaDigits(pct.toFixed(2))}٪') &&
    pomoJs.includes('const fa = (n) =>') && pomoJs.includes('دقیقه ${fa(currentSession)} از ${fa(cycleCount)}') &&
    pomoJs.includes('`${fa(h)} ساعت و ${fa(remM)} دقیقه`') &&
    /* clock faces stay Latin on purpose — they are timers, not counts */
    pomoJs.includes("String(mm).padStart(2,'0')") || coreJs.includes("String(mm).padStart(2,'0')"));

  check('v21.7 the Pomodoro stats speak with one voice and write each number once',
    /renderStatsTools\(\)\{[\s\S]{0,2600}?<div class="card">[\s\S]{0,60}?<div class="card-head"><h3>📈 جمع‌بندی فوکوس<\/h3>/.test(pomoJs) &&
    !/renderStatsTools\(\)\{[\s\S]{0,2600}?pomo-v66-card/.test(pomoJs) &&
    pomoJs.includes('${formatPomoTimeFa(totalMins)}') && pomoJs.includes('${formatPomoTimeFa(avgDailyMins)}') &&
    !pomoJs.includes('(${x.minutes}m)') && !coreJs.includes('(${totalFocus}m)') &&
    ['مجموع فوکوس', 'جلسات کامل', 'میانگین کیفیت', 'استریک روزانه', 'میانگین فوکوس روزانه']
      .every(l => pomoJs.includes(l)) &&
    appCss.includes('.pomo-stat-mini .n.dur{') &&
    langJs.includes('"📈 جمع‌بندی فوکوس": "📈 Focus summary"') &&
    langJs.includes('"🕘 تاریخچه‌ی جلسات اخیر"'));

  check('v21.7 one setting, one truth: the preset grid follows the ⚙️ tab',
    /savePomoSettings\(\)\{[\s\S]{0,1200}?window\.syncPomoPresetFromSettings/.test(coreJs) &&
    pomoJs.includes('function syncPresetFromSettings()') &&
    pomoJs.includes('window.syncPomoPresetFromSettings = syncPresetFromSettings;') &&
    pomoJs.includes("PRESETS.find(x => x.id !== 'custom' && x.focus === f && x.break === b)"));

  /* The header comment of pomodoro.js names what was removed on purpose (it says
     why the code is gone), so these assertions read it with comments stripped. */
  const pomoCode = pomoJs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  check('v21.7 the dead code is out and the two one-second loops became one',
    !pomoCode.includes('window.tickPomo = function') && !pomoCode.includes('const oldTick') &&
    !pomoCode.includes('fullscreenchange') && !pomoCode.includes('focusFullscreenRequested') &&
    ['oldStartFocus', 'oldStartBreak', 'oldEnd ', 'oldComplete'].every(d => !pomoCode.includes(d)) &&
    /* the single UI loop now paints the badge *and* the Focus Mode overlay */
    /setInterval\(\(\)=>\{\s*try\{\s*const ov = document\.getElementById\('pomo66FocusOverlay'\);/.test(pomoJs) &&
    !coreCode.includes('getManualPomoTotal') && !coreCode.includes('deleteManualPomoData') &&
    !coreCode.includes('skillTierCost') && !coreCode.includes('همگام شد') &&
    coreJs.includes('const SKILL_TIER_COST = 1;'));

  check('v21.7 the Pomodoro dates read the way the rest of the app reads them',
    pomoJs.includes('function jalaliOrIso(iso)') &&
    pomoJs.includes('${esc(jalaliOrIso(x.date))}') && pomoJs.includes('${esc(jalaliOrIso(t.date))}') &&
    coreJs.includes('${isoToJalaliText(x.date)||x.date}') && !pomoCode.includes('${esc(x.date)}'));

  check('v21.7 the data nothing ever read is no longer written',
    !pomoJs.includes('t.pomodoroMinutes') && !pomoJs.includes('t.lastPomodoroAt') &&
    pomoJs.includes('if(t) t.pomodorosCount = (t.pomodorosCount || 0) + 1;') &&
    pomoJs.includes('if(DB.pomodoro.presets) delete DB.pomodoro.presets;') &&
    !pomoJs.includes('DB.pomodoro.presets = PRESETS.map') &&
    /* the legacy migration is one remembered pass, not a scan on every boot */
    coreJs.includes('if(DB.pomodoro?.manualMigrated) return;') &&
    coreJs.includes('DB.pomodoro.manualMigrated = true;') &&
    !/addManualPomoData\(\)\{[\s\S]{0,600}?migrateLegacyManualPomoData\(\)/.test(coreJs));

  check('v21.7 every new string has an English translation',
    ['راهنمای پومودورو', 'راهنمای XP Shop', 'راهنمای درخت مهارت', 'راهنمای باس هفتگی',
     'تایمر و جلسه‌ها', 'دور و استراحت', 'حالت‌ها، تسک و صدا', 'آمار و XP', 'موجودیِ جدا',
     'بوست و جعبه‌ی شانس', 'سپر استریک', 'تم‌ها و دارایی‌ها', 'امتیاز از کجا می‌آید', 'هفت مهارت',
     'تیرها', 'اثرِ فوری', 'ساختِ باس', 'HP و ضربه', 'مهلتِ ۱۴ روزه', 'ویرایش و حذفِ تسک',
     '➕ ساخت تسک', 'اعلان‌های پومودورو', '🔔 اعلان‌ها', '🔔 فعال‌سازی اعلان', 'مجموع فوکوس']
      .every(k => langJs.includes(`"${k}":`)) &&
    langJs.includes('var EXTRA_V215 = {') && langJs.includes('EXACT[_k215] = EXTRA_V215[_k215];') &&
    ['Pomodoro guide', 'XP Shop guide', 'Skill tree guide', 'Weekly boss guide', 'A separate balance',
     'Seven skills', 'The 14-day deadline', '➕ Create task', 'Total focus']
      .every(en => langJs.includes(en)) &&
    /* keys whose string no longer exists anywhere were taken out with it */
    ['"همگام شد"', '"🍅 تایمر پومودورو"', '"⛔ نوتیفیکیشن فعال نیست"', '"🔔 نوتیفیکیشن"']
      .every(dead => !langJs.includes(dead)));

  const readmePomo = readme.split('### 2. 🍅')[1].split('### 3. 🎮')[0];
  const readmeGuides = readme.split('### 9. 📖')[1].split('## 🏗️')[0];
  check('v21.7 the README describes what the app really does',
    readme.includes('نسخه 21.7') && readme.includes('راهنمای ده بخش') &&
    !readmePomo.includes('اعلان‌های معکوس زنده') &&
    readmePomo.includes('اعلان‌ها فقط سه‌جا می‌آیند') && readmePomo.includes('کلید روشن/خاموش اعلان‌ها') &&
    readmeGuides.includes('پومودورو، XP Shop، درخت مهارت و باس هفتگی') &&
    readmeGuides.includes('هر ده راهنما') &&
    readme.includes('ساختِ تسک داخل صفحه‌ی باس') && readme.includes('life-planner-cache-v88'));

  const v213CssCode = v213Css.replace(/\/\*[\s\S]*?\*\//g, '');   /* comments may talk about blur */
  check('v21.3 the guide layer stays cheap: no blur, no animation on layout',
    !v213CssCode.includes('backdrop-filter') && !v213CssCode.includes('@keyframes') &&
    v213Css.includes('html.lp-perf') && v213Css.includes('.guide-slot:empty{display:none;}'));

  check('v21.3 every new string translates to English',
    ['"راهنمای داشبورد"', '"راهنمای تسک‌ها"', '"❓ راهنمای بخش‌ها"', '"سه قدم اول"', '"یه کار بنویس"',
     '"تیکش بزن"', '"تو تقویم جاش بده"', '"✅ انجام شد"', '"مأموریت روزانه"', '"برنامه‌ی امروز"',
     '"چهار تب"', '"جابه‌جایی و تغییر مدت"', '"📥 اینباکس سریع"']
      .every(k => langJs.includes(k)) &&
    ['Dashboard guide', 'Tasks guide', 'Section guides', 'the first three steps', 'Write down one task',
     'Tick it off', 'Give it a place in the calendar', 'Quick Inbox', 'Daily quest']
      .every(en => langJs.includes(en)));

  // The release version has to move consistently in the app, package metadata, docs and cache.
  const coreVer = (coreJs.match(/const LP_APP_VERSION='([^']+)'/) || [])[1];
  const cacheVer = (swJs.match(/life-planner-cache-v(\d+)/) || [])[1];
  const settingsVer = (indexHtml.match(/id="settingsVersion">([^<]+)</) || [])[1];
  const versionAligned =
    coreVer === versionJson.version &&
    pkgJson.version === coreVer + '.0' &&
    pkgLockJson.version === pkgJson.version &&
    pkgLockJson.packages?.['']?.version === pkgJson.version &&
    settingsVer === coreVer &&
    readme.includes(`badge/نسخه-${coreVer}-`) &&
    readme.includes(`نسخه ${coreVer}`) &&
    readme.includes(`const CACHE_NAME = 'life-planner-cache-v${cacheVer}';`);
  check('version bumped consistently across app, package, docs and cache', versionAligned,
    `core=${coreVer} json=${versionJson.version} pkg=${pkgJson.version} lock=${pkgLockJson.version} ui=${settingsVer} cache=v${cacheVer}`);
}

server.close();
console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
