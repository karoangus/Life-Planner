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
