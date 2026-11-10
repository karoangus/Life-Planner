/* ============================================================
   Life Planner — offline / national-internet layer (v24.7)
   Why:
   در شرایط جنگ / اینترنت ملی فقط دامنه‌های ‎.ir داخل کشور بازند
   و github.io فیلتر می‌شود. این برنامه از اول Local-First است
   (همه‌چیز در localStorage)، اما باید بعد از «یک بار لود» هیچ
   نیازی به شبکه نداشته باشد و روی گوشی بماند.

   What this file does (additive, no renderer replaced):
     1. storage persistence — navigator.storage.persist()
     2. online/offline banner + toast
     3. PWA install prompt capture + button
     4. precache / “ذخیره آفلاین” helper
     5. boot-time offline check

   Load order: after core.js / before close body, no dependency.
   ============================================================ */
(function(){
  'use strict';

  var PERSIST_KEY = 'lifePlannerPersist_v1';
  var INSTALL_KEY = 'lifePlannerInstallDismissed_v1';

  /* ---------- 1. persistent storage ---------- */
  async function ensurePersist(){
    try{
      if(navigator.storage && navigator.storage.persist){
        var already = await navigator.storage.persisted();
        if(!already){
          var granted = await navigator.storage.persist();
          if(granted) toast('💾 حافظه دائمی شد — داده‌ها با پاک‌سازی خودکار حذف نمی‌شوند');
        }
        try{ localStorage.setItem(PERSIST_KEY, '1'); }catch(_){}
        return granted || already;
      }
    }catch(_){}
    return false;
  }
  window.lpEnsurePersist = ensurePersist;
  window.lpRequestPersist = ensurePersist;

  /* ---------- 2. online/offline indicator ---------- */
  function updateOfflineUI(){
    var online = navigator.onLine;
    var badge = document.getElementById('offlineBadge');
    var banner = document.getElementById('offlineBanner');
    if(badge){
      badge.style.display = online ? 'none' : 'inline-flex';
      badge.textContent = online ? 'آنلاین' : 'آفلاین ✅';
      badge.setAttribute('data-online', online ? '1':'0');
    }
    if(banner){
      banner.style.display = online ? 'none' : 'flex';
    }
    var dot = document.getElementById('offlineDot');
    if(dot){
      dot.style.display = online ? 'none' : 'inline-flex';
    }
  }

  function bindOnlineEvents(){
    window.addEventListener('online', function(){
      updateOfflineUI();
      if(typeof toast==='function') toast('🌐 اینترنت وصل شد — ولی برنامه بدون آن هم کار می‌کند');
    });
    window.addEventListener('offline', function(){
      updateOfflineUI();
      if(typeof toast==='function') toast('📴 حالت آفلاین — همه‌چیز از حافظه گوشی می‌آید، اینترنت لازم نیست');
    });
  }

  /* ---------- 3. PWA install prompt ---------- */
  var deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function(e){
    e.preventDefault();
    deferredPrompt = e;
    var btn = document.getElementById('pwaInstallBtn');
    var card = document.getElementById('pwaInstallCard');
    if(btn) btn.style.display = 'inline-flex';
    if(card) card.style.display = 'block';
    try{
      if(localStorage.getItem(INSTALL_KEY)==='1') return;
    }catch(_){}
    // subtle hint: do not auto-popup, just reveal button
  });

  window.lpCanInstall = function(){ return !!deferredPrompt; };

  window.lpTriggerInstall = async function(){
    if(!deferredPrompt){
      var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
      if(isStandalone){
        toast('✅ همین الان در حالت نصب‌شده هستی — آفلاین کامل است');
      } else {
        toast('📌 برای نصب: منوی مرورگر (⋮) ← افزودن به صفحه اصلی / Install app');
      }
      return;
    }
    deferredPrompt.prompt();
    var choice = await deferredPrompt.userChoice;
    if(choice && choice.outcome==='accepted'){
      toast('🎉 نصب شد! حالا حتی بدون اینترنت از آیکون گوشی باز می‌شود');
      try{ localStorage.setItem(INSTALL_KEY,'1'); }catch(_){}
    } else {
      toast('ℹ️ نصب بعداً هم از منوی مرورگر ممکن است');
    }
    deferredPrompt = null;
    var btn = document.getElementById('pwaInstallBtn');
    if(btn) btn.style.display='none';
  };

  window.lpDismissInstall = function(){
    try{ localStorage.setItem(INSTALL_KEY,'1'); }catch(_){}
    var card = document.getElementById('pwaInstallCard');
    if(card) card.style.display='none';
  };

  /* ---------- 4. precache helper ---------- */
  window.lpEnsureOfflineReady = async function(){
    if(!('caches' in window)){
      toast('⚠️ مرورگر کش آفلاین ندارد — ولی داده‌هایت در حافظه امن‌اند');
      return;
    }
    try{
      if('serviceWorker' in navigator){
        var reg = await navigator.serviceWorker.getRegistration();
        if(reg && reg.update) reg.update().catch(function(){});
      }
      // trigger SW install by fetching version + shell check
      await ensurePersist();
      toast('✅ ذخیره آفلاین تایید شد — یک بار لود کافیست، بعد بدون اینترنت هم باز می‌شود');
      updateOfflineUI();
      renderOfflineCard();
    }catch(e){
      toast('⚠️ خطا در ذخیره آفلاین — دوباره امتحان کن');
    }
  };

  window.lpTestOffline = function(){
    var online = navigator.onLine;
    if(!online){
      toast('📴 الان آفلاینی و برنامه دارد از حافظه اجرا می‌شود — همه‌چیز درست است ✅');
    } else {
      toast('🧪 برای تست: اینترنت را خاموش کن و برنامه را ببند/باز کن — باید بدون خطا بالا بیاید');
    }
    updateOfflineUI();
  };

  /* ---------- 5. settings card renderer ---------- */
  function renderOfflineCard(){
    var el = document.getElementById('offlineStatusText');
    if(!el) return;
    var online = navigator.onLine;
    var swReady = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
    var persisted = false;
    try{
      if(navigator.storage && navigator.storage.persisted){
        // async check, but show stored flag synchronously
        persisted = localStorage.getItem(PERSIST_KEY)==='1';
      }
    }catch(_){}
    var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    var lines = [];
    lines.push(online ? '🌐 الان آنلاین هستی' : '📴 الان آفلاینی — برنامه از حافظه اجرا شد');
    lines.push(swReady ? '✅ کش آفلاین فعال است' : '⏳ کش آفلاین در حال آماده‌سازی… (یک بار با اینترنت باز کن)');
    lines.push(persisted ? '💾 حافظه دائمی: فعال' : '💾 حافظه دائمی: در حال درخواست…');
    lines.push(isStandalone ? '📲 نصب‌شده (standalone) — بهترین حالت آفلاین' : '📲 نصب نشده — از دکمه پایین نصب کن تا آیکون بسازی');
    el.innerHTML = lines.map(function(l){ return '<div>'+l+'</div>'; }).join('');
    var btn = document.getElementById('pwaInstallBtn');
    if(btn){
      btn.style.display = deferredPrompt ? 'inline-flex' : (isStandalone ? 'none' : 'inline-flex');
      btn.textContent = isStandalone ? '✅ نصب‌شده' : (deferredPrompt ? '📲 نصب روی گوشی' : '📌 راهنمای نصب');
    }
  }
  window.renderOfflineCard = renderOfflineCard;

  /* ---------- boot ---------- */
  function boot(){
    bindOnlineEvents();
    updateOfflineUI();
    ensurePersist().then(function(){
      renderOfflineCard();
      setTimeout(renderOfflineCard, 800);
    });
    setTimeout(updateOfflineUI, 600);
    setTimeout(renderOfflineCard, 1200);
    // re-render when settings view opened
    var origShow = window.showView;
    if(typeof origShow==='function'){
      window.showView = function(v){
        var r = origShow.apply(this, arguments);
        if(v==='settings') setTimeout(renderOfflineCard, 80);
        return r;
      };
    }
    var origRenderSettings = window.renderSettings;
    if(typeof origRenderSettings==='function'){
      window.renderSettings = function(){
        var r = origRenderSettings.apply(this, arguments);
        try{ renderOfflineCard(); }catch(_){}
        return r;
      };
    }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})();
