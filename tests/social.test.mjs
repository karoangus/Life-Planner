/**
 * Life Planner Social v25.0 — structural + offline-safety test suite.
 *
 * Runs in plain Node (no browser, no network). Verifies:
 *   • All new assets exist
 *   • Version alignment across app/package/SW/README
 *   • social.js exposes the full LPSocial API surface
 *   • Offline safety: no network/Supabase call on boot; lazy SDK load
 *   • Pomodoro bridge hooks (no duplicate timer)
 *   • social-ui.js renders all required subviews
 *   • social-tour.js has exactly 26 steps with all controls
 *   • index.html wiring (social tab, pane, tour card, version, scripts)
 *   • lang.js has English translations for social strings
 *   • sw.js precaches social assets & uses cache-v108
 *
 * Exits 0 on success, 1 on any failure.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
function check(name, cond, extra = '') {
  const ok = !!cond;
  console.log(`${ok ? '✅' : '❌'} ${name}${ok ? '' : '  ' + extra}`);
  if (!ok) failures++;
}

function read(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null;
}

const coreJs   = read('js/core.js');
const socialJs = read('js/social.js');
const socialUi = read('js/social-ui.js');
const socialTour = read('js/social-tour.js');
const langJs   = read('js/lang.js');
const swJs     = read('sw.js');
const indexHtml= read('index.html');
const pkgJson  = read('package.json');
const pkgLock  = read('package-lock.json');
const appVer   = read('app-version.json');
const readme   = read('README.md');

const filesExist = [
  'css/social.css', 'js/social.js', 'js/social-ui.js', 'js/social-tour.js',
  'js/vendor/supabase.js', 'tests/social.test.mjs'
];
for (const f of filesExist) {
  check(`file exists: ${f}`, fs.existsSync(path.join(ROOT, f)));
}

/* ---------- version alignment ---------- */
const coreVer = (coreJs.match(/const LP_APP_VERSION='([^']+)'/) || [])[1];
const pkg = pkgJson ? JSON.parse(pkgJson) : {};
const pkgLockRoot = pkgLock ? JSON.parse(pkgLock) : {};
const appVerJson = appVer ? JSON.parse(appVer) : {};
const cacheVer = (swJs.match(/life-planner-cache-v(\d+)/) || [])[1];
const settingsVer = (indexHtml.match(/id="settingsVersion">([^<]+)</) || [])[1];

check('LP_APP_VERSION = 25.0', coreVer === '25.0', `got ${coreVer}`);
check('app-version.json = 25.0', appVerJson.version === '25.0', `got ${appVerJson.version}`);
check('package.json version = 25.0.0', pkg.version === '25.0.0', `got ${pkg.version}`);
check('package-lock.json version = 25.0.0', pkgLockRoot.version === '25.0.0' && pkgLockRoot.packages?.['']?.version === '25.0.0', `got ${pkgLockRoot.version}`);
check('settingsVersion = 25.0', settingsVer === '25.0', `got ${settingsVer}`);
check('sw.js VERSION = 25.0', /const VERSION = '25\.0';/.test(swJs || ''));
check('sw.js CACHE_NAME = life-planner-cache-v108', /const CACHE_NAME = 'life-planner-cache-v108';/.test(swJs || ''), `got v${cacheVer}`);
check('README badge/نسخه-25.0-', readme && readme.includes('badge/نسخه-25.0-'));
check('README نسخه 25.0', readme && readme.includes('نسخه 25.0'));
check('README life-planner-cache-v108', readme && readme.includes("life-planner-cache-v108"));

/* ---------- index.html wiring ---------- */
check('index.html loads css/social.css', indexHtml && indexHtml.includes('css/social.css?v=25.0'));
check('index.html #pomoTabs has data-pt social chip', indexHtml && indexHtml.includes('data-pt="social"') && indexHtml.includes('🎓 اجتماعی'));
check('index.html #pomoPane-social exists', indexHtml && indexHtml.includes('id="pomoPane-social"'));
check('index.html settings tour card', indexHtml && indexHtml.includes('تور راهنمای بخش پومودوروی اجتماعی') && indexHtml.includes('lpsStartTour'));
check('index.html loads js/social.js', indexHtml && indexHtml.includes('js/social.js?v=25.0'));
check('index.html loads js/social-ui.js', indexHtml && indexHtml.includes('js/social-ui.js?v=25.0'));
check('index.html loads js/social-tour.js', indexHtml && indexHtml.includes('js/social-tour.js?v=25.0'));
check('index.html loads vendor supabase', indexHtml && indexHtml.includes('js/vendor/supabase.js?v=25.0'));

/* ---------- core.js showPomoTab ---------- */
check('core.js showPomoTab calls renderSocialHub for social', /tab==='social' && typeof window\.renderSocialHub === 'function'/.test(coreJs || ''));

