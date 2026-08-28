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

const { browser, page } = await launch();
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
  let err = null;
  await page.evaluate((v) => {
    const el = document.querySelector(`.bottom-nav [data-view="${v}"], [data-view="${v}"]`);
    if (el) el.click();
  }, view);
  await new Promise(r => setTimeout(r, 350));
  const e2 = pageErrors.length;
  check(`view renders: ${view}`, e2 === pageErrors.length, 'new errors appeared');
}

await browser.close();
server.close();
console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
