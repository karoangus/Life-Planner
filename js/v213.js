/* ============================================================
   Life Planner v21.3 / v21.4 / v21.6 — «راهنمای بخش‌ها» / section guides

   The simplification path (v20 → v21.2) took the clutter out of
   the Dashboard, Tasks and Calendar. This file adds the missing
   half: a way to *learn* a section without reading a manual, and
   one more pass of decluttering for a first-time user.

   v21.4 extended the same engine from three sections to six:
   Habits, Goals and Notes now carry a ❓ of their own and one
   first-visit hint each. Nothing else about them changed here —
   the fixes of that release live in core.js.

   v21.6 finishes the job: the Pomodoro, the XP Shop, the skill
   tree and the weekly boss carry the same ❓ and the same single
   hint, so every section of the app is now explainable from
   inside itself. Still the same engine, still one storage key,
   still no new file — only four more entries in the data below
   (and two of the ten action buttons run a small local function
   instead of a global one, because their section has no sheet to
   open: the skill tree leads to the shop, the boss opens its own
   fight — or its editor when a fight is already on).

   Three layers, all additive, none of them touching a renderer,
   an element ID, a class or a handler from core.js:

   1) SECTION GUIDE — the ❓ button of each guided section opens
      one shared modal (#guideModalBg) with a short, plain
      explanation: what the section is for, the four things on
      screen, and one button that jumps straight into the main
      action. All six guides are reachable from each other, so
      nobody has to hunt for the next ❓.

   2) ONE-TIME HINT — the first time a section is opened, a slim
      line (never a blocking popup) says what it is for. It is
      gone forever as soon as the user reads the guide, taps ✕ or
      simply walks to another section. The Calendar is exempt: it
      already carries a permanent one-line intro, so it would be
      the same sentence twice. The Dashboard is exempt while
      «سه قدم اول» is on screen, for the same reason.

   3) «سه قدم اول» — a three-step card on the Dashboard that only
      ever appears on an *empty* account (no task, habit, goal,
      note or event). Write one task → tick it → give it a place
      in the calendar. Each step ticks itself off from live data,
      and when the third one is done the card retires itself with
      a congratulations and never comes back. Existing users never
      see it, so nothing is added to a screen that is already busy.

   Everything is remembered in one localStorage key, deliberately
   kept out of DB/backup: these are interface preferences, exactly
   like the pinned bottom bar (PINNED_NAV_KEY) or performance mode.

   Load order: last (after core.js / pomodoro.js / lang.js / v16.js
   / v162.js / v21.js). Progressive: if this file never loads, the
   app behaves like v21.2 — the ❓ buttons simply do nothing.
   ============================================================ */
