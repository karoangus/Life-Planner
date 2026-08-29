/* ============================================================
   Life Planner — core: theme, store (DB), rendering,
   gamification (XP, quests, city, boss, crisis), update check
   Load order: MUST be first.
   ============================================================ */

/* ============ THEME ============ */
const THEME_KEY = 'lifePlannerAI_theme';
const THEME_META = {
  dark:          { label:'تم تاریک',       icon:'🌙', cost:0,   color:'#070a14', swatch:'linear-gradient(135deg,#00e5ff,#8b6bff)' },
  light:         { label:'تم روشن',        icon:'☀️', cost:0,   color:'#f3f5fb', swatch:'linear-gradient(135deg,#0891b2,#7c3aed)' },
  neonPurple:    { label:'بنفش نئون',      icon:'💜', cost:200, color:'#140a24', swatch:'linear-gradient(135deg,#e64dff,#6d28d9)' },
  fireSunset:    { label:'غروب آتشین',     icon:'🌇', cost:300, color:'#1a0e12', swatch:'linear-gradient(135deg,#ff7a3d,#c0257a)' },
  legendaryGold: { label:'طلایی افسانه‌ای', icon:'👑', cost:500, color:'#0f0a04', swatch:'linear-gradient(135deg,#ffd76b,#e69500)' },
};
function applyTheme(theme){
  const meta = THEME_META[theme] || THEME_META.dark;
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('themeIcon').textContent = meta.icon;
  document.getElementById('themeLabel').textContent = meta.label;
  const metaTag = document.querySelector('meta[name="theme-color"]');
  if(metaTag) metaTag.setAttribute('content', meta.color);
}
function toggleTheme(){
  const owned = (typeof DB!=='undefined' && DB.themes && DB.themes.owned) || ['dark','light'];
  const current = localStorage.getItem(THEME_KEY) || 'dark';
  const idx = owned.indexOf(current);
  const next = owned[(idx+1) % owned.length] || 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
  
}
function useTheme(theme){
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
  renderXPShop();
  
}
applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
const _themeToggleBtn = document.getElementById('themeToggleBtn'); if(_themeToggleBtn) _themeToggleBtn.onclick = toggleTheme;

