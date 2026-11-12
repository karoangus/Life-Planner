/**
 * Calendar regression tests: difficulty frames (easy/medium/hard) replacing
 * bite-size pickers, with independent event body colors and normal blocks when
 * no difficulty is selected.
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
  await page.waitForSelector('#eDifficulty');
  await page.evaluate(()=>{
    const dismiss = [...document.querySelectorAll('button')].find(b=>b.textContent.includes('فعلاً باس مشخصی ندارم'));
    if(dismiss) dismiss.click();
    DB.events=[];
    DB.categories=[{id:'diff-test-category',name:'آزمون سختی',color:'#00e5ff'}];
    save(); showView('calendar');
  });

  const ui = await page.evaluate(()=>{
    openEventModal();
    const modalText = document.getElementById('eventModalBg').textContent;
    return {
      energy:!!document.getElementById('eEnergy'),
      bite:!!document.getElementById('eBite'),
      energyText:modalText.includes('انرژی'),
      biteText:modalText.includes('لقمه'),
      choices:[...document.querySelectorAll('#eDifficulty .chip-opt')].map(b=>b.dataset.v),
      labels:[...document.querySelectorAll('#eDifficulty .chip-opt')].map(b=>b.textContent.trim()),
      selected:document.querySelectorAll('#eDifficulty .sel').length,
      pressed:document.querySelector('#eDifficulty [data-v=""]').getAttribute('aria-pressed'),
      colorVisible:!document.getElementById('eColorField').hidden
    };
  });
  assert.deepEqual(ui,{
    energy:false,
    bite:false,
    energyText:false,
    biteText:false,
    choices:['','easy','medium','hard'],
    labels:['بدون انتخاب','آسون','متوسط','سخت'],
    selected:1,
    pressed:'true',
    colorVisible:true
  });
  ok('event form replaces bite-sizing with one optional difficulty picker (بدون انتخاب / آسون / متوسط / سخت)');

  // Real pointer input checks that the generic chip handler cannot leave
  // stale aria-pressed states behind when the difficulty handler runs.
  await page.click('#eDifficulty [data-v="medium"]');
  let selection = await page.evaluate(()=>({
    value:lpGetEventDifficulty(),
    selected:document.querySelectorAll('#eDifficulty .sel').length,
    pressed:[...document.querySelectorAll('#eDifficulty [aria-pressed="true"]')].map(b=>b.dataset.v),
    colorVisible:!document.getElementById('eColorField').hidden
  }));
  assert.deepEqual(selection,{value:'medium',selected:1,pressed:['medium'],colorVisible:true});
  await page.click('#eDifficulty [data-v=""]');
  selection = await page.evaluate(()=>({value:lpGetEventDifficulty(),colorVisible:!document.getElementById('eColorField').hidden}));
  assert.deepEqual(selection,{value:null,colorVisible:true});
  ok('difficulty selection stays single-choice and accessible; the body color picker remains available');

  const palette = {easy:'#16a34a',medium:'#eab308',hard:'#ef4444'};
  const rgb = hex => `rgb(${parseInt(hex.slice(1,3),16)}, ${parseInt(hex.slice(3,5),16)}, ${parseInt(hex.slice(5,7),16)})`;
  async function createEvent({title,difficulty=null,days=[0],start='08:00',end='09:00',custom=true,useCat=true}){
    return page.evaluate(async options=>{
      openEventModal();
      document.getElementById('eTitle').value=options.title;
      document.getElementById('eHourStart').value=options.start;
      document.getElementById('eHourEnd').value=options.end;
      document.querySelectorAll('#eDays .chip-opt').forEach(b=>b.classList.toggle('sel',options.days.includes(Number(b.dataset.v))));
      if(options.useCat) document.querySelector('#eCats [data-cid="diff-test-category"]').click();
      if(options.custom) document.querySelector('#eColorRow [data-c="#8b6bff"]').click();
      if(options.difficulty) document.querySelector(`#eDifficulty [data-v="${options.difficulty}"]`).click();
      await saveEvent();
      return JSON.parse(JSON.stringify(DB.events.find(e=>e.title===options.title)));
    },{title,difficulty,days,start,end,custom,useCat});
  }

  // "بدون انتخاب": nothing happens and the block stays completely normal.
  const normalBlock = await createEvent({title:'آزمون عادی',difficulty:null,days:[6],start:'08:00',end:'09:00',custom:true});
  assert.equal(normalBlock.difficulty,null);
  assert.equal(Object.hasOwn(normalBlock,'bite'),false);
  assert.equal(Object.hasOwn(normalBlock,'energy'),false);
  const normalView = await page.evaluate(id=>{
    const block=[...document.querySelectorAll('.ev-block')].find(b=>b.textContent.trim()==='آزمون عادی');
    const style=getComputedStyle(block);
    block.click();
    const hasTraitSummary=!!document.querySelector('#eventActionDetails .lp-event-trait-summary');
    closeModal('eventActionModalBg');
    return {
      classes:[...block.classList],
      hasAriaLabel:block.hasAttribute('aria-label'),
      borderWidth:style.borderTopWidth,
      borderColor:style.borderTopColor,
      background:style.backgroundImage,
      hasTraitSummary
    };
  },normalBlock.id);
  assert.equal(normalView.classes.some(c=>c.startsWith('ev-difficulty-')||c.startsWith('ev-bite-')),false);
  assert.equal(normalView.hasAriaLabel,false);
  assert.equal(normalView.borderWidth,'1px');
  assert.equal(normalView.borderColor,'rgba(139, 107, 255, 0.7)');
  assert.ok(normalView.background.includes('rgba(139, 107, 255, 0.5)'));
  assert.equal(normalView.hasTraitSummary,false);
  ok('بدون انتخاب: nothing special happens and the block stays its normal 1px self');

  for(const [index,[difficulty,color]] of Object.entries(palette).entries()){
    const event = await createEvent({title:`آزمون ${difficulty}`,difficulty,days:[index]});
    assert.equal(event.difficulty,difficulty);
    assert.equal(Object.hasOwn(event,'bite'),false);
    assert.equal(Object.hasOwn(event,'energy'),false);
    assert.equal(event.cat,'diff-test-category');
    assert.equal(event.color,'#8b6bff'); // the body keeps the user's chosen color
    const view = await page.evaluate(id=>{
      const ev=DB.events.find(e=>e.id===id);
      const block=[...document.querySelectorAll('.ev-block')].find(b=>b.getAttribute('aria-label')?.startsWith(ev.title));
      const chip=document.querySelector(`#eDifficulty [data-v="${ev.difficulty}"]`);
      const style=getComputedStyle(block);
      block.click();
      const summary=document.getElementById('eventActionDetails').textContent;
      const dot=getComputedStyle(document.querySelector('#eventActionDetails .lp-difficulty-dot')).backgroundColor;
      closeModal('eventActionModalBg');
      return {border:style.borderTopColor,borderWidth:style.borderTopWidth,background:style.backgroundImage,chip:getComputedStyle(chip).borderTopColor,
        summary,dot};
    },event.id);
    assert.equal(view.border,rgb(color));
    assert.equal(view.borderWidth,'3px');
    assert.equal(view.chip,rgb(color));
    assert.equal(view.dot,rgb(color));
    // The frame is the difficulty color, while the body stays the user's purple.
    assert.ok(view.background.includes('rgba(139, 107, 255, 0.5)'));
    assert.ok(!view.background.includes(rgb(color).replace('rgb(', 'rgba(').replace(')', ', 0.5)')));
    assert.ok(view.summary.includes(`سختی: ${ {easy:'آسون',medium:'متوسط',hard:'سخت'}[difficulty] }`));
    assert.ok(!view.summary.includes('لقمه') && !view.summary.includes('انرژی'));
    ok(`${difficulty}: frame uses ${color}, while the block body keeps the user's color`);
  }
  const markers = await page.evaluate(()=>({
    badges:document.querySelectorAll('.ev-block .ev-trait,.ev-block .ev-traits').length,
    dots:document.querySelectorAll('.ev-block .ev-reminder-dot').length,
    children:[...document.querySelectorAll('.ev-block[aria-label^="آزمون"]')]
      .map(b=>[...b.children].filter(c=>!c.classList.contains('ev-resize-handle')).map(c=>c.className))
  }));
  assert.deepEqual(markers,{badges:0,dots:0,children:[['ev-title'],['ev-title'],['ev-title']]});
  ok('v24.5+ the box carries nothing but its name — no corner emoji, no reminder dot, no corner glyph');

  const categoryBody = await createEvent({title:'آزمون رنگ دسته',difficulty:'medium',days:[4],start:'16:00',end:'17:00',custom:false});
  const categoryView = await page.evaluate(id=>{
    const block=[...document.querySelectorAll('.ev-block')].find(b=>b.getAttribute('aria-label')?.startsWith(DB.events.find(e=>e.id===id).title));
    const style=getComputedStyle(block);
    return {background:style.backgroundImage,border:style.borderTopColor};
  },categoryBody.id);
  assert.ok(categoryView.background.includes('rgba(0, 229, 255, 0.5)'));
  assert.equal(categoryView.border,rgb(palette.medium));
  ok('a difficulty event without a custom color keeps the category color in its body');

  const recolor = await page.evaluate(async ()=>{
    const ev=DB.events.find(e=>e.title==='آزمون easy');
    onEventBlockClick(ev.id,0); startEditEvent();
    const pickerVisible=!document.getElementById('eColorField').hidden;
    document.querySelector('#eColorRow [data-c="#60a5fa"]').click();
    await saveEvent();
    const block=[...document.querySelectorAll('.ev-block')].find(b=>b.getAttribute('aria-label')?.startsWith('آزمون easy'));
    const style=getComputedStyle(block);
    return {pickerVisible,background:style.backgroundImage,border:style.borderTopColor};
  });
  assert.equal(recolor.pickerVisible,true);
  assert.ok(recolor.background.includes('rgba(96, 165, 250, 0.5)'));
  assert.equal(recolor.border,rgb(palette.easy));
  ok('the user can recolor the block body while the difficulty frame stays unchanged');

  const legacy = await page.evaluate(async ()=>{
    DB.events.push({id:'legacy-bite',title:'قدیمی با لقمه',days:[3],startMin:480,endMin:540,energy:'high',bite:'heavy',color:'#60a5fa',reminder:false});
    save(); renderCalendar();
    const before=eventColor(DB.events.find(e=>e.id==='legacy-bite'));
    const block=[...document.querySelectorAll('.ev-block')].find(b=>b.textContent.trim()==='قدیمی با لقمه');
    const borderWidthBefore=getComputedStyle(block).borderTopWidth;
    onEventBlockClick('legacy-bite',3);
    const summary=document.getElementById('eventActionDetails').textContent;
    startEditEvent();
    const selected=lpGetEventDifficulty();
    await saveEvent();
    const after=DB.events.find(e=>e.id==='legacy-bite');
    return {
      before,
      borderWidthBefore,
      hasLegacyTerms:summary.includes('انرژی')||summary.includes('لقمه'),
      selected,
      energy:Object.hasOwn(after,'energy'),
      bite:Object.hasOwn(after,'bite'),
      color:eventColor(after),
      difficulty:after.difficulty
    };
  });
  assert.deepEqual(legacy,{
    before:'#60a5fa',
    borderWidthBefore:'1px',
    hasLegacyTerms:false,
    selected:null,
    energy:false,
    bite:false,
    color:'#60a5fa',
    difficulty:null
  });
  ok('legacy bite/energy events render normally, keep their body color, and retire old fields when edited');

  const clearHard = await page.evaluate(async ()=>{
    const ev=DB.events.find(e=>e.title==='آزمون hard');
    onEventBlockClick(ev.id,2); startEditEvent();
    const prefilled=lpGetEventDifficulty();
    document.querySelector('#eDifficulty [data-v=""]').click();
    await saveEvent();
    const updated=DB.events.find(e=>e.id===ev.id);
    const block=[...document.querySelectorAll('.ev-block')].find(b=>b.textContent.trim()==='آزمون hard');
    return {prefilled,difficulty:updated.difficulty,color:eventColor(updated),borderWidth:getComputedStyle(block).borderTopWidth};
  });
  assert.deepEqual(clearHard,{prefilled:'hard',difficulty:null,color:'#8b6bff',borderWidth:'1px'});
  ok('editing pre-fills difficulty; choosing بدون انتخاب restores the normal 1px border and custom color');

  const series = await createEvent({title:'سری ویرایش',difficulty:'medium',days:[3,4],start:'10:00',end:'11:00'});
  const dayEdit = await page.evaluate(async id=>{
    onEventBlockClick(id,3); startEditEventThisDay();
    const prefilled=lpGetEventDifficulty();
    document.querySelector('#eDifficulty [data-v="easy"]').click();
    await saveEvent();
    const edited=DB.events.find(e=>e.id!==id && e.title==='سری ویرایش' && eventDays(e).includes(3));
    const rest=DB.events.find(e=>e.id===id);
    return {
      prefilled,
      edited:{difficulty:edited.difficulty,days:eventDays(edited),bite:Object.hasOwn(edited,'bite'),energy:Object.hasOwn(edited,'energy')},
      rest:{difficulty:rest.difficulty,days:eventDays(rest)}
    };
  },series.id);
  assert.deepEqual(dayEdit,{prefilled:'medium',edited:{difficulty:'easy',days:[3],bite:false,energy:false},rest:{difficulty:'medium',days:[4]}});
  ok('editing one day detaches only that occurrence with its new difficulty and color');

  const moved = await createEvent({title:'سری جابه‌جایی',difficulty:'hard',days:[5,6],start:'10:00',end:'11:00'});
  const drag = await page.evaluate(id=>{
    lpApplyEventDrag(DB.events.find(e=>e.id===id),5,0,12*60);
    const split=DB.events.find(e=>e.title==='سری جابه‌جایی' && e.id!==id);
    return {difficulty:split.difficulty,color:eventColor(split),bite:Object.hasOwn(split,'bite'),energy:Object.hasOwn(split,'energy')};
  },moved.id);
  assert.deepEqual(drag,{difficulty:'hard',color:'#8b6bff',bite:false,energy:false});
  const resized = await createEvent({title:'سری تغییر مدت',difficulty:'medium',days:[1,2],start:'14:00',end:'15:00'});
  const resize = await page.evaluate(id=>{
    lpApplyEventResize(DB.events.find(e=>e.id===id),1,0,14*60,15*60+15,'end');
    const split=DB.events.find(e=>e.title==='سری تغییر مدت' && e.id!==id);
    return {difficulty:split.difficulty,color:eventColor(split),bite:Object.hasOwn(split,'bite'),energy:Object.hasOwn(split,'energy'),duration:eventEndMinutes(split)-eventStartMinutes(split)};
  },resized.id);
  assert.deepEqual(resize,{difficulty:'medium',color:'#8b6bff',bite:false,energy:false,duration:75});
  ok('dragging and resizing preserve the difficulty frame and body color, and never recreate retired fields');

  const fallback = await page.evaluate(()=>{
    DB.events.push({id:'untouched-legacy',title:'داده قدیمی دست‌نخورده',days:[0],startMin:14*60,endMin:15*60,energy:'low',bite:'baklava',color:null,reminder:false});
    save(); renderCalendar();
    return {
      unknown:eventColor({difficulty:'unknown',color:'#60a5fa'}),
      category:eventColor({cat:'diff-test-category'}),
      theme:eventColor({}),
      diffCustom:eventColor({difficulty:'easy',color:'#8b6bff'}),
      diffCategory:eventColor({difficulty:'medium',cat:'diff-test-category'}),
      diffTheme:eventColor({difficulty:'hard'})
    };
  });
  assert.deepEqual(fallback,{unknown:'#60a5fa',category:'#00e5ff',theme:null,diffCustom:'#8b6bff',diffCategory:'#00e5ff',diffTheme:null});
  await page.reload({waitUntil:'load'});
  const persisted = await page.evaluate(()=>({
    events:DB.events.map(e=>({id:e.id,difficulty:e.difficulty,bite:e.bite,energy:e.energy})),
    backup:buildBackupPayload().events.map(e=>({id:e.id,difficulty:e.difficulty,bite:e.bite,energy:e.energy}))
  }));
  assert.deepEqual(persisted.backup,persisted.events);
  assert.equal(persisted.events.find(e=>e.id===moved.id).difficulty,'hard');
  assert.equal(persisted.events.find(e=>e.id===resized.id).difficulty,'medium');
  assert.equal(persisted.events.find(e=>e.id==='untouched-legacy').energy,'low');
  assert.equal(persisted.events.find(e=>e.id==='untouched-legacy').bite,'baklava');
  assert.ok(persisted.events.filter(e=>e.id!=='untouched-legacy').every(e=>e.energy===undefined && e.bite===undefined));
  ok('difficulties survive reload and backup; unedited legacy data is not destructively migrated');

  /* ---------- v24.5: a quiet box, a readable name, a drop that fits ---------- */
  const quiet = await page.evaluate(()=>{
    const saved=JSON.parse(JSON.stringify(DB.events));
    DB.events=[{id:'quiet-box',title:'جلسه با تیم محصول',days:[0],startMin:9*60,endMin:11*60,
      reminder:true,desc:'دستور جلسه',difficulty:'medium'}];
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
  ok('v24.5 the block has no corner icons, keeps its difficulty frame, and gives the name full-height lines');

  const shapes = await page.evaluate(()=>{
    const saved=JSON.parse(JSON.stringify(DB.events));
    DB.events=[
      {id:'shape-tall',title:'جلسه با تیم محصول',days:[0],startMin:9*60,endMin:11*60,difficulty:'medium'},
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
    const mover=()=>DB.events.find(e=>e.id==='gap-mover');
    const setMover=(days,startMin,endMin)=>{ const e=mover(); e.days=days; e.startMin=startMin; e.endMin=endMin; save(); renderCalendar(); };
    const snap=e=>({day:eventDays(e)[0],start:e.startMin,end:e.endMin});
    const preview=lpFitEventInGap(1,10*60+15,90,'gap-mover');
    lpApplyEventDrag(mover(),1,1,10*60+15);
    const squashed=snap(mover());
    setMover([1],8*60,9*60);
    lpApplyEventDrag(mover(),1,1,10*60+45);
    const slid=snap(mover());
    setMover([1],14*60,15*60+30);
    lpApplyEventDrag(mover(),1,3,9*60);
    const roomy={...snap(mover()),duration:eventEndMinutes(mover())-eventStartMinutes(mover())};
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
    window.__savedEvents=JSON.parse(JSON.stringify(DB.events));
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
    const ev=DB.events.find(e=>e.title==='آزمون easy');
    onEventBlockClick(ev.id,0);
    // The language layer translates newly inserted nodes on the next frame.
    await new Promise(resolve=>setTimeout(resolve,100));
    const summary=document.getElementById('eventActionDetails').textContent;
    closeModal('eventActionModalBg'); openEventModal();
    return {
      label:document.querySelector('#eDifficulty').closest('.field').querySelector('label').textContent,
      hint:document.getElementById('eDifficultyHint').textContent,
      choices:[...document.querySelectorAll('#eDifficulty .chip-opt')].map(b=>b.textContent.trim()),
      summary
    };
  });
  assert.equal(english.label,'Difficulty (optional)');
  assert.equal(english.hint,'Difficulty only colors the block frame green, yellow, or red; with no selection, the block stays normal.');
  assert.deepEqual(english.choices,['No selection','Easy','Medium','Hard']);
  assert.ok(english.summary.includes('Difficulty: Easy'),JSON.stringify(english));
  ok('difficulty labels, color hint, and event details translate to English');

  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  await page.evaluate(()=>{openEventModal(); document.getElementById('eDifficulty').scrollIntoView({block:'center'});});
  const mobile = await page.evaluate(()=>{
    const modal=document.querySelector('#eventModalBg .modal').getBoundingClientRect();
    return [...document.querySelectorAll('#eDifficulty .chip-opt')].every(b=>{
      const r=b.getBoundingClientRect();
      return r.left>=modal.left && r.right<=modal.right && r.width>0 && r.height>0;
    });
  });
  ok('all difficulty choices fit the mobile event sheet',mobile);
  await page.tap('#eDifficulty [data-v="hard"]');
  assert.equal(await page.evaluate(()=>lpGetEventDifficulty()),'hard');
  ok('difficulty selection works with a real mobile tap');
  assert.deepEqual(errors,[]);
  ok('no browser JavaScript errors');
  console.log(`\n${passed} CALENDAR DIFFICULTY TESTS PASSED`);
}finally{
  if(browser) await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
