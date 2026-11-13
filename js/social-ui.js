/* ============================================================================
   Life Planner Social v25.0 — UI Layer (js/social-ui.js)
   ----------------------------------------------------------------------------
   Renders #pomoPane-social (the Social hub inside the Pomodoro view) and the
   non-intrusive Pomodoro focus bridge strip inside #pomoPane-focus.

   Architecture rules:
   - Zero mock/placeholder buttons: every action calls window.LPSocial.
   - Reads state only through window.LPSocial state + subscribeUI().
   - RTL-first (Persian), theme-aware, Perf-Mode safe.
   - Progressive disclosure: one top bar + one subview at a time.
   ============================================================================ */
(function () {
  'use strict';

  const L = window.LPSocial;
  if (!L) {
    /* social.js hasn't loaded yet — nothing to render. */
    return;
  }

  const STATUS_META = L.STATUS_META;
  const DEFAULT_ACTIVITY_TYPES = L.DEFAULT_ACTIVITY_TYPES;
  const STUDY_MOODS = L.STUDY_MOODS;
  const AVATAR_PRESETS = L.AVATAR_PRESETS;
  const MOTIVATIONAL_PRESETS = L.MOTIVATIONAL_PRESETS;
  const STICKERS = L.STICKERS;

  /* ---------- tiny DOM helpers ---------- */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => el.querySelectorAll(s);
  const esc = L.safeEsc || ((s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
  const fa = L.fa || ((n) => String(n));

  function byId(id) { return document.getElementById(id); }

  function html(el, frag) { el.innerHTML = frag; }

  function toast(msg) { if (typeof window.toast === 'function') window.toast(msg); }
  function openModal(id) { if (typeof window.openModal === 'function') window.openModal(id); else { const b = byId(id); if (b) b.classList.add('open'); } }
  function closeModal(id) { if (typeof window.closeModal === 'function') window.closeModal(id); else { const b = byId(id); if (b) b.classList.remove('open'); } }

  /* ---------- UI state ---------- */
  const ui = {
    mounted: false,
    subView: 'home',        // home | friends | feed | rooms | challenges | leaderboard | recap | profile | settings | chat | search
    activeChatFriend: null,
    timedStatusModalOpen: false,
    testResultModalOpen: false,
    tourStep: 0
  };

  const SUBVIEWS = ['home', 'friends', 'feed', 'rooms', 'challenges', 'leaderboard', 'recap', 'profile', 'settings', 'chat'];

  /* ---------- formatting ---------- */
  function relMs(ms) {
    const sec = Math.max(0, Math.floor(ms / 1000));
    if (sec < 60) return `${fa(sec)} ثانیه`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${fa(min)} دقیقه`;
    const h = Math.floor(min / 60);
    return `${fa(h)} ساعت${min % 60 ? ' و ' + fa(min % 60) + ' دقیقه' : ''}`;
  }

  function relTime(iso) {
    if (!iso) return 'همین الان';
    try {
      const d = new Date(iso);
      const now = Date.now();
      const delta = Math.max(0, Math.floor((now - d) / 1000));
      if (delta < 60) return 'الان';
      if (delta < 3600) return `${fa(Math.floor(delta / 60))} دقیقه قبل`;
      if (delta < 86400) return `${fa(Math.floor(delta / 3600))} ساعت قبل`;
      return `${fa(Math.floor(delta / 86400))} روز قبل`;
    } catch (_) { return iso; }
  }

  function avatarFor(profile, presetOverride) {
    if (profile && profile.avatar_url) return `<img src="${esc(profile.avatar_url)}" alt="">`;
    const preset = presetOverride || (profile && profile.avatar_preset) || 'fox';
    return esc(AVATAR_PRESETS[preset] || '🦊');
  }

  function statusPill(profile) {
    if (!profile) return `<span class="lps-status-pill" data-st="free">🟢 آزاد</span>`;
    const code = profile.status_code || 'free';
    const meta = STATUS_META[code] || STATUS_META.free;
    const until = profile.status_until ? new Date(profile.status_until).getTime() : 0;
    const live = until && until > Date.now() ? ' زنده' : '';
    const extra = (code === 'studying' && profile.status_subject) ? ` — ${esc(profile.status_subject)}` : '';
    return `<span class="lps-status-pill lps-st-anim" data-st="${esc(code)}" title="${esc(meta.label)}${extra}${live}">${meta.emoji} ${esc(meta.label)}${extra}</span>`;
  }

  function onlineDot(profile) {
    if (!profile) return `<span class="lps-online-dot"></span>`;
    const isOnline = profile.is_online === true || profile.is_online === 1;
    return `<span class="lps-online-dot ${isOnline ? 'is-online' : ''}" title="${isOnline ? 'آنلاین' : 'آفلاین'}"></span>`;
  }

  /* ---------- main entry: render the whole #pomoPane-social ---------- */
  function renderSocialHub() {
    const pane = byId('pomoPane-social');
    if (!pane) return;
    ui.mounted = true;

    const st = L.state || {};
    const authed = !!st.user && !!st.profile;

    /* Auth screen when not logged in. */
    if (!authed) {
      html(pane, authScreenHtml());
      wireAuthEvents();
      return;
    }

    /* Shell when logged in. */
    html(pane, shellHtml(st));
    bindShellEvents();
    renderCurrentSubView(st);
  }

  function shellHtml(st) {
    const prof = st.profile || {};
    const code = prof.user_code ? `#${fa(prof.user_code)}` : '#—';
    const online = prof.is_online ? 'is-online' : '';
    const unseen = (st.notifications || []).filter(n => !n.is_read).length;
    const net = st.netError ? `<div class="lps-net-banner" role="status">${esc(st.netError)}</div>` : '';

    return `
      <div class="lps-root" id="lpsRoot">
        ${net}
        <div class="lps-hero-bar">
          <div class="lps-me-summary">
            <div class="lps-avatar" id="lpsMyAvatar" role="button" tabindex="0" aria-label="پروفایل من">${avatarFor(prof)}</div>
            <div class="lps-me-meta">
              <div class="lps-me-name-row">
                <div class="lps-me-name" id="lpsMyName">${esc(prof.display_name || 'کاربر')}</div>
                <div class="lps-code-pill" id="lpsMyCodePill" title="کپی شناسه">${code}</div>
              </div>
              <div class="lps-me-sub">
                ${statusPill(prof)}
                <span class="lps-me-sub" id="lpsMySub">${prof.status_subject ? `درس ${esc(prof.status_subject)}` : ''}${prof.status_activity_type ? ` · ${esc(prof.status_activity_type)}` : ''}</span>
                <span class="lps-net-dot ${online}" id="lpsNetDot" title="${online ? 'آنلاین' : 'آفلاین'}"></span>
              </div>
            </div>
          </div>
          <div class="lps-hero-actions">
            <div class="lps-icon-btn" id="lpsBtnStatus" title="تغییر وضعیت">${STATUS_META[(prof.status_code || 'free')].emoji || '🟢'}</div>
            <div class="lps-icon-btn" id="lpsBtnNotify" title="اعلان‌ها">${unseen ? '🔔' : '𕔠'}<span class="lps-badge-count" id="lpsNotifyBadge" style="${unseen ? '' : 'display:none'}">${fa(unseen)}</span></div>
            <div class="lps-icon-btn" id="lpsBtnMenu" title="بخش‌ها">☰</div>
          </div>
        </div>

        <div class="lps-subnav" id="lpsSubnav">
          <div class="lps-subtab active" data-sub="home">🏠 خانه</div>
          <div class="lps-subtab" data-sub="friends">👥 دوستان</div>
          <div class="lps-subtab" data-sub="feed">📢 تایم‌لاین</div>
          <div class="lps-subtab" data-sub="rooms">🏠 اتاق‌ها</div>
          <div class="lps-subtab" data-sub="challenges">🏆 چالش‌ها</div>
          <div class="lps-subtab" data-sub="leaderboard">📊 رتبه‌بندی</div>
          <div class="lps-subtab" data-sub="recap">📅 گزارش روزانه</div>
          <div class="lps-subtab" data-sub="profile">👤 پروفایل من</div>
          <div class="lps-subtab" data-sub="settings">⚙️ تنظیمات اجتماعی</div>
          <div class="lps-icon-btn" id="lpsBtnSignOut" title="خروج از حساب">🚪</div>
        </div>

        <div id="lpsSubview"></div>

        <div class="lps-tour-wrap" id="lpsTourWrap" style="display:none;">
          <button class="lps-icon-btn" id="lpsBtnTourReplay" title="تور راهنمای بخش پومودوروی اجتماعی">🎓再 играй tour</button>
        </div>
      </div>

      <!-- Modals (placed here so they overlay the whole app) -->
      <div class="modal-bg" id="lpsAuthModal" style="display:none;"></div>
      <div class="modal-bg" id="lpsStatusModal" style="display:none;"></div>
      <div class="modal-bg" id="lpsFriendProfileModal" style="display:none;"></div>
      <div class="modal-bg" id="lpsTestResultModal" style="display:none;"></div>
      <div class="modal-bg" id="lpsChatModal" style="display:none;"></div>
      <div class="modal-bg" id="lpsCreateRoomModal" style="display:none;"></div>
      <div class="modal-bg" id="lpsCreateChallengeModal" style="display:none;"></div>
      <div class="modal-bg" id="lpsMotivModal" style="display:none;"></div>
      <div class="modal-bg" id="lpsBlockedModal" style="display:none;"></div>
    `;
  }

  /* ---------- subview renderers ---------- */
  function renderCurrentSubView(st) {
    const box = byId('lpsSubview');
    if (!box) return;
    const v = ui.subView;
    $$('.lps-subtab', box.parentElement).forEach(t => {
      t.classList.toggle('active', t.dataset.sub === v);
    });
    if (v === 'home') html(box, homeHtml(st));
    else if (v === 'friends') html(box, friendsHtml(st));
    else if (v === 'feed') html(box, feedHtml(st));
    else if (v === 'rooms') html(box, roomsHtml(st));
    else if (v === 'challenges') html(box, challengesHtml(st));
    else if (v === 'leaderboard') html(box, leaderboardHtml(st));
    else if (v === 'recap') html(box, recapHtml(st));
    else if (v === 'profile') html(box, myProfileHtml(st));
    else if (v === 'settings') html(box, settingsHtml(st));
    else if (v === 'chat') html(box, chatHtml(st));
    wireSubviewEvents(v);
  }

  function homeHtml(st) {
    const prof = st.profile || {};
    const friends = st.friends || [];
    const studying = friends.filter(f => f.status_code === 'studying');
    const resting = friends.filter(f => f.status_code === 'resting');
    const other = friends.filter(f => f.status_code !== 'studying' && f.status_code !== 'resting' && f.is_online);
    const offline = friends.filter(f => !f.is_online);
    const net = st.netError ? `<div class="lps-net-banner">${esc(st.netError)}</div>` : '';

    return `
      ${net}
      <div class="lps-feed-head">
        <h2>بخش پومودوروی اجتماعی</h2>
        <p class="muted">وضعیت دوستان و فعالیت‌های اخیر — همان‌جا، بدون betray کردن تایمر شخصی.</p>
      </div>

      <div class="card" style="margin-bottom:14px;">
        <div class="card-head"><h3>👥 دوستان در حال مطالعه</h3></div>
        <div id="lpsHomeStudying" class="lps-friends-grid">
          ${studying.length ? studying.map(f => friendCardHtml(f)).join('') : '<div class="muted" style="padding:14px;">هیچ دوستی در حال مطالعه نیست.</div>'}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>📢 آخرین فعالیت‌های دوستان</h3></div>
        <div id="lpsHomeFeed" class="lps-feed-list">
          ${(st.activities || []).slice(0, 6).map(a => feedItemHtml(a, st)).join('') || '<div class="muted" style="padding:14px;">هنوز فعالیت برای نمایش نیست.</div>'}
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:8px;"><button class="btn ghost sm" onclick="window.renderSocialHub && (ui.subView='feed', renderSocialHub())">مشاهده‌ی همه</button></div>
      </div>
    `;
  }

  function friendCardHtml(f) {
    const meta = STATUS_META[f.status_code || 'free'] || STATUS_META.free;
    const online = f.is_online ? 'is-online' : '';
    const studying = f.status_code === 'studying';
    const studyBox = studying
      ? `<div class="lps-fc-study-box">${esc(f.status_subject || '')} · ${esc(f.status_activity_type || '')}${f.status_topic ? ` — ${esc(f.status_topic)}` : ''}</div>`
      : '';
    return `
      <div class="lps-friend-card ${studying ? 'is-studying' : ''} ${online}" id="lpsFc-${f.id}">
        <div class="lps-fc-top">
          <div class="lps-fc-name-row">
            <div class="lps-avatar sm">${avatarFor(f)}</div>
            <div class="lps-fc-name">${esc(f.display_name || 'کاربر')}</div>
            <div class="lps-fc-code" style="direction:ltr;">#${fa(f.user_code || '')}</div>
          </div>
          ${onlineDot(f)}
        </div>
        <div class="lps-fc-head">
          ${statusPill(f)}
          ${studyBox}
        </div>
        <div class="lps-fc-actions">
          <span class="lps-fc-elapsed">${f.status_started_at ? relTime(f.status_started_at) : ''}</span>
          <span class="lps-fc-last">آخرین: ${relTime(f.last_seen_at)}</span>
          <button class="btn icon-btn sm" title="پیام سریع" onclick="window.lpsQuickMotiv && lpsQuickMotiv('${esc(f.id)}')">💌</button>
          <button class="btn icon-btn sm" title="پروفایل" onclick="window.lpsOpenFriendProfile && lpsOpenFriendProfile('${esc(f.id)}')">👤</button>
        </div>
      </div>
    `;
  }

  function friendsHtml(st) {
    const friends = st.friends || [];
    const cat = ui.friendCategory || 'all';
    let list = friends;
    if (cat === 'studying') list = friends.filter(f => f.status_code === 'studying');
    else if (cat === 'resting') list = friends.filter(f => f.status_code === 'resting');
    else if (cat === 'other') list = friends.filter(f => f.status_code !== 'studying' && f.status_code !== 'resting' && f.is_online);
    else if (cat === 'offline') list = friends.filter(f => !f.is_online);

    return `
      <div class="lps-filter-bar">
        <div class="lps-icon-btn ${cat === 'all' ? 'active' : ''}" onclick="ui.friendCategory='all'; renderSocialHub()">همه ${fa(friends.length)}</div>
        <div class="lps-icon-btn ${cat === 'studying' ? 'active' : ''}" onclick="ui.friendCategory='studying'; renderSocialHub()">📖 مطالعه</div>
        <div class="lps-icon-btn ${cat === 'resting' ? 'active' : ''}" onclick="ui.friendCategory='resting'; renderSocialHub()">☕ استراحت</div>
        <div class="lps-icon-btn ${cat === 'other' ? 'active' : ''}" onclick="ui.friendCategory='other'; renderSocialHub()">سایر</div>
        <div class="lps-icon-btn ${cat === 'offline' ? 'active' : ''}" onclick="ui.friendCategory='offline'; renderSocialHub()">آفلاین</div>
        <div style="flex:1; min-width:140px;">
          <input type="search" id="lpsFriendSearch" placeholder="جست‌وجو با شناسه عددی…" oninput="clearTimeout(window._lpsSearch); window._lpsSearch=setTimeout(()=>{const v=document.getElementById('lpsFriendSearch').value; if(v) L.searchUserByNumericCode(v); else {L.state.searchResult=null; L.notifyUI();}},300)">
        </div>
        <div class="lps-icon-btn" id="lpsBtnSendRequest" title="ثبت‌نام/ورود برای استفاده از دوستان">${(!st.user || !st.profile) ? '🔒' : '➕'}</div>
      </div>

      ${st.searchBusy ? '<div style="padding:10px;">در حال جست‌وجو…</div>' : ''}
      ${st.searchResult && !st.searchResult.notFound ? friendCardHtml(Object.assign({}, st.searchResult.profile, { id: st.searchResult.id, user_code: st.searchResult.code, relationship: st.searchResult.relationship })) : ''}
      ${st.searchResult && st.searchResult.notFound ? '<div style="padding:10px;color:var(--txt-dim);">کاربری با این شناسه پیدا نشد.</div>' : ''}

      <div class="lps-friends-grid" id="lpsFriendsGrid">
        ${list.length ? list.map(f => friendCardHtml(f)).join('') : `<div class="muted" style="padding:18px; text-align:center;">هیچ دوستی در گروه «${cat}» یافت نشد.</div>`}
      </div>

      <div class="card" style="margin-top:14px;">
        <div class="card-head"><h3>📨 درخواست‌های دریافتی</h3></div>
        <div id="lpsIncoming" style="display:flex;flex-direction:column;gap:8px;">
          ${(st.incomingRequests || []).map(r => incomingRequestHtml(r)).join('') || '<div class="muted" style="padding:14px;">هیچ درخواستی نیست.</div>'}
        </div>
      </div>
      <div class="card" style="margin-top:14px;">
        <div class="card-head"><h3>📤 درخواست‌های ارسالی</h3></div>
        <div id="lpsOutgoing" style="display:flex;flex-direction:column;gap:8px;">
          ${(st.outgoingRequests || []).map(r => outgoingRequestHtml(r)).join('') || '<div class="muted" style="padding:14px;">هیچ درخواست ارسالی‌ای نیست.</div>'}
        </div>
      </div>
    `;
  }

  function incomingRequestHtml(r) {
    const p = r.profile || {};
    return `
      <div class="lps-friend-card" style="border-left:4px solid var(--neon);">
        <div class="lps-fc-name-row">${avatarFor(p)} <div class="lps-fc-name">${esc(p.display_name || 'کاربر')}</div><div class="lps-fc-code" style="direction:ltr;">#${fa(p.user_code || '')}</div></div>
        <div style="font-size:12px;color:var(--txt-dim); margin-top:6px;">درخواست دوستی فرستاده است · ${relTime(r.created_at)}</div>
        <div style="display:flex;gap:8px; margin-top:10px;">
          <button class="btn sm" onclick="L.respondFriendRequest('${esc(r.friendship_id)}', true)">قبول ✅</button>
          <button class="btn ghost sm" onclick="L.respondFriendRequest('${esc(r.friendship_id)}', false)">رد ❌</button>
        </div>
      </div>
    `;
  }

  function outgoingRequestHtml(r) {
    const p = r.profile || {};
    return `
      <div class="lps-friend-card">
        <div class="lps-fc-name-row">${avatarFor(p)} <div class="lps-fc-name">${esc(p.display_name || 'کاربر')}</div><div class="lps-fc-code" style="direction:ltr;">#${fa(p.user_code || '')}</div></div>
        <div style="font-size:12px;color:var(--txt-dim); margin-top:6px;">درخواست ارسال‌شده · ${relTime(r.created_at)}</div>
        <button class="btn ghost sm danger" style="margin-top:10px;" onclick="L.cancelOrRemoveFriendship('${esc(r.friendship_id)}', true)">لغو درخواست ↩️</button>
      </div>
    `;
  }

  function feedHtml(st) {
    return `
      <div class="lps-feed-head">
        <h2>📢 تایم‌لاین فعالیت</h2>
        <p class="muted">ف پوشش فعالیت‌های دوستان و ثبت نتیجه تست شخصی.</p>
      </div>

      <div class="card">
        <div class="card-head"><h3>📝 ثبت نتیجه تست</h3></div>
        <div id="lpsTestForm" style="padding:10px 14px; display:grid; grid-template-columns: 1fr 1fr; gap:10px; align-items:end;">
          <input type="text" id="lpsTestSubject" placeholder="درس (مثلاً ریاضی)" maxlength="80">
          <input type="text" id="lpsTestTopic" placeholder="مبحث (اختیاری)" maxlength="120">
          <input type="number" id="lpsTestTotal" placeholder="تعداد کل" min="1">
          <input type="number" id="lpsTestCorrect" placeholder="صحیح" min="0">
          <input type="number" id="lpsTestWrong" placeholder="غلط" min="0">
          <input type="number" id="lpsTestBlank" placeholder="نزده" min="0">
          <textarea id="lpsTestNotes" placeholder="یادداشت (اختیاری)" rows="1" style="grid-column: 1 / -1;"></textarea>
          <label style="display:flex; align-items:center; gap:6px; font-size:12px; justify-self:end;"><input type="checkbox" id="lpsTestShare" checked> به اشتراک در تایم‌لاین</label>
          <button class="btn" style="grid-column: 1 / -1; justify-self:end;" onclick="window.lpsSubmitTestResult && lpsSubmitTestResult()">ثبت و امتیاز 🎯</button>
          <div id="lpsTestPct" style="grid-column:1/-1; font-size:12.5px; font-weight:700; color:var(--neon); margin-top:6px;"></div>
        </div>
      </div>

      <div class="lps-feed-list" id="lpsFeedList">
        ${(st.activities || []).map(a => feedItemHtml(a, st)).join('') || '<div class="muted" style="padding:18px; text-align:center;">هنوز فعالیت برای نمایش نیست.</div>'}
      </div>
    `;
  }

  function feedItemHtml(a, st) {
    const author = a.author || {};
    const me = st.user ? st.user.id : '';
    const reacts = (st.reactionsByActivity || {})[a.id] || [];
    const myReact = reacts.find(r => r.sender_id === me);
    const now = relTime(a.created_at);
    return `
      <div class="lps-feed-item" id="lpsFeed-${a.id}">
        <div class="lps-feed-head">
          <div class="lps-feed-user">${avatarFor(author)} <span class="lps-feed-user-name">${esc(author.display_name || 'کاربر')}</span> <span style="direction:ltr;">#${fa(author.user_code || '')}</span></div>
          <span class="lps-feed-time">${now}</span>
        </div>
        <div style="font-size:14px; font-weight:700; margin:6px 0 2px;">${esc(a.title || '')}</div>
        ${a.subtitle ? `<div style="font-size:12.5px; color:var(--txt-dim); margin-bottom:6px;">${esc(a.subtitle)}</div>` : ''}
        <div class="lps-sticker-bar" id="lpsStick-${a.id}">
          ${STICKERS.map(s => `<span class="lps-sticker-btn ${myReact && myReact.sticker === s ? 'active' : ''}" title="${s}" onclick="window.lpsToggleReaction && lpsToggleReaction('${esc(a.id)}','${esc(author.id)}','${esc(s)}')">${s} <span class="lps-reaction-count" id="lpsRc-${a.id}-${esc(s)}">${fa(reacts.filter(r => r.sticker === s).length)}</span></span>`).join('')}
        </div>
      </div>
    `;
  }

  function roomsHtml(st) {
    const myRooms = (st.rooms || []).filter(r => (st.roomMembersByRoom[r.id] || []).some(m => m.user_id === st.user.id));
    return `
      <div class="lps-feed-head"><h2>🏠 Study Together — اتاق‌های مطالعه</h2><p class="muted">اتاق بساز، دوستان دعوت کن، هر عضو تایمر شخصی‌اش را دارد.</p></div>
      <div class="card" style="margin-bottom:14px;">
        <div class="card-head"><h3>ایجاد اتاق جدید</h3></div>
        <div style="padding:10px 14px; display:grid; grid-template-columns: 1fr 1fr auto; gap:8px; align-items:end;">
          <input type="text" id="lpsRoomName" placeholder="نام اتاق (مثلاً ریاضی Джеپان)">
          <input type="number" id="lpsRoomMinutes" placeholder="مدت (دقیقه)" min="5" max="480" value="50">
          <button class="btn" onclick="window.lpsCreateRoom && lpsCreateRoom()">ایجاد اتاق</button>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>اتاق‌های من</h3></div>
        <div id="lpsMyRooms" style="display:flex;flex-direction:column;gap:10px;">
          ${myRooms.length ? myRooms.map(r => roomCardHtml(r, st)).join('') : '<div class="muted" style="padding:14px;">هنوز اتاقی ندارید.</div>'}
        </div>
      </div>
    `;
  }

  function roomCardHtml(r, st) {
    const members = st.roomMembersByRoom[r.id] || [];
    const me = st.user ? st.user.id : '';
    const isCreator = r.created_by === me;
    const memHtml = members.map(m => {
      const p = m.profile || {};
      return `<span title="${esc(p.display_name || 'کاربر')}">${avatarFor(p, p.avatar_preset)} ${statusPill(p).replace('lps-status-pill','lps-status-pill sm')}</span>`;
    }).join('');
    return `
      <div class="lps-friend-card" style="border-left:4px solid #00e5ff;">
        <div class="lps-fc-name-row"><div class="lps-fc-name">${esc(r.name || 'اتاق')}</div><div style="direction:ltr;font-size:11px;">${esc(r.subject || 'بدون درس')}</div></div>
        <div style="font-size:12px;color:var(--txt-dim);">${relTime(r.created_at)} · ${fa(members.length)} عضو</div>
        <div style="margin-top:8px;">${memHtml}</div>
        <div style="display:flex;gap:6px; margin-top:10px;">
          ${!isCreator ? `<button class="btn ghost sm" onclick="window.lpsLeaveRoom && lpsLeaveRoom('${esc(r.id)}')">خروج</button>` : `<button class="btn ghost sm" onclick="window.lpsCloseRoom && lpsCloseRoom('${esc(r.id)}')">بستن اتاق</button>`}
          <button class="btn sm" onclick="window.lpsInviteToRoom && lpsInviteToRoom('${esc(r.id)}')">دعوت دوست</button>
        </div>
      </div>
    `;
  }

  function challengesHtml(st) {
    return `
      <div class="lps-feed-head"><h2>🏆 چالش‌های دوستانه</h2><p class="muted">چالش ۱対۱ یا گروهی بساز و پیشرفت را هم‌زمان ثبت کن.</p></div>
      <div class="card" style="margin-bottom:14px;">
        <div class="card-head"><h3>ایجاد چالش</h3></div>
        <div style="padding:10px 14px; display:grid; grid-template-columns: 1fr 1fr auto; gap:8px; align-items:end;">
          <input type="text" id="lpsChallengeName" placeholder="نام چالش (مثلاً ۵ روزه ریاضی)">
          <input type="number" id="lpsChallengeTarget" placeholder="هدف (دقیقه/تست)" min="1">
          <button class="btn" onclick="window.lpsCreateChallenge && lpsCreateChallenge()">ایجاد چالش</button>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>چالش‌های فعال</h3></div>
        <div id="lpsChallengesList" style="display:flex;flex-direction:column;gap:10px;">
          ${(st.challenges || []).map(c => challengeCardHtml(c, st)).join('') || '<div class="muted" style="padding:14px;">هیچ چالش فعال نیست.</div>'}
        </div>
      </div>
    `;
  }

  function challengeCardHtml(c, st) {
    const parts = st.challengePartsByChallenge[c.id] || [];
    const me = st.user ? st.user.id : '';
    const joined = parts.some(p => p.user_id === me);
    return `
      <div class="lps-friend-card">
        <div class="lps-fc-name-row"><div class="lps-fc-name">${esc(c.title || 'چالش')}</div><div style="direction:ltr;font-size:11px;">${esc(c.target_type || 'دقایق')}: ${fa(c.target_value || 0)}</div></div>
        <div style="font-size:12px;color:var(--txt-dim);">${fa(parts.length)} شرکت‌کننده · ${relTime(c.created_at)}</div>
        <div style="margin-top:10px;">
          ${joined ? `<button class="btn ghost sm" onclick="window.lpsLogProgress && lpsLogProgress('${esc(c.id)}')">ثبت پیشرفت من 📈</button>` : `<button class="btn sm" onclick="window.lpsAcceptChallenge && lpsAcceptChallenge('${esc(c.id)}')">مشارکت ✅</button>`}
        </div>
      </div>
    `;
  }

  function leaderboardHtml(st) {
    const period = st.leaderboardPeriod || 'week';
    return `
      <div class="lps-feed-head"><h2>📊 رتبه‌بندی دوستانه</h2><p class="muted">رتبه‌بندی اختیاری — می‌توانی از تنظیمات حذف-Shoma کنی.</p></div>
      <div class="card" style="margin-bottom:14px;">
        <div class="card-head"><h3>بازه‌بندی</h3></div>
        <div style="padding:10px 14px; display:flex; gap:8px; flex-wrap:wrap;">
          <div class="lps-icon-btn ${period === 'week' ? 'active' : ''}" onclick="ui.lbPeriod='week'; L.refreshLeaderboard('week'); renderSocialHub()">هفتگی</div>
          <div class="lps-icon-btn ${period === 'month' ? 'active' : ''}" onclick="ui.lbPeriod='month'; L.refreshLeaderboard('month'); renderSocialHub()">ماهانه</div>
          <div class="lps-icon-btn ${period === 'all' ? 'active' : ''}" onclick="ui.lbPeriod='all'; L.refreshLeaderboard('all'); renderSocialHub()">همه‌ازمان</div>
        </div>
      </div>
      <div class="card">
        <div id="lpsLeaderboardList" style="display:flex;flex-direction:column;gap:6px;">
          ${(st.leaderboard || []).map((e, i) => leaderboardRowHtml(e, i + 1, st)).join('') || '<div class="muted" style="padding:14px;">رتبه‌بندی برای نمایش نیست.</div>'}
        </div>
      </div>
    `;
  }

  function leaderboardRowHtml(e, rank, st) {
    const me = st.user ? st.user.id : '';
    const p = e.profile || {};
    const isMe = e.user_id === me || p.id === me;
    return `
      <div class="lps-lb-row ${isMe ? 'is-me' : ''}">
        <div class="lps-lb-rank">#${fa(rank)}</div>
        <div class="lps-avatar sm">${avatarFor(p)}</div>
        <div class="lps-lb-row-name">${esc(p.display_name || 'کاربر')}</div>
        <div class="lps-lb-row-value">${fa(e.study_minutes || 0)}d · ${fa(e.sessions_count || 0)}s · ${fa(e.tests_solved || 0)}t</div>
      </div>
    `;
  }

  function recapHtml(st) {
    return `
      <div class="lps-feed-head"><h2>📅 گزارش روزانه مطالعه</h2><p class="muted">جلسات، زمان مطالعه، تست‌ها، دستندها و نشان‌های روز.</p></div>
      <div class="card" style="margin-bottom:14px;">
        <div class="card-head"><h3>تاریخ</h3></div>
        <div style="padding:10px 14px; display:flex; gap:8px; align-items:center;">
          <input type="date" id="lpsRecapDate" value="${new Date().toISOString().slice(0,10)}">
          <button class="btn" onclick="window.lpsLoadRecap && lpsLoadRecap()">مشاهده گزارش</button>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>جمع‌بندی روز</h3></div>
        <div id="lpsRecapBody" style="padding:10px 14px;">
          ${(st.recaps || []).map(r => recapItemHtml(r)).join('') || '<div class="muted" style="padding:14px;">انتخاب تاریخ و بارگذاری گزارش.</div>'}
        </div>
      </div>
    `;
  }

  function recapItemHtml(r) {
    return `
      <div class="lps-friend-card">
        <div class="lps-fc-name-row"><div class="lps-fc-name">${esc(r.date || '')}</div></div>
        <div style="font-size:12.5px;">جلسات: ${fa(r.session_count || 0)} · زمان: ${fa(Math.round((r.total_minutes || 0) / 60))} ساعت · تست‌ها: ${fa(r.test_count || 0)} · میانگین: ${fa(r.avg_score || 0)}%</div>
        <div style="margin-top:8px;">${(r.badges || []).map(b => `<span class="lps-badge-ic">${esc(b.icon || '🏅')}</span>`).join('') || '<span class="muted">نشان جدیدی نیست</span>'}</div>
      </div>
    `;
  }

  function myProfileHtml(st) {
    const p = st.profile || {};
    return `
      <div class="lps-feed-head"><h2>👤 پروفایل اجتماعی من</h2><p class="muted">آمار، dustaوردها، حریم خصوصی و تنظیمات اعلان.</p></div>
      <div class="card" style="margin-bottom:14px;">
        <div class="card-head"><h3>شخصی‌سازی</h3></div>
        <div style="padding:10px 14px; display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
          <div class="lps-avatar lg" id="lpsProfileAvatar">${avatarFor(p)}</div>
          <div style="flex:1; min-width:200px;">
            <input type="text" id="lpsProfileName" value="${esc(p.display_name || '')}" placeholder="نام نمایشی">
            <div style="margin-top:8px; font-size:12px; color:var(--txt-dim); direction:ltr;">شناسه عددی (ثابت): #${fa(p.user_code || '')}</div>
          </div>
          <button class="btn" style="min-width:110px;" onclick="window.lpsSaveProfile && lpsSaveProfile()">ذخیره تغییرات</button>
        </div>
        <div style="padding:0 14px 14px; display:flex; gap:8px; flex-wrap:wrap;">
          ${Object.entries(AVATAR_PRESETS).map(([key, emoji]) => `<span class="lps-mood-chip ${p.avatar_preset === key ? 'selected' : ''}" title="${key}" onclick="window.lpsPickAvatar && lpsPickAvatar('${key}')">${emoji}</span>`).join('')}
          <label style="display:flex; align-items:center; gap:6px; font-size:12px; margin-left:auto;"><input type="file" id="lpsProfileFile" accept="image/*" style="display:none;"> <button class="btn ghost sm" type="button" onclick="document.getElementById('lpsProfileFile').click()">آپلود تصویر</button></label>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>آمار مطالعه</h3></div>
        <div class="grid g2" style="padding:10px 14px;">
          <div class="stat-card"><div class="ic">📖</div><div class="val num" id="lpsStatSessions">${fa(p.total_sessions || 0)}</div><div class="lbl">جلسات مطالعه</div></div>
          <div class="stat-card"><div class="ic">⏱️</div><div class="val num" id="lpsStatMinutes">${fa(Math.round((p.total_study_minutes || 0) / 60))}</div><div class="lbl">ساعت مطالعه</div></div>
          <div class="stat-card"><div class="ic">🔥</div><div class="val num" id="lpsStatStreak">${fa(p.current_streak || 0)}</div><div class="lbl">استمرار فعلی</div></div>
          <div class="stat-card"><div class="ic">👥</div><div class="val num" id="lpsStatFriends">${fa(p.friends_count || 0)}</div><div class="lbl">دوستان</div></div>
        </div>
        <div style="padding:0 14px 14px;">
          <div class="lps-badges-grid" id="lpsBadgesGrid">
            ${(st.myAchievements || []).map(ach => {
              const cat = L.ACHIEVEMENTS_CATALOG.find(c => c.key === ach.badge_key) || {};
              return `<div class="lps-badge-card unlocked"><div class="lps-badge-ic">${cat.icon || '🏅'}</div><div class="lps-badge-title">${esc(cat.title || ach.badge_key)}</div><div class="lps-badge-desc">${esc(cat.desc || '')}</div></div>`;
            }).join('') || '<div class="muted">هنوز نشانی کسب نکرده‌ای.</div>'}
          </div>
        </div>
      </div>
    `;
  }

  function settingsHtml(st) {
    const p = st.profile || {};
    const priv = p.privacy_settings || {};
    const notif = p.notification_settings || {};
    return `
      <div class="lps-feed-head"><h2>⚙️ تنظیمات اجتماعی</h2><p class="muted">حریم الخصوص، اعلان‌ها، کاربران مسدود شده و تور راهنما.</p></div>
      <div class="card">
        <div class="card-head"><h3>🔒 حریم خصوصی</h3></div>
        <div style="padding:10px 14px;">
          <label class="check-row"><input type="checkbox" id="lpsPrivAutoShare" ${(priv.auto_share_pomo !== false) ? 'checked' : ''} onchange="window.lpsTogglePriv && lpsTogglePriv('auto_share_pomo', this.checked)"> ⏱️ به‌روزرسانی خودکار وضعیت از تایمر شخصی</label>
          <label class="check-row"><input type="checkbox" id="lpsPrivShareMood" ${(priv.share_mood !== false) ? 'checked' : ''} onchange="window.lpsTogglePriv && lpsTogglePriv('share_mood', this.checked)"> 😎 به اشتراک گذاشتن حالت مطالعه</label>
          <label class="check-row"><input type="checkbox" id="lpsPrivShowAch" ${(priv.show_achievements !== false) ? 'checked' : ''} onchange="window.lpsTogglePriv && lpsTogglePriv('show_achievements', this.checked)"> 🏅 نمایش دستاوردها در پروفایل</label>
          <label class="check-row"><input type="checkbox" id="lpsPrivLeaderboard" ${(priv.leaderboard_opt_in !== false) ? 'checked' : ''} onchange="window.lpsTogglePriv && lpsTogglePriv('leaderboard_opt_in', this.checked)"> 📊 شرکت در جدول رتبه‌بندی</label>
        </div>
      </div>
      <div class="card" style="margin-top:14px;">
        <div class="card-head"><h3>🔔 اعلان‌ها</h3></div>
        <div style="padding:10px 14px;">
          <label class="check-row"><input type="checkbox" id="lpsNotifFriendReq" ${(notif.friend_requests !== false) ? 'checked' : ''} onchange="window.lpsToggleNotif && lpsToggleNotif('friend_requests', this.checked)"> 📨 درخواست دوستی</label>
          <label class="check-row"><input type="checkbox" id="lpsNotifMessage" ${(notif.messages !== false) ? 'checked' : ''} onchange="window.lpsToggleNotif && lpsToggleNotif('messages', this.checked)"> 💬 پیام جدید</label>
          <label class="check-row"><input type="checkbox" id="lpsNotifReaction" ${(notif.reactions !== false) ? 'checked' : ''} onchange="window.lpsToggleNotif && lpsToggleNotif('reactions', this.checked)"> ❤️ واکنش‌ها</label>
          <label class="check-row"><input type="checkbox" id="lpsNotifRoom" ${(notif.room_invites !== false) ? 'checked' : ''} onchange="window.lpsToggleNotif && lpsToggleNotif('room_invites', this.changed !== undefined ? this.checked : true)"> 🏠 دعوت به اتاق</label>
          <label class="check-row"><input type="checkbox" id="lpsNotifChallenge" ${(notif.challenges !== false) ? 'checked' : ''} onchange="window.lpsToggleNotif && lpsToggleNotif('challenges', this.checked)"> 🏆 چالش‌ها</label>
          <label class="check-row"><input type="checkbox" id="lpsNotifAch" ${(notif.achievements !== false) ? 'checked' : ''} onchange="window.lpsToggleNotif && lpsToggleNotif('achievements', this.checked)"> 🏅 دستاوردها</label>
        </div>
      </div>
      <div class="card" style="margin-top:14px;">
        <div class="card-head"><h3>🚫 کاربران مسدود شده</h3></div>
        <div style="padding:10px 14px;" id="lpsBlockedList">
          ${(st.blockedUsers || []).map(b => `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;"><span>${esc(b.blocked_display_name || b.blocked_id)} <span style="direction:ltr;">#${fa(b.blocked_user_code || '')}</span></span><button class="btn ghost sm" onclick="window.lpsUnblock && lpsUnblock('${esc(b.blocked_id)}')">رفع مسدودیت ✅</button></div>`).join('') || '<div class="muted" style="padding:14px;">هیچ کاربری مسدود نشده است.</div>'}
        </div>
      </div>
      <div class="card" style="margin-top:14px;">
        <div class="card-head"><h3>🎓 تور راهنمای بخش پومودوروی اجتماعی</h3></div>
        <p class="muted" style="padding:0 14px;">پредставن مختصری از تمام قابلیت‌های این بخش با Highlight بر روی هر قسمت.</p>
        <div style="padding:0 14px 14px;">
          <button class="btn" onclick="window.lpsStartTour && lpsStartTour()">شروع تور راهنما 🎓</button>
        </div>
      </div>
      <div class="card" style="margin-top:14px;">
        <div class="card-head"><h3>🚪 خروج از حساب اجتماعی</h3></div>
        <div style="padding:10px 14px;">
          <button class="btn danger" style="width:100%;" onclick="window.lpsSignOut && lpsSignOut()">خروج از حساب اجتماعی</button>
        </div>
      </div>
    `;
  }

  function chatHtml(st) {
    const friend = st.activeChatFriend;
    if (!friend) {
      return `
        <div class="lps-feed-head"><h2>💬 چت خصوصی</h2><p class="muted">یک دوست را از داشبورد انتخاب کنید تا چت باز شود.</p></div>
      `;
    }
    const msgs = st.chatMessages || [];
    return `
      <div class="lps-feed-head"><h2>💬 ${esc(friend.display_name || 'دوست')}</h2><button class="btn ghost sm" onclick="ui.activeChatFriend=null; renderSocialHub()">بازگشت</button></div>
      <div class="lps-chat-box" id="lpsChatBox">
        ${msgs.map(m => msgBubbleHtml(m, st.user ? st.user.id : '')).join('') || '<div class="muted" style="padding:14px; text-align:center;">هنوز پیام نیست.</div>'}
      </div>
      <div style="padding:8px 14px; display:flex; gap:8px;">
        <input type="text" id="lpsChatInput" placeholder="پیام…" maxlength="220" onkeydown="if(event.key==='Enter'){event.preventDefault(); window.lpsSendChat && lpsSendChat();}">
        <button class="btn" onclick="window.lpsSendChat && lpsSendChat()">ارسال</button>
        <div class="lps-quick-motiv-grid" id="lpsQuickMotivGrid">
          ${MOTIVATIONAL_PRESETS.map(m => `<button class="lps-quick-motiv-btn" onclick="window.lpsSendQuickMotiv && lpsSendQuickMotiv('${esc(m)}')">${m}</button>`).join('')}
        </div>
      </div>
    `;
  }

  function msgBubbleHtml(m, me) {
    const mine = m.sender_id === me;
    const isMotiv = m.msg_type === 'motivational';
    return `
      <div class="lps-msg-bubble ${mine ? 'mine' : 'theirs'} ${isMotiv ? 'is-motiv' : ''}">
        ${esc(m.content || '')}
        <div class="lps-msg-time">${relTime(m.created_at)}</div>
      </div>
    `;
  }

  /* ---------- auth screen ---------- */
  function authScreenHtml() {
    return `
      <div class="lps-root" id="lpsRoot">
        <div class="lps-hero-bar" style="flex-direction:column; text-align:center;">
          <div style="font-size:34px;">🎓</div>
          <div style="font-weight:800; font-size:17px;">بخش پومودوروی اجتماعی</div>
          <div class="muted" style="margin-top:6px;">با حساب اجتماعی، وضعیت و دستاوردها را با دوستان به اشتراک بگذار.</div>
        </div>
        <div class="card" style="max-width:420px; margin:0 auto;">
          <div class="card-head"><h3 id="lpsAuthTitle">ورود به حساب</h3></div>
          <div style="padding:10px 14px;">
            <input type="email" id="lpsAuthEmail" placeholder="ایمیل">
            <input type="password" id="lpsAuthPassword" placeholder="رمز عبور (کمیت ۶ کاراکتر)">
            <input type="text" id="lpsAuthName" placeholder="نام نمایشی" style="margin-top:8px;">
            <div style="margin-top:10px; display:flex; gap:8px;">
              <button class="btn" id="lpsAuthBtn">ورود</button>
              <button class="btn ghost" id="lpsAuthSwitch">ساخت حساب جدید</button>
            </div>
            <div id="lpsAuthMsg" style="margin-top:10px; font-size:12px; color:var(--txt-dim); min-height:16px;"></div>
          </div>
        </div>
        <div style="max-width:420px; margin:14px auto; text-align:center; font-size:12.5px; color:var(--txt-dim);">
          داده‌های شخصی (تسک‌ها، یادداشت‌ها، تایمر) هرگز آپلود نمی‌شوند — فقط اطلاعاتی که صراحتاً studies-sharing را بگزARNید.
        </div>
      </div>
    `;
  }

  function wireAuthEvents() {
    const mode = { isSignup: false };
    const title = byId('lpsAuthTitle');
    const btn = byId('lpsAuthBtn');
    const switchBtn = byId('lpsAuthSwitch');
    const nameInput = byId('lpsAuthName');
    const msg = byId('lpsAuthMsg');

    function setMode(signup) {
      mode.isSignup = signup;
      if (title) title.textContent = signup ? 'ساخت حساب اجتماعی' : 'ورود به حساب';
      if (btn) btn.textContent = signup ? 'ساخت حساب' : 'ورود';
      if (switchBtn) switchBtn.textContent = signup ? 'ieresی دارم حساب' : 'نامembership ندارم — ایجاد حساب';
      if (nameInput) nameInput.style.display = signup ? 'block' : 'none';
      if (msg) msg.textContent = '';
    }
    setMode(false);

    if (switchBtn) switchBtn.onclick = () => setMode(!mode.isSignup);
    if (btn) btn.onclick = async () => {
      const email = byId('lpsAuthEmail').value;
      const password = byId('lpsAuthPassword').value;
      const name = byId('lpsAuthName').value;
      if (!email || !password) { msg.textContent = 'ایمیل و رمز عبور را وارد کنید.'; return; }
      try {
        const res = mode.isSignup
          ? await L.signUpAccount({ email, password, displayName: name, avatarPreset: 'fox' })
          : await L.signInAccount({ email, password });
        if (res.ok) {
          msg.textContent = '';
          renderSocialHub();
        } else {
          msg.textContent = res.error?.message || 'خطا';
        }
      } catch (e) { msg.textContent = 'خطا در اتصال.'; }
    };
  }

  /* ---------- Pomodoro focus bridge strip (inside #pomoPane-focus) ---------- */
  function renderFocusStrip() {
    const pane = byId('pomoPane-focus');
    if (!pane) return;
    const st = L.state || {};
    const prof = st.profile || {};
    const authed = !!st.user && !!st.profile;
    const bridge = byId('lpsPomoBridge');
    if (!authed) {
      /* strip hidden when not logged into social */
      if (bridge) bridge.style.display = 'none';
      return;
    }
    const sync = st.prefs?.autoSyncPomo !== false;
    const htmlStr = `
      <div class="lps-pomo-bridge" id="lpsPomoBridge" style="display:block;">
        <div class="lps-pomo-bridge-top">
          <div class="lps-avatar sm">${avatarFor(prof)}</div>
          <div style="flex:1; min-width:0;">
            <div class="lps-me-name-row" style="font-size:13px;">
              <div class="lps-me-name">${esc(prof.display_name || 'شما')}</div>
              <span style="direction:ltr;">#${fa(prof.user_code || '')}</span>
            </div>
            <div class="lps-me-sub" style="font-size:12px;">${statusPill(prof)}</div>
          </div>
          <label class="check-row" style="font-size:12px; margin:0; cursor:pointer;"><input type="checkbox" id="lpsBridgeAutoSync" ${sync ? 'checked' : ''} onchange="window.lpsToggleAutoSync && lpsToggleAutoSync(this.checked)"> ⏱️ هم‌زمان‌سازی با تایمر</label>
        </div>
        <div class="lps-pomo-bridge-fields" id="lpsBridgeFields" style="${sync ? '' : 'opacity:0.5; pointer-events:none;'}">
          <input type="text" id="lpsBridgeSubject" placeholder="درس" value="${esc(st.prefs?.currentSubject || '')}" maxlength="80">
          <input type="text" id="lpsBridgeActivity" placeholder="نوع فعالیت" value="${esc(st.prefs?.currentActivityType || '')}" maxlength="60">
          <input type="text" id="lpsBridgeTopic" placeholder="مبحث" value="${esc(st.prefs?.currentTopic || '')}" maxlength="120">
          <div style="display:flex; align-items:center; gap:8px; font-size:12px;">
            <span>حالت:</span>
            ${STUDY_MOODS.map(m => `<span class="lps-mood-chip ${st.prefs?.currentMood === m.id ? 'selected' : ''}" onclick="window.lpsPickMood && lpsPickMood('${m.id}')">${m.emoji} ${esc(m.label)}</span>`).join('')}
            <label style="font-size:12px; margin-left:auto;"><input type="checkbox" id="lpsBridgeShareMood" ${(st.prefs?.shareMood ? 'checked' : '')} onchange="window.lpsToggleShareMood && lpsToggleShareMood(this.checked)"> به اشتراک</label>
          </div>
        </div>
        <div style="font-size:11.5px; color:var(--txt-dim); margin-top:6px; direction:ltr;">تایمر شخصی ادغ غیرفعال است — تنظیمات بالا فقط هنگام Social فعالرسل می‌شوند.</div>
      </div>
    `;
    if (bridge) {
      bridge.innerHTML = htmlStr;
      bridge.style.display = 'block';
    } else {
      pane.insertAdjacentHTML('afterbegin', htmlStr);
    }
    wireFocusBridgeEvents();
  }

  function wireFocusBridgeEvents() {
    ['lpsBridgeSubject','lpsBridgeActivity','lpsBridgeTopic'].forEach(id => {
      const el = byId(id);
      if (!el) return;
      el.oninput = () => {
        const subj = byId('lpsBridgeSubject').value;
        const act = byId('lpsBridgeActivity').value;
        const top = byId('lpsBridgeTopic').value;
        L.setManualStatus && L.setManualStatus({ statusCode: 'studying', subject: subj, activityType: act, topic: top, silent: true });
      };
    });
  }

  function lpsToggleAutoSync(checked) {
    L.saveLocalPrefs && (() => {})();
    const prefs = L.state?.prefs || {};
    prefs.autoSyncPomo = checked;
    L.saveLocalPrefs && L.saveLocalPrefs();
    byId('lpsBridgeFields').style.opacity = checked ? '' : '0.5';
    byId('lpsBridgeFields').style.pointerEvents = checked ? '' : 'none';
    toast(checked ? '⏱️ هم‌زمان‌سازی تایمر فعال شد' : '⏱️ هم‌زمان‌سازی تایمر غیرفعال شد');
  }

  function lpsPickMood(moodId) {
    L.setManualStatus && L.setManualStatus({ mood: moodId, shareMood: !!L.state?.prefs?.shareMood, silent: true });
    renderSocialHub();
  }

  function lpsToggleShareMood(checked) {
    const prefs = L.state?.prefs || {};
    prefs.shareMood = checked;
    L.saveLocalPrefs && L.saveLocalPrefs();
    L.setManualStatus && L.setManualStatus({ mood: prefs.currentMood || '', shareMood: checked, silent: true });
    toast(checked ? '😎 حالت مطالعه به اشتراک گذاشته می‌شود' : '🔒 حالت مطالعه privat است');
  }

  /* ---------- post-session prompt ---------- */
  window.lpsShowPostSessionPrompt = function ({ minutes, subject, activityType }) {
    const bar = byId('lpsPostSessionBar');
    if (bar) { bar.remove(); }
    const el = document.createElement('div');
    el.id = 'lpsPostSessionBar';
    el.className = 'card';
    el.style.cssText = 'margin-top:10px; border-left:4px solid var(--neon);';
    el.innerHTML = `
      <div style="padding:10px 14px; display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
        <div style="font-size:13px;">✅ جلسه ${fa(minutes || 0)} دقیقه‌ای ثبت شد${subject ? ` — درس ${esc(subject)}` : ''}.</div>
        <div style="flex:1;"></div>
        <button class="btn ghost sm" onclick="this.closest('#lpsPostSessionBar').remove()">بعداً</button>
        <button class="btn sm" onclick="window.lpsPickNextStatus && lpsPickNextStatus()">وضعیت بعدی</button>
      </div>
    `;
    const focusPane = byId('pomoPane-focus');
    if (focusPane) focusPane.appendChild(el);
    setTimeout(() => el.remove(), 20000);
  };

  window.lpsPickNextStatus = function () {
    const pane = byId('lpsStatusModal');
    openModal('lpsStatusModal');
    renderStatusModal();
  };

  /* ---------- status modal ---------- */
  function renderStatusModal() {
    const bg = byId('lpsStatusModal');
    if (!bg) return;
    const st = L.state || {};
    const prof = st.profile || {};
    const code = prof.status_code || 'free';
    let htmlStr = `
      <div class="modal">
        <h2>📋 وضعیت فعالیت</h2>
        <div style="padding:12px 16px; display:flex; flex-direction:column; gap:10px;">
          <div style="font-weight:700;">وضعیت فعلی: ${STATUS_META[code].label}</div>
          <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap:8px;">
            ${Object.values(STATUS_META).map(m => `<div class="lps-status-pill ${code === m.code ? 'selected' : ''}" data-st="${m.code}" onclick="window.lpsSetManualStatusQuick && lpsSetManualStatusQuick('${m.code}')">${m.emoji} ${m.label}</div>`).join('')}
          </div>
          <div style="font-size:12px; color:var(--txt-dim); margin-top:8px;">وضعیت مدتی: <input type="number" id="lpsTimedMinutes" placeholder="دقیقه (0 = روزانه)" min="0"> <button class="btn ghost sm" onclick="window.lpsSetTimedStatus && lpsSetTimedStatus()">اعمال</button></div>
        </div>
        <div class="modal-actions"><button class="btn ghost" onclick="closeModal('lpsStatusModal')">بستن</button></div>
      </div>
    `;
    html(bg, htmlStr);
    bg.style.display = 'flex';
  }

  window.lpsSetManualStatusQuick = function (statusCode) {
    L.setManualStatus && L.setManualStatus({ statusCode, silent: false });
    closeModal('lpsStatusModal');
    renderSocialHub();
  };

  window.lpsSetTimedStatus = function () {
    const mins = parseInt(byId('lpsTimedMinutes').value || '0', 10);
    const st = L.state || {};
    L.setManualStatus && L.setManualStatus({ statusCode: st.profile?.status_code || 'studying', durationMinutes: mins > 0 ? mins : 0, silent: false });
    closeModal('lpsStatusModal');
    renderSocialHub();
  };

  /* ---------- test result modal ---------- */
  window.lpsSubmitTestResult = function () {
    const subj = byId('lpsTestSubject').value;
    const topic = byId('lpsTestTopic').value;
    const total = byId('lpsTestTotal').value;
    const corr = byId('lpsTestCorrect').value;
    const wrong = byId('lpsTestWrong').value;
    const blank = byId('lpsTestBlank').value;
    const notes = byId('lpsTestNotes').value;
    const share = byId('lpsTestShare').checked;
    const pctEl = byId('lpsTestPct');
    const pct = L.calculateTestPercentage(total, corr, wrong, true);
    pctEl.textContent = `میانگین: ${fa(pct)}٪`;
    if (!subj || !total || parseInt(total, 10) < 1) { toast('درس و تعداد کل را مشخص کنید.'); return; }
    L.submitTestResult({ subject: subj, topic, totalQuestions: parseInt(total,10), correctCount: parseInt(corr||0,10), wrongCount: parseInt(wrong||0,10), blankCount: blank ? parseInt(blank,10) : undefined, notes, visibility: share ? 'friends' : 'private' });
  };

  window.lpsToggleReaction = function (activityId, targetUserId, sticker) {
    L.toggleActivityReaction && L.toggleActivityReaction(activityId, targetUserId, sticker);
  };

  /* ---------- friend profile modal ---------- */
  window.lpsOpenFriendProfile = async function (friendId) {
    await L.loadUserSocialProfileModal(friendId);
    openModal('lpsFriendProfileModal');
    renderFriendProfileModal();
  };

  function renderFriendProfileModal() {
    const bg = byId('lpsFriendProfileModal');
    const vp = L.state.viewingProfile;
    if (!bg || !vp) return;
    const p = vp.profile;
    html(bg, `
      <div class="modal" style="max-width:460px;">
        <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--line);">
          <div class="lps-avatar lg">${avatarFor(p)}</div>
          <div style="flex:1; min-width:0;">
            <div style="font-weight:800; font-size:16px;">${esc(p.display_name || 'کاربر')}</div>
            <div style="direction:ltr; font-size:13px; font-weight:800; color:var(--neon);">#${fa(p.user_code || '')}</div>
            ${statusPill(p)}
          </div>
        </div>
        <div style="padding:12px 16px;">
          <div style="font-size:12.5px; margin-bottom:8px;">دوستان: <span class="num" style="font-weight:700;">${fa(vp.friendsCount || 0)}</span> · آمار تست‌ها (آخرین ۸): ${vp.recentTests.length}</div>
          <div id="lpsFpBadges" style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">
            ${(vp.achievements || []).map(a => {
              const cat = L.ACHIEVEMENTS_CATALOG.find(c => c.key === a.badge_key) || {};
              return `<div style="display:flex;align-items:center;gap:6px;font-size:12.5px;"><span>${cat.icon || '🏅'}</span><span>${esc(cat.title || a.badge_key)}</span></div>`;
            }).join('') || '<span class="muted">نشان Нема</span>'}
          </div>
        </div>
        <div style="padding:0 16px 12px; display:flex; gap:6px;">
          ${vp.recentTests.length ? vp.recentTests.map(t => `<span style="font-size:11.5px; border:1px solid var(--line); border-radius:8px; padding:2px 8px;">${esc(t.subject || '')}: %${fa(t.score_percent || 0)}</span>`).join('') : ''}
        </div>
        <div class="modal-actions" style="justify-content:flex-end;">
          <button class="btn ghost" onclick="closeModal('lpsFriendProfileModal')">بستن</button>
        </div>
      </div>
    `);
  }

  /* ---------- quick motivational ---------- */
  window.lpsQuickMotiv = async function (friendId) {
    const prof = (L.state.friends || []).find(f => f.id === friendId) || (L.state.searchResult && L.state.searchResult.id === friendId ? L.state.searchResult.profile : null);
    if (!prof) { toast('دوست پیدا نشد.'); return; }
    const m = MOTIVATIONAL_PRESETS[Math.floor(Math.random() * MOTIVATIONAL_PRESETS.length)];
    await lpsSendMessageToFriend(friendId, m, 'motivational');
  };

  window.lpsSendQuickMotiv = async function (msg) {
    const friend = L.state.activeChatFriend;
    if (!friend) { toast('ابتدا یک دوست را برای چت انتخاب کنید.'); return; }
    await lpsSendMessageToFriend(friend.id, msg, 'motivational');
  };

  async function lpsSendMessageToFriend(friendId, content, msgType = 'chat') {
    await L.sendMessageToFriend(friendId, content, msgType);
    if (ui.activeChatFriend && ui.activeChatFriend.id === friendId) {
      await L.refreshNotifications && L.refreshNotifications();
      renderSocialHub();
    }
  }

  /* ---------- shell event wiring ---------- */
  function bindShellEvents() {
    const subnav = byId('lpsSubnav');
    if (subnav && !subnav._lpsWired) {
      subnav._lpsWired = true;
      subnav.addEventListener('click', (e) => {
        const t = e.target.closest('.lps-subtab');
        if (!t) return;
        ui.subView = t.dataset.sub;
        renderSocialHub();
      });
    }
    const btnStatus = byId('lpsBtnStatus');
    if (btnStatus && !btnStatus._lpsWired) {
      btnStatus._lpsWired = true;
      btnStatus.onclick = () => { ui.subView = 'home'; renderStatusModal(); };
    }
    const btnNotify = byId('lpsBtnNotify');
    if (btnNotify && !btnNotify._lpsWired) {
      btnNotify._lpsWired = true;
      btnNotify.onclick = () => { ui.subView = 'home'; renderNotificationsDrawer(); };
    }
    const btnMenu = byId('lpsBtnMenu');
    if (btnMenu && !btnMenu._lpsWired) {
      btnMenu._lpsWired = true;
      btnMenu.onclick = () => { /* subnav already visible */ };
    }
    const btnSignOut = byId('lpsBtnSignOut');
    if (btnSignOut && !btnSignOut._lpsWired) {
      btnSignOut._lpsWired = true;
      btnSignOut.onclick = () => { L.signOutAccount(); renderSocialHub(); };
    }
    const btnTour = byId('lpsBtnTourReplay');
    if (btnTour && !btnTour._lpsWired) {
      btnTour._lpsWired = true;
      btnTour.onclick = () => { window.lpsStartTour && lpsStartTour(); };
    }
  }

  function wireSubviewEvents(v) {
    if (v === 'rooms') {
      const createRoomBtn = document.querySelector('button[onclick*="lpsCreateRoom"]');
      // handlers wired via global functions below
    }
  }

  /* ---------- global action bridges (called from HTML onclick) ---------- */
  window.lpsCreateRoom = async function () {
    const name = byId('lpsRoomName').value;
    const mins = parseInt(byId('lpsRoomMinutes').value || '50', 10);
    if (!name) { toast('نام اتاق را وارد کنید.'); return; }
    await L.createStudyRoom({ name, targetMinutes: mins });
    byId('lpsRoomName').value = '';
    renderSocialHub();
  };

  window.lpsLeaveRoom = async function (roomId) {
    await L.leaveOrCloseRoom(roomId, false);
    renderSocialHub();
  };

  window.lpsCloseRoom = async function (roomId) {
    await L.leaveOrCloseRoom(roomId, true);
    renderSocialHub();
  };

  window.lpsInviteToRoom = async function (roomId) {
    const friends = L.state.friends || [];
    const f = friends[0];
    if (!f) { toast('هیچ donate برای دعوت وجود ندارد.'); return; }
    await L.inviteFriendToRoom(roomId, f.id, byId('lpsRoomName')?.value || 'اتاق');
    toast('دعوت ارسال شد.');
  };

  window.lpsCreateChallenge = async function () {
    const name = byId('lpsChallengeName').value;
    const target = parseInt(byId('lpsChallengeTarget').value || '60', 10);
    if (!name) { toast('نام چالش را وارد کنید.'); return; }
    await L.createChallenge({ title: name, target_type: 'minutes', target_value: target });
    byId('lpsChallengeName').value = '';
    renderSocialHub();
  };

  window.lpsAcceptChallenge = async function (challengeId) {
    await L.acceptChallengeInvite(challengeId);
    renderSocialHub();
  };

  window.lpsLogProgress = async function (challengeId) {
    const amt = prompt('چند دقیقه یافتها را ثبت می‌کنید؟', '30');
    if (amt === null) return;
    await L.logManualChallengeProgress(challengeId, parseInt(amt, 10) || 0);
    renderSocialHub();
  };

  window.lpsLoadRecap = async function () {
    const date = byId('lpsRecapDate').value;
    if (!date) return;
    await L.refreshDailyRecaps(date);
    renderSocialHub();
  };

  window.lpsSaveProfile = async function () {
    const name = byId('lpsProfileName').value;
    const file = byId('lpsProfileFile').files?.[0];
    let avatarUrl;
    if (file) avatarUrl = await L.uploadAvatarFile(file);
    await L.updateMyProfile({ display_name: name, avatar_url: avatarUrl });
    renderSocialHub();
  };

  window.lpsPickAvatar = async function (preset) {
    await L.updateMyProfile({ avatar_preset: preset });
    renderSocialHub();
  };

  window.lpsTogglePriv = async function (key, value) {
    await L.updateMyProfile({ privacy_settings: { [key]: value } });
    renderSocialHub();
  };

  window.lpsToggleNotif = async function (key, value) {
    await L.updateMyProfile({ notification_settings: { [key]: value } });
    renderSocialHub();
  };

  window.lpsUnblock = async function (targetId) {
    await L.unblockUser(targetId);
    renderSocialHub();
  };

  window.lpsSignOut = async function () {
    await L.signOutAccount();
    renderSocialHub();
  };

  window.lpsStartTour = function () {
    window.lpsTourStart && lpsTourStart();
  };

  /* ---------- notifications drawer ---------- */
  function renderNotificationsDrawer() {
    const box = byId('lpsSubview');
    if (!box) return;
    $$('.lps-subtab', box.parentElement.parentElement).forEach(t => t.classList.remove('active'));
    const notifs = (L.state.notifications || []).slice(0, 30);
    html(box, `
      <div class="lps-feed-head"><h2>🔔 اعلان‌ها</h2></div>
      <div style="padding:0 14px 14px;">
        ${notifs.map(n => `
          <div class="lps-friend-card" style="padding:10px;">
            <div style="font-weight:700; font-size:13.5px;">${esc(n.title || '')}</div>
            <div style="font-size:12.5px; color:var(--txt-dim); margin-top:4px;">${esc(n.body || '')}</div>
            <div style="font-size:11.5px; color:var(--txt-dim2); margin-top:6px;">${relTime(n.created_at)} ${n.is_read ? '' : ' • جدید'}</div>
          </div>
        `).join('') || '<div class="muted" style="padding:14px;">هیچ اعلانی نیست.</div>'}
      </div>
      <div style="padding:0 14px 14px; display:flex;justify-content:flex-end;"><button class="btn ghost sm" onclick="window.lpsMarkNotifsRead && lpsMarkNotifsRead()">筴 همه خوانده شده</button></div>
    `);
  }

  window.lpsMarkNotifsRead = async function () {
    await L.markAllNotificationsRead();
    renderSocialHub();
  };

  /* ---------- chat wiring ---------- */
  window.lpsSendChat = async function () {
    const input = byId('lpsChatInput');
    const friend = L.state.activeChatFriend;
    if (!friend || !input.value.trim()) return;
    const content = input.value.trim();
    input.value = '';
    await L.sendMessageToFriend(friend.id, content, 'chat');
    renderSocialHub();
  };

  window.lpsOpenChatWithFriend = function (friend) {
    L.state.activeChatFriend = friend;
    ui.subView = 'chat';
    renderSocialHub();
  };

  /* wire friend-card chat: replace the message button to open chat */
  function wireSubviewEvents(v) {
    if (v === 'friends') {
      $$('.lps-friend-card').forEach(card => {
        const btn = card.querySelector('button[title="پیام سریع"]');
        if (btn && !btn._lpsChatWired) {
          btn._lpsChatWired = true;
          btn.onclick = (e) => {
            e.stopPropagation();
            const id = card.id.replace('lpsFc-', '');
            const f = (L.state.friends || []).find(x => x.id === id);
            if (f) { ui.activeChatFriend = f; ui.subView = 'chat'; renderSocialHub(); }
          };
        }
      });
    }
  }

  /* ---------- expose helpers on window (used by HTML inline handlers) ---------- */
  window.renderSocialHub = renderSocialHub;
  window.lpsToggleAutoSync = lpsToggleAutoSync;
  window.lpsPickMood = lpsPickMood;
  window.lpsToggleShareMood = lpsToggleShareMood;

  /* ---------- init: subscribe & render bridge strip ---------- */
  function onStateChange() {
    if (!ui.mounted) return;
    const pane = byId('pomoPane-social');
    if (pane && pane.querySelector('.lps-root')) renderSocialHub();
    renderFocusStrip();
  }

  L.subscribeUI(onStateChange);

  /* render focus strip whenever pomodoro pane is shown */
  const origShowPomoTab = window.showPomoTab;
  window.showPomoTab = function (tab) {
    if (typeof origShowPomoTab === 'function') origShowPomoTab(tab);
    if (tab === 'focus') renderFocusStrip();
  };

  /* mount bridge strip on existing focus pane if already rendered */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { renderFocusStrip(); });
  } else {
    setTimeout(() => renderFocusStrip(), 100);
  }

})();