/* ============ STORE ============ */
const STORE_KEY = 'lifePlannerAI_v1';
function loadStore(){
  let db = { tasks:[], habits:[], goals:[], notes:[], events:[], xp:0, level:1, history:{}, quest:null, stats:null };
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(raw){ const parsed = JSON.parse(raw); db = Object.assign(db, parsed); }
  }catch(e){}
  // guarantee every array/object field is never undefined
  if(!Array.isArray(db.tasks))   db.tasks   = [];
  if(!Array.isArray(db.habits))  db.habits  = [];
  if(!Array.isArray(db.goals))   db.goals   = [];
  if(!Array.isArray(db.notes))   db.notes   = [];
  if(!Array.isArray(db.events))  db.events  = [];
  if(typeof db.history !== 'object' || Array.isArray(db.history)) db.history = {};
  if(typeof db.xp    !== 'number') db.xp    = 0;
  if(typeof db.level !== 'number' || db.level < 1) db.level = 1;
  // ensure each task has extraDeadlines, subtasks, workflow status and inbox flag
  db.tasks.forEach(t=>{
    if(!Array.isArray(t.extraDeadlines)) t.extraDeadlines=[];
    if(!Array.isArray(t.subtasks)) t.subtasks=[];
    if(!t.status) t.status='notstarted';
    if(typeof t.inbox !== 'boolean') t.inbox = false;
  });
  return db;
}
let DB = loadStore();
DB.notes.forEach(n=>{ if(typeof n.pinned!=='boolean') n.pinned=false; if(!n.updatedAt) n.updatedAt=n.date||todayISO(); });
DB.events.forEach(e=>{ if(typeof e.reminder!=='boolean') e.reminder=false; });
// Defensive migration for data created by older/broken builds.
if(!DB.motivation || typeof DB.motivation!=='object') DB.motivation = { mood:'energize' }; if(typeof DB.motivation.custom!=='string') DB.motivation.custom = '';
if(!DB.stats || typeof DB.stats!=='object') DB.stats = { tasksCompleted:0, questsCompleted:0, bestStreak:0 };
if(!DB.quest || typeof DB.quest!=='object') DB.quest = { current:null, nextAt:Date.now()+2*60*1000, waitStart:Date.now(), bags:{} };
if(!DB.pomodoro || typeof DB.pomodoro!=='object') DB.pomodoro = { settings:{focusMin:25,breakMin:5,goalMinutes:0}, session:null, history:{}, pendingNext:null };
if(!Array.isArray(DB.pomodoro.manualData)) DB.pomodoro.manualData = [];
if(!DB.xpBoost || typeof DB.xpBoost!=='object') DB.xpBoost = { activeUntil:0 };
if(!DB.themes || typeof DB.themes!=='object') DB.themes = { owned:['dark','light'] };
if(!Array.isArray(DB.cityBonusItems)) DB.cityBonusItems = [];
if(!DB.skillTiers || typeof DB.skillTiers!=='object') DB.skillTiers = {pomoXp:0,questXp:0,shopDiscount:0,luckyBox:0,criticalBonus:0,streakGuard:0};
if(!DB.boss || typeof DB.boss!=='object') DB.boss = {active:null,nextAvailableAt:Date.now()};
if(!DB.crisis || typeof DB.crisis!=='object') DB.crisis = {active:false,deadlineAt:0,cooldownUntil:0};
if(!DB.newRecordFlags || typeof DB.newRecordFlags!=='object') DB.newRecordFlags = {};
if(!DB.perfectDayHistory || typeof DB.perfectDayHistory!=='object') DB.perfectDayHistory = {};
if(!DB.dailyGoalProgress || typeof DB.dailyGoalProgress!=='object') DB.dailyGoalProgress = {};
if(!DB.streakShields || typeof DB.streakShields!=='number') DB.streakShields = 0;
if(typeof DB.skillPoints!=='number') DB.skillPoints = 0;
if(typeof DB.xpWallet!=='number') DB.xpWallet = DB.stats.totalXPEarned || 0;
if(!DB.quest){ DB.quest = { current:null, nextAt: Date.now()+2*60*1000, waitStart: Date.now(), bags:{} }; }
if(DB.quest.waitStart===undefined) DB.quest.waitStart = Date.now();
if(!DB.stats){ DB.stats = { tasksCompleted:0, questsCompleted:0, bestStreak:0 }; }
if(DB.stats.perfectDays===undefined) DB.stats.perfectDays = 0;
if(DB.stats.questsCompletedByDate===undefined) DB.stats.questsCompletedByDate = {};
if(DB.stats.totalXPEarned===undefined) DB.stats.totalXPEarned = 0;
if(DB.stats.weeklyPerfectUnlocked===undefined) DB.stats.weeklyPerfectUnlocked = false;
if(!DB.dailyGoalProgress) DB.dailyGoalProgress = {};
if(!DB.perfectDayHistory) DB.perfectDayHistory = {};
if(!DB.pomodoro){
  DB.pomodoro = { settings:{focusMin:25, breakMin:5, goalMinutes:0}, session:null, history:{}, pendingNext:null };
}
if(!Array.isArray(DB.pomodoro.manualData)) DB.pomodoro.manualData = [];
if(DB.pomodoro.pendingNext===undefined) DB.pomodoro.pendingNext = null;
if(!DB.motivation) DB.motivation = { mood:'energize' }; if(typeof DB.motivation.custom!=='string') DB.motivation.custom = '';
if(DB.xpWallet===undefined) DB.xpWallet = DB.stats.totalXPEarned||0;
if(!DB.xpBoost) DB.xpBoost = { activeUntil:0 };
if(DB.streakShields===undefined) DB.streakShields = 0;
if(!DB.cityBonusItems) DB.cityBonusItems = [];
if(!DB.themes) DB.themes = { owned:['dark','light'] };
if(DB.lastBackupReminder===undefined) DB.lastBackupReminder = Date.now();
if(DB.lastAutoBackupAt===undefined) DB.lastAutoBackupAt = Date.now();
if(DB.skillPoints===undefined) DB.skillPoints = 0;
if(!DB.skillTiers) DB.skillTiers = { pomoXp:0, questXp:0, shopDiscount:0, luckyBox:0, criticalBonus:0, streakGuard:0 };
if(!DB.boss) DB.boss = { active:null, nextAvailableAt: Date.now() };
if(!DB.crisis) DB.crisis = { active:false, deadlineAt:0, cooldownUntil:0 };
if(!DB.newRecordFlags) DB.newRecordFlags = {};
function persist(){ localStorage.setItem(STORE_KEY, JSON.stringify(DB)); }
function save(){
  persist();
  // A renderer must never be able to break saving or every other part of the app.
  // Render each subsystem independently so one bad widget cannot freeze the whole UI.
  renderAll();
}
function uid(){ return Math.random().toString(36).slice(2,10); }
function todayISO(){
  const d = new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
let notificationRegPromise=null;
function ensureNotificationRegistration(){
  if(!('serviceWorker' in navigator)) return Promise.resolve(null);
  if(notificationRegPromise) return notificationRegPromise;
  notificationRegPromise = navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(reg=>{
    try{ reg.update(); }catch(_){ }
    return navigator.serviceWorker.ready;
  }).catch(()=>null);
  return notificationRegPromise;
}
function notificationSupported(){
  return ('Notification' in window) && (location.protocol==='https:' || location.hostname==='localhost' || location.hostname==='127.0.0.1');
}
async function sendNotification(title, body, options={}){
  try{
    if(!notificationSupported()) return false;
    if(Notification.permission!=='granted') return false;
    const reg=await ensureNotificationRegistration();
    const payload={body,icon:'icon-192.png',badge:'icon-192.png',dir:'rtl',lang:'fa',tag:options.tag||('lp-'+Date.now()),renotify:!!options.renotify};
    if(reg){ await reg.showNotification(title,payload); return true; }
    const n=new Notification(title,payload); n.onclick=()=>window.focus(); return true;
  }catch(_){ return false; }
}
function notifyPermissionStatus(){
  if(!notificationSupported()) return 'unsupported';
  return Notification.permission;
}
async function requestNotifyPermission(){
  if(!notificationSupported()){ toast('⚠️ نوتیفیکیشن فقط روی نسخه نصب‌شده/HTTPS کار می‌کنه'); renderPomoNotifyStatus(); return; }
  try{
    const permission=await Notification.requestPermission();
    DB.pomodoro.notifications = permission==='granted';
    DB.notifications = {enabled:permission==='granted'};
    persist();
    renderPomoNotifyStatus();
    if(permission==='granted'){
      await ensureNotificationRegistration();
      await sendNotification('🔔 نوتیفیکیشن فعاله!','از این به بعد اعلان‌های مهم Life Planner رو می‌گیری.',{tag:'lp-notify-ready',renotify:false});
    } else if(permission==='denied') toast('⛔ اعلان‌ها مسدود شده‌اند؛ از تنظیمات سایت/گوشی اجازه بده.');
    else toast('🔕 اجازه اعلان داده نشد.');
  }catch(_){ toast('⚠️ فعال‌سازی اعلان ناموفق بود'); }
}
function renderPomoNotifyStatus(){
  const el=document.getElementById('pomoNotifyStatus'); if(!el)return;
  const p=notifyPermissionStatus();
  el.textContent=p==='granted'&&DB.pomodoro.notifications!==false?'✅ نوتیفیکیشن فعاله':'⛔ نوتیفیکیشن فعال نیست';
}

function toast(msg){
  const t = document.getElementById('toast'); t.innerHTML = msg; t.classList.add('show');
  clearTimeout(window._tt); window._tt = setTimeout(()=>t.classList.remove('show'), 2200);
}

/* ============ NAV ============ */
const DEFAULT_PINNED_VIEWS = ['dashboard','tasks','habits','goals'];
const PINNED_NAV_KEY = 'lifePlannerAI_pinnedNav_v1';

const PINNED_NAV_OPTIONS = [
  {id:'dashboard', label:'داشبورد', icon:'🏠'},
  {id:'tasks', label:'تسک‌ها', icon:'✅'},
  {id:'habits', label:'عادت‌ها', icon:'🔥'},
  {id:'goals', label:'اهداف', icon:'🎯'},
  {id:'calendar', label:'تقویم هفتگی', icon:'📅'},
  {id:'notes', label:'یادداشت‌ها', icon:'📝'},
  {id:'pomodoro', label:'پومودورو', icon:'🍅'},
  {id:'shop', label:'XP Shop', icon:'🛍️'},
  {id:'skills', label:'درخت مهارت', icon:'🌳'},
  {id:'boss', label:'باس هفتگی', icon:'⚔️'},
  {id:'yvy', label:'You VS You', icon:'🪞'},
  {id:'city', label:'Life City', icon:'🏙️'},
  {id:'profile', label:'پروفایل', icon:'👤'},
  {id:'settings', label:'تنظیمات', icon:'⚙️'}
];

function getPinnedNav(){
  try{
    const saved=JSON.parse(localStorage.getItem(PINNED_NAV_KEY)||'null');
    if(Array.isArray(saved)&&saved.length===4){
      const valid=saved.every(id=>PINNED_NAV_OPTIONS.some(x=>x.id===id));
      const unique=new Set(saved).size===4;
      if(valid&&unique)return saved;
    }
  }catch(_){}
  return [...DEFAULT_PINNED_VIEWS];
}

let PINNED_VIEWS=getPinnedNav();

function getPinnedOption(id){
  return PINNED_NAV_OPTIONS.find(x=>x.id===id)||PINNED_NAV_OPTIONS[0];
}

function renderMoreViews(){
  const box=document.getElementById('moreViewList');
  if(!box)return;
  box.innerHTML=PINNED_NAV_OPTIONS
    .filter(item=>!PINNED_VIEWS.includes(item.id))
    .map(item=>`<div class="sheet-nav-item" data-view="${item.id}" onclick="showView('${item.id}'); closeSheet();"><span class="ic">${item.icon}</span> ${item.label}</div>`)
    .join('');
}

function renderPinnedNav(){
  PINNED_VIEWS.forEach((viewId,i)=>{
    const el=document.getElementById('bnav-slot'+i);
    if(!el)return;
    const item=getPinnedOption(viewId);
    el.dataset.view=viewId;
    el.innerHTML=`<span class="bic">${item.icon}</span><span>${item.label}</span>`;
    el.onclick=()=>showView(viewId);
    el.setAttribute('aria-label',item.label);
  });
  renderMoreViews();
}

window.__citySunMoonInited = false;

window.__CITY_TRACKS = {day:['audio/city_day.ogg'], night:['audio/city_night.ogg'], rain:['audio/city_rain.ogg']};

function showView(v){
  const target=document.getElementById('view-'+v);
  if(!target)return;
  document.querySelectorAll('.view').forEach(el=>el.classList.remove('active'));
  target.classList.add('active');

  document.querySelectorAll('.bnav-item[data-view]').forEach(el=>{
    el.classList.toggle('active',el.dataset.view===v);
  });
  document.querySelectorAll('.sheet-nav-item[data-view]').forEach(el=>{
    el.classList.toggle('active',el.dataset.view===v);
  });

  if(v==='city'){ window.__citySunMoonInited=false; setTimeout(()=>{renderCityScene();syncCityAudioToScene();},30); startCityAmbienceFromGesture().catch(()=>{}); }
  else setTimeout(()=>renderView(v), 30);
  if(v!=='city'&&window.__citySoundOn){
    window.__citySoundOn=false;
    stopCityAmbience();
    const b=document.getElementById('citySoundBtn');
    if(b)b.textContent='🔇';
  }
}

function openPinnedNavSettings(){
  const box=document.getElementById('pinnedNavEditor');
  if(!box)return;
  const options=PINNED_NAV_OPTIONS;
  box.innerHTML=PINNED_VIEWS.map((selected,i)=>{
    const current=getPinnedOption(selected);
    return `<div class="pinned-nav-row">
      <div class="pinned-nav-slot">${current.icon}</div>
      <div>
        <select class="pinned-nav-select" data-pinned-slot="${i}">
          ${options.map(o=>`<option value="${o.id}" ${o.id===selected?'selected':''}>${o.icon}  ${o.label}</option>`).join('')}
        </select>
      </div>
    </div>`;
  }).join('');

  box.querySelectorAll('.pinned-nav-select').forEach(sel=>{
    sel.addEventListener('change',()=>{
      const item=getPinnedOption(sel.value);
      const slot=sel.closest('.pinned-nav-row')?.querySelector('.pinned-nav-slot');
      if(slot)slot.textContent=item.icon;
    });
  });
  openModal('pinnedNavModalBg');
}

function savePinnedNav(){
  const selects=[...document.querySelectorAll('#pinnedNavEditor .pinned-nav-select')];
  const chosen=selects.map(x=>x.value);
  if(chosen.length!==4||new Set(chosen).size!==4){
    toast('⚠️ هر چهار دکمه باید بخش متفاوتی داشته باشن');
    return;
  }
  PINNED_VIEWS=chosen;
  localStorage.setItem(PINNED_NAV_KEY,JSON.stringify(PINNED_VIEWS));
  renderPinnedNav();
  closeModal('pinnedNavModalBg');
  toast('✅ نوار دسترسی سریع ذخیره شد');
}

function resetPinnedNav(){
  PINNED_VIEWS=[...DEFAULT_PINNED_VIEWS];
  localStorage.setItem(PINNED_NAV_KEY,JSON.stringify(PINNED_VIEWS));
  renderPinnedNav();
  openPinnedNavSettings();
  toast('↩️ نوار پایین به حالت پیش‌فرض برگشت');
}

function openSheet(){
  document.getElementById('sheetOverlay').classList.add('open');
  document.getElementById('sheetDrawer').classList.add('open');
}
function closeSheet(){
  document.getElementById('sheetOverlay').classList.remove('open');
  document.getElementById('sheetDrawer').classList.remove('open');
}
function showThemePanel(){
  closeSheet();
  // cycle themes from the existing themeToggle logic
  toggleTheme();
}
// Swipe-to-close sheet
(function(){
  let startY=0, dragging=false;
  const handle = document.getElementById('sheetHandleRow');
  const drawer = document.getElementById('sheetDrawer');
  if(!handle) return;
  handle.addEventListener('touchstart', e=>{ startY=e.touches[0].clientY; dragging=true; drawer.style.transition='none'; },{passive:true});
  document.addEventListener('touchmove', e=>{
    if(!dragging) return;
    const dy = e.touches[0].clientY - startY;
    if(dy>0) drawer.style.transform=`translateY(${dy}px)`;
  },{passive:true});
  document.addEventListener('touchend', e=>{
    if(!dragging) return; dragging=false;
    const dy = e.changedTouches[0].clientY - startY;
    drawer.style.transition='';
    if(dy>120) closeSheet(); else drawer.style.transform='';
  });
})();
setInterval(()=>{ if(document.getElementById('view-city')?.classList.contains('active')) renderCityScene(); }, 60000);
setInterval(()=>{ if(document.getElementById('view-shop')?.classList.contains('active')) tickXPShop(); }, 1000);

/* chip select helper */
document.querySelectorAll('.chip-group').forEach(g=>{
  g.addEventListener('click', e=>{
    const opt = e.target.closest('.chip-opt'); if(!opt) return;
    if(g.id==='taskFilters'){ g.querySelectorAll('.chip-opt').forEach(o=>o.classList.remove('sel')); opt.classList.add('sel'); renderTasks(opt.dataset.f); return; }
    if(g.id==='eDays'){ opt.classList.toggle('sel'); return; }
    if(g.id==='pomoTabs'){ g.querySelectorAll('.chip-opt').forEach(o=>o.classList.remove('sel')); opt.classList.add('sel'); showPomoTab(opt.dataset.pt); return; }
    if(g.id==='pomoPeriodChips'){ g.querySelectorAll('.chip-opt').forEach(o=>o.classList.remove('sel')); opt.classList.add('sel'); pomoPeriod = opt.dataset.p; renderPomoChart(); return; }
    if(g.id==='moodPicker'){ setMoodPref(opt.dataset.mood); return; }
    g.querySelectorAll('.chip-opt').forEach(o=>o.classList.remove('sel'));
    opt.classList.add('sel');
  });
});

function closeModal(id){ document.getElementById(id).classList.remove('open'); }
function openModal(id){ document.getElementById(id).classList.add('open'); }

/* ============ XP / GAMIFICATION ============ */
const LEVEL_TITLES = [
  {lv:1,   icon:'🌱', title:'تازه‌کار'},
  {lv:5,   icon:'🚀', title:'منظم'},
  {lv:10,  icon:'⚡', title:'جنگجو'},
  {lv:20,  icon:'💎', title:'استاد نظم'},
  {lv:35,  icon:'👑', title:'فرمانده'},
  {lv:50,  icon:'🔥', title:'افسانه'},
  {lv:100, icon:'🌌', title:'استاد زندگی'},
];
function getLevelTitle(level){
  let cur = LEVEL_TITLES[0];
  for(const t of LEVEL_TITLES){ if(level>=t.lv) cur=t; else break; }
  return cur;
}
function addXP(n){
  // Pure mutation — does NOT persist or render. Caller must call save().
  if(n >= 0){
    const boosted = (DB.xpBoost && Date.now() < DB.xpBoost.activeUntil);
    const amount = boosted ? n*2 : n;
    DB.xp += amount;
    DB.stats.totalXPEarned = (DB.stats.totalXPEarned||0) + amount;
    DB.xpWallet = (DB.xpWallet||0) + amount;
    const d = todayISO();
    DB.history[d] = DB.history[d] || {};
    DB.history[d].xp = (DB.history[d].xp||0) + amount;
    // BUG 6 FIX: process ALL levels if XP is enough for multiple
    let safety = 0;
    while(DB.xp >= DB.level*100 && safety++ < 50){
      DB.xp -= DB.level*100; DB.level++;
      DB.skillPoints = (DB.skillPoints||0) + 1;
      const t = getLevelTitle(DB.level);
      toast(`🎉 تبریک! رسیدی به سطح ${DB.level} — ${t.icon} ${t.title} · +۱ امتیاز مهارت 🌳`);
    }
    checkNewRecords();
  } else {
    DB.xp = Math.max(0, DB.xp + n);
  }
  // intentionally no save() here
}
function renderXP(){
  const need = DB.level*100;
  const t = getLevelTitle(DB.level);
  const pct = Math.min(100,(DB.xp/need)*100);
  const txt = DB.xp+'/'+need;
  // safe setters — these IDs only exist in the sheet, never throw
  const setEl = (id, prop, val) => { const el=document.getElementById(id); if(el){ if(prop==='text') el.textContent=val; else el.style[prop]=val; } };
  setEl('xpLevelSheet','text', DB.level);
  setEl('xpTextSheet','text', txt);
  setEl('xpBarSheet','width', pct+'%');
  setEl('xpTitleIconSheet','text', t.icon);
  setEl('xpTitleNameSheet','text', t.title);
  // v9.1: the dashboard hero shows the same level/XP strip (safe no-op elsewhere)
  setEl('dashXpLevel','text', DB.level);
  setEl('dashXpText','text', txt);
  setEl('dashXpBar','width', pct+'%');
  setEl('dashXpTitleIcon','text', t.icon);
  setEl('dashXpTitleName','text', t.title);
}
function renderProfile(){
  const need = DB.level*100;
  const t = getLevelTitle(DB.level);
  document.getElementById('pfLevelBadge').textContent = DB.level;
  document.getElementById('pfTitle').textContent = `${t.icon} ${t.title}`;
  document.getElementById('pfSub').textContent = `Level ${DB.level}`;
  document.getElementById('pfXpBar').style.width = Math.min(100,(DB.xp/need)*100)+'%';
  document.getElementById('pfXpTxt').textContent = `${DB.xp.toLocaleString('en-US')} / ${need.toLocaleString('en-US')} XP`;
  document.getElementById('pfTasksDone').textContent = (DB.stats.tasksCompleted||0).toLocaleString('en-US');
  document.getElementById('pfBestStreak').textContent = (DB.stats.bestStreak||0).toLocaleString('en-US');
  document.getElementById('pfHabits').textContent = DB.habits.length;
  document.getElementById('pfQuests').textContent = (DB.stats.questsCompleted||0).toLocaleString('en-US');

  const ms = document.getElementById('pfMilestones');
  ms.innerHTML = LEVEL_TITLES.map(m=>{
    const done = DB.level >= m.lv;
    return `<div class="milestone-row ${done?'done':'locked'}">
      <div class="milestone-ic">${m.icon}</div>
      <div class="milestone-info">
        <div class="milestone-name">${m.title}</div>
        <div class="milestone-lv">Lv ${m.lv}</div>
      </div>
      ${done?'<div class="milestone-check">✓</div>':''}
    </div>`;
  }).join('');

  document.getElementById('pfPerfectDaysVal').textContent = (DB.stats.perfectDays||0).toLocaleString('en-US');
  const guideEl = document.getElementById('perfectDayGuide');
  if(guideEl && guideEl.style.display==='block') renderPerfectDayGuide();

  const stage = getCityStage(DB.level);
  document.getElementById('cityEntryIcon').textContent = stage.icon;
  document.getElementById('cityEntryName').textContent = `شهرت رو ببین — الان ${stage.name} داری`;
}

/* ============ PERFECT DAY ============ */
function getTodayCriteria(){
  const d = todayISO();
  const criticalDone = DB.tasks.some(t=>!t.inbox && t.priority==='critical' && t.done && t.doneDate===d);
  const questsToday = (DB.stats.questsCompletedByDate && DB.stats.questsCompletedByDate[d]) || 0;
  const questsDone = questsToday >= 3;
  const habitDone = DB.habits.some(h=> h.log[d]);
  const goalsOk = DB.goals.length===0 ? false : DB.goals.some(g=> (((DB.dailyGoalProgress[d]||{})[g.id])||0) >= 10);
  const pomoMin = typeof getPomoTotal==='function' ? getPomoTotal(d,'focus') : ((DB.pomodoro.history[d]?.focus)||0);
  const pomoFocus = pomoMin >= 30;
  return { criticalDone, questsDone, habitDone, goalsOk, pomoFocus, questsToday, pomoMin };
}
function checkPerfectDay(){
  // Pure mutation — caller must call save() afterwards
  const d = todayISO();
  if(DB.perfectDayHistory[d]) return;
  const cr = getTodayCriteria();
  if(cr.criticalDone && cr.questsDone && cr.habitDone && cr.goalsOk && cr.pomoFocus){
    DB.perfectDayHistory[d] = true;
    DB.stats.perfectDays = (DB.stats.perfectDays||0) + 1;
    addXP(50);
    openModal('perfectDayModalBg');
    // no save() here — caller owns it
  }
}
function togglePerfectDayGuide(){
  const el = document.getElementById('perfectDayGuide');
  const isHidden = !el.style.display || el.style.display==='none';
  if(isHidden){ renderPerfectDayGuide(); el.style.display='block'; }
  else { el.style.display='none'; }
}
function renderPerfectDayGuide(){
  const c = getTodayCriteria();
  const items = [
    {done:c.criticalDone, label:'یک تسک با اولویت بحرانی رو امروز تموم کن'},
    {done:c.questsDone, label:`۳ تا مأموریت رندوم امروز انجام بده (${c.questsToday}/3)`},
    {done:c.habitDone, label:'حداقل یکی از عادت‌هات رو امروز تیک بزن'},
    {done:c.goalsOk, label: DB.goals.length? 'حداقل یکی از اهدافت رو امروز ۱۰٪ پیش ببر' : 'حداقل یه هدف بساز و امروز ۱۰٪ پیشرفتش بده'},
    {done:c.pomoFocus, label:`امروز حداقل ۳۰ دقیقه فوکوس پومودورو ثبت کن (${c.pomoMin}/30)`},
  ];
  document.getElementById('perfectDayGuide').innerHTML = `
    <div style="font-size:12px; color:var(--txt-dim); margin-bottom:10px;">این کارها رو امروز انجام بدی، یه Perfect Day می‌گیری:</div>
    ${items.map(it=>`<div class="milestone-row" style="opacity:${it.done?1:0.62};">
      <div class="milestone-ic" style="${it.done?'background:rgba(46,230,166,.15);':''}">${it.done?'✅':'⬜'}</div>
      <div class="milestone-info"><div class="milestone-name">${it.label}</div></div>
    </div>`).join('')}
  `;
}

/* ============ LIFE CITY ============ */
const CITY_STAGES = [
  {lv:1,   icon:'🏕️', name:'چادر توی جنگل',      structureKey:'tent'},
  {lv:5,   icon:'🏡', name:'کلبه‌ی چوبی',          structureKey:'cabin'},
  {lv:15,  icon:'🏠', name:'خونه‌ی واقعی',          structureKey:'house'},
  {lv:30,  icon:'🚗', name:'خونه + ماشین',          structureKey:'house'},
  {lv:50,  icon:'🌳', name:'خونه + باغچه و سگ',     structureKey:'house'},
  {lv:80,  icon:'🏙️', name:'شهر کوچیک',            structureKey:'city'},
  {lv:100, icon:'🌆', name:'شهر آینده',             structureKey:'future'},
];
function getCityStage(level){
  let cur = CITY_STAGES[0];
  for(const s of CITY_STAGES){ if(level>=s.lv) cur=s; else break; }
  return cur;
}
function isWeeklyPerfect(){
  const now = new Date();
  const todayIdx = (now.getDay()+1)%7;
  const sat = new Date(now); sat.setDate(now.getDate()-todayIdx);
  const fri = new Date(sat); fri.setDate(sat.getDate()+6);
  const satISO = dateToLocalISO(sat), friISO = dateToLocalISO(fri);
  const weekTasks = DB.tasks.filter(t=>!t.inbox && t.date && t.date>=satISO && t.date<=friISO);
  return weekTasks.length>0 && weekTasks.every(t=>t.done);
}
function getCityAchievements(){
  return {
    waterfall: (DB.stats.bestStreak||0) >= 100,
    bridge: DB.level >= 20,
    statue: (DB.stats.totalXPEarned||0) >= 1000,
    flowers: !!DB.stats.weeklyPerfectUnlocked || isWeeklyPerfect(),
  };
}
let cityStarsBuilt = false, cityRainBuilt = false, cityWindowsBuilt = false, cityFlowersBuilt = false, cityNeonBuilt = false;
function buildCityStars(){
  if(cityStarsBuilt) return; cityStarsBuilt = true;
  const g = document.getElementById('cityStars');
  let html = '';
  for(let i=0;i<40;i++){
    const x = Math.round(Math.random()*800), y = Math.round(Math.random()*260);
    const r = (Math.random()*1.3+0.5).toFixed(1);
    html += `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" style="animation-delay:${(Math.random()*2.6).toFixed(2)}s"/>`;
  }
  g.innerHTML = html;
}
function buildCityRain(){
  if(cityRainBuilt) return; cityRainBuilt = true;
  const g = document.getElementById('cityRain');
  let html = '';
  for(let i=0;i<26;i++){
    const x = Math.round(Math.random()*820)-10;
    const len = Math.round(Math.random()*10+10);
    const dur = (Math.random()*.4+.4).toFixed(2);
    html += `<line x1="${x}" y1="0" x2="${x-6}" y2="${len}" style="animation-duration:${dur}s; animation-delay:${(Math.random()*.6).toFixed(2)}s"/>`;
  }
  g.innerHTML = html;
}
function buildCityWindows(){
  if(cityWindowsBuilt) return; cityWindowsBuilt = true;
  const g = document.getElementById('cityWindowsSmall');
  const buildings = [ {x:130,y:230,w:60,h:170}, {x:210,y:180,w:70,h:220}, {x:300,y:250,w:55,h:150}, {x:470,y:200,w:65,h:200}, {x:555,y:240,w:55,h:160}, {x:630,y:170,w:70,h:230} ];
  let html='';
  buildings.forEach(b=>{
    for(let wy=b.y+14; wy<b.y+b.h-14; wy+=22){
      for(let wx=b.x+8; wx<b.x+b.w-8; wx+=16){
        const lit = Math.random()>0.45;
        html += `<rect x="${wx}" y="${wy}" width="8" height="10" class="${lit?'lit':''}"/>`;
      }
    }
  });
  g.innerHTML = html;
}
function buildCityFlowers(){
  if(cityFlowersBuilt) return; cityFlowersBuilt = true;
  const g = document.getElementById('cityFlowers');
  const colors = ['#ff7ab6','#ffd76b','#8b6bff','#ff8098','#7bd68a'];
  let html='';
  for(let i=0;i<14;i++){
    const x = Math.round(Math.random()*760+20);
    const y = Math.round(Math.random()*30+405);
    const c = colors[Math.floor(Math.random()*colors.length)];
    html += `<circle cx="${x}" cy="${y}" r="4" fill="${c}"/>`;
  }
  g.innerHTML = html;
}
function buildCityNeonLines(){
  if(cityNeonBuilt) return; cityNeonBuilt = true;
  const g = document.getElementById('cityNeonLines');
  if(!g) return;
  const buildings = [
    {x:120,y:170,w:60,h:230}, {x:200,y:120,w:75,h:280}, {x:300,y:200,w:55,h:200},
    {x:460,y:140,w:70,h:260}, {x:550,y:190,w:58,h:210}, {x:625,y:100,w:75,h:300},
  ];
  let html='';
  buildings.forEach(b=>{
    html += `<line x1="${b.x}" y1="${b.y}" x2="${b.x}" y2="${b.y+b.h}" class="neon-line"/>`;
    html += `<line x1="${b.x+b.w}" y1="${b.y}" x2="${b.x+b.w}" y2="${b.y+b.h}" class="neon-line"/>`;
    html += `<line x1="${b.x}" y1="${b.y}" x2="${b.x+b.w}" y2="${b.y}" class="neon-line"/>`;
  });
  g.innerHTML = html;
}
function getCityPhase(){
  const now = new Date();
  const h = now.getHours(), m = now.getMinutes();
  const mins = h*60+m;
  const [sunRise, sunSet] = getSeasonalSunTimes();
  const sr=Math.floor(sunRise/60), ss=Math.floor(sunSet/60);
  if(h>=3 && mins<sunRise-60) return 'predawn1';
  if(mins>=sunRise-60 && mins<sunRise) return 'predawn2';
  if(mins>=sunRise && mins<sunRise+180) return 'sunrise';
  if(mins>=sunRise+180 && mins<sunSet-60) return 'midday';
  if(mins>=sunSet-60 && mins<sunSet+60) return 'sunset';
  if(mins>=sunSet+60 && mins<sunSet+180) return 'moonrise';
  return 'night';
}
const CITY_DARK_PHASES = ['night','predawn1','predawn2','sunset','moonrise'];
function isNightNow(){ return getCityPhase()==='night'; }
function isCityDark(){ return CITY_DARK_PHASES.includes(getCityPhase()); }

/* continuous real-time sun/moon arc — synced to the device clock, no fixed jumps */
const CITY_ARC_LOW = 220;
// Seasonal sunrise/sunset based on month (approximate for Iran latitude ~35°N)
function getSeasonalSunTimes(){
  const m = new Date().getMonth()+1; // 1-12
  // [sunriseMinutes, sunsetMinutes]
  const table = {
    1:[7*60+30,17*60],  2:[7*60,17*60+30], 3:[6*60+30,18*60],
    4:[6*60,18*60+30],  5:[5*60+30,19*60], 6:[5*60,19*60+30],
    7:[5*60+15,19*60+15],8:[5*60+45,18*60+30],9:[6*60+15,17*60+45],
    10:[6*60+45,17*60], 11:[7*60+15,16*60+45],12:[7*60+30,16*60+30]
  };
  return table[m] || [7*60, 18*60];
}
function getCelestialState(){
  const now = new Date();
  const mins = now.getHours()*60 + now.getMinutes() + now.getSeconds()/60;
  const [sunRise, sunSet] = getSeasonalSunTimes();
  const moonRise = sunSet + 60; // moon rises ~1h after sunset
  const moonSet = sunRise - 60 + 1440; // moon sets ~1h before sunrise (next day)

  let sunVisible=false, sunProgress=0;
  if(mins>=sunRise && mins<=sunSet){
    sunVisible=true;
    sunProgress=(mins-sunRise)/(sunSet-sunRise);
  }
  const moonMins = mins < moonRise ? mins+1440 : mins;
  const moonSpan = moonSet - moonRise;
  let moonVisible=false, moonProgress=0;
  if(moonMins>=moonRise && moonMins<=(moonRise+moonSpan)){
    moonVisible=true;
    moonProgress=(moonMins-moonRise)/moonSpan;
  }
  return { sunVisible, sunProgress, moonVisible, moonProgress };
}

function updateCelestialPosition(instant){
  const rig = document.getElementById('citySunMoonRig');
  if(!rig) return;
  const { sunVisible, sunProgress, moonVisible, moonProgress } = getCelestialState();
  let translateY = CITY_ARC_LOW, sunOpacity = 0, moonOpacity = 0;
  if(sunVisible){
    translateY = CITY_ARC_LOW * (1 - Math.sin(Math.PI*sunProgress));
    sunOpacity = 1;
  } else if(moonVisible){
    translateY = CITY_ARC_LOW * (1 - Math.sin(Math.PI*moonProgress));
    moonOpacity = 1;
  }
  if(instant || !window.__citySunMoonInited){
    rig.style.transition = 'none';
    window.__citySunMoonInited = true;
    requestAnimationFrame(()=>{ rig.style.transition = 'transform 30s linear, opacity 2s ease'; });
  } else {
    rig.style.transition = 'transform 30s linear, opacity 2s ease';
  }
  rig.style.transform = `translateY(${translateY.toFixed(1)}px)`;
  const sunEl = document.getElementById('citySun'), glowEl = document.getElementById('citySunGlow'), moonEl = document.getElementById('cityMoon');
  if(sunEl) sunEl.style.opacity = sunOpacity;
  if(glowEl) glowEl.style.opacity = sunOpacity;
  if(moonEl) moonEl.style.opacity = moonOpacity;
}
// Update celestial every 30 seconds for smooth movement (only while the city is on screen)
setInterval(()=>{ if(document.getElementById('view-city')?.classList.contains('active')) updateCelestialPosition(); }, 30000);

const CITY_BONUS_SLOTS = [
  {x:100,y:414}, {x:195,y:410}, {x:290,y:414}, {x:385,y:410},
  {x:480,y:414}, {x:575,y:410}, {x:670,y:414}, {x:735,y:410},
];
/* Vector art for Life City bonus items — drawn as real objects (grounded with
   shadows) instead of emoji glyphs, which rendered inconsistently and could
   show as empty boxes on some devices. Each shape is centered at (0,0) with
   the ground at y=0, and is placed via a translate transform. */
function cityBonusArt(type){
  switch(type){
    case 'tree':
      return `<ellipse cx="0" cy="1" rx="17" ry="4.5" fill="#000" opacity=".22"/>
        <rect x="-2.5" y="-16" width="5" height="16" rx="2" fill="#7a4a2b"/>
        <circle cx="0" cy="-26" r="15" fill="#3fae6a"/>
        <circle cx="-9" cy="-18" r="10" fill="#379d5d"/>
        <circle cx="9" cy="-18" r="9" fill="#45b96f"/>
        <circle cx="0" cy="-34" r="11" fill="#4fc07a"/>`;
    case 'bench':
      return `<ellipse cx="0" cy="1" rx="21" ry="4.5" fill="#000" opacity=".22"/>
        <rect x="-20" y="-12" width="40" height="5" rx="2.5" fill="#c08a52"/>
        <rect x="-20" y="-24" width="40" height="7" rx="3" fill="#8a5a34"/>
        <rect x="-17" y="-7" width="4" height="7" fill="#6b4a2b"/>
        <rect x="13" y="-7" width="4" height="7" fill="#6b4a2b"/>
        <rect x="-17" y="-24" width="4" height="12" fill="#6b4a2b"/>
        <rect x="13" y="-24" width="4" height="12" fill="#6b4a2b"/>`;
    case 'lamp':
      return `<ellipse cx="0" cy="1" rx="13" ry="3.5" fill="#000" opacity=".22"/>
        <rect x="-2" y="-46" width="4" height="46" rx="2" fill="#4a5578"/>
        <path d="M-5,-44 L5,-44 L4,-51 L-4,-51 Z" fill="#3a4260"/>
        <circle cx="0" cy="-46" r="5" fill="#ffd76b"/>
        <circle cx="0" cy="-46" r="12" fill="#ffd76b" opacity=".25" class="lamp-glow"/>
        <ellipse cx="0" cy="1" rx="20" ry="5" fill="#ffd76b" opacity=".10"/>`;
    case 'fountain':
      return `<ellipse cx="0" cy="1" rx="21" ry="5" fill="#000" opacity=".22"/>
        <ellipse cx="0" cy="-1" rx="20" ry="6" fill="#a8b0c4"/>
        <ellipse cx="0" cy="-3" rx="16" ry="4" fill="#5a9ec8"/>
        <rect x="-2" y="-22" width="4" height="18" fill="#c2c9da"/>
        <ellipse cx="0" cy="-23" rx="8" ry="3.5" fill="#c2c9da"/>
        <path d="M-7,-26 q0,-16 7,-16 q7,0 7,16" fill="none" stroke="#dff4ff" stroke-width="2" opacity=".85" class="fountain-arc"/>
        <circle cx="0" cy="-24" r="2.2" fill="#dff4ff"/>`;
    case 'building':
      return `<ellipse cx="0" cy="1" rx="17" ry="4.5" fill="#000" opacity=".22"/>
        <rect x="-14" y="-42" width="28" height="42" rx="2" fill="#7f8aa8"/>
        <rect x="-11" y="-48" width="22" height="6" rx="1.5" fill="#5f6a88"/>
        <rect x="-10" y="-36" width="6" height="6" fill="#ffd76b" class="bonus-win lit"/>
        <rect x="4" y="-36" width="6" height="6" fill="#4a5470"/>
        <rect x="-10" y="-25" width="6" height="6" fill="#4a5470"/>
        <rect x="4" y="-25" width="6" height="6" fill="#ffd76b" class="bonus-win lit"/>
        <rect x="-3" y="-16" width="6" height="16" fill="#4a3a28"/>`;
    default:
      return `<ellipse cx="0" cy="1" rx="14" ry="4" fill="#000" opacity=".22"/>
        <circle cx="0" cy="-10" r="10" fill="#8b6bff"/>`;
  }
}
function renderCityBonusItems(){
  const g = document.getElementById('cityBonusItems');
  if(!g) return;
  const items = (DB.cityBonusItems||[]).slice(0, CITY_BONUS_SLOTS.length);
  g.innerHTML = items.map((type,i)=>{
    const pos = CITY_BONUS_SLOTS[i];
    return `<g class="city-bonus" transform="translate(${pos.x},${pos.y})">${cityBonusArt(type)}</g>`;
  }).join('');
}
function renderCityScene(){
  const frame = document.getElementById('cityFrame');
  if(!frame) return;
  buildCityStars(); buildCityRain(); buildCityWindows(); buildCityFlowers(); buildCityNeonLines();
  renderCityBonusItems();
  updateCelestialPosition();

  const stage = getCityStage(DB.level);
  frame.setAttribute('data-structure', stage.structureKey);
  frame.setAttribute('data-acc-car', (DB.level>=30 && stage.structureKey==='house') ? '1':'0');
  frame.setAttribute('data-acc-garden', (DB.level>=50 && stage.structureKey==='house') ? '1':'0');

  const ach = getCityAchievements();
  frame.setAttribute('data-ach-waterfall', ach.waterfall?'1':'0');
  frame.setAttribute('data-ach-bridge', ach.bridge?'1':'0');
  frame.setAttribute('data-ach-statue', ach.statue?'1':'0');
  frame.setAttribute('data-ach-flowers', ach.flowers?'1':'0');

  const phase = getCityPhase();
  syncCityAudioToScene();
  frame.setAttribute('data-phase', phase);
  frame.classList.toggle('city-night', phase==='night');
  frame.classList.toggle('city-dark', CITY_DARK_PHASES.includes(phase));
  frame.classList.toggle('city-rain-active', window.__cityRainOn);

  const phaseLabel = {
    predawn1:'🌌 قبل از سحر', predawn2:'🌄 نزدیک سحر', sunrise:'🌅 طلوع آفتاب',
    midday:'☀️ ظهر', sunset:'🌇 غروب آفتاب', moonrise:'🌆 طلوع ماه', night:'🌙 شب',
  }[phase];
  document.getElementById('cityStageSub').textContent = `Level ${DB.level} — ${stage.icon} ${stage.name} · ${phaseLabel}`;

  const listEl = document.getElementById('cityStageList');
  listEl.innerHTML = CITY_STAGES.map(s=>{
    const done = DB.level >= s.lv;
    return `<div class="milestone-row ${done?'done':'locked'}">
      <div class="milestone-ic">${s.icon}</div>
      <div class="milestone-info"><div class="milestone-name">${s.name}</div><div class="milestone-lv">Lv ${s.lv}</div></div>
      ${done?'<div class="milestone-check">✓</div>':''}
    </div>`;
  }).join('');

  const achList = [
    {done:ach.waterfall, icon:'💦', name:'آبشار', desc:'بیشترین استریک ۱۰۰ روز'},
    {done:ach.bridge, icon:'🌉', name:'پل', desc:'رسیدن به سطح ۲۰'},
    {done:ach.statue, icon:'🗿', name:'مجسمه', desc:'۱۰۰۰ XP در طول مسیر'},
    {done:ach.flowers, icon:'🌸', name:'شکوفه‌های باغچه', desc:'یک هفته همه‌ی تسک‌ها انجام بشه'},
  ];
  document.getElementById('cityAchList').innerHTML = achList.map(a=>`<div class="milestone-row ${a.done?'done':'locked'}">
    <div class="milestone-ic">${a.icon}</div>
    <div class="milestone-info"><div class="milestone-name">${a.name}</div><div class="milestone-lv">${a.desc}</div></div>
    ${a.done?'<div class="milestone-check">✓</div>':''}
  </div>`).join('');
}

window.__cityRainOn = false;
function toggleCityRain(){
  window.__cityRainOn = !window.__cityRainOn;
  document.getElementById('cityRainBtn').textContent = window.__cityRainOn ? '☔' : '🌦️';
  renderCityScene();
  syncCityAudioToScene();
}

/* ============ LIFE CITY AUDIO v7 ============ */
window.__citySoundOn=false; window.__cityAudioEl=null; window.__cityAudioCtx=null; window.__cityAudioGraph=null; window.__cityCurrentTrack=null;
window.__CITY_TRACKS = {day:['audio/city_day.ogg'], night:['audio/city_night.ogg'], rain:['audio/city_rain.ogg']};
function citySceneSoundKind(){
  if(window.__cityRainOn)return 'rain';
  return isNightNow()?'night':'day';
}
function cityAudioPrime(){
  if(window.__cityAudioEl)return;
  window.__cityAudioEl=new Audio(); window.__cityAudioEl.preload='auto'; window.__cityAudioEl.crossOrigin='anonymous'; window.__cityAudioEl.volume=.55;
  window.__cityAudioEl.addEventListener('ended',()=>{ if(window.__citySoundOn) playNextCityTrack(true); });
  try{
    window.__cityAudioCtx=new (window.AudioContext||window.webkitAudioContext)();
    const src=window.__cityAudioCtx.createMediaElementSource(window.__cityAudioEl);
    const filter=window.__cityAudioCtx.createBiquadFilter(); filter.type='lowpass'; filter.frequency.value=9000; filter.Q.value=.3;
    const panner=window.__cityAudioCtx.createStereoPanner();
    const master=window.__cityAudioCtx.createGain(); master.gain.value=.92;
    const delay=window.__cityAudioCtx.createDelay(1.0); delay.delayTime.value=.07;
    const feedback=window.__cityAudioCtx.createGain(); feedback.gain.value=.12;
    src.connect(filter); filter.connect(panner); panner.connect(master); panner.connect(delay); delay.connect(feedback); feedback.connect(delay); delay.connect(master); master.connect(window.__cityAudioCtx.destination);
    window.__cityAudioGraph={src,filter,panner,master};
    let phase=0;
    setInterval(()=>{
      if(!window.__cityAudioGraph||!window.__citySoundOn)return;
      phase+=.31; const pan=Math.sin(phase)*.16; window.__cityAudioGraph.panner.pan.setTargetAtTime(pan,window.__cityAudioCtx.currentTime,.55);
      const cutoff=citySceneSoundKind()==='rain'?10500:(isNightNow()?6500:9000); window.__cityAudioGraph.filter.frequency.setTargetAtTime(cutoff,window.__cityAudioCtx.currentTime,.8);
    },1200);
  }catch(_){ window.__cityAudioGraph=null; }
}
function chooseCityTrack(kind,avoid=''){
  const tracks=window.__CITY_TRACKS||{}; const pool=tracks[kind]||tracks.day; const choices=pool.filter(x=>x!==avoid); return choices[Math.floor(Math.random()*choices.length)]||pool[0];
}
async function playNextCityTrack(forceDifferent=false){
  if(!window.__citySoundOn)return;
  cityAudioPrime(); if(!window.__cityAudioEl)return;
  const kind=citySceneSoundKind();
  const path=chooseCityTrack(kind,forceDifferent?window.__cityCurrentTrack:''); window.__cityCurrentTrack=path;
  window.__cityAudioEl.src=path;
  window.__cityAudioEl.currentTime=0;
  try{ await window.__cityAudioCtx?.resume(); await window.__cityAudioEl.play(); }catch(_){
    window.__citySoundOn=false; updateCityAudioUi();
    toast('🎧 برای پخش صدا، یک‌بار روی دکمه صدا بزن');
  }
}
function stopCityAmbience(){
  if(window.__cityAudioEl){ try{window.__cityAudioEl.pause();window.__cityAudioEl.currentTime=0;window.__cityAudioEl.removeAttribute('src');window.__cityAudioEl.load();}catch(_){} }
  try{window.__cityAudioCtx?.suspend();}catch(_){ }
  window.__cityCurrentTrack=null;
}
function updateCityAudioUi(){
  const b=document.getElementById('citySoundBtn'); if(b)b.textContent=window.__citySoundOn?'🔊':'🔇';
  const frame=document.getElementById('cityFrame'); if(frame)frame.classList.toggle('city-audio-on',window.__citySoundOn);
}
async function startCityAmbienceFromGesture(){
  window.__citySoundOn=true;
  updateCityAudioUi();
  await playNextCityTrack(false);
}
async function toggleCitySound(){
  window.__citySoundOn=!window.__citySoundOn; updateCityAudioUi();
  if(window.__citySoundOn) await playNextCityTrack(false); else stopCityAmbience();
}
function syncCityAudioToScene(){
  if(!window.__citySoundOn||!window.__cityAudioEl)return;
  const desired=citySceneSoundKind();
  const tracks=window.__CITY_TRACKS||{}; const currentKind=Object.keys(tracks).find(k=>tracks[k].includes(window.__cityCurrentTrack));
  if(desired!==currentKind) playNextCityTrack(true);
}

/* Life City depth/parallax controller */
(function initCityDepth(){
  const frame=document.getElementById('cityFrame'); if(!frame||frame.__v7Depth)return; frame.__v7Depth=true;
  let raf=0;
  const apply=(x,y)=>{cancelAnimationFrame(raf); raf=requestAnimationFrame(()=>{const rx=(y-.5)*-2.3, ry=(x-.5)*2.8; frame.style.setProperty('--city-tilt-x',rx.toFixed(2)+'deg'); frame.style.setProperty('--city-tilt-y',ry.toFixed(2)+'deg');});};
  frame.addEventListener('pointermove',e=>{const r=frame.getBoundingClientRect();apply((e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);},{passive:true});
  frame.addEventListener('pointerleave',()=>apply(.5,.5),{passive:true});
})();

/* ============ MOTIVATIONAL QUOTES ============ */
const MOOD_META = {
  strict:{icon:'🔥', label:'سخت‌گیر'},
  energize:{icon:'⚡', label:'شارژکننده'},
  calm:{icon:'🧘', label:'آرام'},
  focus:{icon:'🎯', label:'تمرکزی'},
  supportive:{icon:'💪', label:'حمایتی'},
};
const MOTIVATION_QUOTES = {
  strict:[
    'هیچ‌کس قرار نیست بیاد زندگیت رو برات بسازه. خودت بلند شو و بسازش. ⚡',
    'امروزت رو هدر نده و فردای خودت رو مجبور نکن حسرت امروز رو بخوره.',
    'قرار نیست همیشه انگیزه داشته باشی؛ قرارِ تو اینه که حتی بدون انگیزه هم ادامه بدی. 🔥',
    'به خودت ثابت کن وقتی گفتی «انجامش میدم»، واقعاً منظورت انجام دادنش بوده.',
    'اگر امروز فقط یک کار مهم انجام بدی، بذار همون کاری باشه که بیشتر از همه ازش فرار کردی. 😈',
    'شروع ناقص، از برنامه‌ریزی بی‌پایان بهتره. همین الان یک قدم بردار.',
    'نذار چند دقیقه سخت، کل روزت رو تعریف کنه. برگرد به مسیر. ⚡',
    'انضباط یعنی وقتی حوصله نداری هم به چیزی که برای خودت مهمه احترام بذاری.',
    'کاری که امروز عقب می‌اندازی، فردا سبک‌تر نمی‌شه؛ فقط تبدیل به بار بیشتری می‌شه.',
    'به جای اینکه منتظر نسخه بهتر خودت باشی، امروز مثل همون نسخه رفتار کن.'
  ],
  energize:[
    'حوصله داشتن شرط شروع نیست؛ شروع کن، حوصله خودش میاد.',
    'هر بار که بهانه‌ات رو شکست میدی، داری نسخه قوی‌تری از خودت می‌سازی. 💪',
    'اون حس خوبی که بعد از تمام کردن کار میاد، ارزش چند دقیقه شروع سخت رو داره. برو.',
    'وقته از حالت «باید انجامش بدم» بری به حالت «انجامش دادم».',
    'بلند شو. برنامه‌ات منتظرته. هدفت منتظرته. نسخه بهتر خودت هم منتظرته. شروع کن. 🚀',
    'فقط قدم اول رو بردار؛ لازم نیست کل مسیر رو همین الان ببینی.',
    'امروز یک برد کوچک بساز. بردهای کوچک، روزهای بزرگ می‌سازن. 🏆',
    'اگه شروعش سخته، فقط پنج دقیقه انجامش بده. پنج دقیقه هم حساب می‌شه.',
    'تو لازم نیست سریع‌ترین باشی؛ فقط لازم نیست متوقف بشی.',
    'یک ساعت خوب امروز، می‌تونه حس کل روزت رو عوض کنه. شروع کن.'
  ],
  calm:[
    'امروز قرار نیست فوق‌العاده باشی؛ فقط قرار نیست تسلیم تنبلی بشی.',
    'آینده‌ات با تصمیم‌های بزرگ ساخته نمی‌شه؛ با کارهای کوچیکی ساخته می‌شه که هر روز انجام میدی.',
    'پنج دقیقه اول رو شروع کن. لازم نیست کل کوه رو امروز جابه‌جا کنی.',
    'آروم جلو رفتن با عقب موندن فرق داره؛ تا وقتی جلو می‌ری، هنوز توی مسیری.',
    'یک کار رو انتخاب کن، نفس بکش و فقط همون یکی رو انجام بده. 🌱',
    'لازم نیست امروز همه‌چیز رو درست کنی؛ فقط یک چیز رو بهتر کن.',
    'استراحت واقعی بخشی از مسیر پیشرفته، نه دشمنشه.'
  ],
  focus:[
    'اون کاری که داری عقب می‌اندازی؟ دقیقاً همون کاریه که باید همین الان انجامش بدی.',
    'گوشی رو بذار کنار. هدفت هنوز همونجاست که گذاشتیش. برو سراغش. 📱❌',
    'یک ساعت تمرکز امروز می‌تونه از ده ساعت «فردا انجامش میدم» باارزش‌تر باشه.',
    'اگر هدفت برات مهمه، امروز حداقل یک قدم براش بردار. حتی یک قدم. 🎯',
    'حواست رو از نتیجه بردار و بذار روی همین ده دقیقه‌ای که جلوت قرار داره.',
    'هر بار که حواست رو برمی‌گردونی، داری عضله تمرکزت رو قوی‌تر می‌کنی.',
    'یک کار، یک بازه زمانی، بدون حواس‌پرتی. همین فرمول ساده رو اجرا کن. 🎯',
    'شروع کن و اجازه بده تمرکزت بعد از چند دقیقه خودش شکل بگیره.'
  ],
  supportive:[
    'اگر فقط وقتی حال داشتی کار کنی، نصف رؤیاهات هیچ‌وقت ساخته نمی‌شن.',
    'تو برای کامل بودن شروع نکردی؛ برای بهتر شدن شروع کردی. پس ادامه بده.',
    'تو دنبال یک روز بی‌نقص نیستی؛ دنبال روزیه که شبش بگی «امروز واقعاً تلاش کردم.» 🌙',
    'اگر امروز سخت بود، معنیش این نیست که شکست خوردی؛ معنیش اینه که امروز سخت بود.',
    'یک قدم کوچک هم هنوز یک قدم به جلوئه. خودت رو با سرعت بقیه نسنج.',
    'روزهای ضعیف هم جزئی از مسیرن؛ مهم اینه که دوباره برگردی.',
    'با خودت مثل کسی رفتار کن که واقعاً می‌خواد رشدت رو ببینه: صادق، صبور و پیگیر. 💎',
    'لازم نیست امروز همه‌چیز عالی پیش بره تا ارزش تلاش کردنت حفظ بشه.'
  ],
};
function pickDailyQuote(mood){
  const arr = MOTIVATION_QUOTES[mood] || MOTIVATION_QUOTES.energize;
  const seed = todayISO()+mood;
  let hash = 0;
  for(let i=0;i<seed.length;i++){ hash = seed.charCodeAt(i) + ((hash<<5)-hash); }
  return arr[Math.abs(hash) % arr.length];
}
function renderMotivation(){ if(!DB.motivation || typeof DB.motivation!=='object') DB.motivation={mood:'energize',custom:''}; if(typeof DB.motivation.custom!=='string') DB.motivation.custom=''; const mood=DB.motivation.mood||'energize'; const meta=MOOD_META[mood]||MOOD_META.energize; const q=document.getElementById('motivationText'); if(!q)return; q.textContent=DB.motivation.custom.trim()||pickDailyQuote(mood); document.getElementById('motivationMoodLabel').textContent=DB.motivation.custom.trim()?'💬 سفارشی':`${meta.icon} ${meta.label}`; }
function toggleMoodPicker(){
  const el = document.getElementById('moodPicker');
  const isHidden = !el.style.display || el.style.display==='none';
  if(isHidden){
    el.querySelectorAll('.chip-opt').forEach(o=>o.classList.toggle('sel', o.dataset.mood===DB.motivation.mood));
    el.style.display = 'flex';
  } else {
    el.style.display = 'none';
  }
}
function setMoodPref(mood){
  DB.motivation.mood = mood;
  save();
  renderMotivation();
  const el = document.getElementById('moodPicker');
  if(el) el.style.display = 'none';
  toast('✅ حال‌وهوای پیام انگیزشی عوض شد');
}

const QUEST_TIERS = {
  easy:   { label:'Easy Quest',   xp:5,  color:'#2ee6a6', icon:'🟢', weight:45 },
  normal: { label:'Normal Quest', xp:10, color:'#4d7fff', icon:'🔵', weight:35 },
  rare:   { label:'Rare Quest',   xp:20, color:'#8b6bff', icon:'🟣', weight:15 },
  epic:   { label:'Epic Quest',   xp:50, color:'#ffcc33', icon:'🟡', weight:5 },
  bonus:  { label:'Special Quest', xp:75, color:'#ff8098', icon:'🎁', weight:0 },
};
const QUEST_POOL = {
  easy:[
    {id:'e1', icon:'🥤', text:'یک لیوان آب بنوش.'},
    {id:'e2', icon:'🚶', text:'۳ دقیقه راه برو.'},
    {id:'e3', icon:'👀', text:'۲۰ ثانیه به نقطه‌ای دور نگاه کن و به چشمت استراحت بده.'},
    {id:'e4', icon:'🧹', text:'میز کارت را ۲ دقیقه مرتب کن.'},
    {id:'e5', icon:'🌬️', text:'۵ نفس عمیق و آرام بکش.'},
    {id:'e6', icon:'🎵', text:'یک آهنگ آرامش‌بخش گوش بده.'},
    {id:'e7', icon:'🗑️', text:'یک وسیله یا زباله اضافه را از اتاقت جمع کن.'},
    {id:'e8', icon:'💧', text:'صورتت را با آب بشور یا کمی آب به دست و صورتت بزن.'},
    {id:'e9', icon:'🍎', text:'یک میان‌وعده سالم بخور (مثل میوه یا مغزها).'},
    {id:'e10', icon:'🌞', text:'اگر امکانش هست ۲ دقیقه کنار پنجره یا در هوای آزاد باش.'},
    {id:'e11', icon:'🎯', text:'یک کار کمتر از ۲ دقیقه‌ای را همین الان کامل کن.'},
    {id:'e12', icon:'🧹', text:'یک کشو یا بخش کوچیک از اتاقت رو مرتب کن.'},
    {id:'e13', icon:'💡', text:'یک ایده‌ای که مدت‌ها تو ذهنت بوده رو یادداشت کن.'},
    {id:'e14', icon:'🎒', text:'کیف یا میزت رو برای فردا آماده کن.'},
    {id:'e15', icon:'🌱', text:'به یک گیاه رسیدگی کن یا اگر نداری، چند دقیقه کنار پنجره باش.'},
    {id:'e16', icon:'🌙', text:'قبل از اینکه Quest بعدی بیاد، یک دقیقه هیچ کاری نکن و فقط به محیط اطرافت توجه کن.'},
    {id:'e17', icon:'🧠', text:'یک چیز جدید که امروز یاد گرفتی رو در یک جمله ثبت کن.'},
    {id:'e18', icon:'🚶', text:'یه دور کوتاه توی خونه راه برو.'},
    {id:'e19', icon:'🧹', text:'۵ دقیقه اتاقت رو مرتب کن.'},
    {id:'e20', icon:'📺', text:'یک قسمت کوتاه یا چند دقیقه تلویزیون ببین.'},
    {id:'e21', icon:'😌', text:'۵ دقیقه استراحت واقعی داشته باش؛ بدون گوشی.'},

  ],
  normal:[
    {id:'n1', icon:'🤸', text:'۱۰ حرکت کششی انجام بده.'},
    {id:'n2', icon:'📖', text:'۲ صفحه کتاب بخوان.'},
    {id:'n3', icon:'📝', text:'یک جمله درباره هدفت امروز بنویس.'},
    {id:'n4', icon:'📵', text:'۵ دقیقه گوشی را کنار بگذار.'},
    {id:'n5', icon:'😄', text:'به یک اتفاق خوب امروز فکر کن و ثبتش کن.'},
    {id:'n6', icon:'📚', text:'۵ دقیقه روی مهم‌ترین کارت تمرکز کن.'},
    {id:'n7', icon:'🎮', text:'اگر در دسترسه، ۱۰ دقیقه با کنسول یا کامپیوتر سرگرم شو.'},
    {id:'n8', icon:'🏃', text:'۵ دقیقه فعالیت ورزشی سبک انجام بده؛ مثل اسکات، کشش یا راه رفتن تند.'},
    {id:'n9', icon:'📝', text:'برای یکی از ویدیوهای آینده‌ات یک سناریوی کوتاه بنویس.'},
    {id:'n10', icon:'📚', text:'۱۰ دقیقه مطالعه کن.'},
    {id:'n11', icon:'🎲', text:'۱۰ دقیقه یک سرگرمی غیرموبایلی انجام بده؛ مثل کتاب، نقاشی یا بازی رومیزی.'},

    {id:'n12', icon:'🧘', text:'۲ دقیقه مدیتیشن یا آرام‌سازی انجام بده.'},
    {id:'n13', icon:'📱', text:'۱۰ دقیقه نوتیفیکیشن‌های غیرضروری گوشیت رو خاموش کن.'},
    {id:'n14', icon:'🖥️', text:'یک فایل، عکس یا برنامه‌ای که دیگه لازم نداری رو مرتب یا حذف کن.'},
    {id:'n15', icon:'🧩', text:'۵ دقیقه یک معما، پازل، سودوکو یا بازی فکری انجام بده.'},
    {id:'n16', icon:'🎯', text:'کوچک‌ترین کاری که امروز عقب انداختی رو همین الان انجام بده.'},
  ],
  rare:[
    {id:'r1', icon:'💪', text:'۱۰ تا شنا یا ۱۵ تا اسکوات (هرکدام که راحت‌تری).'},
    {id:'r2', icon:'✉️', text:'یک کار کوچک که مدت‌ها عقب انداختی را انجام بده.'},
    {id:'r3', icon:'📴', text:'۱۵ دقیقه کامل بدون گوشی سپری کن.'},
  ],
  epic:[
    {id:'ep1', icon:'🌆', text:'تمام تسک‌های امروزت را تا قبل از ساعت ۸ شب کامل کن.'},
    {id:'ep2', icon:'🔥', text:'امروز هیچ تسک بحرانی رو نادیده نذار و انجامش بده.'},
    {id:'ep3', icon:'⏳', text:'بدون هیچ وقفه‌ای ۲۵ دقیقه رو یه کار مشخص کار کن.'},
  ],
};
function shuffle(arr){
  const a = [...arr];
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function pickWeightedTier(){
  const entries = Object.entries(QUEST_TIERS);
  const total = entries.reduce((s,[,t])=>s+t.weight,0);
  let r = Math.random()*total;
  for(const [key,t] of entries){ if(r < t.weight) return key; r -= t.weight; }
  return entries[0][0];
}
function generateQuest(){
  const tier = pickWeightedTier();
  if(!DB.quest.bags[tier] || !DB.quest.bags[tier].length){
    DB.quest.bags[tier] = shuffle(QUEST_POOL[tier].map(q=>q.id));
  }
  const id = DB.quest.bags[tier].pop();
  const def = QUEST_POOL[tier].find(q=>q.id===id);
  DB.quest.current = { tier, id, text:def.text, icon:def.icon, xp:QUEST_TIERS[tier].xp };
}
function completeQuest(){
  if(!DB.quest.current) return;
  const q = DB.quest.current;
  DB.quest.current = null;
  DB.quest.waitStart = Date.now();
  DB.quest.nextAt = Date.now() + 10*60*1000;
  DB.stats.questsCompleted = (DB.stats.questsCompleted||0) + 1;
  const d = todayISO();
  DB.stats.questsCompletedByDate[d] = (DB.stats.questsCompletedByDate[d]||0) + 1;
  const bonus = 1 + 0.1*(DB.skillTiers.questXp||0);
  const xpGain = Math.round(q.xp * bonus);
  addXP(xpGain);
  toast(`✅ آفرین! +${xpGain} XP گرفتی`);
  checkPerfectDay();
  checkNewRecords();
  save();
}
function skipQuest(){
  if(!DB.quest.current) return;
  const q = DB.quest.current;
  const penalty = Math.ceil(q.xp/2);
  DB.quest.current = null;
  DB.quest.waitStart = Date.now();
  DB.quest.nextAt = Date.now() + 10*60*1000;
  addXP(-penalty);
  toast(`⏭️ رد شد — ${penalty} XP کم شد`);
  save();
}
function fmtCountdown(ms){
  if(ms<0) ms=0;
  const totalSec = Math.floor(ms/1000);
  const m = Math.floor(totalSec/60), s = totalSec%60;
  return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}
/* PERF: this runs every second. The card's HTML is only rebuilt when the quest
   actually changes; while waiting, just the countdown text and bar width are
   updated in place, and all DOM work is skipped while the dashboard is hidden
   (quest generation + notifications still happen regardless). */
let __questSig = null, __questCountdownEl = null, __questFillEl = null;
function dashboardActive(){ return !!document.getElementById('view-dashboard')?.classList.contains('active'); }
function renderQuestBox(){
  const now = Date.now();
  if(!DB.quest.current && now >= DB.quest.nextAt){
    generateQuest();
    localStorage.setItem(STORE_KEY, JSON.stringify(DB));
    toast('🎯 یه مأموریت جدید رسید!');
    sendNotification('🎯 مأموریت جدید رسید!', DB.quest.current ? DB.quest.current.text : '');
  }
  const el = document.getElementById('questCard');
  if(!el) return;
  const q = DB.quest.current;
  if(q){
    const sig = 'q|'+q.tier+'|'+q.xp+'|'+q.text;
    if(sig === __questSig) return;
    __questSig = sig; __questCountdownEl = null; __questFillEl = null;
    const meta = QUEST_TIERS[q.tier];
    el.innerHTML = `<div class="quest-box tier-${q.tier}">
      <div class="quest-top">
        <div class="quest-emoji">${q.icon}</div>
        <div class="quest-info">
          <div class="quest-tier-lbl" style="color:${meta.color};">${meta.icon} ${meta.label}</div>
          <div class="quest-title">${esc(q.text)}</div>
        </div>
        <div class="quest-xp" style="color:${meta.color};">+${q.xp} XP</div>
      </div>
      <div class="quest-actions">
        <button class="btn" onclick="completeQuest()">✅ انجامش دادم</button>
        <button class="btn ghost" onclick="skipQuest()">⏭️ ردش کن</button>
      </div>
    </div>`;
  } else {
    const remain = Math.max(0, DB.quest.nextAt - now);
    const totalWait = Math.max(1, DB.quest.nextAt - (DB.quest.waitStart||now));
    const pct = Math.min(100, Math.max(0, 100 - (remain/totalWait)*100));
    if(__questSig !== 'wait'){
      if(!dashboardActive()) return;
      __questSig = 'wait'; __questCountdownEl = null; __questFillEl = null;
      el.innerHTML = `<div class="quest-box">
        <div class="quest-waiting">
          <div class="quest-emoji">⏱️</div>
          <div class="quest-info">
            <div class="quest-tier-lbl" style="color:var(--txt-dim);">🎯 مأموریت بعدی</div>
            <div class="quest-title">تا مأموریت بعدی: <span class="quest-countdown">${fmtCountdown(remain)}</span></div>
          </div>
        </div>
        <div class="quest-wait-track"><div class="quest-wait-fill" style="width:${pct}%"></div></div>
      </div>`;
      return;
    }
    if(!dashboardActive()) return;
    __questCountdownEl = __questCountdownEl || el.querySelector('.quest-countdown');
    __questFillEl = __questFillEl || el.querySelector('.quest-wait-fill');
    const txt = fmtCountdown(remain);
    if(__questCountdownEl && __questCountdownEl.textContent !== txt) __questCountdownEl.textContent = txt;
    if(__questFillEl) __questFillEl.style.width = pct.toFixed(2)+'%';
  }
}
setInterval(renderQuestBox, 1000);

/* ============ POMODORO ============ */
let pomoTab = 'focus';
let pomoPeriod = 'week';

function showPomoTab(tab){
  pomoTab = tab;
  document.querySelectorAll('.pomo-pane').forEach(p=>p.classList.remove('active'));
  document.getElementById('pomoPane-'+tab).classList.add('active');
  if(tab==='focus') renderPomoUI();
  if(tab==='stats'){ renderPomoStats(); renderPomoChart(); }
  if(tab==='manual'){ renderManualPomoData(); }
  if(tab==='settings') fillPomoSettingsForm();
}

function fmtMMSS(ms){
  if(ms<0) ms=0;
  const totalSec = Math.floor(ms/1000);
  const hh = Math.floor(totalSec/3600);
  const mm = Math.floor((totalSec%3600)/60);
  const ss = totalSec%60;
  if(hh>0) return String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0')+':'+String(ss).padStart(2,'0');
  return String(mm).padStart(2,'0')+':'+String(ss).padStart(2,'0');
}

function playPomoChime(){
  try{
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6 — bell-like ascending chime
    notes.forEach((freq,i)=>{
      const t = now + i*0.14;
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      const shimmer = ctx.createOscillator(); const shimmerGain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = freq;
      shimmer.type = 'sine'; shimmer.frequency.value = freq*2.01;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.24, t+0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t+0.9);
      shimmerGain.gain.setValueAtTime(0.0001, t);
      shimmerGain.gain.exponentialRampToValueAtTime(0.05, t+0.02);
      shimmerGain.gain.exponentialRampToValueAtTime(0.0001, t+0.6);
      osc.connect(gain); gain.connect(ctx.destination);
      shimmer.connect(shimmerGain); shimmerGain.connect(ctx.destination);
      osc.start(t); osc.stop(t+0.95);
      shimmer.start(t); shimmer.stop(t+0.65);
    });
    setTimeout(()=>{ try{ ctx.close(); }catch(e){} }, 1700);
  }catch(e){ /* audio unavailable, ignore silently */ }
}

const POMO_XP_PER_MIN = 2;
function addPomoMinutes(kind, minutes, date=todayISO(), opts={}){
  if(minutes<=0) return 0;
  DB.pomodoro.history = DB.pomodoro.history || {};
  const d = date || todayISO();
  DB.pomodoro.history[d] = DB.pomodoro.history[d] || {focus:0, break:0};
  DB.pomodoro.history[d][kind] = (DB.pomodoro.history[d][kind]||0) + minutes;
  if(kind==='focus'){ DB.pomodoro.history[d].sessions = (DB.pomodoro.history[d].sessions||0) + 1; }
  const bonus = 1 + 0.1*(DB.skillTiers.pomoXp||0);
  const xp = Math.round(minutes * POMO_XP_PER_MIN * bonus);
  addXP(xp);
  checkNewRecords();
  return xp;
}
const POMO_GOAL_BONUS_XP = 30;
function checkPomoGoalBonus(){
  const d = todayISO();
  const rec = DB.pomodoro.history[d];
  const goal = DB.pomodoro.settings.goalMinutes;
  if(goal>0 && rec && (rec.focus||0)>=goal && !rec.goalAwarded){
    rec.goalAwarded = true;
    addXP(POMO_GOAL_BONUS_XP);
    setTimeout(()=> toast(`🎯🎉 هدف روزانه‌ی پومودورو کامل شد! +${POMO_GOAL_BONUS_XP} XP`), 1600);
  }
}

function startFocus(){
  const dur = DB.pomodoro.settings.focusMin*60000;
  DB.pomodoro.session = { mode:'focus', status:'running', startAt:Date.now(), endAt: Date.now()+dur, totalMs:dur };
  save();
}
function startBreak(){
  const dur = DB.pomodoro.settings.breakMin*60000;
  DB.pomodoro.session = { mode:'break', status:'running', startAt:Date.now(), endAt: Date.now()+dur, totalMs:dur };
  save();
}
function startInfinite(){
  DB.pomodoro.session = { mode:'infinite', status:'running', startAt: Date.now(), baseElapsedMs:0 };
  save();
  toast('♾️ فوکوس بی‌نهایت فعال شد — هروقت خواستی «پایان و ثبت» رو بزن');
}
function pomoQuickStart(){
  if(DB.pomodoro.session) return;
  const next = DB.pomodoro.pendingNext;
  DB.pomodoro.pendingNext = null;
  if(next==='break') startBreak(); else startFocus();
}
function pauseSession(){
  const s = DB.pomodoro.session; if(!s || s.status!=='running') return;
  if(s.mode==='infinite'){ s.baseElapsedMs = (s.baseElapsedMs||0) + (Date.now()-s.startAt); }
  else { s.remainingMs = s.endAt - Date.now(); }
  s.status = 'paused';
  save();
}
function resumeSession(){
  const s = DB.pomodoro.session; if(!s || s.status!=='paused') return;
  if(s.mode==='infinite'){ s.startAt = Date.now(); }
  else { s.endAt = Date.now() + s.remainingMs; }
  s.status = 'running';
  save();
}
function endSession(){
  const s = DB.pomodoro.session; if(!s) return;
  if(s.mode==='infinite'){
    const elapsedMs = (s.baseElapsedMs||0) + (s.status==='running' ? Date.now()-s.startAt : 0);
    const mins = Math.round(elapsedMs/60000);
    DB.pomodoro.session = null;
    if(mins>0){ addPomoMinutes('focus', mins); toast(`✅ ${mins} دقیقه فوکوس ثبت شد · +${mins*POMO_XP_PER_MIN} XP`); checkPomoGoalBonus(); checkPerfectDay(); }
    save();
  } else {
    const remaining = s.status==='running' ? Math.max(0, s.endAt-Date.now()) : (s.remainingMs||0);
    const elapsedMs = Math.max(0, (s.totalMs||0) - remaining);
    const mins = Math.round(elapsedMs/60000);
    const mode = s.mode;
    DB.pomodoro.session = null;
    if(mins>0){
      addPomoMinutes(mode, mins);
      toast(`✅ ${mins} دقیقه ${mode==='focus'?'فوکوس':'استراحت'} ثبت شد · +${mins*POMO_XP_PER_MIN} XP`);
      if(mode==='focus'){ checkPomoGoalBonus(); checkPerfectDay(); }
    }
    save();
  }
}
function completePomoSession(){
  const s = DB.pomodoro.session; if(!s) return;
  const mode = s.mode;
  const mins = mode==='focus' ? DB.pomodoro.settings.focusMin : DB.pomodoro.settings.breakMin;
  addPomoMinutes(mode, mins);
  if(mode==='focus'){ checkPomoGoalBonus(); checkPerfectDay(); }
  playPomoChime();
  setTimeout(()=>{
    sendNotification(mode==='focus' ? '🔔 فوکوس تموم شد!' : '🔔 استراحت تموم شد!', mode==='focus' ? 'برگرد به برنامه و استراحت رو شروع کن ☕' : 'برگرد به برنامه و فوکوس بعدی رو شروع کن 💪');
  }, 900);
  toast(mode==='focus' ? '🔔 فوکوس تموم شد! هروقت آماده بودی استراحت رو شروع کن ☕' : '🔔 استراحت تموم شد! هروقت آماده بودی فوکوس بعدی رو شروع کن 💪');
  DB.pomodoro.session = null;
  DB.pomodoro.pendingNext = mode==='focus' ? 'break' : 'focus';
  save();
}
function tickPomo(){
  const s = DB.pomodoro.session;
  if(s && s.status==='running' && s.mode!=='infinite' && Date.now()>=s.endAt){
    completePomoSession();
    return;
  }
  if(document.getElementById('view-pomodoro')?.classList.contains('active') && pomoTab==='focus') renderPomoUI();
}
setInterval(tickPomo, 500);

/* PERF: renderPomoUI runs every 500ms while the pomodoro view is open. The
   buttons, classes, labels and hints are now rebuilt only when the session
   state actually changes; in between, only the countdown text node moves. */
let __pomoSig = null;
function renderPomoUI(){
  const circle = document.getElementById('pomoCircle');
  if(!circle) return;
  const timeTxt = document.getElementById('pomoTimeTxt');
  const s = DB.pomodoro.session;
  const sig = s
    ? s.mode+'|'+s.status
    : 'idle|'+(DB.pomodoro.pendingNext||'')+'|'+DB.pomodoro.settings.focusMin+'|'+DB.pomodoro.settings.breakMin;
  if(sig === __pomoSig){
    if(s && s.status==='running' && timeTxt){
      const val = s.mode==='infinite'
        ? fmtMMSS((s.baseElapsedMs||0) + (Date.now()-s.startAt))
        : fmtMMSS(Math.max(0, s.endAt-Date.now()));
      if(timeTxt.textContent !== val) timeTxt.textContent = val;
    }
    return;
  }
  __pomoSig = sig;
  const modeLbl = document.getElementById('pomoModeLbl');
  const hint = document.getElementById('pomoHint');
  const actions = document.getElementById('pomoActions');
  circle.classList.remove('running','break-mode','infinite-mode');
  if(!s){
    const next = DB.pomodoro.pendingNext;
    const isBreakNext = next==='break';
    const nextMin = isBreakNext ? DB.pomodoro.settings.breakMin : DB.pomodoro.settings.focusMin;
    modeLbl.textContent = isBreakNext ? '☕ استراحت' : '🎯 فوکوس';
    timeTxt.textContent = fmtMMSS(nextMin*60000);
    hint.textContent = next
      ? (isBreakNext ? 'فوکوس تموم شد! هروقت آماده بودی استراحت رو شروع کن' : 'استراحت تموم شد! هروقت آماده بودی فوکوس بعدی رو شروع کن')
      : 'برای شروع بزن، یا چند ثانیه روی تایمر نگه‌دار برای فوکوس بی‌نهایت ♾️';
    actions.innerHTML = `<button class="btn" onclick="pomoQuickStart()">▶️ ${isBreakNext?'شروع استراحت':(next?'شروع فوکوس بعدی':'شروع')}</button>`;
    return;
  }
  if(s.mode==='focus' || s.mode==='break'){
    circle.classList.add('running');
    if(s.mode==='break') circle.classList.add('break-mode');
    modeLbl.textContent = s.mode==='focus' ? '🎯 فوکوس' : '☕ استراحت';
    const remain = s.status==='running' ? Math.max(0, s.endAt-Date.now()) : s.remainingMs;
    timeTxt.textContent = fmtMMSS(remain);
    hint.textContent = s.status==='paused' ? '⏸️ روی مکثه' : (s.mode==='focus' ? 'تمرکز کن، تا آخرش کنارتم 🎯' : 'یکم نفس بکش ☕');
    actions.innerHTML = s.status==='running'
      ? `<button class="btn ghost" onclick="pauseSession()">⏸️ مکث</button><button class="btn danger" onclick="endSession()">⏹️ پایان جلسه</button>`
      : `<button class="btn" onclick="resumeSession()">▶️ ادامه</button><button class="btn danger" onclick="endSession()">⏹️ پایان جلسه</button>`;
  } else if(s.mode==='infinite'){
    circle.classList.add('infinite-mode');
    modeLbl.textContent = '♾️ فوکوس بی‌نهایت';
    const elapsedMs = (s.baseElapsedMs||0) + (s.status==='running' ? Date.now()-s.startAt : 0);
    timeTxt.textContent = fmtMMSS(elapsedMs);
    hint.textContent = 'هروقت خواستی تمومش کن، همون مدت برات ثبت می‌شه';
    actions.innerHTML = s.status==='running'
      ? `<button class="btn ghost" onclick="pauseSession()">⏸️ مکث</button><button class="btn" onclick="endSession()">⏹️ پایان و ثبت</button>`
      : `<button class="btn" onclick="resumeSession()">▶️ ادامه</button><button class="btn" onclick="endSession()">⏹️ پایان و ثبت</button>`;
  }
}

function fillPomoSettingsForm(){
  document.getElementById('pomoSetFocus').value = DB.pomodoro.settings.focusMin || 25;
  document.getElementById('pomoSetBreak').value = DB.pomodoro.settings.breakMin || 5;
  if(document.getElementById('pomoSetLongBreak')) document.getElementById('pomoSetLongBreak').value = DB.pomodoro.settings.longBreakMin || 15;
  if(document.getElementById('pomoSetCycleCount')) document.getElementById('pomoSetCycleCount').value = DB.pomodoro.settings.cycleCount || 4;
  document.getElementById('pomoSetGoalH').value = Math.floor((DB.pomodoro.settings.goalMinutes||0)/60);
  document.getElementById('pomoSetGoalM').value = (DB.pomodoro.settings.goalMinutes||0)%60;
  renderPomoNotifyStatus();
}
function savePomoSettings(){
  const f = parseInt(document.getElementById('pomoSetFocus').value) || 25;
  const b = parseInt(document.getElementById('pomoSetBreak').value) || 5;
  const lb = parseInt(document.getElementById('pomoSetLongBreak')?.value) || (DB.pomodoro.settings.longBreakMin || 15);
  const cy = parseInt(document.getElementById('pomoSetCycleCount')?.value) || (DB.pomodoro.settings.cycleCount || 4);
  const gh = parseInt(document.getElementById('pomoSetGoalH').value) || 0;
  const gm = parseInt(document.getElementById('pomoSetGoalM').value) || 0;
  DB.pomodoro.settings = { focusMin:Math.max(1,f), breakMin:Math.max(1,b), longBreakMin:Math.max(1,lb), cycleCount:Math.max(1,cy), goalMinutes:Math.max(0, gh*60+gm) };
  save();
  toast('✅ تنظیمات پومودورو ذخیره شد');
}

function renderManualTaskOptions(){
  const sel=document.getElementById('pomoManualTask'); if(!sel) return;
  const cur=sel.value;
  const tasks=(DB.tasks||[]).filter(t=>!t.inbox && !t.done);
  sel.innerHTML='<option value="">بدون تسک</option>'+tasks.map(t=>`<option value="${esc(t.id)}">${esc(t.title||t.text||'تسک')}</option>`).join('');
  if(tasks.some(t=>String(t.id)===String(cur))) sel.value=cur;
}
function migrateLegacyManualPomoData(){
  if(!Array.isArray(DB.pomodoro?.manualData)) return;
  DB.pomodoro.history=DB.pomodoro.history||{};
  DB.pomodoro.sessionHistory=Array.isArray(DB.pomodoro.sessionHistory)?DB.pomodoro.sessionHistory:[];
  let changed=false;
  for(const m of DB.pomodoro.manualData){
    if(!m || !m.id || m.migratedToHistory) continue;
    const d=m.date||todayISO();
    DB.pomodoro.history[d]=DB.pomodoro.history[d]||{focus:0,break:0};
    DB.pomodoro.history[d][m.kind]=(DB.pomodoro.history[d][m.kind]||0)+(Number(m.minutes)||0);
    if(m.kind==='focus'){
      DB.pomodoro.history[d].sessions=(DB.pomodoro.history[d].sessions||0)+1;
      DB.pomodoro.sessionHistory.unshift({id:m.id,date:d,mode:'focus',minutes:Number(m.minutes)||0,plannedMinutes:Number(m.minutes)||0,taskId:m.taskId||'',startedAt:m.createdAt||Date.now(),endedAt:m.createdAt||Date.now(),pauseCount:0,score:100,note:m.note||'',source:'manual'});
    }
    m.migratedToHistory=true;
    changed=true;
  }
  if(changed){ DB.pomodoro.sessionHistory=DB.pomodoro.sessionHistory.slice(0,500); save(); }
}
function addManualPomoData(){
  const kind=document.getElementById('pomoManualKind')?.value||'focus';
  const minutes=Math.floor(Number(document.getElementById('pomoManualMinutes')?.value||0));
  const date=document.getElementById('pomoManualDate')?.value||todayISO();
  const note=(document.getElementById('pomoManualNote')?.value||'').trim();
  const taskId=kind==='focus' ? (document.getElementById('pomoManualTask')?.value||'') : '';
  if(!Number.isFinite(minutes)||minutes<1||minutes>1440){toast('⚠️ مدت را بین ۱ تا ۱۴۴۰ دقیقه وارد کن');return;}
  migrateLegacyManualPomoData();
  const id=uid();
  if(!Array.isArray(DB.pomodoro.manualData))DB.pomodoro.manualData=[];
  DB.pomodoro.manualData.push({id,kind,minutes,date,note,taskId,createdAt:Date.now(),migratedToHistory:true});
  const score=window.recordPomoSession(kind,minutes,{date,taskId,plannedMinutes:minutes,pauseCount:0,startedAt:Date.now()-minutes*60000,endedAt:Date.now(),completed:true,source:'manual',manualId:id,note});
  if(kind==='focus' && date===todayISO()) checkPomoGoalBonus();
  save();
  document.getElementById('pomoManualMinutes').value='';document.getElementById('pomoManualNote').value='';
  toast(`✅ ${minutes} دقیقه ${kind==='focus'?'مطالعه':'استراحت'} ثبت شد${kind==='focus'?` · امتیاز تمرکز ${score}/100`:''}`);
  renderManualPomoData(); renderPomoStats(); window.renderPomoV66?.();
}
function deleteManualPomoData(id){
  const item=(DB.pomodoro.manualData||[]).find(x=>x.id===id);
  if(!item){return;}
  toast('🛡️ ثبت‌های دستی مثل پومودورو بخشی از تاریخچه‌ی اصلی هستند و برای جلوگیری از خراب شدن XP/آمار حذف کامل نمی‌شوند.');
}
function getManualPomoTotal(date,kind){
  // Kept only for legacy UI compatibility. The canonical source is pomodoro.history.
  return 0;
}
function getPomoTotal(date,kind){return (DB.pomodoro.history?.[date]?.[kind]||0);}
function renderManualPomoData(){
  const d=document.getElementById('pomoManualDate');if(d&&!d.value)d.value=todayISO();const date=d?.value||todayISO();
  renderManualTaskOptions();
  const f=document.getElementById('pomoManualTodayFocus'),b=document.getElementById('pomoManualTodayBreak');
  const totalF = getPomoTotal(date,'focus'), totalB = getPomoTotal(date,'break');
  if(f) f.textContent = typeof formatPomoTimeFa==='function' ? formatPomoTimeFa(totalF) : (totalF+'m');
  if(b) b.textContent = typeof formatPomoTimeFa==='function' ? formatPomoTimeFa(totalB) : (totalB+'m');
  const list=document.getElementById('pomoManualList');if(!list)return;
  const arr=(DB.pomodoro.manualData||[]).slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  list.innerHTML=arr.length?arr.slice(0,30).map(x=>{ const taskName=x.taskId?((DB.tasks||[]).find(t=>String(t.id)===String(x.taskId))?.title||'تسک'):''; const durFmt = typeof formatPomoTimeFa==='function' ? formatPomoTimeFa(x.minutes) : `${x.minutes} دقیقه`; return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);"><div><div style="font-weight:800;">${x.kind==='focus'?'📚':'☕'} ${durFmt} (${x.minutes}m)</div><div class="muted" style="font-size:11.5px;">${x.date}${taskName?' • 🎯 '+esc(taskName):''}${x.note?' • '+esc(x.note):''}</div></div><span class="muted" style="font-size:11px;">همگام شد</span></div>`; }).join(''):'<div class="muted" style="padding:10px 0;">هنوز ثبت دستی نداری.</div>';
}
function renderPomoStats(){
  const d = todayISO();
  const today = DB.pomodoro.history[d] || {focus:0, break:0};
  const totalFocus=getPomoTotal(d,'focus'), totalBreak=getPomoTotal(d,'break');
  const fmtFocus = typeof formatPomoTimeFa==='function' ? formatPomoTimeFa(totalFocus) : (totalFocus+'m');
  const fmtBreak = typeof formatPomoTimeFa==='function' ? formatPomoTimeFa(totalBreak) : (totalBreak+'m');
  const elF = document.getElementById('pomoTodayFocus');
  const elB = document.getElementById('pomoTodayBreak');
  if(elF) elF.textContent = totalFocus>=60 ? `${fmtFocus} (${totalFocus}m)` : fmtFocus;
  if(elB) elB.textContent = totalBreak>=60 ? `${fmtBreak} (${totalBreak}m)` : fmtBreak;

  const goal = DB.pomodoro.settings.goalMinutes||0;
  const pct = goal ? Math.min(100, (totalFocus/goal)*100) : 0;
  const bar = document.getElementById('pomoGoalBar');
  if(bar) bar.style.width = pct+'%';
  const goalTxt = document.getElementById('pomoGoalTxt');
  if(goalTxt){
    const fmtGoal = typeof formatPomoTimeFa==='function' ? formatPomoTimeFa(goal) : `${goal} دقیقه`;
    goalTxt.textContent = goal ? `${fmtFocus} از ${fmtGoal}` : `${fmtFocus}`;
  }
  const statusEl = document.getElementById('pomoGoalStatus');
  if(statusEl){
    if(!goal){ statusEl.textContent = 'هنوز هدف روزانه‌ای توی تنظیمات مشخص نکردی'; statusEl.style.color='var(--txt-dim2)'; }
    else if(totalFocus>=goal){ statusEl.textContent='✅ هدف امروز رو کامل کردی، آفرین!'; statusEl.style.color='var(--ok)'; }
    else {
      const remMins = Math.max(0, goal-totalFocus);
      const remFmt = typeof formatPomoTimeFa==='function' ? formatPomoTimeFa(remMins) : `${remMins} دقیقه`;
      statusEl.textContent = `${remFmt} تا رسیدن به هدف امروز مونده`;
      statusEl.style.color='var(--warn)';
    }
  }

  const days = last7();
  const dayLbl = days.map(dd=>new Date(dd).toLocaleDateString('fa-IR',{weekday:'short'}));
  const wc = document.getElementById('pomoWeekChecklist');
  if(wc){
    wc.innerHTML = days.map((dd,i)=>{
      const focusTotal=getPomoTotal(dd,'focus');
      const met = goal>0 && focusTotal>=goal;
      const cls = goal>0 ? (met?'met':'missed') : '';
      const sym = goal>0 ? (met?'✅':'▫️') : '⏺️';
      const durStr = focusTotal>=60 ? (typeof formatPomoHours==='function'?formatPomoHours(focusTotal):`${Math.round(focusTotal/60*10)/10}h`) : `${focusTotal}m`;
      return `<div class="pomo-day-chip ${cls}" title="${typeof formatPomoTimeFa==='function'?formatPomoTimeFa(focusTotal):focusTotal+' دقیقه'}"><div class="d">${dayLbl[i]}</div><div class="s">${sym}</div><div class="d num">${durStr}</div></div>`;
    }).join('');
  }
}
function renderPomoChart(){
  const canvas = document.getElementById('chartPomo');
  if(!canvas) return;
  let labels=[], values=[];
  if(pomoPeriod==='week'){
    const days = last7();
    labels = days.map(d=>new Date(d).toLocaleDateString('fa-IR',{weekday:'short'}));
    values = days.map(d=> getPomoTotal(d,'focus'));
  } else if(pomoPeriod==='month'){
    const now = new Date(); const year=now.getFullYear(), month=now.getMonth();
    const daysInMonth = new Date(year, month+1, 0).getDate();
    const weeks = [0,0,0,0,0];
    for(let day=1; day<=daysInMonth; day++){
      const d_=new Date(year, month, day); const iso = dateToLocalISO(d_);
      weeks[Math.floor((day-1)/7)] += getPomoTotal(iso,'focus');
    }
    const activeWeeks = Math.ceil(daysInMonth/7);
    values = weeks.slice(0, activeWeeks);
    labels = values.map((_,i)=>`هفته ${i+1}`);
  } else {
    const year = new Date().getFullYear();
    const months = new Array(12).fill(0);
    const dates=new Set([...(Object.keys(DB.pomodoro.history||{})), ...(DB.pomodoro.manualData||[]).map(x=>x.date)]);
    dates.forEach(dateStr=>{
      const dt = new Date(dateStr);
      if(dt.getFullYear()===year) months[dt.getMonth()] += getPomoTotal(dateStr,'focus');
    });
    labels = Array.from({length:12}, (_,i)=> new Date(year,i,1).toLocaleDateString('fa-IR',{month:'short'}));
    values = months;
  }
  drawBarChart(canvas, labels, values, cssVar('--neon'));
}

/* long-press on the pomo circle → infinite focus (only while idle) */
let pomoHoldTimer = null;
function pomoHoldStart(){
  if(DB.pomodoro.session) return;
  const circle = document.getElementById('pomoCircle');
  circle.classList.add('holding');
  pomoHoldTimer = setTimeout(()=>{
    circle.classList.remove('holding');
    startInfinite();
  }, 1200);
}
function pomoHoldCancel(){
  clearTimeout(pomoHoldTimer);
  document.getElementById('pomoCircle')?.classList.remove('holding');
}
(function initPomoCircleEvents(){
  const c = document.getElementById('pomoCircle');
  if(!c) return;
  c.addEventListener('pointerdown', pomoHoldStart);
  c.addEventListener('pointerup', pomoHoldCancel);
  c.addEventListener('pointerleave', pomoHoldCancel);
  c.addEventListener('pointercancel', pomoHoldCancel);
  c.addEventListener('contextmenu', e=>e.preventDefault());
})();

/* ============ CRITICAL TASK CRISIS MODE ============ */
const CRISIS_DURATION_MS = 60*60*1000; // 60 minutes
const CRISIS_COOLDOWN_MS = 2*60*60*1000; // don't re-trigger for 2h after resolving
function countCriticalOpen(){
  return DB.tasks.filter(t=>!t.inbox && !t.done && t.priority==='critical').length;
}
function applyCrisisTheme(on){
  document.documentElement.classList.toggle('crisis-mode', on);
  const banner = document.getElementById('crisisBanner');
  if(banner) banner.style.display = on ? 'flex' : 'none';
}
function checkCriticalCrisis(){
  if(DB.crisis.active) return;
  if(Date.now() < (DB.crisis.cooldownUntil||0)) return;
  if(countCriticalOpen() > 3){
    DB.crisis.active = true;
    DB.crisis.deadlineAt = Date.now() + CRISIS_DURATION_MS;
    save();
    applyCrisisTheme(true);
    openModal('crisisModalBg');
  }
}
function resolveCrisisSuccess(){
  DB.crisis.active = false;
  DB.crisis.cooldownUntil = Date.now() + CRISIS_COOLDOWN_MS;
  applyCrisisTheme(false);
  addXP(100);
  toast('🎉 عالی! تسک بحرانی رو به‌موقع تموم کردی! +۱۰۰ XP');
  save();
}
function resolveCrisisFailure(){
  DB.crisis.active = false;
  DB.crisis.cooldownUntil = Date.now() + CRISIS_COOLDOWN_MS;
  applyCrisisTheme(false);
  addXP(-10);
  toast('😔 از دستش دادیم! اینم جریمه‌ات که دفعه‌ی بعد بهتر عمل کنی (-۱۰ XP)');
  save();
}
function tickCrisis(){
  if(!DB.crisis.active) return;
  const remain = DB.crisis.deadlineAt - Date.now();
  if(remain<=0){ resolveCrisisFailure(); return; }
  const el = document.getElementById('crisisCountdown');
  if(el) el.textContent = fmtMMSS(remain);
}
setInterval(tickCrisis, 1000);

/* ============ YOU VS YOU ============ */
const YVY_METRICS = [
  { key:'xp',           label:'XP روزانه',            icon:'⚡', unit:'XP',        get:(d)=> (DB.history[d]?.xp)||0 },
  { key:'tasks',        label:'تسک‌های انجام‌شده',    icon:'✅', unit:'تسک',       get:(d)=> (DB.history[d]?.tasks)||0 },
  { key:'pomoMin',      label:'مدت مطالعه',           icon:'⏱️', unit:'دقیقه',     get:(d)=> getPomoTotal(d,'focus') },
  { key:'pomoSessions', label:'تعداد پومودورو',       icon:'🍅', unit:'پومودورو',  get:(d)=> (DB.pomodoro.history[d]?.sessions)||0 },
  { key:'quests',       label:'کوئست‌های انجام‌شده',  icon:'🎯', unit:'کوئست',     get:(d)=> (DB.stats.questsCompletedByDate?.[d])||0 },
];
function yvyAllDates(){
  const dates = new Set();
  Object.keys(DB.history||{}).forEach(d=>dates.add(d));
  Object.keys(DB.pomodoro.history||{}).forEach(d=>dates.add(d));
  (DB.pomodoro.manualData||[]).forEach(x=>dates.add(x.date));
  Object.keys(DB.stats.questsCompletedByDate||{}).forEach(d=>dates.add(d));
  return [...dates];
}
function yvyBestEver(metric, excludeDate){
  let best = 0;
  yvyAllDates().forEach(d=>{
    if(d===excludeDate) return;
    const v = metric.get(d);
    if(v>best) best = v;
  });
  return best;
}
function checkNewRecords(){
  const today = todayISO();
  YVY_METRICS.forEach(m=>{
    const todayVal = m.get(today);
    if(todayVal<=0) return;
    const bestExcl = yvyBestEver(m, today);
    const flagKey = `${today}:${m.key}`;
    if(todayVal>bestExcl && !DB.newRecordFlags[flagKey]){
      DB.newRecordFlags[flagKey] = true;
      toast(`🏆 رکورد شخصی جدید! ${m.icon} ${m.label}: ${todayVal} ${m.unit}`);
    }
  });
}
function yvyWeekRange(offsetWeeks){
  const now = new Date();
  const todayIdx = (now.getDay()+1)%7;
  const sat = new Date(now); sat.setDate(now.getDate()-todayIdx-offsetWeeks*7);
  const fri = new Date(sat); fri.setDate(sat.getDate()+6);
  return [dateToLocalISO(sat), dateToLocalISO(fri)];
}
function yvySumRange(startISO, endISO, getter){
  let sum=0;
  yvyAllDates().forEach(d=>{ if(d>=startISO && d<=endISO) sum+=getter(d); });
  return sum;
}
function yvyCountPerfectDays(startISO, endISO){
  let c=0;
  Object.keys(DB.perfectDayHistory||{}).forEach(d=>{ if(d>=startISO && d<=endISO && DB.perfectDayHistory[d]) c++; });
  return c;
}
function renderYVYFeatured(){
  const today = todayISO();
  const candidates = YVY_METRICS.map(m=>({ ...m, todayVal:m.get(today), bestVal:yvyBestEver(m, today) }));
  const withRecords = candidates.filter(c=>c.bestVal>0);
  const featured = withRecords.length
    ? withRecords.sort((a,b)=> (b.todayVal/b.bestVal) - (a.todayVal/a.bestVal))[0]
    : candidates.find(c=>c.key==='tasks');
  const broke = featured.bestVal>0 && featured.todayVal>featured.bestVal;
  const brandNew = featured.bestVal===0 && featured.todayVal>0;
  const pct = featured.bestVal>0 ? Math.min(100, Math.round((featured.todayVal/featured.bestVal)*100)) : (featured.todayVal>0?100:0);
  let msg;
  if(broke || brandNew){
    msg = `<div class="yvy-summary-msg pos">🎉 رکورد شخصی جدید در ${featured.label}!</div>`;
  } else if(featured.bestVal>0){
    const remain = featured.bestVal - featured.todayVal;
    msg = `<div class="yvy-summary-msg neu">${remain} ${featured.unit} تا شکستن رکوردت (${featured.bestVal} ${featured.unit}) مونده</div>`;
  } else {
    msg = `<div class="yvy-summary-msg neu">هنوز رکوردی برای ${featured.label} نداری — امروز اولینش رو بساز!</div>`;
  }
  document.getElementById('yvyFeatured').innerHTML = `
    ${msg}
    <div style="display:flex; justify-content:space-between; font-size:12.5px; color:var(--txt-dim); margin-bottom:6px;">
      <span>${featured.icon} ${featured.label}</span>
      <span class="num">${featured.todayVal} / ${Math.max(featured.bestVal,featured.todayVal)} ${featured.unit}</span>
    </div>
    <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
  `;
}
function renderYVYRecords(){
  const rows = YVY_METRICS.map(m=>{
    const best = yvyBestEver(m, null);
    return `<div class="yvy-record-row"><div class="yvy-record-name">${m.icon} ${m.label}</div><div class="yvy-record-val">${best} ${m.unit}</div></div>`;
  }).join('');
  const streakRow = `<div class="yvy-record-row"><div class="yvy-record-name">🔥 طولانی‌ترین استریک</div><div class="yvy-record-val">${DB.stats.bestStreak||0} روز</div></div>`;
  document.getElementById('yvyRecordsList').innerHTML = rows + streakRow;
}
function renderYVYWeekCompare(){
  const [thisStart, thisEnd] = yvyWeekRange(0);
  const [lastStart, lastEnd] = yvyWeekRange(1);
  const metrics = [
    {label:'⏱️ مدت مطالعه', thisWk: yvySumRange(thisStart,thisEnd,d=>getPomoTotal(d,'focus')), lastWk: yvySumRange(lastStart,lastEnd,d=>getPomoTotal(d,'focus'))},
    {label:'✅ تسک‌ها', thisWk: yvySumRange(thisStart,thisEnd,d=>(DB.history[d]?.tasks)||0), lastWk: yvySumRange(lastStart,lastEnd,d=>(DB.history[d]?.tasks)||0)},
    {label:'🍅 پومودورو', thisWk: yvySumRange(thisStart,thisEnd,d=>(DB.pomodoro.history[d]?.sessions)||0), lastWk: yvySumRange(lastStart,lastEnd,d=>(DB.pomodoro.history[d]?.sessions)||0)},
    {label:'⚡ XP', thisWk: yvySumRange(thisStart,thisEnd,d=>(DB.history[d]?.xp)||0), lastWk: yvySumRange(lastStart,lastEnd,d=>(DB.history[d]?.xp)||0)},
    {label:'🎯 کوئست‌ها', thisWk: yvySumRange(thisStart,thisEnd,d=>(DB.stats.questsCompletedByDate?.[d])||0), lastWk: yvySumRange(lastStart,lastEnd,d=>(DB.stats.questsCompletedByDate?.[d])||0)},
    {label:'🌟 Perfect Day', thisWk: yvyCountPerfectDays(thisStart,thisEnd), lastWk: yvyCountPerfectDays(lastStart,lastEnd)},
  ];
  const thisXP = metrics[3].thisWk, lastXP = metrics[3].lastWk;
  let summaryHtml;
  if(lastXP>0 && thisXP>lastXP){
    const pctUp = Math.round(((thisXP-lastXP)/lastXP)*100);
    summaryHtml = `<div class="yvy-summary-msg pos">🎉 این هفته ${pctUp}٪ بهتر از هفته‌ی قبل بودی!</div>`;
  } else if(lastXP===0 && thisXP>0){
    summaryHtml = `<div class="yvy-summary-msg pos">🎉 هفته‌ی قبل فعالیتی نداشتی، این هفته شروع کردی — عالیه!</div>`;
  } else if(thisXP>0 && thisXP>=lastXP){
    summaryHtml = `<div class="yvy-summary-msg pos">👍 همون سطح خوب هفته‌ی قبل رو حفظ کردی!</div>`;
  } else {
    summaryHtml = `<div class="yvy-summary-msg neu">هفته‌ی قبل یکم بهتر بود — هفته‌ی بعد دوباره تلاش کن 💪</div>`;
  }
  const rows = metrics.map(m=>{
    const up = m.thisWk >= m.lastWk;
    return `<div class="yvy-week-row">
      <span class="lbl">${m.label}</span>
      <span class="vals num">${m.thisWk} ${up?'<span class="yvy-arrow-up">▲</span>':'<span class="yvy-arrow-down">▼</span>'} <span style="color:var(--txt-dim2);">(قبل: ${m.lastWk})</span></span>
    </div>`;
  }).join('');
  document.getElementById('yvyWeekCompare').innerHTML = summaryHtml + rows;
}
function renderYVY(){
  if(!document.getElementById('yvyFeatured')) return;
  renderYVYFeatured();
  renderYVYRecords();
  renderYVYWeekCompare();
}

/* ============ WEEKLY BOSS FIGHT ============ */
const BOSS_WEEK_MS = 7*24*60*60*1000;
function checkBossTrigger(){
  if(DB.boss.active) return;
  if(Date.now() >= DB.boss.nextAvailableAt){
    openModal('bossTriggerModalBg');
  }
}
function declineBossFight(){
  closeModal('bossTriggerModalBg');
  DB.boss.nextAvailableAt = Date.now() + BOSS_WEEK_MS;
  save();
  renderBossContent();
  toast('باشه، هفته‌ی بعد دوباره می‌پرسیم ⏳');
}
let bossSetupSelected = [];
let bossEditMode = false;
function openBossSetup(){
  bossSetupSelected = [];
  bossEditMode = false;
  document.getElementById('bossSetupTitle').textContent = '⚔️ باس این هفته رو بساز';
  document.getElementById('bossNameInput').value = '';
  renderBossTaskPicker();
  openModal('bossSetupModalBg');
}
function startEditBoss(){
  const b = DB.boss.active; if(!b) return;
  bossSetupSelected = [...b.taskIds];
  bossEditMode = true;
  document.getElementById('bossSetupTitle').textContent = '✏️ ویرایش باس';
  document.getElementById('bossNameInput').value = b.name;
  renderBossTaskPicker();
  openModal('bossSetupModalBg');
}
function renderBossTaskPicker(){
  const list = DB.tasks.filter(t=>(!t.inbox) && (!t.done || bossSetupSelected.includes(t.id)));
  const el = document.getElementById('bossTaskPicker');
  if(!list.length){
    el.innerHTML = `<div class="empty" style="padding:16px;">تسک انجام‌نشده‌ای نداری — اول چندتا تسک بساز</div>`;
  } else {
    el.innerHTML = list.map(t=>{
      const sel = bossSetupSelected.includes(t.id);
      return `<div class="boss-task-pick-row ${sel?'sel':''}" onclick="toggleBossTaskPick('${t.id}')">
        <div class="chk-box">${sel?'✓':''}</div>
        <div style="font-size:13px;">${esc(t.title)}</div>
      </div>`;
    }).join('');
  }
  document.getElementById('bossTaskCount').textContent = `(${bossSetupSelected.length} تسک)`;
}
function toggleBossTaskPick(taskId){
  const idx = bossSetupSelected.indexOf(taskId);
  if(idx>=0){ bossSetupSelected.splice(idx,1); }
  else { bossSetupSelected.push(taskId); }
  renderBossTaskPicker();
}
function confirmBossSetup(){
  const name = document.getElementById('bossNameInput').value.trim();
  if(!name){ toast('⚠️ اول اسم باس رو بنویس'); return; }
  if(bossSetupSelected.length<1){ toast('⚠️ حداقل یک تسک انتخاب کن'); return; }
  if(bossEditMode && DB.boss.active){
    const b = DB.boss.active;
    b.name = name;
    b.taskIds = [...bossSetupSelected];
    b.hitTaskIds = b.hitTaskIds.filter(id=>b.taskIds.includes(id));
    b.hp = Math.max(0, Math.round(b.maxHp * (1 - b.hitTaskIds.length/b.taskIds.length)));
    toast('✏️ باس ویرایش شد');
  } else {
    DB.boss.active = { name, hp:100, maxHp:100, taskIds:[...bossSetupSelected], hitTaskIds:[] };
    toast(`⚔️ نبرد با «${name}» شروع شد!`);
  }
  bossEditMode = false;
  closeModal('bossSetupModalBg');
  save();
  renderBossContent();
}
function removeBossTaskRef(taskId){
  const b = DB.boss.active;
  if(!b || !b.taskIds.includes(taskId)) return;
  b.taskIds = b.taskIds.filter(id=>id!==taskId);
  b.hitTaskIds = b.hitTaskIds.filter(id=>id!==taskId);
  if(b.taskIds.length===0){
    DB.boss.active = null;
    DB.boss.nextAvailableAt = Date.now();
    toast('⚔️ چون همه‌ی تسک‌های باس پاک شدن، نبرد لغو شد');
  } else {
    b.hp = Math.max(0, Math.round(b.maxHp * (1 - b.hitTaskIds.length/b.taskIds.length)));
    toast('⚔️ یکی از تسک‌های باس پاک شد — HP باس به‌روز شد');
  }
}
function hitBossFromTask(taskId){
  const b = DB.boss.active;
  if(!b || !b.taskIds.includes(taskId) || b.hitTaskIds.includes(taskId)) return;
  const dmg = Math.round(b.maxHp / b.taskIds.length);
  b.hp = Math.max(0, b.hp - dmg);
  b.hitTaskIds.push(taskId);
  if(b.hp<=0){
    const name = b.name;
    DB.boss.active = null;
    DB.boss.nextAvailableAt = Date.now() + BOSS_WEEK_MS;
    addXP(100);
    document.getElementById('bossVictoryText').textContent = `«${name}» شکست خورد! +۱۰۰ XP`;
    openModal('bossVictoryModalBg');
  } else {
    toast(`⚔️ ضربه زدی! HP باس: ${b.hp}%`);
  }
  renderBossContent();
}
function fmtBossCountdown(ms){
  if(ms<0) ms=0;
  const totalHours = Math.floor(ms/3600000);
  const days = Math.floor(totalHours/24);
  const hours = totalHours%24;
  return `${days} روز و ${hours} ساعت`;
}
function renderBossContent(){
  const el = document.getElementById('bossContent');
  if(!el) return;
  const b = DB.boss.active;
  if(b){
    const pct = Math.round((b.hp/b.maxHp)*100);
    el.innerHTML = `<div class="boss-card">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
        <div class="boss-name">☠️ ${esc(b.name)}</div>
        <button class="btn ghost sm" onclick="startEditBoss()">✏️ ویرایش</button>
      </div>
      <div class="boss-hp-track"><div class="boss-hp-fill" style="width:${pct}%"></div><div class="boss-hp-text">${b.hp} / ${b.maxHp} HP</div></div>
      <div style="margin-top:16px;">
        ${b.taskIds.map(id=>{
          const t = DB.tasks.find(x=>x.id===id);
          const hit = b.hitTaskIds.includes(id);
          return `<div class="boss-task-row"><span class="st">${hit?'⚔️':'🛡️'}</span><span style="font-size:12.5px; ${hit?'text-decoration:line-through; color:var(--txt-dim2);':''}">${t?esc(t.title):'(تسک حذف شده)'}</span></div>`;
        }).join('')}
      </div>
    </div>`;
  } else if(Date.now() < DB.boss.nextAvailableAt){
    el.innerHTML = `<div class="card boss-countdown-box">
      <div style="font-size:36px;">⏳</div>
      <div class="muted" style="margin-top:10px;">تا باس فایت بعدی</div>
      <div class="boss-countdown-val num">${fmtBossCountdown(DB.boss.nextAvailableAt-Date.now())}</div>
    </div>`;
  } else {
    el.innerHTML = `<div class="card" style="text-align:center; padding:40px 20px;">
      <div style="font-size:36px;">⚔️</div>
      <p class="muted" style="margin-top:10px; font-size:13px;">یه هدف بزرگ داری؟ بذار به یه باس تبدیلش کنیم</p>
      <button class="btn" style="margin-top:14px;" onclick="openBossSetup()">شروع باس فایت</button>
    </div>`;
  }
}
setInterval(()=>{ if(document.getElementById('view-boss')?.classList.contains('active')) renderBossContent(); }, 60000);

/* ============ SKILL TREE ============ */
const SKILL_TREE = [
  { key:'pomoXp',        icon:'⚡', name:'استاد فوکوس',   desc:'هر تیر +۱۰٪ XP پومودورو',                          maxTier:3 },
  { key:'questXp',       icon:'🎯', name:'شکارچی کوئست',  desc:'هر تیر +۱۰٪ XP کوئست‌های رندوم',                    maxTier:3 },
  { key:'shopDiscount',  icon:'💰', name:'چانه‌زن',        desc:'هر تیر ۱۰٪ تخفیف روی قیمت‌های XP Shop',            maxTier:2 },
  { key:'luckyBox',      icon:'🍀', name:'شانس بلند',      desc:'هر تیر شانس جعبه‌ی رایگان توی Mystery Box بیشتر می‌شه', maxTier:3 },
  { key:'criticalBonus', icon:'🔥', name:'قاتل بحران',     desc:'هر تیر +۵ XP برای هر تسک بحرانی که تموم می‌کنی',    maxTier:3 },
  { key:'streakGuard',   icon:'🛡️', name:'محافظ استریک',  desc:'هر تیر همون لحظه ۱ Streak Shield رایگان می‌گیری',  maxTier:5 },
];
function skillTierCost(){ return 1; } // flat: 1 skill point per tier
function buySkillTier(key){
  const skill = SKILL_TREE.find(s=>s.key===key); if(!skill) return;
  const current = DB.skillTiers[key]||0;
  if(current>=skill.maxTier){ toast('این مهارت به حداکثر رسیده'); return; }
  if((DB.skillPoints||0) < skillTierCost()){ toast('⚠️ امتیاز مهارت کافی نداری'); return; }
  DB.skillPoints -= skillTierCost();
  DB.skillTiers[key] = current+1;
  if(key==='streakGuard'){ DB.streakShields = (DB.streakShields||0)+1; toast('🛡️ +۱ Streak Shield گرفتی!'); }
  persist();
  renderSkillTree();
  toast(`🌳 ${skill.name} به تیر ${DB.skillTiers[key]} رسید!`);
}
function renderSkillTree(){
  const ptsEl = document.getElementById('skillPointsVal');
  if(!ptsEl) return;
  ptsEl.textContent = (DB.skillPoints||0).toLocaleString('en-US');
  const grid = document.getElementById('skillTreeGrid');
  grid.innerHTML = SKILL_TREE.map(s=>{
    const tier = DB.skillTiers[s.key]||0;
    const maxed = tier>=s.maxTier;
    const dots = Array.from({length:s.maxTier}, (_,i)=> `<div class="skill-tier-dot ${i<tier?'filled':''}"></div>`).join('');
    return `<div class="skill-card">
      <div class="skill-top">
        <div class="skill-ic">${s.icon}</div>
        <div>
          <div class="skill-name">${s.name}</div>
          <div class="skill-desc">${s.desc}</div>
        </div>
      </div>
      <div class="skill-tiers">${dots}</div>
      ${maxed
        ? `<div class="skill-maxed">✓ تکمیل شده (${tier}/${s.maxTier})</div>`
        : `<button class="btn ${(DB.skillPoints||0)<1?'ghost':''} sm" style="width:100%; margin-top:12px;" onclick="buySkillTier('${s.key}')">تیر بعدی (${tier}/${s.maxTier}) — ۱ امتیاز</button>`
      }
    </div>`;
  }).join('');
}
function applyShopDiscount(baseCost){
  const tier = DB.skillTiers.shopDiscount||0;
  return Math.max(1, Math.round(baseCost * (1 - 0.1*tier)));
}

/* ============ XP SHOP ============ */
function spendXP(cost){
  if((DB.xpWallet||0) < cost) return false;
  DB.xpWallet -= cost;
  return true;
}
function buyXPBoost(){
  const cost = applyShopDiscount(100);
  if(!spendXP(cost)){ toast('⚠️ XP کافی نداری'); return; }
  DB.xpBoost = { activeUntil: Date.now() + 30*60*1000 };
  persist();
  renderXP();
  renderXPShop();
  toast('⚡ XP Boost ×۲ فعال شد! تا ۳۰ دقیقه همه‌ی XP هات دوبرابر می‌شه');
}
function buyStreakShield(){
  const cost = applyShopDiscount(200);
  if(!spendXP(cost)){ toast('⚠️ XP کافی نداری'); return; }
  DB.streakShields = (DB.streakShields||0)+1;
  persist();
  renderXP();
  renderXPShop();
  toast('🛡️ یه Streak Shield خریدی! یه روز از‌دست‌رفته‌ی عادت‌ها رو جبران می‌کنه');
}
const CITY_BONUS_ICONS = { tree:'🌳', bench:'🪑', lamp:'💡', fountain:'⛲', building:'🏢' };
const CITY_BONUS_NAMES = { tree:'درخت', bench:'نیمکت', lamp:'چراغ', fountain:'فواره', building:'ساختمان کوچیک' };
const MYSTERY_REWARDS = [
  { key:'xp10', weight:30, label:'⭐ +۱۰ XP — جایزه‌ی معمولی', apply:()=>{ addXP(10); } },
  { key:'xp25', weight:20, label:'⭐⭐ +۲۵ XP — جایزه‌ی خوب', apply:()=>{ addXP(25); } },
  { key:'boost', weight:15, label:'⚡ XP Boost ×۲ برای ۳۰ دقیقه فعال شد', apply:()=>{ DB.xpBoost = { activeUntil: Date.now()+30*60*1000 }; } },
  { key:'quest', weight:12, label:'🎯 یک Quest ویژه با XP بیشتر برات اومد', apply:()=>{ DB.quest.current = { tier:'bonus', id:'mysteryquest', text:'یک Quest ویژه از جعبه‌ی شانس! همین الان یه کار مهم رو تموم کن.', icon:'🎁', xp:75 }; } },
  { key:'shield', weight:10, label:'🔥 یک Streak Shield گرفتی — جلوی از دست رفتن یه روز استریک رو می‌گیره', apply:()=>{ DB.streakShields = (DB.streakShields||0)+1; } },
  { key:'xp50', weight:7, label:'⭐⭐⭐ +۵۰ XP — جایزه‌ی عالی', apply:()=>{ addXP(50); } },
  { key:'cityitem', weight:8, label:'🏙️ یه آیتم جدید برای Life City گرفتی', apply:()=>{
      const types = Object.keys(CITY_BONUS_ICONS);
      const t = types[Math.floor(Math.random()*types.length)];
      DB.cityBonusItems.push(t);
    } },
  { key:'xp100', weight:3, label:'⭐⭐⭐⭐ +۱۰۰ XP — جایزه‌ی بی‌نظیر', apply:()=>{ addXP(100); } },
  { key:'jackpot', weight:1.5, label:'💎 +۲۰۰ XP — Jackpot!! 🎉', apply:()=>{ addXP(200); } },
  { key:'freebox', weight:3, label:'👑 یه جعبه‌ی شانس دیگه، رایگان!', apply:()=>{} },
];
function pickWeightedReward(){
  const luckyBonus = (DB.skillTiers.luckyBox||0) * 3;
  const weights = MYSTERY_REWARDS.map(r=> r.key==='freebox' ? r.weight+luckyBonus : r.weight);
  const total = weights.reduce((s,w)=>s+w,0);
  let r = Math.random()*total;
  for(let i=0;i<MYSTERY_REWARDS.length;i++){ if(r<weights[i]) return MYSTERY_REWARDS[i]; r -= weights[i]; }
  return MYSTERY_REWARDS[0];
}
function openMysteryInfo(){
  const list = document.getElementById('mysteryInfoList');
  if(!list) return;
  const luckyBonus = (DB.skillTiers?.luckyBox||0) * 3;
  const weights = MYSTERY_REWARDS.map(r=>r.key==='freebox' ? r.weight+luckyBonus : r.weight);
  const total = weights.reduce((a,b)=>a+b,0);
  list.innerHTML = MYSTERY_REWARDS.map((r,i)=>{
    const pct = weights[i]/total*100;
    return `<div style="display:grid; grid-template-columns:1fr auto; gap:10px; align-items:center; padding:9px 10px; background:var(--bg2); border:1px solid var(--line); border-radius:10px;">
      <div style="font-size:12.5px; line-height:1.6;">${esc(r.label)}</div>
      <b class="num" style="white-space:nowrap;">${pct.toFixed(2)}%</b>
    </div>`;
  }).join('');
  openModal('mysteryInfoModalBg');
}
function buyMysteryBox(){
  const cost = applyShopDiscount(200);
  if(!spendXP(cost)){ toast('⚠️ XP کافی نداری'); return; }
  save();
  renderXPShop();
  openMysteryBox(0);
}
function openMysteryBox(chainDepth){
  const reward = pickWeightedReward();
  reward.apply();
  save();
  renderXPShop();
  showMysteryResult(reward.label, ()=>{
    if(reward.key==='freebox' && chainDepth<4){
      setTimeout(()=>openMysteryBox(chainDepth+1), 350);
    }
  });
}
function showMysteryResult(label, onClose){
  document.getElementById('mysteryResultText').textContent = label;
  openModal('mysteryModalBg');
  window._mysteryOnClose = onClose;
}
function closeMysteryModal(){
  closeModal('mysteryModalBg');
  const cb = window._mysteryOnClose; window._mysteryOnClose = null;
  if(cb) cb();
}
function checkStreakShields(){
  if(!DB.streakShields || DB.streakShields<=0) return;
  const y1 = new Date(); y1.setDate(y1.getDate()-1);
  const y2 = new Date(); y2.setDate(y2.getDate()-2);
  const y1ISO = dateToLocalISO(y1), y2ISO = dateToLocalISO(y2);
  let used = false;
  DB.habits.forEach(h=>{
    if(DB.streakShields<=0) return;
    if(!h.log[y1ISO] && h.log[y2ISO]){
      h.log[y1ISO] = true;
      DB.streakShields--;
      used = true;
    }
  });
  if(used){ toast('🔥 Streak Shield ازت محافظت کرد و استریکت حفظ شد!'); save(); }
}
function buyTheme(theme){
  const meta = THEME_META[theme];
  if(!meta) return;
  if(DB.themes.owned.includes(theme)){ toast('این تم رو قبلاً خریدی'); return; }
  const cost = applyShopDiscount(meta.cost);
  if(!spendXP(cost)){ toast('⚠️ XP کافی نداری'); return; }
  DB.themes.owned.push(theme);
  persist();
  renderXP();
  renderXPShop();
  toast(`🎉 تم ${meta.label} باز شد!`);
}
/* PERF: the shop used to rebuild its entire grid (themes, inventory, costs)
   every second. The full render now runs only when the data signature changes;
   the 1s tick (tickXPShop below) just refreshes the wallet number and the
   boost countdown line. */
let __shopSig = null;
function shopDataSig(){
  const boostLeft = DB.xpBoost ? DB.xpBoost.activeUntil - Date.now() : 0;
  return [
    DB.xpWallet||0,
    (DB.themes.owned||[]).join(','),
    localStorage.getItem(THEME_KEY)||'dark',
    boostLeft>0 ? 1 : 0,
    DB.skillTiers?.shopDiscount||0,
    DB.streakShields||0,
    (DB.cityBonusItems||[]).length
  ].join('|');
}
function tickXPShop(){
  const walletEl = document.getElementById('xpWalletVal');
  if(!walletEl) return;
  const w = (DB.xpWallet||0).toLocaleString('en-US');
  if(walletEl.textContent !== w) walletEl.textContent = w;
  const statusEl = document.getElementById('xpShopStatus');
  const boostLeft = DB.xpBoost ? DB.xpBoost.activeUntil - Date.now() : 0;
  if(statusEl){
    const txt = boostLeft>0
      ? `⚡ XP Boost فعاله — تا ${fmtMMSS(boostLeft)} دیگه همه‌ی XP هات دوبرابره`
      : 'الان بوستی فعال نیست';
    if(statusEl.textContent !== txt) statusEl.textContent = txt;
  }
  const sig = shopDataSig();
  if(sig !== __shopSig) renderXPShop();
}
function renderXPShop(){
  const walletEl = document.getElementById('xpWalletVal');
  if(!walletEl) return;
  __shopSig = shopDataSig();
  walletEl.textContent = (DB.xpWallet||0).toLocaleString('en-US');

  document.getElementById('costBoost').textContent = applyShopDiscount(100)+' XP';
  document.getElementById('costMystery').textContent = applyShopDiscount(200)+' XP';
  document.getElementById('costShield').textContent = applyShopDiscount(200)+' XP';

  const statusEl = document.getElementById('xpShopStatus');
  const boostLeft = DB.xpBoost ? DB.xpBoost.activeUntil - Date.now() : 0;
  statusEl.innerHTML = boostLeft>0
    ? `⚡ XP Boost فعاله — تا ${fmtMMSS(boostLeft)} دیگه همه‌ی XP هات دوبرابره`
    : 'الان بوستی فعال نیست';

  const themesEl = document.getElementById('shopThemes');
  const activeTheme = localStorage.getItem(THEME_KEY) || 'dark';
  themesEl.innerHTML = Object.keys(THEME_META).filter(k=>THEME_META[k].cost>0).map(k=>{
    const meta = THEME_META[k];
    const owned = DB.themes.owned.includes(k);
    const active = activeTheme===k;
    return `<div class="theme-card">
      <div class="theme-swatch" style="background:${meta.swatch}"></div>
      <div class="theme-name">${meta.icon} ${meta.label}</div>
      ${owned
        ? `<button class="btn ${active?'ghost':''} sm" style="width:100%; margin-top:8px;" onclick="useTheme('${k}')" ${active?'disabled':''}>${active?'✓ در حال استفاده':'استفاده کن'}</button>`
        : `<div class="theme-cost num">${applyShopDiscount(meta.cost)} XP</div><button class="btn sm" style="width:100%; margin-top:8px;" onclick="buyTheme('${k}')">خرید</button>`
      }
    </div>`;
  }).join('');

  const invEl = document.getElementById('shopInventory');
  const rows = [];
  if(DB.streakShields>0) rows.push(`<div class="shop-inv-row"><div class="ic">🔥</div><div>Streak Shield · <b class="num">${DB.streakShields}</b> عدد</div></div>`);
  const cityCounts = {};
  (DB.cityBonusItems||[]).forEach(t=> cityCounts[t]=(cityCounts[t]||0)+1);
  Object.keys(cityCounts).forEach(t=>{
    rows.push(`<div class="shop-inv-row"><div class="ic">${CITY_BONUS_ICONS[t]}</div><div>${CITY_BONUS_NAMES[t]} توی Life City · <b class="num">${cityCounts[t]}</b> عدد</div></div>`);
  });
  invEl.innerHTML = rows.length ? rows.join('') : `<div class="empty" style="padding:16px;">هنوز چیزی نخریدی</div>`;
}

/* ============ JALALI (PERSIAN) CALENDAR ============ */
function jDiv(a,b){ return ~~(a/b); }
function jMod(a,b){ return a - ~~(a/b)*b; }
function jalCal(jy){
  const breaks = [-61,9,38,199,426,686,756,818,1111,1181,1210,1635,2060,2097,2192,2262,2324,2394,2456,3178];
  const bl = breaks.length;
  const gy = jy + 621;
  let leapJ = -14, jp = breaks[0], jm, jump = 0, n, i;
  for(i=1;i<bl;i++){
    jm = breaks[i];
    jump = jm - jp;
    if(jy < jm) break;
    leapJ = leapJ + jDiv(jump,33)*8 + jDiv(jMod(jump,33),4);
    jp = jm;
  }
  n = jy - jp;
  leapJ = leapJ + jDiv(n,33)*8 + jDiv(jMod(n,33)+3,4);
  if(jMod(jump,33)===4 && jump-n===4) leapJ += 1;
  const leapG = jDiv(gy,4) - jDiv((jDiv(gy,100)+1)*3,4) - 150;
  const march = 20 + leapJ - leapG;
  if(jump-n < 6) n = n - jump + jDiv(jump,33)*33;
  let leap = jMod(jMod(n+1,33)-1,4);
  if(leap===-1) leap = 4;
  return { leap, gy, march };
}
function jG2d(gy,gm,gd){
  let d = jDiv((gy+jDiv(gm-8,6)+100100)*1461,4) + jDiv(153*jMod(gm+9,12)+2,5) + gd - 34840408;
  d = d - jDiv(jDiv(gy+100100+jDiv(gm-8,6),100)*3,4) + 752;
  return d;
}
function jD2g(jdn){
  let j = 4*jdn + 139361631;
  j = j + jDiv(jDiv(4*jdn+183187720,146097)*3,4)*4 - 3908;
  const i = jDiv(jMod(j,1461),4)*5 + 308;
  const gd = jDiv(jMod(i,153),5) + 1;
  const gm = jMod(jDiv(i,153),12) + 1;
  const gy = jDiv(j,1461) - 100100 + jDiv(8-gm,6);
  return { gy, gm, gd };
}
function toJalaali(gy,gm,gd){
  const jdn = jG2d(gy,gm,gd);
  const gy2 = jD2g(jdn).gy, jy0 = gy2 - 621;
  const r = jalCal(jy0);
  const jdn1f = jG2d(gy2,3,r.march);
  let k = jdn - jdn1f, jy = jy0, jm, jd;
  if(k>=0){
    if(k<=185){ jm = 1+jDiv(k,31); jd = jMod(k,31)+1; return {jy,jm,jd}; }
    k -= 186;
  } else {
    jy -= 1; k += 179;
    if(r.leap===1) k += 1;
  }
  jm = 7 + jDiv(k,30); jd = jMod(k,30) + 1;
  return { jy, jm, jd };
}
function toGregorian(jy,jm,jd){
  const r = jalCal(jy);
  const jdn = jG2d(r.gy,3,r.march) + (jm-1)*31 - jDiv(jm,7)*(jm-7) + jd - 1;
  return jD2g(jdn);
}
function jalaaliMonthLength(jy,jm){
  if(jm<=6) return 31;
  if(jm<=11) return 30;
  return jalCal(jy).leap===0 ? 30 : 29;
}
const JALALI_MONTHS = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
const FA_DIGITS = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
function toFaDigits(n){ return String(n).replace(/[0-9]/g, d=>FA_DIGITS[+d]); }
function isoToJalaliText(iso){
  if(!iso) return '';
  const [gy,gm,gd] = iso.split('-').map(Number);
  const j = toJalaali(gy,gm,gd);
  return `${toFaDigits(j.jy)}/${toFaDigits(String(j.jm).padStart(2,'0'))}/${toFaDigits(String(j.jd).padStart(2,'0'))}`;
}
function isoFromJalali(jy,jm,jd){
  const g = toGregorian(jy,jm,jd);
  return `${g.gy}-${String(g.gm).padStart(2,'0')}-${String(g.gd).padStart(2,'0')}`;
}

let jalaliTargetHidden = null, jalaliTargetDisplay = null, jalaliViewY = 0, jalaliViewM = 0, jalaliSelectedISO = '';
function openJalaliPicker(hiddenId, displayId){
  jalaliTargetHidden = hiddenId; jalaliTargetDisplay = displayId;
  const current = document.getElementById(hiddenId).value;
  const today = new Date();
  let base;
  if(current){ const [gy,gm,gd] = current.split('-').map(Number); base = toJalaali(gy,gm,gd); }
  else { base = toJalaali(today.getFullYear(), today.getMonth()+1, today.getDate()); }
  jalaliViewY = base.jy; jalaliViewM = base.jm;
  jalaliSelectedISO = current || '';
  renderJalaliGrid();
  openModal('jalaliPickerModalBg');
}
function jalaliPrevMonth(){
  jalaliViewM--; if(jalaliViewM<1){ jalaliViewM=12; jalaliViewY--; }
  renderJalaliGrid();
}
function jalaliNextMonth(){
  jalaliViewM++; if(jalaliViewM>12){ jalaliViewM=1; jalaliViewY++; }
  renderJalaliGrid();
}
function renderJalaliGrid(){
  document.getElementById('jalaliPickerTitle').textContent = `${JALALI_MONTHS[jalaliViewM-1]} ${toFaDigits(jalaliViewY)}`;
  const firstG = toGregorian(jalaliViewY, jalaliViewM, 1);
  const firstDate = new Date(firstG.gy, firstG.gm-1, firstG.gd);
  const startOffset = (firstDate.getDay()+1)%7; // 0=Sat
  const daysInMonth = jalaaliMonthLength(jalaliViewY, jalaliViewM);
  const today = new Date();
  const todayJ = toJalaali(today.getFullYear(), today.getMonth()+1, today.getDate());
  let html = '';
  for(let i=0;i<startOffset;i++) html += `<div class="jalali-day empty"></div>`;
  for(let d=1; d<=daysInMonth; d++){
    const iso = isoFromJalali(jalaliViewY, jalaliViewM, d);
    const isToday = todayJ.jy===jalaliViewY && todayJ.jm===jalaliViewM && todayJ.jd===d;
    const isSel = iso===jalaliSelectedISO;
    html += `<div class="jalali-day ${isToday?'today':''} ${isSel?'selected':''}" onclick="selectJalaliDay(${d})">${toFaDigits(d)}</div>`;
  }
  document.getElementById('jalaliGrid').innerHTML = html;
}
function selectJalaliDay(d){
  const iso = isoFromJalali(jalaliViewY, jalaliViewM, d);
  jalaliSelectedISO = iso;
  document.getElementById(jalaliTargetHidden).value = iso;
  document.getElementById(jalaliTargetDisplay).value = isoToJalaliText(iso);
  closeModal('jalaliPickerModalBg');
}
function clearJalaliDate(){
  document.getElementById(jalaliTargetHidden).value = '';
  document.getElementById(jalaliTargetDisplay).value = '';
  closeModal('jalaliPickerModalBg');
}

/* ============ TASKS ============ */
let editingTaskId = null;
function openTaskModal(id){
  editingTaskId = id || null;
  document.querySelectorAll('#tPriority .chip-opt').forEach(o=>o.classList.remove('sel'));
  document.querySelectorAll('#tStatus .chip-opt').forEach(o=>o.classList.remove('sel'));
  if(id){
    const t = DB.tasks.find(x=>x.id===id);
    document.getElementById('tTitle').value = t.title;
    document.getElementById('tCat').value = t.cat||'';
    document.getElementById('tDate').value = t.date||'';
    document.getElementById('tDateDisplay').value = isoToJalaliText(t.date||'');
    document.getElementById('tEst').value = t.est||'';
    document.getElementById('tNote').value = t.note||'';
    document.querySelector('#tPriority [data-v="'+t.priority+'"]').classList.add('sel');
    const statusOpt = document.querySelector('#tStatus [data-v="'+(t.status||'notstarted')+'"]');
    if(statusOpt) statusOpt.classList.add('sel'); else document.querySelector('#tStatus [data-v="notstarted"]')?.classList.add('sel');
    // load extra deadlines
    const wrap = document.getElementById('extraDeadlinesWrap');
    wrap.innerHTML = '';
    (t.extraDeadlines||[]).filter(Boolean).forEach(dl=>{
      const rid = 'edl_'+Math.random().toString(36).slice(2,8);
      const row = document.createElement('div');
      row.className = 'extra-deadline-row';
      row.style.cssText = 'display:flex; gap:8px; align-items:center;';
      row.setAttribute('data-rid', rid);
      row.innerHTML = `<input type="text" id="${rid}_d" readonly value="${isoToJalaliText(dl)}" onclick="openJalaliPicker('${rid}_v','${rid}_d')" style="flex:1;"><input type="hidden" id="${rid}_v" value="${dl}"><button class="btn ghost sm" type="button" onclick="this.closest('.extra-deadline-row').remove()" style="padding:8px 10px; flex-shrink:0;">✕</button>`;
      wrap.appendChild(row);
    });
    // load subtasks
    const stWrap = document.getElementById('subtaskWrap');
    stWrap.innerHTML = '';
    (t.subtasks||[]).forEach(s=>{
      const row = document.createElement('div');
      row.className = 'subtask-edit-row';
      row.setAttribute('data-sid', s.id);
      row.innerHTML = `<input type="checkbox" class="subtask-edit-check" ${s.done?'checked':''}><input type="text" class="subtask-edit-title" placeholder="عنوان زیرتسک" value="${esc(s.title)}"><button class="btn ghost sm" type="button" onclick="removeSubtaskEditRow(this)">✕</button>`;
      stWrap.appendChild(row);
    });
  } else {
    ['tTitle','tCat','tDate','tDateDisplay','tEst','tNote'].forEach(i=>document.getElementById(i).value='');
    document.getElementById('extraDeadlinesWrap').innerHTML='';
    document.getElementById('subtaskWrap').innerHTML='';
    const nt = document.getElementById('newSubtaskTitle'); if(nt) nt.value='';
    document.querySelector('#tPriority [data-v="medium"]').classList.add('sel');
    document.querySelector('#tStatus [data-v="notstarted"]').classList.add('sel');
  }
  openModal('taskModalBg');
}
function addExtraDeadline(){
  const wrap = document.getElementById('extraDeadlinesWrap');
  // use uid-based IDs so deleting middle rows never breaks index mapping
  const rid = 'edl_'+Math.random().toString(36).slice(2,8);
  const row = document.createElement('div');
  row.className = 'extra-deadline-row';
  row.style.cssText = 'display:flex; gap:8px; align-items:center;';
  row.setAttribute('data-rid', rid);
  row.innerHTML = `<input type="text" data-display="${rid}" readonly placeholder="انتخاب تاریخ" onclick="openJalaliPicker('${rid}_v','${rid}_d')" style="flex:1;" id="${rid}_d">
    <input type="hidden" id="${rid}_v" value="">
    <button class="btn ghost sm" type="button" onclick="this.closest('.extra-deadline-row').remove()" style="padding:8px 10px; flex-shrink:0;">✕</button>`;
  wrap.appendChild(row);
}
function getExtraDeadlines(){
  const dates = [];
  document.querySelectorAll('#extraDeadlinesWrap .extra-deadline-row').forEach(row=>{
    const rid = row.getAttribute('data-rid');
    const v = document.getElementById(rid+'_v')?.value;
    if(v) dates.push(v);
  });
  return dates;
}
/* subtask editor helpers (edit modal) */
function addSubtaskInput(){
  const wrap = document.getElementById('subtaskWrap');
  if(!wrap) return;
  const titleInput = document.getElementById('newSubtaskTitle');
  const val = titleInput ? titleInput.value.trim() : '';
  const row = document.createElement('div');
  row.className = 'subtask-edit-row';
  row.setAttribute('data-sid', uid());
  row.innerHTML = `<input type="checkbox" class="subtask-edit-check"><input type="text" class="subtask-edit-title" placeholder="عنوان زیرتسک" value="${esc(val)}"><button class="btn ghost sm" type="button" onclick="removeSubtaskEditRow(this)">✕</button>`;
  wrap.appendChild(row);
  if(titleInput) titleInput.value='';
  const inp = row.querySelector('.subtask-edit-title');
  if(inp) setTimeout(()=>inp.focus(),0);
}
function removeSubtaskEditRow(btn){
  const row = btn.closest('.subtask-edit-row');
  if(row) row.remove();
}
function getSubtasksFromModal(){
  const out = [];
  document.querySelectorAll('#subtaskWrap .subtask-edit-row').forEach(row=>{
    const title = row.querySelector('.subtask-edit-title')?.value.trim();
    if(!title) return;
    out.push({ id: row.getAttribute('data-sid') || uid(), title, done: !!row.querySelector('.subtask-edit-check')?.checked });
  });
  return out;
}
function saveTask(){
  const title = document.getElementById('tTitle').value.trim();
  if(!title){ toast('⚠️ عنوان تسک رو بنویس'); return; }
  const priority = document.querySelector('#tPriority .sel').dataset.v;
  const status = document.querySelector('#tStatus .sel')?.dataset.v || 'notstarted';
  const extraDeadlines = getExtraDeadlines();
  const subtasks = getSubtasksFromModal();
  const data = {
    title, cat: document.getElementById('tCat').value.trim(),
    date: document.getElementById('tDate').value, priority, status,
    est: document.getElementById('tEst').value, note: document.getElementById('tNote').value.trim(),
    extraDeadlines, subtasks, inbox:false
  };
  if(editingTaskId){
    const existing = DB.tasks.find(x=>x.id===editingTaskId);
    if(!existing){ toast('⚠️ تسک یافت نشد'); closeModal('taskModalBg'); return; }
    Object.assign(existing, data);
    existing.inbox = false;
    // keep a completed task consistent: a done task must have all subtasks done
    if(existing.done) (existing.subtasks||[]).forEach(s=>{ s.done = true; });
  } else {
    DB.tasks.push({id:uid(), done:false, created:todayISO(), ...data});
  }
  closeModal('taskModalBg'); save(); toast('✅ تسک ذخیره شد');
  checkCriticalCrisis();
}
/* ============ INBOX QUICK CAPTURE (v10.1) ============ */
function openInboxQuickAdd(){
  const input = document.getElementById('inboxTitle');
  if(input) input.value='';
  openModal('inboxQuickModalBg');
  setTimeout(()=>{ input?.focus(); }, 120);
}
function saveInboxTask(){
  const input = document.getElementById('inboxTitle');
  const title = (input?.value||'').trim();
  if(!title){ toast('⚠️ عنوان تسک رو بنویس'); return; }
  DB.tasks.push({
    id:uid(),
    title,
    cat:'',
    date:'',
    priority:'medium',
    status:'notstarted',
    est:'',
    note:'',
    extraDeadlines:[],
    subtasks:[],
    inbox:true,
    done:false,
    created:todayISO()
  });
  closeModal('inboxQuickModalBg');
  save();
  toast('📥 به Inbox اضافه شد — بعداً از بخش تسک‌ها کاملش کن');
}
function openInboxTaskFromAction(){
  const id = window.__taskActionId;
  if(!id) return;
  closeModal('taskActionModalBg');
  window.__taskActionId = null;
  openTaskModal(id);
}
function applyTaskCompletion(t){
  t.doneDate = todayISO();
  (t.subtasks||[]).forEach(s=>{ s.done = true; });
  const critBonus = t.priority==='critical' ? 5*(DB.skillTiers.criticalBonus||0) : 0;
  addXP((t.priority==='critical'?25:t.priority==='high'?18:t.priority==='medium'?12:8) + critBonus);
  logHistory('tasks',1);
  DB.stats.tasksCompleted = (DB.stats.tasksCompleted||0) + 1;
  checkPerfectDay();
  hitBossFromTask(t.id);
  checkNewRecords();
  if(t.priority==='critical' && DB.crisis.active) resolveCrisisSuccess();
}
function applyTaskUncompletion(t){
  (t.subtasks||[]).forEach(s=>{ s.done = false; });
}
function toggleTask(id){
  const t = DB.tasks.find(x=>x.id===id);
  if(!t){ console.warn('toggleTask: id not found', id); return; }
  t.done = !t.done;
  if(t.done) applyTaskCompletion(t);
  else applyTaskUncompletion(t);
  if(!DB.stats.weeklyPerfectUnlocked && isWeeklyPerfect()) DB.stats.weeklyPerfectUnlocked = true;
  save();
  checkCriticalCrisis();
}
function toggleSubtask(taskId, subId){
  const t = DB.tasks.find(x=>x.id===taskId);
  if(!t) return;
  const subs = t.subtasks||[];
  const sub = subs.find(s=>s.id===subId);
  if(!sub) return;
  sub.done = !sub.done;
  if(t.done && !sub.done){
    // reopening the task from a subtask — no XP refund, matches manual un-complete
    t.done = false;
  } else if(!t.done && subs.length>0 && subs.every(s=>s.done)){
    // all subtasks checked → the main task is automatically completed
    t.done = true;
    applyTaskCompletion(t);
    toast('🎉 همهی زیرتسکها تکمیل شدن — تسک اصلی هم انجام شد!');
  }
  if(!DB.stats.weeklyPerfectUnlocked && isWeeklyPerfect()) DB.stats.weeklyPerfectUnlocked = true;
  save();
  checkCriticalCrisis();
  if(window.__taskActionId===taskId) renderTaskActionDetails();
}
function deleteTask(id){
  removeBossTaskRef(id);
  DB.tasks = DB.tasks.filter(x=>x.id!==id);
  save();
  checkCriticalCrisis();
  renderBossContent();
}
function logHistory(key,inc){
  const d = todayISO();
  DB.history[d] = DB.history[d] || {tasks:0, habits:0};
  DB.history[d][key] = (DB.history[d][key]||0) + inc;
}
const CAT_PALETTE = ['#00e5ff','#8b6bff','#ff5470','#ffb545','#2ee6a6','#ff8fa3','#5eead4','#c084fc','#fbbf24','#60a5fa','#f472b6','#34d399'];
function colorForCategory(name){
  const key = (name||'').trim();
  if(!key) return '#7fa6ff';
  let hash = 0;
  for(let i=0;i<key.length;i++){ hash = key.charCodeAt(i) + ((hash<<5)-hash); }
  return CAT_PALETTE[Math.abs(hash) % CAT_PALETTE.length];
}
const TASK_STATUS_META = {
  notstarted: { label:'شروع نشده',  icon:'⬜', color:'#9aa4b8' },
  inprogress: { label:'در حال انجام', icon:'▶️', color:'#2ee6a6' },
  queued:     { label:'در صف',      icon:'📥', color:'#4d7fff' },
  paused:     { label:'متوقف',      icon:'⏸️', color:'#ffb545' },
};
function statusLabel(s){ return TASK_STATUS_META[s] ? TASK_STATUS_META[s].label : TASK_STATUS_META.notstarted.label; }
function statusIcon(s){ return TASK_STATUS_META[s] ? TASK_STATUS_META[s].icon : TASK_STATUS_META.notstarted.icon; }
function subtaskProgressHtml(t){
  const subs = t.subtasks||[];
  if(!subs.length) return '';
  const done = subs.filter(s=>s.done).length;
  const pct = Math.round(done/subs.length*100);
  return `<div class="subtask-progress">
    <div class="subtask-bar-track"><div class="subtask-bar-fill" style="width:${pct}%"></div></div>
    <span class="subtask-count num">${done}/${subs.length} · ${pct}٪</span>
  </div>`;
}
function taskRow(t){
  const c = t.cat ? colorForCategory(t.cat) : null;
  const isInbox = !!t.inbox;
  const inboxPill = isInbox ? `<span class="pill inbox-pill">📥 Inbox</span>` : '';
  const statusPill = !t.done && !isInbox ? `<span class="pill st-${esc(t.status||'notstarted')}">${statusIcon(t.status)} ${statusLabel(t.status)}</span>` : '';
  const subHtml = subtaskProgressHtml(t);
  return `<div class="task-row ${isInbox?'inbox-row':''}">
    <div class="chk ${t.done?'done':''}" onclick="toggleTask('${t.id}')">${t.done?'✓':''}</div>
    <div class="task-body" onclick="openTaskDetails('${t.id}')">
      <div class="task-title ${t.done?'done':''}">${esc(t.title)}</div>
      <div class="task-meta">
        ${inboxPill}
        <span class="pill ${t.priority}">${prLabel(t.priority)}</span>
        ${statusPill}
        ${t.cat?`<span class="pill" style="background:${c}22; color:${c};">${esc(t.cat)}</span>`:''}
        ${t.est?`<span style="font-size:11px;color:var(--txt-dim2)">⏱ ${t.est} دقیقه</span>`:''}
      </div>
      ${subHtml}
    </div>
    <div class="task-del" onclick="deleteTask('${t.id}')">🗑️</div>
  </div>`;
}
function prLabel(p){ return {low:'پایین',medium:'متوسط',high:'بالا',critical:'بحرانی'}[p]||p; }
function esc(s){ return (s||'').replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])); }

