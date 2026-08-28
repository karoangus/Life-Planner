/* ============================================================
   Life Planner — enhancements: settings UI (font/UI scale,
   themes), backup & restore, update dialog
   Load order: after core.js.
   ============================================================ */

/* ============ LIFE PLANNER v7.1 ENHANCEMENTS ============ */
const LP_FONT_KEY = 'lifePlannerFontSize_v2';
const LP_UI_SCALE_KEY = 'lifePlannerUIScale_v1';
const LP_UI_SCALES = { small:0.90, medium:1, large:1.10, xlarge:1.20 };
function applyLPUIScale(){ const key=localStorage.getItem(LP_UI_SCALE_KEY)||'medium'; document.documentElement.style.setProperty('--lp-ui-scale', String(LP_UI_SCALES[key]||1)); }
const LP_MANUAL_XP_TAG = 'lifePlannerManualXp_v1';
const LP_FONT_SCALES = { small:0.90, medium:1, large:1.10, xlarge:1.20 };

function applyLPFontScale(){
  const key = localStorage.getItem(LP_FONT_KEY) || 'medium';
  const scale = LP_FONT_SCALES[key] || 1;
  document.documentElement.style.setProperty('--lp-font-scale', String(scale));
  document.documentElement.style.setProperty('--lp-base-font-size', `calc(clamp(13px, 2.5vw, 16px) * ${scale})`);
}

function ensureV64Data(){
  if(!DB.motivation || typeof DB.motivation!=='object') DB.motivation={mood:'energize'};
  if(typeof DB.motivation.custom!=='string') DB.motivation.custom='';
  if(!Array.isArray(DB.pomodoro?.manualData)){
    if(!DB.pomodoro || typeof DB.pomodoro!=='object') DB.pomodoro={settings:{focusMin:25,breakMin:5,goalMinutes:0},session:null,history:{},pendingNext:null};
    DB.pomodoro.manualData=[];
  }
  if(!Array.isArray(DB.pomodoro.sessionHistory)) DB.pomodoro.sessionHistory=[];
  if(typeof migrateLegacyManualPomoData==='function') migrateLegacyManualPomoData();
}

function renderMotivationV64(){
  if(typeof renderMotivation==='function') renderMotivation();
}

function renderSettings(){
  ensureV64Data();
  const font=document.getElementById('settingsFontSize');
  if(font) font.value=localStorage.getItem(LP_FONT_KEY)||'medium';
  const ui=document.getElementById('settingsUIScale');
  if(ui) ui.value=localStorage.getItem(LP_UI_SCALE_KEY)||'medium';
  const themeMenu=document.getElementById('settingsThemeList');
  if(themeMenu){
    const active=localStorage.getItem(THEME_KEY)||'dark';
    const owned=(DB.themes&&Array.isArray(DB.themes.owned))?DB.themes.owned:['dark','light'];
    const entries=Object.entries(THEME_META);
    themeMenu.innerHTML=entries.map(([id,meta])=>{
      const isActive=id===active, isOwned=owned.includes(id);
      return `<button type="button" class="settings-theme-option ${isActive?'active':''} ${isOwned?'':'locked'}" data-theme-id="${esc(id)}">
        <span class="theme-option-swatch" style="background:${meta.swatch}"></span>
        <span class="theme-option-name">${esc(meta.icon+' '+meta.label)}</span>
        <span class="theme-option-state">${isActive?'✅ فعال':isOwned?'انتخاب':'🔒 قفل'}</span>
      </button>`;
    }).join('');
    themeMenu.querySelectorAll('[data-theme-id]').forEach(btn=>btn.onclick=()=>{
      const id=btn.dataset.themeId;
      if(!(DB.themes?.owned||[]).includes(id)){
        toast('🔒 این تم هنوز باز نشده؛ از XP Shop آن را باز کن');
        return;
      }
      useTheme(id);
      renderSettings();
      toast(`🎨 تم ${THEME_META[id]?.label||id} فعال شد`);
    });
  }
  const ver=document.getElementById('settingsVersion'); if(ver) ver.textContent=LP_APP_VERSION;
}
function openSettings(){
  showView('settings');
  renderSettings();
}
window.openSettings=openSettings;

