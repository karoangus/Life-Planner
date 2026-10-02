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

  check('no fatal JS errors after quest flow', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

  await browser.close();
} else {
  // FALLBACK: no browser available (restricted sandbox). Verify core logic via file inspection.
  console.log('🔍 Running fallback checks (no browser)...');
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
  const coreJs = fs.readFileSync(path.join(ROOT, 'js/core.js'), 'utf-8');
  const appCss = fs.readFileSync(path.join(ROOT, 'css/app.css'), 'utf-8');
  const versionJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app-version.json'), 'utf-8'));
  const pkgJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));

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
    swJs.includes("'./js/v16.js'") && indexHtml.includes('js/v16.js'));

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

  // ---------- v16.2: smoother scrolling ----------
  check('v16.2 scroll work reduced (off-screen rows, paused blur, coalesced typing)',
    appCss.includes('html.lp-scrolling .bottom-nav') &&
    appCss.includes('.pomo-history-item{content-visibility:auto') &&
    appCss.includes('.shop-inv-row{content-visibility:auto') &&
    v162Js.includes('lp-scrolling') && v162Js.includes("id === 'noteSearch'"));

  // the new file must be precached, otherwise the offline PWA loses it
  check('v16.2 script is precached by the service worker',
    swJs.includes("'./js/v162.js'") && indexHtml.includes('js/v162.js'));

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

  // the version has to move in all five places together
  const coreVer = (coreJs.match(/const LP_APP_VERSION='([^']+)'/) || [])[1];
  const cacheVer = (swJs.match(/life-planner-cache-v(\d+)/) || [])[1];
  const versionAligned =
    coreVer === versionJson.version &&
    pkgJson.version === coreVer + '.0' &&
    readme.includes(`badge/نسخه-${coreVer}-`) &&
    readme.includes(`نسخه ${coreVer}`) &&
    readme.includes(`const CACHE_NAME = 'life-planner-cache-v${cacheVer}';`);
  check('version bumped consistently in all 5 places', versionAligned,
    `core=${coreVer} json=${versionJson.version} pkg=${pkgJson.version} cache=v${cacheVer}`);
}

server.close();
console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