/* ============ TASK DETAILS MENU (v10) ============ */
window.__taskActionId = null;
function taskRewardSummary(t){
  if(t.inbox){
    return `<div class="reward-grid"><div class="reward-item reward-inbox"><div class="reward-ic">📥</div><div class="reward-info"><div class="reward-lbl">Inbox</div><div class="reward-val">این تسک هنوز در صندوق ورودیه — ویرایش کن تا وارد برنامه بشه</div></div></div></div>`;
  }
  if(t.done){
    return `<div class="reward-grid"><div class="reward-item reward-done"><div class="reward-ic">✅</div><div class="reward-info"><div class="reward-lbl">انجام شده</div><div class="reward-val">این تسک انجام شده و پاداشش دریافت شده</div></div></div></div>`;
  }
  const baseMap = {critical:25, high:18, medium:12, low:8};
  const base = baseMap[t.priority]||12;
  const critBonus = t.priority==='critical' ? 5*(DB.skillTiers.criticalBonus||0) : 0;
  const boosted = DB.xpBoost && Date.now() < (DB.xpBoost.activeUntil||0);
  const total = base + critBonus;
  const shown = boosted ? total*2 : total;
  let html = '<div class="reward-grid">';
  html += `<div class="reward-item"><div class="reward-ic">⚡</div><div class="reward-info"><div class="reward-lbl">پاداش اصلی</div><div class="reward-val num">+${shown} XP${boosted?` <span class="reward-boost">×۲ بوست فعال (پایه ${total})</span>`:''}</div><div class="reward-sub">پایه ${base} XP${critBonus?` + ${critBonus} بونوس بحرانی`:''}</div></div></div>`;
  if(critBonus){
    html += `<div class="reward-item"><div class="reward-ic">🔥</div><div class="reward-info"><div class="reward-lbl">بونوس قاتل بحران</div><div class="reward-val num">+${critBonus} XP</div><div class="reward-sub">از مهارت 🌳 قاتل بحران</div></div></div>`;
  }
  html += `<div class="reward-item"><div class="reward-ic">✅</div><div class="reward-info"><div class="reward-lbl">پیشرفت</div><div class="reward-val">+۱ تسک انجام‌شده</div><div class="reward-sub">آمار روزانه و Perfect Day</div></div></div>`;
  const b = DB.boss.active;
  if(b && b.taskIds.includes(t.id)){
    html += `<div class="reward-item"><div class="reward-ic">⚔️</div><div class="reward-info"><div class="reward-lbl">باس هفتگی</div><div class="reward-val">ضربه به «${esc(b.name)}»</div><div class="reward-sub">HP باس کم می‌شود</div></div></div>`;
  }
  html += '</div>';
  return html;
}
function openTaskDetails(id){
  const t = DB.tasks.find(x=>x.id===id);
  if(!t){ toast('⚠️ تسک یافت نشد'); return; }
  window.__taskActionId = id;
  document.getElementById('taskActionTitle').textContent = `✅ ${t.title}`;
  renderTaskActionDetails();
  openModal('taskActionModalBg');
}
function renderTaskActionDetails(){
  const id = window.__taskActionId;
  const t = id ? DB.tasks.find(x=>x.id===id) : null;
  if(!t) return;
  const c = t.cat ? colorForCategory(t.cat) : null;
  const subs = t.subtasks||[];
  const doneSubs = subs.filter(s=>s.done).length;
  const pct = subs.length ? Math.round(doneSubs/subs.length*100) : 0;
  const isInbox = !!t.inbox;

  const pills = [
    ...(isInbox?[`<span class="pill inbox-pill">📥 Inbox</span>`]:[]),
    `<span class="pill ${t.priority}">${prLabel(t.priority)}</span>`,
    ...(t.done?[`<span class="pill done-label">✓ انجام شده</span>`]: isInbox ? [] : [`<span class="pill st-${esc(t.status||'notstarted')}">${statusIcon(t.status)} ${statusLabel(t.status)}</span>`]),
    ...(t.cat?[`<span class="pill" style="background:${c}22; color:${c};">${esc(t.cat)}</span>`]:[])
  ].join('');

  const dates = [];
  if(t.date) dates.push(`📅 ${isoToJalaliText(t.date)}`);
  (t.extraDeadlines||[]).filter(Boolean).forEach(d=>dates.push(`⚑ ${isoToJalaliText(d)}`));
  const infoLines = [];
  if(isInbox){
    infoLines.push('📥 این تسک در Inbox ذخیره شده — فقط عنوان دارد. با «ویرایش و تکمیل» آن را به برنامه اصلی اضافه کن.');
  } else {
    infoLines.push(dates.length ? dates.join(' · ') : '🗓️ بدون ددلاین');
    infoLines.push(t.est ? `⏱ ${t.est} دقیقه` : '⏱ بدون زمان تخمینی');
  }
  if(t.note) infoLines.push(`📝 ${esc(t.note)}`);
  if(t.created) infoLines.push(`🕓 ساخته‌شده: ${isoToJalaliText(t.created)}`);

  const statusChanger = (t.done || isInbox) ? '' : `
    <div class="task-action-status">
      <div class="task-action-lbl">🔄 وضعیت تسک</div>
      <div class="task-action-status-btns">
        ${Object.keys(TASK_STATUS_META).map(k=>`<button type="button" class="chip-opt ${t.status===k?'sel':''}" onclick="setTaskStatus('${t.id}','${k}')">${TASK_STATUS_META[k].icon} ${TASK_STATUS_META[k].label}</button>`).join('')}
      </div>
    </div>`;

  const subHtml = subs.length
    ? `<div class="subtask-list">
        <div class="task-action-lbl">🧩 زیرتسک‌ها — <span class="num">${doneSubs}/${subs.length} · ${pct}٪</span></div>
        ${subs.map(s=>`<div class="subtask-item ${s.done?'done':''}" onclick="toggleSubtask('${t.id}','${s.id}')"><div class="subtask-check">${s.done?'✓':''}</div><span class="subtask-item-title">${esc(s.title)}</span></div>`).join('')}
      </div>`
    : isInbox ? `<div class="subtask-list-empty">📥 Inbox — بعداً با ویرایش، جزئیات، تاریخ و زیرتسک اضافه کن.</div>` : `<div class="subtask-list-empty">🧩 زیرتسکی ندارد — از «ویرایش» می‌توانی چند زیرتسک بسازی.</div>`;

  document.getElementById('taskActionDetails').innerHTML = `
    <div class="task-action-pills">${pills}</div>
    <div class="task-action-info">${infoLines.join('<br>')}</div>
    <div class="task-action-rewards"><div class="task-action-lbl">🎁 پاداش تکمیل</div>${taskRewardSummary(t)}</div>
    ${statusChanger}
    ${subHtml}`;

  const toggleBtn = document.getElementById('taskActionToggleBtn');
  if(toggleBtn){
    if(isInbox){
      toggleBtn.innerHTML = '✏️ ویرایش و تکمیل تسک';
      toggleBtn.classList.remove('ghost');
      toggleBtn.onclick = ()=>{ openInboxTaskFromAction(); };
    } else {
      toggleBtn.innerHTML = t.done ? '↩️ برگردوندن به حالت انجام‌نشده' : '✅ انجام شد!';
      toggleBtn.classList.toggle('ghost', t.done);
      toggleBtn.onclick = ()=>{ toggleTaskFromAction(); };
    }
  }
  const editBtn = document.querySelector('#taskActionModalBg .btn.ghost');
  // keep default edit handler, but for inbox we already changed main btn
}
function toggleTaskFromAction(){
  const id = window.__taskActionId;
  if(!id) return;
  closeModal('taskActionModalBg');
  window.__taskActionId = null;
  toggleTask(id);
}
function startEditTaskFromAction(){
  const id = window.__taskActionId;
  if(!id) return;
  closeModal('taskActionModalBg');
  window.__taskActionId = null;
  openTaskModal(id);
}
function deleteTaskFromAction(){
  const id = window.__taskActionId;
  if(!id) return;
  if(!confirm('این تسک حذف بشه؟')) return;
  closeModal('taskActionModalBg');
  window.__taskActionId = null;
  deleteTask(id);
  toast('🗑️ تسک حذف شد');
}
function setTaskStatus(id, status){
  const t = DB.tasks.find(x=>x.id===id);
  if(!t || !TASK_STATUS_META[status]) return;
  t.status = status;
  save();
  renderTaskActionDetails();
  toast(`${TASK_STATUS_META[status].icon} وضعیت تسک: ${TASK_STATUS_META[status].label}`);
}
function pickRandomTask(){
  const f = document.querySelector('#taskFilters .sel')?.dataset.f || 'all';
  let pool = sortTasks(DB.tasks).filter(t=>!t.done && !t.inbox);
  if(f==='inprogress') pool = pool.filter(t=>(t.status||'notstarted')==='inprogress');
  else if(f==='queued') pool = pool.filter(t=>(t.status||'notstarted')==='queued');
  else if(f==='paused') pool = pool.filter(t=>(t.status||'notstarted')==='paused');
  else if(f==='notstarted') pool = pool.filter(t=>(t.status||'notstarted')==='notstarted');
  else if(f==='inbox') pool = [];
  else if(f==='critical') pool = pool.filter(t=>t.priority==='critical');
  else if(f==='high') pool = pool.filter(t=>t.priority==='high');
  else if(f==='done') pool = [];
  if(currentCatFilter && f!=='inbox') pool = pool.filter(t=>(t.cat||'').trim()===currentCatFilter);
  if(!pool.length){
    toast(f==='done' || f==='inbox' ? '🎲 توی این فیلتر تسک بازی وجود نداره — یک فیلتر دیگه انتخاب کن' : '🎲 تسک انجام‌نشده‌ای در این فیلتر پیدا نشد');
    return;
  }
  const chosen = pool[Math.floor(Math.random()*pool.length)];
  toast(`🎲 تسک تصادفی: «${chosen.title}»`);
  openTaskDetails(chosen.id);
}

