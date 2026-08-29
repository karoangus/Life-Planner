/* ============================================================
   Life Planner — Pomodoro (Focus To-Do style sessions & cycles,
   realistic procedural Web Audio ambient sounds, Focus Mode,
   real-time minute tracking, hours/minutes statistics)
   Load order: after core.js + enhancements.js.
   Self-contained IIFE — does not add unnecessary globals.
   ============================================================ */

/* ============ POMODORO v11.0 (Focus To-Do Edition) ============ */
(function(){
  const PRESETS = [
    { id:'classic', label:'کلاسیک', focus:25, break:5, icon:'🍅' },
    { id:'short',   label:'کوتاه',   focus:15, break:3, icon:'⚡' },
    { id:'deep',    label:'دیپ فوکوس', focus:50, break:10, icon:'🧠' },
    { id:'study',   label:'مطالعه', focus:45, break:10, icon:'📚' }
  ];

  const SOUNDS = [
    { id:'off',    label:'🔇 خاموش',            icon:'🔇' },
    { id:'rain',   label:'🌧️ باران و رعد آرام',  icon:'🌧️' },
    { id:'forest', label:'🌲 جنگل و پرندگان',    icon:'🌲' },
    { id:'cafe',   label:'☕ کافه دنج',          icon:'☕' },
    { id:'ocean',  label:'🌊 امواج دریا',        icon:'🌊' },
    { id:'fire',   label:'🔥 آتش و شومینه',      icon:'🔥' },
    { id:'clock',  label:'⏰ تیک‌تاک ساعت',      icon:'⏰' },
    { id:'space',  label:'🌌 فضای تمرکز عمیق',   icon:'🌌' }
  ];

  function ensure(){
    if(!DB.pomodoro || typeof DB.pomodoro!=='object'){
      DB.pomodoro = {
        settings: { focusMin:25, breakMin:5, longBreakMin:15, cycleCount:4, goalMinutes:0 },
        session: null,
        history: {},
        pendingNext: null
      };
    }
    if(!DB.pomodoro.settings) DB.pomodoro.settings = { focusMin:25, breakMin:5, longBreakMin:15, cycleCount:4, goalMinutes:0 };
    if(DB.pomodoro.settings.longBreakMin===undefined) DB.pomodoro.settings.longBreakMin = 15;
    if(DB.pomodoro.settings.cycleCount===undefined) DB.pomodoro.settings.cycleCount = 4;
    if(!Array.isArray(DB.pomodoro.sessionHistory)) DB.pomodoro.sessionHistory = [];
    if(!DB.pomodoro.presets) DB.pomodoro.presets = PRESETS.map(x=>({...x}));
    if(!DB.pomodoro.presetId) DB.pomodoro.presetId = 'classic';
    if(!DB.pomodoro.sound) DB.pomodoro.sound = 'off';
    if(DB.pomodoro.soundVolume === undefined) DB.pomodoro.soundVolume = 0.6;
    if(DB.pomodoro.notifications === undefined) DB.pomodoro.notifications = true;
    if(DB.pomodoro.focusStreak === undefined) DB.pomodoro.focusStreak = 0;
    if(DB.pomodoro.lastFocusDate === undefined) DB.pomodoro.lastFocusDate = '';
    if(DB.pomodoro.currentSession === undefined) DB.pomodoro.currentSession = 1;
    if(DB.pomodoro.currentRound === undefined) DB.pomodoro.currentRound = 1;
  }
  ensure();

  function getSound(){ return DB.pomodoro?.sound || 'off'; }
  function getSoundVolume(){ return typeof DB.pomodoro?.soundVolume === 'number' ? DB.pomodoro.soundVolume : 0.6; }

  /* -------------------------------------------------------------
     PERSISTENT DURATION FORMATTERS (Hours + Minutes in Persian)
  ------------------------------------------------------------- */
  function formatPomoTimeFa(minutes){
    const m = Math.max(0, Math.round(Number(minutes) || 0));
    if(m === 0) return '۰ دقیقه';
    if(m < 60) return `${m} دقیقه`;
    const h = Math.floor(m / 60);
    const remM = m % 60;
    if(remM === 0) return `${h} ساعت`;
    return `${h} ساعت و ${remM} دقیقه`;
  }
  function formatPomoHours(minutes){
    const m = Math.max(0, Number(minutes) || 0);
    const h = Math.round((m / 60) * 10) / 10;
    return `${h}h`;
  }
  window.formatPomoTimeFa = formatPomoTimeFa;
  window.formatPomoHours = formatPomoHours;

  /* -------------------------------------------------------------
     TASK HELPERS & POMODORO COUNT
  ------------------------------------------------------------- */
  function taskOptions(){
    const tasks = (DB.tasks || []).filter(t => !t.done);
    return '<option value="">🎯 فوکوس آزاد (بدون تسک)</option>' +
      tasks.slice().sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')).map(t => {
        const count = t.pomodorosCount ? ` (🍅 ${t.pomodorosCount})` : '';
        const dt = t.date ? ` • ${esc(t.date)}` : '';
        return `<option value="${esc(t.id)}">${esc(t.title||t.text||'بدون عنوان')}${count}${dt}</option>`;
      }).join('');
  }

  function selectedTask(){
    const id = document.getElementById('pomo66Task')?.value || '';
    return id ? ((DB.tasks||[]).find(t=>String(t.id)===String(id)) || null) : null;
  }

  function getTaskLabel(id){
    if(!id) return 'فوکوس آزاد';
    const t = (DB.tasks||[]).find(x => String(x.id) === String(id));
    return t ? (t.title || t.text || 'تسک') : 'فوکوس آزاد';
  }

  /* -------------------------------------------------------------
     HIGH-QUALITY PROCEDURAL WEB AUDIO ENGINE (Realistic & 100% Offline)
  ------------------------------------------------------------- */
  let audio = null;
  let audioKind = 'off';
  let audioIntervals = [];

  function safeDisconnect(node){ try{ node?.disconnect?.(); }catch(_){} }

  function stopSound(){
    audioIntervals.forEach(id => { try{ clearInterval(id); }catch(_){} });
    audioIntervals = [];
    try{
      if(audio){
        if(audio.gain && audio.ctx && audio.ctx.state !== 'closed'){
          audio.gain.gain.setTargetAtTime(0.0001, audio.ctx.currentTime, 0.05);
        }
        if(audio.nodes) audio.nodes.forEach(n => { try{ n.stop?.(); }catch(_){} safeDisconnect(n); });
        if(audio.ctx && audio.ctx.state !== 'closed') audio.ctx.close().catch(()=>{});
      }
    }catch(_){}
    audio = null;
    audioKind = 'off';
  }

  function createNoiseBuffer(ctx, seconds = 3, type = 'pink'){
    const sampleRate = ctx.sampleRate || 44100;
    const len = Math.max(1, Math.floor(sampleRate * seconds));
    const buf = ctx.createBuffer(1, len, sampleRate);
    const data = buf.getChannelData(0);

    if(type === 'pink'){
      // Paul Kellet's filtered pink noise algorithm
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for(let i=0; i<len; i++){
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
    } else if(type === 'brown'){
      let last = 0;
      for(let i=0; i<len; i++){
        const white = Math.random() * 2 - 1;
        last = (last + (0.02 * white)) / 1.02;
        data[i] = last * 3.5;
      }
    } else {
      for(let i=0; i<len; i++){
        data[i] = (Math.random() * 2 - 1) * 0.5;
      }
    }
    return buf;
  }

  function addNoiseLoop(ctx, dest, nodes, opts = {}){
    const src = ctx.createBufferSource();
    src.buffer = opts.buffer || createNoiseBuffer(ctx, opts.seconds || 3, opts.noiseType || 'pink');
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = opts.filterType || 'lowpass';
    filter.frequency.value = opts.freq || 2000;
    filter.Q.value = opts.q || 0.5;
    const gain = ctx.createGain();
    gain.gain.value = opts.gain || 0.1;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    src.start();
    nodes.push(src, filter, gain);
    return { src, filter, gain };
  }

  function addTone(ctx, dest, nodes, freq, gainVal, type='sine'){
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = gainVal;
    osc.connect(gain);
    gain.connect(dest);
    osc.start();
    nodes.push(osc, gain);
    return { osc, gain };
  }

  async function startSound(kind){
    stopSound();
    if(!kind || kind === 'off') return false;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if(!Ctx) return false;
      const ctx = new Ctx();
      if(ctx.state === 'suspended') await ctx.resume().catch(()=>{});

      const master = ctx.createGain();
      const currentVol = getSoundVolume();
      master.gain.setValueAtTime(0.0001, ctx.currentTime);
      master.gain.linearRampToValueAtTime(Math.max(0.01, currentVol * 0.18), ctx.currentTime + 0.15);
      master.connect(ctx.destination);

      const nodes = [];

      if(kind === 'rain'){
        // Realistic soothing rain: Pink noise bed + droplet patters + distant low thunder
        addNoiseLoop(ctx, master, nodes, { noiseType:'pink', filterType:'lowpass', freq:2200, gain:0.35 });
        addNoiseLoop(ctx, master, nodes, { noiseType:'white', filterType:'highpass', freq:900, gain:0.04 });
        addNoiseLoop(ctx, master, nodes, { noiseType:'brown', filterType:'lowpass', freq:380, gain:0.18 });

        // Gentle droplet scheduler
        const rainInt = setInterval(()=>{
          if(!audio || ctx.state === 'closed') return;
          try {
            const now = ctx.currentTime;
            const drop = ctx.createOscillator();
            const dropGain = ctx.createGain();
            const freq = 2200 + Math.random() * 2600;
            drop.type = 'sine';
            drop.frequency.setValueAtTime(freq, now);
            drop.frequency.exponentialRampToValueAtTime(freq * 0.6, now + 0.035);
            dropGain.gain.setValueAtTime(0.0001, now);
            dropGain.gain.exponentialRampToValueAtTime(0.012 + Math.random() * 0.015, now + 0.005);
            dropGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
            drop.connect(dropGain);
            dropGain.connect(master);
            drop.start(now);
            drop.stop(now + 0.045);
          }catch(_){}
        }, 85);
        audioIntervals.push(rainInt);

      } else if(kind === 'forest'){
        // Forest canopy breeze + procedural birdsong
        const wind = addNoiseLoop(ctx, master, nodes, { noiseType:'brown', filterType:'bandpass', freq:520, q:0.6, gain:0.25 });
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = 0.08;
        lfoGain.gain.value = 160;
        lfo.connect(wind.filter.frequency);
        lfo.start();
        nodes.push(lfo, lfoGain);

        // Procedural birdsong chirps
        const birdInt = setInterval(()=>{
          if(!audio || ctx.state === 'closed') return;
          try {
            if(Math.random() < 0.65){
              const count = 1 + Math.floor(Math.random() * 3);
              for(let i=0; i<count; i++){
                const t = ctx.currentTime + i * 0.12;
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                const baseF = 2800 + Math.random() * 1200;
                osc.type = 'sine';
                osc.frequency.setValueAtTime(baseF, t);
                osc.frequency.linearRampToValueAtTime(baseF + 800, t + 0.04);
                osc.frequency.exponentialRampToValueAtTime(baseF - 300, t + 0.09);
                g.gain.setValueAtTime(0.0001, t);
                g.gain.exponentialRampToValueAtTime(0.025, t + 0.015);
                g.gain.exponentialRampToValueAtTime(0.0001, t + 0.095);
                osc.connect(g);
                g.connect(master);
                osc.start(t);
                osc.stop(t + 0.1);
              }
            }
          }catch(_){}
        }, 3400);
        audioIntervals.push(birdInt);

      } else if(kind === 'cafe'){
        // Cozy Cafe: warm room murmur + subtle porcelain cup clinks
        addNoiseLoop(ctx, master, nodes, { noiseType:'pink', filterType:'bandpass', freq:650, q:0.8, gain:0.28 });
        addNoiseLoop(ctx, master, nodes, { noiseType:'brown', filterType:'lowpass', freq:400, gain:0.22 });
        addTone(ctx, master, nodes, 98, 0.01, 'sine');

        // Occasional ceramic cup clink
        const cafeInt = setInterval(()=>{
          if(!audio || ctx.state === 'closed') return;
          try {
            if(Math.random() < 0.5){
              const t = ctx.currentTime;
              const osc = ctx.createOscillator();
              const g = ctx.createGain();
              osc.type = 'sine';
              osc.frequency.setValueAtTime(2850, t);
              g.gain.setValueAtTime(0.0001, t);
              g.gain.exponentialRampToValueAtTime(0.018, t + 0.008);
              g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
              osc.connect(g);
              g.connect(master);
              osc.start(t);
              osc.stop(t + 0.24);
            }
          }catch(_){}
        }, 4800);
        audioIntervals.push(cafeInt);

      } else if(kind === 'ocean'){
        // Ocean waves: Dual LFO wave swell
        const oceanNoise = addNoiseLoop(ctx, master, nodes, { noiseType:'pink', filterType:'lowpass', freq:450, q:0.7, gain:0.3 });
        const swellLfo = ctx.createOscillator();
        const swellGain = ctx.createGain();
        swellLfo.frequency.value = 0.09; // ~11s wave cycle
        swellGain.gain.value = 420;
        swellLfo.connect(oceanNoise.filter.frequency);
        swellLfo.start();
        nodes.push(swellLfo, swellGain);

        const foamNoise = addNoiseLoop(ctx, master, nodes, { noiseType:'white', filterType:'highpass', freq:850, gain:0.02 });
        const foamLfo = ctx.createOscillator();
        foamLfo.frequency.value = 0.09;
        foamLfo.connect(foamNoise.gain.gain);
        foamLfo.start();
        nodes.push(foamLfo);

      } else if(kind === 'fire'){
        // Campfire: Warm flame roar + randomized crackle impulses
        addNoiseLoop(ctx, master, nodes, { noiseType:'brown', filterType:'lowpass', freq:260, gain:0.32 });
        addNoiseLoop(ctx, master, nodes, { noiseType:'pink', filterType:'bandpass', freq:750, q:0.5, gain:0.12 });

        const fireInt = setInterval(()=>{
          if(!audio || ctx.state === 'closed') return;
          try {
            if(Math.random() < 0.75){
              const now = ctx.currentTime;
              const crackle = ctx.createBufferSource();
              crackle.buffer = createNoiseBuffer(ctx, 0.04, 'white');
              const filt = ctx.createBiquadFilter();
              filt.type = 'bandpass';
              filt.frequency.value = 1600 + Math.random() * 3200;
              filt.Q.value = 3.5;
              const g = ctx.createGain();
              g.gain.setValueAtTime(0.0001, now);
              g.gain.exponentialRampToValueAtTime(0.03 + Math.random() * 0.04, now + 0.003);
              g.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);
              crackle.connect(filt);
              filt.connect(g);
              g.connect(master);
              crackle.start(now);
              crackle.stop(now + 0.03);
            }
          }catch(_){}
        }, 90);
        audioIntervals.push(fireInt);

      } else if(kind === 'clock'){
        // Mechanical clock: Tick-Tock on alternating seconds
        let tickCount = 0;
        const clockInt = setInterval(()=>{
          if(!audio || ctx.state === 'closed') return;
          try {
            const now = ctx.currentTime;
            const isTick = tickCount % 2 === 0;
            tickCount++;
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(isTick ? 1420 : 1080, now);
            osc.frequency.exponentialRampToValueAtTime(200, now + 0.025);
            g.gain.setValueAtTime(0.0001, now);
            g.gain.exponentialRampToValueAtTime(isTick ? 0.045 : 0.035, now + 0.003);
            g.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
            osc.connect(g);
            g.connect(master);
            osc.start(now);
            osc.stop(now + 0.035);
          }catch(_){}
        }, 1000);
        audioIntervals.push(clockInt);

      } else if(kind === 'space'){
        // Deep Space: Alpha harmonic drone (108Hz, 162Hz, 216Hz, 324Hz)
        addTone(ctx, master, nodes, 108, 0.032, 'sine');
        addTone(ctx, master, nodes, 162, 0.022, 'sine');
        addTone(ctx, master, nodes, 216, 0.016, 'sine');
        addTone(ctx, master, nodes, 324, 0.008, 'triangle');

        const spaceLfo = ctx.createOscillator();
        const spaceGain = ctx.createGain();
        spaceLfo.frequency.value = 0.04;
        spaceGain.gain.value = 0.01;
        spaceLfo.connect(master.gain);
        spaceLfo.start();
        nodes.push(spaceLfo, spaceGain);
      }

      audio = { ctx, nodes, gain: master };
      audioKind = kind;
      return true;
    } catch(e) {
      audio = null;
      audioKind = 'off';
      return false;
    }
  }

  function setSoundVolume(val){
    const v = Math.max(0, Math.min(1, Number(val)));
    DB.pomodoro.soundVolume = v;
    save();
    if(audio && audio.gain && audio.ctx){
      try {
        audio.gain.gain.setTargetAtTime(Math.max(0.0001, v * 0.18), audio.ctx.currentTime, 0.08);
      }catch(_){}
    }
  }
  window.setPomoSoundVolume = setSoundVolume;

  async function restartSoundFromGesture(kind){
    const ok = await startSound(kind);
    if(!ok && kind !== 'off') toast('⚠️ صدای محیط در این مرورگر در دسترس نیست');
    return ok;
  }

  /* -------------------------------------------------------------
     REAL-TIME MINUTE & CYCLE CALCULATIONS
  ------------------------------------------------------------- */
  function getPomoMinuteInfo(s){
    if(!s) return { currentMin:0, totalMin:0, remMin:0, pct:0, isInfinite:false, elapsedMins:0 };
    if(s.mode === 'infinite'){
      const elapsed = (s.baseElapsedMs || 0) + (s.status === 'running' ? Date.now() - s.startAt : 0);
      const elapsedMins = Math.floor(elapsed / 60000);
      const currentMin = elapsedMins + 1;
      return { currentMin, totalMin: 0, remMin: 0, pct: 0, isInfinite: true, elapsedMins };
    }
    const totalMs = s.totalMs || ((s.mode === 'focus' ? (DB.pomodoro.settings.focusMin || 25) : (DB.pomodoro.settings.breakMin || 5)) * 60000);
    const totalMin = Math.max(1, Math.round(totalMs / 60000));
    const remainMs = s.status === 'running' ? Math.max(0, s.endAt - Date.now()) : (s.remainingMs || 0);
    const elapsedMs = Math.max(0, totalMs - remainMs);
    const currentMin = Math.min(totalMin, Math.floor(elapsedMs / 60000) + 1);
    const remMin = Math.max(0, Math.ceil(remainMs / 60000));
    const pct = Math.max(0, Math.min(100, (elapsedMs / totalMs) * 100));
    return { currentMin, totalMin, remMin, pct, isInfinite: false, elapsedMins: Math.floor(elapsedMs / 60000) };
  }

  function getCycleState(){
    ensure();
    const cycleCount = DB.pomodoro.settings.cycleCount || 4;
    const currentSession = Math.max(1, Math.min(cycleCount, DB.pomodoro.currentSession || 1));
    const currentRound = Math.max(1, DB.pomodoro.currentRound || 1);
    return { currentSession, currentRound, cycleCount };
  }

  function renderCycleDotsHtml(currentSession, cycleCount, isBreak = false){
    const dots = [];
    for(let i = 1; i <= cycleCount; i++){
      if(i < currentSession){
        dots.push(`<span class="pomo-dot done" title="جلسه ${i} کامل شده">🍅</span>`);
      } else if(i === currentSession){
        dots.push(`<span class="pomo-dot active" title="جلسه کنونی ${i}">${isBreak ? '☕' : '⏱️'}</span>`);
      } else {
        dots.push(`<span class="pomo-dot pending" title="جلسه ${i}">⚪</span>`);
      }
    }
    return dots.join('');
  }

  /* -------------------------------------------------------------
     MAIN POMODORO VIEW RENDERERS
  ------------------------------------------------------------- */
  function renderMainSessionBadge(){
    ensure();
    const { currentSession, currentRound, cycleCount } = getCycleState();
    const s = DB.pomodoro.session;
    const isBreak = s?.mode === 'break';

    // Check if session elements exist or create them
    let badge = document.getElementById('pomoSessionBadge');
    if(!badge){
      const hero = document.querySelector('.pomo-hero');
      if(hero){
        badge = document.createElement('div');
        badge.id = 'pomoSessionBadge';
        badge.className = 'pomo-session-badge';
        hero.insertBefore(badge, hero.firstChild);
      }
    }
    if(badge){
      const titleText = isBreak
        ? (s?.isLongBreak ? `🏖️ دور ${currentRound} • استراحت طولانی` : `☕ دور ${currentRound} • استراحت جلسه ${currentSession} از ${cycleCount}`)
        : `🍅 دور ${currentRound} • جلسه ${currentSession} از ${cycleCount}`;
      badge.innerHTML = `
        <div class="pomo-session-title" id="pomoSessionTitle">${titleText}</div>
        <div class="pomo-dots-row" id="pomoSessionDots">${renderCycleDotsHtml(currentSession, cycleCount, isBreak)}</div>
      `;
    }

    // Real-time minute badge on main view
    let minBadge = document.getElementById('pomoMinuteBadge');
    if(!minBadge){
      const circle = document.getElementById('pomoCircle');
      if(circle && circle.parentNode){
        minBadge = document.createElement('div');
        minBadge.id = 'pomoMinuteBadge';
        minBadge.className = 'pomo-minute-badge';
        circle.parentNode.insertBefore(minBadge, circle.nextSibling);
      }
    }
    if(minBadge){
      if(!s){
        minBadge.textContent = `🍅 جلسه ${currentSession} از ${cycleCount} آماده شروع`;
      } else {
        const info = getPomoMinuteInfo(s);
        if(info.isInfinite){
          minBadge.textContent = `♾️ دقیقه ${info.currentMin} فوکوس آزاد`;
        } else if(s.mode === 'break'){
          minBadge.textContent = `☕ دقیقه ${info.currentMin} از ${info.totalMin} استراحت`;
        } else {
          minBadge.textContent = `⏱️ دقیقه ${info.currentMin} از ${info.totalMin} (${info.remMin} دقیقه باقی‌مانده)`;
        }
      }
    }
  }

  function renderFocusTools(){
    const root = document.getElementById('pomoV66FocusTools');
    if(!root) return;
    ensure();
    const activePreset = DB.pomodoro.presetId || 'classic';
    const vol = getSoundVolume();

    root.innerHTML = `
      <div class="pomo-v66-row">
        <div class="pomo-v66-card">
          <div class="pomo-v66-title">⚡ حالت‌های آماده فوکوس</div>
          <div class="pomo-v66-help">یک مدل انتخاب کن تا زمان فوکوس و استراحت طبق ریتم تنظیم بشه.</div>
          <div class="pomo-preset-grid">
            ${PRESETS.map(x=>`<button type="button" class="pomo-preset ${x.id===activePreset?'active':''}" data-pomo-preset="${x.id}">${x.icon} ${x.label}<small>${x.focus}/${x.break} دقیقه</small></button>`).join('')}
          </div>
          <div style="margin-top:12px;display:flex;justify-content:space-between;align-items:center;">
            <button type="button" class="btn ghost btn-sm" id="pomoResetCycleBtn" style="font-size:11px;padding:5px 10px;">🔄 شروع مجدد دور</button>
            <button type="button" class="btn ghost btn-sm" id="pomoNextSessionBtn" style="font-size:11px;padding:5px 10px;">⏭️ جلسه بعدی</button>
          </div>
        </div>
        <div class="pomo-v66-card">
          <div class="pomo-v66-title">🎯 تسک و محیط فوکوس</div>
          <div class="pomo-v66-help">تسک مورد نظرت رو انتخاب کن و با صدای محیط در آرامش کار کن.</div>
          <select id="pomo66Task" class="pomo-select">${taskOptions()}</select>
          <div style="margin-top:10px;display:grid;gap:8px;">
            <div class="pomo-sound-row">
              <select id="pomo66Sound" class="pomo-sound-select">
                ${SOUNDS.map(x=>`<option value="${x.id}" ${x.id===getSound()?'selected':''}>${x.label}</option>`).join('')}
              </select>
              <div class="pomo-vol-wrap" title="بلندی صدای محیط">
                <span>🔊</span>
                <input type="range" id="pomo66Volume" min="0" max="1" step="0.05" value="${vol}" class="pomo-vol-slider">
              </div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:4px;">
              <span class="pomo-v66-mini">🔔 نوتیفیکیشن هوشمند فعاله</span>
              <button type="button" class="btn" id="pomo66FocusMode" style="background:var(--grad);">🧠 حالت تمرکز تمام‌صفحه</button>
            </div>
          </div>
        </div>
      </div>`;

    root.querySelectorAll('[data-pomo-preset]').forEach(b => b.onclick = () => applyPreset(b.dataset.pomoPreset));
    const taskEl = document.getElementById('pomo66Task');
    if(taskEl) taskEl.value = DB.pomodoro.session?.taskId || DB.pomodoro.lastTaskId || '';
    taskEl?.addEventListener('change', () => {
      DB.pomodoro.lastTaskId = taskEl.value || '';
      if(DB.pomodoro.session) DB.pomodoro.session.taskId = taskEl.value || '';
      save();
      renderPomoV66();
    });

    document.getElementById('pomo66Sound')?.addEventListener('change', async e => {
      DB.pomodoro.sound = e.target.value;
      save();
      if(e.target.value === 'off') stopSound();
      else await restartSoundFromGesture(e.target.value);
    });

    document.getElementById('pomo66Volume')?.addEventListener('input', e => {
      setSoundVolume(e.target.value);
    });

    document.getElementById('pomo66FocusMode')?.addEventListener('click', openFocusMode);

    document.getElementById('pomoResetCycleBtn')?.addEventListener('click', () => {
      DB.pomodoro.currentSession = 1;
      save();
      toast('🔄 دور پومودورو به جلسه ۱ بازنشانی شد');
      renderPomoV66();
    });

    document.getElementById('pomoNextSessionBtn')?.addEventListener('click', () => {
      const cycleCount = DB.pomodoro.settings.cycleCount || 4;
      DB.pomodoro.currentSession = (DB.pomodoro.currentSession % cycleCount) + 1;
      if(DB.pomodoro.currentSession === 1) DB.pomodoro.currentRound = (DB.pomodoro.currentRound || 1) + 1;
      save();
      toast(`⏭️ رفتیم به جلسه ${DB.pomodoro.currentSession} از ${cycleCount}`);
      renderPomoV66();
    });
  }

  function applyPreset(id){
    const p = PRESETS.find(x => x.id === id);
    if(!p) return;
    if(DB.pomodoro.session){
      toast('⏱️ در حال اجرای تایمر امکان تغییر حالت نیست');
      return;
    }
    DB.pomodoro.presetId = id;
    DB.pomodoro.settings.focusMin = p.focus;
    DB.pomodoro.settings.breakMin = p.break;
    save();
    fillPomoSettingsForm();
    renderPomoUI();
    renderPomoV66();
    toast(`✅ ${p.label}: ${p.focus} دقیقه فوکوس / ${p.break} دقیقه استراحت`);
  }

  function scoreForSession(minutes, planned, pauseCount, completed){
    const early = Math.max(0, planned - minutes);
    const earlyPenalty = planned ? Math.min(45, (early / planned) * 50) : 0;
    const pausePenalty = Math.min(25, (pauseCount || 0) * 7);
    const completionBonus = completed ? 5 : 0;
    return Math.max(0, Math.min(100, Math.round(100 - earlyPenalty - pausePenalty + completionBonus)));
  }

  function updateStreak(){
    const dates = [...new Set((DB.pomodoro.sessionHistory || []).filter(x => x.mode === 'focus' && x.minutes > 0).map(x => x.date))].sort().reverse();
    let streak = 0, cur = todayISO();
    for(const d of dates){
      if(d === cur){
        streak++;
        const dt = new Date(cur);
        dt.setDate(dt.getDate() - 1);
        cur = dateToLocalISO(dt);
      } else if(streak === 0){
        const dt = new Date(cur);
        dt.setDate(dt.getDate() - 1);
        if(d === dateToLocalISO(dt)){
          streak++;
          cur = d;
          const dt2 = new Date(cur);
          dt2.setDate(dt2.getDate() - 1);
          cur = dateToLocalISO(dt2);
        } else break;
      } else break;
    }
    DB.pomodoro.focusStreak = streak;
    DB.pomodoro.lastFocusDate = dates[0] || '';
  }

  function recordSession(mode, minutes, meta = {}){
    if(!minutes || minutes < 1) return 0;
    const date = meta.date || todayISO();
    const startedAt = meta.startedAt || (Date.now() - minutes * 60000);
    const endedAt = meta.endedAt || Date.now();
    let score = 0;
    if(mode === 'focus'){
      score = scoreForSession(minutes, meta.plannedMinutes || minutes, meta.pauseCount || 0, !!meta.completed);
      DB.pomodoro.sessionHistory.unshift({
        id: meta.manualId || uid(),
        date,
        mode: 'focus',
        minutes,
        plannedMinutes: meta.plannedMinutes || minutes,
        taskId: meta.taskId || '',
        sessionNum: meta.sessionNum || DB.pomodoro.currentSession || 1,
        roundNum: meta.roundNum || DB.pomodoro.currentRound || 1,
        startedAt,
        endedAt,
        pauseCount: meta.pauseCount || 0,
        score,
        note: meta.note || '',
        source: meta.source || 'pomodoro'
      });
      DB.pomodoro.sessionHistory = DB.pomodoro.sessionHistory.slice(0, 500);
      if(meta.taskId){
        const t = (DB.tasks || []).find(x => String(x.id) === String(meta.taskId));
        if(t){
          t.pomodoroMinutes = (t.pomodoroMinutes || 0) + minutes;
          t.pomodorosCount = (t.pomodorosCount || 0) + 1;
          t.lastPomodoroAt = endedAt;
        }
      }
      updateStreak();
    }
    addPomoMinutes(mode, minutes, date);
    if(mode === 'focus' && date === todayISO() && typeof checkPomoGoalBonus === 'function') checkPomoGoalBonus();
    if(date === todayISO()) checkPerfectDay();
    save();
    renderPomoV66();
    return score;
  }
  window.recordPomoSession = recordSession;
  window.renderPomoV66 = renderPomoV66;

  /* -------------------------------------------------------------
     SESSION RESULT & BREAK MODALS
  ------------------------------------------------------------- */
  function showResult(data){
    let el = document.getElementById('pomo66Result');
    if(!el){
      el = document.createElement('div');
      el.id = 'pomo66Result';
      el.className = 'pomo-result-modal';
      document.body.appendChild(el);
    }
    const isFocus = data.mode === 'focus';
    const task = data.task ? (DB.tasks || []).find(t => String(t.id) === String(data.task)) : null;
    const taskName = task ? (task.title || task.text) : 'فوکوس آزاد';
    const taskDoneBtn = (task && !task.done)
      ? `<button class="btn ghost btn-sm" id="pomo66CompleteTaskBtn" style="margin-top:8px;width:100%;justify-content:center;">✅ ثبت انجام تسک: ${esc(taskName)}</button>`
      : '';

    el.innerHTML = `
      <div class="pomo-result-box" dir="rtl">
        <div style="font-size:12px;color:var(--txt-dim2);font-weight:800;text-align:center;">🎉 پایان جلسه ${data.sessionNum || 1} از ${data.cycleCount || 4}</div>
        <div class="pomo-result-score">${data.score}/100</div>
        <div style="text-align:center;font-size:14px;font-weight:900;margin-top:-2px;">${formatPomoTimeFa(data.minutes)} ${isFocus ? 'فوکوس موفق 🎯' : 'استراحت ☕'}</div>
        <div class="pomo-v66-help" style="text-align:center;margin-top:6px;">${esc(taskName)} ${isFocus ? '· امتیاز تمرکز ثبت شد' : ''}</div>
        ${taskDoneBtn}
        <div class="settings-actions" style="margin-top:14px;">
          <button class="btn" id="pomo66ResultOk" style="width:100%;justify-content:center;">بریم برای مرحله بعد 🚀</button>
        </div>
      </div>`;

    el.classList.add('open');
    document.getElementById('pomo66ResultOk').onclick = () => el.classList.remove('open');

    const doneBtn = document.getElementById('pomo66CompleteTaskBtn');
    if(doneBtn && task){
      doneBtn.onclick = () => {
        toggleTask(task.id);
        doneBtn.textContent = '✅ تسک با موفقیت انجام شد!';
        doneBtn.disabled = true;
        doneBtn.style.opacity = '0.7';
      };
    }
  }

  function showBreakModal(isLong = false, breakMinutes = 5){
    let el = document.getElementById('pomo66Break');
    if(!el){
      el = document.createElement('div');
      el.id = 'pomo66Break';
      el.className = 'pomo-break-modal';
      document.body.appendChild(el);
    }
    const title = isLong ? '🏖️ وقت استراحت طولانی' : '☕ وقت استراحت کوتاه';
    const desc = isLong
      ? `تبریک! یک دور کامل از جلسات فوکوس رو با موفقیت پشت سر گذاشتی. حالا ${breakMinutes} دقیقه با خیال راحت استراحت کن تا کاملاً شارژ بشی.`
      : `${breakMinutes} دقیقه استراحت یعنی واقعاً چند دقیقه ذهنت رو از کار جدا کنی؛ یک دور کوتاه راه برو یا آب بخور.`;

    el.innerHTML = `
      <div class="pomo-break-box" dir="rtl">
        <div class="pomo-v66-title">${title}</div>
        <div class="pomo-v66-help">${desc}</div>
        <div class="pomo-break-list">
          <div class="pomo-break-tip">🚶 یک دور کوتاه راه برو</div>
          <div class="pomo-break-tip">💧 یک لیوان آب بخور</div>
          <div class="pomo-break-tip">👀 به دوردست نگاه کن</div>
          <div class="pomo-break-tip">🧘 نفس عمیق و کشش</div>
        </div>
        <div class="settings-actions">
          <button class="btn" id="pomo66StartBreak">${isLong ? '🏖️ شروع استراحت طولانی' : '☕ شروع استراحت'}</button>
          <button class="btn ghost" id="pomo66SkipBreak">⏭️ رد کردن و جلسه بعد</button>
        </div>
      </div>`;

    el.classList.add('open');
    document.getElementById('pomo66StartBreak').onclick = () => {
      el.classList.remove('open');
      if(typeof pomoQuickStart === 'function') pomoQuickStart();
    };
    document.getElementById('pomo66SkipBreak').onclick = () => {
      el.classList.remove('open');
      advanceSessionAfterBreak();
      save();
      renderPomoUI();
      renderPomoV66();
    };
  }

  function advanceSessionAfterBreak(wasLong = false){
    ensure();
    const cycleCount = DB.pomodoro.settings.cycleCount || 4;
    if(wasLong || DB.pomodoro.currentSession >= cycleCount){
      DB.pomodoro.currentSession = 1;
      DB.pomodoro.currentRound = (DB.pomodoro.currentRound || 1) + 1;
    } else {
      DB.pomodoro.currentSession = (DB.pomodoro.currentSession || 1) + 1;
    }
    DB.pomodoro.pendingNext = 'focus';
  }

  /* -------------------------------------------------------------
     FULLSCREEN FOCUS MODE OVERLAY (Polished, Responsive & Bug-Free)
  ------------------------------------------------------------- */
  let focusFullscreenRequested = false;

  function setFocusUiOpen(open){
    document.documentElement.classList.toggle('pomo-focus-open', open);
    document.body.classList.toggle('pomo-focus-open', open);
  }

  async function requestFocusFullscreen(el){
    if(!el) return false;
    try {
      if(document.fullscreenElement === el) return true;
      if(typeof el.requestFullscreen !== 'function') return false;
      focusFullscreenRequested = true;
      await el.requestFullscreen({ navigationUI: 'hide' }).catch(()=>{});
      return document.fullscreenElement === el;
    } catch(e){
      return false;
    }
  }

  function closeFocusMode(){
    const el = document.getElementById('pomo66FocusOverlay');
    if(!el) return;
    el.classList.remove('open');
    setFocusUiOpen(false);
    try {
      if(document.fullscreenElement === el || document.webkitFullscreenElement === el){
        document.exitFullscreen?.().catch(()=>{});
      }
    } catch(_){}
    focusFullscreenRequested = false;
    renderPomoV66();
  }

  function toggleFullscreenFocusMode(){
    const el = document.getElementById('pomo66FocusOverlay');
    if(!el) return;
    if(document.fullscreenElement || document.webkitFullscreenElement){
      document.exitFullscreen?.().catch(()=>{});
    } else {
      requestFocusFullscreen(el);
    }
  }

  function openFocusMode(){
    let el = document.getElementById('pomo66FocusOverlay');
    if(!el){
      el = document.createElement('div');
      el.id = 'pomo66FocusOverlay';
      el.className = 'pomo-focus-overlay';
      el.innerHTML = `
        <div class="pomo-focus-inner" dir="rtl">
          <div class="pomo-focus-topbar">
            <div class="pomo-focus-badge" id="pomo66FocusCycleBadge">🍅 دور ۱ • جلسه ۱ از ۴</div>
            <div class="pomo-focus-top-actions">
              <button type="button" class="pomo-focus-icon-btn" id="pomo66FocusFullscreenBtn" title="تمام‌صفحه">⛶</button>
              <button type="button" class="pomo-focus-icon-btn" id="pomo66FocusExit" title="خروج">✕</button>
            </div>
          </div>

          <div class="pomo-focus-dots-row" id="pomo66FocusDots"></div>

          <div class="pomo-focus-circle-wrap">
            <div class="pomo-focus-mode" id="pomo66FocusModeText">🎯 فوکوس</div>
            <div class="pomo-focus-time" id="pomo66FocusTime">25:00</div>
            <div class="pomo-focus-minute-badge" id="pomo66FocusMinuteBadge">⏱️ دقیقه ۱ از ۲۵</div>
          </div>

          <div class="pomo-focus-task-card">
            <span class="pomo-focus-task-icon">🎯</span>
            <span class="pomo-focus-task-name" id="pomo66FocusTask">فوکوس آزاد</span>
          </div>

          <div class="pomo-focus-progress">
            <div id="pomo66FocusProgress"></div>
          </div>

          <div class="pomo-focus-actions">
            <button class="btn" id="pomo66FocusAction">⏸️ مکث</button>
            <button class="btn ghost danger" id="pomo66FocusEnd">⏹️ پایان و ثبت</button>
          </div>

          <div class="pomo-focus-sound-bar">
            <span class="pomo-focus-sound-lbl">🎧 صدای محیط:</span>
            <select id="pomo66FocusSoundSelect" class="pomo-focus-sound-sel">
              ${SOUNDS.map(x=>`<option value="${x.id}" ${x.id===getSound()?'selected':''}>${x.label}</option>`).join('')}
            </select>
            <div class="pomo-vol-wrap" style="flex:1;max-width:140px;">
              <span>🔊</span>
              <input type="range" id="pomo66FocusVolume" min="0" max="1" step="0.05" value="${getSoundVolume()}" class="pomo-vol-slider" title="بلندی صدا">
            </div>
          </div>
        </div>`;
      document.body.appendChild(el);

      document.getElementById('pomo66FocusExit').onclick = closeFocusMode;
      document.getElementById('pomo66FocusFullscreenBtn').onclick = toggleFullscreenFocusMode;

      document.getElementById('pomo66FocusAction').onclick = () => {
        const s = DB.pomodoro.session;
        if(!s){
          pomoQuickStart();
        } else if(s.status === 'running'){
          pauseSession();
        } else if(s.status === 'paused'){
          resumeSession();
        }
        renderFocusOverlay();
      };

      document.getElementById('pomo66FocusEnd').onclick = () => {
        endSession();
      };

      document.getElementById('pomo66FocusSoundSelect')?.addEventListener('change', async e => {
        DB.pomodoro.sound = e.target.value;
        save();
        if(e.target.value === 'off') stopSound();
        else await restartSoundFromGesture(e.target.value);
        renderFocusTools();
      });

      document.getElementById('pomo66FocusVolume')?.addEventListener('input', e => {
        setSoundVolume(e.target.value);
        const mainVol = document.getElementById('pomo66Volume');
        if(mainVol) mainVol.value = e.target.value;
      });
    }

    el.classList.add('open');
    setFocusUiOpen(true);
    renderFocusOverlay();
    requestFocusFullscreen(el);
  }

  if(!window.__pomoFocusFullscreenBound){
    window.__pomoFocusFullscreenBound = true;
    document.addEventListener('fullscreenchange', () => {
      const el = document.getElementById('pomo66FocusOverlay');
      if(!el || !el.classList.contains('open')) return;
      if(!document.fullscreenElement && !document.webkitFullscreenElement){
        if(focusFullscreenRequested){
          focusFullscreenRequested = false;
          return;
        }
      }
    });
  }

  function renderFocusOverlay(){
    const s = DB.pomodoro.session;
    const el = document.getElementById('pomo66FocusOverlay');
    if(!el || !el.classList.contains('open')) return;

    const tm = document.getElementById('pomo66FocusTime');
    const task = document.getElementById('pomo66FocusTask');
    const mode = document.getElementById('pomo66FocusModeText');
    const bar = document.getElementById('pomo66FocusProgress');
    const act = document.getElementById('pomo66FocusAction');
    const cycleBadge = document.getElementById('pomo66FocusCycleBadge');
    const dotsRow = document.getElementById('pomo66FocusDots');
    const minBadge = document.getElementById('pomo66FocusMinuteBadge');

    const { currentSession, currentRound, cycleCount } = getCycleState();
    const isBreak = s?.mode === 'break';

    if(cycleBadge){
      cycleBadge.textContent = isBreak
        ? (s?.isLongBreak ? `🏖️ دور ${currentRound} • استراحت طولانی` : `☕ دور ${currentRound} • استراحت جلسه ${currentSession} از ${cycleCount}`)
        : `🍅 دور ${currentRound} • جلسه ${currentSession} از ${cycleCount}`;
    }
    if(dotsRow){
      dotsRow.innerHTML = renderCycleDotsHtml(currentSession, cycleCount, isBreak);
    }

    if(!s){
      tm.textContent = '00:00';
      mode.textContent = 'آماده‌ی شروع فوکوس';
      task.textContent = DB.pomodoro.lastTaskId ? getTaskLabel(DB.pomodoro.lastTaskId) : 'فوکوس آزاد';
      if(minBadge) minBadge.textContent = `🍅 جلسه ${currentSession} از ${cycleCount} آماده شروع`;
      bar.style.width = '0%';
      act.textContent = '▶️ شروع فوکوس';
      return;
    }

    const info = getPomoMinuteInfo(s);

    if(s.mode === 'infinite'){
      const elapsed = (s.baseElapsedMs || 0) + (s.status === 'running' ? Date.now() - s.startAt : 0);
      tm.textContent = fmtMMSS(elapsed);
      mode.textContent = '♾️ فوکوس بی‌نهایت';
      if(minBadge) minBadge.textContent = `♾️ دقیقه ${info.currentMin} فوکوس آزاد`;
      bar.style.width = '100%';
    } else {
      const remainMs = s.status === 'running' ? Math.max(0, s.endAt - Date.now()) : (s.remainingMs || 0);
      tm.textContent = fmtMMSS(remainMs);
      mode.textContent = s.mode === 'focus'
        ? `🎯 جلسه ${currentSession} از ${cycleCount} • فوکوس`
        : (s.isLongBreak ? '🏖️ استراحت طولانی' : '☕ استراحت کوتاه');
      if(minBadge){
        minBadge.textContent = s.mode === 'focus'
          ? `⏱️ دقیقه ${info.currentMin} از ${info.totalMin} (${info.remMin} دقیقه باقی‌مانده)`
          : `☕ دقیقه ${info.currentMin} از ${info.totalMin} استراحت`;
      }
      bar.style.width = `${info.pct}%`;
    }

    task.textContent = s.taskId ? getTaskLabel(s.taskId) : 'فوکوس آزاد';
    act.textContent = s.status === 'running' ? '⏸️ مکث' : '▶️ ادامه';
  }

  /* -------------------------------------------------------------
     POMODORO STATISTICS (Hours & Minutes Formatting)
  ------------------------------------------------------------- */
  function renderStatsTools(){
    const root = document.getElementById('pomoV66StatsTools');
    if(!root) return;
    ensure();

    const hist = (DB.pomodoro.sessionHistory || []).filter(x => x.mode === 'focus' && x.minutes > 0);
    const totalMins = hist.reduce((a,x) => a + x.minutes, 0);
    const avg = hist.length ? Math.round(hist.reduce((a,x) => a + x.score, 0) / hist.length) : 0;
    const { currentSession, currentRound, cycleCount } = getCycleState();

    root.innerHTML = `
      <div class="pomo-v66-card">
        <div class="pomo-v66-title">📈 جمع‌بندی فوکوس (دقیقه و ساعت)</div>
        <div class="pomo-v66-help">آمار جامع فوکوس بر اساس جلسات واقعی پومودورو:</div>
        <div class="pomo-stat-grid">
          <div class="pomo-stat-mini">
            <div class="n">${formatPomoHours(totalMins)}</div>
            <div class="l">${formatPomoTimeFa(totalMins)}</div>
          </div>
          <div class="pomo-stat-mini">
            <div class="n">${hist.length}</div>
            <div class="l">جلسات کامل</div>
          </div>
          <div class="pomo-stat-mini">
            <div class="n">${avg || 0}</div>
            <div class="l">میانگین کیفیت</div>
          </div>
          <div class="pomo-stat-mini">
            <div class="n">🔥 ${DB.pomodoro.focusStreak || 0}</div>
            <div class="l">استریک روزانه</div>
          </div>
        </div>
      </div>
      <div class="pomo-v66-card">
        <div class="pomo-v66-title">🕘 تاریخچه جلسات اخیر</div>
        <div id="pomo66HistoryList"></div>
      </div>`;

    const list = document.getElementById('pomo66HistoryList');
    const recent = hist.slice(0, 10);
    list.innerHTML = recent.length ? recent.map(x => {
      const taskName = x.taskId ? getTaskLabel(x.taskId) : 'فوکوس آزاد';
      const durationFormatted = formatPomoTimeFa(x.minutes);
      return `
        <div class="pomo-history-item">
          <div class="pomo-history-main">
            <div class="pomo-history-name">🎯 ${esc(taskName)}</div>
            <div class="pomo-history-meta">${durationFormatted} (${x.minutes}m) · ${esc(x.date)} · ${x.pauseCount || 0} مکث</div>
          </div>
          <div class="pomo-history-score">${x.score}/100</div>
        </div>`;
    }).join('') : '<div class="muted" style="padding:10px 0;">هنوز جلسه کاملی ثبت نشده.</div>';
  }

  function renderPomoV66(){
    ensure();
    renderMainSessionBadge();
    renderFocusTools();
    renderStatsTools();
    renderFocusOverlay();
  }

  /* -------------------------------------------------------------
     GLOBAL ACTION OVERRIDES FOR SMOOTH FOCUS TO-DO FLOW
  ------------------------------------------------------------- */
  const oldStartFocus = window.startFocus;
  const oldStartBreak = window.startBreak;
  const oldPause = window.pauseSession;
  const oldResume = window.resumeSession;
  const oldEnd = window.endSession;
  const oldComplete = window.completePomoSession;

  window.startFocus = function(){
    ensure();
    const task = selectedTask();
    const { currentSession, currentRound, cycleCount } = getCycleState();
    const focusMin = DB.pomodoro.settings.focusMin || 25;

    DB.pomodoro.session = {
      mode: 'focus',
      status: 'running',
      startAt: Date.now(),
      endAt: Date.now() + focusMin * 60000,
      totalMs: focusMin * 60000,
      taskId: task?.id || DB.pomodoro.lastTaskId || '',
      sessionNum: currentSession,
      roundNum: currentRound,
      pauseCount: 0,
      plannedMinutes: focusMin
    };
    DB.pomodoro.lastTaskId = task?.id || DB.pomodoro.lastTaskId || '';
    save();
    restartSoundFromGesture(getSound());
    if(DB.pomodoro.notifications){
      sendNotification('🍅 فوکوس شروع شد', task ? `🎯 ${task.title||task.text}` : `جلسه ${currentSession} از ${cycleCount} شروع شد 💪`);
    }
    renderPomoUI();
    renderPomoV66();
  };

  window.startBreak = function(isLong = false){
    ensure();
    const { currentSession, currentRound, cycleCount } = getCycleState();
    const breakMin = isLong ? (DB.pomodoro.settings.longBreakMin || 15) : (DB.pomodoro.settings.breakMin || 5);

    DB.pomodoro.session = {
      mode: 'break',
      status: 'running',
      isLongBreak: isLong,
      startAt: Date.now(),
      endAt: Date.now() + breakMin * 60000,
      totalMs: breakMin * 60000,
      sessionNum: currentSession,
      roundNum: currentRound,
      pauseCount: 0,
      plannedMinutes: breakMin
    };
    save();
    restartSoundFromGesture(getSound());
    if(DB.pomodoro.notifications){
      sendNotification(isLong ? '🏖️ استراحت طولانی شروع شد' : '☕ استراحت کوتاه شروع شد', `به مدت ${breakMin} دقیقه استراحت کن`);
    }
    renderPomoUI();
    renderPomoV66();
  };

  window.pomoQuickStart = function(){
    if(DB.pomodoro.session) return;
    const next = DB.pomodoro.pendingNext;
    DB.pomodoro.pendingNext = null;
    if(next === 'longBreak') window.startBreak(true);
    else if(next === 'break') window.startBreak(false);
    else window.startFocus();
  };

  window.pauseSession = function(){
    const s = DB.pomodoro.session;
    if(!s || s.status !== 'running') return;
    s.pauseCount = (s.pauseCount || 0) + 1;
    if(typeof oldPause === 'function') oldPause();
    else {
      if(s.mode === 'infinite') s.baseElapsedMs = (s.baseElapsedMs || 0) + (Date.now() - s.startAt);
      else s.remainingMs = s.endAt - Date.now();
      s.status = 'paused';
      save();
    }
    stopSound();
    renderPomoUI();
    renderFocusOverlay();
  };

  window.resumeSession = function(){
    if(typeof oldResume === 'function') oldResume();
    else {
      const s = DB.pomodoro.session;
      if(s && s.status === 'paused'){
        if(s.mode === 'infinite') s.startAt = Date.now();
        else s.endAt = Date.now() + s.remainingMs;
        s.status = 'running';
        save();
      }
    }
    restartSoundFromGesture(getSound());
    renderPomoUI();
    renderFocusOverlay();
  };

  window.endSession = function(){
    const s = DB.pomodoro.session;
    if(!s) return;
    let mins = 0;
    if(s.mode === 'infinite'){
      const elapsed = (s.baseElapsedMs || 0) + (s.status === 'running' ? Date.now() - s.startAt : 0);
      mins = Math.round(elapsed / 60000);
    } else {
      const rem = s.status === 'running' ? Math.max(0, s.endAt - Date.now()) : (s.remainingMs || 0);
      mins = Math.max(0, Math.round(((s.totalMs || 0) - rem) / 60000));
    }
    const mode = s.mode, taskId = s.taskId || '';
    const planned = s.plannedMinutes || ((s.totalMs || 0) / 60000);
    const { currentSession, currentRound, cycleCount } = getCycleState();
    DB.pomodoro.session = null;
    stopSound();

    let score = 0;
    if(mins > 0){
      score = recordSession(mode, mins, {
        plannedMinutes: planned,
        pauseCount: s.pauseCount || 0,
        taskId,
        sessionNum: currentSession,
        roundNum: currentRound,
        startedAt: s.startAt,
        endedAt: Date.now(),
        completed: mins >= Math.ceil(planned)
      });
      if(mode === 'focus' && DB.pomodoro.notifications){
        sendNotification('✅ جلسه ثبت شد', `${formatPomoTimeFa(mins)} تمرکز ثبت شد · امتیاز ${score}/100`);
      }
    } else {
      save();
    }

    renderPomoUI();
    renderPomoV66();
    if(mins > 0){
      showResult({ score, minutes: mins, mode, task: taskId, sessionNum: currentSession, cycleCount });
    }
  };

  window.completePomoSession = function(){
    const s = DB.pomodoro.session;
    if(!s) return;
    const mode = s.mode;
    const { currentSession, currentRound, cycleCount } = getCycleState();
    const mins = mode === 'focus'
      ? (DB.pomodoro.settings.focusMin || 25)
      : (s.isLongBreak ? (DB.pomodoro.settings.longBreakMin || 15) : (DB.pomodoro.settings.breakMin || 5));
    const taskId = s.taskId || '';
    const wasLong = !!s.isLongBreak;

    DB.pomodoro.session = null;
    stopSound();

    const score = recordSession(mode, mins, {
      plannedMinutes: mins,
      pauseCount: s.pauseCount || 0,
      taskId,
      sessionNum: currentSession,
      roundNum: currentRound,
      startedAt: s.startAt,
      endedAt: Date.now(),
      completed: true
    });

    playPomoChime();

    if(mode === 'focus'){
      const isCycleEnd = currentSession >= cycleCount;
      const nextBreakMin = isCycleEnd ? (DB.pomodoro.settings.longBreakMin || 15) : (DB.pomodoro.settings.breakMin || 5);
      DB.pomodoro.pendingNext = isCycleEnd ? 'longBreak' : 'break';
      save();
      if(DB.pomodoro.notifications){
        sendNotification(
          isCycleEnd ? '🎉 دور پومودورو کامل شد!' : '🎉 جلسه فوکوس کامل شد',
          `جلسه ${currentSession} از ${cycleCount} به پایان رسید · استراحت ${nextBreakMin} دقیقه‌ای آماده است`
        );
      }
      renderPomoUI();
      renderPomoV66();
      showResult({ score, minutes: mins, mode, task: taskId, sessionNum: currentSession, cycleCount });
      setTimeout(() => showBreakModal(isCycleEnd, nextBreakMin), 500);
    } else {
      advanceSessionAfterBreak(wasLong);
      save();
      if(DB.pomodoro.notifications){
        sendNotification('☕ استراحت کامل شد', `وقت شروع جلسه ${DB.pomodoro.currentSession} از ${cycleCount} است 💪`);
      }
      toast('☕ استراحت تموم شد! وقت فوکوس بعدیه 💪');
      renderPomoUI();
      renderPomoV66();
    }
  };

  // Live timer tick hook
  const oldTick = window.tickPomo;
  window.tickPomo = function(){
    if(typeof oldTick === 'function') oldTick();
    renderMainSessionBadge();
    renderFocusOverlay();
  };

  try {
    if(typeof migrateLegacyManualPomoData === 'function') migrateLegacyManualPomoData();
    updateStreak();
    save();
  }catch(_){}

  document.addEventListener('DOMContentLoaded', () => {
    ensure();
    setTimeout(() => { renderPomoV66(); }, 80);
  });
  if(document.readyState !== 'loading') setTimeout(() => renderPomoV66(), 50);
})();
