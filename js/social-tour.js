/* ============================================================================
   Life Planner Social v25.0 — Interactive Guided Tour (js/social-tour.js)
   ----------------------------------------------------------------------------
   «تور راهنمای بخش پومودوروی اجتماعی»
   26-step interactive spotlight tour of Life Planner Social.
   
   Features:
   - Spotlight highlight + dim backdrop per step
   - Compact visual popover card (title + description + visual icon)
   - Next / Prev / Pause-Resume / Skip
   - Progress bar + step counter
   - Persisted state (localStorage): completed, last step, paused
   - Replay triggers in #view-settings and #pomoPane-social
   ============================================================================ */
(function () {
  'use strict';

  const TOUR_KEY = 'lifePlannerSocialTour_v25';
  const PAUSED_KEY = 'lifePlannerSocialTourPaused_v25';
  const COMPLETED_KEY = 'lifePlannerSocialTourCompleted_v25';

  /* ---------- 26 tour steps ---------- */
  const STEPS = [
    { id: 'intro', title: 'معرفی بخش پومودوروی اجتماعی', icon: '🎓', desc: 'با بخش پومودوروی اجتماعی آشنایی داریم — شبکه‌ی مطالعه و فعالیت دوستانه که درون Life Planner زندگی می‌کند، و تایمر شخصی کاملاً آفلاین باقی می‌ماند.' },
    { id: 'signup', title: 'ساخت حساب کاربری', icon: '📝', desc: 'با ایمیل و رمز عبور ثبت‌نام کنید. نیازی به انتخاب نام کاربری نیست — یک شناسه عددی مخصوص به خودتان دریافت می‌کنید.' },
    { id: 'usercode', title: 'شناسه عددی اختصاصی و جست‌وجوی دوستان', icon: '#️⃣', desc: 'هر کاربر یک شناسه عددی ثابتی دارد (۱، ۲، ۳، ...). این شناسه تغییرناپذیر است و برای پیدا کردن دوستان و ارسال درخواست دوستی به آن نیاز است؛ اطلاعات خصوصی فاش نمی‌شود.' },
    { id: 'friendrequest', title: 'درخواست دوستی', icon: '📨', desc: 'درخواست ارسال، دریافت، قبول، رد، لغو و حذف دوست — هرکدام در لیست جداگانهanejاده شده‌اند.' },
    { id: 'dashboard', title: 'داشبورد دوستان', icon: '👥', desc: 'دوستان را به عنوان کارت همراه با تصویر، شناسه، انیمیشن وضعیت، درس و elapsed time مشاهده کنید. فیلترها: مطالعه، استراحت، سایر، آفلاین.' },
    { id: 'statuses', title: 'وضعیت‌های فعالیت', icon: '📋', desc: 'هفت وضعیت: در حال مطالعه، استراحت، خواب، بیرون، تفریح، مشغول، آزاد — هرکدام با انیمیشن ظریف کنار نام نمایش داده می‌شود.' },
    { id: 'manualstatus', title: 'تغییر وضعیت دستی', icon: '🖐️', desc: 'از دکمه وضعیت در نوار بالایی یا منوی تنظیمات، وضعیت دستی خود را انتخاب کنید و optionally برای مدت مشخص تنظیم کنید.' },
    { id: 'autostatus', title: 'وضعیت خودکار پومودورو', icon: '🍅', desc: 'با شروع تایمر فوکوس، وضعیت به “در حال مطالعه” تغییر می‌کند و درس/نوع فعالیت/مبحث انتخاب‌شده شما ثبت می‌شود. تایمر شخصی ذخیره نمی‌شود.' },
    { id: 'subjectactivity', title: 'درس و نوع فعالیت', icon: '📚', desc: 'حین مطالعه، درس، نوع فعالیت (تشریحی، تست‌زنی، مرور، حل تمرین، کلاس آموزشی، تکالیف، دلخواه) و مبحث را تعیین کنید.' },
    { id: 'livefeed', title: "فعالیت زنده دوستان", icon: '⚡', desc: "استارت/پایان مطالعه، ثبت تست، دستاورد، اتاق مطالعه و چالش دوستان در تایم‌لاین نمایش داده می‌شوند و با Realtime به‌روزرسانی یابند." },
    { id: 'testresult', title: 'ثبت نتیجه تست', icon: '📝', desc: "درس، تعداد کل، صحیح، غلط، نزده، مبحث و یادداشت را ثبت کنید. درصد خودکار محاسبه می‌شود و به‌اختیار در تایم‌لاین به اشتراک گذاشته می‌شود." },
    { id: 'motiv', title: 'پیام انگیزشی', icon: '💪', desc: 'پیام‌های آماده (ادامه بده!، عالی پیش می‌ری!، خسته نباشی! و ...) یا پیام دلخواه را برای دوستان بفرستید.' },
    { id: 'stickers', title: 'واکنش و استیکر', icon: '❤️', desc: 'استیکرهای 🔥 💪 ❤️ 🏆 👏 🎯 در کنار فعالیت‌های تایم‌لاین — با انیمیشن‌های ظریف و سریع.' },
    { id: 'chat', title: 'چت خصوصی', icon: '💬', desc: 'گفت‌وگوی ۱対۱ با دوستان: پیام انگیزشی، استیکر و چت ساده در محیط مطالعه.' },
    { id: 'feed', title: 'Activity Feed', icon: '📢', desc: 'تایم‌لاین فعالیت‌های دوستان: شروع مطالعه، پایان جلسه، نتیجه تست، دستاورد، چالش و اتاق — همراه با واکنش و کنترل حریم خصوصی.' },
    { id: 'profile', title: 'پروفایل اجتماعی', icon: '👤', desc: 'تصویر، نام، شناسه، وضعیت، ساعت مطالعه، تعداد جلسات، روزهای فعالیت، درس‌ها، دستاوردها و نمودار پیشرفت.' },
    { id: 'notifications', title: 'اعلان‌ها', icon: '🔔', desc: 'درخواست دوستی، پیام، واکنش، دعوت به اتاق، چالش و دستاورد — با غیرفعال‌سازی هر نوع و جلوگیری از ارسال بیش‌ازحد.' },
    { id: 'rooms', title: 'اتاق مطالعه گروهی', icon: '🏠', desc: 'اتاق بساز، دوستان را دعوت کنید. هر عضو تایمر شخصیًّا اجرا می‌کند و حضور در اتاق الزام به مطالعه هم‌زمان نیست.' },
    { id: 'streak', title: 'سیستم استمرار مطالعه', icon: '🔥', desc: 'روزهای متوالی مطالعه (مثلاً ۷ روز)، رکورد شخصی، نماهای هفتگی و نشان‌های مربوطه. استراحت پیشرفت را پاک نمی‌کند.' },
    { id: 'achievements', title: 'دستاوردها', icon: '🏅', desc: 'نشان‌های باز شدن‌ropri: اولین جلسه، ۱۰ پمودورو، ۱۰۰ تست، اولین هفته، اولین اتاق، ۱۰ روز فعال و ...' },
    { id: 'leaderboard', title: 'جدول رتبه‌بندی', icon: '📊', desc: 'رتبه‌بندی هفتگی و ماهانه (ساعت، جلسه، تست، استریک) — اختیاری و قابل خارج شدن از تنظیمات.' },
    { id: 'mood', title: 'حالت مطالعه', icon: '😎', desc: 'قبل از مطالعه حالت را انتخاب کنید: پرانرژی، معمولی، خسته، بدون تمرکز، آماده مطالعه — اختیاری و قابل پنهان نگه داشتن.' },
    { id: 'virtualpresence', title: 'حضور مجازی', icon: '🧑‍🎓', desc: 'ویژه Szenen متحرک بر اساس وضعیت شما (مWrite behind میز، مبل، خواب، بازی، بیرون) در پروفایل نمایش داده می‌شود.' },
    { id: 'recap', title: 'گزارش روزانه', icon: '📅', desc: 'در پایان روز، sessions، زمان مطالعه، دروس، تست‌ها، میانگین درصد و نشان‌های روز در یک کارت جمع‌بندی.' },
    { id: 'challenges', title: 'چالش دوستانه', icon: '🏆', desc: 'چالش ۱対۱ یا گروهی بساز، هدف و مدت تعیین کن، دوستان را دعوت کنید و پیشرفت را در زمان واقعی دنبال کنید.' },
    { id: 'privacy', title: 'تنظیمات حریم خصوصی', icon: '🔒', desc: 'پنهان کردن حالت، دستاوردها، شرکت در رتبه‌بندی و مدیریت اعلان‌ها — همه contrôle در دست شماست.' }
  ];

  /* ---------- state ---------- */
  const state = {
    step: 0,
    completed: false,
    paused: false,
    highlightEl: null,
    backdrop: null,
    popover: null
  };

  /* ---------- persistence ---------- */
  function loadPersistence() {
    try {
      const raw = localStorage.getItem(TOUR_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        state.step = p.step || 0;
        state.completed = p.completed === true;
      }
      state.paused = localStorage.getItem(PAUSED_KEY) === '1';
    } catch (_) {}
  }
  function savePersistence() {
    try {
      localStorage.setItem(TOUR_KEY, JSON.stringify({ step: state.step, completed: state.completed }));
      localStorage.setItem(PAUSED_KEY, state.paused ? '1' : '0');
    } catch (_) {}
  }

  /* ---------- DOM ---------- */
  function ensureTourContainer() {
    if (document.getElementById('lpsTourContainer')) return;
    const container = document.createElement('div');
    container.id = 'lpsTourContainer';
    container.innerHTML = `
      <div id="lpsTourBackdrop" class="lps-tour-backdrop" style="display:none;"></div>
      <div id="lpsTourHighlight" class="lps-tour-highlight" style="display:none; pointer-events:none;"></div>
      <div id="lpsTourPopover" class="lps-tour-popover" style="display:none;">
        <div class="lps-tour-step-head">
          <div class="lps-tour-step-num" id="lpsTourStepNum">۰ / ۲۶</div>
          <div class="lps-tour-title" id="lpsTourTitle"></div>
          <button class="btn ghost sm" type="button" id="lpsTourPauseResume" title="توقف/ادامه">⏸️</button>
          <button class="btn ghost sm" type="button" id="lpsTourSkip" title="رد کردن">رد کردن</button>
        </div>
        <div style="font-size:13px; line-height:1.7; color:var(--txt); margin:8px 0;" id="lpsTourDesc"></div>
        <div style="font-size:12px; color:var(--txt-dim); margin-top:6px;" id="lpsTourVisual"></div>
        <div class="lps-tour-progress-track" style="margin-top:10px;">
          <div class="lps-tour-progress-fill" id="lpsTourProgressFill" style="width:0%;"></div>
        </div>
        <div class="lps-tour-actions">
          <button class="btn ghost sm" type="button" id="lpsTourPrev">⬅️ قبلی</button>
          <button class="btn" type="button" id="lpsTourNext">بعدی ➡️</button>
        </div>
      </div>
    `;
    document.body.appendChild(container);
    wireTourControls();
  }

  function wireTourControls() {
    const next = document.getElementById('lpsTourNext');
    const prev = document.getElementById('lpsTourPrev');
    const skip = document.getElementById('lpsTourSkip');
    const pr = document.getElementById('lpsTourPauseResume');
    if (next) next.onclick = () => nextStep();
    if (prev) prev.onclick = () => prevStep();
    if (skip) skip.onclick = () => endTour(true);
    if (pr) pr.onclick = () => togglePause();
  }

  /* ---------- tour flow ---------- */
  window.lpsTourStart = function () {
    ensureTourContainer();
    loadPersistence();
    if (state.completed && !state.paused) {
      /* already finished — still allow replay from start */
      state.step = 0;
    }
    state.paused = false;
    savePersistence();
    renderTour();
  };

  function renderTour() {
    ensureTourContainer();
    const step = STEPS[state.step];
    if (!step) { endTour(false); return; }

    const backdrop = document.getElementById('lpsTourBackdrop');
    const highlight = document.getElementById('lpsTourHighlight');
    const popover = document.getElementById('lpsTourPopover');
    const stepNum = document.getElementById('lpsTourStepNum');
    const title = document.getElementById('lpsTourTitle');
    const desc = document.getElementById('lpsTourDesc');
    const visual = document.getElementById('lpsTourVisual');
    const fill = document.getElementById('lpsTourProgressFill');
    const pr = document.getElementById('lpsTourPauseResume');

    if (stepNum) stepNum.textContent = `${state.step + 1} / ${STEPS.length}`;
    if (title) title.textContent = step.icon + ' ' + step.title;
    if (desc) desc.textContent = step.desc;
    if (visual) visual.innerHTML = visualHtml(step);
    if (fill) fill.style.width = Math.round(((state.step + 1) / STEPS.length) * 100) + '%';
    if (pr) pr.textContent = state.paused ? '▶️ ادامه' : '⏸️ توقف';

    /* spotlight target */
    const target = document.getElementById(step.id);
    backdrop.style.display = 'flex';
    highlight.style.display = 'block';
    popover.style.display = 'block';
    if (target) {
      const r = target.getBoundingClientRect();
      highlight.style.left = r.left + 'px';
      highlight.style.top = r.top + 'px';
      highlight.style.width = r.width + 'px';
      highlight.style.height = r.height + 'px';
      /* place popover below target or centered */
      placePopover(popover, r);
    } else {
      highlight.style.display = 'none';
      popover.style.left = '50%';
      popover.style.top = '50%';
      popover.style.transform = 'translate(-50%, -50%)';
    }
  }

  function visualHtml(step) {
    const icons = {
      intro: '🏠', signup: '✉️', usercode: '#', findfriend: '🔍', friendrequest: '🤝',
      dashboard: '👥', statuses: '📋', manualstatus: '🖐️', autostatus: '🍅',
      subjectactivity: '📚', livefeed: '⚡', testresult: '📝', motiv: '💪',
      stickers: '❤️', chat: '💬', feed: '📢', profile: '👤', notifications: '🔔',
      rooms: '🏠', streak: '🔥', achievements: '🏅', leaderboard: '📊', mood: '😎',
      virtualpresence: '🧑‍🎓', recap: '📅', challenges: '🏆', privacy: '🔒'
    };
    return `<div style="font-size:30px; text-align:center; margin:6px 0;">${icons[step.id] || '🎯'}</div>`;
  }

  function placePopover(popover, rect) {
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;
    const pW = popover.offsetWidth || 340;
    const pH = popover.offsetHeight || 260;
    let left = rect.left + rect.width / 2 - pW / 2;
    let top = rect.bottom + 14;
    if (left < 12) left = 12;
    if (left + pW > vpW - 12) left = vpW - pW - 12;
    if (top + pH > vpH - 12) top = rect.top - pH - 14;
    if (top < 12) top = 12;
    popover.style.left = left + 'px';
    popover.style.top = top + 'px';
    popover.style.transform = 'none';
  }

  function nextStep() {
    if (state.paused) return;
    if (state.step < STEPS.length - 1) {
      state.step++;
      savePersistence();
      renderTour();
    } else {
      endTour(false);
    }
  }

  function prevStep() {
    if (state.paused) return;
    if (state.step > 0) {
      state.step--;
      savePersistence();
      renderTour();
    }
  }

  function togglePause() {
    state.paused = !state.paused;
    savePersistence();
    renderTour();
  }

  function endTour(skipped) {
    state.completed = !skipped;
    state.paused = false;
    savePersistence();
    document.getElementById('lpsTourBackdrop').style.display = 'none';
    document.getElementById('lpsTourHighlight').style.display = 'none';
    document.getElementById('lpsTourPopover').style.display = 'none';
    /* notify social UI to re-render (to hide/show replay button if desired) */
    if (window.LPSocial && typeof window.LPSocial.notifyUI === 'function') window.LPSocial.notifyUI();
  }

  /* ---------- public replay toggle from settings ---------- */
  window.lpsTourReplayAvailable = function () {
    return !state.completed || true; /* always replayable */
  };

  /* expose for social-ui to call */
  window.lpsStartTour = window.lpsTourStart;

  /* init on load */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadPersistence);
  } else {
    loadPersistence();
  }

})();