let currentStatusFilter = 'all';
let currentCatFilter = null;
function renderCategoryFolders(){
  const el = document.getElementById('categoryFilters');
  // folders only reflect categories that still have active (not done, not inbox) tasks
  const cats = [...new Set(DB.tasks.filter(t=>!t.inbox && !t.done && t.cat && t.cat.trim()).map(t=>t.cat.trim()))];
  if(currentCatFilter && !cats.includes(currentCatFilter)) currentCatFilter = null;
  if(!cats.length){ el.innerHTML=''; return; }
  const allChip = `<div class="chip-opt cat-folder ${!currentCatFilter?'sel':''}" data-cat="">📁 همه پوشه‌ها</div>`;
  el.innerHTML = allChip + cats.map(c=>{
    const col = colorForCategory(c);
    return `<div class="chip-opt cat-folder ${currentCatFilter===c?'sel':''}" data-cat="${esc(c)}" style="${currentCatFilter===c?`border-color:${col}; color:${col}; background:${col}18;`:''}"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${col};margin-left:6px;"></span>${esc(c)}</div>`;
  }).join('');
}
document.getElementById('categoryFilters').addEventListener('click', e=>{
  const opt = e.target.closest('.cat-folder'); if(!opt) return;
  currentCatFilter = opt.dataset.cat || null;
  renderTasks(currentStatusFilter);
});

