/* ============================================================================
   Life Planner Social v25.0 — Core Social Engine (Supabase + Offline-Safe Bridge)
   ----------------------------------------------------------------------------
   Architecture Rules (§2):
   1. Offline Life Planner stays 100% independent — zero network calls on boot
      unless the user opens Life Planner Social or already opted into a session.
   2. Every network/Supabase operation is wrapped in safe try/catch — offline
      or Supabase downtime never crashes Life Planner or stops Pomodoro.
   3. Personal tasks/notes/habits NEVER leave localStorage. Only explicitly
      permitted study metadata (subject/activity/minutes/opt-in test results)
      is shared with Supabase.
   ============================================================================ */
(function () {
  'use strict';

  const SUPABASE_URL = 'https://japskmsxnkxbdlsznsyt.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImphcHNrbXN4bmt4YmRsc3puc3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MzU4NTAsImV4cCI6MjA5NzIxMTg1MH0.GVCSVcZ_69YTcyaAdy5ke90nd53OsmKVXJsaLaNrH2I';

  const LOCAL_PREFS_KEY = 'lifePlannerSocialPrefs_v25';
  const SUPABASE_AUTH_STORAGE_KEY = 'sb-japskmsxnkxbdlsznsyt-auth-token';

  const STATUS_META = {
    studying: { code: 'studying', label: 'در حال مطالعه', emoji: '📖', animClass: 'st-studying', vpScene: 'پشت میز مشغول مطالعه 📚', vpProp: '📖' },
    resting:  { code: 'resting',  label: 'در حال استراحت', emoji: '☕', animClass: 'st-resting',  vpScene: 'نشسته روی مبل با نوشیدنی گرم ☕', vpProp: '☕' },
    sleeping: { code: 'sleeping', label: 'در حال خواب',    emoji: '😴', animClass: 'st-sleeping', vpScene: 'در حال استراحت و خواب عمیق 🌙', vpProp: '🌙' },
    outside:  { code: 'outside',  label: 'بیرون',          emoji: '🚶', animClass: 'st-outside',  vpScene: 'در حال قدم‌زدن بیرون از خانه 🌿', vpProp: '👟' },
    gaming:   { code: 'gaming',   label: 'در حال تفریح',   emoji: '🎮', animClass: 'st-gaming',   vpScene: 'مشغول بازی و شارژ انرژی 🎮', vpProp: '🎮' },
    busy:     { code: 'busy',     label: 'مشغول',          emoji: '⚙️', animClass: 'st-busy',     vpScene: 'درگیر کارهای شخصی ⚙️', vpProp: '⚡' },
    free:     { code: 'free',     label: 'آزاد',           emoji: '🟢', animClass: 'st-free',     vpScene: 'آزاد و آماده شروع فعالیت ✨', vpProp: '✨' }
  };

  const DEFAULT_ACTIVITY_TYPES = [
    'مطالعه تشریحی',
    'تست‌زنی',
    'مرور',
    'حل تمرین',
    'تماشای کلاس آموزشی',
    'انجام تکالیف',
    'فعالیت دلخواه'
  ];

  const STUDY_MOODS = [
    { id: 'energetic',  label: 'پرانرژی',    emoji: '😎' },
    { id: 'normal',     label: 'معمولی',     emoji: '🙂' },
    { id: 'tired',      label: 'خسته',       emoji: '😴' },
    { id: 'unfocused',  label: 'بدون تمرکز', emoji: '😵' },
    { id: 'ready',      label: 'آماده مطالعه', emoji: '🔥' }
  ];

  const AVATAR_PRESETS = {
    fox:     '🦊',
    owl:     '🦉',
    panda:   '🐼',
    cat:     '🐱',
    lion:    '🦁',
    koala:   '🐨',
    unicorn: '🦄',
    eagle:   '🦅',
    dolphin: '🐬',
    rocket:  '🚀',
    star:    '🌟',
    crown:   '👑'
  };

  const VIRTUAL_CHARACTERS = {
    scholar:  { id: 'scholar',  name: 'پژوهشگر متمرکز', emoji: '🧑‍🎓' },
    coder:    { id: 'coder',    name: 'جادوگر تمرکز',   emoji: '🧙‍♂️' },
    astronaut:{ id: 'astronaut',name: 'فضانورد هدفمند', emoji: '🧑‍🚀' },
    artist:   { id: 'artist',   name: 'خلاق آرام',      emoji: '🧑‍🎨' },
    ninja:    { id: 'ninja',    name: 'نینجای مطالعه',  emoji: '🥷' }
  };

  const MOTIVATIONAL_PRESETS = [
    'ادامه بده! 💪',
    'عالی پیش می‌ری!',
    'خسته نباشی!',
    'تو می‌تونی!',
    'یک قدم دیگه تا هدفت!',
    'منتظر نتیجه‌ات هستم!'
  ];

  const STICKERS = ['🔥', '💪', '❤️', '🏆', '👏', '🎯', '🌟', '🚀'];

  const ACHIEVEMENTS_CATALOG = [
    { key: 'first_session',  icon: '🌱', title: 'اولین جلسه مطالعه', desc: 'ثبت اولین پومودوروی اجتماعی' },
    { key: 'ten_sessions',   icon: '🍅', title: '۱۰ جلسه پومودورو',  desc: 'تکمیل ۱۰ جلسه تمرکز' },
    { key: 'fifty_sessions', icon: '💎', title: '۵۰ جلسه تمرکز',     desc: 'تکمیل ۵۰ جلسه تمرکز عمیق' },
    { key: 'tests_100',      icon: '🎯', title: '۱۰۰ تست حل‌شده',    desc: 'ثبت مجموعاً ۱۰۰ تست درسی' },
    { key: 'tests_500',      icon: '🏹', title: '۵۰۰ تست حل‌شده',    desc: 'عبور از مرز ۵۰۰ تست حل‌شده' },
    { key: 'streak_7',       icon: '🔥', title: 'اولین هفته فعالیت', desc: '۷ روز استمرار مطالعه' },
    { key: 'streak_10',      icon: '⚡', title: '۱۰ روز فعالیت',     desc: '۱۰ روز استمرار یا حضور فعال' },
    { key: 'first_room',     icon: '🏠', title: 'اولین اتاق مطالعه', desc: 'ایجاد یا عضویت در اتاق گروهی' },
    { key: 'first_challenge',icon: '🏆', title: 'اولین چالش دوستانه', desc: 'شرکت در یک چالش مطالعه' },
    { key: 'good_friend',    icon: '💌', title: 'همراه انگیزه‌بخش',  desc: 'ارسال پیام انگیزشی به دوستان' }
  ];

  /* ---------- Local Preferences (strictly UI/bridge prefs, never personal tasks) ---------- */
  function loadLocalPrefs() {
    const fallback = {
      autoSyncPomo: true,
      currentSubject: '',
      currentActivityType: 'مطالعه تشریحی',
      currentTopic: '',
      currentMood: '',
      shareMood: false,
      customActivities: [],
      tourCompleted: false,
      tourLastStep: 0
    };
    try {
      const raw = localStorage.getItem(LOCAL_PREFS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return Object.assign(fallback, parsed || {});
      }
    } catch (_) {}
    return fallback;
  }

  function saveLocalPrefs() {
    try {
      localStorage.setItem(LOCAL_PREFS_KEY, JSON.stringify(state.prefs));
    } catch (_) {}
  }

  /* ---------- Reactive State ---------- */
  const state = {
    prefs: loadLocalPrefs(),
    sdkLoaded: false,
    sdkLoading: null,
    client: null,
    initialized: false,
    initializing: null,
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    netError: '',
    authMode: 'login', // 'login' | 'signup'
    authBusy: false,
    user: null,
    profile: null,
    subTab: 'friends', // 'friends' | 'feed' | 'rooms' | 'challenges' | 'leaderboard' | 'recap' | 'profile'
    friendCategory: 'all', // 'all' | 'studying' | 'resting' | 'other' | 'offline'
    friends: [],          // accepted friend profiles
    incomingRequests: [], // pending where addressee = me
    outgoingRequests: [], // pending where requester = me
    blockedUsers: [],
    searchResult: null,
    searchBusy: false,
    activities: [],
    reactionsByActivity: {},
    notifications: [],
    rooms: [],
    roomMembersByRoom: {},
    challenges: [],
    challengePartsByChallenge: {},
    leaderboard: [],
    leaderboardPeriod: 'week', // 'week' | 'month' | 'all'
    leaderboardMetric: 'study_minutes', // 'study_minutes' | 'sessions_count' | 'tests_solved' | 'current_streak'
    recaps: [],
    myTestResults: [],
    myAchievements: [],
    activeChatFriend: null,
    chatMessages: [],
    viewingProfile: null,
    realtimeChannel: null,
    heartbeatTimer: null,
    statusExpiryTimer: null
  };

  const listeners = new Set();
  function notifyUI() {
    listeners.forEach(fn => {
      try { fn(state); } catch (_) {}
    });
  }
  function subscribeUI(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  const fa = (n) => (typeof window.toFaDigits === 'function' ? window.toFaDigits(n) : String(n));
  const safeEsc = (s) => (typeof window.esc === 'function' ? window.esc(String(s ?? '')) : String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])));
  const notifyToast = (msg) => { if (typeof window.toast === 'function') window.toast(msg); };

  function todayLocalISO() {
    if (typeof window.todayISO === 'function') return window.todayISO();
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /* ---------- Lazy Load Supabase SDK Only When Needed (§2 & §25) ---------- */
  function hasSavedAuthSession() {
    try {
      return !!localStorage.getItem(SUPABASE_AUTH_STORAGE_KEY);
    } catch (_) {
      return false;
    }
  }

  function loadSupabaseSDK() {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      state.sdkLoaded = true;
      return Promise.resolve(window.supabase);
    }
    if (state.sdkLoading) return state.sdkLoading;

    state.sdkLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const ver = (typeof LP_APP_VERSION !== 'undefined' ? LP_APP_VERSION : '25.0');
      script.src = `js/vendor/supabase.js?v=${ver}`;
      script.async = true;
      script.onload = () => {
        if (window.supabase && typeof window.supabase.createClient === 'function') {
          state.sdkLoaded = true;
          resolve(window.supabase);
        } else {
          state.sdkLoading = null;
          reject(new Error('SDK بارگذاری نشد'));
        }
      };
      script.onerror = () => {
        state.sdkLoading = null;
        reject(new Error('عدم دسترسی به فایل ارتباطی در حالت آفلاین'));
      };
      document.head.appendChild(script);
    });
    return state.sdkLoading;
  }

  async function ensureClient() {
    if (state.client) return state.client;
    const sdk = await loadSupabaseSDK();
    state.client = sdk.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: SUPABASE_AUTH_STORAGE_KEY
      },
      realtime: {
        params: { eventsPerSecond: 5 }
      }
    });

    state.client.auth.onAuthStateChange((event, session) => {
      const nextUser = session?.user || null;
      const prevId = state.user?.id || null;
      state.user = nextUser;
      if (!nextUser) {
        teardownRealtime();
        state.profile = null;
        state.friends = [];
        state.incomingRequests = [];
        state.outgoingRequests = [];
        state.activities = [];
        state.notifications = [];
        notifyUI();
      } else if (nextUser.id !== prevId) {
        bootstrapAuthenticatedUser().catch(() => {});
      }
    });

    return state.client;
  }

  async function initSocialIfNeeded() {
    state.online = navigator.onLine;
    if (!state.online) {
      state.netError = '📴 اینترنت قطع است؛ بخش‌های آفلاین و تایمر شخصی کاملاً فعال‌اند.';
      notifyUI();
      return false;
    }
    if (state.initialized && state.client) return true;
    if (state.initializing) return state.initializing;

    state.initializing = (async () => {
      try {
        state.netError = '';
        const client = await ensureClient();
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        state.user = data?.session?.user || null;
        state.initialized = true;
        if (state.user) {
          await bootstrapAuthenticatedUser();
        }
        notifyUI();
        return true;
      } catch (err) {
        state.netError = '⚠️ ارتباط با سرور برقرار نشد. برنامه آفلاین بدون مشکل کار می‌کند.';
        notifyUI();
        return false;
      } finally {
        state.initializing = null;
      }
    })();
    return state.initializing;
  }

  /* ---------- Profile & Bootstrap ---------- */
  async function bootstrapAuthenticatedUser() {
    if (!state.client || !state.user || !navigator.onLine) return;
    try {
      await fetchOrCreateMyProfile();
      await Promise.all([
        refreshFriendsAndRequests(),
        refreshFeed(),
        refreshNotifications(),
        refreshMyAchievements(),
        refreshRooms(),
        refreshChallenges()
      ]);
      await setOnlinePresence(true);
      setupRealtime();
      startHeartbeat();
      scheduleStatusExpiryCheck();
      notifyUI();
    } catch (e) {
      state.netError = '⚠️ خطای موقت شبکه هنگام همگام‌سازی اطلاعات اجتماعی';
      notifyUI();
    }
  }

  async function fetchOrCreateMyProfile() {
    const uid = state.user?.id;
    if (!uid || !state.client) return null;
    let { data, error } = await state.client
      .from('lps_profiles')
      .select('*')
      .eq('id', uid)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      const fallbackName = (state.user.user_metadata?.display_name || (state.user.email || 'کاربر').split('@')[0] || 'کاربر').slice(0, 50);
      const ins = await state.client
        .from('lps_profiles')
        .insert({ id: uid, display_name: fallbackName, is_online: true })
        .select('*')
        .single();
      if (ins.error) throw ins.error;
      data = ins.data;
    }
    state.profile = data;
    if (Array.isArray(data.custom_activities) && data.custom_activities.length) {
      state.prefs.customActivities = data.custom_activities;
      saveLocalPrefs();
    }
    return data;
  }

  /* ---------- Authentication (§3 — No Username Needed, Auto Numeric ID) ---------- */
  async function signUpAccount({ email, password, displayName, avatarPreset }) {
    if (!navigator.onLine) {
      notifyToast('📴 برای ساخت حساب اجتماعی به اینترنت نیاز است');
      return { ok: false };
    }
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanName = String(displayName || '').trim().slice(0, 50);
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      notifyToast('⚠️ لطفاً یک ایمیل معتبر وارد کن');
      return { ok: false };
    }
    if (!password || String(password).length < 6) {
      notifyToast('⚠️ رمز عبور باید حداقل ۶ کاراکتر باشد');
      return { ok: false };
    }
    if (!cleanName) {
      notifyToast('⚠️ نام نمایشی خودت را وارد کن');
      return { ok: false };
    }

    state.authBusy = true;
    notifyUI();
    try {
      const client = await ensureClient();
      const { data, error } = await client.auth.signUp({
        email: cleanEmail,
        password: String(password),
        options: {
          data: {
            display_name: cleanName,
            avatar_preset: avatarPreset || 'fox'
          }
        }
      });
      if (error) throw error;
      state.user = data?.user || null;
      if (data?.session) {
        await bootstrapAuthenticatedUser();
        const code = state.profile?.user_code;
        notifyToast(`🎉 خوش آمدی ${cleanName}! شناسه اختصاصی تو: #${fa(code || '')}`);
      } else {
        notifyToast('✅ حساب ساخته شد! لطفاً وارد شو.');
      }
      return { ok: true, profile: state.profile };
    } catch (err) {
      const msg = String(err?.message || '');
      if (/already registered/i.test(msg)) notifyToast('⚠️ این ایمیل قبلاً ثبت شده؛ از تب ورود استفاده کن');
      else notifyToast('⚠️ خطا در ثبت‌نام: ' + (msg.slice(0, 80) || 'بررسی اتصال اینترنت'));
      return { ok: false, error: msg };
    } finally {
      state.authBusy = false;
      notifyUI();
    }
  }

  async function signInAccount({ email, password }) {
    if (!navigator.onLine) {
      notifyToast('📴 اینترنت قطع است؛ ابتدا آنلاین شو');
      return { ok: false };
    }
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail || !password) {
      notifyToast('⚠️ ایمیل و رمز عبور را وارد کن');
      return { ok: false };
    }
    state.authBusy = true;
    notifyUI();
    try {
      const client = await ensureClient();
      const { data, error } = await client.auth.signInWithPassword({
        email: cleanEmail,
        password: String(password)
      });
      if (error) throw error;
      state.user = data?.user || null;
      await bootstrapAuthenticatedUser();
      notifyToast(`👋 خوش برگشتی ${state.profile?.display_name || ''}!`);
      return { ok: true };
    } catch (err) {
      const msg = String(err?.message || '');
      if (/invalid login/i.test(msg)) notifyToast('⚠️ ایمیل یا رمز عبور اشتباه است');
      else notifyToast('⚠️ خطا در ورود به حساب');
      return { ok: false, error: msg };
    } finally {
      state.authBusy = false;
      notifyUI();
    }
  }

  async function signOutAccount() {
    try {
      if (state.client && state.user && navigator.onLine) {
        await setOnlinePresence(false);
        await state.client.auth.signOut();
      }
    } catch (_) {}
    teardownRealtime();
    state.user = null;
    state.profile = null;
    state.friends = [];
    state.incomingRequests = [];
    state.outgoingRequests = [];
    notifyUI();
    notifyToast('👋 از بخش اجتماعی خارج شدی؛ داده‌های آفلاینت دست‌نخورده است');
  }

  /* ---------- Profile Update & Avatar Upload (§3, §11, §21) ---------- */
  async function updateMyProfile(patch) {
    if (!state.client || !state.user || !navigator.onLine) {
      notifyToast('📴 در حالت آفلاین امکان تغییر پروفایل آنلاین نیست');
      return false;
    }
    try {
      const safePatch = {};
      if (typeof patch.display_name === 'string' && patch.display_name.trim()) {
        safePatch.display_name = patch.display_name.trim().slice(0, 50);
      }
      if (typeof patch.bio === 'string') safePatch.bio = patch.bio.trim().slice(0, 200);
      if (typeof patch.avatar_preset === 'string' && AVATAR_PRESETS[patch.avatar_preset]) {
        safePatch.avatar_preset = patch.avatar_preset;
      }
      if (typeof patch.avatar_url === 'string') safePatch.avatar_url = patch.avatar_url.trim().slice(0, 500);
      if (typeof patch.virtual_character === 'string' && VIRTUAL_CHARACTERS[patch.virtual_character]) {
        safePatch.virtual_character = patch.virtual_character;
      }
      if (patch.privacy_settings && typeof patch.privacy_settings === 'object') {
        safePatch.privacy_settings = Object.assign({}, state.profile?.privacy_settings || {}, patch.privacy_settings);
      }
      if (patch.notification_settings && typeof patch.notification_settings === 'object') {
        safePatch.notification_settings = Object.assign({}, state.profile?.notification_settings || {}, patch.notification_settings);
      }
      if (Array.isArray(patch.custom_activities)) {
        safePatch.custom_activities = patch.custom_activities.slice(0, 20);
      }

      const { data, error } = await state.client
        .from('lps_profiles')
        .update(safePatch)
        .eq('id', state.user.id)
        .select('*')
        .single();
      if (error) throw error;
      state.profile = data;
      notifyUI();
      return true;
    } catch (e) {
      notifyToast('⚠️ خطا در ذخیره پروفایل');
      return false;
    }
  }

  async function uploadAvatarFile(file) {
    if (!file || !state.client || !state.user || !navigator.onLine) return null;
    if (file.size > 2 * 1024 * 1024) {
      notifyToast('⚠️ حجم تصویر باید کمتر از ۲ مگابایت باشد');
      return null;
    }
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
      const path = `${state.user.id}/avatar_${Date.now()}.${ext}`;
      const up = await state.client.storage.from('lps-avatars').upload(path, file, {
        cacheControl: '3600',
        upsert: true
      });
      if (up.error) throw up.error;
      const { data } = state.client.storage.from('lps-avatars').getPublicUrl(path);
      if (data?.publicUrl) {
        await updateMyProfile({ avatar_url: data.publicUrl });
        notifyToast('✅ تصویر پروفایل به‌روزرسانی شد');
        return data.publicUrl;
      }
    } catch (e) {
      notifyToast('⚠️ خطا در آپلود تصویر پروفایل');
    }
    return null;
  }

  /* ---------- Friends System & Numeric ID Lookup (§3, §4, §9) ---------- */
  async function searchUserByNumericCode(rawCode) {
    const cleaned = String(rawCode || '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[^0-9]/g, '');
    const code = parseInt(cleaned, 10);
    if (!Number.isFinite(code) || code < 1) {
      notifyToast('⚠️ یک شناسه عددی معتبر (مثلاً ۱ یا ۲) وارد کن');
      return null;
    }
    if (!state.client || !state.user || !navigator.onLine) {
      notifyToast('📴 برای جست‌وجوی کاربر آنلاین شو');
      return null;
    }
    state.searchBusy = true;
    notifyUI();
    try {
      const { data, error } = await state.client.rpc('lps_lookup_user_by_code', { p_code: code });
      if (error) throw error;
      state.searchResult = data || { notFound: true, code };
      notifyUI();
      return state.searchResult;
    } catch (e) {
      notifyToast('⚠️ خطا در جست‌وجوی شناسه عددی');
      return null;
    } finally {
      state.searchBusy = false;
      notifyUI();
    }
  }

  async function refreshFriendsAndRequests() {
    if (!state.client || !state.user || !navigator.onLine) return;
    const uid = state.user.id;
    const { data: rows, error } = await state.client
      .from('lps_friendships')
      .select('*')
      .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`)
      .order('created_at', { ascending: false });
    if (error) return;

    const otherIds = [...new Set((rows || []).map(r => r.requester_id === uid ? r.addressee_id : r.requester_id))];
    let profileMap = {};
    if (otherIds.length) {
      const { data: profs } = await state.client
        .from('lps_profiles')
        .select('*')
        .in('id', otherIds);
      (profs || []).forEach(p => { profileMap[p.id] = p; });
    }

    const friends = [];
    const incoming = [];
    const outgoing = [];

    (rows || []).forEach(r => {
      const otherId = r.requester_id === uid ? r.addressee_id : r.requester_id;
      const prof = profileMap[otherId];
      if (!prof) return;
      if (r.status === 'accepted') {
        friends.push(Object.assign({}, prof, { friendship_id: r.id }));
      } else if (r.status === 'pending') {
        if (r.addressee_id === uid) incoming.push({ friendship_id: r.id, created_at: r.created_at, profile: prof });
        else outgoing.push({ friendship_id: r.id, created_at: r.created_at, profile: prof });
      }
    });

    state.friends = friends;
    state.incomingRequests = incoming;
    state.outgoingRequests = outgoing;

    // Blocked list via secure RPC
    const { data: blocked } = await state.client.rpc('lps_list_blocked_users');
    state.blockedUsers = Array.isArray(blocked) ? blocked : [];
    notifyUI();
  }

  async function sendFriendRequest(targetUserId) {
    if (!state.client || !state.user) return;
    try {
      const { data, error } = await state.client.rpc('lps_send_friend_request', { p_target_id: targetUserId });
      if (error) throw error;
      if (data?.status === 'accepted') notifyToast('🤝 درخواست متقابل بود — الان با هم دوست هستید!');
      else if (data?.status === 'already_friends') notifyToast('✅ قبلاً با هم دوست هستید');
      else if (data?.status === 'already_pending') notifyToast('⏳ درخواست قبلاً ارسال شده است');
      else notifyToast('📨 درخواست دوستی ارسال شد!');
      if (state.searchResult && state.searchResult.id === targetUserId) {
        state.searchResult.relationship = data?.status === 'accepted' ? 'friends' : 'outgoing_pending';
      }
      await refreshFriendsAndRequests();
    } catch (e) {
      notifyToast('⚠️ ' + (e?.message || 'امکان ارسال درخواست نیست'));
    }
  }

  async function respondFriendRequest(friendshipId, accept) {
    if (!state.client || !state.user) return;
    try {
      const reqItem = state.incomingRequests.find(x => x.friendship_id === friendshipId);
      if (accept) {
        const { error } = await state.client
          .from('lps_friendships')
          .update({ status: 'accepted', responded_at: new Date().toISOString() })
          .eq('id', friendshipId);
        if (error) throw error;
        if (reqItem?.profile) {
          await pushNotification(reqItem.profile.id, 'friend_accepted', 'درخواست دوستی پذیرفته شد 🤝',
            `${state.profile?.display_name || 'دوستت'} درخواست دوستی تو را قبول کرد!`);
        }
        notifyToast('🎉 درخواست دوستی پذیرفته شد!');
      } else {
        const { error } = await state.client
          .from('lps_friendships')
          .delete()
          .eq('id', friendshipId);
        if (error) throw error;
        notifyToast('درخواست رد شد');
      }
      await refreshFriendsAndRequests();
      await refreshFeed();
    } catch (e) {
      notifyToast('⚠️ خطا در پاسخ به درخواست');
    }
  }

  async function cancelOrRemoveFriendship(friendshipId, isCancel = false) {
    if (!state.client || !state.user) return;
    try {
      const { error } = await state.client.from('lps_friendships').delete().eq('id', friendshipId);
      if (error) throw error;
      notifyToast(isCancel ? '↩️ درخواست ارسالی لغو شد' : 'حذف از لیست دوستان انجام شد');
      await refreshFriendsAndRequests();
    } catch (_) {
      notifyToast('⚠️ خطا در انجام عملیات');
    }
  }

  async function blockUser(targetUserId) {
    if (!state.client || !state.user) return;
    try {
      const { error } = await state.client.rpc('lps_block_user', { p_target_id: targetUserId });
      if (error) throw error;
      if (state.searchResult?.id === targetUserId) state.searchResult = null;
      notifyToast('🚫 کاربر مسدود شد');
      await refreshFriendsAndRequests();
    } catch (_) {
      notifyToast('⚠️ خطا در مسدودسازی کاربر');
    }
  }

  async function unblockUser(targetUserId) {
    if (!state.client || !state.user) return;
    try {
      await state.client
        .from('lps_blocks')
        .delete()
        .eq('blocker_id', state.user.id)
        .eq('blocked_id', targetUserId);
      notifyToast('✅ رفع مسدودیت انجام شد');
      await refreshFriendsAndRequests();
    } catch (_) {}
  }

  /* ---------- Activity Status & Timed Status (§5) ---------- */
  function scheduleStatusExpiryCheck() {
    if (state.statusExpiryTimer) clearTimeout(state.statusExpiryTimer);
    const until = state.profile?.status_until ? new Date(state.profile.status_until).getTime() : 0;
    if (!until) return;
    const rem = until - Date.now();
    if (rem <= 0) {
      setManualStatus({ statusCode: 'free', durationMinutes: 0, silent: true });
    } else {
      state.statusExpiryTimer = setTimeout(() => {
        setManualStatus({ statusCode: 'free', durationMinutes: 0, silent: true });
      }, Math.min(rem + 500, 2147483000));
    }
  }

  async function setManualStatus({
    statusCode,
    subject = '',
    activityType = '',
    topic = '',
    plannedMinutes = 0,
    durationMinutes = 0,
    customEmoji = '',
    mood = '',
    shareMood = false,
    silent = false,
    publishFeed = false
  }) {
    if (!STATUS_META[statusCode]) statusCode = 'free';
    // Update local bridge prefs even if offline
    if (subject !== undefined) state.prefs.currentSubject = subject;
    if (activityType !== undefined && activityType) state.prefs.currentActivityType = activityType;
    if (topic !== undefined) state.prefs.currentTopic = topic;
    if (mood !== undefined) state.prefs.currentMood = mood;
    state.prefs.shareMood = !!shareMood;
    saveLocalPrefs();

    if (!state.client || !state.user || !navigator.onLine) {
      if (!silent) notifyToast('📌 وضعیت محلی ذخیره شد (در صورت اتصال همگام می‌شود)');
      notifyUI();
      return false;
    }

    try {
      const nowIso = new Date().toISOString();
      const untilIso = durationMinutes > 0
        ? new Date(Date.now() + durationMinutes * 60000).toISOString()
        : null;

      const patch = {
        status_code: statusCode,
        status_custom_emoji: String(customEmoji || '').slice(0, 8),
        status_subject: statusCode === 'studying' ? String(subject || '').slice(0, 80) : '',
        status_activity_type: statusCode === 'studying' ? String(activityType || '').slice(0, 60) : '',
        status_topic: statusCode === 'studying' ? String(topic || '').slice(0, 120) : '',
        status_planned_minutes: statusCode === 'studying' ? Math.max(0, Math.min(1440, Number(plannedMinutes || durationMinutes) || 0)) : 0,
        status_started_at: nowIso,
        status_until: untilIso,
        study_mood: shareMood ? String(mood || '').slice(0, 30) : '',
        share_mood: !!shareMood,
        is_online: true,
        last_seen_at: nowIso
      };

      const { data, error } = await state.client
        .from('lps_profiles')
        .update(patch)
        .eq('id', state.user.id)
        .select('*')
        .single();
      if (error) throw error;
      state.profile = data;
      scheduleStatusExpiryCheck();

      // Sync active Study Together room member status if user is in any active room
      syncMyRoomMemberState(statusCode, subject);

      if (publishFeed && statusCode === 'studying' && state.profile?.privacy_settings?.auto_share_pomo !== false) {
        const subLabel = subject ? `درس «${subject}»` : 'جلسه تمرکز';
        const actLabel = activityType ? ` (${activityType})` : '';
        await postActivity('study_start', `شروع مطالعه ${subLabel}${actLabel}`, topic ? `مبحث: ${topic}` : '', {
          subject, activityType, topic, plannedMinutes: patch.status_planned_minutes, mood: shareMood ? mood : ''
        });
      }

      if (!silent) notifyToast(`${STATUS_META[statusCode].emoji} وضعیت به «${STATUS_META[statusCode].label}» تغییر کرد`);
      notifyUI();
      return true;
    } catch (e) {
      if (!silent) notifyToast('⚠️ خطا در بروزرسانی وضعیت آنلاین');
      return false;
    }
  }

  async function addCustomActivityType(name) {
    const clean = String(name || '').trim().slice(0, 40);
    if (!clean) return false;
    if (!state.prefs.customActivities.includes(clean) && !DEFAULT_ACTIVITY_TYPES.includes(clean)) {
      state.prefs.customActivities.push(clean);
      saveLocalPrefs();
      if (state.client && state.user && navigator.onLine) {
        await updateMyProfile({ custom_activities: state.prefs.customActivities });
      }
      notifyToast(`✅ فعالیت «${clean}» اضافه شد`);
      notifyUI();
      return true;
    }
    return false;
  }

  /* ---------- Pomodoro Core Integration Bridge (§6) ----------
     Hooks cleanly onto existing window.startFocus / startBreak / startInfinite /
     pauseSession / resumeSession / endSession / completePomoSession WITHOUT
     creating any parallel timer and WITHOUT breaking offline Pomodoro! */
  let pomoHooked = false;
  function installPomodoroHooks() {
    if (pomoHooked) return;
    if (typeof window.startFocus !== 'function' || typeof window.completePomoSession !== 'function') return;
    pomoHooked = true;

    const origStartFocus = window.startFocus;
    const origStartBreak = window.startBreak;
    const origStartInfinite = window.startInfinite;
    const origPause = window.pauseSession;
    const origResume = window.resumeSession;
    const origEnd = window.endSession;
    const origComplete = window.completePomoSession;

    window.startFocus = function () {
      const res = origStartFocus.apply(this, arguments);
      try { onLocalPomodoroStarted('focus'); } catch (_) {}
      return res;
    };

    if (typeof origStartInfinite === 'function') {
      window.startInfinite = function () {
        const res = origStartInfinite.apply(this, arguments);
        try { onLocalPomodoroStarted('infinite'); } catch (_) {}
        return res;
      };
    }

    if (typeof origStartBreak === 'function') {
      window.startBreak = function (isLong) {
        const res = origStartBreak.apply(this, arguments);
        try { onLocalPomodoroBreakStarted(!!isLong); } catch (_) {}
        return res;
      };
    }

    if (typeof origPause === 'function') {
      window.pauseSession = function () {
        const res = origPause.apply(this, arguments);
        try { onLocalPomodoroPaused(); } catch (_) {}
        return res;
      };
    }

    if (typeof origResume === 'function') {
      window.resumeSession = function () {
        const res = origResume.apply(this, arguments);
        try { onLocalPomodoroResumed(); } catch (_) {}
        return res;
      };
    }

    if (typeof origEnd === 'function') {
      window.endSession = function () {
        const snap = capturePomoSessionSnapshot();
        const res = origEnd.apply(this, arguments);
        try { onLocalPomodoroEnded(snap, true); } catch (_) {}
        return res;
      };
    }

    window.completePomoSession = function () {
      const snap = capturePomoSessionSnapshot();
      const res = origComplete.apply(this, arguments);
      try { onLocalPomodoroEnded(snap, false); } catch (_) {}
      return res;
    };
  }

  function capturePomoSessionSnapshot() {
    try {
      const s = window.DB?.pomodoro?.session;
      if (!s) return null;
      let elapsedMins = 0;
      if (s.mode === 'infinite') {
        const ms = (s.baseElapsedMs || 0) + (s.status === 'running' ? Date.now() - s.startAt : 0);
        elapsedMins = Math.round(ms / 60000);
      } else {
        const rem = s.status === 'running' ? Math.max(0, s.endAt - Date.now()) : (s.remainingMs || 0);
        elapsedMins = Math.max(0, Math.round(((s.totalMs || 0) - rem) / 60000));
      }
      return {
        mode: s.mode,
        isLongBreak: !!s.isLongBreak,
        plannedMinutes: s.plannedMinutes || Math.round((s.totalMs || 0) / 60000) || 25,
        elapsedMins,
        startAt: s.startAt || Date.now()
      };
    } catch (_) {
      return null;
    }
  }

  async function onLocalPomodoroStarted(mode) {
    if (!state.prefs.autoSyncPomo || !navigator.onLine) return;
    if (!state.user && hasSavedAuthSession()) await initSocialIfNeeded();
    if (!state.user || !state.client) return;

    const planned = mode === 'infinite' ? 0 : (window.DB?.pomodoro?.settings?.focusMin || 25);
    await setManualStatus({
      statusCode: 'studying',
      subject: state.prefs.currentSubject || '',
      activityType: state.prefs.currentActivityType || 'مطالعه تشریحی',
      topic: state.prefs.currentTopic || '',
      plannedMinutes: planned,
      durationMinutes: planned > 0 ? planned + 5 : 0,
      mood: state.prefs.currentMood || '',
      shareMood: !!state.prefs.shareMood,
      silent: true,
      publishFeed: true
    });
  }

  async function onLocalPomodoroBreakStarted(isLong) {
    if (!state.prefs.autoSyncPomo || !navigator.onLine || !state.user) return;
    const mins = isLong
      ? (window.DB?.pomodoro?.settings?.longBreakMin || 15)
      : (window.DB?.pomodoro?.settings?.breakMin || 5);
    await setManualStatus({
      statusCode: 'resting',
      durationMinutes: mins + 2,
      silent: true
    });
  }

  async function onLocalPomodoroPaused() {
    if (!state.prefs.autoSyncPomo || !navigator.onLine || !state.user) return;
    syncMyRoomMemberState('resting', state.prefs.currentSubject || '');
  }

  async function onLocalPomodoroResumed() {
    if (!state.prefs.autoSyncPomo || !navigator.onLine || !state.user) return;
    syncMyRoomMemberState('studying', state.prefs.currentSubject || '');
  }

  async function onLocalPomodoroEnded(snap, endedEarly) {
    if (!snap || !state.prefs.autoSyncPomo || !navigator.onLine) return;
    if (!state.user && hasSavedAuthSession()) await initSocialIfNeeded();
    if (!state.user || !state.client) return;

    const mins = endedEarly ? snap.elapsedMins : (snap.plannedMinutes || snap.elapsedMins);
    if ((snap.mode === 'focus' || snap.mode === 'infinite') && mins >= 1) {
      await recordSocialStudySession({
        mode: snap.mode === 'infinite' ? 'infinite' : 'focus',
        subject: state.prefs.currentSubject || '',
        activityType: state.prefs.currentActivityType || 'مطالعه تشریحی',
        topic: state.prefs.currentTopic || '',
        plannedMinutes: snap.plannedMinutes || mins,
        durationMinutes: mins,
        endedEarly,
        startedAt: new Date(snap.startAt).toISOString()
      });
    }

    // Prompt next status choice non-intrusively via Social Post-Session bar
    await setManualStatus({ statusCode: 'resting', durationMinutes: 15, silent: true });
    if (typeof window.lpsShowPostSessionPrompt === 'function' && (snap.mode === 'focus' || snap.mode === 'infinite') && mins >= 1) {
      window.lpsShowPostSessionPrompt({
        minutes: mins,
        subject: state.prefs.currentSubject || '',
        activityType: state.prefs.currentActivityType || ''
      });
    }
  }

  /* ---------- Record Social Study Session, Stats, Streak & Challenges (§6, §14, §16, §20) ---------- */
  async function recordSocialStudySession({
    mode = 'focus',
    subject = '',
    activityType = 'مطالعه تشریحی',
    topic = '',
    plannedMinutes = 25,
    durationMinutes = 25,
    endedEarly = false,
    startedAt = null
  }) {
    if (!state.client || !state.user || !navigator.onLine || durationMinutes < 1) return;
    try {
      const shareAllowed = state.profile?.privacy_settings?.auto_share_pomo !== false;
      const today = todayLocalISO();

      await state.client.from('lps_study_sessions').insert({
        user_id: state.user.id,
        mode,
        subject: String(subject || '').slice(0, 80),
        activity_type: String(activityType || 'مطالعه تشریحی').slice(0, 60),
        topic: String(topic || '').slice(0, 120),
        planned_minutes: Math.max(1, Math.round(plannedMinutes)),
        duration_minutes: Math.max(1, Math.round(durationMinutes)),
        mood: state.prefs.shareMood ? (state.prefs.currentMood || '') : '',
        completed: !endedEarly,
        ended_early: !!endedEarly,
        is_shared: shareAllowed,
        study_date: today,
        started_at: startedAt || new Date(Date.now() - durationMinutes * 60000).toISOString(),
        ended_at: new Date().toISOString()
      });

      // Update aggregated profile stats + non-punitive Streak (§14: rest doesn't break progress unfairly)
      const prof = state.profile || await fetchOrCreateMyProfile();
      const prevDate = prof.last_study_date;
      let nextStreak = prof.current_streak || 0;
      let activeDays = prof.active_days_count || 0;

      if (prevDate !== today) {
        activeDays += 1;
        if (!prevDate) {
          nextStreak = 1;
        } else {
          const diffDays = Math.round((new Date(today) - new Date(prevDate)) / 86400000);
          // Consecutive day OR 1 rest day grace keeps streak alive (§14: استراحت نباید خودکار باعث شکست شود)
          if (diffDays === 1 || diffDays === 2) nextStreak += 1;
          else nextStreak = 1;
        }
      }
      const bestStreak = Math.max(prof.best_streak || 0, nextStreak);
      const totalMins = (prof.total_study_minutes || 0) + durationMinutes;
      const totalSessions = (prof.total_sessions || 0) + 1;

      const subjectsArr = Array.isArray(prof.studied_subjects) ? [...prof.studied_subjects] : [];
      if (subject && !subjectsArr.includes(subject)) subjectsArr.unshift(subject);

      const weekly = Object.assign({}, prof.weekly_minutes || {});
      weekly[today] = (Number(weekly[today]) || 0) + durationMinutes;
      // Keep last 14 days in weekly_minutes JSON
      Object.keys(weekly).sort().slice(0, -14).forEach(k => delete weekly[k]);

      const { data: updatedProf } = await state.client
        .from('lps_profiles')
        .update({
          total_study_minutes: totalMins,
          total_sessions: totalSessions,
          active_days_count: activeDays,
          current_streak: nextStreak,
          best_streak: bestStreak,
          last_study_date: today,
          studied_subjects: subjectsArr.slice(0, 30),
          weekly_minutes: weekly
        })
        .eq('id', state.user.id)
        .select('*')
        .single();
      if (updatedProf) state.profile = updatedProf;

      if (shareAllowed) {
        const subTxt = subject ? `درس «${subject}»` : 'پومودورو';
        await postActivity(
          endedEarly ? 'study_early_end' : 'study_complete',
          `${fa(durationMinutes)} دقیقه مطالعه در ${subTxt} ثبت شد ✅`,
          activityType ? `نوع فعالیت: ${activityType}${topic ? ' · ' + topic : ''}` : '',
          { subject, activityType, topic, durationMinutes }
        );
      }

      // Auto-advance active challenges matching minutes/sessions/days
      await advanceMyChallenges({ minutes: durationMinutes, sessions: 1, subject });

      // Check & unlock achievements
      await evaluateAchievements();
      await refreshFeed();
      notifyUI();
    } catch (_) {}
  }

  /* ---------- Test Results System (§7) ---------- */
  function calculateTestPercentage(total, correct, wrong, withNegative = true) {
    const t = Math.max(1, Number(total) || 1);
    const c = Math.max(0, Number(correct) || 0);
    const w = Math.max(0, Number(wrong) || 0);
    const raw = withNegative ? ((c * 3 - w) / (t * 3)) * 100 : (c / t) * 100;
    return Math.round(Math.max(-33.33, Math.min(100, raw)) * 10) / 10;
  }

  async function submitTestResult({
    subject,
    topic = '',
    totalQuestions,
    correctCount,
    wrongCount,
    blankCount,
    withNegative = true,
    notes = '',
    visibility = 'friends'
  }) {
    if (!state.client || !state.user || !navigator.onLine) {
      notifyToast('📴 برای ثبت و اشتراک نتیجه تست در شبکه اجتماعی آنلاین شو');
      return null;
    }
    const sub = String(subject || '').trim().slice(0, 80);
    const total = Math.floor(Number(totalQuestions) || 0);
    const corr = Math.max(0, Math.floor(Number(correctCount) || 0));
    const wrong = Math.max(0, Math.floor(Number(wrongCount) || 0));
    const blank = blankCount !== '' && blankCount !== undefined
      ? Math.max(0, Math.floor(Number(blankCount) || 0))
      : Math.max(0, total - corr - wrong);

    if (!sub) { notifyToast('⚠️ نام درس را وارد کن'); return null; }
    if (total < 1 || corr + wrong + blank > total) {
      notifyToast('⚠️ مجموع صحیح، غلط و نزده نمی‌تواند بیشتر از کل تست‌ها باشد');
      return null;
    }

    const pct = calculateTestPercentage(total, corr, wrong, withNegative);
    try {
      const { data, error } = await state.client
        .from('lps_test_results')
        .insert({
          user_id: state.user.id,
          subject: sub,
          topic: String(topic || '').trim().slice(0, 120),
          total_questions: total,
          correct_count: corr,
          wrong_count: wrong,
          blank_count: blank,
          score_percent: pct,
          with_negative: !!withNegative,
          notes: String(notes || '').trim().slice(0, 500),
          visibility,
          test_date: todayLocalISO()
        })
        .select('*')
        .single();
      if (error) throw error;

      // Increment total_tests_solved on profile
      const newTestsTotal = (state.profile?.total_tests_solved || 0) + total;
      const subjectsArr = Array.isArray(state.profile?.studied_subjects) ? [...state.profile.studied_subjects] : [];
      if (!subjectsArr.includes(sub)) subjectsArr.unshift(sub);

      const { data: upProf } = await state.client
        .from('lps_profiles')
        .update({ total_tests_solved: newTestsTotal, studied_subjects: subjectsArr.slice(0, 30) })
        .eq('id', state.user.id)
        .select('*')
        .single();
      if (upProf) state.profile = upProf;

      if (visibility === 'friends') {
        await postActivity(
          'test_result',
          `نتیجه تست درس «${sub}»: ٪${fa(pct)} 🎯`,
          `${fa(total)} تست (✅ ${fa(corr)} · ❌ ${fa(wrong)} · ⚪ ${fa(blank)})${topic ? ' — ' + topic : ''}`,
          { test_result_id: data.id, subject: sub, topic, total, corr, wrong, blank, pct }
        );
      }

      await advanceMyChallenges({ tests: total, subject: sub });
      await evaluateAchievements();
      await refreshFeed();
      notifyToast(`🎯 نتیجه تست ثبت شد (${fa(pct)}٪)`);
      notifyUI();
      return data;
    } catch (e) {
      notifyToast('⚠️ خطا در ثبت نتیجه تست');
      return null;
    }
  }

  /* ---------- Activity Feed & Sticker Reactions (§8, §10) ---------- */
  async function postActivity(eventType, title, subtitle = '', payload = {}, visibility = 'friends') {
    if (!state.client || !state.user || !navigator.onLine) return null;
    try {
      const { data } = await state.client
        .from('lps_activities')
        .insert({
          user_id: state.user.id,
          event_type: eventType,
          title: String(title || '').slice(0, 160),
          subtitle: String(subtitle || '').slice(0, 300),
          payload: payload || {},
          visibility
        })
        .select('*')
        .single();
      return data;
    } catch (_) {
      return null;
    }
  }

  async function refreshFeed() {
    if (!state.client || !state.user || !navigator.onLine) return;
    const { data: acts, error } = await state.client
      .from('lps_activities')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(40);
    if (error) return;

    const userIds = [...new Set((acts || []).map(a => a.user_id))];
    const profMap = {};
    if (state.profile) profMap[state.profile.id] = state.profile;
    state.friends.forEach(f => { profMap[f.id] = f; });
    const missing = userIds.filter(id => !profMap[id]);
    if (missing.length) {
      const { data: profs } = await state.client.from('lps_profiles').select('*').in('id', missing);
      (profs || []).forEach(p => { profMap[p.id] = p; });
    }

    state.activities = (acts || []).map(a => Object.assign({}, a, { author: profMap[a.user_id] || null }));

    const actIds = state.activities.map(a => a.id);
    const reactMap = {};
    if (actIds.length) {
      const { data: reacts } = await state.client
        .from('lps_reactions')
        .select('*')
        .in('activity_id', actIds);
      (reacts || []).forEach(r => {
        if (!reactMap[r.activity_id]) reactMap[r.activity_id] = [];
        reactMap[r.activity_id].push(r);
      });
    }
    state.reactionsByActivity = reactMap;
    notifyUI();
  }

  async function toggleActivityReaction(activityId, targetUserId, sticker, clickEvent) {
    if (!state.client || !state.user || !navigator.onLine) return;
    if (!STICKERS.includes(sticker)) return;
    try {
      const list = state.reactionsByActivity[activityId] || [];
      const existing = list.find(r => r.sender_id === state.user.id && r.sticker === sticker);
      if (existing) {
        await state.client.from('lps_reactions').delete().eq('id', existing.id);
      } else {
        await state.client.from('lps_reactions').insert({
          sender_id: state.user.id,
          target_user_id: targetUserId,
          activity_id: activityId,
          sticker
        });
        if (clickEvent) spawnFloatingSticker(sticker, clickEvent);
        if (targetUserId !== state.user.id) {
          await pushNotification(targetUserId, 'new_reaction', `واکنش جدید ${sticker}`,
            `${state.profile?.display_name || 'دوستت'} به فعالیتت واکنش ${sticker} نشان داد!`);
        }
      }
      await refreshFeed();
    } catch (_) {}
  }

  async function sendDirectStickerReaction(friendId, sticker, clickEvent) {
    if (!state.client || !state.user || !navigator.onLine) return;
    try {
      await state.client.from('lps_messages').insert({
        sender_id: state.user.id,
        receiver_id: friendId,
        msg_type: 'sticker',
        content: sticker
      });
      if (clickEvent) spawnFloatingSticker(sticker, clickEvent);
      await pushNotification(friendId, 'new_reaction', `استیکر انرژی ${sticker}`,
        `${state.profile?.display_name || 'دوستت'} برایت ${sticker} فرستاد!`);
      notifyToast(`واکنش ${sticker} ارسال شد!`);
    } catch (_) {
      notifyToast('⚠️ خطا در ارسال واکنش');
    }
  }

  function spawnFloatingSticker(sticker, ev) {
    if (document.documentElement.classList.contains('lp-perf')) return;
    const el = document.createElement('div');
    el.className = 'lps-floating-sticker';
    el.textContent = sticker;
    const x = ev?.clientX || (window.innerWidth / 2);
    const y = ev?.clientY || (window.innerHeight / 2);
    el.style.left = `${x - 14}px`;
    el.style.top = `${y - 14}px`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  /* ---------- Motivational Messages & Private Chat (§8) ---------- */
  async function sendMessageToFriend(friendId, content, msgType = 'chat') {
    if (!state.client || !state.user || !navigator.onLine) {
      notifyToast('📴 در حالت آفلاین امکان ارسال پیام نیست');
      return false;
    }
    const clean = String(content || '').trim().slice(0, 600);
    if (!clean) return false;
    try {
      const { data, error } = await state.client
        .from('lps_messages')
        .insert({
          sender_id: state.user.id,
          receiver_id: friendId,
          msg_type: msgType,
          content: clean
        })
        .select('*')
        .single();
      if (error) throw error;

      if (state.activeChatFriend?.id === friendId) {
        state.chatMessages.push(data);
        notifyUI();
      }

      await pushNotification(
        friendId,
        msgType === 'motivational' ? 'motivational_msg' : 'new_message',
        msgType === 'motivational' ? '⚡ پیام انگیزشی جدید!' : '💬 پیام جدید از دوستت',
        `${state.profile?.display_name || 'دوستت'}: ${clean.slice(0, 90)}`
      );

      if (msgType === 'motivational') {
        await unlockAchievement('good_friend');
        notifyToast('💪 پیام انگیزشی ارسال شد!');
      }
      return true;
    } catch (e) {
      notifyToast('⚠️ محدودیت ارسال یا خطای شبکه؛ کمی بعد امتحان کن');
      return false;
    }
  }

  async function openChatWithFriend(friend) {
    state.activeChatFriend = friend;
    state.chatMessages = [];
    notifyUI();
    if (!state.client || !state.user || !navigator.onLine || !friend) return;
    const uid = state.user.id;
    const fid = friend.id;
    const { data } = await state.client
      .from('lps_messages')
      .select('*')
      .or(`and(sender_id.eq.${uid},receiver_id.eq.${fid}),and(sender_id.eq.${fid},receiver_id.eq.${uid})`)
      .order('created_at', { ascending: true })
      .limit(80);
    state.chatMessages = data || [];
    // Mark unread messages from this friend as read
    await state.client
      .from('lps_messages')
      .update({ is_read: true })
      .eq('sender_id', fid)
      .eq('receiver_id', uid)
      .eq('is_read', false);
    notifyUI();
  }

  /* ---------- Notifications (§12) ---------- */
  async function pushNotification(targetUserId, notifType, title, body, payload = {}) {
    if (!state.client || !state.user || targetUserId === state.user.id) return;
    try {
      // Respect target's notification settings if known in state.friends
      const f = state.friends.find(x => x.id === targetUserId);
      if (f && f.notification_settings) {
        const ns = f.notification_settings;
        if ((notifType === 'new_message' || notifType === 'motivational_msg') && ns.messages === false) return;
        if (notifType === 'new_reaction' && ns.reactions === false) return;
        if (notifType === 'room_invite' && ns.rooms === false) return;
        if ((notifType === 'challenge_invite' || notifType === 'challenge_start') && ns.challenges === false) return;
      }
      await state.client.from('lps_notifications').insert({
        user_id: targetUserId,
        actor_id: state.user.id,
        notif_type: notifType,
        title: String(title || '').slice(0, 160),
        body: String(body || '').slice(0, 300),
        payload
      });
    } catch (_) {}
  }

  async function refreshNotifications() {
    if (!state.client || !state.user || !navigator.onLine) return;
    const { data } = await state.client
      .from('lps_notifications')
      .select('*')
      .eq('user_id', state.user.id)
      .order('created_at', { ascending: false })
      .limit(35);
    state.notifications = data || [];
    notifyUI();
  }

  async function markAllNotificationsRead() {
    if (!state.client || !state.user) return;
    await state.client
      .from('lps_notifications')
      .update({ is_read: true })
      .eq('user_id', state.user.id)
      .eq('is_read', false);
    state.notifications.forEach(n => { n.is_read = true; });
    notifyUI();
  }

  /* ---------- Study Together Rooms (§13) ---------- */
  async function refreshRooms() {
    if (!state.client || !state.user || !navigator.onLine) return;
    const { data: rooms } = await state.client
      .from('lps_study_rooms')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(20);
    state.rooms = rooms || [];

    const roomIds = state.rooms.map(r => r.id);
    const membersMap = {};
    if (roomIds.length) {
      const { data: mems } = await state.client
        .from('lps_room_members')
        .select('*')
        .in('room_id', roomIds);
      const uids = [...new Set((mems || []).map(m => m.user_id))];
      const pMap = {};
      if (state.profile) pMap[state.profile.id] = state.profile;
      state.friends.forEach(f => { pMap[f.id] = f; });
      const missing = uids.filter(id => !pMap[id]);
      if (missing.length) {
        const { data: profs } = await state.client.from('lps_profiles').select('*').in('id', missing);
        (profs || []).forEach(p => { pMap[p.id] = p; });
      }
      (mems || []).forEach(m => {
        if (!membersMap[m.room_id]) membersMap[m.room_id] = [];
        membersMap[m.room_id].push(Object.assign({}, m, { profile: pMap[m.user_id] || null }));
      });
    }
    state.roomMembersByRoom = membersMap;
    notifyUI();
  }

  async function createStudyRoom({ name, subject = '', targetMinutes = 50, invitedFriendIds = [] }) {
    if (!state.client || !state.user || !navigator.onLine) return null;
    const cleanName = String(name || '').trim().slice(0, 80);
    if (!cleanName) { notifyToast('⚠️ نام اتاق مطالعه را وارد کن'); return null; }
    const mins = Math.max(5, Math.min(720, Number(targetMinutes) || 50));

    try {
      const endsAt = new Date(Date.now() + mins * 60000).toISOString();
      const { data: room, error } = await state.client
        .from('lps_study_rooms')
        .insert({
          creator_id: state.user.id,
          name: cleanName,
          subject: String(subject || '').trim().slice(0, 80),
          target_minutes: mins,
          started_at: new Date().toISOString(),
          ends_at: endsAt
        })
        .select('*')
        .single();
      if (error) throw error;

      // Host joins automatically with independent personal timer
      await state.client.from('lps_room_members').insert({
        room_id: room.id,
        user_id: state.user.id,
        role: 'host',
        member_status: state.profile?.status_code === 'studying' ? 'studying' : 'ready',
        current_subject: subject || state.prefs.currentSubject || ''
      });

      for (const fid of invitedFriendIds) {
        await state.client.from('lps_room_members').insert({
          room_id: room.id,
          user_id: fid,
          role: 'invited',
          member_status: 'ready'
        });
        await pushNotification(fid, 'room_invite', '📚 دعوت به اتاق مطالعه گروهی',
          `${state.profile?.display_name || 'دوستت'} تو را به اتاق «${cleanName}» دعوت کرد!`, { room_id: room.id });
      }

      await postActivity('room_created', `اتاق مطالعه «${cleanName}» را ساخت 🏠`,
        subject ? `درس پیشنهادی: ${subject} · ${fa(mins)} دقیقه` : `جلسه ${fa(mins)} دقیقه‌ای`, { room_id: room.id });
      await unlockAchievement('first_room');
      await refreshRooms();
      notifyToast('🏠 اتاق مطالعه گروهی ساخته شد!');
      return room;
    } catch (e) {
      notifyToast('⚠️ خطا در ساخت اتاق مطالعه');
      return null;
    }
  }

  async function joinOrUpdateRoomMember(roomId, memberStatus = 'studying') {
    if (!state.client || !state.user) return;
    try {
      await state.client.from('lps_room_members').upsert({
        room_id: roomId,
        user_id: state.user.id,
        role: 'member',
        member_status: memberStatus,
        current_subject: state.prefs.currentSubject || '',
        updated_at: new Date().toISOString()
      }, { onConflict: 'room_id,user_id' });
      await unlockAchievement('first_room');
      await refreshRooms();
      notifyToast('✅ وارد اتاق مطالعه شدی (تایمر پومودوروی شخصیت کاملاً مستقل است)');
    } catch (_) {}
  }

  async function inviteFriendToRoom(roomId, friendId, roomName) {
    if (!state.client || !state.user) return;
    try {
      await state.client.from('lps_room_members').upsert({
        room_id: roomId,
        user_id: friendId,
        role: 'invited',
        member_status: 'ready'
      }, { onConflict: 'room_id,user_id' });
      await pushNotification(friendId, 'room_invite', '📚 دعوت به اتاق مطالعه',
        `${state.profile?.display_name || 'دوستت'} تو را به اتاق «${roomName}» دعوت کرد!`);
      await refreshRooms();
      notifyToast('📨 دعوت‌نامه ارسال شد');
    } catch (_) {}
  }

  async function leaveOrCloseRoom(roomId, isCreator = false) {
    if (!state.client || !state.user) return;
    try {
      if (isCreator) {
        await state.client.from('lps_study_rooms').update({ is_active: false }).eq('id', roomId);
        notifyToast('اتاق مطالعه بسته شد');
      } else {
        await state.client.from('lps_room_members').delete().eq('room_id', roomId).eq('user_id', state.user.id);
        notifyToast('از اتاق مطالعه خارج شدی');
      }
      await refreshRooms();
    } catch (_) {}
  }

  async function syncMyRoomMemberState(statusCode, subject) {
    if (!state.client || !state.user || !state.rooms.length) return;
    const mapped = statusCode === 'studying' ? 'studying' : (statusCode === 'resting' ? 'resting' : 'away');
    try {
      await state.client
        .from('lps_room_members')
        .update({
          member_status: mapped,
          current_subject: String(subject || '').slice(0, 80),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', state.user.id);
    } catch (_) {}
  }

  /* ---------- Friendly Challenges (§20) ---------- */
  async function refreshChallenges() {
    if (!state.client || !state.user || !navigator.onLine) return;
    const { data: chs } = await state.client
      .from('lps_challenges')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(25);
    state.challenges = chs || [];

    const chIds = state.challenges.map(c => c.id);
    const partMap = {};
    if (chIds.length) {
      const { data: parts } = await state.client
        .from('lps_challenge_participants')
        .select('*')
        .in('challenge_id', chIds);
      const uids = [...new Set((parts || []).map(p => p.user_id))];
      const pMap = {};
      if (state.profile) pMap[state.profile.id] = state.profile;
      state.friends.forEach(f => { pMap[f.id] = f; });
      const missing = uids.filter(id => !pMap[id]);
      if (missing.length) {
        const { data: profs } = await state.client.from('lps_profiles').select('*').in('id', missing);
        (profs || []).forEach(p => { pMap[p.id] = p; });
      }
      (parts || []).forEach(p => {
        if (!partMap[p.challenge_id]) partMap[p.challenge_id] = [];
        partMap[p.challenge_id].push(Object.assign({}, p, { profile: pMap[p.user_id] || null }));
      });
    }
    state.challengePartsByChallenge = partMap;
    notifyUI();
  }

  async function createChallenge({
    title,
    subject = '',
    challengeType = 'minutes',
    targetValue = 300,
    durationDays = 5,
    invitedFriendIds = []
  }) {
    if (!state.client || !state.user || !navigator.onLine) return null;
    const cleanTitle = String(title || '').trim().slice(0, 100);
    if (!cleanTitle) { notifyToast('⚠️ عنوان چالش را وارد کن'); return null; }
    const days = Math.max(1, Math.min(90, Number(durationDays) || 5));
    const target = Math.max(1, Number(targetValue) || 100);

    try {
      const endsAt = new Date(Date.now() + days * 86400000).toISOString();
      const { data: ch, error } = await state.client
        .from('lps_challenges')
        .insert({
          creator_id: state.user.id,
          title: cleanTitle,
          subject: String(subject || '').trim().slice(0, 80),
          challenge_type: challengeType,
          target_value: target,
          duration_days: days,
          ends_at: endsAt
        })
        .select('*')
        .single();
      if (error) throw error;

      await state.client.from('lps_challenge_participants').insert({
        challenge_id: ch.id,
        user_id: state.user.id,
        invite_status: 'joined',
        progress_value: 0
      });

      for (const fid of invitedFriendIds) {
        await state.client.from('lps_challenge_participants').insert({
          challenge_id: ch.id,
          user_id: fid,
          invite_status: 'invited',
          progress_value: 0
        });
        await pushNotification(fid, 'challenge_invite', '🏆 دعوت به چالش دوستانه!',
          `${state.profile?.display_name || 'دوستت'} تو را به «${cleanTitle}» دعوت کرد!`, { challenge_id: ch.id });
      }

      await postActivity('challenge_joined', `چالش «${cleanTitle}» را آغاز کرد 🏆`,
        `هدف: ${fa(target)} · مدت: ${fa(days)} روز`, { challenge_id: ch.id });
      await unlockAchievement('first_challenge');
      await refreshChallenges();
      notifyToast('🏆 چالش دوستانه ساخته شد!');
      return ch;
    } catch (e) {
      notifyToast('⚠️ خطا در ساخت چالش');
      return null;
    }
  }

  async function acceptChallengeInvite(challengeId) {
    if (!state.client || !state.user) return;
    await state.client
      .from('lps_challenge_participants')
      .upsert({
        challenge_id: challengeId,
        user_id: state.user.id,
        invite_status: 'joined',
        updated_at: new Date().toISOString()
      }, { onConflict: 'challenge_id,user_id' });
    await unlockAchievement('first_challenge');
    await refreshChallenges();
    notifyToast('🔥 وارد چالش شدی!');
  }

  async function logManualChallengeProgress(challengeId, addAmount) {
    if (!state.client || !state.user) return;
    const ch = state.challenges.find(c => c.id === challengeId);
    const parts = state.challengePartsByChallenge[challengeId] || [];
    const mine = parts.find(p => p.user_id === state.user.id);
    if (!ch || !mine) return;
    const nextVal = (mine.progress_value || 0) + Math.max(1, Number(addAmount) || 0);
    const done = nextVal >= ch.target_value;
    await state.client
      .from('lps_challenge_participants')
      .update({
        progress_value: nextVal,
        completed: done,
        completed_at: done && !mine.completed ? new Date().toISOString() : mine.completed_at,
        updated_at: new Date().toISOString()
      })
      .eq('id', mine.id);
    if (done && !mine.completed) {
      await postActivity('challenge_completed', `چالش «${ch.title}» را با موفقیت کامل کرد! 🎉`, '', { challenge_id: ch.id });
      notifyToast(`🎉 تبریک! هدف چالش «${ch.title}» کامل شد!`);
    } else {
      notifyToast('✅ پیشرفت چالش ثبت شد');
    }
    await refreshChallenges();
  }

  async function finishChallenge(challengeId) {
    if (!state.client || !state.user) return;
    await state.client
      .from('lps_challenges')
      .update({ status: 'completed' })
      .eq('id', challengeId)
      .eq('creator_id', state.user.id);
    await refreshChallenges();
    notifyToast('🏁 چالش پایان یافت و نتایج نهایی ثبت شد');
  }

  async function advanceMyChallenges({ minutes = 0, sessions = 0, tests = 0, subject = '' }) {
    if (!state.client || !state.user || !state.challenges.length) return;
    for (const ch of state.challenges) {
      if (ch.status !== 'active') continue;
      if (ch.subject && subject && ch.subject.trim() !== subject.trim()) continue;
      const parts = state.challengePartsByChallenge[ch.id] || [];
      const mine = parts.find(p => p.user_id === state.user.id && p.invite_status === 'joined');
      if (!mine) continue;
      let delta = 0;
      if (ch.challenge_type === 'minutes' && minutes > 0) delta = minutes;
      else if (ch.challenge_type === 'sessions' && sessions > 0) delta = sessions;
      else if (ch.challenge_type === 'tests' && tests > 0) delta = tests;
      else if (ch.challenge_type === 'days' && minutes > 0) delta = 1;
      if (delta > 0) await logManualChallengeProgress(ch.id, delta);
    }
  }

  /* ---------- Leaderboard & Daily Recap (§15, §19) ---------- */
  async function refreshLeaderboard(period = state.leaderboardPeriod) {
    state.leaderboardPeriod = period;
    if (!state.client || !state.user || !navigator.onLine) return;
    const { data } = await state.client.rpc('lps_get_leaderboard', { p_period: period });
    state.leaderboard = Array.isArray(data) ? data : [];
    notifyUI();
  }

  async function refreshDailyRecaps(dateStr = todayLocalISO()) {
    if (!state.client || !state.user || !navigator.onLine) return;
    const { data } = await state.client.rpc('lps_get_daily_recaps', { p_date: dateStr });
    state.recaps = Array.isArray(data) ? data : [];
    notifyUI();
  }

  /* ---------- Achievements (§16) ---------- */
  async function refreshMyAchievements() {
    if (!state.client || !state.user || !navigator.onLine) return;
    const { data } = await state.client
      .from('lps_achievements')
      .select('*')
      .eq('user_id', state.user.id);
    state.myAchievements = data || [];
    notifyUI();
  }

  async function unlockAchievement(badgeKey) {
    if (!state.client || !state.user || !navigator.onLine) return;
    if (state.myAchievements.some(a => a.badge_key === badgeKey)) return;
    const meta = ACHIEVEMENTS_CATALOG.find(b => b.key === badgeKey);
    if (!meta) return;
    try {
      const { data, error } = await state.client
        .from('lps_achievements')
        .insert({ user_id: state.user.id, badge_key: badgeKey })
        .select('*')
        .single();
      if (!error && data) {
        state.myAchievements.push(data);
        if (state.profile?.notification_settings?.achievements !== false) {
          await state.client.from('lps_notifications').insert({
            user_id: state.user.id,
            actor_id: state.user.id,
            notif_type: 'achievement',
            title: `🏅 دستاورد جدید: ${meta.title}`,
            body: meta.desc
          });
        }
        if (state.profile?.privacy_settings?.show_achievements !== false) {
          await postActivity('achievement_unlocked', `نشان «${meta.title}» را کسب کرد ${meta.icon}`, meta.desc, { badge_key: badgeKey });
        }
        notifyToast(`🏅 دستاورد باز شد: ${meta.icon} ${meta.title}`);
        notifyUI();
      }
    } catch (_) {}
  }

  async function evaluateAchievements() {
    const p = state.profile;
    if (!p) return;
    if ((p.total_sessions || 0) >= 1) await unlockAchievement('first_session');
    if ((p.total_sessions || 0) >= 10) await unlockAchievement('ten_sessions');
    if ((p.total_sessions || 0) >= 50) await unlockAchievement('fifty_sessions');
    if ((p.total_tests_solved || 0) >= 100) await unlockAchievement('tests_100');
    if ((p.total_tests_solved || 0) >= 500) await unlockAchievement('tests_500');
    if ((p.current_streak || 0) >= 7 || (p.best_streak || 0) >= 7) await unlockAchievement('streak_7');
    if ((p.active_days_count || 0) >= 10 || (p.best_streak || 0) >= 10) await unlockAchievement('streak_10');
  }

  async function loadUserSocialProfileModal(targetId) {
    if (!state.client || !state.user || !navigator.onLine) return null;
    try {
      const { data: prof } = await state.client.from('lps_profiles').select('*').eq('id', targetId).maybeSingle();
      if (!prof) return null;
      const [{ data: friendCount }, { data: badges }, { data: tests }] = await Promise.all([
        state.client.rpc('lps_count_friends', { p_user_id: targetId }),
        state.client.from('lps_achievements').select('*').eq('user_id', targetId),
        state.client.from('lps_test_results').select('*').eq('user_id', targetId).order('created_at', { ascending: false }).limit(8)
      ]);
      state.viewingProfile = {
        profile: prof,
        friendsCount: Number(friendCount) || 0,
        achievements: badges || [],
        recentTests: tests || []
      };
      notifyUI();
      return state.viewingProfile;
    } catch (_) {
      return null;
    }
  }

  /* ---------- Realtime Subscriptions & Presence Heartbeat (§2, §9, §25) ---------- */
  async function setOnlinePresence(isOnline) {
    if (!state.client || !state.user || !navigator.onLine) return;
    try {
      await state.client
        .from('lps_profiles')
        .update({ is_online: !!isOnline, last_seen_at: new Date().toISOString() })
        .eq('id', state.user.id);
    } catch (_) {}
  }

  function startHeartbeat() {
    if (state.heartbeatTimer) clearInterval(state.heartbeatTimer);
    state.heartbeatTimer = setInterval(() => {
      if (navigator.onLine && state.user && document.visibilityState === 'visible') {
        setOnlinePresence(true);
      }
    }, 60000);
  }

  let debounceTimers = {};
  function debouncedRefresh(key, fn, ms = 450) {
    clearTimeout(debounceTimers[key]);
    debounceTimers[key] = setTimeout(() => {
      if (navigator.onLine && state.user) fn().catch(() => {});
    }, ms);
  }

  function setupRealtime() {
    if (!state.client || !state.user || state.realtimeChannel) return;
    const uid = state.user.id;
    state.realtimeChannel = state.client
      .channel('lps-live-v25')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'lps_profiles' }, payload => {
        const row = payload.new;
        if (!row) return;
        if (row.id === uid) {
          state.profile = Object.assign({}, state.profile, row);
          notifyUI();
        } else {
          const idx = state.friends.findIndex(f => f.id === row.id);
          if (idx !== -1) {
            state.friends[idx] = Object.assign({}, state.friends[idx], row);
            notifyUI();
          }
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lps_friendships' }, () => {
        debouncedRefresh('friends', refreshFriendsAndRequests, 350);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lps_messages', filter: `receiver_id=eq.${uid}` }, payload => {
        const msg = payload.new;
        if (!msg) return;
        if (state.activeChatFriend && msg.sender_id === state.activeChatFriend.id) {
          state.chatMessages.push(msg);
          notifyUI();
        }
        if (msg.msg_type === 'motivational') {
          notifyToast(`⚡ پیام انگیزشی: ${msg.content}`);
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lps_notifications', filter: `user_id=eq.${uid}` }, payload => {
        if (payload.new) {
          state.notifications.unshift(payload.new);
          notifyUI();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lps_activities' }, () => {
        debouncedRefresh('feed', refreshFeed, 600);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lps_reactions' }, () => {
        debouncedRefresh('feed', refreshFeed, 600);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lps_room_members' }, () => {
        debouncedRefresh('rooms', refreshRooms, 600);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lps_challenge_participants' }, () => {
        debouncedRefresh('challenges', refreshChallenges, 600);
      })
      .subscribe();
  }

  function teardownRealtime() {
    if (state.heartbeatTimer) { clearInterval(state.heartbeatTimer); state.heartbeatTimer = null; }
    if (state.realtimeChannel && state.client) {
      try { state.client.removeChannel(state.realtimeChannel); } catch (_) {}
      state.realtimeChannel = null;
    }
  }

  /* ---------- Network & Lifecycle Listeners ---------- */
  window.addEventListener('online', () => {
    state.online = true;
    state.netError = '';
    if (hasSavedAuthSession() || document.getElementById('pomoPane-social')?.classList.contains('active')) {
      initSocialIfNeeded();
    } else {
      notifyUI();
    }
  });

  window.addEventListener('offline', () => {
    state.online = false;
    state.netError = '📴 حالت آفلاین — تایمر پومودورو و بخش‌های شخصی بدون وقفه کار می‌کنند.';
    notifyUI();
  });

  window.addEventListener('beforeunload', () => {
    if (state.client && state.user && navigator.onLine) {
      setOnlinePresence(false);
    }
  });

  function boot() {
    installPomodoroHooks();
    // Only connect in background if the user previously logged into Social AND is currently online
    if (navigator.onLine && hasSavedAuthSession()) {
      setTimeout(() => initSocialIfNeeded(), 1200);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* ---------- Public Namespace ---------- */
  window.LPSocial = {
    state,
    STATUS_META,
    DEFAULT_ACTIVITY_TYPES,
    STUDY_MOODS,
    AVATAR_PRESETS,
    VIRTUAL_CHARACTERS,
    MOTIVATIONAL_PRESETS,
    STICKERS,
    ACHIEVEMENTS_CATALOG,
    subscribeUI,
    notifyUI,
    saveLocalPrefs,
    initSocialIfNeeded,
    signUpAccount,
    signInAccount,
    signOutAccount,
    updateMyProfile,
    uploadAvatarFile,
    searchUserByNumericCode,
    refreshFriendsAndRequests,
    sendFriendRequest,
    respondFriendRequest,
    cancelOrRemoveFriendship,
    blockUser,
    unblockUser,
    setManualStatus,
    addCustomActivityType,
    calculateTestPercentage,
    submitTestResult,
    refreshFeed,
    toggleActivityReaction,
    sendDirectStickerReaction,
    sendMessageToFriend,
    openChatWithFriend,
    refreshNotifications,
    markAllNotificationsRead,
    refreshRooms,
    createStudyRoom,
    joinOrUpdateRoomMember,
    inviteFriendToRoom,
    leaveOrCloseRoom,
    refreshChallenges,
    createChallenge,
    acceptChallengeInvite,
    logManualChallengeProgress,
    finishChallenge,
    refreshLeaderboard,
    refreshDailyRecaps,
    loadUserSocialProfileModal,
    fa,
    safeEsc
  };
})();
