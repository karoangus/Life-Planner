/**
 * Calendar regression tests: v24.12 — deactivated (faded) calendar events.
 *
 *   • an event can be deactivated from its action menu; it fades out of the
 *     week view («محو») but keeps its time slot,
 *   • another event can be dragged and dropped straight onto it; the block
 *     snaps onto the faded one's exact start and stacks cleanly above it,
 *   • reactivating an event whose time is now occupied is refused — the
 *     deactivate → drop → reactivate sequence can never merge two events,
 *   • tapping a fully covered stack opens only the active event on top; a
 *     peeking corner of the faded block is still tappable on its own,
 *   • deactivated events never ring reminders,
 *   • the offline shell keeps working.
 *
 * Run independently with `node tests/calendar-inactive.test.mjs`
 * (also part of `npm test`). Uses the repository's bundled Chromium; no
 * browser download is required.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import chromium, { inflate } from '@sparticuz/chromium';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.ogg':'audio/ogg', '.mp3':'audio/mpeg' };
const server = http.createServer((req,res)=>{
  const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file = path.resolve(ROOT, '.' + (pathname === '/' ? '/index.html' : pathname));
  if(file.startsWith(ROOT + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()){
    res.writeHead(200,{'Content-Type':MIME[path.extname(file)] || 'application/octet-stream'});
    fs.createReadStream(file).pipe(res);
  }else{ res.writeHead(404); res.end('Not found'); }
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const APP_URL = `http://127.0.0.1:${server.address().port}/index.html`;
let browser;
let passed = 0;
function ok(name, condition=true){
  assert.ok(condition,name);
  passed++;
  console.log(`✅ ${name}`);
}

try{
  // Unlike Lambda, a local Linux host does not necessarily ship NSS/NSPR.
  // Extract the libraries included with the pinned package BEFORE supplying
  // the child environment, so this test really exercises the UI everywhere.
  const packageDir = path.dirname(path.dirname(fileURLToPath(import.meta.resolve('@sparticuz/chromium'))));
  const libDir = await inflate(path.join(packageDir,'bin','al2023.tar.br'));
  browser = await puppeteer.launch({
    executablePath:await chromium.executablePath(),
    headless:true,
    args:[...chromium.args,'--no-sandbox','--disable-gpu'],
    env:{...process.env,LD_LIBRARY_PATH:`${path.join(libDir,'lib')}:${process.env.LD_LIBRARY_PATH || ''}`}
  });
  const page = await browser.newPage();
  await page.setViewport({width:1280,height:900});
  const cdp = await page.createCDPSession();
  await cdp.send('Network.setBypassServiceWorker',{bypass:true});
  const errors = [];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(APP_URL,{waitUntil:'load',timeout:30000});
  // Let the first service-worker installation finish its one-time reload.
  await new Promise(resolve=>setTimeout(resolve,1500));
  await page.waitForSelector('#eDifficulty');
  await page.evaluate(()=>{
    const dismiss = [...document.querySelectorAll('button')].find(b=>b.textContent.includes('فعلاً باس مشخصی ندارم'));
    if(dismiss) dismiss.click();
    DB.events=[];
    DB.categories=[{id:'inactive-test-cat',name:'آزمون غیرفعال',color:'#00e5ff'}];
    save(); showView('calendar');
  });

  async function createEvent({title,days=[1],start='08:00',end='09:00'}){
    return page.evaluate(async options=>{
      openEventModal();
      document.getElementById('eTitle').value=options.title;
      document.getElementById('eHourStart').value=options.start;
      document.getElementById('eHourEnd').value=options.end;
      document.querySelectorAll('#eDays .chip-opt').forEach(b=>b.classList.toggle('sel',options.days.includes(Number(b.dataset.v))));
      await saveEvent();
      return JSON.parse(JSON.stringify(DB.events.find(e=>e.title===options.title)));
    },{title,days,start,end});
  }

  /* ---------- 1. deactivate from the action menu; the block fades ---------- */
  const A = await createEvent({title:'غیرفعال‌کننده',days:[1],start:'10:00',end:'11:30'});
  const B = await createEvent({title:'رویداد روی‌صفحه',days:[1],start:'14:00',end:'14:30'});

  const deactivated = await page.evaluate(async id=>{
    onEventBlockClick(id,1);
    const btn=document.getElementById('toggleEventActiveBtn');
    const labelBefore=btn.textContent;
    btn.click();
    await new Promise(resolve=>setTimeout(resolve,60));
    const ev=DB.events.find(e=>e.id===id);
    const block=[...document.querySelectorAll('.ev-block')].find(b=>b.textContent.trim()==='غیرفعال‌کننده');
    const style=block?getComputedStyle(block):null;
    return {
      labelBefore,
      active:ev.active,
      modalClosed:document.getElementById('eventActionModalBg').classList.contains('hidden') ||
        getComputedStyle(document.getElementById('eventActionModalBg')).display==='none',
      hasClass:block?block.classList.contains('ev-inactive'):false,
      opacity:style?parseFloat(style.opacity):1
    };
  },A.id);
  assert.equal(deactivated.labelBefore,'💤 غیر فعال کردن رویداد');
  assert.equal(deactivated.active,false);
  assert.ok(deactivated.modalClosed,'the action modal closes after deactivating');
  assert.ok(deactivated.hasClass,'the deactivated block carries the ev-inactive class');
  assert.ok(deactivated.opacity<0.75,`the block is faded (opacity ${deactivated.opacity})`);
  ok('an event can be deactivated from its action menu and its block fades out');

  /* v24.13 — a deactivated event counts for nothing: quick-add no longer
     skips over it, the window simply starts at the tapped hour */
  const quickAdd = await page.evaluate(()=>{
    const w=calQuickAddWindow(1,10); // 10:00 hour, faded block at 10:00–11:30
    return w?{start:w.start.min,day:w.start.day}:null;
  });
  assert.deepEqual(quickAdd,{start:600,day:1});
  ok('a deactivated event counts for nothing — quick-add starts right at its hour');

  /* ---------- 2. drag another event onto the faded one: clean stack ---------- */
  await page.evaluate(()=>{ document.querySelector('#weekGrid .lp-cal-wrap').scrollIntoView({block:'start'}); });
  await new Promise(resolve=>setTimeout(resolve,100));
  const geom = await page.evaluate(()=>{
    const col=document.querySelector('#weekGrid .lp-cal-day[data-day="1"]').getBoundingClientRect();
    const block=[...document.querySelectorAll('#weekGrid .lp-cal-day[data-day="1"] .ev-block')]
      .find(b=>b.textContent.includes('رویداد روی‌صفحه')).getBoundingClientRect();
    const at=min=>Math.round(col.top+((min-6*60)/60)*52);
    return {x:Math.round(col.left+col.width/2), from:{x:Math.round(block.left+block.width/2),y:Math.round(block.top+block.height/2)}, grabY:Math.round(block.height/2), at600:at(600)};
  });
  await page.mouse.move(geom.from.x,geom.from.y);
  await page.mouse.down();
  await page.mouse.move(geom.x,geom.at600+geom.grabY,{steps:10});
  await new Promise(resolve=>setTimeout(resolve,150));
  await page.mouse.up();
  await new Promise(resolve=>setTimeout(resolve,200));

  const stacked = await page.evaluate(()=>{
    const a=DB.events.find(e=>e.title==='غیرفعال‌کننده');
    const b=DB.events.find(e=>e.title==='رویداد روی‌صفحه');
    const modalOpen=!getComputedStyle(document.getElementById('eventActionModalBg')).display ||
      document.getElementById('eventActionModalBg').style.display!=='none';
    return {
      a:{active:a.active,start:a.startMin,end:a.endMin},
      b:{active:b.active,start:b.startMin,end:b.endMin},
      modalTitle:document.getElementById('eventActionTitle').textContent,
      modalOpen
    };
  });
  assert.deepEqual(stacked.a,{active:false,start:600,end:690},'the faded event is untouched');
  assert.deepEqual(stacked.b,{active:true,start:600,end:630},'the dropped block snaps exactly onto the faded start');
  assert.ok(stacked.modalOpen && stacked.modalTitle.includes('رویداد روی‌صفحه'),
    'the menu that opens is the one for the event that just landed');
  ok("dragging onto a faded event snaps the block onto its exact start and opens the landed event's menu");

  /* stacked rendering: the active block paints above the faded one */
  const stackOrder = await page.evaluate(()=>{
    const col=document.querySelector('#weekGrid .lp-cal-day[data-day="1"]');
    const blocks=[...col.querySelectorAll('.ev-block')];
    const top=[...blocks].find(b=>b.textContent.includes('رویداد روی‌صفحه'));
    const faded=[...blocks].find(b=>b.textContent.includes('غیرفعال‌کننده'));
    return {
      order:blocks.indexOf(faded)<blocks.indexOf(top),
      zTop:getComputedStyle(top).zIndex,
      zFaded:getComputedStyle(faded).zIndex
    };
  });
  assert.ok(stackOrder.order,'the faded block is drawn first (behind)');
  assert.ok(Number(stackOrder.zTop)>Number(stackOrder.zFaded),'the active block has a higher stacking level');
  ok('the stacked pair stacks cleanly: faded behind, active on top');

  /* ---------- 3. tapping: covered area opens the top event, a peek opens the faded one ---------- */
  // the finished drag swallows clicks for 600ms — wait that window out so the
  // taps below are real
  await new Promise(resolve=>setTimeout(resolve,700));
  await page.evaluate(()=>closeModal('eventActionModalBg'));
  const tapTargets = await page.evaluate(()=>{
    const top=[...document.querySelectorAll('.ev-block')].find(b=>b.textContent.includes('رویداد روی‌صفحه')).getBoundingClientRect();
    const faded=[...document.querySelectorAll('.ev-block')].find(b=>b.textContent.includes('غیرفعال‌کننده')).getBoundingClientRect();
    return {
      topCenter:{x:Math.round(top.left+top.width/2),y:Math.round(top.top+top.height/2)},
      // the faded block runs to 11:30; its lower part (10:45+) is not covered
      fadedLower:{x:Math.round(faded.left+faded.width/2),y:Math.round(faded.top+faded.height*0.8)}
    };
  });
  await page.mouse.click(tapTargets.topCenter.x,tapTargets.topCenter.y);
  await new Promise(resolve=>setTimeout(resolve,80));
  const topTap = await page.evaluate(()=>document.getElementById('eventActionTitle').textContent);
  assert.ok(topTap.includes('رویداد روی‌صفحه'),`tapping the covered area opens the top event (got ${topTap})`);
  await page.evaluate(()=>closeModal('eventActionModalBg'));
  await page.mouse.click(tapTargets.fadedLower.x,tapTargets.fadedLower.y);
  await new Promise(resolve=>setTimeout(resolve,80));
  const peekTap = await page.evaluate(()=>document.getElementById('eventActionTitle').textContent);
  assert.ok(peekTap.includes('غیرفعال‌کننده'),`tapping a peeking part of the faded block opens the faded event (got ${peekTap})`);
  ok('a fully covered stack opens only the active event; a peeking part of the faded block is still tappable');

  /* ---------- 4. the mixing bug: reactivation is refused while occupied ---------- */
  const activateBlocked = await page.evaluate(async ()=>{
    const a=DB.events.find(e=>e.title==='غیرفعال‌کننده');
    onEventBlockClick(a.id,1);
    const btn=document.getElementById('toggleEventActiveBtn');
    const label=btn.textContent;
    btn.click();
    await new Promise(resolve=>setTimeout(resolve,60));
    const toast=document.getElementById('toast').textContent;
    const stillInactive=DB.events.find(e=>e.id===a.id).active===false;
    const modalStillOpen=getComputedStyle(document.getElementById('eventActionModalBg')).display!=='none';
    closeModal('eventActionModalBg');
    return {label,toast,stillInactive,modalStillOpen};
  });
  assert.equal(activateBlocked.label,'✅ فعال کردن رویداد');
  assert.ok(activateBlocked.toast.includes('تداخل'),`a clash toast is shown (got ${activateBlocked.toast})`);
  assert.ok(activateBlocked.stillInactive,'the event stays deactivated');
  assert.ok(activateBlocked.modalStillOpen,'the menu stays open so the user sees the reason');
  ok('reactivating an event whose time is occupied is refused — the two can never mix');

  /* ---------- 5. moving the top event away lets the faded one come back ---------- */
  await page.evaluate(()=>{ document.querySelector('#weekGrid .lp-cal-wrap').scrollIntoView({block:'start'}); });
  await new Promise(resolve=>setTimeout(resolve,100));
  const moveGeom = await page.evaluate(()=>{
    const col=document.querySelector('#weekGrid .lp-cal-day[data-day="1"]').getBoundingClientRect();
    const block=[...document.querySelectorAll('#weekGrid .lp-cal-day[data-day="1"] .ev-block')]
      .find(b=>b.textContent.includes('رویداد روی‌صفحه')).getBoundingClientRect();
    const at=min=>Math.round(col.top+((min-6*60)/60)*52);
    return {x:Math.round(col.left+col.width/2), from:{x:Math.round(block.left+block.width/2),y:Math.round(block.top+block.height/2)}, grabY:Math.round(block.height/2), at960:at(960)};
  });
  await page.mouse.move(moveGeom.from.x,moveGeom.from.y);
  await page.mouse.down();
  await page.mouse.move(moveGeom.x,moveGeom.at960+moveGeom.grabY,{steps:10});
  await new Promise(resolve=>setTimeout(resolve,150));
  await page.mouse.up();
  await new Promise(resolve=>setTimeout(resolve,200));
  const movedAway = await page.evaluate(()=>{
    const b=DB.events.find(e=>e.title==='رویداد روی‌صفحه');
    return {start:b.startMin,end:b.endMin};
  });
  assert.deepEqual(movedAway,{start:960,end:990});
  const reactivated = await page.evaluate(()=>{
    const a=DB.events.find(e=>e.title==='غیرفعال‌کننده');
    onEventBlockClick(a.id,1);
    document.getElementById('toggleEventActiveBtn').click();
    const ev=DB.events.find(e=>e.id===a.id);
    const block=[...document.querySelectorAll('.ev-block')].find(b=>b.textContent.trim()==='غیرفعال‌کننده');
    const toast=document.getElementById('toast').textContent;
    return {active:ev.active,hasClass:block?block.classList.contains('ev-inactive'):true,toast};
  });
  assert.equal(reactivated.active,true);
  assert.ok(!reactivated.hasClass,'the block loses its faded class');
  assert.ok(reactivated.toast.includes('فعال شد'));
  ok('moving the top event away lets the faded event be reactivated normally');

  /* ---------- 6. deactivated events never ring reminders ---------- */
  const reminders = await page.evaluate(async ()=>{
    DB.events.push({id:'inactive-reminder',title:'یادآور خاموش',days:[1],startMin:8*60,endMin:9*60,reminder:true,active:false});
    DB.events.push({id:'active-reminder',title:'یادآور فعال',days:[1],startMin:8*60,endMin:9*60,reminder:true,active:true});
    rescheduleAllEventReminders();
    const inactive=reminderTimers.has('inactive-reminder');
    const active=reminderTimers.has('active-reminder');
    return {inactive,active};
  });
  assert.equal(reminders.inactive,false,'a deactivated event never gets a reminder timer');
  assert.equal(reminders.active,true,'an active event still gets one');
  ok('deactivated events stop ringing; active ones are unaffected');

  /* ---------- 8. v24.13: a deactivated event counts for nothing ---------- */
  /* resizing an event over a faded block is allowed — no conflict */
  const resizeOverFaded = await page.evaluate(async ()=>{
    DB.events=[
      {id:'fade-resize',title:'غیرفعال‌resize',days:[1],startMin:600,endMin:690,active:false},
      {id:'live-resize',title:'تغییر اندازه',days:[1],startMin:540,endMin:600,active:true}
    ];
    save(); renderCalendar();
    lpApplyEventResize(DB.events.find(e=>e.id==='live-resize'),1,0,540,660,'end');
    const e=DB.events.find(x=>x.id==='live-resize');
    const toast=document.getElementById('toast').textContent;
    return {end:e.endMin,toast};
  });
  assert.equal(resizeOverFaded.end,660,'the resize extends over the faded block');
  assert.ok(!resizeOverFaded.toast.includes('تداخل'),`no conflict toast (got ${resizeOverFaded.toast})`);
  ok('resizing over a deactivated event is allowed — it counts for nothing');

  /* creating an event that overlaps a faded block is allowed — no conflict */
  const createOverFaded = await page.evaluate(async ()=>{
    DB.events=[{id:'fade-create',title:'غیرفعال‌ساخت',days:[1],startMin:600,endMin:690,active:false}];
    save(); renderCalendar();
    openEventModal();
    document.getElementById('eTitle').value='رویداد روی‌فاده';
    document.getElementById('eHourStart').value='10:30';
    document.getElementById('eHourEnd').value='11:30';
    document.querySelectorAll('#eDays .chip-opt').forEach(b=>b.classList.toggle('sel',Number(b.dataset.v)===1));
    await saveEvent();
    const created=DB.events.find(e=>e.title==='رویداد روی‌فاده');
    const toast=document.getElementById('toast').textContent;
    return {created:!!created,start:created?created.startMin:null,toast};
  });
  assert.ok(createOverFaded.created,'the overlapping event is saved');
  assert.equal(createOverFaded.start,630);
  assert.ok(!createOverFaded.toast.includes('تداخل'),`no conflict toast (got ${createOverFaded.toast})`);
  ok('creating an event over a deactivated event is allowed — it counts for nothing');

  /* ---------- 9. v24.13: the fit-into-gap system only fires between two events ---------- */
  /* dropping at the START EDGE of a live block swaps with it — the gap-fit
     system must not swallow the drop into the gap before the block */
  const edgeSwap = await page.evaluate(()=>{
    DB.events=[
      {id:'gap-prev',title:'قبل‌چال‌زدن',days:[1],startMin:480,endMin:570,active:true},
      {id:'gap-target',title:'هدف‌چال‌زدن',days:[1],startMin:600,endMin:660,active:true},
      {id:'gap-source',title:'منبع‌چال‌زدن',days:[1],startMin:840,endMin:900,active:true}
    ];
    save(); renderCalendar();
    lpApplyEventDrag(DB.events.find(e=>e.id==='gap-source'),1,1,600);
    const src=DB.events.find(e=>e.id==='gap-source');
    const tgt=DB.events.find(e=>e.id==='gap-target');
    return {src:{start:src.startMin,end:src.endMin},tgt:{start:tgt.startMin,end:tgt.endMin}};
  });
  assert.deepEqual(edgeSwap.src,{start:600,end:660},'the dropped block takes the target slot');
  assert.deepEqual(edgeSwap.tgt,{start:840,end:900},'the target block takes the source slot');
  ok('dropping at a live block start edge swaps — the gap-fit system stays out of the way');

  /* a real hole between two events still fits (the system still works there) */
  const realHole = await page.evaluate(()=>{
    DB.events=[
      {id:'hole-before',title:'قبل‌چال',days:[1],startMin:480,endMin:600,active:true},
      {id:'hole-after',title:'بعد‌چال',days:[1],startMin:660,endMin:720,active:true},
      {id:'hole-mover',title:'محرک‌چال',days:[1],startMin:840,endMin:930,active:true}
    ];
    save(); renderCalendar();
    lpApplyEventDrag(DB.events.find(e=>e.id==='hole-mover'),1,1,615);
    const m=DB.events.find(e=>e.id==='hole-mover');
    return {start:m.startMin,end:m.endMin};
  });
  assert.deepEqual(realHole,{start:600,end:660},'a drop into a real hole still fits');
  ok('dropping into a real gap between two events still shrinks into it');

  /* ---------- 10. v24.13: the calendar skips redundant re-renders ---------- */
  const smooth = await page.evaluate(()=>{
    renderCalendar();
    const e1=document.querySelector('#weekGrid .lp-cal-wrap');
    renderCalendar();
    const e2=document.querySelector('#weekGrid .lp-cal-wrap');
    return {same:e1===e2};
  });
  assert.ok(smooth.same,'renderCalendar keeps the grid when nothing changed');
  ok('the calendar skips redundant re-renders — no periodic jank');

  /* ---------- 7. version + offline shell stay intact ---------- */
  const version = await page.evaluate(async ()=>{
    const r=await fetch('app-version.json?t='+Date.now(),{cache:'no-store'});
    return (await r.json()).version;
  });
  assert.equal(version,'24.14');
  ok('the app reports version 24.14');

  const offlinePage = await browser.newPage();
  const offlineErrors=[];
  offlinePage.on('pageerror',e=>offlineErrors.push(e.message));
  await offlinePage.goto(`http://127.0.0.1:${server.address().port}/offline.html`,{waitUntil:'load',timeout:15000});
  const offlineState = await offlinePage.evaluate(()=>({
    title:document.title,
    hasButton:!!document.querySelector('a.btn'),
    text:document.body.textContent.includes('آفلاین آماده است')
  }));
  assert.deepEqual(offlineState,{title:'Life Planner — آفلاین',hasButton:true,text:true});
  assert.deepEqual(offlineErrors,[]);
  await offlinePage.close();
  ok('the offline shell still loads cleanly');

  const offlineWiring = await page.evaluate(()=>({
    badge:!!document.getElementById('offlineBadge'),
    banner:!!document.getElementById('offlineBanner'),
    dot:!!document.getElementById('offlineDot')
  }));
  assert.deepEqual(offlineWiring,{badge:true,banner:true,dot:true});
  ok('the offline indicator wiring in the app is untouched');

  assert.deepEqual(errors,[]);
  ok('no browser JavaScript errors');
  console.log(`\n${passed} CALENDAR INACTIVE TESTS PASSED`);
}finally{
  if(browser) await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