const PRIORITY_ORDER = {critical:0, high:1, medium:2, low:3};
const STATUS_ORDER = {inprogress:0, paused:1, queued:2, notstarted:3};
function sortTasks(list){
  return [...list].sort((a,b)=>{
    const aInbox = a.inbox ? 1 : 0;
    const bInbox = b.inbox ? 1 : 0;
    if(aInbox!==bInbox) return aInbox-bInbox;
    if(a.done!==b.done) return (a.done?1:0)-(b.done?1:0);
    const aStatus = STATUS_ORDER[a.status||'notstarted'] ?? 3;
    const bStatus = STATUS_ORDER[b.status||'notstarted'] ?? 3;
    if(aStatus!==bStatus) return aStatus-bStatus;
    const aPr = PRIORITY_ORDER[a.priority] ?? 2;
    const bPr = PRIORITY_ORDER[b.priority] ?? 2;
    if(aPr!==bPr) return aPr-bPr;
    return String(b.created||'').localeCompare(String(a.created||'')) || 0;
  });
}
function renderTasks(filter='all'){
  currentStatusFilter = filter;
  renderCategoryFolders();
  const el = document.getElementById('allTasks');
  let list = sortTasks(DB.tasks);
  if(filter==='inbox'){
    list = list.filter(t=>t.inbox);
  } else {
    // default views exclude inbox tasks
    list = list.filter(t=>!t.inbox);
    if(filter==='inprogress') list = list.filter(t=>!t.done && (t.status||'notstarted')==='inprogress');
    else if(filter==='queued') list = list.filter(t=>!t.done && (t.status||'notstarted')==='queued');
    else if(filter==='paused') list = list.filter(t=>!t.done && (t.status||'notstarted')==='paused');
    else if(filter==='notstarted') list = list.filter(t=>!t.done && (t.status||'notstarted')==='notstarted');
    else if(filter==='active') list = list.filter(t=>!t.done);
    else if(filter==='done') list = list.filter(t=>t.done);
    else if(filter==='critical') list = list.filter(t=>t.priority==='critical');
    else if(filter==='high') list = list.filter(t=>t.priority==='high');
    // 'all' shows all non-inbox tasks
  }
  if(currentCatFilter && filter!=='inbox') list = list.filter(t=>(t.cat||'').trim()===currentCatFilter);
  el.innerHTML = list.length ? list.map(taskRow).join('') : `<div class="empty"><div class="ic">📭</div>تسکی پیدا نشد</div>`;

  const today = sortTasks(DB.tasks.filter(t=>!t.inbox && (t.date===todayISO() || (!t.date && !t.done))));
  document.getElementById('todayTasks').innerHTML = today.length ? today.slice(0,6).map(taskRow).join('') : `<div class="empty"><div class="ic">🌤️</div>امروز تسکی نداری، یکی اضافه کن!</div>`;
  document.getElementById('todayCount').textContent = today.length + ' تسک';
}
/* Dashboard slice of renderTasks — lets renderAll refresh the visible "today"
   widget without rebuilding the (hidden) full task list. */
