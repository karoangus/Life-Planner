
/* ============ POMODORO v6.7 — focused upgrades, kept intentionally simple ============ */
(function(){
  const POMO66_KEY='lifePlannerPomo_v66';
  const PRESETS=[
    {id:'classic',label:'کلاسیک',focus:25,break:5,icon:'🍅'},
    {id:'short',label:'کوتاه',focus:15,break:3,icon:'⚡'},
    {id:'deep',label:'دیپ فوکوس',focus:50,break:10,icon:'🧠'},
    {id:'study',label:'مطالعه',focus:45,break:10,icon:'📚'}
  ];
  const SOUNDS=[
    {id:'off',label:'🔇 خاموش'},
    {id:'rain',label:'🌧️ باران'},
    {id:'cafe',label:'☕ کافه'},
    {id:'forest',label:'🌲 جنگل'},
    {id:'space',label:'🌌 فضای آرام'}
  ];
  function ensure(){
    if(!DB.pomodoro || typeof DB.pomodoro!=='object') DB.pomodoro={settings:{focusMin:25,breakMin:5,goalMinutes:0},session:null,history:{},pendingNext:null};
    if(!DB.pomodoro.settings) DB.pomodoro.settings={focusMin:25,breakMin:5,goalMinutes:0};
    if(!Array.isArray(DB.pomodoro.sessionHistory)) DB.pomodoro.sessionHistory=[];
    if(!DB.pomodoro.presets) DB.pomodoro.presets=PRESETS.map(x=>({...x}));
    if(!DB.pomodoro.presetId) DB.pomodoro.presetId='classic';
    if(!DB.pomodoro.sound) DB.pomodoro.sound='off';
    if(DB.pomodoro.notifications===undefined) DB.pomodoro.notifications=true;
    if(DB.pomodoro.focusStreak===undefined) DB.pomodoro.focusStreak=0;
    if(DB.pomodoro.lastFocusDate===undefined) DB.pomodoro.lastFocusDate='';
  }
  ensure();
  function taskOptions(){
    const tasks=(DB.tasks||[]).filter(t=>!t.done);
    return '<option value="">🎯 بدون تسک</option>'+tasks.slice().sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')).map(t=>`<option value="${esc(t.id)}">${esc(t.title||t.text||'بدون عنوان')}${t.date?' • '+esc(t.date):''}</option>`).join('');
  }
  function selectedTask(){
    const id=document.getElementById('pomo66Task')?.value||'';
    return id ? (DB.tasks||[]).find(t=>t.id===id)||null : null;
  }
  function getSound(){ return DB.pomodoro.sound||'off'; }
  let audio=null;
  let audioKind='off';
  function safeDisconnect(node){ try{node?.disconnect?.();}catch(e){} }
  function stopSound(){
    try{
      if(audio){
        if(audio.nodes) audio.nodes.forEach(n=>{try{n.stop?.();}catch(e){} safeDisconnect(n);});
        if(audio.ctx && audio.ctx.state!=='closed') audio.ctx.close().catch(()=>{});
      }
    }catch(e){}
    audio=null; audioKind='off';
  }
  function makeNoiseBuffer(ctx,seconds=2,brown=false){
    const len=Math.max(1,Math.floor(ctx.sampleRate*seconds));
    const buf=ctx.createBuffer(1,len,ctx.sampleRate); const d=buf.getChannelData(0); let last=0;
    for(let i=0;i<len;i++){ const white=Math.random()*2-1; last=brown ? (last*0.985 + white*0.06) : white; d[i]=Math.max(-1,Math.min(1,brown?last*3.2:white*0.55)); }
    return buf;
  }
  function addLoopNoise(ctx, master, nodes, opts={}){
    const src=ctx.createBufferSource(); src.buffer=opts.buffer||makeNoiseBuffer(ctx,2,!!opts.brown); src.loop=true;
    const filter=ctx.createBiquadFilter(); filter.type=opts.type||'lowpass'; filter.frequency.value=opts.freq||2200; filter.Q.value=opts.q||0.3;
    const gain=ctx.createGain(); gain.gain.value=opts.gain||0.06;
    src.connect(filter); filter.connect(gain); gain.connect(master); src.start(); nodes.push(src);
    return {src,filter,gain};
  }
  function addTone(ctx, master, nodes, freq, gainValue, type='sine'){
    const osc=ctx.createOscillator(); const gain=ctx.createGain(); osc.type=type; osc.frequency.value=freq; gain.gain.value=gainValue; osc.connect(gain); gain.connect(master); osc.start(); nodes.push(osc);
    return {osc,gain};
  }
  async function startSound(kind){
    stopSound();
    if(!kind||kind==='off') return false;
    try{
      const Ctx=window.AudioContext||window.webkitAudioContext;
      if(!Ctx) return false;
      const ctx=new Ctx();
      if(ctx.state==='suspended') await ctx.resume().catch(()=>{});
      const master=ctx.createGain(); master.gain.value=0.09; master.connect(ctx.destination);
      const nodes=[];
      if(kind==='rain'){
        addLoopNoise(ctx,master,nodes,{type:'lowpass',freq:2800,gain:0.12});
        addLoopNoise(ctx,master,nodes,{type:'highpass',freq:650,gain:0.025});
      } else if(kind==='cafe'){
        addLoopNoise(ctx,master,nodes,{brown:true,type:'lowpass',freq:1700,gain:0.16});
        addLoopNoise(ctx,master,nodes,{type:'bandpass',freq:950,gain:0.045,q:0.8});
        const hum=addTone(ctx,master,nodes,92,0.012,'sine');
        const lfo=ctx.createOscillator(), lg=ctx.createGain(); lfo.frequency.value=0.18; lg.gain.value=0.009; lfo.connect(lg); lg.connect(hum.gain); lfo.start(); nodes.push(lfo,lg);
      } else if(kind==='forest'){
        addLoopNoise(ctx,master,nodes,{type:'lowpass',freq:1500,gain:0.085});
        addLoopNoise(ctx,master,nodes,{brown:true,type:'lowpass',freq:420,gain:0.035});
        const wind=addTone(ctx,master,nodes,170,0.009,'sine');
        const lfo=ctx.createOscillator(), lg=ctx.createGain(); lfo.frequency.value=0.08; lg.gain.value=0.01; lfo.connect(lg); lg.connect(wind.gain); lfo.start(); nodes.push(lfo,lg);
      } else if(kind==='space'){
        addTone(ctx,master,nodes,68,0.018,'sine'); addTone(ctx,master,nodes,102,0.012,'sine'); addTone(ctx,master,nodes,204,0.006,'triangle');
        const lfo=ctx.createOscillator(), lg=ctx.createGain(); lfo.frequency.value=0.045; lg.gain.value=0.02; lfo.connect(lg); lg.connect(master); lfo.start(); nodes.push(lfo,lg);
      }
      audio={ctx,nodes}; audioKind=kind; return true;
    }catch(e){ audio=null; audioKind='off'; return false; }
  }
  async function restartSoundFromGesture(kind){
    const ok=await startSound(kind);
    if(!ok && kind!=='off') toast('⚠️ صدای محیط در این مرورگر در دسترس نیست');
    return ok;
  }

  function saveAndRender(){ save(); renderPomoV66(); if(typeof renderPomoStats==='function')renderPomoStats(); }
  function renderFocusTools(){
    const root=document.getElementById('pomoV66FocusTools'); if(!root)return;
    ensure();
    const activePreset=DB.pomodoro.presetId||'classic';
    root.innerHTML=`
      <div class="pomo-v66-row">
        <div class="pomo-v66-card">
          <div class="pomo-v66-title">⚡ حالت آماده</div>
          <div class="pomo-v66-help">یک مدل آماده انتخاب کن؛ لازم نیست درگیر عددها بشی.</div>
          <div class="pomo-preset-grid">${PRESETS.map(x=>`<button type="button" class="pomo-preset ${x.id===activePreset?'active':''}" data-pomo-preset="${x.id}">${x.icon} ${x.label}<small>${x.focus}/${x.break} دقیقه</small></button>`).join('')}</div>
        </div>
        <div class="pomo-v66-card">
          <div class="pomo-v66-title">🎯 این جلسه برای چیه؟</div>
          <div class="pomo-v66-help">اختیاریه؛ فقط کمک می‌کنه بعداً ببینی روی چه کاری تمرکز کردی.</div>
          <select id="pomo66Task" class="pomo-select">${taskOptions()}</select>
          <div style="margin-top:10px;display:grid;gap:8px;">
            <select id="pomo66Sound" class="pomo-sound-select">${SOUNDS.map(x=>`<option value="${x.id}" ${x.id===getSound()?'selected':''}>${x.label}</option>`).join('')}</select>
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
              <span class="pomo-v66-mini">🔔 پایان جلسه خبرت می‌کنه</span>
              <button type="button" class="btn ghost" id="pomo66FocusMode">🧠 حالت تمرکز</button>
            </div>
          </div>
        </div>
      </div>`;
    root.querySelectorAll('[data-pomo-preset]').forEach(b=>b.onclick=()=>applyPreset(b.dataset.pomoPreset));
    const task=document.getElementById('pomo66Task');
    if(task) task.value=DB.pomodoro.session?.taskId||DB.pomodoro.lastTaskId||'';
    task?.addEventListener('change',()=>{ DB.pomodoro.lastTaskId=task.value||''; if(DB.pomodoro.session)DB.pomodoro.session.taskId=task.value||''; save(); renderPomoV66(); });
    document.getElementById('pomo66Sound')?.addEventListener('change',async e=>{ DB.pomodoro.sound=e.target.value; save(); if(e.target.value==='off') stopSound(); else await restartSoundFromGesture(e.target.value); });
    document.getElementById('pomo66FocusMode')?.addEventListener('click',openFocusMode);
  }
  function applyPreset(id){
    const p=PRESETS.find(x=>x.id===id); if(!p)return;
    if(DB.pomodoro.session){toast('⏱️ وسط جلسه نمی‌شه حالت را عوض کرد');return;}
    DB.pomodoro.presetId=id; DB.pomodoro.settings.focusMin=p.focus; DB.pomodoro.settings.breakMin=p.break;
    save(); fillPomoSettingsForm(); renderPomoUI(); renderPomoV66(); toast(`✅ ${p.label}: ${p.focus} دقیقه فوکوس / ${p.break} دقیقه استراحت`);
  }
  function getTaskLabel(id){ return id ? ((DB.tasks||[]).find(t=>t.id===id)?.title||'تسک') : 'بدون تسک'; }
  function scoreForSession(minutes,planned,pauseCount,completed){
    const early=Math.max(0,planned-minutes); const earlyPenalty=planned?Math.min(45,early/planned*50):0; const pausePenalty=Math.min(25,(pauseCount||0)*7); const completionBonus=completed?5:0;
    return Math.max(0,Math.min(100,Math.round(100-earlyPenalty-pausePenalty+completionBonus)));
  }
  function updateStreak(){
    const dates=[...new Set((DB.pomodoro.sessionHistory||[]).filter(x=>x.mode==='focus'&&x.minutes>0).map(x=>x.date))].sort().reverse();
    let streak=0, cur=todayISO();
    for(const d of dates){
      if(d===cur){streak++; const dt=new Date(cur); dt.setDate(dt.getDate()-1); cur=dateToLocalISO(dt);} else if(streak===0){ const dt=new Date(cur); dt.setDate(dt.getDate()-1); if(d===dateToLocalISO(dt)){streak++; cur=d; const dt2=new Date(cur);dt2.setDate(dt2.getDate()-1);cur=dateToLocalISO(dt2);} else break; } else break;
    }
    DB.pomodoro.focusStreak=streak; DB.pomodoro.lastFocusDate=dates[0]||'';
  }
  function recordSession(mode,minutes,meta={}){
    if(!minutes||minutes<1)return 0;
    const startedAt=meta.startedAt||Date.now()-minutes*60000;
    const endedAt=meta.endedAt||Date.now();
    let score=0;
    if(mode==='focus'){
      score=scoreForSession(minutes,meta.plannedMinutes||minutes,meta.pauseCount||0,!!meta.completed);
      DB.pomodoro.sessionHistory.unshift({id:uid(),date:todayISO(),mode:'focus',minutes,plannedMinutes:meta.plannedMinutes||minutes,taskId:meta.taskId||'',startedAt,endedAt,pauseCount:meta.pauseCount||0,score,note:meta.note||''});
      DB.pomodoro.sessionHistory=DB.pomodoro.sessionHistory.slice(0,500);
      if(meta.taskId){ const t=(DB.tasks||[]).find(x=>x.id===meta.taskId); if(t){ t.pomodoroMinutes=(t.pomodoroMinutes||0)+minutes; t.lastPomodoroAt=endedAt; } }
      updateStreak();
    }
    addPomoMinutes(mode,minutes);
    if(mode==='focus' && typeof checkPomoGoalBonus==='function') checkPomoGoalBonus();
    checkPerfectDay();
    save();
    renderPomoV66();
    return score;
  }
  function showResult(data){
    let el=document.getElementById('pomo66Result');
    if(!el){ el=document.createElement('div'); el.id='pomo66Result'; el.className='pomo-result-modal'; document.body.appendChild(el); }
    el.innerHTML=`<div class="pomo-result-box" dir="rtl">
      <div style="font-size:12px;color:var(--txt-dim2);font-weight:800;">🎉 جلسه تمام شد</div>
      <div class="pomo-result-score">${data.score}/100</div>
      <div style="text-align:center;font-size:13px;font-weight:800;margin-top:-2px;">${data.minutes} دقیقه ${data.mode==='focus'?'فوکوس':'استراحت'}</div>
      <div class="pomo-v66-help" style="text-align:center;margin-top:6px;">${data.task?esc(getTaskLabel(data.task)):'جلسه بدون تسک'} ${data.mode==='focus'?' · امتیاز تمرکز':' '}</div>
      <div class="settings-actions" style="margin-top:12px;"><button class="btn" id="pomo66ResultOk">باشه، بریم جلو 🚀</button></div>
    </div>`;
    el.classList.add('open'); document.getElementById('pomo66ResultOk').onclick=()=>el.classList.remove('open');
  }
  function showBreakModal(){
    let el=document.getElementById('pomo66Break');
    if(!el){el=document.createElement('div');el.id='pomo66Break';el.className='pomo-break-modal';document.body.appendChild(el);}
    el.innerHTML=`<div class="pomo-break-box" dir="rtl"><div class="pomo-v66-title">☕ وقت استراحت</div><div class="pomo-v66-help">۵ دقیقه استراحت یعنی واقعاً چند دقیقه ذهنت رو از کار جدا کنی؛ لازم نیست کار خاصی انجام بدی.</div><div class="pomo-break-list"><div class="pomo-break-tip">🚶 یک دور کوتاه راه برو</div><div class="pomo-break-tip">💧 آب بخور</div><div class="pomo-break-tip">👀 به صفحه نگاه نکن</div><div class="pomo-break-tip">🧘 یکم کشش بده</div></div><div class="settings-actions"><button class="btn" id="pomo66StartBreak">☕ شروع استراحت</button><button class="btn ghost" id="pomo66SkipBreak">⏭️ بعداً</button></div></div>`;
    el.classList.add('open'); document.getElementById('pomo66StartBreak').onclick=()=>{el.classList.remove('open'); if(typeof pomoQuickStart==='function')pomoQuickStart();}; document.getElementById('pomo66SkipBreak').onclick=()=>el.classList.remove('open');
  }
  let focusFullscreenRequested=false;
  function setFocusUiOpen(open){
    document.documentElement.classList.toggle('pomo-focus-open',open);
    document.body.classList.toggle('pomo-focus-open',open);
  }
  async function requestFocusFullscreen(el){
    if(!el) return false;
    try{
      if(document.fullscreenElement===el) return true;
      if(typeof el.requestFullscreen!=='function') return false;
      focusFullscreenRequested=true;
      await el.requestFullscreen({navigationUI:'hide'}).catch(()=>{});
      return document.fullscreenElement===el;
    }catch(e){ return false; }
  }
  function closeFocusMode(){
    const el=document.getElementById('pomo66FocusOverlay');
    if(!el)return;
    el.classList.remove('open'); setFocusUiOpen(false);
    try{ if(document.fullscreenElement===el) document.exitFullscreen?.().catch(()=>{}); }catch(e){}
    focusFullscreenRequested=false;
    renderPomoV66();
  }
  function openFocusMode(){
    let el=document.getElementById('pomo66FocusOverlay');
    if(!el){
      el=document.createElement('div');
      el.id='pomo66FocusOverlay'; el.className='pomo-focus-overlay';
      el.innerHTML=`<div class="pomo-focus-inner" dir="rtl"><div class="pomo-focus-mode" id="pomo66FocusModeText">🎯 فوکوس</div><div class="pomo-focus-time" id="pomo66FocusTime">25:00</div><div class="pomo-focus-task" id="pomo66FocusTask">بدون تسک</div><div class="pomo-focus-progress"><div id="pomo66FocusProgress"></div></div><div class="pomo-focus-actions"><button class="btn ghost" id="pomo66FocusExit">✕ خروج</button><button class="btn" id="pomo66FocusAction">⏸️ مکث</button></div></div>`;
      document.body.appendChild(el);
      document.getElementById('pomo66FocusExit').onclick=closeFocusMode;
      document.getElementById('pomo66FocusAction').onclick=()=>{const s=DB.pomodoro.session;if(s?.status==='running')pauseSession();else if(s?.status==='paused')resumeSession();else closeFocusMode();renderFocusOverlay();};
    }
    el.classList.add('open'); setFocusUiOpen(true); renderFocusOverlay();
    requestFocusFullscreen(el);
  }
  if(!window.__pomoFocusFullscreenBound){
    window.__pomoFocusFullscreenBound=true;
    document.addEventListener('fullscreenchange',()=>{
      const el=document.getElementById('pomo66FocusOverlay');
      if(!el || !el.classList.contains('open')) return;
      if(document.fullscreenElement!==el){
        if(focusFullscreenRequested){ focusFullscreenRequested=false; return; }
        setFocusUiOpen(true);
      }
    });
  }

  function renderFocusOverlay(){
    const s=DB.pomodoro.session; const el=document.getElementById('pomo66FocusOverlay'); if(!el||!el.classList.contains('open'))return;
    const tm=document.getElementById('pomo66FocusTime'), task=document.getElementById('pomo66FocusTask'), mode=document.getElementById('pomo66FocusModeText'), bar=document.getElementById('pomo66FocusProgress'), act=document.getElementById('pomo66FocusAction');
    if(!s){tm.textContent='00:00';mode.textContent='✅ جلسه تمام شد';task.textContent='آماده‌ی جلسه بعدی';bar.style.width='100%';act.textContent='بستن';return;}
    let remainMs=0, pct=0;
    if(s.mode==='infinite'){ const elapsed=(s.baseElapsedMs||0)+(s.status==='running'?Date.now()-s.startAt:0);tm.textContent=fmtMMSS(elapsed);mode.textContent='♾️ فوکوس بی‌نهایت'; pct=0; }
    else { remainMs=s.status==='running'?Math.max(0,s.endAt-Date.now()):(s.remainingMs||0);tm.textContent=fmtMMSS(remainMs);mode.textContent=s.mode==='focus'?'🎯 فوکوس':'☕ استراحت'; pct=Math.max(0,Math.min(100,((s.totalMs||1)-remainMs)/(s.totalMs||1)*100)); }
    task.textContent=s.taskId?getTaskLabel(s.taskId):'بدون تسک';bar.style.width=pct+'%';act.textContent=s.status==='running'?'⏸️ مکث':'▶️ ادامه';
  }
  function renderStatsTools(){
    const root=document.getElementById('pomoV66StatsTools'); if(!root)return; ensure();
    const hist=(DB.pomodoro.sessionHistory||[]).filter(x=>x.mode==='focus'&&x.minutes>0); const total=hist.reduce((a,x)=>a+x.minutes,0); const avg=hist.length?Math.round(hist.reduce((a,x)=>a+x.score,0)/hist.length):0; const best=hist.length?Math.max(...hist.map(x=>x.score)):0;
    root.innerHTML=`<div class="pomo-v66-card"><div class="pomo-v66-title">📈 جمع‌بندی فوکوس</div><div class="pomo-v66-help">این آمار فقط از جلسات واقعی پومودورو ساخته می‌شه و با ثبت دستی یکی نمی‌شه.</div><div class="pomo-stat-grid"><div class="pomo-stat-mini"><div class="n">${Math.round(total/60*10)/10}h</div><div class="l">کل فوکوس</div></div><div class="pomo-stat-mini"><div class="n">${hist.length}</div><div class="l">جلسه</div></div><div class="pomo-stat-mini"><div class="n">${avg||0}</div><div class="l">میانگین امتیاز</div></div><div class="pomo-stat-mini"><div class="n">🔥 ${DB.pomodoro.focusStreak||0}</div><div class="l">استریک فوکوس</div></div></div></div>
      <div class="pomo-v66-card"><div class="pomo-v66-title">🕘 جلسات اخیر</div><div id="pomo66HistoryList"></div></div>`;
    const list=document.getElementById('pomo66HistoryList'); const recent=hist.slice(0,8); list.innerHTML=recent.length?recent.map(x=>`<div class="pomo-history-item"><div class="pomo-history-main"><div class="pomo-history-name">🎯 ${esc(x.taskId?getTaskLabel(x.taskId):'فوکوس آزاد')}</div><div class="pomo-history-meta">${x.minutes} دقیقه · ${esc(x.date)} · ${x.pauseCount||0} مکث</div></div><div class="pomo-history-score">${x.score}/100</div></div>`).join(''):'<div class="muted" style="padding:10px 0;">هنوز جلسه کاملی ثبت نشده.</div>';
  }
  function renderPomoV66(){ensure();renderFocusTools();renderStatsTools();renderFocusOverlay();}
  const oldStartFocus=window.startFocus, oldStartBreak=window.startBreak, oldPause=window.pauseSession, oldResume=window.resumeSession, oldEnd=window.endSession, oldComplete=window.completePomoSession;
  window.startFocus=function(){
    ensure(); const task=selectedTask(); DB.pomodoro.session={mode:'focus',status:'running',startAt:Date.now(),endAt:Date.now()+DB.pomodoro.settings.focusMin*60000,totalMs:DB.pomodoro.settings.focusMin*60000,taskId:task?.id||DB.pomodoro.lastTaskId||'',pauseCount:0,plannedMinutes:DB.pomodoro.settings.focusMin}; DB.pomodoro.lastTaskId=task?.id||DB.pomodoro.lastTaskId||''; save(); restartSoundFromGesture(getSound()); if(DB.pomodoro.notifications)sendNotification('🍅 فوکوس شروع شد',task?`🎯 ${task.title||task.text||'تسک'}`:'تمرکزت رو شروع کن 💪'); renderPomoUI();renderPomoV66();
  };
  window.startBreak=function(){ ensure(); DB.pomodoro.session={mode:'break',status:'running',startAt:Date.now(),endAt:Date.now()+DB.pomodoro.settings.breakMin*60000,totalMs:DB.pomodoro.settings.breakMin*60000,pauseCount:0,plannedMinutes:DB.pomodoro.settings.breakMin}; save(); restartSoundFromGesture(getSound()); if(DB.pomodoro.notifications)sendNotification('☕ استراحت شروع شد','چند دقیقه از صفحه فاصله بگیر'); renderPomoUI();renderPomoV66(); };
  window.pauseSession=function(){ const s=DB.pomodoro.session;if(!s||s.status!=='running')return; s.pauseCount=(s.pauseCount||0)+1; oldPause(); stopSound(); renderFocusOverlay(); };
  window.resumeSession=function(){ oldResume(); restartSoundFromGesture(getSound()); renderFocusOverlay(); };
  window.endSession=function(){
    const s=DB.pomodoro.session;if(!s)return;
    let mins=0;if(s.mode==='infinite'){const elapsed=(s.baseElapsedMs||0)+(s.status==='running'?Date.now()-s.startAt:0);mins=Math.round(elapsed/60000);}else{const rem=s.status==='running'?Math.max(0,s.endAt-Date.now()):(s.remainingMs||0);mins=Math.max(0,Math.round(((s.totalMs||0)-rem)/60000));}
    const mode=s.mode, taskId=s.taskId||''; const planned=s.plannedMinutes||((s.totalMs||0)/60000); DB.pomodoro.session=null; stopSound(); let score=0;if(mins>0){score=recordSession(mode,mins,{plannedMinutes:planned,pauseCount:s.pauseCount||0,taskId,startedAt:s.startAt,endedAt:Date.now(),completed:mins>=Math.ceil(planned)}); if(mode==='focus'&&DB.pomodoro.notifications)sendNotification('✅ جلسه تمام شد',`${mins} دقیقه تمرکز ثبت شد · امتیاز ${score}/100`);} else save(); renderPomoUI();renderPomoV66(); if(mins>0)showResult({score,minutes:mins,mode,task:taskId});
  };
  window.completePomoSession=function(){
    const s=DB.pomodoro.session;if(!s)return; const mode=s.mode, mins=mode==='focus'?DB.pomodoro.settings.focusMin:DB.pomodoro.settings.breakMin, taskId=s.taskId||''; DB.pomodoro.session=null; stopSound(); const score=recordSession(mode,mins,{plannedMinutes:mins,pauseCount:s.pauseCount||0,taskId,startedAt:s.startAt,endedAt:Date.now(),completed:true}); playPomoChime(); if(DB.pomodoro.notifications)sendNotification(mode==='focus'?'🎉 فوکوس کامل شد':'☕ استراحت کامل شد',mode==='focus'?`+ جلسه کامل · امتیاز ${score}/100` :'وقت فوکوس بعدیه 💪'); DB.pomodoro.pendingNext=mode==='focus'?'break':'focus'; save(); renderPomoUI();renderPomoV66(); if(mode==='focus'){showResult({score,minutes,mode,task:taskId});setTimeout(showBreakModal,450);} else toast('☕ استراحت تموم شد! وقت فوکوس بعدیه 💪');
  };
  // Keep the existing tick, but make the focus overlay live while open.
  const oldTick=window.tickPomo; window.tickPomo=function(){oldTick();renderFocusOverlay();};
  // Initial render after DOM is ready; the existing app can call renderAll before this script runs.
  document.addEventListener('DOMContentLoaded',()=>{ensure();setTimeout(()=>{renderPomoV66();},80);});
  if(document.readyState!=='loading')setTimeout(()=>renderPomoV66(),50);
})();