function openSettingsBackup(){
  const btn=document.getElementById('exportBtn');
  if(btn){btn.click();return;}
  if(typeof exportBackup==='function') exportBackup();
}
function openSettingsImport(){
  const input=document.getElementById('importFile');
  if(input) input.click();
}
function sendSettingsCloud(){
  if(typeof shareBackup==='function') shareBackup();
  else toast('⚠️ قابلیت ارسال پشتیبان در دسترس نیست');
}
function openSettingsNav(){
  if(typeof openPinnedNavSettings==='function') openPinnedNavSettings();
  else toast('⚠️ شخصی‌سازی نوار پایین در دسترس نیست');
}
function settingsToggleTheme(){
  if(typeof toggleTheme==='function') toggleTheme();
  renderSettings();
}
function setSettingsFontSize(v){
  if(!LP_FONT_SCALES[v]) return;
  localStorage.setItem(LP_FONT_KEY,v);
  applyLPFontScale();
  toast('🔤 اندازه فونت ذخیره شد');
}
function setSettingsUIScale(v){
  if(!LP_UI_SCALES[v]) return;
  localStorage.setItem(LP_UI_SCALE_KEY,v);
  applyLPUIScale();
  toast('🧩 اندازه رابط کاربری ذخیره شد');
}

function openCustomMotivationComposer(){
  ensureV64Data();
  const box=document.getElementById('motivationCustomBox');
  const input=document.getElementById('dashboardMotivationInput');
  if(!box)return;
  box.classList.add('open');
  if(input){ input.value=DB.motivation.custom||''; setTimeout(()=>input.focus(),0); }
}
function saveDashboardCustomMotivation(){
  ensureV64Data();
  const input=document.getElementById('dashboardMotivationInput');
  DB.motivation.custom=(input?.value||'').trim().slice(0,220);
  save();
  document.getElementById('motivationCustomBox')?.classList.remove('open');
  toast(DB.motivation.custom?'✅ پیام سفارشی اعمال شد':'🎲 پیام‌های رندوم فعال شدند');
}
function resetCustomMotivationFromDashboard(){
  ensureV64Data();
  DB.motivation.custom='';
  save();
  document.getElementById('motivationCustomBox')?.classList.remove('open');
  toast('🎲 پیام‌های انگیزشی رندوم دوباره فعال شدند');
}

/* Manual study -> existing XP system, deliberately capped to reduce abuse. */
function awardManualStudyXP(minutes, date){
  if(!minutes || minutes<1 || date!==todayISO()) return 0;
  const usedKey = LP_MANUAL_XP_TAG + '_' + date;
  const used = Number(localStorage.getItem(usedKey)||0);
  const maxDaily = 60;
  const base = Math.min(30, Math.floor(minutes/5));
  const award = Math.max(0, Math.min(base, maxDaily-used));
  if(award<=0) return 0;
  localStorage.setItem(usedKey,String(used+award));
  addXP(award);
  return award;
}

/* ============ APP UPDATE CHECK ============ */
let lpV64UpdateShown=false;
function showLifePlannerUpdate(v){
  if(lpV64UpdateShown || String(v)===LP_APP_VERSION) return;
  lpV64UpdateShown=true;
  const x=document.createElement('div');
  x.id='lpUpdateNotice'; x.dir='rtl';
  x.style.cssText='position:fixed;left:12px;right:12px;bottom:74px;z-index:99999;background:var(--bg2);border:1px solid var(--neon);border-radius:14px;padding:12px;box-shadow:0 10px 35px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px;';
  x.innerHTML=`<div><b>🆕 نسخه جدید Life Planner</b><div style="color:var(--txt-dim)">نسخه ${esc(v)} آماده است.</div></div><button class="btn" id="lpUpdateNow">به‌روزرسانی</button>`;
  document.body.appendChild(x);
  document.getElementById('lpUpdateNow').onclick=async()=>{
    try{
      const reg=await navigator.serviceWorker?.getRegistration();
      if(reg){ await reg.update(); if(reg.waiting) reg.waiting.postMessage({type:'SKIP_WAITING'}); }
      if('caches' in window){ const keys=await caches.keys(); await Promise.all(keys.filter(k=>k!=='life-planner-cache-v40').map(k=>caches.delete(k))); }
    }catch(_){ }
    location.reload();
  };
}
async function checkLifePlannerUpdate(){
  try{
    const r=await fetch('app-version.json?t='+Date.now(),{cache:'no-store'});
    if(!r.ok)return;
    const v=String((await r.json()).version||'');
    if(v&&v!==LP_APP_VERSION)showLifePlannerUpdate(v);
  }catch(_){ }
}

/* v6.4 replaces the v6.2 appended body injection with a real view inside the app. */
document.addEventListener('DOMContentLoaded',()=>{
  applyLPFontScale();
  applyLPUIScale();
  ensureV64Data();
  if(typeof renderPinnedNav==='function') renderPinnedNav();
  if(typeof renderAll==='function') renderAll();
  renderSettings();
  checkLifePlannerUpdate();
  setInterval(checkLifePlannerUpdate,180000);
  setTimeout(renderSettings,80);
});

/* Keep direct theme changes reflected in Settings. */
const _origUseThemeV64 = window.useTheme;
if(typeof _origUseThemeV64==='function'){
  window.useTheme=function(theme){ _origUseThemeV64(theme); renderSettings(); };
}