function renderTodayWidget(){
  const today = sortTasks(DB.tasks.filter(t=>!t.inbox && (t.date===todayISO() || (!t.date && !t.done))));
  const el = document.getElementById('todayTasks');
  if(el) el.innerHTML = today.length ? today.slice(0,6).map(taskRow).join('') : `<div class="empty"><div class="ic">🌤️</div>امروز تسکی نداری، یکی اضافه کن!</div>`;
  const c = document.getElementById('todayCount');
  if(c) c.textContent = today.length + ' تسک';
}

/* ============ HABITS ============ */
function openHabitModal(){
  document.getElementById('hName').value='';
  document.querySelectorAll('#hIcon .chip-opt').forEach(o=>o.classList.remove('sel'));
  document.querySelector('#hIcon [data-v="📚"]').classList.add('sel');
  openModal('habitModalBg');
}
function saveHabit(){
  const name = document.getElementById('hName').value.trim();
  if(!name){ toast('⚠️ اسم عادت رو بنویس'); return; }
  const icon = document.querySelector('#hIcon .sel').dataset.v;
  DB.habits.push({id:uid(), name, icon, log:{}});
  closeModal('habitModalBg'); save(); toast('🔥 عادت اضافه شد');
}
function dateToLocalISO(d){
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function weekDates(){
  // Returns 7 dates for the current week (Sat to Fri, Iranian calendar week) using LOCAL date
  const arr=[];
  const now = new Date();
  const dayOfWeek = (now.getDay()+1)%7; // 0=Sat,1=Sun,...,6=Fri
  const sat = new Date(now);
  sat.setDate(now.getDate() - dayOfWeek);
  for(let i=0;i<7;i++){
    const d=new Date(sat);
    d.setDate(sat.getDate()+i);
    arr.push(dateToLocalISO(d));
  }
  return arr;
}
function toggleHabitDay(hid, date){
  const h = DB.habits.find(x=>x.id===hid);
  if(!h){ console.warn('toggleHabitDay: habit not found', hid); return; }
  h.log[date] = !h.log[date];
  if(h.log[date]){
    addXP(6); logHistory('habits',1);
    const s = habitStreak(h);
    if(s > (DB.stats.bestStreak||0)) DB.stats.bestStreak = s;
    checkPerfectDay();
  }
  save();
}
function habitStreak(h){
  let streak=0; let d = new Date();
  while(true){
    const iso = dateToLocalISO(d);
    if(h.log[iso]){ streak++; d.setDate(d.getDate()-1); } else break;
  }
  return streak;
}
function renderHabits(){
  const wDates = weekDates();
  const dayLetters = ['ش','ی','د','س','چ','پ','ج'];
  const listEl = document.getElementById('habitList');
  if(!DB.habits.length){ listEl.innerHTML = `<div class="empty"><div class="ic">🔥</div>هنوز عادتی ثبت نکردی</div>`; }
  else listEl.innerHTML = DB.habits.map(h=>{
    const streak = habitStreak(h);
    return `<div class="habit-card">
      <div class="habit-ic" style="background:rgba(0,229,255,.1)">${h.icon}</div>
      <div class="habit-info"><div class="habit-name">${esc(h.name)}</div><div class="habit-streak">🔥 ${streak} روز پیاپی</div></div>
      <div class="habit-right">
        <div class="week-dots">
          ${wDates.map((d)=>{
            const isToday = d===todayISO();
            const dayIdx = (new Date(d+'T00:00:00').getDay()+1)%7;
            const label = dayLetters[dayIdx];
            return `<div class="wd ${h.log[d]?'on':''} ${isToday?'today':''}" onclick="${isToday?`toggleHabitDay('${h.id}','${d}')`:''}" >${label}</div>`;
          }).join('')}
        </div>
        <div class="task-del" onclick="deleteHabit('${h.id}')">🗑️</div>
      </div>
    </div>`;
  }).join('');

  const mini = document.getElementById('habitMini');
  if(!DB.habits.length) mini.innerHTML = `<div class="empty" style="padding:10px;">هنوز عادتی نداری</div>`;
  else mini.innerHTML = DB.habits.slice(0,4).map(h=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 2px;font-size:13px;">
    <span>${h.icon} ${esc(h.name)}</span><b class="num" style="color:var(--neon)">${habitStreak(h)} روز</b></div>`).join('');
}
/* Dashboard slice of renderHabits (see renderTodayWidget note). */
function renderHabitMini(){
  const mini = document.getElementById('habitMini');
  if(!mini) return;
  if(!DB.habits.length) mini.innerHTML = `<div class="empty" style="padding:10px;">هنوز عادتی نداری</div>`;
  else mini.innerHTML = DB.habits.slice(0,4).map(h=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 2px;font-size:13px;">
    <span>${h.icon} ${esc(h.name)}</span><b class="num" style="color:var(--neon)">${habitStreak(h)} روز</b></div>`).join('');
}
function deleteHabit(id){ if(!DB.habits.find(x=>x.id===id)) return; DB.habits = DB.habits.filter(x=>x.id!==id); save(); }

/* ============ GOALS ============ */
function openGoalModal(){
  document.getElementById('gTitle').value=''; document.getElementById('gProgress').value=0;
  document.querySelectorAll('#gLevel .chip-opt').forEach(o=>o.classList.remove('sel'));
  document.querySelector('#gLevel [data-v="weekly"]').classList.add('sel');
  openModal('goalModalBg');
}
function saveGoal(){
  const title = document.getElementById('gTitle').value.trim();
  if(!title){ toast('⚠️ عنوان هدف رو بنویس'); return; }
  const level = document.querySelector('#gLevel .sel').dataset.v;
  const progress = Math.max(0,Math.min(100, parseInt(document.getElementById('gProgress').value)||0));
  DB.goals.push({id:uid(), title, level, progress});
  closeModal('goalModalBg'); save(); toast('🎯 هدف اضافه شد');
}
function levelLabel(l){ return {daily:'روزانه',weekly:'هفتگی',monthly:'ماهانه',yearly:'سالانه',life:'زندگی'}[l]; }
function setGoalProgress(id, val){
  const g = DB.goals.find(x=>x.id===id); if(!g) return; const old=g.progress;
  const newVal = Math.max(0,Math.min(100,val));
  const delta = newVal - old;
  g.progress = newVal;
  if(delta>0){
    const d = todayISO();
    DB.dailyGoalProgress[d] = DB.dailyGoalProgress[d] || {};
    DB.dailyGoalProgress[d][id] = (DB.dailyGoalProgress[d][id]||0) + delta;
  }
  if(g.progress===100 && old<100) addXP(40);
  checkPerfectDay();
  save();
}
function renderGoals(){
  const el = document.getElementById('goalList');
  if(!DB.goals.length){ el.innerHTML = `<div class="empty"><div class="ic">🎯</div>هنوز هدفی تعریف نکردی</div>`; }
  else el.innerHTML = DB.goals.map(g=>`<div class="goal-card">
    <div class="goal-top">
      <div><div class="goal-title">${esc(g.title)}</div><span class="pill cat">${levelLabel(g.level)}</span></div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="num" style="font-weight:800;color:var(--neon)">${g.progress}٪</span>
        <div class="task-del" onclick="deleteGoal('${g.id}')">🗑️</div>
      </div>
    </div>
    <div class="bar-track"><div class="bar-fill" style="width:${g.progress}%"></div></div>
    <div style="display:flex;gap:8px;margin-top:10px;">
      <button class="btn ghost sm" onclick="setGoalProgress('${g.id}', ${g.progress-10})">-۱۰٪</button>
      <button class="btn ghost sm" onclick="setGoalProgress('${g.id}', ${g.progress+10})">+۱۰٪</button>
    </div>
  </div>`).join('');

  const mini = document.getElementById('goalMini');
  if(!DB.goals.length) mini.innerHTML = `<div class="empty" style="padding:10px;">هنوز هدفی نداری</div>`;
  else mini.innerHTML = DB.goals.slice(0,4).map(g=>`<div style="margin-bottom:12px;">
    <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:5px;"><span>${esc(g.title)}</span><b class="num">${g.progress}٪</b></div>
    <div class="bar-track"><div class="bar-fill" style="width:${g.progress}%"></div></div></div>`).join('');
}
/* Dashboard slice of renderGoals (see renderTodayWidget note). */
function renderGoalMini(){
  const mini = document.getElementById('goalMini');
  if(!mini) return;
  if(!DB.goals.length) mini.innerHTML = `<div class="empty" style="padding:10px;">هنوز هدفی نداری</div>`;
  else mini.innerHTML = DB.goals.slice(0,4).map(g=>`<div style="margin-bottom:12px;">
    <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:5px;"><span>${esc(g.title)}</span><b class="num">${g.progress}٪</b></div>
    <div class="bar-track"><div class="bar-fill" style="width:${g.progress}%"></div></div></div>`).join('');
}
function deleteGoal(id){ if(!DB.goals.find(x=>x.id===id)) return; DB.goals = DB.goals.filter(x=>x.id!==id); save(); }

/* ============ NOTES ============ */
let editingNoteId=null;
function openNoteModal(id=null){
  editingNoteId=id;
  const titleEl=document.getElementById('noteModalTitle');
  const ev=id?DB.notes.find(x=>x.id===id):null;
  if(ev){
    titleEl.textContent='✏️ ویرایش یادداشت';
    document.getElementById('nTitle').value=ev.title||'';
    document.getElementById('nBody').value=ev.body||'';
    document.getElementById('nTag').value=ev.tag||'';
    document.getElementById('nPinned').checked=!!ev.pinned;
  }else{
    titleEl.textContent='📝 یادداشت جدید';
    document.getElementById('nTitle').value='';
    document.getElementById('nBody').value='';
    document.getElementById('nTag').value='';
    document.getElementById('nPinned').checked=false;
  }
  openModal('noteModalBg');
}
function saveNote(){
  const title=document.getElementById('nTitle').value.trim();
  if(!title){toast('⚠️ عنوان یادداشت رو بنویس');return;}
  const body=document.getElementById('nBody').value.trim();
  const tag=document.getElementById('nTag').value.trim();
  const pinned=document.getElementById('nPinned').checked;

  if(editingNoteId){
    const n=DB.notes.find(x=>x.id===editingNoteId);
    if(n){
      n.title=title;n.body=body;n.tag=tag;n.pinned=pinned;
      n.updatedAt=todayISO();
    }
    toast('✏️ یادداشت ویرایش شد');
  }else{
    DB.notes.unshift({id:uid(),title,body,tag,pinned,date:todayISO(),updatedAt:todayISO()});
    toast('📝 یادداشت ذخیره شد');
  }
  editingNoteId=null;
  closeModal('noteModalBg');
  save();
}
function deleteNote(id){
  if(!DB.notes.find(x=>x.id===id))return;
  if(!confirm('این یادداشت حذف بشه؟'))return;
  DB.notes=DB.notes.filter(x=>x.id!==id);
  save();renderNotes();toast('🗑️ یادداشت حذف شد');
}
function toggleNotePin(id){
  const n=DB.notes.find(x=>x.id===id);if(!n)return;
  n.pinned=!n.pinned;
  save();renderNotes();
  toast(n.pinned?'📌 یادداشت سنجاق شد':'📍 یادداشت از حالت سنجاق خارج شد');
}
function renderNotes(){
  const el=document.getElementById('noteGrid');if(!el)return;
  const q=(document.getElementById('noteSearch')?.value||'').trim().toLowerCase();
  const list=[...DB.notes]
    .filter(n=>!q||[n.title,n.body,n.tag].some(v=>String(v||'').toLowerCase().includes(q)))
    .sort((a,b)=>(Number(!!b.pinned)-Number(!!a.pinned))||String(b.updatedAt||b.date||'').localeCompare(String(a.updatedAt||a.date||'')));

  if(!list.length){
    el.innerHTML=`<div class="empty"><div class="ic">📝</div>${q?'چیزی با این جستجو پیدا نشد':'یادداشتی نداری'}</div>`;
    return;
  }
  el.innerHTML=list.map(n=>`<div class="note-card">
    ${n.pinned?'<span class="pill cat tag">📌 سنجاق‌شده</span>':''}
    <h4>${esc(n.title)}</h4>
    <p>${esc(n.body||'بدون محتوا')}</p>
    ${n.tag?`<span class="pill cat tag">${esc(n.tag)}</span>`:''}
    <div class="note-actions">
      <button class="note-action" onclick="openNoteModal('${n.id}')">✏️ ویرایش</button>
      <button class="note-action" onclick="toggleNotePin('${n.id}')">${n.pinned?'📍 برداشتن سنجاق':'📌 سنجاق'}</button>
      <button class="note-action" onclick="deleteNote('${n.id}')">🗑️ حذف</button>
    </div>
  </div>`).join('');
}

/* ============ CALENDAR ============ */
const dayNames = ['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه'];
window.__editingEventId = null;
window.__eventActionCtx = null; // {eventId, dayIdx}
function openEventModal(){
  window.__editingEventId=null;
  document.getElementById('eventModalTitle').textContent='📅 رویداد جدید';
  document.getElementById('eTitle').value='';
  document.getElementById('eHourStart').value='09:00';
  document.getElementById('eHourEnd').value='12:00';
  document.getElementById('eReminder').checked=false;
  document.querySelectorAll('#eDays .chip-opt').forEach(o=>o.classList.remove('sel'));
  openModal('eventModalBg');
}
function timeToMinutes(value){
  const m = String(value||'').match(/^(\d{1,2}):(\d{2})$/);
  if(!m) return NaN;
  return Math.max(0, Math.min(1439, parseInt(m[1],10)*60 + parseInt(m[2],10)));
}
function eventStartMinutes(e){
  if(Number.isFinite(e.startMin)) return e.startMin;
  if(Number.isFinite(e.startHour)) return Math.max(0, Math.min(1440, e.startHour*60));
  return 0;
}
function eventEndMinutes(e){
  if(Number.isFinite(e.endMin)) return e.endMin;
  if(Number.isFinite(e.endHour)) return Math.max(0, Math.min(1440, e.endHour*60));
  return 60;
}
function formatTimeMinutes(min){
  min = Math.max(0, Math.min(1439, Number(min)||0));
  return String(Math.floor(min/60)).padStart(2,'0')+':'+String(min%60).padStart(2,'0');
}
async function requestEventReminderPermission(box){
  if(!box?.checked)return;
  if(!notificationSupported()){ box.checked=false; toast('⚠️ اعلان روی این محیط در دسترس نیست'); return; }
  if(Notification.permission==='granted'){ DB.pomodoro.notifications=true; DB.notifications={enabled:true}; persist(); await ensureNotificationRegistration(); return; }
  try{
    const permission=await Notification.requestPermission();
    if(permission==='granted'){
      DB.pomodoro.notifications=true; DB.notifications={enabled:true}; persist(); await ensureNotificationRegistration();
      toast('✅ یادآوری این رویداد فعاله');
    }else{
      box.checked=false; toast('⛔ بدون اجازه اعلان، یادآوری فعال نمی‌شه');
    }
  }catch(_){ box.checked=false; toast('⚠️ فعال‌سازی یادآوری ناموفق بود'); }
}
async function saveEvent(){
  const title=document.getElementById('eTitle').value.trim();
  if(!title){toast('⚠️ عنوان رویداد رو بنویس');return;}
  const days=[...document.querySelectorAll('#eDays .chip-opt.sel')].map(o=>+o.dataset.v);
  if(!days.length){toast('⚠️ حداقل یک روز رو انتخاب کن');return;}

  const startMin=timeToMinutes(document.getElementById('eHourStart').value);
  let endMin=timeToMinutes(document.getElementById('eHourEnd').value);
  if(!Number.isFinite(startMin)||!Number.isFinite(endMin)){toast('⚠️ ساعت را درست وارد کن');return;}

  const crossesMidnight=endMin<=startMin;
  if(crossesMidnight)endMin+=1440;
  if(endMin<=startMin||endMin>2880){toast('⚠️ بازه زمانی نامعتبره');return;}

  let reminder=!!document.getElementById('eReminder').checked;
  if(reminder && Notification.permission!=='granted'){
    if(!notificationSupported()){ toast('⚠️ اعلان روی این محیط در دسترس نیست'); return; }
    const permission=await Notification.requestPermission();
    if(permission!=='granted'){ toast('⛔ اول اجازه نوتیفیکیشن را بده، بعد رویداد را ذخیره کن'); document.getElementById('eReminder').checked=false; return; }
    DB.pomodoro.notifications=true; DB.notifications={enabled:true}; persist();
    await ensureNotificationRegistration();
  }

  const candidate={title,days,startMin,endMin};
  const conflict=findEventConflict(candidate,window.__editingEventId);
  if(conflict){
    toast(`⚠️ «${conflict.title}» مانع ثبت این رویداد است؛ ساعت‌ها تداخل دارند`);
    return;
  }

  if(window.__editingEventId){
    const ev=DB.events.find(x=>x.id===window.__editingEventId);
    if(ev){
      ev.title=title;ev.days=days;ev.startMin=startMin;ev.endMin=endMin;ev.reminder=reminder;
      ev.startHour=Math.floor(startMin/60);ev.endHour=Math.min(24,Math.floor(endMin/60));
      delete ev.day;
    }
    toast('✏️ رویداد ویرایش شد');
  }else{
    DB.events.push({
      id:uid(),title,days,startMin,endMin,reminder,
      startHour:Math.floor(startMin/60),endHour:Math.min(24,Math.floor(endMin/60))
    });
    toast(reminder?'📅 رویداد اضافه شد؛ یادآورش فعاله':'📅 رویداد اضافه شد');
  }
  window.__editingEventId=null;
  closeModal('eventModalBg');
  save();
  renderCalendar();
  rescheduleAllEventReminders();
}

function eventSegments(e){
  const out=[];
  const s=eventStartMinutes(e), en=eventEndMinutes(e);
  eventDays(e).forEach(d=>{
    const end=Math.min(en,1440);
    if(end>s)out.push({day:d,start:s,end});
    if(en>1440)out.push({day:(d+1)%7,start:0,end:en-1440});
  });
  return out;
}
function findEventConflict(candidate,ignoreId=null){
  const cSeg=eventSegments(candidate);
  for(const other of DB.events){
    if(other.id===ignoreId)continue;
    for(const a of cSeg){
      for(const b of eventSegments(other)){
        if(a.day===b.day&&a.start<b.end&&b.start<a.end)return other;
      }
    }
  }
  return null;
}
function reminderStorageKey(date,evId,day){
  return `lifePlanner_eventReminder_${date}_${evId}_${day}`;
}
const reminderTimers=new Map();
function markReminderSent(key){ localStorage.setItem(key,String(Date.now())); }
function reminderAlreadySent(key){ const v=Number(localStorage.getItem(key)||0); return v>0 && (Date.now()-v)<20*60*60*1000; }
function nextEventOccurrence(ev){
  const now=new Date();
  const nowDay=(now.getDay()+1)%7;
  const nowMin=now.getHours()*60+now.getMinutes();
  let best=null;
  eventDays(ev).forEach(day=>{
    let delta=(day-nowDay+7)%7;
    const mins=eventStartMinutes(ev);
    if(delta===0 && mins<=nowMin) delta=7;
    const target=new Date(now); target.setHours(0,0,0,0); target.setDate(target.getDate()+delta); target.setHours(Math.floor(mins/60),mins%60,0,0);
    if(!best||target<best) best=target;
  });
  return best;
}
function scheduleEventReminder(ev){
  if(!ev.reminder)return;
  const old=reminderTimers.get(ev.id); if(old)clearTimeout(old);
  const target=nextEventOccurrence(ev); if(!target)return;
  const delay=Math.max(1000,target.getTime()-Date.now());
  const timer=setTimeout(async()=>{
    reminderTimers.delete(ev.id);
    const date=dateToLocalISO(target); const day=(target.getDay()+1)%7; const key=reminderStorageKey(date,ev.id,day);
    if(!reminderAlreadySent(key) && Notification.permission==='granted'){
      markReminderSent(key);
      await ensureNotificationRegistration();
      await sendNotification('🔔 یادآوری Life Planner',`${ev.title} — شروع شد`,{tag:`lp-${ev.id}-${date}`,renotify:true});
    }
    scheduleEventReminder(ev);
  },Math.min(delay,2147483647));
  reminderTimers.set(ev.id,timer);
}
function rescheduleAllEventReminders(){ reminderTimers.forEach(t=>clearTimeout(t)); reminderTimers.clear(); DB.events.filter(e=>e.reminder).forEach(scheduleEventReminder); }
async function checkEventReminders(){
  if(Notification.permission!=='granted') return;
  const now=new Date(); const day=(now.getDay()+1)%7; const minute=now.getHours()*60+now.getMinutes(); const date=todayISO();
  for(const ev of DB.events){
    if(!ev.reminder||!eventDays(ev).includes(day)||eventStartMinutes(ev)!==minute)continue;
    const key=reminderStorageKey(date,ev.id,day); if(reminderAlreadySent(key))continue;
    markReminderSent(key); await sendNotification('🔔 یادآوری Life Planner',`${ev.title} — شروع شد`,{tag:`lp-${ev.id}-${date}`,renotify:true});
  }
}
function startEventReminderScheduler(){
  ensureNotificationRegistration();
  checkEventReminders(); rescheduleAllEventReminders();
  setInterval(checkEventReminders,15000);
}
function deleteEvent(id){ DB.events = DB.events.filter(x=>x.id!==id); save(); rescheduleAllEventReminders(); }
function eventDays(e){ return e.days || (e.day!==undefined ? [e.day] : []); }

function onEventBlockClick(eventId, dayIdx){
  const ev = DB.events.find(x=>x.id===eventId); if(!ev) return;
  window.__eventActionCtx = { eventId, dayIdx };
  document.getElementById('eventActionTitle').textContent = `📅 ${ev.title}`;
  const multiDay = eventDays(ev).length > 1;
  document.getElementById('deleteThisDayBtn').style.display = multiDay ? 'flex' : 'none';
  const meta=document.getElementById('eventActionDetails');
  if(meta){
    const s=eventStartMinutes(ev), e=eventEndMinutes(ev), d=Math.max(0,e-s);
    const dur=d>=60?`${Math.floor(d/60)} ساعت${d%60?` و ${d%60} دقیقه`:''}`:`${d} دقیقه`;
    meta.innerHTML=`🕒 <b style="color:var(--neon);direction:ltr;display:inline-block">${formatTimeMinutes(s%1440)} → ${formatTimeMinutes(e%1440)}</b> · ⏱️ ${dur}`;
  }
  openModal('eventActionModalBg');
}
function startEditEvent(){
  const ctx=window.__eventActionCtx;if(!ctx)return;
  const ev=DB.events.find(x=>x.id===ctx.eventId);if(!ev)return;
  closeModal('eventActionModalBg');
  window.__editingEventId=ev.id;
  document.getElementById('eventModalTitle').textContent='✏️ ویرایش رویداد';
  document.getElementById('eTitle').value=ev.title;
  document.getElementById('eHourStart').value=formatTimeMinutes(eventStartMinutes(ev)%1440);
  document.getElementById('eHourEnd').value=formatTimeMinutes(eventEndMinutes(ev)%1440);
  document.getElementById('eReminder').checked=!!ev.reminder;
  const days=eventDays(ev);
  document.querySelectorAll('#eDays .chip-opt').forEach(o=>o.classList.toggle('sel',days.includes(+o.dataset.v)));
  openModal('eventModalBg');
}
function deleteEventDay(){
  const ctx = window.__eventActionCtx; if(!ctx) return;
  const ev = DB.events.find(x=>x.id===ctx.eventId); if(!ev) return;
  const days = eventDays(ev).filter(d=>d!==ctx.dayIdx);
  if(days.length){ ev.days = days; delete ev.day; }
  else { DB.events = DB.events.filter(x=>x.id!==ev.id); }
  window.__eventActionCtx = null;
  closeModal('eventActionModalBg');
  save();
  rescheduleAllEventReminders();
}
function deleteWholeEvent(){
  const ctx = window.__eventActionCtx; if(!ctx) return;
  DB.events = DB.events.filter(x=>x.id!==ctx.eventId);
  window.__eventActionCtx = null;
  closeModal('eventActionModalBg');
  save();
  rescheduleAllEventReminders();
  toast('🗑️ کل رویداد حذف شد');
}
function renderCalendar(){
  const START=7,END=24,PX_HOUR=52;
  const now=new Date();
  const today=(now.getDay()+1)%7;
  const currentHour=now.getHours();

  let head='<div class="lp-cal-head lp-cal-time"></div>';
  dayNames.forEach((d,i)=>head+=`<div class="lp-cal-head${i===today?' today current-day':''}">${d}</div>`);

  let axis='';
  for(let h=START;h<END;h++){
    axis+=`<div class="lp-cal-time-row${h===currentHour?' current-hour':''}">${String(h).padStart(2,'0')}:00</div>`;
  }

  let days='';
  for(let d=0;d<7;d++){
    days+=`<div class="lp-cal-day" data-day="${d}">`;
    for(let h=START;h<END;h++)days+=`<div class="lp-cal-hour${d===today&&h===currentHour?' current-hour':''}"></div>`;
    days+='</div>';
  }

  document.getElementById('weekGrid').innerHTML=
    `<div class="lp-cal-wrap"><div class="lp-cal-header">${head}</div><div class="lp-cal-body"><div class="lp-cal-time-col">${axis}</div><div class="lp-cal-days">${days}</div></div></div>`;

  const cols=document.querySelectorAll('.lp-cal-day');
  DB.events.forEach(e=>{
    const s=eventStartMinutes(e),en=eventEndMinutes(e);
    if(!Number.isFinite(s)||!Number.isFinite(en)||en<=s)return;
    eventDays(e).forEach(d=>{
      const col=cols[d];if(!col)return;
      const from=Math.max(s,START*60),to=Math.min(en,END*60);
      if(from>=to)return;
      const el=document.createElement('button');
      el.type='button';
      const duration=to-from;
      const sizeClass=duration<15?' event-tiny':(duration<30?' event-short':'');
      el.className='ev-block'+sizeClass;
      el.style.top=((from-START*60)/60*PX_HOUR)+'px';
      el.style.height=Math.max(10,(to-from)/60*PX_HOUR-2)+'px';
      el.innerHTML=`<span class="ev-title">${esc(e.title)}</span>`;
      if(e.reminder){
        const dot=document.createElement('span');
        dot.className='ev-reminder-dot';
        dot.title='یادآور فعال است';
        dot.setAttribute('aria-label','یادآور فعال است');
        el.appendChild(dot);
      }
      el.onclick=()=>onEventBlockClick(e.id,d);
      col.appendChild(el);
    });
  });
}
/* ============ CHARTS (self-contained, no external library) ============ */
function last7(){ const arr=[]; for(let i=6;i>=0;i--){ const d=new Date(); d.setDate(d.getDate()-i); arr.push(dateToLocalISO(d)); } return arr; }
function cssVar(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function setupCanvas(canvas, cssHeight){
  const dpr = window.devicePixelRatio||1;
  const w = canvas.parentElement.clientWidth - 4;
  canvas.width = Math.max(w,50)*dpr; canvas.height = cssHeight*dpr;
  canvas.style.width = '100%'; canvas.style.height = cssHeight+'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,w,cssHeight);
  return {ctx, w, h:cssHeight};
}
function roundRect(ctx,x,y,w,h,r){
  if(h<=0){ return; }
  r = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}
function drawBarChart(canvas, labels, values, color){
  const {ctx,w,h} = setupCanvas(canvas, 180);
  const line = cssVar('--line'), dim = cssVar('--txt-dim2');
  const padL=8, padR=8, padT=12, padB=24;
  const plotW = w-padL-padR, plotH = h-padT-padB;
  const maxVal = Math.max(...values, 1);
  ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.font = '10px Segoe UI, Tahoma, sans-serif'; ctx.fillStyle = dim;
  for(let i=0;i<=3;i++){
    const y = padT + plotH - (plotH*i/3);
    ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(w-padR,y); ctx.stroke();
  }
  const n = values.length, slot = plotW/n, barW = slot*0.5;
  values.forEach((v,i)=>{
    const bh = maxVal? (v/maxVal)*plotH : 0;
    const x = padL + i*slot + (slot-barW)/2;
    const y = padT + plotH - bh;
    ctx.fillStyle = color;
    roundRect(ctx, x, y, barW, bh, 5); ctx.fill();
    ctx.fillStyle = dim; ctx.textAlign='center';
    ctx.fillText(labels[i], x+barW/2, h-8);
  });
}
function drawLineChart(canvas, labels, values, color, fillColor){
  const {ctx,w,h} = setupCanvas(canvas, 180);
  const line = cssVar('--line'), dim = cssVar('--txt-dim2');
  const padL=8, padR=8, padT=12, padB=24;
  const plotW = w-padL-padR, plotH = h-padT-padB;
  const maxVal = Math.max(...values, 1);
  ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.font = '10px Segoe UI, Tahoma, sans-serif';
  for(let i=0;i<=3;i++){
    const y = padT + plotH - (plotH*i/3);
    ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(w-padR,y); ctx.stroke();
  }
  const n = values.length, slot = n>1? plotW/(n-1) : plotW;
  const pts = values.map((v,i)=>({x: padL + i*slot, y: padT + plotH - (maxVal? (v/maxVal)*plotH : 0)}));
  ctx.beginPath(); ctx.moveTo(pts[0].x, padT+plotH);
  pts.forEach(p=>ctx.lineTo(p.x,p.y));
  ctx.lineTo(pts[pts.length-1].x, padT+plotH); ctx.closePath();
  ctx.fillStyle = fillColor; ctx.fill();
  ctx.beginPath(); pts.forEach((p,i)=> i===0? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y));
  ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin='round'; ctx.stroke();
  pts.forEach(p=>{ ctx.beginPath(); ctx.arc(p.x,p.y,3,0,7); ctx.fillStyle = color; ctx.fill(); });
  ctx.fillStyle = dim; ctx.textAlign='center';
  labels.forEach((l,i)=> ctx.fillText(l, pts[i].x, h-8));
}
function drawDoughnut(canvas, labels, values, colors){
  const {ctx,w,h} = setupCanvas(canvas, 180);
  const total = values.reduce((a,b)=>a+b,0);
  const cx = w/2, cy = 74, rOuter = 58, rInner = 34;
  if(!total){
    ctx.fillStyle = cssVar('--txt-dim2'); ctx.font='12px Segoe UI, Tahoma'; ctx.textAlign='center';
    ctx.fillText('داده‌ای نیست', cx, cy); return;
  }
  let start = -Math.PI/2;
  values.forEach((v,i)=>{
    if(!v) return;
    const angle = (v/total)*Math.PI*2;
    ctx.beginPath(); ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,rOuter,start,start+angle); ctx.closePath();
    ctx.fillStyle = colors[i]; ctx.fill();
    start += angle;
  });
  ctx.globalCompositeOperation='destination-out';
  ctx.beginPath(); ctx.arc(cx,cy,rInner,0,Math.PI*2); ctx.fill();
  ctx.globalCompositeOperation='source-over';
  // legend
  ctx.font='11px Segoe UI, Tahoma'; ctx.textAlign='center';
  const legendY = 148; const itemW = w/labels.length;
  labels.forEach((l,i)=>{
    const x = itemW*i + itemW/2;
    ctx.fillStyle = colors[i]; ctx.beginPath(); ctx.arc(x-16, legendY, 4, 0, 7); ctx.fill();
    ctx.fillStyle = cssVar('--txt-dim'); ctx.textAlign='right';
    ctx.fillText(l+' ('+values[i]+')', x+18, legendY+4);
  });
}
function drawHBarChart(canvas, labels, values, color, max){
  const rowH = 30, h = Math.max(labels.length*rowH + 10, 60);
  const {ctx,w} = setupCanvas(canvas, h);
  const padL = 6, padR = 40;
  labels.forEach((l,i)=>{
    const y = 8 + i*rowH;
    ctx.fillStyle = cssVar('--txt'); ctx.font='11.5px Segoe UI, Tahoma'; ctx.textAlign='right';
    ctx.fillText(l, w-padR+2, y+15, w-padL-padR-4);
  });
  // adjust: draw bars below labels on next line for clarity on narrow screens
  labels.forEach((l,i)=>{
    const y = 8 + i*rowH + 18;
    const trackW = w - padR - padL;
    ctx.fillStyle = cssVar('--track'); roundRect(ctx, padL, y, trackW, 6, 4); ctx.fill();
    const bw = trackW * Math.min(values[i]/max,1);
    ctx.fillStyle = color; roundRect(ctx, padL, y, bw, 6, 4); ctx.fill();
    ctx.fillStyle = cssVar('--txt-dim2'); ctx.font='10px Consolas, monospace'; ctx.textAlign='left';
    ctx.fillText(values[i]+'٪', padL, y-4);
  });
}
function renderCharts(){
  const days = last7();
  const dayLbl = days.map(d=>new Date(d).toLocaleDateString('fa-IR',{weekday:'short'}));
  const taskData = days.map(d=> (DB.history[d]?.tasks)||0);
  const habitData = days.map(d=> (DB.history[d]?.habits)||0);

  drawBarChart(document.getElementById('chartTasks'), dayLbl, taskData, cssVar('--neon'));
  drawLineChart(document.getElementById('chartHabits'), dayLbl, habitData, cssVar('--violet'), 'rgba(139,107,255,.18)');

  const prCounts = {low:0,medium:0,high:0,critical:0};
  DB.tasks.forEach(t=>prCounts[t.priority]=(prCounts[t.priority]||0)+1);
  drawDoughnut(document.getElementById('chartPriority'), ['پایین','متوسط','بالا','بحرانی'], [prCounts.low,prCounts.medium,prCounts.high,prCounts.critical], ['#2ee6a6','#ffb545','#ff8098','#ff5470']);

  if(DB.goals.length){
    drawHBarChart(document.getElementById('chartGoals'), DB.goals.map(g=>g.title.slice(0,18)), DB.goals.map(g=>g.progress), cssVar('--neon2'), 100);
  } else {
    const {ctx,w,h} = setupCanvas(document.getElementById('chartGoals'), 60);
    ctx.fillStyle = cssVar('--txt-dim2'); ctx.font='12px Segoe UI, Tahoma'; ctx.textAlign='center';
    ctx.fillText('هنوز هدفی ثبت نشده', w/2, h/2);
  }
}

