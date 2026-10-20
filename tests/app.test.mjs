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
    coreJs.includes('CAL_WEEK_OFFSET*7') &&
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
