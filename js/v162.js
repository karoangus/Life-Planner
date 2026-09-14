/* ============================================================
   Life Planner — v16.2 UI layer.

   Two additive layers on top of core.js / v16.js. Nothing here
   replaces a renderer, an element ID, a class or a button handler:

     1. PERFORMANCE MODE — Settings -> "⚡ پرفورمنس" is one switch
        for weak phones. Turning it on adds `html.lp-perf`, which
        stops every animation/transition, drops the shimmer and the
        scroll-reveal, and removes the blurred glass layers that
        cost the most GPU time while a list is moving.
     2. SCROLL SMOOTHNESS — typing in the notes search no longer
        rebuilds the grid on every keystroke, the fixed bottom bar
        stops blurring content while a scroll is in flight, and more
        repeated rows skip layout+paint while they are off screen.

   Load order: last (after core.js / pomodoro.js / lang.js / v16.js).
   ============================================================ */
(function(){
  'use strict';

  /* ---------- 1. performance mode ---------- */

  var PERF_KEY = 'lifePlannerPerfMode_v1';

  function prefersReducedMotion(){
    try{ return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
    catch(_){ return false; }
  }

  /* Stored answer wins. Without one the phone's own "reduce motion"
     setting decides, so an accessibility user gets the calm UI by
     default and can still switch it off in Settings. */
  function getPerfMode(){
    try{
      var v = localStorage.getItem(PERF_KEY);
      if(v === '1') return true;
      if(v === '0') return false;
    }catch(_){ }
    return prefersReducedMotion();
  }

  function applyPerfMode(){
    var on = getPerfMode();
    try{ document.documentElement.classList.toggle('lp-perf', on); }catch(_){ }
    return on;
  }

  function syncPerfUI(){
    var on = getPerfMode();
    var box = document.getElementById('settingsPerfMode');
    if(box) box.checked = on;
    var st = document.getElementById('settingsPerfState');
    if(st) st.textContent = on ? '✅ فعال' : '⛔ غیرفعال';
  }

  window.setSettingsPerfMode = function(v){ setPerfMode(!!v); };
  window.lpGetPerfMode = getPerfMode;
  window.lpSetPerfMode = function(v){ setPerfMode(!!v); };

  function setPerfMode(on, silent){
    try{ localStorage.setItem(PERF_KEY, on ? '1' : '0'); }catch(_){ }
    applyPerfMode();
    /* Nothing may stay faded out: force-reveal every row the scroll-reveal
       observer is still holding back (v16.js exposes this on purpose). */
    if(on){
      try{ if(window.lpV16 && window.lpV16.revealAllPending) window.lpV16.revealAllPending(); }catch(_){ }
    }
    syncPerfUI();
    if(!silent && typeof toast === 'function'){
      toast(on ? '⚡ حالت پرفورمنس فعال شد' : '✨ حالت پرفورمنس غیرفعال شد');
    }
    return on;
  }
  window.lpApplyPerfMode = applyPerfMode;

  /* Settings renders the other switches, so the new checkbox is synced from
     the same place instead of adding a second render pass. */
  var origRenderSettings = window.renderSettings;
  if(typeof origRenderSettings === 'function'){
    window.renderSettings = function(){
      var r = origRenderSettings.apply(this, arguments);
      try{ syncPerfUI(); }catch(_){ }
      return r;
    };
  }

  var origShowView = window.showView;
  if(typeof origShowView === 'function'){
    window.showView = function(v){
      var r = origShowView.apply(this, arguments);
      if(v === 'settings'){ try{ syncPerfUI(); }catch(_){ } }
      return r;
    };
  }

  applyPerfMode();

  /* ---------- 2. scroll smoothness ---------- */

  /* The fixed bottom bar blurs whatever scrolls underneath it on every single
     frame — the most expensive effect in the app while scrolling. It is paused
     for the length of the scroll only; the look returns the moment it stops. */
  var SCROLL_IDLE_MS = 140;
  var lastScroll = 0, idleTimer = null, scrollClass = false;

  function onScrollEnd(){
    idleTimer = null;
    try{ document.documentElement.classList.remove('lp-scrolling'); }catch(_){ }
    scrollClass = false;
  }
  function onScroll(){
    lastScroll = Date.now();
    if(!scrollClass){
      scrollClass = true;
      try{ document.documentElement.classList.add('lp-scrolling'); }catch(_){ }
    }
    if(idleTimer) return;
    idleTimer = setInterval(function(){
      if(Date.now() - lastScroll < SCROLL_IDLE_MS) return;
      clearInterval(idleTimer);
      onScrollEnd();
    }, 70);
  }
  window.addEventListener('scroll', onScroll, { passive:true });

  /* Typing in the notes search used to rebuild the whole grid on every
     keystroke. Coalescing to one rebuild a beat after the last key keeps the
     field responsive on a slow phone. Every other caller (opening the view,
     saving, pinning, deleting) still renders immediately, unchanged. */
  var typingUntil = 0;
  document.addEventListener('input', function(e){
    if(e.target && e.target.id === 'noteSearch') typingUntil = Date.now() + 400;
  }, true);

  var origRenderNotes = window.renderNotes;
  var noteTimer = null;
  if(typeof origRenderNotes === 'function'){
    window.renderNotes = function(){
      if(Date.now() < typingUntil && !document.hidden){
        if(noteTimer) clearTimeout(noteTimer);
        noteTimer = setTimeout(function(){ noteTimer = null; origRenderNotes(); }, 90);
        return;
      }
      return origRenderNotes.apply(this, arguments);
    };
  }

  /* ---------- boot ---------- */
  function boot(){
    applyPerfMode();
    syncPerfUI();
    /* Second pass: some browsers report matchMedia late, and a view switch can
       rebuild the settings card after this file has loaded. */
    setTimeout(function(){ applyPerfMode(); syncPerfUI(); }, 300);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.lpV162 = {
    getPerfMode: getPerfMode,
    setPerfMode: setPerfMode,
    applyPerfMode: applyPerfMode,
    syncPerfUI: syncPerfUI
  };
})();