/* ============ EXPORT / IMPORT ============ */
function buildBackupPayload(){
  const payload=JSON.parse(JSON.stringify(DB));
  payload.uiSettings={
    fontSize:localStorage.getItem('lifePlannerFontSize_v2')||localStorage.getItem('lifePlannerFontSize_v1')||'medium',
    activeTheme:localStorage.getItem(THEME_KEY)||'dark',
    uiScale:localStorage.getItem('lifePlannerUIScale_v1')||'medium',
    pinnedNav:(()=>{try{return JSON.parse(localStorage.getItem(PINNED_NAV_KEY)||'null')}catch(_){return null}})()
  };
  return payload;
}
function exportBackup(){
  const blob = new Blob([JSON.stringify(buildBackupPayload(),null,2)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'life-planner-backup.json'; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  toast('⬇️ فایل پشتیبان دانلود شد');
}
async function shareBackup(){
  const fileName = 'life-planner-backup.json';
  const blob = new Blob([JSON.stringify(buildBackupPayload(),null,2)], {type:'application/json'});
  try{
    const file = new File([blob], fileName, {type:'application/json'});
    if(navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({ files:[file], title:'پشتیبان برنامه‌ریز هوشمند زندگی', text:'فایل پشتیبان — این رو یه‌جای امن (گوگل‌درایو، ایمیل و...) نگه‌دار.' });
      toast('✅ ارسال شد');
      return;
    }
  }catch(e){
    if(e && e.name==='AbortError') return; // user cancelled the share sheet, not an error
  }
  // fallback: browser doesn't support file sharing — just download instead
  exportBackup();
  toast('این مرورگر اشتراک‌گذاری مستقیم رو پشتیبانی نمی‌کنه — فایل دانلود شد، خودت بفرستش به فضای ابری 📤');
}
const _shareBtn = document.getElementById('shareBtn'); if(_shareBtn) _shareBtn.onclick = shareBackup;
const _exportBtn = document.getElementById('exportBtn'); if(_exportBtn) _exportBtn.onclick = exportBackup;
const _importBtn = document.getElementById('importBtn'); if(_importBtn) _importBtn.onclick = ()=> document.getElementById('importFile').click();
document.getElementById('importFile').onchange = (e)=>{
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const parsed = JSON.parse(reader.result);
      // validate it's actually a life planner backup
      if(typeof parsed !== 'object' || parsed === null || !('tasks' in parsed)){
        toast('⚠️ فایل نامعتبر است — بک‌آپ لایف پلنر نیست'); return;
      }
      DB = parsed;
      const restoredUI = (parsed.uiSettings && typeof parsed.uiSettings==='object') ? parsed.uiSettings : null;
      if(restoredUI){
        if(restoredUI.fontSize) localStorage.setItem('lifePlannerFontSize_v2',restoredUI.fontSize);
        if(restoredUI.uiScale) localStorage.setItem('lifePlannerUIScale_v1',restoredUI.uiScale);
        if(restoredUI.activeTheme && THEME_META[restoredUI.activeTheme]) useTheme(restoredUI.activeTheme);
        if(Array.isArray(restoredUI.pinnedNav) && restoredUI.pinnedNav.length===4) localStorage.setItem(PINNED_NAV_KEY,JSON.stringify(restoredUI.pinnedNav));
      }
      DB.notes = Array.isArray(DB.notes)?DB.notes:[];
      DB.events = Array.isArray(DB.events)?DB.events:[];
      DB.notes.forEach(n=>{ if(typeof n.pinned!=='boolean') n.pinned=false; if(!n.updatedAt) n.updatedAt=n.date||todayISO(); });
      DB.events.forEach(e=>{ if(typeof e.reminder!=='boolean') e.reminder=false; });
      // run migration guards (same as after loadStore)
      if(!DB.quest){ DB.quest = { current:null, nextAt: Date.now()+2*60*1000, waitStart: Date.now(), bags:{} }; }
      if(DB.quest.waitStart===undefined) DB.quest.waitStart = Date.now();
      if(!DB.stats){ DB.stats = { tasksCompleted:0, questsCompleted:0, bestStreak:0 }; }
      if(DB.stats.perfectDays===undefined) DB.stats.perfectDays = 0;
      if(DB.stats.questsCompletedByDate===undefined) DB.stats.questsCompletedByDate = {};
      if(DB.stats.totalXPEarned===undefined) DB.stats.totalXPEarned = 0;
      if(DB.stats.weeklyPerfectUnlocked===undefined) DB.stats.weeklyPerfectUnlocked = false;
      if(!DB.dailyGoalProgress) DB.dailyGoalProgress = {};
      if(!DB.perfectDayHistory) DB.perfectDayHistory = {};
      if(!DB.pomodoro){ DB.pomodoro = { settings:{focusMin:25, breakMin:5, goalMinutes:0}, session:null, history:{}, pendingNext:null }; }
      if(DB.pomodoro.pendingNext===undefined) DB.pomodoro.pendingNext = null;
      if(!DB.motivation) DB.motivation = { mood:'energize' };
      if(DB.xpWallet===undefined) DB.xpWallet = DB.stats.totalXPEarned||0;
      if(!DB.xpBoost) DB.xpBoost = { activeUntil:0 };
      if(DB.streakShields===undefined) DB.streakShields = 0;
      if(!DB.cityBonusItems) DB.cityBonusItems = [];
      if(!DB.themes) DB.themes = { owned:['dark','light'] };
      if(DB.lastBackupReminder===undefined) DB.lastBackupReminder = Date.now();
      if(DB.lastAutoBackupAt===undefined) DB.lastAutoBackupAt = Date.now();
      if(DB.skillPoints===undefined) DB.skillPoints = 0;
      if(!DB.skillTiers) DB.skillTiers = { pomoXp:0, questXp:0, shopDiscount:0, luckyBox:0, criticalBonus:0, streakGuard:0 };
      if(!DB.boss) DB.boss = { active:null, nextAvailableAt: Date.now() };
      if(!DB.crisis) DB.crisis = { active:false, deadlineAt:0, cooldownUntil:0 };
      if(!DB.newRecordFlags) DB.newRecordFlags = {};
      // ensure tasks have extraDeadlines, subtasks, workflow status and inbox flag
      (DB.tasks||[]).forEach(t=>{
        if(!Array.isArray(t.extraDeadlines)) t.extraDeadlines=[];
        if(!Array.isArray(t.subtasks)) t.subtasks=[];
        if(!t.status) t.status='notstarted';
        if(typeof t.inbox !== 'boolean') t.inbox = false;
      });
      localStorage.setItem(STORE_KEY, JSON.stringify(DB));
      renderAll();
      toast('✅ بازیابی کامل شد — ' + (DB.tasks||[]).length + ' تسک بازگردانده شد');
    }
    catch(err){
      console.error('Import error:', err);
      toast('⚠️ فایل نامعتبر است — ' + (err.message||''));
    }
  };
  reader.readAsText(file, 'utf-8');
};

