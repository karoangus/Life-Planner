/** Regression tests for copying one calendar occurrence to the nearest free slot. */
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import chromium, { inflate } from '@sparticuz/chromium';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()){
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});
    fs.createReadStream(file).pipe(res);
  }else{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  const packageDir=path.dirname(path.dirname(fileURLToPath(import.meta.resolve('@sparticuz/chromium'))));
  const libDir=await inflate(path.join(packageDir,'bin','al2023.tar.br'));
  browser=await puppeteer.launch({executablePath:await chromium.executablePath(),headless:true,
    args:[...chromium.args,'--no-sandbox','--disable-gpu'],
    env:{...process.env,LD_LIBRARY_PATH:`${path.join(libDir,'lib')}:${process.env.LD_LIBRARY_PATH||''}`}});
  const page=await browser.newPage();
  await page.setViewport({width:400,height:650});
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  const cdp=await page.createCDPSession();
  await cdp.send('Network.setBypassServiceWorker',{bypass:true});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'load'});
  await page.evaluate(()=>{
    const dismiss=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('فعلاً باس مشخصی ندارم'));
    if(dismiss)dismiss.click();
    DB.events=[{id:'original',title:'تمرین',desc:'توضیحات',days:[1,3],startMin:600,endMin:660,
      startHour:10,endHour:11,cat:'cat',color:'#123456',difficulty:'hard',reminder:false,active:true}];
    save();showView('calendar');renderCalendar();
    window.scrollTo(0,0);
  });
  // Exercise the actual action menu and button, including scroll and highlight.
  const result=await page.evaluate(()=>{
    onEventBlockClick('original',3);
    document.getElementById('copyEventBtn').click();
    const copy=DB.events.find(e=>e.id!=='original');
    const block=[...document.querySelectorAll('.ev-block')].find(el=>el.dataset.eventId===copy.id);
    const rect=block.getBoundingClientRect();
    return {copy,original:DB.events.find(e=>e.id==='original'),highlight:block.classList.contains('lp-event-copy-highlight'),
      visible:rect.top<innerHeight&&rect.bottom>0,scrollY,modalOpen:document.getElementById('eventActionModalBg').classList.contains('open')};
  });
  assert.deepEqual(result.copy.days,[3]);
  assert.deepEqual(result.original.days,[1,3]);
  assert.equal(result.copy.startMin,660); assert.equal(result.copy.endMin,720);
  for(const prop of ['title','desc','cat','color','difficulty','reminder','active'])assert.equal(result.copy[prop],result.original[prop]);
  assert.ok(result.highlight && result.visible && result.scrollY>0 && !result.modalOpen);
  await page.reload({waitUntil:'load'});
  assert.equal(await page.evaluate(()=>DB.events.length),2,'copy persists after reload');
  console.log('✅ menu copies the selected occurrence, preserves fields, scrolls to it, and persists');

  const scenarios=await page.evaluate(()=>{
    const source={id:'s',title:'source',days:[1],startMin:600,endMin:660,active:true};
    DB.events=[source,{id:'after',days:[1],startMin:660,endMin:720,active:true}];
    const backward=calNearestCopySlot(source,1);
    // Inactive blocks do not occupy a slot; an inactive source still cannot copy onto itself.
    DB.events=[{...source,active:false},{id:'faded',days:[1],startMin:660,endMin:720,active:false}];
    const inactive=calNearestCopySlot(DB.events[0],1);
    // Overnight source crosses the week boundary. Its closest forward copy is
    // 01:00 Saturday, drawn in Friday's night tail.
    const night={id:'night',days:[6],startMin:1380,endMin:1500,active:true};
    DB.events=[night];
    const overnight=calNearestCopySlot(night,6);
    const placement=calEventPlacements(overnight)[0];
    // No hidden 03:00–06:00 start, even when it would be closer.
    const early={id:'early',days:[1],startMin:120,endMin:180,active:true};
    DB.events=[early,{id:'before',days:[1],startMin:0,endMin:120,active:true}];
    const visible=calNearestCopySlot(early,1);
    // A completely booked week must leave the menu and data untouched.
    DB.events=[{id:'full',title:'full',days:[0,1,2,3,4,5,6],startMin:0,endMin:1440,active:true}];
    onEventBlockClick('full',1);
    document.getElementById('copyEventBtn').click();
    return {backward,inactive,overnight,placement,visible,count:DB.events.length,
      stillOpen:document.getElementById('eventActionModalBg').classList.contains('open')};
  });
  assert.equal(scenarios.backward.startMin,540);
  assert.equal(scenarios.inactive.startMin,660);
  assert.deepEqual(scenarios.overnight.days,[0]); assert.equal(scenarios.overnight.startMin,60);
  assert.equal(scenarios.placement.col,6); assert.equal(scenarios.placement.from,1500);
  assert.ok(scenarios.visible.startMin<180||scenarios.visible.startMin>=360);
  assert.equal(scenarios.count,1); assert.ok(scenarios.stillOpen);
  assert.deepEqual(errors,[]);
  console.log('✅ nearest gaps, inactive events, overnight/week wrap, hidden hours and full week');
}finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
