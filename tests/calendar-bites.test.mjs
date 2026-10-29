/**
 * Calendar regression tests: bite-only events and their shared colors.
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
    colorHidden:document.getElementById('eColorField').hidden
  }));
  assert.deepEqual(selection,{value:'normal',selected:1,pressed:['normal'],colorHidden:true});
  await page.click('#eBite [data-v=""]');
  selection = await page.evaluate(()=>({value:lpGetEventBite(),colorHidden:document.getElementById('eColorField').hidden}));
  assert.deepEqual(selection,{value:null,colorHidden:false});
  ok('bite selection stays single-choice, accessible, and hides the competing color picker');

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
    assert.equal(event.color,'#8b6bff'); // retained for clearing the bite later
    const view = await page.evaluate(id=>{
      const block=[...document.querySelectorAll('.ev-block')].find(b=>b.getAttribute('aria-label')?.startsWith(DB.events.find(e=>e.id===id).title));
      const chip=document.querySelector(`#eBite [data-v="${DB.events.find(e=>e.id===id).bite}"]`);
      const style=getComputedStyle(block);
      block.click();
      const summary=document.getElementById('eventActionDetails').textContent;
      const dot=getComputedStyle(document.querySelector('#eventActionDetails .lp-bite-dot')).backgroundColor;
      closeModal('eventActionModalBg');
      return {border:style.borderTopColor,background:style.backgroundImage,chip:getComputedStyle(chip).borderTopColor,
        summary,dot};
    },event.id);
    assert.equal(view.border,rgb(color));
    assert.equal(view.chip,rgb(color));
    assert.equal(view.dot,rgb(color));
    assert.ok(view.background.includes(rgb(color).replace('rgb(', 'rgba(').replace(')', ', 0.5)')));
    assert.ok(view.summary.includes(`لقمه ${ {heavy:'سنگین',normal:'معمولی',baklava:'باقلوا'}[bite] }`));
    assert.ok(!view.summary.includes('انرژی'));
    ok(`${bite}: stored without energy; picker, block, and details share ${color}`);
  }
  const markers = await page.evaluate(()=>({
    badges:document.querySelectorAll('.ev-block[aria-label^="آزمون"] .ev-trait').length,
    groups:document.querySelectorAll('.ev-block[aria-label^="آزمون"] .ev-traits').length
  }));
  assert.deepEqual(markers,{badges:3,groups:3});
  ok('each event has exactly one bite marker, never an extra energy badge');

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
  assert.deepEqual(drag,{bite:'baklava',color:palette.baklava,energy:false});
  const resized = await createEvent({title:'سری تغییر مدت',bite:'normal',days:[1,2],start:'14:00',end:'15:00'});
  const resize = await page.evaluate(id=>{
    lpApplyEventResize(DB.events.find(e=>e.id===id),1,0,14*60,15*60+15,'end');
    const split=DB.events.find(e=>e.title==='سری تغییر مدت' && e.id!==id);
    return {bite:split.bite,color:eventColor(split),energy:Object.hasOwn(split,'energy'),duration:eventEndMinutes(split)-eventStartMinutes(split)};
  },resized.id);
  assert.deepEqual(resize,{bite:'normal',color:palette.normal,energy:false,duration:75});
  ok('dragging and resizing preserve the bite and never recreate energy');

  const fallback = await page.evaluate(()=>{
    DB.events.push({id:'untouched-legacy',title:'داده قدیمی دست‌نخورده',days:[0],startMin:14*60,endMin:15*60,energy:'low',bite:null,color:null,reminder:false});
    save(); renderCalendar();
    return {unknown:eventColor({bite:'unknown',color:'#60a5fa'}),category:eventColor({cat:'bite-test-category'}),theme:eventColor({})};
  });
  assert.deepEqual(fallback,{unknown:'#60a5fa',category:'#00e5ff',theme:null});
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
  assert.equal(english.hint,'The event color matches the selected bite.');
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

