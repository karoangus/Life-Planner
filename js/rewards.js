/* ============================================================
   Life Planner v24.8 — «🎁 جایزه»

   Personal recurring rewards, independent from XP and quests.
   A reward starts when its form is confirmed. When its deadline
   arrives it stays ready until claimed; claiming starts the next
   cycle from that moment. Monthly cycles use calendar months,
   while weekly/custom cycles use exact durations.
   ============================================================ */
(function(){
  'use strict';

  const FREQUENCIES = ['weekly','monthly','custom'];
  let dueSignature = '';
  let ticking = false;

  function store(){
    if(typeof DB === 'undefined' || !DB) return null;
    if(!Array.isArray(DB.rewards)) DB.rewards = [];
    return DB;
  }
  function cleanReward(raw){
    if(!raw || typeof raw !== 'object') return null;
    const title = String(raw.title||'').trim().slice(0,100);
    if(!title) return null;
    const frequency = FREQUENCIES.includes(raw.frequency) ? raw.frequency : 'weekly';
    const customUnit = raw.customUnit === 'days' ? 'days' : 'hours';
    const max = customUnit === 'days' ? 3650 : 8760;
    const customValue = Math.max(1,Math.min(max,Math.floor(Number(raw.customValue)||1)));
    const now = Date.now();
    const reward = {
      id:/^[a-z0-9_-]{1,64}$/i.test(String(raw.id||'')) ? String(raw.id) : uid(),
      title,
      note:String(raw.note||'').trim().slice(0,500),
      frequency,
      customValue,
      customUnit,
      createdAt:Number(raw.createdAt)>0 ? Number(raw.createdAt) : now,
      cycleStartedAt:Number(raw.cycleStartedAt)>0 ? Number(raw.cycleStartedAt) : now,
      nextAt:Number(raw.nextAt)>0 ? Number(raw.nextAt) : now,
      lastClaimedAt:Number(raw.lastClaimedAt)>0 ? Number(raw.lastClaimedAt) : null,
      claims:Math.max(0,Math.floor(Number(raw.claims)||0)),
      notifiedFor:Number(raw.notifiedFor)>0 ? Number(raw.notifiedFor) : 0
    };
    if(!Number.isFinite(reward.nextAt)) reward.nextAt = now;
    return reward;
  }
  function rewards(){
    const db = store();
    if(!db) return [];
    db.rewards = db.rewards.map(cleanReward).filter(Boolean);
    return db.rewards;
  }
  function byId(id){ return rewards().find(r=>r.id===id); }
  function addCalendarMonth(from){
    const start = new Date(from);
    const target = new Date(from);
    const originalDay = start.getDate();
    target.setDate(1);
    target.setMonth(target.getMonth()+1);
    const lastDay = new Date(target.getFullYear(),target.getMonth()+1,0).getDate();
    target.setDate(Math.min(originalDay,lastDay));
    return target.getTime();
  }
  function nextRewardAt(reward,from){
    const start = Number(from)||Date.now();
    if(reward.frequency === 'monthly') return addCalendarMonth(start);
    if(reward.frequency === 'custom'){
      const multiplier = reward.customUnit === 'days' ? 86400000 : 3600000;
      return start + Math.max(1,Number(reward.customValue)||1)*multiplier;
    }
    return start + 7*86400000;
  }
  function isDue(reward,now){ return Number(reward.nextAt) <= (Number(now)||Date.now()); }
  function frequencyLabel(reward){
    if(reward.frequency === 'monthly') return '🔁 ماهانه';
    if(reward.frequency === 'custom') return `🔁 هر ${toFaDigits(reward.customValue)} ${reward.customUnit==='days'?'روز':'ساعت'}`;
    return '🔁 هفتگی';
  }
  function countdownParts(ms){
    const seconds = Math.max(0,Math.ceil(Number(ms)/1000||0));
    return {
      days:Math.floor(seconds/86400),
      hours:Math.floor(seconds%86400/3600),
      minutes:Math.floor(seconds%3600/60),
      seconds:seconds%60
    };
  }
  function clockHtml(reward){
    const p = countdownParts(reward.nextAt-Date.now());
    return `<div class="reward-clock" data-reward-clock="${reward.id}" data-deadline="${reward.nextAt}" aria-label="شمارش معکوس جایزه">
      ${[['days',p.days,'روز'],['hours',p.hours,'ساعت'],['minutes',p.minutes,'دقیقه'],['seconds',p.seconds,'ثانیه']].map(x=>
        `<div class="reward-time-unit"><strong class="num" data-unit="${x[0]}">${toFaDigits(String(x[1]).padStart(2,'0'))}</strong><span>${x[2]}</span></div>`
      ).join('')}
    </div>`;
  }
  function progressFor(reward){
    const duration = reward.nextAt-reward.cycleStartedAt;
    if(duration<=0) return isDue(reward)?100:0;
    return Math.max(0,Math.min(100,(Date.now()-reward.cycleStartedAt)/duration*100));
  }
  function readyActions(reward){
    return `<button class="btn reward-claim" type="button" onclick="claimReward('${reward.id}')">🎉 جایزه‌ام رو گرفتم</button>`;
  }
  function rewardCard(reward){
    const due = isDue(reward);
    return `<article class="personal-reward-card ${due?'is-ready':''}" data-reward-card="${reward.id}">
      <div class="personal-reward-head">
        <div class="personal-reward-icon">${due?'🎉':'🎁'}</div>
        <div class="personal-reward-heading"><h2>${esc(reward.title)}</h2><span class="reward-frequency">${frequencyLabel(reward)}</span></div>
        <div class="personal-reward-tools"><button class="icon-btn" type="button" onclick="openRewardModal('${reward.id}')" aria-label="ویرایش ${esc(reward.title)}">✏️</button><button class="icon-btn" type="button" onclick="deleteReward('${reward.id}')" aria-label="حذف ${esc(reward.title)}">🗑️</button></div>
      </div>
      ${reward.note?`<p class="personal-reward-note">${esc(reward.note)}</p>`:''}
      ${due?`<div class="reward-ready-message" role="status"><b>زمان جایزه‌ات رسیده!</b><span>این لحظه مال توئه؛ لذتش رو ببر.</span></div>`:clockHtml(reward)}
      <div class="reward-progress" aria-hidden="true"><i style="width:${progressFor(reward)}%"></i></div>
      <div class="personal-reward-foot">
        <span>${due?'آماده‌ی دریافت':`تا جایزه‌ی بعدی`}${reward.claims?` · ${toFaDigits(reward.claims)} بار گرفته‌شده`:''}</span>
        ${due?readyActions(reward):'<span class="reward-waiting">⏳ در حال شمارش</span>'}
      </div>
    </article>`;
  }
  function renderRewards(){
    const box = document.getElementById('rewardList');
    if(!box) return;
    const list = rewards().slice().sort((a,b)=>Number(isDue(b))-Number(isDue(a))||a.nextAt-b.nextAt);
    const summary = document.getElementById('rewardSummary');
    const ready = list.filter(r=>isDue(r)).length;
    const claimed = list.reduce((n,r)=>n+r.claims,0);
    if(summary){
      summary.style.display = list.length?'grid':'none';
      summary.innerHTML = list.length?`<div><strong class="num">${toFaDigits(list.length)}</strong><span>جایزه‌ی فعال</span></div><div class="${ready?'ready':''}"><strong class="num">${toFaDigits(ready)}</strong><span>آماده‌ی دریافت</span></div><div><strong class="num">${toFaDigits(claimed)}</strong><span>جایزه‌ی گرفته‌شده</span></div>`:'';
    }
    box.innerHTML = list.length ? list.map(rewardCard).join('') : `<div class="reward-empty"><span>🎁</span><h2>هنوز جایزه‌ای نساختی</h2><p>یه تفریح کوچیک برای خودت مشخص کن و بذار شمارش معکوسش شروع بشه.</p><button class="btn" type="button" onclick="openRewardModal()">➕ ساخت اولین جایزه</button></div>`;
    updateGlow();
  }
  function renderDashboardRewards(){
    const box = document.getElementById('dashboardRewards');
    if(!box) return;
    const list = rewards();
    const ready = list.filter(r=>isDue(r)).sort((a,b)=>a.nextAt-b.nextAt);
    if(!list.length){ box.style.display='none'; box.innerHTML=''; updateGlow(); return; }
    box.style.display='block';
    if(ready.length){
      box.innerHTML = `<div class="dashboard-reward-ready"><div class="dashboard-reward-kicker">🎉 وقت تفریح و جایزه رسیده!</div>${ready.map(r=>`<div class="dashboard-reward-ready-row"><div><b>${esc(r.title)}</b>${r.note?`<span>${esc(r.note)}</span>`:''}</div>${readyActions(r)}</div>`).join('')}<button class="dashboard-reward-manage" type="button" onclick="showView('rewards')">دیدن همه‌ی جایزه‌ها ←</button></div>`;
    }else{
      const next = list.slice().sort((a,b)=>a.nextAt-b.nextAt)[0];
      box.innerHTML = `<div class="dashboard-reward-next"><div class="dashboard-reward-next-head"><div><span>🎁 جایزه‌ی بعدی</span><b>${esc(next.title)}</b></div><button class="btn ghost sm" type="button" onclick="showView('rewards')">مدیریت</button></div>${clockHtml(next)}</div>`;
    }
    updateGlow();
  }
  function updateGlow(){
    const due = rewards().some(r=>isDue(r));
    document.documentElement.classList.toggle('lp-reward-due',due);
    const glow = document.getElementById('rewardReadyGlow');
    if(glow) glow.setAttribute('data-active',due?'true':'false');
  }
  function openRewardModal(id){
    const reward = id ? byId(id) : null;
    document.getElementById('rewardEditId').value = reward?reward.id:'';
    document.getElementById('rewardModalTitle').textContent = reward?'✏️ ویرایش جایزه':'🎁 جایزه جدید';
    document.getElementById('rewardTitle').value = reward?reward.title:'';
    document.getElementById('rewardNote').value = reward?reward.note:'';
    document.getElementById('rewardFrequency').value = reward?reward.frequency:'weekly';
    document.getElementById('rewardCustomValue').value = reward?reward.customValue:3;
    document.getElementById('rewardCustomUnit').value = reward?reward.customUnit:'hours';
    document.getElementById('rewardModalHint').textContent = reward?'با تأیید ویرایش، شمارش معکوس از نو شروع می‌شود.':'شمارش معکوس از لحظه‌ی تأیید شروع می‌شود.';
    syncRewardCustomField();
    openModal('rewardModalBg');
  }
  function syncRewardCustomField(){
    const custom = document.getElementById('rewardFrequency')?.value === 'custom';
    const fields = document.getElementById('rewardCustomFields');
    if(fields) fields.style.display = custom?'grid':'none';
    const unit = document.getElementById('rewardCustomUnit')?.value;
    const input = document.getElementById('rewardCustomValue');
    if(input) input.max = unit==='days'?'3650':'8760';
  }
  function saveReward(){
    const title = document.getElementById('rewardTitle').value.trim();
    if(!title){ toast('⚠️ اسم جایزه رو بنویس'); document.getElementById('rewardTitle').focus(); return; }
    const frequency = document.getElementById('rewardFrequency').value;
    const customUnit = document.getElementById('rewardCustomUnit').value === 'days'?'days':'hours';
    const max = customUnit==='days'?3650:8760;
    const customValue = Number(document.getElementById('rewardCustomValue').value);
    if(frequency==='custom' && (!Number.isInteger(customValue)||customValue<1||customValue>max)){
      toast(`⚠️ عدد باید بین ۱ تا ${toFaDigits(max)} باشد`); return;
    }
    const id = document.getElementById('rewardEditId').value;
    const old = id?byId(id):null;
    const now = Date.now();
    const reward = {
      id:old?old.id:uid(), title:title.slice(0,100),
      note:document.getElementById('rewardNote').value.trim().slice(0,500),
      frequency:FREQUENCIES.includes(frequency)?frequency:'weekly',
      customValue:Number.isInteger(customValue)?customValue:3, customUnit,
      createdAt:old?old.createdAt:now, cycleStartedAt:now, nextAt:now,
      lastClaimedAt:old?old.lastClaimedAt:null, claims:old?old.claims:0, notifiedFor:0
    };
    reward.nextAt = nextRewardAt(reward,now);
    if(old) DB.rewards[DB.rewards.findIndex(r=>r.id===old.id)] = reward;
    else DB.rewards.push(reward);
    save(); closeModal('rewardModalBg');
    renderRewards(); renderDashboardRewards();
    toast(`🎁 جایزه ذخیره شد — شمارش ${frequencyLabel(reward).replace('🔁 ','')} شروع شد`);
  }
  function claimReward(id){
    const reward = byId(id);
    if(!reward) return;
    if(!isDue(reward)){ toast('⏳ هنوز زمان این جایزه نرسیده'); return; }
    const now = Date.now();
    reward.lastClaimedAt = now;
    reward.claims = (reward.claims||0)+1;
    reward.cycleStartedAt = now;
    reward.nextAt = nextRewardAt(reward,now);
    reward.notifiedFor = 0;
    save(); renderRewards(); renderDashboardRewards();
    toast('💚 جایزه گرفته شد! شمارش چرخه‌ی بعدی شروع شد',3000);
  }
  function deleteReward(id){
    const reward = byId(id);
    if(!reward || !confirm(`جایزه‌ی «${reward.title}» حذف شود؟`)) return;
    DB.rewards = DB.rewards.filter(r=>r.id!==id);
    save(); renderRewards(); renderDashboardRewards();
    toast('🗑️ جایزه حذف شد');
  }
  function updateClocks(){
    document.querySelectorAll('[data-reward-clock]').forEach(clock=>{
      const p = countdownParts(Number(clock.dataset.deadline)-Date.now());
      Object.entries(p).forEach(([unit,value])=>{
        const el = clock.querySelector(`[data-unit="${unit}"]`);
        if(el) el.textContent = toFaDigits(String(value).padStart(2,'0'));
      });
      const card = clock.closest('[data-reward-card]');
      const bar = card?.querySelector('.reward-progress i');
      if(bar){ const r=byId(clock.dataset.rewardClock); if(r) bar.style.width=progressFor(r)+'%'; }
    });
  }
  function tick(){
    if(ticking) return;
    ticking = true;
    try{
      updateClocks();
      const list = rewards();
      const ready = list.filter(r=>isDue(r));
      const signature = ready.map(r=>r.id+':'+r.nextAt).sort().join('|');
      if(signature!==dueSignature){
        const fresh = ready.filter(r=>r.notifiedFor!==r.nextAt);
        dueSignature = signature;
        fresh.forEach(r=>{
          r.notifiedFor = r.nextAt;
          if(typeof sendNotification==='function') sendNotification('🎉 زمان جایزه‌ات رسیده!',r.note?`${r.title} — ${r.note}`:r.title,{tag:'lp-reward-'+r.id});
        });
        if(fresh.length && typeof persist==='function') persist();
        renderRewards(); renderDashboardRewards();
      }else updateGlow();
    }finally{ ticking=false; }
  }

  window.openRewardModal = openRewardModal;
  window.syncRewardCustomField = syncRewardCustomField;
  window.saveReward = saveReward;
  window.claimReward = claimReward;
  window.deleteReward = deleteReward;
  window.renderRewards = renderRewards;
  window.renderDashboardRewards = renderDashboardRewards;
  window.lpRewards = { nextRewardAt, countdownParts, isDue, normalize:cleanReward, tick };

  function boot(){
    const unit = document.getElementById('rewardCustomUnit');
    if(unit) unit.addEventListener('change',syncRewardCustomField);
    const title = document.getElementById('rewardTitle');
    if(title) title.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); saveReward(); } });
    renderRewards(); renderDashboardRewards(); tick();
    setInterval(tick,1000);
    document.addEventListener('visibilitychange',()=>{ if(!document.hidden) tick(); });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();
