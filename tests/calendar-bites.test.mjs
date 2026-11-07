/**
 * Calendar regression tests: bite frames with independent event body colors.
 * Run independently with `npm run test:calendar` (also part of `npm test`).
 * Uses the repository's bundled Chromium; no browser download is required.
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
  // Network bypass keeps subsequent reloads on the test server's fresh files.
  await new Promise(resolve=>setTimeout(resolve,1500));
  await page.waitForSelector('#eBite');
  await page.evaluate(()=>{
    const dismiss = [...document.querySelectorAll('button')].find(b=>b.textContent.includes('فعلاً باس مشخصی ندارم'));
    if(dismiss) dismiss.click();
    DB.events=[];
    DB.categories=[{id:'bite-test-category',name:'آزمون لقمه',color:'#00e5ff'}];
    save(); showView('calendar');
  });

  const ui = await page.evaluate(()=>{
    openEventModal();
    return {
      energy:!!document.getElementById('eEnergy'),
      energyText:document.getElementById('eventModalBg').textContent.includes('انرژی'),
      choices:[...document.querySelectorAll('#eBite .chip-opt')].map(b=>b.dataset.v),
      selected:document.querySelectorAll('#eBite .sel').length,
      pressed:document.querySelector('#eBite [data-v=""]').getAttribute('aria-pressed'),
      colorVisible:!document.getElementById('eColorField').hidden
    };
  });
  assert.deepEqual(ui,{energy:false,energyText:false,choices:['','baklava','normal','heavy'],selected:1,pressed:'true',colorVisible:true});
  ok('event form has one optional bite picker and no energy controls');

  // Real pointer input also checks that the generic chip handler cannot leave
  // stale aria-pressed states behind when the bite-specific handler runs.
  await page.click('#eBite [data-v="normal"]');
  let selection = await page.evaluate(()=>({
    value:lpGetEventBite(),
    selected:document.querySelectorAll('#eBite .sel').length,
    pressed:[...document.querySelectorAll('#eBite [aria-pressed="true"]')].map(b=>b.dataset.v),
    colorVisible:!document.getElementById('eColorField').hidden
  }));
  assert.deepEqual(selection,{value:'normal',selected:1,pressed:['normal'],colorVisible:true});
  await page.click('#eBite [data-v=""]');
  selection = await page.evaluate(()=>({value:lpGetEventBite(),colorVisible:!document.getElementById('eColorField').hidden}));
  assert.deepEqual(selection,{value:null,colorVisible:true});
  ok('bite selection stays single-choice and accessible; the body color picker remains available');

  const palette = {heavy:'#16a34a',normal:'#eab308',baklava:'#f4633a'};
  const rgb = hex => `rgb(${parseInt(hex.slice(1,3),16)}, ${parseInt(hex.slice(3,5),16)}, ${parseInt(hex.slice(5,7),16)})`;
  async function createEvent({title,bite=null,days=[0],start='08:00',end='09:00',custom=true}){
    return page.evaluate(async options=>{
      openEventModal();
      document.getElementById('eTitle').value=options.title;
      document.getElementById('eHourStart').value=options.start;
      document.getElementById('eHourEnd').value=options.end;
      document.querySelectorAll('#eDays .chip-opt').forEach(b=>b.classList.toggle('sel',options.days.includes(Number(b.dataset.v))));
      document.querySelector('#eCats [data-cid="bite-test-category"]').click();
      if(options.custom) document.querySelector('#eColorRow [data-c="#8b6bff"]').click();
      if(options.bite) document.querySelector(`#eBite [data-v="${options.bite}"]`).click();
      await saveEvent();
      return JSON.parse(JSON.stringify(DB.events.find(e=>e.title===options.title)));
    },{title,bite,days,start,end,custom});
  }
  for(const [index,[bite,color]] of Object.entries(palette).entries()){
    const event = await createEvent({title:`آزمون ${bite}`,bite,days:[index]});
    assert.equal(event.bite,bite);
    assert.equal(Object.hasOwn(event,'energy'),false);
    assert.equal(event.cat,'bite-test-category');
    assert.equal(event.color,'#8b6bff'); // the body keeps the user's chosen color
    const view = await page.evaluate(id=>{
      const block=[...document.querySelectorAll('.ev-block')].find(b=>b.getAttribute('aria-label')?.startsWith(DB.events.find(e=>e.id===id).title));
      const chip=document.querySelector(`#eBite [data-v="${DB.events.find(e=>e.id===id).bite}"]`);
      const style=getComputedStyle(block);
      block.click();
      const summary=document.getElementById('eventActionDetails').textContent;
      const dot=getComputedStyle(document.querySelector('#eventActionDetails .lp-bite-dot')).backgroundColor;
      closeModal('eventActionModalBg');
      return {border:style.borderTopColor,borderWidth:style.borderTopWidth,background:style.backgroundImage,chip:getComputedStyle(chip).borderTopColor,
        summary,dot};
    },event.id);
    assert.equal(view.border,rgb(color));
    assert.equal(view.borderWidth,'3px');
    assert.equal(view.chip,rgb(color));
    assert.equal(view.dot,rgb(color));
    // The frame is the bite color, but the body stays the user's purple.
    assert.ok(view.background.includes('rgba(139, 107, 255, 0.5)'));
    assert.ok(!view.background.includes(rgb(color).replace('rgb(', 'rgba(').replace(')', ', 0.5)')));
    assert.ok(view.summary.includes(`لقمه ${ {heavy:'سنگین',normal:'معمولی',baklava:'باقلوا'}[bite] }`));
    assert.ok(!view.summary.includes('انرژی'));
    ok(`${bite}: frame uses ${color}, while the block body keeps the user's color`);
  }
  const markers = await page.evaluate(()=>({
    badges:document.querySelectorAll('.ev-block .ev-trait,.ev-block .ev-traits').length,
    dots:document.querySelectorAll('.ev-block .ev-reminder-dot').length,
    children:[...document.querySelectorAll('.ev-block[aria-label^="آزمون"]')]
      .map(b=>[...b.children].filter(c=>!c.classList.contains('ev-resize-handle')).map(c=>c.className))
  }));
  assert.deepEqual(markers,{badges:0,dots:0,children:[['ev-title'],['ev-title'],['ev-title']]});
  ok('v24.5 the box carries nothing but its name — no bite emoji, no reminder dot, no corner glyph');

  const categoryBody = await createEvent({title:'آزمون رنگ دسته',bite:'normal',days:[4],start:'16:00',end:'17:00',custom:false});
  const categoryView = await page.evaluate(id=>{
    const block=[...document.querySelectorAll('.ev-block')].find(b=>b.getAttribute('aria-label')?.startsWith(DB.events.find(e=>e.id===id).title));
    const style=getComputedStyle(block);
    return {background:style.backgroundImage,border:style.borderTopColor};
  },categoryBody.id);
  assert.ok(categoryView.background.includes('rgba(0, 229, 255, 0.5)'));
  assert.equal(categoryView.border,rgb(palette.normal));
  ok('a bite event without a custom color keeps the category color in its body');

  const recolor = await page.evaluate(async ()=>{
    const ev=DB.events.find(e=>e.title==='آزمون heavy');
    onEventBlockClick(ev.id,0); startEditEvent();
    const pickerVisible=!document.getElementById('eColorField').hidden;
    document.querySelector('#eColorRow [data-c="#60a5fa"]').click();
    await saveEvent();
    const block=[...document.querySelectorAll('.ev-block')].find(b=>b.getAttribute('aria-label')?.startsWith('آزمون heavy'));
    const style=getComputedStyle(block);
    return {pickerVisible,background:style.backgroundImage,border:style.borderTopColor};
  });
  assert.equal(recolor.pickerVisible,true);
  assert.ok(recolor.background.includes('rgba(96, 165, 250, 0.5)'));
  assert.equal(recolor.border,rgb(palette.heavy));
  ok('the user can recolor the block body while the bite frame stays unchanged');

  const legacy = await page.evaluate(async ()=>{
    DB.events.push({id:'legacy-energy',title:'قدیمی بدون لقمه',days:[3],startMin:480,endMin:540,energy:'high',color:'#60a5fa',reminder:false});
    save(); renderCalendar();
    const before=eventColor(DB.events.find(e=>e.id==='legacy-energy'));
    onEventBlockClick('legacy-energy',3);
    const summary=document.getElementById('eventActionDetails').textContent;
    startEditEvent();
    const selected=lpGetEventBite();
    await saveEvent();
    const after=DB.events.find(e=>e.id==='legacy-energy');
    return {before,hasEnergy:summary.includes('انرژی'),selected,energy:Object.hasOwn(after,'energy'),color:eventColor(after),bite:after.bite};
  });
  assert.deepEqual(legacy,{before:'#60a5fa',hasEnergy:false,selected:null,energy:false,color:'#60a5fa',bite:null});
  ok('legacy energy-only events keep their color and lose energy when edited');

  const baklava = await page.evaluate(async ()=>{
    const ev=DB.events.find(e=>e.title==='آزمون baklava');
    onEventBlockClick(ev.id,2); startEditEvent();
    const prefilled=lpGetEventBite();
    document.querySelector('#eBite [data-v=""]').click();
    await saveEvent();
    return {prefilled,bite:DB.events.find(e=>e.id===ev.id).bite,color:eventColor(DB.events.find(e=>e.id===ev.id))};
  });
  assert.deepEqual(baklava,{prefilled:'baklava',bite:null,color:'#8b6bff'});
  ok('editing pre-fills the bite; clearing it restores the previous custom color');

  const series = await createEvent({title:'سری ویرایش',bite:'normal',days:[3,4],start:'10:00',end:'11:00'});
  const dayEdit = await page.evaluate(async id=>{
    onEventBlockClick(id,3); startEditEventThisDay();
    const prefilled=lpGetEventBite();
    document.querySelector('#eBite [data-v="heavy"]').click();
    await saveEvent();
    const edited=DB.events.find(e=>e.id!==id && e.title==='سری ویرایش' && eventDays(e).includes(3));
    const rest=DB.events.find(e=>e.id===id);
    return {prefilled,edited:{bite:edited.bite,days:eventDays(edited),energy:Object.hasOwn(edited,'energy')},rest:{bite:rest.bite,days:eventDays(rest)}};
  },series.id);
  assert.deepEqual(dayEdit,{prefilled:'normal',edited:{bite:'heavy',days:[3],energy:false},rest:{bite:'normal',days:[4]}});
  ok('editing one day detaches only that occurrence with its new bite and color');

  const moved = await createEvent({title:'سری جابه‌جایی',bite:'baklava',days:[5,6],start:'10:00',end:'11:00'});
  const drag = await page.evaluate(id=>{
    lpApplyEventDrag(DB.events.find(e=>e.id===id),5,0,12*60);
    const split=DB.events.find(e=>e.title==='سری جابه‌جایی' && e.id!==id);
    return {bite:split.bite,color:eventColor(split),energy:Object.hasOwn(split,'energy')};
  },moved.id);
  assert.deepEqual(drag,{bite:'baklava',color:'#8b6bff',energy:false});
  const resized = await createEvent({title:'سری تغییر مدت',bite:'normal',days:[1,2],start:'14:00',end:'15:00'});
  const resize = await page.evaluate(id=>{
    lpApplyEventResize(DB.events.find(e=>e.id===id),1,0,14*60,15*60+15,'end');
    const split=DB.events.find(e=>e.title==='سری تغییر مدت' && e.id!==id);
    return {bite:split.bite,color:eventColor(split),energy:Object.hasOwn(split,'energy'),duration:eventEndMinutes(split)-eventStartMinutes(split)};
  },resized.id);
  assert.deepEqual(resize,{bite:'normal',color:'#8b6bff',energy:false,duration:75});
  ok('dragging and resizing preserve the bite frame and body color, and never recreate energy');

  const fallback = await page.evaluate(()=>{
    DB.events.push({id:'untouched-legacy',title:'داده قدیمی دست‌نخورده',days:[0],startMin:14*60,endMin:15*60,energy:'low',bite:null,color:null,reminder:false});
    save(); renderCalendar();
    return {unknown:eventColor({bite:'unknown',color:'#60a5fa'}),category:eventColor({cat:'bite-test-category'}),theme:eventColor({}),
      biteCustom:eventColor({bite:'heavy',color:'#8b6bff'}),biteCategory:eventColor({bite:'normal',cat:'bite-test-category'}),biteTheme:eventColor({bite:'baklava'})};
  });
  assert.deepEqual(fallback,{unknown:'#60a5fa',category:'#00e5ff',theme:null,biteCustom:'#8b6bff',biteCategory:'#00e5ff',biteTheme:null});
  await page.reload({waitUntil:'load'});
  const persisted = await page.evaluate(()=>({
    events:DB.events.map(e=>({id:e.id,bite:e.bite,energy:e.energy})),
    backup:buildBackupPayload().events.map(e=>({id:e.id,bite:e.bite,energy:e.energy}))
  }));
  assert.deepEqual(persisted.backup,persisted.events);
  assert.equal(persisted.events.find(e=>e.id===moved.id).bite,'baklava');
  assert.equal(persisted.events.find(e=>e.id===resized.id).bite,'normal');
  assert.equal(persisted.events.find(e=>e.id==='untouched-legacy').energy,'low');
  assert.ok(persisted.events.filter(e=>e.id!=='untouched-legacy').every(e=>e.energy===undefined));
  ok('bites survive reload and backup; unedited legacy data is not destructively migrated');

  /* ---------- v24.5: a quiet box, a readable name, a drop that fits ---------- */
  const quiet = await page.evaluate(()=>{
    const saved=JSON.parse(JSON.stringify(DB.events));
    DB.events=[{id:'quiet-box',title:'جلسه با تیم محصول',days:[0],startMin:9*60,endMin:11*60,
      reminder:true,desc:'دستور جلسه',bite:'normal'}];
    save(); showView('calendar'); renderCalendar();
    const block=document.querySelector('#weekGrid .ev-block');
    const title=block.querySelector('.ev-title');
    const ts=getComputedStyle(title);
    const result={
      children:[...block.children].filter(c=>!c.classList.contains('ev-resize-handle')).map(c=>c.className),
      cornerBadges:block.querySelectorAll('.ev-trait,.ev-traits,.ev-reminder-dot').length,
      after:getComputedStyle(block,'::after').content,
      lines:Number(block.style.getPropertyValue('--ev-lines')),
      text:title.textContent,
      align:ts.textAlign,
      lineHeight:ts.lineHeight,
      clamp:ts.webkitLineClamp,
      tooltip:block.title,
      borderWidth:getComputedStyle(block).borderTopWidth,
      height:parseFloat(block.style.height)
    };
    DB.events=saved; save(); renderCalendar();
    return result;
  });
  assert.deepEqual(quiet.children,['ev-title']);
  assert.deepEqual({cornerBadges:quiet.cornerBadges,after:quiet.after,text:quiet.text,border:quiet.borderWidth},
    {cornerBadges:0,after:'none',text:'جلسه با تیم محصول',border:'3px'});
  assert.ok(quiet.lines>=6,`only ${quiet.lines} lines of room`);
  assert.deepEqual({align:quiet.align,lineHeight:quiet.lineHeight,clamp:quiet.clamp},{align:'center',lineHeight:'13px',clamp:String(quiet.lines)});
  assert.ok(quiet.tooltip.includes('یادآور فعال') && quiet.tooltip.includes('توضیح دارد'),quiet.tooltip);
  ok('v24.5 the block has no corner icons, keeps its bite frame, and gives the name full-height lines');

  const shapes = await page.evaluate(()=>{
    const saved=JSON.parse(JSON.stringify(DB.events));
    DB.events=[
      {id:'shape-tall',title:'جلسه با تیم محصول',days:[0],startMin:9*60,endMin:11*60,bite:'normal'},
      {id:'shape-short',title:'تماس کوتاه',days:[0],startMin:12*60+30,endMin:12*60+50},
      {id:'shape-tiny',title:'یادآوری سریع',days:[0],startMin:15*60,endMin:15*60+10}
    ];
    save(); showView('calendar'); renderCalendar();
    const blocks=[...document.querySelectorAll('#weekGrid .lp-cal-day[data-day="0"] .ev-block')];
    const title=blocks[0].querySelector('.ev-title');
    const range=document.createRange();
    range.selectNodeContents(title);
    const widest=Math.max(...[...range.getClientRects()].map(r=>r.width));
    const result={
      radius:blocks.map(b=>getComputedStyle(b).borderTopLeftRadius),
      corner:getComputedStyle(blocks[0]).borderTopLeftRadius,
      fitsWord:widest<=title.clientWidth+0.6,
      font:parseFloat(getComputedStyle(title).fontSize),
      tilted:getComputedStyle(blocks[0]).alignItems,
      valign:getComputedStyle(blocks[0]).justifyContent
    };
    DB.events=saved; save(); renderCalendar();
    return result;
  });
  assert.deepEqual(shapes.radius,['14px','11px','999px']);
  assert.ok(shapes.fitsWord && shapes.font>=8, JSON.stringify(shapes));
  assert.deepEqual({stretch:shapes.tilted,centre:shapes.valign},{stretch:'stretch',centre:'center'});
  ok('v24.5 blocks are softly rounded (pills when tiny) and the longest word always fits its box');

  const squashed = await page.evaluate(()=>{
    const saved=JSON.parse(JSON.stringify(DB.events));
    DB.events=[
      {id:'gap-before',title:'قبل',days:[1],startMin:8*60,endMin:10*60},
      {id:'gap-after',title:'بعد',days:[1],startMin:11*60,endMin:12*60},
      {id:'gap-mover',title:'رویداد بزرگ',days:[1],startMin:14*60,endMin:15*60+30}
    ];
    save(); showView('calendar'); renderCalendar();
    // a 90-minute block dropped 15 minutes into a 60-minute hole
    const mover=()=>DB.events.find(e=>e.id==='gap-mover');
    const setMover=(days,startMin,endMin)=>{ const e=mover(); e.days=days; e.startMin=startMin; e.endMin=endMin; save(); renderCalendar(); };
    const snap=e=>({day:eventDays(e)[0],start:e.startMin,end:e.endMin});
    const preview=lpFitEventInGap(1,10*60+15,90,'gap-mover');
    lpApplyEventDrag(mover(),1,1,10*60+15);
    const squashed=snap(mover());
    // a 60-minute block dropped on the last quarter of that hole slides back in
    setMover([1],8*60,9*60);
    lpApplyEventDrag(mover(),1,1,10*60+45);
    const slid=snap(mover());
    // plenty of room on another column → nothing shrinks
    setMover([1],14*60,15*60+30);
    lpApplyEventDrag(mover(),1,3,9*60);
    const roomy={...snap(mover()),duration:eventEndMinutes(mover())-eventStartMinutes(mover())};
    // a drop straight ON another block is still the old answer (never a shrink)
    setMover([1],14*60,15*60+30);
    const onBlock=lpFitEventInGap(1,8*60+30,90,'gap-mover');
    const result={
      preview:{start:preview&&preview.start,duration:preview&&preview.duration,shrunk:preview&&preview.shrunk},
      squashed,
      slid,
      roomy,
      onBlock
    };
    DB.events=saved; save(); renderCalendar();
    return result;
  });
  assert.deepEqual(squashed.preview,{start:600,duration:60,shrunk:true});
  assert.deepEqual(squashed.squashed,{day:1,start:600,end:660});
  assert.deepEqual(squashed.slid,{day:1,start:600,end:660});
  assert.deepEqual(squashed.roomy,{day:3,start:540,end:630,duration:90});
  assert.equal(squashed.onBlock,null);
  ok('v24.5 a block dropped into a hole shrinks into it, slides back in when it overhangs, and never shrinks where there is room');

  await page.evaluate(()=>{
    window.__savedEvents=JSON.parse(JSON.stringify(DB.events)); // the later tests keep using them
    DB.events=[
      {id:'live-before',title:'قبل',days:[1],startMin:8*60,endMin:10*60},
      {id:'live-after',title:'بعد',days:[1],startMin:11*60,endMin:12*60},
      {id:'live-mover',title:'رویداد بزرگ',days:[1],startMin:14*60,endMin:15*60+30}
    ];
    save(); showView('calendar'); renderCalendar();
    document.querySelector('#weekGrid .lp-cal-wrap').scrollIntoView({block:'start'});
  });
  const live = await page.evaluate(()=>{
    const col=document.querySelector('#weekGrid .lp-cal-day[data-day="1"]').getBoundingClientRect();
    const block=[...document.querySelectorAll('#weekGrid .lp-cal-day[data-day="1"] .ev-block')]
      .find(b=>b.textContent.includes('رویداد بزرگ')).getBoundingClientRect();
    const at=min=>Math.round(col.top+((min-6*60)/60)*52);
    return {x:Math.round(col.left+col.width/2), from:{x:Math.round(block.left+block.width/2),y:Math.round(block.top+block.height/2)}, grabY:Math.round(block.height/2), at610:at(610)};
  });
  await page.mouse.move(live.from.x,live.from.y);
  await page.mouse.down();
  await page.mouse.move(live.x,live.at610+live.grabY,{steps:10});
  await new Promise(resolve=>setTimeout(resolve,150));
  const ghost = await page.evaluate(()=>{
    const g=document.querySelector('#weekGrid .ev-ghost');
    return g?{height:parseFloat(g.style.height),fit:g.classList.contains('ev-ghost-fit'),label:g.textContent}:null;
  });
  await page.mouse.up();
  await new Promise(resolve=>setTimeout(resolve,120));
  const landed = await page.evaluate(()=>{
    const e=DB.events.find(x=>x.id==='live-mover');
    const out={start:e.startMin,end:e.endMin};
    DB.events=window.__savedEvents; delete window.__savedEvents;
    save(); renderCalendar();
    return out;
  });
  assert.ok(ghost && ghost.fit && Math.round(ghost.height)===50,JSON.stringify(ghost));
  assert.ok(ghost.label.includes('10:00') && ghost.label.includes('11:00'),ghost.label);
  assert.deepEqual(landed,{start:600,end:660});
  ok('v24.5 dragging shows the block already shrunk to the hole, and the drop lands exactly there');

  await page.evaluate(()=>{localStorage.setItem('lifePlannerLang_v1','en');});
  await page.reload({waitUntil:'load'});
  await new Promise(resolve=>setTimeout(resolve,400));
  const english = await page.evaluate(async ()=>{
    showView('calendar'); openEventModal();
    const ev=DB.events.find(e=>e.title==='آزمون heavy');
    onEventBlockClick(ev.id,0);
    // The language layer translates newly inserted nodes on the next frame.
    await new Promise(resolve=>setTimeout(resolve,100));
    const summary=document.getElementById('eventActionDetails').textContent;
    closeModal('eventActionModalBg'); openEventModal();
    return {label:document.querySelector('#eBite').closest('.field').querySelector('label').textContent,
      hint:document.getElementById('eBiteHint').textContent,
      choices:[...document.querySelectorAll('#eBite .chip-opt')].map(b=>b.textContent.trim()),summary};
  });
  assert.equal(english.label,'Bite size (optional)');
  assert.equal(english.hint,'The bite only colors the event frame; choose the block color separately.');
  assert.deepEqual(english.choices,['No selection','🧆 Baklava bite','🍽️ Normal bite','🍲 Heavy bite']);
  assert.ok(english.summary.includes('Heavy bite'),JSON.stringify(english));
  ok('bite labels, color hint, and event details translate to English');

  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  await page.evaluate(()=>{openEventModal(); document.getElementById('eBite').scrollIntoView({block:'center'});});
  const mobile = await page.evaluate(()=>{
    const modal=document.querySelector('#eventModalBg .modal').getBoundingClientRect();
    return [...document.querySelectorAll('#eBite .chip-opt')].every(b=>{
      const r=b.getBoundingClientRect();
      return r.left>=modal.left && r.right<=modal.right && r.width>0 && r.height>0;
    });
  });
  ok('all bite choices fit the mobile event sheet',mobile);
  await page.tap('#eBite [data-v="baklava"]');
  assert.equal(await page.evaluate(()=>lpGetEventBite()),'baklava');
  ok('bite selection works with a real mobile tap');
  assert.deepEqual(errors,[]);
  ok('no browser JavaScript errors');
  console.log(`\n${passed} CALENDAR BITE TESTS PASSED`);
}finally{
  if(browser) await browser.close();
  await new Promise(resolve=>server.close(resolve));
}

