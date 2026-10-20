/* ============================================================
   Life Planner v21 — «کیبورد آرام» / calm keyboard

   Two mobile paper cuts, one small dependency-free module:

   1) «دیگر کیبورد خودش باز نمی‌شود»
      Tapping «تسک جدید» / «یادداشت جدید» / «رویداد جدید» / Inbox /
      زیرتسک used to open the sheet AND pop the on-screen keyboard at the
      same moment — before the user had decided what to write. On a phone
      the sheet was half hidden behind the keyboard and the first tap hit
      the keyboard instead of the form. Every automatic focus() call in
      core.js was removed in this version, and the guard below keeps any
      future code (or a third-party snippet) from bringing the habit back:
      a text field may only take focus when the tap that led to it really
      landed on that field (or on its <label>).

   2) «کیبورد خالی، بدون نوار کروم»
      Chrome's password-manager / autofill / address strip above the
      keyboard appears when the browser believes it is looking at a form
      with credentials. Life Planner has no forms and no logins, so every
      text field is marked autocomplete="off" (plus autocorrect/spellcheck
      off and no aria-autocomplete hints) and any <form> wrapper would be
      neutralised as well. Result: a plain, empty keyboard.

   Progressive by design: index.html already ships the attributes, this
   file also covers content that is built later (subtask rows, extra
   deadlines, Pomodoro settings…). On a desktop the focus guard is a no-op
   in practice — nothing there calls focus() by itself any more.
   ============================================================ */
(function () {
  'use strict';

  var TEXT_TYPES = {
    text: 1, search: 1, email: 1, number: 1, tel: 1, url: 1, password: 1,
    date: 1, time: 1, 'datetime-local': 1, month: 1, week: 1
  };

  /* A text field — the kind Chrome wants to autofill. Readonly inputs (the
     Persian date pickers, the copy helper) are included on purpose: they are
     still text boxes to the browser, they just never open a keyboard. */
  function isTextField(el) {
    if (!el || el.nodeType !== 1) return false;
    var tag = el.tagName;
    if (tag === 'TEXTAREA') return true;
    if (el.isContentEditable) return true;
    if (tag !== 'INPUT') return false;
    var type = (el.getAttribute('type') || 'text').toLowerCase();
    return !!TEXT_TYPES[type];
  }

  /* A field that can actually summon the on-screen keyboard. */
  function summonsKeyboard(el) {
    return isTextField(el) && !el.disabled && !el.readOnly;
  }

  /* ---------- 1. one plain, empty keyboard ---------- */
  function hardenForm(form) {
    if (!form || form.nodeType !== 1) return;
    try {
      form.setAttribute('autocomplete', 'off');
      form.setAttribute('novalidate', '');
      form.setAttribute('data-lp-kb', 'form');
    } catch (_) { }
  }

  function harden(el) {
    if (!el || el.nodeType !== 1) return;
    if (el.tagName === 'FORM') { hardenForm(el); return; }
    if (!isTextField(el)) return;
    if (el.getAttribute('data-lp-kb') === '1') return;
    el.setAttribute('data-lp-kb', '1');
    /* No autocomplete hints → Chrome treats it as a plain text box: no
       password row, no saved address/phone suggestion, no card scanning. */
    el.setAttribute('autocomplete', 'off');
    el.setAttribute('autocorrect', 'off');
    el.setAttribute('autocapitalize', 'sentences');
    el.setAttribute('spellcheck', 'false');
    /* aria-autocomplete="both|list" is read by Chrome as "autofill me". */
    var aria = (el.getAttribute('aria-autocomplete') || '').toLowerCase();
    if (aria === 'both' || aria === 'list' || aria === 'inline') el.removeAttribute('aria-autocomplete');
    /* A real <form> is what turns on Chrome's form assistant. The app is
       form-free; if a field ever lands inside one, keep it plain too. */
    hardenForm(el.form);
  }

  function stripAutofocus(el) {
    if (el && el.nodeType === 1 && el.removeAttribute && el.hasAttribute && el.hasAttribute('autofocus')) {
      el.removeAttribute('autofocus');
    }
  }

  var SCAN = 'input, textarea, form, [autofocus]';

  function hardenTree(root) {
    if (!root || (root.nodeType !== 1 && root.nodeType !== 9)) return;
    if (root.nodeType === 1) { stripAutofocus(root); harden(root); }
    if (!root.querySelectorAll) return;
    var list = root.querySelectorAll(SCAN);
    for (var i = 0; i < list.length; i++) {
      stripAutofocus(list[i]);
      harden(list[i]);
    }
  }

  var observer = null;
  function watch() {
    if (observer || !document.body || typeof MutationObserver !== 'function') return;
    observer = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'attributes') { hardenTree(m.target); continue; }
        for (var j = 0; j < m.addedNodes.length; j++) hardenTree(m.addedNodes[j]);
      }
    });
    observer.observe(document.body, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ['autofocus']
    });
  }

  /* ---------- 2. never open the keyboard by itself ----------
     A focus() call is allowed only when it follows a real tap on the very
     field it targets (or on that field's <label>). Anything else — a tap
     on «➕ تسک جدید» that makes the sheet open, a render, a timer — is
     swallowed, so the sheet always appears with the keyboard closed. */
  var lastTap = { el: null, at: 0 };
  function noteTap(e) {
    var t = e.target;
    if (t && t.nodeType === 1) lastTap = { el: t, at: Date.now() };
  }
  ['pointerdown', 'touchstart', 'mousedown'].forEach(function (ev) {
    document.addEventListener(ev, noteTap, true);
  });

  function lpKbFocusAllowed(el) {
    if (!el) return false;
    /* Opt-in escape hatch for anything that genuinely must focus a field. */
    if (el.getAttribute && el.getAttribute('data-lp-allow-focus') === '1') return true;
    if (document.activeElement === el) return true;
    var tap = lastTap;
    if (!tap.el || !tap.at || Date.now() - tap.at > 1500) return false;
    if (tap.el === el || (el.contains && el.contains(tap.el))) return true;
    if (tap.el.tagName === 'LABEL') {
      try { if (tap.el.control === el) return true; } catch (_) { }
      var id = tap.el.getAttribute('for');
      if (id && document.getElementById(id) === el) return true;
    }
    return false;
  }

  var nativeFocus = window.HTMLElement && HTMLElement.prototype && HTMLElement.prototype.focus;

  if (typeof nativeFocus === 'function') {
    HTMLElement.prototype.focus = function () {
      try {
        if (summonsKeyboard(this) && !lpKbFocusAllowed(this)) {
          /* The user has not tapped this field yet → keep the keyboard down. */
          return;
        }
      } catch (_) { }
      return nativeFocus.apply(this, arguments);
    };
  }

  /* Public, tiny helpers — other modules may use them instead of guessing. */
  window.lpKbFocusAllowed = lpKbFocusAllowed;
  window.lpKbHarden = hardenTree;
  window.lpFocusField = function (el) {
    if (!el || el.nodeType !== 1) return;
    el.setAttribute('data-lp-allow-focus', '1');
    try { el.focus(); } catch (_) { }
  };

  function boot() {
    hardenTree(document.documentElement);
    watch();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