(function () {
  'use strict';

  var STORE_KEY = 'lifePlannerGuides_v213';
  var MODAL_ID = 'guideModalBg';

  /* Sections that own a guide. The Calendar has one too, it just never shows
     a first-visit hint (its intro line already sits above the grid). */
  var SECTIONS = ['dashboard', 'tasks', 'calendar', 'habits', 'goals', 'notes',
                  'pomodoro', 'shop', 'skills', 'boss'];
  var HINTED = {
    dashboard: true, tasks: true, habits: true, goals: true, notes: true,
    /* v21.6 */ pomodoro: true, shop: true, skills: true, boss: true
  };

  var TITLES = {
    dashboard: '📖 راهنمای داشبورد',
    tasks: '📖 راهنمای تسک‌ها',
    calendar: '📖 راهنمای تقویم',
    habits: '📖 راهنمای عادت‌ها',
    goals: '📖 راهنمای اهداف',
    notes: '📖 راهنمای یادداشت‌ها',
    /* v21.6 */
    pomodoro: '📖 راهنمای پومودورو',
    shop: '📖 راهنمای XP Shop',
    skills: '📖 راهنمای درخت مهارت',
    boss: '📖 راهنمای باس هفتگی'
  };

  /* One button per guide that lands the user in the section's main action —
     reading a guide is only useful if the next tap is the real thing. */
  var CTA = {
    dashboard: { label: '📥 اینباکس سریع', fn: 'openInboxQuickAdd' },
    tasks: { label: '➕ تسک جدید', fn: 'openTaskModal' },
    calendar: { label: '➕ رویداد جدید', fn: 'openEventModal' },
    /* v21.4 */
    habits: { label: '➕ عادت جدید', fn: 'openHabitModal' },
    goals: { label: '➕ هدف جدید', fn: 'openGoalModal' },
    notes: { label: '➕ یادداشت جدید', fn: 'openNoteModal' },
    /* v21.6 — `fn` is a global name, `local` a function of this file: the two
       sections below have no sheet of their own to open. */
    pomodoro: { label: '▶️ شروع جلسه‌ی فوکوس', fn: 'pomoQuickStart' },
    shop: { label: '🎁 شانس‌های جعبه', fn: 'openMysteryInfo' },
    skills: { label: '🛍️ برو به XP Shop', local: function () {
      if (typeof window.showView === 'function') window.showView('shop');
    } },
    boss: {
      /* A running fight must never be answered with a blank setup sheet — that
         would throw its HP away — so both the label and the action follow the
         data: build a boss, or edit the one that is already on screen. */
      label: function () {
        var db = store();
        return (db && db.boss && db.boss.active) ? '✏️ ویرایش باس' : '⚔️ ساخت باس';
      },
      local: function () {
        var db = store();
        var active = !!(db && db.boss && db.boss.active);
        if (!call(active ? 'startEditBoss' : 'openBossSetup')) say('⚠️ این بخش در دسترس نیست');
      }
    }
  };

  var HINTS = {
    /* v21.6: one line each for the last four sections */
    pomodoro: {
      ic: '🍅',
      txt: 'فقط «▶️ شروع» را بزن؛ دور، استراحت و XP خودش می‌آید.'
    },
    shop: {
      ic: '🛍️',
      txt: 'موجودی XP Shop از نوارِ سطح جداست — خرج کردنش لولت را کم نمی‌کند.'
    },
    skills: {
      ic: '🌳',
      txt: 'هر لول‌آپ ۱ امتیاز مهارت می‌دهد؛ یک تیر بخر و اثرش را همان لحظه ببین.'
    },
    boss: {
      ic: '⚔️',
      txt: 'یک اسم بنویس و چند تسک انتخاب کن؛ هر تیک یک ضربه به باس است.'
    },
    dashboard: {
      ic: '👋',
      txt: 'داشبورد یعنی «امروز چه‌کار داری؟» — یک بار راهنما را بخوان تا همه‌چیز روشن شود.'
    },
    tasks: {
      ic: '✍️',
      txt: 'فقط یک عنوان بنویس و «ذخیره» را بزن؛ بقیه‌ی گزینه‌ها اختیاری‌اند.'
    },
    /* v21.4: one line per section, and only ever once */
    habits: {
      ic: '🔥',
      txt: 'فقط خانه‌ی امروز را تیک بزن؛ استریک و XP خودش می‌آید.'
    },
    goals: {
      ic: '🎯',
      txt: 'یک هدف بساز و هر روز با +۲٪ یا +۱۰٪ جلویش ببر — همین.'
    },
    notes: {
      ic: '📝',
      txt: 'یک عنوان بنویس و ذخیره کن؛ برچسب و رنگ و سنجاق همه اختیاری‌اند.'
    }
  };

  /* ---------- stored state ---------- */

  function blankState() {
    var seen = {};
    SECTIONS.forEach(function (s) { seen[s] = 0; });
    return { seen: seen, qs: '' };
  }

  function readState() {
    var st = blankState();
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return st;
      var p = JSON.parse(raw);
      if (!p || typeof p !== 'object') return st;
      SECTIONS.forEach(function (s) { st.seen[s] = (p.seen && p.seen[s]) ? 1 : 0; });
      st.qs = (p.qs === 'on' || p.qs === 'off') ? p.qs : '';
    } catch (_) { /* unreadable → behave like a first visit */ }
    return st;
  }

  var state = readState();

  function writeState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) { }
  }

  function markSeen(section) {
    if (!state.seen[section]) { state.seen[section] = 1; writeState(); }
  }

  /* ---------- tiny DOM helpers ---------- */

  function byId(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* core.js keeps the data in a top-level `let DB`, which is a global binding
     but not a window property — so it is read by name, never via window.DB. */
  function store() {
    try { return (typeof DB !== 'undefined' && DB) ? DB : null; } catch (_) { return null; }
  }

  function call(name) {
    try {
      if (typeof window[name] === 'function') { window[name](); return true; }
    } catch (_) { }
    return false;
  }

  function say(msg) { try { if (typeof window.toast === 'function') window.toast(msg); } catch (_) { } }

  function isGuided(v) { return SECTIONS.indexOf(v) >= 0; }

  function activeView() {
    var el = document.querySelector('.view.active');
    return el ? String(el.id || '').replace('view-', '') : '';
  }

  /* ---------- 1) the guide modal ---------- */

  var currentSection = 'dashboard';

  function paintSection(section) {
    if (!isGuided(section)) section = 'dashboard';
    currentSection = section;

    var title = byId('guideTitle');
    if (title) title.textContent = TITLES[section];

    var tabs = document.querySelectorAll('#guideTabs [data-g]');
    for (var i = 0; i < tabs.length; i++) {
      var on = tabs[i].getAttribute('data-g') === section;
      tabs[i].classList.toggle('sel', on);
      tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }

    var panels = document.querySelectorAll('#' + MODAL_ID + ' .guide-panel[data-g]');
    for (var j = 0; j < panels.length; j++) {
      panels[j].classList.toggle('sel', panels[j].getAttribute('data-g') === section);
    }

    var cta = byId('guideCta');
    if (cta && CTA[section]) {
      var lbl = CTA[section].label;
      cta.textContent = (typeof lbl === 'function') ? lbl() : lbl;
    }
  }

  function guideOpen() {
    var bg = byId(MODAL_ID);
    return !!(bg && bg.classList.contains('open'));
  }

  function openGuide(section) {
    if (!isGuided(section)) section = activeView();
    if (!isGuided(section)) section = 'dashboard';
    paintSection(section);
    if (typeof window.openModal === 'function') window.openModal(MODAL_ID);
    else { var bg = byId(MODAL_ID); if (bg) bg.classList.add('open'); }
    /* Reading the guide is the same as seeing the hint: never show it again. */
    markSeen(section);
    retireHint(section);
  }

  function closeGuide() {
    if (typeof window.closeModal === 'function') window.closeModal(MODAL_ID);
    else { var bg = byId(MODAL_ID); if (bg) bg.classList.remove('open'); }
  }

  function guidePrimaryAction() {
    var cta = CTA[currentSection];
    closeGuide();
    /* Straight into the action the guide was explaining. */
    if (!cta) { say('⚠️ این بخش در دسترس نیست'); return; }
    if (typeof cta.local === 'function') { try { cta.local(); } catch (_) { } return; }
    if (!call(cta.fn)) say('⚠️ این بخش در دسترس نیست');
  }

  window.openGuide = openGuide;
  window.closeGuide = closeGuide;
  window.guidePrimaryAction = guidePrimaryAction;

  /* ---------- 3) «سه قدم اول» ---------- */

  function isEmptyAccount() {
    var db = store();
    if (!db) return false;
    var keys = ['tasks', 'habits', 'goals', 'notes', 'events'];
    for (var i = 0; i < keys.length; i++) {
      var list = db[keys[i]];
      if (Array.isArray(list) && list.length) return false;
    }
    return true;
  }

  function quickSteps() {
    var db = store() || {};
    var tasks = Array.isArray(db.tasks) ? db.tasks : [];
    var events = Array.isArray(db.events) ? db.events : [];
    var ticked = false;
    for (var i = 0; i < tasks.length; i++) { if (tasks[i] && tasks[i].done) { ticked = true; break; } }
    return [
      {
        name: 'یه کار بنویس',
        done: tasks.length > 0,
        go: 'openTaskModal',
        goLabel: '➕ تسک جدید'
      },
      {
        name: 'تیکش بزن',
        done: ticked,
        go: 'tasks',                 /* special case: navigate, do not open a sheet */
        goLabel: '✅ برو به تسک‌ها'
      },
      {
        name: 'تو تقویم جاش بده',
        done: events.length > 0,
        go: 'openEventModal',
        goLabel: '📅 رویداد جدید'
      }
    ];
  }

  function quickDoneCount(steps) {
    var n = 0;
    for (var i = 0; i < steps.length; i++) { if (steps[i].done) n++; }
    return n;
  }

  /* Should the card be on screen? Sticky on purpose: after step one the
     account is no longer empty, but the card must stay until it is finished. */
  function quickStartWanted() {
    if (state.qs === 'off') return false;
    if (state.qs === 'on') return true;
    if (!isEmptyAccount()) return false;
    state.qs = 'on';
    writeState();
    return true;
  }

  function quickStartHtml() {
    var steps = quickSteps();
    var rows = steps.map(function (s, i) {
      var right = s.done
        ? '<span class="qs-done-tag">✅ انجام شد</span>'
        : '<button class="btn ghost sm" type="button" data-qs-go="' + i + '">' + esc(s.goLabel) + '</button>';
      return '<div class="qs-step' + (s.done ? ' done' : '') + '">' +
        '<span class="qs-num">' + (s.done ? '✓' : (i + 1)) + '</span>' +
        '<span class="qs-name">' + esc(s.name) + '</span>' +
        right +
        '</div>';
    }).join('');

    return '<div class="qs-card">' +
      '<div class="qs-head"><div>' +
      '<div class="qs-title">🚀 سه قدم اول</div>' +
      '<div class="qs-sub">تازه اینجایی؟ فقط همین سه قدم — بقیه‌ی برنامه را کم‌کم یاد می‌گیری.</div>' +
      '</div>' +
      '<button class="qs-x" type="button" data-qs-x="1" aria-label="بستن راهنمای شروع سریع">✕</button>' +
      '</div>' +
      '<div class="qs-steps">' + rows + '</div>' +
      '</div>';
  }

  function quickStartGo(i) {
    var steps = quickSteps();
    var s = steps[i];
    if (!s) return;
    if (s.go === 'tasks') { if (typeof window.showView === 'function') window.showView('tasks'); return; }
    call(s.go);
  }

  function quickStartDismiss() {
    state.qs = 'off';
    /* The card was the dashboard's welcome — after it goes away (finished or
       waved off) the one-time hint must not pop up in its place. */
    markSeen('dashboard');
    writeState();
    refresh(true);
  }

  /* ---------- 2) the one-time hint ---------- */

  function hintHtml(section) {
    var h = HINTS[section];
    if (!h) return '';
    return '<div class="guide-hint">' +
      '<span class="guide-hint-ic">' + h.ic + '</span>' +
      '<span class="guide-hint-txt">' + esc(h.txt) + '</span>' +
      '<button class="btn ghost sm" type="button" data-guide-open="' + section + '">❓ راهنما</button>' +
      '<button class="guide-hint-x" type="button" data-hint-x="' + section + '" aria-label="بستن راهنما">✕</button>' +
      '</div>';
  }

  function clearSlot(section) {
    var slot = byId('guideSlot-' + section);
    if (slot && slot.innerHTML !== '') slot.innerHTML = '';
  }

  /* A hint retires as soon as it has been read or waved off. The dashboard slot
     may instead be holding «سه قدم اول», which is sticky — never wipe that one
     by accident; it retires on its own when its third step is done. */
  function retireHint(section) {
    if (section === 'dashboard' && state.qs === 'on') return;
    clearSlot(section);
    lastSig[section] = '';
  }

  /* ---------- painting ---------- */

  var lastSig = {};

  function paintSlot(section, force) {
    var slot = byId('guideSlot-' + section);
    if (!slot) return;
    var html = '';
    if (section === 'dashboard' && quickStartWanted()) {
      /* Finished? Celebrate once and retire the card for good. */
      var steps = quickSteps();
      if (quickDoneCount(steps) === steps.length) {
        state.qs = 'off';
        markSeen('dashboard');
        writeState();
        /* Let the action's own toast («✅ تسک انجام شد») be read first. */
        setTimeout(function () { say('🎉 سه قدم اول تمام شد — حالا برنامه مال توست!'); }, 1200);
      } else {
        html = quickStartHtml();
      }
    } else if (HINTED[section] && !state.seen[section]) {
      html = hintHtml(section);
    }
    if (!force && lastSig[section] === html) return;   /* nothing changed → no repaint */
    lastSig[section] = html;
    if (slot.innerHTML !== html) slot.innerHTML = html;
  }

  /* Does this section want something in its slot right now? Cheap predicate,
     used only to skip repaints of hidden sections that are empty anyway. */
  function wantedNow(section) {
    if (section === 'dashboard' && state.qs !== 'off' && (state.qs === 'on' || isEmptyAccount())) return true;
    return !!(HINTED[section] && !state.seen[section]);
  }

  function refresh(force) {
    try {
      var active = activeView();
      SECTIONS.forEach(function (s) {
        var slot = byId('guideSlot-' + s);
        if (!slot) return;
        /* Cheap: a hidden section with an empty slot is skipped — unless it is
           one that wants a card back («سه قدم اول» is sticky and must survive
           a trip to another section). */
        if (!force && s !== active && slot.innerHTML === '' && !wantedNow(s)) return;
        paintSlot(s, force);
      });
    } catch (_) { /* a guide must never be able to break the app */ }
  }

  /* ---------- wiring ---------- */

  /* One delegated listener for every control this file paints. */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var go = t.closest('[data-qs-go]');
    if (go) { quickStartGo(Number(go.getAttribute('data-qs-go'))); return; }

    if (t.closest('[data-qs-x]')) { quickStartDismiss(); return; }

    var open = t.closest('[data-guide-open]');
    if (open) { openGuide(open.getAttribute('data-guide-open')); return; }

    var x = t.closest('[data-hint-x]');
    if (x) {
      var section = x.getAttribute('data-hint-x');
      markSeen(section);
      retireHint(section);
      return;
    }
  });

  /* Tabs inside the guide: switch panel, title and the action button.
     core.js's generic .chip-group handler already moves the `sel` class, so
     this only has to follow it. */
  var tabs = byId('guideTabs');
  if (tabs) {
    tabs.addEventListener('click', function (e) {
      var chip = e.target && e.target.closest ? e.target.closest('[data-g]') : null;
      if (chip) paintSection(chip.getAttribute('data-g'));
    });
    /* The tabs are chips, not buttons: Enter/Space has to work on them too. */
    tabs.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
      var chip = e.target && e.target.closest ? e.target.closest('[data-g]') : null;
      if (!chip) return;
      e.preventDefault();
      paintSection(chip.getAttribute('data-g'));
    });
  }

  /* A help popup must be easy to leave: ✕, the backdrop or Escape. */
  var bg = byId(MODAL_ID);
  if (bg) {
    bg.addEventListener('click', function (e) { if (e.target === bg) closeGuide(); });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && guideOpen()) closeGuide();
  });

  /* Navigation: the hint of a section is shown exactly once — leaving the
     section counts as "seen", so it can never come back and nag. */
  var lastView = '';
  function onView(v) {
    if (lastView && lastView !== v && HINTED[lastView] && !state.seen[lastView]) {
      markSeen(lastView);
      retireHint(lastView);
    }
    lastView = isGuided(v) ? v : lastView;
    refresh();
  }

  var origShowView = window.showView;
  if (typeof origShowView === 'function') {
    window.showView = function (v) {
      var out = origShowView.apply(this, arguments);
      try { onView(v); } catch (_) { }
      return out;
    };
  }

  /* Data changes: a step of «سه قدم اول» ticks itself off as soon as the
     task / event behind it exists. save() is a plain global function, so
     reassigning window.save also redirects every internal call (the same
     pattern v16.js uses for showView). */
  var origSave = window.save;
  if (typeof origSave === 'function') {
    window.save = function () {
      var out = origSave.apply(this, arguments);
      try { refresh(); } catch (_) { }
      return out;
    };
  }

  /* Settings → «❓ راهنمای بخش‌ها» → «نمایش دوباره»: everything starts over. */
  window.lpResetGuides = function () {
    state = blankState();
    writeState();
    lastSig = {};
    refresh(true);
    say('↩️ راهنمای خودکار بخش‌ها دوباره فعال شد');
  };

  /* Public, tiny API — tests and other modules use these instead of guessing. */
  window.lpGuide = {
    sections: SECTIONS.slice(),
    state: function () { return JSON.parse(JSON.stringify(state)); },
    open: openGuide,
    close: closeGuide,
    isOpen: guideOpen,
    current: function () { return currentSection; },
    refresh: function () { refresh(true); },
    quickSteps: quickSteps,
    isEmptyAccount: isEmptyAccount,
    reset: window.lpResetGuides
  };

  function boot() {
    lastView = activeView();
    paintSection(currentSection);
    refresh(true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