/* ============ DASHBOARD RENDER ============ */
function renderDashboard(){
  const hour = new Date().getHours();
  const greet = hour<5?'شب‌بخیر 🌙': hour<12?'صبح‌بخیر ☀️': hour<18?'ظهر‌بخیر 🌤️':'عصر‌بخیر 🌆';
  document.getElementById('greetTitle').textContent = greet;
  document.getElementById('todayStr').textContent = new Date().toLocaleDateString('fa-IR', {weekday:'long', year:'numeric', month:'long', day:'numeric'});
  renderMotivation();

  const doneToday = DB.tasks.filter(t=>!t.inbox && t.doneDate===todayISO()).length;
  document.getElementById('statDone').textContent = doneToday;
  const maxStreak = DB.habits.length ? Math.max(0, ...DB.habits.map(habitStreak)) : 0;
  document.getElementById('statStreak').textContent = maxStreak;
  const avgGoal = DB.goals.length ? Math.round(DB.goals.reduce((s,g)=>s+g.progress,0)/DB.goals.length) : 0;
  document.getElementById('statGoals').textContent = avgGoal+'٪';
  const score = Math.min(100, doneToday*15 + maxStreak*5 + Math.round(avgGoal*0.2));
  document.getElementById('statScore').textContent = score;

  const total = DB.tasks.filter(t=>!t.inbox).length, done = DB.tasks.filter(t=>!t.inbox && t.done).length;
  const pct = total? Math.round(done/total*100):0;
  document.getElementById('totalTasksN').textContent = total;
  document.getElementById('doneTasksN').textContent = done;
  document.getElementById('donutText').textContent = pct+'٪';
  document.getElementById('donutWrap').style.background = `conic-gradient(#00e5ff ${pct*3.6}deg, rgba(255,255,255,.08) 0deg)`;
}

/* ============ RENDER ALL ============ */
/* PERF: renders for hidden views are skipped — rebuilding every subsystem on
   each save() was the single biggest source of interaction jank on phones
   (the calendar grid alone is ~130 nodes). showView() re-renders the incoming
   view via renderView(), so a view is always fresh when it appears, and the
   dashboard widgets owned by other renderers (today tasks / habit & goal
   minis) are refreshed directly while the dashboard is the active view. */
function viewActive(id){ const el=document.getElementById('view-'+id); return !!(el && el.classList.contains('active')); }
function renderView(v){
  const jobs = {
    dashboard: ()=>{ renderXP(); renderDashboard(); renderTodayWidget(); renderHabitMini(); renderGoalMini(); renderQuestBox(); },
    tasks:     ()=>renderTasks(document.querySelector('#taskFilters .sel')?.dataset.f || 'all'),
    calendar:  ()=>renderCalendar(),
    habits:    ()=>renderHabits(),
    goals:     ()=>renderGoals(),
    notes:     ()=>renderNotes(),
    profile:   ()=>renderProfile(),
    pomodoro:  ()=>{ renderPomoUI(); renderPomoStats(); if(pomoTab==='stats') renderPomoChart(); },
    shop:      ()=>renderXPShop(),
    skills:    ()=>renderSkillTree(),
    boss:      ()=>renderBossContent(),
    yvy:       ()=>renderYVY(),
    settings:  ()=>{ if(typeof renderSettings==='function') renderSettings(); if(typeof renderPomoNotifyStatus==='function') renderPomoNotifyStatus(); }
  };
  const job = jobs[v];
  if(job){ try{ job(); }catch(err){ console.error('[Life Planner render error]', v, err); } }
}
function renderAll(){
  // Keep the app alive if one independent renderer encounters a bad/old state.
  // This is deliberately defensive: it does not change the UI or data model.
  const onDashboard = viewActive('dashboard');
  const jobs = [
    ['XP', ()=>renderXP()],
    ['Tasks', ()=>{ if(viewActive('tasks')) renderTasks(document.querySelector('#taskFilters .sel')?.dataset.f || 'all'); else if(onDashboard) renderTodayWidget(); }],
    ['Habits', ()=>{ if(viewActive('habits')) renderHabits(); else if(onDashboard) renderHabitMini(); }],
    ['Goals', ()=>{ if(viewActive('goals')) renderGoals(); else if(onDashboard) renderGoalMini(); }],
    ['Notes', ()=>{ if(viewActive('notes')) renderNotes(); }],
    ['Calendar', ()=>{ if(viewActive('calendar')) renderCalendar(); }],
    ['Dashboard', ()=>{ if(onDashboard) renderDashboard(); }],
    ['Quest', ()=>{ if(onDashboard) renderQuestBox(); }],
    ['Profile', ()=>{ if(viewActive('profile')) renderProfile(); }],
    ['Pomodoro UI', ()=>{ if(viewActive('pomodoro')) renderPomoUI(); }],
    ['Pomodoro stats', ()=>{ if(viewActive('pomodoro')) renderPomoStats(); }],
    ['Skills', ()=>{ if(viewActive('skills')) renderSkillTree(); }],
    ['Boss', ()=>{ if(viewActive('boss')) renderBossContent(); }],
    ['YVY', ()=>{ if(viewActive('yvy')) renderYVY(); }],
    ['Settings', ()=>{ if(viewActive('settings') && typeof renderSettings==='function') renderSettings(); }]
  ];
  for(const [name, job] of jobs){
    try { job(); }
    catch(err){
      console.error('[Life Planner render error]', name, err);
    }
  }
}
checkStreakShields();
renderPinnedNav();
renderAll();
startEventReminderScheduler();
setInterval(()=>{ const cv=document.getElementById('view-calendar'); if(cv&&cv.classList.contains('active')) renderCalendar(); },30000);
const DAY_MS = 24*60*60*1000;
function autoLocalBackup(){
  if(Date.now() - (DB.lastAutoBackupAt||0) < DAY_MS) return;
  try{
    exportBackup();
    DB.lastAutoBackupAt = Date.now();
    localStorage.setItem(STORE_KEY, JSON.stringify(DB));
  }catch(e){ /* auto backup failed silently, the daily reminder modal is the fallback */ }
}
function checkBackupReminder(){
  if(Date.now() - (DB.lastBackupReminder||0) >= DAY_MS){
    openModal('backupReminderModalBg');
    DB.lastBackupReminder = Date.now();
    localStorage.setItem(STORE_KEY, JSON.stringify(DB));
  }
}
setTimeout(autoLocalBackup, 1200);
setTimeout(checkBackupReminder, 2200);
setTimeout(checkBossTrigger, 2600);
applyCrisisTheme(DB.crisis.active);
checkCriticalCrisis();

/* ============ APP UPDATE CHECK ============ */
const LP_APP_VERSION='11.0';
let lpUpdateShown=false;
function showLifePlannerUpdate(v){
  if(lpUpdateShown)return;
  lpUpdateShown=true;
  const x=document.createElement('div');
  x.id='lpUpdateNotice'; x.dir='rtl';
  x.style.cssText='position:fixed;left:12px;right:12px;bottom:74px;z-index:99999;background:var(--bg2);border:1px solid var(--neon);border-radius:14px;padding:12px;box-shadow:0 10px 35px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px;';
  x.innerHTML=`<div><b>🆕 نسخه جدید Life Planner</b><div style="color:var(--txt-dim)">نسخه ${esc(v)} آماده است.</div></div><button class="btn" id="lpUpdateNow">به‌روزرسانی</button>`;
  document.body.appendChild(x);
  document.getElementById('lpUpdateNow').onclick=async()=>{
    try{
      const reg=await navigator.serviceWorker?.getRegistration();
      if(reg) await reg.update();
    }catch(_){}
    location.reload();
  };
}
async function checkLifePlannerUpdate(){
  try{
    const r=await fetch('app-version.json?t='+Date.now(),{cache:'no-store'});
    if(!r.ok)return;
    const v=String((await r.json()).version||'');
    if(v&&v!==LP_APP_VERSION)showLifePlannerUpdate(v);
  }catch(_){}
}
/* PERF: the update check now runs only from enhancements.js (one network
   poll every 3 minutes instead of two identical ones). */
/* ============ PWA / OFFLINE ============ */
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    ensureNotificationRegistration();
  });
}
