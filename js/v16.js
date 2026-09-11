/* ============================================================
   Life Planner — v16 UI layer.

   Three additive layers, none of which replaces a renderer, an
   element ID, a class or a button handler from core.js:

     1. SKELETON LOADING — list containers show shimmering
        placeholder rows while the real content is being built,
        instead of a blank card or a full-screen spinner.
     2. SCROLL REVEAL — rows you scroll down to slide up into
        place. Rows that are already on screen never animate, so
        re-rendering a list after a tap cannot flicker.
     3. LOW-END PHONE MODE — on devices that report few CPU cores
        or little memory, decorative gradients/shadows on repeated
        rows are flattened. Same layout, same colors, less paint.

   Load order: last (after core.js / pomodoro.js / lang.js).
   ============================================================ */
(function(){
  'use strict';

  function prefersReducedMotion(){
    try{ return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
    catch(_){ return false; }
  }

  /* ---------- 1. skeleton placeholders ---------- */

  /* Which container gets placeholders for which view. */
  var SKEL = {
    allTasks:   { kind:'row',   n:5 },
    habitList:  { kind:'habit', n:3 },
    goalList:   { kind:'goal',  n:3 },
    noteGrid:   { kind:'note',  n:3 }
  };
  var VIEW_LISTS = {
    tasks:  ['allTasks'],
    habits: ['habitList'],
    goals:  ['goalList'],
    notes:  ['noteGrid']
  };

  function skelRow(kind, i){
    var w = (i % 2) ? ' w80' : '';
    if(kind === 'goal')  return '<div class="lp-sk lp-sk-goal"><i class="lp-sk-line w60"></i><i class="lp-sk-bar"></i></div>';
    if(kind === 'note')  return '<div class="lp-sk lp-sk-note"><i class="lp-sk-line w80"></i><i class="lp-sk-line"></i><i class="lp-sk-line w40"></i></div>';
    if(kind === 'habit') return '<div class="lp-sk lp-sk-habit"><i class="lp-sk-dot"></i><i class="lp-sk-line w60"></i><i class="lp-sk-tag"></i></div>';
    return '<div class="lp-sk lp-sk-row"><i class="lp-sk-dot"></i><i class="lp-sk-line' + w + '"></i></div>';
  }
  function skelHtml(kind, n){
    var out = '';
    for(var i = 0; i < n; i++) out += skelRow(kind, i);
    return out;
  }

  function showSkeletons(view){
    var ids = VIEW_LISTS[view];
    if(!ids) return;
    for(var i = 0; i < ids.length; i++){
      var el = document.getElementById(ids[i]);
      if(!el || el.getAttribute('data-lp-sk') === '1') continue;
      var cfg = SKEL[ids[i]];
      el.setAttribute('data-lp-sk', '1');
      el.innerHTML = skelHtml(cfg.kind, cfg.n);
      /* Safety net: whatever happens, a container must never be stuck
         showing placeholders. The real renderer overwrites innerHTML
         long before this fires; this only clears the guard flag. */
      (function(node){
        setTimeout(function(){ node.setAttribute('data-lp-sk', '0'); }, 1500);
      })(el);
    }
  }

  /* showView() is a plain global function, so reassigning window.showView
     also redirects every internal call (same pattern enhancements.js uses
     for useTheme). The original is always invoked, untouched. */
  var origShowView = window.showView;
  if(typeof origShowView === 'function'){
    window.showView = function(v){
      try{ showSkeletons(v); }catch(_){ /* never block navigation */ }
      return origShowView.apply(this, arguments);
    };
  }

  /* ---------- 2. scroll reveal ---------- */

  var REVEAL_SEL = '.task-row, .habit-card, .goal-card, .note-card';
  var LISTS = ['allTasks', 'todayTasks', 'habitList', 'goalList', 'noteGrid'];
  var io = null;

  function revealNow(el){
    el.classList.add('lp-noanim', 'lp-in');
    if(io) io.unobserve(el);
  }

  function initObserver(){
    if(prefersReducedMotion()) return null;
    if(!('IntersectionObserver' in window)) return null;
    return new IntersectionObserver(function(entries){
      for(var i = 0; i < entries.length; i++){
        var e = entries[i];
        if(!e.isIntersecting) continue;
        io.unobserve(e.target);
        /* Already fully on screen? Show it instantly. This is what stops a
           re-render (every tap rebuilds the list) from re-animating rows the
           user is already looking at. */
        var vh = window.innerHeight || document.documentElement.clientHeight || 0;
        var r = e.boundingClientRect;
        if(r && r.top >= -2 && r.bottom <= vh + 2) e.target.classList.add('lp-noanim');
        e.target.classList.add('lp-in');
      }
    }, { root: null, rootMargin: '0px 0px -5% 0px', threshold: 0 });
  }
  io = initObserver();

  function markRevealables(){
    if(!io) return;
    for(var i = 0; i < LISTS.length; i++){
      var list = document.getElementById(LISTS[i]);
      if(!list) continue;
      var view = list.closest ? list.closest('.view') : null;
      if(view && !view.classList.contains('active')) continue; // cheap: skip hidden views
      var nodes = list.querySelectorAll(REVEAL_SEL);
      for(var j = 0; j < nodes.length; j++){
        var n = nodes[j];
        if(n.classList.contains('lp-in') || n.classList.contains('lp-pending')) continue;
        n.classList.add('lp-pending');
        io.observe(n);
      }
    }
  }

  if(io && 'MutationObserver' in window){
    var queued = false;
    var run = function(){ queued = false; try{ markRevealables(); }catch(_){ } };
    var mo = new MutationObserver(function(){
      if(queued) return;
      queued = true;
      if(window.requestAnimationFrame) window.requestAnimationFrame(run);
      else setTimeout(run, 32);
    });
    var scope = document.querySelector('.main') || document.body;
    if(scope) mo.observe(scope, { childList: true, subtree: true });
    /* Lists that were already painted before this file loaded. */
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', markRevealables);
    else markRevealables();
  }

  /* Nothing may ever stay invisible: force-reveal anything still pending. */
  function revealAllPending(){
    var p = document.querySelectorAll('.lp-pending');
    for(var i = 0; i < p.length; i++) revealNow(p[i]);
  }
  setTimeout(revealAllPending, 2000);
  document.addEventListener('visibilitychange', function(){
    if(!document.hidden) setTimeout(revealAllPending, 350);
  });
  window.addEventListener('resize', function(){ setTimeout(revealAllPending, 250); }, { passive:true });

  /* ---------- 3. low-end phone mode ---------- */

  /* Purely decorative paint is dropped on small devices. Layout, colors,
     sizes and every handler stay exactly the same. */
  function isLowEnd(){
    var cores = navigator.hardwareConcurrency || 0;
    var mem = navigator.deviceMemory || 0;          // Chrome only; 0 = unknown
    if(cores && cores <= 4) return true;
    if(mem && mem <= 3) return true;
    return false;
  }
  function applyPerfTier(){
    try{
      if(isLowEnd()) document.documentElement.classList.add('lp-lite');
    }catch(_){ }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyPerfTier);
  else applyPerfTier();

  window.lpV16 = { showSkeletons: showSkeletons, revealAllPending: revealAllPending, isLowEnd: isLowEnd };
})();
