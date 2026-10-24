/* ============================================================
   Life Planner — v22 layer: «💧 لیکویید گلس» + Aurora celebration.

   Additive, like js/v162.js: nothing here replaces a renderer, an
   element ID, a class or a button handler.

     1. LIQUID GLASS — Settings -> «💧 لیکویید گلس» is one switch.
        Turning it on adds `html.lp-liquid`, and css/v22.css turns
        every card, window and the bottom bar into clean liquid
        glass (translucent tint + specular edge + real blur).
        The choice is stored in 'lifePlannerLiquidGlass_v1',
        applied before the first paint by the inline script in
        index.html, travels with the backup (js/core.js), and
        always loses to Performance Mode: css only paints the blur
        under :not(.lp-perf).

     2. AURORA CELEBRATION — buyTheme('auroraPrism') in core.js
        calls window.lpCelebrateAurora() once. A short, quiet burst
        of prismatic sparks; skipped entirely in Performance Mode
        or when the phone asks for reduced motion.

   Load order: last (after core.js / … / v213.js).
   ============================================================ */
(function(){
  'use strict';

  /* ---------- 1. liquid glass ---------- */

  var LIQUID_KEY = 'lifePlannerLiquidGlass_v1';

  function getLiquidGlass(){
    try{ return localStorage.getItem(LIQUID_KEY) === '1'; }catch(_){ return false; }
  }

  function applyLiquidGlass(){
    var on = getLiquidGlass();
    try{ document.documentElement.classList.toggle('lp-liquid', on); }catch(_){ }
    return on;
  }

  function syncLiquidUI(){
    var on = getLiquidGlass();
    var box = document.getElementById('settingsLiquidGlass');
    if(box) box.checked = on;
    var st = document.getElementById('settingsLiquidState');
    if(st) st.textContent = on ? '✅ فعال' : '⛔ غیرفعال';
  }

  function setLiquidGlass(on, silent){
    try{ localStorage.setItem(LIQUID_KEY, on ? '1' : '0'); }catch(_){ }
    applyLiquidGlass();
    syncLiquidUI();
    if(!silent && typeof toast === 'function'){
      toast(on ? '💧 لیکویید گلس فعال شد — رابط کاربری شیشه‌ای شد' : '💧 لیکویید گلس خاموش شد');
    }
    return on;
  }

  window.setSettingsLiquidGlass = function(v){ setLiquidGlass(!!v); };
  window.lpGetLiquidGlass = getLiquidGlass;
  window.lpSetLiquidGlass = function(v){ setLiquidGlass(!!v); };

  /* Settings renders the other switches, so this one is synced from the
     same two places (renderSettings / opening the settings view) instead
     of adding a second render pass — the v162 pattern. */
  var origRenderSettings = window.renderSettings;
  if(typeof origRenderSettings === 'function'){
    window.renderSettings = function(){
      var r = origRenderSettings.apply(this, arguments);
      try{ syncLiquidUI(); }catch(_){ }
      return r;
    };
  }
  var origShowView = window.showView;
  if(typeof origShowView === 'function'){
    window.showView = function(v){
      var r = origShowView.apply(this, arguments);
      if(v === 'settings'){ try{ syncLiquidUI(); }catch(_){ } }
      return r;
    };
  }

  applyLiquidGlass();

  /* ---------- 2. aurora unlock celebration ---------- */

  function prefersReducedMotion(){
    try{ return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
    catch(_){ return false; }
  }

  window.lpCelebrateAurora = function(){
    try{
      if(document.documentElement.classList.contains('lp-perf')) return;
      if(prefersReducedMotion()) return;
      var layer = document.createElement('div');
      layer.className = 'lp-aurora-burst';
      layer.setAttribute('aria-hidden', 'true');
      var N = 26;
      for(var i = 0; i < N; i++){
        var s = document.createElement('i');
        var ang = (Math.PI * 2 * i) / N + Math.random() * 0.5;
        var dist = 90 + Math.random() * 190;
        s.style.setProperty('--x', Math.round(Math.cos(ang) * dist) + 'px');
        s.style.setProperty('--y', Math.round(Math.sin(ang) * dist * 0.72 - 24) + 'px');
        s.style.setProperty('--h', String(150 + Math.floor(Math.random() * 170)));
        s.style.animationDelay = (Math.random() * 0.22).toFixed(2) + 's';
        var sz = 5 + Math.random() * 6;
        s.style.width = sz + 'px'; s.style.height = sz + 'px';
        layer.appendChild(s);
      }
      document.body.appendChild(layer);
      setTimeout(function(){ try{ layer.remove(); }catch(_){ } }, 2600);
    }catch(_){ }
  };

  /* ---------- boot ---------- */
  function boot(){
    applyLiquidGlass();
    syncLiquidUI();
    setTimeout(function(){ applyLiquidGlass(); syncLiquidUI(); }, 300);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.lpV22 = {
    getLiquidGlass: getLiquidGlass,
    setLiquidGlass: setLiquidGlass,
    applyLiquidGlass: applyLiquidGlass,
    syncLiquidUI: syncLiquidUI
  };
})();
