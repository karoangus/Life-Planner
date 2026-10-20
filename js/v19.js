/* ============================================================
   Life Planner v19 — "Redmi Note 14 Pro" 120Hz edition
   Every view gets +1 useful, test-safe feature.
   Keep Persian default + English via lang.js.
   Additive only: never remove DB fields, keep all v16-v18.3 IDs.
   ============================================================ */
(function(){
  'use strict';
  const V='19.0';
  console.log('[v19] loaded',V);

  /* ---------- helpers ---------- */
  const $ = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
  const esc = window.esc || (s=>String(s).replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])));
  function toast(msg){
    let t=$('#v19Toast');
    if(!t){ t=document.createElement('div'); t.id='v19Toast'; t.className='v19-toast'; document.body.appendChild(t); }
    t.textContent=msg; t.classList.add('show');
    clearTimeout(t._tid); t._tid=setTimeout(()=>t.classList.remove('show'), 2800);
    // also use existing toast if present
    if(window.showToast) try{ window.showToast(msg); }catch(_){}
  }
  function haptic(ms=24){
    try{
      const on = localStorage.getItem('lp_v19_haptics');
      if(on==='0') return;
      if(navigator.vibrate) navigator.vibrate(ms);
    }catch(_){}
  }
  function todayISO(){
    const d=new Date(); d.setHours(0,0,0,0);
    const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }
  function jTodayStr(){
    try{ return new Date().toLocaleDateString('fa-IR'); }catch(_){ return todayISO(); }
  }

  /* ---------- DB extensions (safe) ---------- */
  function ensureV19DB(){
    if(typeof DB==='undefined') return;
    DB.v19 = DB.v19 || {};
    DB.v19.weekOffset = DB.v19.weekOffset || 0;
    DB.v19.dashCollapsed = DB.v19.dashCollapsed || {};
    DB.v19.pomoAutoStart = DB.v19.pomoAutoStart || false;
    DB.v19.haptics = (DB.v19.haptics!==undefined?DB.v19.haptics:true);
    DB.v19.bossArchive = DB.v19.bossArchive || [];
    DB.v19.shopDailyDeal = DB.v19.shopDailyDeal || {date:'', idx:0};
    // migrate old
    if(DB.pomodoro && DB.pomodoro.autoStart===undefined) DB.pomodoro.autoStart = DB.v19.pomoAutoStart;
  }
  ensureV19DB();

  /* ---------- 1) DASHBOARD: quick add + focus widget + collapsible ---------- */
  function buildDashboardV19(){
    const dash = $('#view-dashboard');
    if(!dash) return;
    // add quick add if missing
    if(!$('#dashV19QuickAdd')){
      const hero = dash.querySelector('.dash-grid') || dash.querySelector('header') || dash;
      const wrap = document.createElement('div');
      wrap.className='dash-v19-hero v19-entrance';
      wrap.innerHTML=`
        <div class="dash-v19-quickadd" id="dashV19QuickAdd">
          <span style="font-size:16px">⚡</span>
          <input id="dashV19Input" maxlength="120" placeholder="چی تو ذهنته؟ سریع بنویس..." autocomplete="off" aria-label="افزودن سریع تسک از داشبورد">
          <button type="button" id="dashV19AddBtn">➕ افزودن</button>
        </div>
        <div class="dash-v19-focus" id="dashV19Focus">
          <head style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <h4>🎯 فوکوس امروز</h4>
            <span class="muted" style="font-size:11px">${esc(jTodayStr())}</span>
          </head>
          <div class="v19-focus-grid" id="dashV19FocusGrid"></div>
          <div class="v19-mini-progress" style="margin-top:10px"><i id="dashV19Progress" style="width:0%"></i></div>
          <div class="muted" id="dashV19FocusSub" style="font-size:11px;margin-top:6px"></div>
        </div>
      `;
      // insert after dash quick buttons
      const anchor = dash.querySelector('.dash-quick') || dash.querySelector('.dash-grid');
      if(anchor && anchor.parentNode) anchor.parentNode.insertBefore(wrap, anchor.nextSibling);
      else dash.appendChild(wrap);

      const inp=$('#dashV19Input'), btn=$('#dashV19AddBtn');
      function doAdd(){
        const v=(inp.value||'').trim();
        if(!v){ toast('⚠️ اول بنویس چی می‌خوای اضافه کنی'); haptic(18); return; }
        // reuse existing task add logic if available
        if(typeof addTask==='function'){
          // create minimal task via DB.tasks push
          const id='t_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,6);
          const t={id, title:v, priority:'medium', category:'', deadline:'', deadlines:[], status:'notstarted', inbox:false, done:false, duration:0, note:'', subtasks:[], createdAt:Date.now(), updatedAt:Date.now()};
          DB.tasks=DB.tasks||[]; DB.tasks.unshift(t);
          if(typeof save==='function') save(); if(typeof scheduleRender==='function') scheduleRender(); else if(typeof renderAll==='function') renderAll();
          toast('✅ تسک اضافه شد');
        } else {
          // fallback: use DB.tasks direct
          try{
            DB.tasks=DB.tasks||[];
            const id='t_'+Date.now().toString(36);
            DB.tasks.unshift({id, title:v, done:false, status:'notstarted', createdAt:Date.now()});
            localStorage.setItem('lifePlannerDB', JSON.stringify(DB));
            toast('✅ ذخیره شد');
            if(typeof scheduleRender==='function') scheduleRender();
          }catch(e){ toast('⚠️ خطا در ذخیره'); }
        }
        haptic(20);
        inp.value='';
        renderDashFocus();
      }
      btn.addEventListener('click', doAdd);
      inp.addEventListener('keydown', e=>{ if(e.key==='Enter') doAdd(); });
    }
    renderDashFocus();
    setupDashboardCollapsible();
  }

  function renderDashFocus(){
    const grid=$('#dashV19FocusGrid'), bar=$('#dashV19Progress'), sub=$('#dashV19FocusSub');
    if(!grid) return;
    ensureV19DB();
    const tasks= (typeof DB!=='undefined' && DB.tasks)? DB.tasks: [];
    const todayTasks = tasks.filter(t=>!t.done && !t.inbox);
    const critical = tasks.filter(t=>t.priority==='critical' && !t.done).length;
    const doneToday = tasks.filter(t=>t.done).length; // simplified
    const total = tasks.length || 1;
    const pct = Math.round((tasks.filter(t=>t.done).length/total)*100);
    const events = (typeof DB!=='undefined' && DB.calendarEvents)? DB.calendarEvents: [];
    const todayEvents = events.filter(ev=>{
      try{
        const iso=todayISO();
        // event has date or start field; fallback check any
        const dstr = (ev.date||ev.start||'').slice(0,10);
        return dstr===iso;
      }catch(_){return false}
    }).length;
    grid.innerHTML=`
      <div class="v19-focus-chip">📋 <span>امروز <b class="num">${todayTasks.length}</b> تسک باز</span></div>
      <div class="v19-focus-chip">🚨 <span>بحرانی <b class="num">${critical}</b></span></div>
      <div class="v19-focus-chip">📅 <span>رویداد امروز <b class="num">${todayEvents}</b></span></div>
      <div class="v19-focus-chip">🍅 <span>پیشرفت <b class="num">${pct}٪</b></span></div>
    `;
    if(bar) bar.style.width=pct+'%';
    if(sub) sub.textContent = critical>0 ? '🚨 اول بحرانی‌ها رو جمع کن — بعد سراغ بقیه برو' : (todayTasks.length===0? '🎉 امروز سبکی — یه تسک جدید بساز' : '💪 یه قدم کوچیک بردار، همین الان');
  }

  function setupDashboardCollapsible(){
    const tiles=$$('.dash-tile');
    tiles.forEach(tile=>{
      const head=tile.querySelector('.card-head');
      if(!head || head._v19) return; head._v19=true;
      head.classList.add('dash-tile-head');
      head.style.cursor='pointer';
      head.title='برای جمع/باز کردن بزن';
      head.addEventListener('click', ()=>{
        const body = head.nextElementSibling;
        if(!body) return;
        const collapsed = body.style.display==='none';
        body.style.display = collapsed?'':'none';
        head.style.opacity = collapsed?'1':'.85';
        haptic(12);
      });
    });
  }

  /* ---------- 2) TASKS: search + Eisenhower + bulk ---------- */
  function buildTasksV19(){
    const view=$('#view-tasks');
    if(!view) return;
    const card=view.querySelector('.card');
    if(!card) return;
    if($('#v19TasksToolbar')) return;
    const toolbar=document.createElement('div');
    toolbar.id='v19TasksToolbar';
    toolbar.className='v19-tasks-toolbar v19-entrance';
    toolbar.innerHTML=`
      <div class="v19-search" title="جستجو بین تسک‌ها">
        <span style="font-size:14px">🔎</span>
        <input id="v19TaskSearch" placeholder="جستجو: عنوان، دسته..." autocomplete="off" aria-label="جستجوی تسک">
        <button type="button" id="v19TaskSearchClear" class="btn ghost" style="padding:4px 8px;font-size:11px;display:none">✕</button>
      </div>
      <div class="v19-eisenhower" id="v19Eisenhower">
        <div class="chip-opt" data-ei="all">📦 همه</div>
        <div class="chip-opt" data-ei="urgent">🔥 فوری</div>
        <div class="chip-opt" data-ei="important">⭐ مهم</div>
        <div class="chip-opt" data-ei="both">💎 فوری+مهم</div>
      </div>
      <div class="v19-bulk">
        <button class="btn ghost" type="button" id="v19BulkDone">✅ تکمیل دسته‌ای</button>
        <button class="btn ghost" type="button" id="v19TaskExport">📤 خروجی لیست</button>
      </div>
    `;
    // insert after categoryFilters
    const anchor = $('#categoryFilters') || card.querySelector('.chip-group');
    if(anchor && anchor.parentNode) anchor.parentNode.insertBefore(toolbar, anchor.nextSibling);
    else card.prepend(toolbar);

    // state
    let ei='all';
    const searchInp=$('#v19TaskSearch'), clearBtn=$('#v19TaskSearchClear');
    function isUrgent(t){
      return t.priority==='critical' || t.priority==='high' || (t.deadline && (new Date(t.deadline)-new Date()<2*24*3600*1000));
    }
    function isImportant(t){
      return t.priority==='critical' || (t.category && t.category.trim()!=='');
    }
    function matchesEi(t){
      if(ei==='all') return true;
      const u=isUrgent(t), im=isImportant(t);
      if(ei==='urgent') return u;
      if(ei==='important') return im;
      if(ei==='both') return u&&im;
      return true;
    }
    function applyFilters(){
      const q=(searchInp.value||'').trim().toLowerCase();
      const cards=$$('#allTasks .task-card');
      let visible=0;
      cards.forEach(c=>{
        const title=(c.querySelector('.task-title')?.textContent||c.textContent||'').toLowerCase();
        const cat=(c.getAttribute('data-category')||'').toLowerCase();
        const tObj = (c.__taskObj || {title, category:cat, priority: c.getAttribute('data-priority')||''});
        const bySearch = !q || title.includes(q) || cat.includes(q);
        const byEi = matchesEi(tObj);
        const show = bySearch && byEi;
        c.style.display = show ? '' : 'none';
        if(show) visible++;
      });
      // hint empty
      let hint=$('#v19TaskFilterHint');
      if(visible===0 && (q||ei!=='all')){
        if(!hint){
          hint=document.createElement('div'); hint.id='v19TaskFilterHint'; hint.className='v19-empty'; hint.style.marginTop='10px';
          $('#allTasks').appendChild(hint);
        }
        hint.textContent='چیزی با این فیلتر پیدا نشد — فیلتر رو عوض کن';
        hint.style.display='';
      } else if(hint) hint.style.display='none';
      clearBtn.style.display = q?'':'none';
    }
    searchInp.addEventListener('input', applyFilters);
    clearBtn.addEventListener('click', ()=>{ searchInp.value=''; applyFilters(); searchInp.focus(); });
    // ei chips
    toolbar.querySelectorAll('[data-ei]').forEach(ch=>{
      ch.addEventListener('click', ()=>{
        ei=ch.getAttribute('data-ei');
        toolbar.querySelectorAll('[data-ei]').forEach(x=>x.classList.remove('sel'));
        ch.classList.add('sel');
        applyFilters(); haptic(10);
      });
    });
    toolbar.querySelector('[data-ei="all"]').classList.add('sel');

    // bulk done
    $('#v19BulkDone').addEventListener('click', ()=>{
      const visible=$$('#allTasks .task-card').filter(c=>c.style.display!=='none');
      if(visible.length===0){ toast('⚠️ تسکی برای تکمیل دسته‌ای نیست'); return; }
      let n=0;
      visible.forEach(c=>{
        const cb=c.querySelector('input[type="checkbox"]');
        if(cb && !cb.checked){ cb.click(); n++; }
        else if(c.__taskObj && !c.__taskObj.done){ c.__taskObj.done=true; n++; }
      });
      if(n>0){
        if(typeof save==='function') save();
        if(typeof scheduleRender==='function') scheduleRender();
        toast(`✅ ${n} تسک تکمیل شد`);
        haptic(24);
      } else toast('همه همین الان تکمیل بودن');
    });
    $('#v19TaskExport').addEventListener('click', ()=>{
      const tasks=(DB.tasks||[]);
      const lines=tasks.map(t=>`${t.done?'✅':'⬜'} ${t.title} ${t.priority?`[${t.priority}]`:''} ${t.deadline||''}`.trim());
      const blob=new Blob([lines.join('\n')], {type:'text/plain;charset=utf-8'});
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`lifeplanner-tasks-${todayISO()}.txt`; a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
      toast('📤 لیست دانلود شد');
    });

    // enhance task render to attach __taskObj for filtering
    const origRenderTasks = window.renderTasks;
    if(origRenderTasks && !origRenderTasks._v19){
      window.renderTasks = function(...args){
        const r=origRenderTasks.apply(this, args);
        setTimeout(()=>{
          $$('#allTasks .task-card').forEach((c,i)=>{
            // try map by index
            const tasks=(DB.tasks||[]);
            // best guess: find by title
            const titleEl=c.querySelector('.task-title');
            const title=titleEl?titleEl.textContent.trim():'';
            let found=tasks.find(t=>t.title===title);
            if(found) c.__taskObj=found;
          });
          applyFilters();
        }, 0);
        return r;
      };
      window.renderTasks._v19=true;
    }
  }

  /* ---------- 3) CALENDAR: week nav + agenda + templates ---------- */
  function buildCalendarV19(){
    const view=$('#view-calendar');
    if(!view) return;
    const topbar=view.querySelector('.calendar-topbar');
    if(!topbar) return;
    if($('#v19CalNav')) return;
    const nav=document.createElement('div');
    nav.id='v19CalNav'; nav.className='v19-cal-nav v19-entrance';
    nav.innerHTML=`
      <div class="v19-week-label" id="v19WeekLabel"><span>🗓️ این هفته</span> <small id="v19WeekDates"></small></div>
      <div class="v19-cal-actions">
        <button class="btn ghost" type="button" id="v19CalPrev">◀ هفته قبل</button>
        <button class="btn" type="button" id="v19CalToday">امروز</button>
        <button class="btn ghost" type="button" id="v19CalNext">هفته بعد ▶</button>
        <div class="v19-agenda-toggle" id="v19AgendaToggle">
          <button type="button" data-ag="grid" class="sel">▦ گرید</button>
          <button type="button" data-ag="list">☰ لیست</button>
        </div>
      </div>
    `;
    // insert after calendar-intro
    const anchor=view.querySelector('.calendar-intro') || topbar;
    anchor.parentNode.insertBefore(nav, anchor.nextSibling);

    const templates=document.createElement('div');
    templates.className='v19-cal-templates';
    templates.id='v19CalTemplates';
    templates.innerHTML=`
      <span class="muted" style="font-size:11px;align-self:center">قالب سریع:</span>
      <div class="chip-opt" data-tpl="📚 مطالعه 50 دقیقه">📚 مطالعه</div>
      <div class="chip-opt" data-tpl="🏋️ ورزش">🏋️ ورزش</div>
      <div class="chip-opt" data-tpl="🧘 مدیتیشن 10 دقیقه">🧘 مدیتیشن</div>
      <div class="chip-opt" data-tpl="💼 جلسه کاری">💼 جلسه</div>
    `;
    const card=view.querySelector('.calendar-card');
    if(card) card.parentNode.insertBefore(templates, card);

    templates.querySelectorAll('[data-tpl]').forEach(ch=>{
      ch.addEventListener('click', ()=>{
        const title=ch.getAttribute('data-tpl');
        if(typeof openEventModal==='function'){
          openEventModal();
          setTimeout(()=>{
            const ti=$('#eventTitle')||$('input[placeholder*="عنوان"]');
            if(ti){ ti.value=title; ti.focus(); }
          }, 120);
        } else {
          toast(`قالب: ${title}`);
        }
        haptic(12);
      });
    });

    // week offset logic
    ensureV19DB();
    let weekOffset = DB.v19.weekOffset||0;
    let agendaMode = 'grid'; // grid | list
    const agendaList=document.createElement('div');
    agendaList.id='v19AgendaList'; agendaList.className='v19-agenda-list'; agendaList.style.display='none';
    const weekGrid=$('#weekGrid');
    if(weekGrid && weekGrid.parentNode){
      weekGrid.parentNode.insertBefore(agendaList, weekGrid.nextSibling);
    }

    function getWeekDates(offset){
      const now=new Date(); const day=now.getDay(); // 0 Sun -> convert to Sat start? app uses Sat
      // Persian week starts Saturday (6). Compute Saturday of this week
      // JS getDay: 0 Sun ... 6 Sat; Saturday = 6; distance to Saturday
      const diff = (day===6?0: day+1); // Sat ->0, Sun->1 ... Fri->6
      const sat=new Date(now); sat.setDate(now.getDate()-diff + offset*7); sat.setHours(0,0,0,0);
      const days=[];
      for(let i=0;i<7;i++){ const d=new Date(sat); d.setDate(sat.getDate()+i); days.push(d); }
      return days;
    }
    function fmtDay(d){
      try{ return d.toLocaleDateString('fa-IR'); }catch(_){ return d.toISOString().slice(0,10); }
    }
    function updateWeekLabel(){
      const days=getWeekDates(weekOffset);
      const lbl=$('#v19WeekDates');
      if(lbl) lbl.textContent = `${fmtDay(days[0])} — ${fmtDay(days[6])}`;
    }
    function renderAgenda(){
      const days=getWeekDates(weekOffset);
      const events=(DB.calendarEvents||[]);
      // map events by date string yyyy-mm-dd
      const byDate={};
      events.forEach(ev=>{
        const dstr=(ev.date||ev.start||'').slice(0,10);
        if(!dstr) return;
        (byDate[dstr]=byDate[dstr]||[]).push(ev);
      });
      agendaList.innerHTML='';
      days.forEach(d=>{
        const iso=d.toISOString().slice(0,10);
        const list=byDate[iso]||[];
        const head=document.createElement('div');
        head.style.fontWeight='800'; head.style.fontSize='12px'; head.style.marginTop='6px';
        head.textContent= `${fmtDay(d)} · ${list.length} رویداد`;
        agendaList.appendChild(head);
        if(list.length===0){
          const emp=document.createElement('div'); emp.className='v19-empty'; emp.textContent='— رویدادی نیست —';
          emp.style.padding='8px'; agendaList.appendChild(emp);
        } else {
          list.forEach(ev=>{
            const it=document.createElement('div'); it.className='v19-agenda-item';
            const t = (ev.startTime||ev.start||'').slice(11,16) || ev.time || '—';
            const title=esc(ev.title||ev.name||'بدون عنوان');
            const cat=esc(ev.category||ev.cat||'');
            it.innerHTML=`<div class="v19-agenda-time">${esc(t)}</div><div class="v19-agenda-title">${title}</div><div class="muted" style="font-size:11px">${cat}</div>`;
            it.addEventListener('click', ()=>{
              if(typeof openEventModal==='function'){
                // try open event details if exists
                if(window.openEventDetails) try{ window.openEventDetails(ev.id||ev._id); }catch(_){ openEventModal(ev.id); }
                else openEventModal(ev.id);
              }
            });
            agendaList.appendChild(it);
          });
        }
      });
    }

    function applyMode(){
      const isList = agendaMode==='list';
      if(weekGrid) weekGrid.style.display = isList?'none':'';
      agendaList.style.display = isList?'':'none';
      $$('#v19AgendaToggle button').forEach(b=>b.classList.toggle('sel', b.getAttribute('data-ag')===agendaMode));
      if(isList) renderAgenda();
    }

    $('#v19CalPrev').addEventListener('click', ()=>{ weekOffset--; DB.v19.weekOffset=weekOffset; if(typeof save==='function') save(); updateWeekLabel(); renderAgenda(); haptic(10); 
      // attempt to call original week rendering if exists
      if(window.renderCalendar) try{ window.renderCalendar(); }catch(_){}
      toast('◀ هفته قبل');
    });
    $('#v19CalNext').addEventListener('click', ()=>{ weekOffset++; DB.v19.weekOffset=weekOffset; if(typeof save==='function') save(); updateWeekLabel(); renderAgenda(); haptic(10);
      if(window.renderCalendar) try{ window.renderCalendar(); }catch(_){}
      toast('هفته بعد ▶');
    });
    $('#v19CalToday').addEventListener('click', ()=>{ weekOffset=0; DB.v19.weekOffset=0; if(typeof save==='function') save(); updateWeekLabel(); renderAgenda(); if(window.renderCalendar) try{ window.renderCalendar(); }catch(_){} if(typeof scrollCalendarToNow==='function') try{ scrollCalendarToNow(); }catch(_){} haptic(14); toast('📍 برگشت به امروز'); });
    $$('#v19AgendaToggle button').forEach(b=>{
      b.addEventListener('click', ()=>{ agendaMode=b.getAttribute('data-ag'); applyMode(); haptic(8); });
    });
    updateWeekLabel(); applyMode();

    // wrap original renderCalendar to keep agenda in sync
    if(window.renderCalendar && !window.renderCalendar._v19){
      const orig=window.renderCalendar;
      window.renderCalendar=function(...a){
        const r=orig.apply(this,a);
        setTimeout(()=>{ updateWeekLabel(); if(agendaMode==='list') renderAgenda(); }, 0);
        return r;
      }; window.renderCalendar._v19=true;
    }
  }

  /* ---------- 4) HABITS: heatmap + insights ---------- */
  function buildHabitsV19(){
    const view=$('#view-habits');
    if(!view) return;
    const card=view.querySelector('.card');
    if(!card || $('#v19HabitHeatmap')) return;
    const wrap=document.createElement('div');
    wrap.id='v19HabitHeatmap';
    wrap.className='v19-entrance';
    wrap.innerHTML=`
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <h4 style="margin:0;font-size:12.5px;font-weight:800">🗓️ نقشه حرارتی ۳۰ روز اخیر</h4>
        <span class="muted" style="font-size:11px">هر مربع = یک روز</span>
      </div>
      <div class="v19-heatmap" id="v19HeatmapGrid"></div>
      <div class="v19-habit-insights" id="v19HabitInsights"></div>
    `;
    card.parentNode.insertBefore(wrap, card);

    function renderHeatmap(){
      const grid=$('#v19HeatmapGrid'), ins=$('#v19HabitInsights');
      if(!grid) return;
      const habits=(DB.habits||[]);
      // build 30 days
      const days=[];
      for(let i=29;i>=0;i--){ const d=new Date(); d.setDate(d.getDate()-i); d.setHours(0,0,0,0); days.push(d); }
      // For each day, compute level = how many habits were done that day (0-4)
      grid.innerHTML='';
      days.forEach(d=>{
        const iso=d.toISOString().slice(0,10);
        let doneCount=0;
        habits.forEach(h=>{
          const hist=h.history||h.days||{};
          // history can be array of ISOs or object
          if(Array.isArray(hist)){ if(hist.includes(iso)) doneCount++; }
          else if(hist && typeof hist==='object'){ if(hist[iso]) doneCount++; }
          else if(h.doneDates && h.doneDates.includes(iso)) doneCount++;
        });
        const lv = doneCount===0?0: doneCount===1?1: doneCount===2?2: doneCount>=4?4:3;
        const el=document.createElement('div');
        el.className='v19-heat-day'; el.setAttribute('data-lv', String(lv));
        el.title=`${iso}: ${doneCount} عادت`;
        grid.appendChild(el);
      });
      if(ins){
        const total = habits.length||0;
        // compute best streak across habits
        let best=0;
        habits.forEach(h=>{ const b=h.bestStreak||h.streak||0; if(b>best) best=b; });
        const weekDone = (()=>{ let c=0; const now=new Date(); for(let i=0;i<7;i++){ const d=new Date(now); d.setDate(now.getDate()-i); const iso=d.toISOString().slice(0,10); let dayDone=false; habits.forEach(h=>{ const hist=h.history||{}; if(Array.isArray(hist)?hist.includes(iso): hist[iso]) dayDone=true; }); if(dayDone) c++; } return c; })();
        ins.innerHTML=`
          <div class="v19-insight"><b class="num">${total}</b><span>عادت فعال</span></div>
          <div class="v19-insight"><b class="num">${best}</b><span>بهترین استریک</span></div>
          <div class="v19-insight"><b class="num">${weekDone}/7</b><span>روز با عادت این هفته</span></div>
        `;
      }
    }
    renderHeatmap();
    // wrap habit render
    if(window.renderHabits && !window.renderHabits._v19){
      const orig=window.renderHabits;
      window.renderHabits=function(...a){ const r=orig.apply(this,a); setTimeout(renderHeatmap, 0); return r; };
      window.renderHabits._v19=true;
    }
  }

  /* ---------- 5) GOALS: milestones ---------- */
  function buildGoalsV19(){
    const view=$('#view-goals');
    if(!view) return;
    const card=view.querySelector('.card');
    if(!card || $('#v19GoalMilestones')) return;
    const box=document.createElement('div');
    box.id='v19GoalMilestones'; box.className='v19-entrance';
    box.innerHTML=`
      <div style="display:flex;align-items:center;justify-content:space-between;margin:8px 0 6px">
        <h4 style="margin:0;font-size:12.5px;font-weight:800">🏁 گام‌های پیشنهادی</h4>
        <span class="muted" style="font-size:11px">اهداف بزرگ → قدم‌های کوچک</span>
      </div>
      <div class="v19-milestones" id="v19MilestonesChips"></div>
      <div class="muted" style="font-size:11px;margin-top:6px">💡 هر هدف رو به ۴ گام ۲۵٪ بشکن — هر گام +۵ XP</div>
    `;
    card.parentNode.insertBefore(box, view.querySelector('.card'));

    function renderMilestones(){
      const c=$('#v19MilestonesChips'); if(!c) return;
      const goals=(DB.goals||[]);
      if(goals.length===0){ c.innerHTML='<div class="v19-empty">هنوز هدفی نساختی — بالا «➕ هدف جدید» رو بزن</div>'; return; }
      c.innerHTML='';
      goals.slice(0,6).forEach(g=>{
        const pct=Math.round(g.progress||g.percent||0);
        const steps=[25,50,75,100];
        const div=document.createElement('div'); div.className='v19-milestones'; div.style.display='contents';
        steps.forEach(s=>{
          const done=pct>=s;
          const el=document.createElement('div'); el.className='v19-ms'+(done?' done':'');
          el.innerHTML=`<span class="v19-ms-dot">${done?'✓':'•'}</span> ${esc(g.title||'هدف')} · ${s}٪`;
          el.title=done?'انجام شد':'کلیک برای ثبت';
          el.style.cursor='pointer';
          el.addEventListener('click', ()=>{
            if(window.updateGoalProgress) try{ window.updateGoalProgress(g.id, s); haptic(16); toast(`🎯 ${g.title} → ${s}٪`); }catch(_){}
            else { g.progress=s; if(typeof save==='function') save(); if(window.renderGoals) renderGoals(); toast(`🎯 ${s}٪ ثبت شد`); }
          });
          c.appendChild(el);
        });
      });
    }
    renderMilestones();
    if(window.renderGoals && !window.renderGoals._v19){
      const orig=window.renderGoals;
      window.renderGoals=function(...a){ const r=orig.apply(this,a); setTimeout(renderMilestones,0); return r; };
      window.renderGoals._v19=true;
    }
  }

  /* ---------- 6) NOTES: export + tag cloud ---------- */
  function buildNotesV19(){
    const view=$('#view-notes');
    if(!view) return;
    const tools=view.querySelector('.notes-tools');
    if(!tools || $('#v19NotesActions')) return;
    const actions=document.createElement('div');
    actions.id='v19NotesActions'; actions.className='v19-notes-actions v19-entrance';
    actions.innerHTML=`
      <button class="btn ghost" type="button" id="v19NotesExport" style="font-size:12px;padding:7px 10px">📤 خروجی متن</button>
      <button class="btn ghost" type="button" id="v19NotesPrint" style="font-size:12px;padding:7px 10px">🖨️ چاپ</button>
      <span class="muted" style="font-size:11px;align-self:center" id="v19NotesStats"></span>
    `;
    tools.appendChild(actions);
    const cloud=document.createElement('div');
    cloud.id='v19TagCloud'; cloud.className='v19-tag-cloud';
    tools.appendChild(cloud);

    function updateNotesStats(){
      const notes=(DB.notes||[]);
      const total=notes.length;
      const words=notes.reduce((s,n)=>s+ ( (n.content||n.text||'').trim().split(/\s+/).filter(Boolean).length ),0);
      const st=$('#v19NotesStats'); if(st) st.textContent=`${total} یادداشت · ${words} کلمه`;
      // tag cloud
      const tagCount={};
      notes.forEach(n=>{
        const tags=(n.tags||n.tag||[]); const arr=Array.isArray(tags)?tags: String(tags).split(/[,\s]+/).filter(Boolean);
        arr.forEach(t=>{ const k=t.trim(); if(k) tagCount[k]=(tagCount[k]||0)+1; });
      });
      cloud.innerHTML='';
      Object.entries(tagCount).sort((a,b)=>b[1]-a[1]).slice(0,12).forEach(([tag,count])=>{
        const el=document.createElement('div'); el.className='v19-tag';
        el.innerHTML=`#${esc(tag)} <b class="num">${count}</b>`;
        el.addEventListener('click', ()=>{
          const inp=$('#noteSearch'); if(inp){ inp.value=tag; inp.dispatchEvent(new Event('input', {bubbles:true})); inp.focus(); toast(`🔎 فیلتر: ${tag}`); }
        });
        cloud.appendChild(el);
      });
      if(Object.keys(tagCount).length===0) cloud.innerHTML='<span class="muted" style="font-size:11px">برچسبی نیست — به یادداشت‌هات برچسب بده</span>';
    }
    $('#v19NotesExport').addEventListener('click', ()=>{
      const notes=(DB.notes||[]);
      if(notes.length===0){ toast('یادداشتی برای خروجی نیست'); return; }
      const txt=notes.map(n=>`# ${n.title||'بدون عنوان'}\n${n.content||n.text||''}\n---`).join('\n\n');
      const blob=new Blob([txt], {type:'text/plain;charset=utf-8'});
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`lifeplanner-notes-${todayISO()}.txt`; a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href),2000); toast('📤 دانلود شد'); haptic(14);
    });
    $('#v19NotesPrint').addEventListener('click', ()=>{
      const grid=$('#noteGrid'); if(!grid) return;
      const w=window.open('', '_blank');
      if(!w){ toast('⚠️ پاپ‌آپ مسدوده'); return; }
      w.document.write(`<html dir="rtl"><head><meta charset="utf-8"><title>یادداشت‌ها</title><style>body{font-family:system-ui;padding:18px;line-height:1.8}h3{margin:8px 0 4px}p{margin:0 0 12px;border-bottom:1px solid #eee;padding-bottom:8px}</style></head><body><h2>📝 یادداشت‌ها — ${esc(jTodayStr())}</h2>${(DB.notes||[]).map(n=>`<h3>${esc(n.title||'بدون عنوان')}</h3><p>${esc(n.content||n.text||'')}</p>`).join('')}</body></html>`);
      w.document.close(); w.focus(); setTimeout(()=>w.print(), 400);
    });
    updateNotesStats();
    if(window.renderNotes && !window.renderNotes._v19){
      const orig=window.renderNotes;
      window.renderNotes=function(...a){ const r=orig.apply(this,a); setTimeout(updateNotesStats,0); return r; };
      window.renderNotes._v19=true;
    }
  }

  /* ---------- 7) POMODORO: autostart + weekly streak ---------- */
  function buildPomodoroV19(){
    const view=$('#view-pomodoro');
    if(!view) return;
    const paneFocus=$('#pomoPane-focus');
    if(!paneFocus || $('#v19PomoExtra')) return;
    ensureV19DB();
    const extra=document.createElement('div');
    extra.id='v19PomoExtra'; extra.className='v19-pomo-extra v19-entrance';
    const autoChecked = (DB.v19.pomoAutoStart || DB.pomodoro?.autoStart)?'checked':'';
    extra.innerHTML=`
      <label><input type="checkbox" id="v19AutoStart" ${autoChecked} style="accent-color:var(--neon)"> 🚀 شروع خودکار جلسه بعد</label>
      <span class="muted" style="font-size:11px">بدون مکث اضافه</span>
    `;
    paneFocus.appendChild(extra);
    const week=document.createElement('div');
    week.id='v19PomoWeek'; week.className='card v19-entrance';
    week.style.marginTop='12px';
    week.innerHTML=`
      <div class="card-head"><h3>🔥 رگبار هفتگی</h3><span class="muted" style="font-size:11px">هر روز = یک جلسه کامل</span></div>
      <div class="v19-pomo-week" id="v19PomoWeekGrid"></div>
      <div class="muted" style="font-size:11px;margin-top:8px">۷ روز اخیر — پررنگ = تمرکز داشتی</div>
    `;
    const statsPane=$('#pomoPane-stats');
    if(statsPane) statsPane.appendChild(week);

    function renderPomoWeek(){
      const grid=$('#v19PomoWeekGrid'); if(!grid) return;
      grid.innerHTML='';
      const history=(DB.pomodoroHistory||DB.pomoHistory||[]);
      // history entries have date or day field
      for(let i=6;i>=0;i--){
        const d=new Date(); d.setDate(d.getDate()-i); const iso=d.toISOString().slice(0,10);
        const has = history.some(h=> (h.date||h.day||'').slice(0,10)===iso);
        const isToday = i===0;
        const el=document.createElement('div');
        el.className='v19-pomo-day'+(has?' done':'')+(isToday?' today':'');
        try{ el.textContent = d.toLocaleDateString('fa-IR',{weekday:'short'}).slice(0,1); }catch(_){ el.textContent=String(d.getDate()); }
        el.title=iso+(has?' · ✅':' · —');
        grid.appendChild(el);
      }
    }
    $('#v19AutoStart').addEventListener('change', e=>{
      const on=e.target.checked;
      DB.v19.pomoAutoStart=on;
      if(DB.pomodoro) DB.pomodoro.autoStart=on;
      if(typeof save==='function') save();
      toast(on?'🚀 شروع خودکار فعال شد':'⏸️ شروع خودکار خاموش شد'); haptic(10);
    });
    renderPomoWeek();
    // hook pomodoro complete to auto-start
    const origPomoComplete = window.pomoOnComplete;
    // Instead hook via observing pomo state if available; simple periodic
    setInterval(renderPomoWeek, 60000);
    if(window.renderPomoStats && !window.renderPomoStats._v19){
      const orig=window.renderPomoStats;
      window.renderPomoStats=function(...a){ const r=orig.apply(this,a); setTimeout(renderPomoWeek,0); return r; };
      window.renderPomoStats._v19=true;
    }
    // also hook after manual data add
    if(window.addManualPomoData && !window.addManualPomoData._v19){
      const orig=window.addManualPomoData;
      window.addManualPomoData=function(...a){ const r=orig.apply(this,a); setTimeout(renderPomoWeek,200); return r; };
      window.addManualPomoData._v19=true;
    }
  }

  /* ---------- 8) PROFILE: share card ---------- */
  function buildProfileV19(){
    const view=$('#view-profile');
    if(!view || $('#v19ProfileShare')) return;
    const hero=view.querySelector('.profile-hero');
    if(!hero) return;
    const share=document.createElement('div');
    share.id='v19ProfileShare'; share.className='v19-profile-share v19-entrance';
    share.innerHTML=`
      <div class="v19-avatar" id="v19ProfileAvatar">🏆</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:800;font-size:13px">کارت دستاورد</div>
        <div class="muted" style="font-size:11px" id="v19ProfileShareSub">سطح و XP امروزت رو به اشتراک بذار</div>
      </div>
      <button class="btn" type="button" id="v19ShareBtn" style="font-size:12px;padding:8px 12px">📤 اشتراک</button>
    `;
    hero.parentNode.insertBefore(share, hero.nextSibling);
    function lvlInfo(){
      const lvl=(DB.stats&&DB.stats.level)||1;
      const xp=(DB.stats&&DB.stats.xp)||0;
      const title=$('#pfTitle')?.textContent||'🌱 تازه‌کار';
      return {lvl, xp, title};
    }
    $('#v19ShareBtn').addEventListener('click', async ()=>{
      const {lvl,xp,title}=lvlInfo();
      const text=`🏆 Life Planner — ${title}\nسطح ${lvl} · ${xp} XP\n${location.href}`;
      if(navigator.share){
        try{ await navigator.share({title:'Life Planner', text}); toast('✅ اشتراک‌گذاری شد'); return; }catch(_){}
      }
      try{ await navigator.clipboard.writeText(text); toast('📋 کپی شد — بفرست برای دوستات'); }catch(_){
        const ta=document.createElement('textarea'); ta.value=text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('📋 کپی شد');
      }
      haptic(14);
    });
  }

  /* ---------- 9) CITY: tap inspect + perf toggle ---------- */
  function buildCityV19(){
    const view=$('#view-city');
    if(!view || $('#v19CityToggles')) return;
    const topbar=view.querySelector('.topbar');
    const frame=$('#cityFrame');
    if(!topbar || !frame) return;
    const toggles=document.createElement('div');
    toggles.id='v19CityToggles'; toggles.className='v19-city-toggles v19-entrance';
    toggles.innerHTML=`
      <button class="btn ghost" type="button" id="v19CityInspect">🔍 جزئیات شهر</button>
      <button class="btn ghost" type="button" id="v19CityPerf">⚡ کاهش جلوه‌ها</button>
    `;
    frame.parentNode.insertBefore(toggles, frame);

    $('#v19CityInspect').addEventListener('click', ()=>{
      const lvl=(DB.stats&&DB.stats.level)||1;
      let stage='چادر توی جنگل 🏕️';
      if(lvl>=5) stage='کلبه چوبی 🏡';
      if(lvl>=15) stage='خانه واقعی 🏠';
      if(lvl>=30) stage='خانه + ماشین 🚗';
      if(lvl>=50) stage='خانه + باغچه و سگ 🌳';
      if(lvl>=80) stage='شهر کوچک 🏙️';
      if(lvl>=100) stage='کلان‌شهر سایبرپانک 🌆';
      toast(`🏙️ سطح ${lvl} — ${stage}`);
      haptic(12);
    });
    $('#v19CityPerf').addEventListener('click', ()=>{
      const on=document.documentElement.classList.toggle('lp-perf');
      try{ localStorage.setItem('lp_perf_manual', on?'1':'0'); }catch(_){}
      toast(on?'⚡ جلوه‌ها کم شد — روان‌تر':'✨ جلوه‌ها برگشت');
      haptic(12);
    });
    // tap on city to haptic
    frame.addEventListener('click', ()=> haptic(16));
  }

  /* ---------- 10) SHOP: daily deal ---------- */
  function buildShopV19(){
    const view=$('#view-shop') || document.querySelector('[id*="shop"]');
    // fallback: find by heading
    const any=$$('.view').find(v=>v.textContent.includes('XP Shop')||v.textContent.includes('فروشگاه'));
    const target=view||any;
    if(!target || $('#v19ShopDeal')) return;
    const card=target.querySelector('.card') || target;
    const deal=document.createElement('div');
    deal.id='v19ShopDeal'; deal.className='v19-shop-deal v19-entrance';
    // rotate daily
    const shopItems=['XP Boost ×2','Mystery Box','Streak Shield'];
    const today=todayISO();
    ensureV19DB();
    if(DB.v19.shopDailyDeal.date!==today){
      DB.v19.shopDailyDeal={date:today, idx: (new Date().getDate()%shopItems.length) };
      if(typeof save==='function') try{ save(); }catch(_){}
    }
    const idx=DB.v19.shopDailyDeal.idx % shopItems.length;
    const item=shopItems[idx];
    deal.innerHTML=`
      <div class="v19-deal-badge">🔥 پیشنهاد امروز</div>
      <div style="flex:1">
        <div style="font-weight:800;font-size:13px">${esc(item)} — ۲۰٪ تخفیف</div>
        <div class="muted" style="font-size:11px">فقط تا پایان امروز</div>
      </div>
      <button class="btn" type="button" id="v19DealClaim" style="font-size:12px;padding:7px 10px">🛒 برو فروشگاه</button>
    `;
    card.parentNode.insertBefore(deal, card);
    $('#v19DealClaim').addEventListener('click', ()=>{
      if(typeof showView==='function') showView('shop');
      toast('🛒 پیشنهاد امروز فعاله — از فروشگاه بخر');
      haptic(12);
    });
  }

  /* ---------- 11) SKILLS: reset ---------- */
  function buildSkillsV19(){
    const view=$('#view-skills') || $$('.view').find(v=>v.textContent.includes('درخت مهارت')||v.id==='view-skills');
    if(!view || $('#v19SkillsReset')) return;
    const card=view.querySelector('.card') || view;
    const box=document.createElement('div');
    box.id='v19SkillsReset'; box.className='v19-settings-card v19-entrance';
    box.style.marginTop='10px';
    box.innerHTML=`
      <h4>♻️ بازتنظیم مهارت‌ها</h4>
      <div class="muted" style="font-size:11px;margin-bottom:8px">همه امتیازها برمی‌گردن — هزینه: ۱۰۰ XP</div>
      <button class="btn ghost" type="button" id="v19ResetSkills" style="width:100%;justify-content:center;font-size:12px">♻️ بازتنظیم</button>
    `;
    card.appendChild(box);
    $('#v19ResetSkills').addEventListener('click', ()=>{
      const pts = (DB.skills && DB.skills.points) || 0;
      const spent = (DB.skills && Object.values(DB.skills.levels||{}).reduce((s,v)=>s+v,0)) || 0;
      if(spent===0){ toast('چیزی برای بازتنظیم نیست'); return; }
      const xp=(DB.stats&&DB.stats.xp)||0;
      if(xp<100){ toast('⚠️ XP کافی نداری (۱۰۰ لازم)'); haptic(18); return; }
      if(!confirm('همه مهارت‌ها صفر بشن و امتیازهات برگرده؟ (۱۰۰ XP کم میشه)')) return;
      DB.stats.xp=xp-100;
      const totalPts = pts + spent;
      DB.skills.points=totalPts;
      DB.skills.levels={};
      if(typeof save==='function') save();
      if(typeof renderSkills==='function') try{ renderSkills(); }catch(_){}
      if(typeof scheduleRender==='function') scheduleRender();
      toast('♻️ مهارت‌ها بازتنظیم شد'); haptic(20);
    });
  }

  /* ---------- 12) BOSS: archive ---------- */
  function buildBossV19(){
    const view=$('#view-boss') || $$('.view').find(v=>v.id==='view-boss' || v.textContent.includes('باس هفتگی'));
    if(!view || $('#v19BossArchive')) return;
    const card=view.querySelector('.card') || view;
    const box=document.createElement('div');
    box.id='v19BossArchive'; box.className='card v19-entrance';
    box.style.marginTop='12px';
    box.innerHTML=`
      <div class="card-head"><h3>📜 آرشیو باس‌ها</h3><span class="muted" style="font-size:11px" id="v19BossArchiveCount">۰</span></div>
      <div class="v19-boss-archive" id="v19BossArchiveList"></div>
    `;
    card.parentNode.insertBefore(box, card.nextSibling);
    function renderArchive(){
      const list=$('#v19BossArchiveList'), cnt=$('#v19BossArchiveCount');
      if(!list) return;
      const arch=(DB.v19&&DB.v19.bossArchive)||[];
      // also check if DB.bossHistory exists
      const all = arch.concat((DB.bossHistory||[]).slice(0,6));
      if(cnt) cnt.textContent=`${all.length} نبرد`;
      if(all.length===0){ list.innerHTML='<div class="v19-empty">هنوز باسی شکست ندادی — اولین باس رو بساز 💪</div>'; return; }
      list.innerHTML=all.slice(0,10).map(b=>{
        const name=esc(b.name||b.title||'باس');
        const date=esc((b.date||b.defeatedAt||'').slice(0,10));
        const res= b.won?'✅ پیروزی': b.lost?'❌ شکست':'—';
        return `<div class="v19-boss-archive-item">${res} <b>${name}</b> <span class="muted" style="font-size:11px">· ${date}</span></div>`;
      }).join('');
    }
    // hook boss defeat to archive
    const origDefeat=window.defeatBoss;
    if(origDefeat && !origDefeat._v19){
      window.defeatBoss=function(...a){
        const r=origDefeat.apply(this,a);
        try{
          const cur=DB.boss||DB.currentBoss;
          if(cur){
            DB.v19.bossArchive.unshift({name:cur.name||cur.title, date: new Date().toISOString(), won:true});
            if(DB.v19.bossArchive.length>20) DB.v19.bossArchive.length=20;
            if(typeof save==='function') save();
          }
        }catch(_){}
        setTimeout(renderArchive, 0);
        return r;
      }; window.defeatBoss._v19=true;
    }
    renderArchive();
  }

  /* ---------- 13) YVY: monthly comparison ---------- */
  function buildYVYV19(){
    const view=$('#view-yvy') || $$('.view').find(v=>v.id==='view-yvy' || v.textContent.includes('You VS You') || v.textContent.includes('رقابت با خود'));
    if(!view || $('#v19YVYMonth')) return;
    const card=view.querySelector('.card') || view;
    const box=document.createElement('div');
    box.id='v19YVYMonth'; box.className='card v19-entrance';
    box.style.marginTop='12px';
    box.innerHTML=`
      <div class="card-head"><h3>📅 این ماه vs ماه قبل</h3></div>
      <div class="v19-yvy-month" id="v19YVYMonthGrid"></div>
      <div class="muted" style="font-size:11px;margin-top:6px">ماهانه: تسک‌های انجام‌شده</div>
    `;
    card.parentNode.insertBefore(box, card.nextSibling);
    function renderYVYMonth(){
      const grid=$('#v19YVYMonthGrid'); if(!grid) return;
      const tasks=(DB.tasks||[]);
      const now=new Date();
      const curMonth=now.getMonth(), curYear=now.getFullYear();
      const prevMonth=curMonth===0?11:curMonth-1, prevYear=curMonth===0?curYear-1:curYear;
      function countMonth(m,y){
        return tasks.filter(t=>{
          if(!t.done) return false;
          const d=t.completedAt? new Date(t.completedAt): (t.updatedAt? new Date(t.updatedAt): null);
          if(!d) return false;
          return d.getMonth()===m && d.getFullYear()===y;
        }).length;
      }
      const cur=countMonth(curMonth, curYear);
      const prev=countMonth(prevMonth, prevYear);
      const pct = prev===0? (cur>0?100:0) : Math.round(((cur-prev)/prev)*100);
      grid.innerHTML=`
        <div class="v19-yvy-month" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <div style="background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px 14px;text-align:center;min-width:92px"><b class="num" style="font-size:18px">${prev}</b><div class="muted" style="font-size:11px">ماه قبل</div></div>
          <div style="font-size:16px">→</div>
          <div style="background:var(--grad);color:#fff;border-radius:10px;padding:10px 14px;text-align:center;min-width:92px"><b class="num" style="font-size:18px">${cur}</b><div style="font-size:11px;opacity:.9">این ماه</div></div>
          <div style="background:var(--v19-glass);border:1px solid var(--line);border-radius:10px;padding:8px 12px;font-size:12px;font-weight:800">${pct>0?'📈 +'+pct+'٪': pct<0?'📉 '+pct+'٪':'➖ بدون تغییر'}</div>
        </div>
      `;
    }
    renderYVYMonth();
    if(window.renderYVY && !window.renderYVY._v19){
      const orig=window.renderYVY;
      window.renderYVY=function(...a){ const r=orig.apply(this,a); setTimeout(renderYVYMonth,0); return r; };
      window.renderYVY._v19=true;
    }
  }

  /* ---------- 14) SETTINGS: haptics + data stats ---------- */
  function buildSettingsV19(){
    const view=$('#view-settings');
    if(!view || $('#v19SettingsGrid')) return;
    const card=view.querySelector('.card') || view;
    // find settings content area
    const anchor = card.querySelector('.settings-actions') || card;
    const grid=document.createElement('div');
    grid.id='v19SettingsGrid'; grid.className='v19-settings-grid v19-entrance';
    grid.style.marginTop='14px';
    const hapticsOn = (()=>{
      try{ return localStorage.getItem('lp_v19_haptics')!=='0'; }catch(_){return true}
    })();
    const totalTasks=(DB.tasks||[]).length;
    const totalXP=(DB.stats&&DB.stats.xp)||0;
    const totalHabits=(DB.habits||[]).length;
    grid.innerHTML=`
      <div class="v19-settings-card">
        <h4>📳 بازخورد لمسی</h4>
        <label style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;margin-top:6px">
          <span style="font-size:13px">${hapticsOn?'فعال':'غیرفعال'}</span>
          <input type="checkbox" id="v19Haptics" ${hapticsOn?'checked':''} style="accent-color:var(--neon);width:18px;height:18px">
        </label>
        <div class="v19-haptic-preview" id="v19HapticPreview" style="margin-top:8px">👋 تست لرزش</div>
        <div class="muted" style="font-size:11px;margin-top:6px">روی گوشی‌های شیائومی عالی کار می‌کنه</div>
      </div>
      <div class="v19-settings-card">
        <h4>📊 خلاصه داده‌ها</h4>
        <div style="font-size:12px;line-height:1.9">
          <div>📋 تسک‌ها: <b class="num">${totalTasks}</b></div>
          <div>🔥 عادت‌ها: <b class="num">${totalHabits}</b></div>
          <div>⚡ XP کل: <b class="num">${totalXP}</b></div>
          <div>🎯 اهداف: <b class="num">${(DB.goals||[]).length}</b></div>
          <div>📝 یادداشت‌ها: <b class="num">${(DB.notes||[]).length}</b></div>
        </div>
        <button class="btn ghost" type="button" id="v19DataRefresh" style="width:100%;margin-top:8px;font-size:11px">🔄 به‌روزرسانی</button>
      </div>
    `;
    // insert before backup section if exists
    const maybe = view.querySelector('#settingsVersion') ? view.querySelector('#settingsVersion').closest('.card') : card;
    (maybe||card).parentNode.insertBefore(grid, maybe? maybe.nextSibling : null);
    if(!maybe) card.appendChild(grid);

    $('#v19Haptics').addEventListener('change', e=>{
      try{ localStorage.setItem('lp_v19_haptics', e.target.checked?'1':'0'); }catch(_){}
      toast(e.target.checked?'📳 بازخورد فعال شد':'📳 بازخورد خاموش شد'); haptic(20);
    });
    $('#v19HapticPreview').addEventListener('click', ()=>{
      const on=$('#v19Haptics').checked;
      if(!on){ toast('⚠️ اول بازخورد رو فعال کن'); return; }
      try{ navigator.vibrate([24,30,24]); }catch(_){}
      toast('👋 ویبره تست شد');
    });
    $('#v19DataRefresh').addEventListener('click', ()=>{
      const t=(DB.tasks||[]).length, h=(DB.habits||[]).length, x=(DB.stats&&DB.stats.xp)||0, g=(DB.goals||[]).length, n=(DB.notes||[]).length;
      const c=grid.querySelector('.v19-settings-card:last-child div');
      if(c) c.innerHTML=`<div>📋 تسک‌ها: <b class="num">${t}</b></div><div>🔥 عادت‌ها: <b class="num">${h}</b></div><div>⚡ XP کل: <b class="num">${x}</b></div><div>🎯 اهداف: <b class="num">${g}</b></div><div>📝 یادداشت‌ها: <b class="num">${n}</b></div>`;
      toast('🔄 به‌روز شد'); haptic(10);
    });
  }

  /* ---------- perf: 120Hz scroll optimization ---------- */
  function setupPerf120(){
    // already handled by v162, enhance: throttle scroll listeners
    let ticking=false;
    const onScroll=()=>{
      if(ticking) return; ticking=true;
      requestAnimationFrame(()=>{
        ticking=false;
        // reveal on scroll
        $$('.v19-reveal:not(.in)').forEach(el=>{
          const r=el.getBoundingClientRect();
          if(r.top < innerHeight*0.92) el.classList.add('in');
        });
      });
    };
    window.addEventListener('scroll', onScroll, {passive:true});
    // initial reveal
    setTimeout(onScroll, 400);
  }

  /* ---------- boot all ---------- */
  function bootV19(){
    ensureV19DB();
    try{ buildDashboardV19(); }catch(e){ console.error('v19 dash',e); }
    try{ buildTasksV19(); }catch(e){ console.error('v19 tasks',e); }
    try{ buildCalendarV19(); }catch(e){ console.error('v19 cal',e); }
    try{ buildHabitsV19(); }catch(e){ console.error('v19 habits',e); }
    try{ buildGoalsV19(); }catch(e){ console.error('v19 goals',e); }
    try{ buildNotesV19(); }catch(e){ console.error('v19 notes',e); }
    try{ buildPomodoroV19(); }catch(e){ console.error('v19 pomo',e); }
    try{ buildProfileV19(); }catch(e){ console.error('v19 profile',e); }
    try{ buildCityV19(); }catch(e){ console.error('v19 city',e); }
    try{ buildShopV19(); }catch(e){ console.error('v19 shop',e); }
    try{ buildSkillsV19(); }catch(e){ console.error('v19 skills',e); }
    try{ buildBossV19(); }catch(e){ console.error('v19 boss',e); }
    try{ buildYVYV19(); }catch(e){ console.error('v19 yvy',e); }
    try{ buildSettingsV19(); }catch(e){ console.error('v19 settings',e); }
    setupPerf120();
    // re-render hooks that may have been missed
    setTimeout(()=>{ try{ renderDashFocus(); }catch(_){} }, 600);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', bootV19);
  else bootV19();
  // also after core render
  let tries=0;
  const iv=setInterval(()=>{
    tries++;
    if(typeof DB!=='undefined' && document.querySelector('#view-dashboard')){
      clearInterval(iv);
      setTimeout(bootV19, 300);
    }
    if(tries>20) clearInterval(iv);
  }, 300);

  // expose for tests/debug
  window.lpV19={V, bootV19, toast, haptic};
})();