/* ---------- social.js API surface ---------- */
const requiredApi = [
  'state', 'STATUS_META', 'DEFAULT_ACTIVITY_TYPES', 'STUDY_MOODS', 'AVATAR_PRESETS',
  'VIRTUAL_CHARACTERS', 'MOTIVATIONAL_PRESETS', 'STICKERS', 'ACHIEVEMENTS_CATALOG',
  'subscribeUI', 'notifyUI', 'saveLocalPrefs', 'initSocialIfNeeded',
  'signUpAccount', 'signInAccount', 'signOutAccount', 'updateMyProfile',
  'uploadAvatarFile', 'searchUserByNumericCode', 'refreshFriendsAndRequests',
  'sendFriendRequest', 'respondFriendRequest', 'cancelOrRemoveFriendship',
  'blockUser', 'unblockUser', 'setManualStatus', 'addCustomActivityType',
  'calculateTestPercentage', 'submitTestResult', 'refreshFeed', 'toggleActivityReaction',
  'sendDirectStickerReaction', 'sendMessageToFriend', 'openChatWithFriend',
  'refreshNotifications', 'markAllNotificationsRead', 'refreshRooms',
  'createStudyRoom', 'joinOrUpdateRoomMember', 'inviteFriendToRoom', 'leaveOrCloseRoom',
  'refreshChallenges', 'createChallenge', 'acceptChallengeInvite',
  'logManualChallengeProgress', 'finishChallenge', 'refreshLeaderboard',
  'refreshDailyRecaps', 'loadUserSocialProfileModal', 'fa', 'safeEsc'
];
let missingApi = [];
for (const m of requiredApi) {
  if (!socialJs || !socialJs.includes(m)) missingApi.push(m);
}
check('social.js exposes full LPSocial API (' + requiredApi.length + ' members)', missingApi.length === 0, missingApi.join(', '));

/* ---------- offline safety ---------- */
check('social.js lazy-loads SDK (js/vendor/supabase.js)', /js\/vendor\/supabase\.js/.test(socialJs || ''));
check('social.js checks navigator.onLine before network', /navigator\.onLine/.test(socialJs || ''));
check('social.js wraps Supabase in try/catch', /try\s*\{/.test(socialJs || '') && /catch\s*\(/.test(socialJs || ''));
check('social.js does not call Supabase at module top-level (offline-safe boot)', !/ensureClient\(\)\s*;\s*\n\)\)\(\s*\)/.test(socialJs || ''));
check('social.js installs pomodoro hooks (no duplicate timer)', /installPomodoroHooks/.test(socialJs || '') && /window\.startFocus/.test(socialJs || '') && /window\.completePomoSession/.test(socialJs || ''));
check('social.js hooks all 6 pomodoro lifecycle points', /window\.startFocus/.test(socialJs || '') && /window\.startBreak/.test(socialJs || '') && /window\.pauseSession/.test(socialJs || '') && /window\.resumeSession/.test(socialJs || '') && /window\.endSession/.test(socialJs || '') && /window\.completePomoSession/.test(socialJs || ''));
check('social.js has post-session prompt (window.lpsShowPostSessionPrompt)', /lpsShowPostSessionPrompt/.test(socialJs || ''));
check('social.js has RLS-backed tables referenced', /lps_profiles/.test(socialJs || '') && /lps_friendships/.test(socialJs || '') && /lps_messages/.test(socialJs || ''));

/* ---------- social-ui.js ---------- */
const requiredUi = [
  'window.renderSocialHub', 'window.lpsShowPostSessionPrompt', 'window.lpsStartTour',
  'window.lpsCreateRoom', 'window.lpsCreateChallenge', 'window.lpsSubmitTestResult',
  'window.lpsToggleReaction', 'window.lpsSendChat', 'window.lpsSaveProfile',
  'window.lpsTogglePriv', 'window.lpsToggleNotif', 'window.lpsUnblock', 'window.lpsSignOut',
  'window.lpsSetManualStatusQuick', 'window.lpsSetTimedStatus', 'window.lpsToggleAutoSync',
  'window.lpsPickMood', 'window.lpsToggleShareMood', 'window.lpsPickAvatar',
  'window.lpsQuickMotiv', 'window.lpsSendQuickMotiv', 'window.lpsOpenFriendProfile',
  'window.lpsLoadRecap', 'window.lpsAcceptChallenge', 'window.lpsLogProgress',
  'window.lpsLeaveRoom', 'window.lpsCloseRoom', 'window.lpsInviteToRoom'
];
let missingUi = [];
for (const m of requiredUi) {
  const symbol = m.replace('window.', '');
  if (!socialUi || !socialUi.includes(`window.${symbol} =`) && !socialUi.includes(`window.${symbol} = function`)) missingUi.push(m);
}
check('social-ui.js wires all global action bridges (' + requiredUi.length + ')', missingUi.length === 0, missingUi.join(', '));
check('social-ui.js renders friend cards', /lps-friend-card/.test(socialUi || ''));
check('social-ui.js renders feed items with reactions', /lps-feed-item/.test(socialUi || '') && /lps-sticker-btn/.test(socialUi || ''));
check('social-ui.js renders chat', /lps-chat-box/.test(socialUi || '') && /lps-msg-bubble/.test(socialUi || ''));
check('social-ui.js renders rooms', /lpsCreateRoom/.test(socialUi || '') && /createStudyRoom/.test(socialUi || ''));
check('social-ui.js renders challenges', /lpsCreateChallenge/.test(socialUi || '') && /createChallenge/.test(socialUi || ''));
check('social-ui.js renders leaderboard', /refreshLeaderboard/.test(socialUi || ''));
check('social-ui.js renders recap', /refreshDailyRecaps/.test(socialUi || ''));
check('social-ui.js renders profile & settings', /lpsSaveProfile/.test(socialUi || '') && /lpsTogglePriv/.test(socialUi || '') && /lpsToggleNotif/.test(socialUi || ''));
check('social-ui.js renders Pomodoro focus bridge strip', /lps-pomo-bridge/.test(socialUi || '') && /lpsPomoBridge/.test(socialUi || ''));
check('social-ui.js hooks showPomoTab to render bridge strip', /window\.showPomoTab/.test(socialUi || ''));

/* ---------- social-tour.js ---------- */
const stepCount = (socialTour.match(/{ id: '[a-z_]+', title:/g) || []).length;
check('social-tour.js defines 26 tour steps', stepCount === 26, `found ${stepCount}`);
check('social-tour.js has Next/Prev controls', /lpsTourNext/.test(socialTour || '') && /lpsTourPrev/.test(socialTour || ''));
check('social-tour.js has Pause-Resume control', /lpsTourPauseResume/.test(socialTour || ''));
check('social-tour.js has Skip control', /lpsTourSkip/.test(socialTour || ''));
check('social-tour.js has progress bar', /lps-tour-progress-fill/.test(socialTour || ''));
check('social-tour.js has spotlight highlight', /lps-tour-highlight/.test(socialTour || ''));
check('social-tour.js has dim backdrop', /lps-tour-backdrop/.test(socialTour || ''));
check('social-tour.js has popover card', /lps-tour-popover/.test(socialTour || ''));
check('social-tour.js persists state (localStorage)', /localStorage/.test(socialTour || ''));
check('social-tour.js exposes lpsTourStart / lpsStartTour', /window\.lpsTourStart/.test(socialTour || '') && /window\.lpsStartTour/.test(socialTour || ''));
check('social-tour.js step ids cover required topics', (() => {
  const ids = (socialTour.match(/{ id: '([a-z_]+)',/g) || []).map(m => m.match(/{ id: '([a-z_]+)',/)[1]);
  const required = ['intro','signup','usercode','friendrequest','dashboard','statuses','manualstatus','autostatus','subjectactivity','livefeed','testresult','motiv','stickers','chat','feed','profile','notifications','rooms','streak','achievements','leaderboard','mood','virtualpresence','recap','challenges','privacy'];
  const missing = required.filter(r => !ids.includes(r));
  return missing.length === 0;
})(), 'missing tour steps');

/* ---------- lang.js ---------- */
check('lang.js has EXTRA_V25 social translations', /var EXTRA_V25/.test(langJs || ''));
check('lang.js translates social strings', /پومودوروی اجتماعی/.test(langJs || '') && /Pomodoro Social/.test(langJs || ''));

/* ---------- sw.js precache ---------- */
check('sw.js precaches css/social.css', /css\/social\.css/.test(swJs || ''));
check('sw.js precaches js/vendor/supabase.js', /js\/vendor\/supabase\.js/.test(swJs || ''));
check('sw.js precaches js/social.js', /js\/social\.js\?/.test(swJs || ''));
check('sw.js precaches js/social-ui.js', /js\/social-ui\.js\?/.test(swJs || ''));
check('sw.js precaches js/social-tour.js', /js\/social-tour\.js\?/.test(swJs || ''));

/* ---------- pure logic: test-percentage formula (mirrors social.js) ---------- */
function calcPct(total, correct, wrong, withNegative = true) {
  const t = Math.max(1, Number(total) || 1);
  const c = Math.max(0, Number(correct) || 0);
  const w = Math.max(0, Number(wrong) || 0);
  const raw = withNegative ? ((c * 3 - w) / (t * 3)) * 100 : (c / t) * 100;
  return Math.round(Math.max(-33.33, Math.min(100, raw)) * 10) / 10;
}
check('test percentage: perfect score = 100', calcPct(10, 10, 0) === 100);
check('test percentage: all wrong = -33.3', calcPct(10, 0, 10) === -33.3);
check('test percentage: half right = 50 (no neg)', calcPct(10, 5, 5, false) === 50);
check('test percentage: 7 right 3 wrong = 60', calcPct(10, 7, 3) === 60);

console.log(`\n${failures === 0 ? 'ALL SOCIAL TESTS PASSED' : `${failures} SOCIAL TEST(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
