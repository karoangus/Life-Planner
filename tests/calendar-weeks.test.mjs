/**
 * v24 — week-scoped calendar regression tests.
 *
 * Runs the real app in the bundled Chromium (no browser download needed):
 * one week must never leak its plan into another week, fixed events must keep
 * going, even/odd and hand-picked weeks must alternate, and «only this week»
 * edits/deletes must leave the rest of the series alone.
 *
 * Run with `npm run test:weeks` (also part of `npm test`).
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
  await new Promise(resolve=>setTimeout(resolve,1500));
  await page.waitForSelector('#eRepeat');

  // A clean start: no events, this week is the even anchor, calendar is shown.
  const reset = ()=>page.evaluate(()=>{
    const dismiss=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('فعلاً باس مشخصی ندارم'));
    if(dismiss) dismiss.click();
    DB.events=[];
    DB.calWeekAnchor=weekDates(0)[0];
    save();
    calWeekShift(0);
    showView('calendar');
  });
  await reset();

  /* Create an event through the real sheet. weekOffsets are relative to the
     current week (only used by repeat:'weeks'). */
  async function create(o){
    return page.evaluate(async o=>{
      openEventModal();
      document.getElementById('eTitle').value=o.title;
      document.getElementById('eHourStart').value=o.start||'09:00';
      document.getElementById('eHourEnd').value=o.end||'10:00';
      const days=o.days||[0];
      document.querySelectorAll('#eDays .chip-opt').forEach(b=>b.classList.toggle('sel',days.includes(Number(b.dataset.v))));
      const mode=o.mode||'once';
      const chip=document.querySelector(`#eRepeat [data-v="${mode}"]`);
      if(!chip.classList.contains('sel')) chip.click();
      if(mode==='weeks'){
        const wanted=(o.weekOffsets||[]).map(n=>lpWeekAdd(weekDates(0)[0],n));
        // make every wanted week visible in the picker
        let guard=0;
        while(wanted.length && !document.querySelector(`#eWeekPicker .lp-week-row[data-wk="${wanted[wanted.length-1]}"]`) && guard++<4){
          const more=document.querySelector('#eWeekPicker [data-more]'); if(!more) break; more.click();
        }
        for(const k of [...new Set([...wanted,window.__eventWeekKey])]){
          const row=document.querySelector(`#eWeekPicker .lp-week-row[data-wk="${k}"]`);
          if(!row) continue;
          const should=wanted.includes(k);
          if(row.classList.contains('sel')!==should) row.click();
        }
      }
      await saveEvent();
      return JSON.parse(JSON.stringify(DB.events[DB.events.length-1]));
    },o);
  }
  const titles = (offset=null)=>page.evaluate(o=>{
    if(o!==null) calWeekShift(o);
    return [...document.querySelectorAll('#weekGrid .ev-block .ev-title')].map(x=>x.textContent);
  },offset);
  const closeSheets = ()=>page.evaluate(()=>{
    closeModal('eventModalBg'); closeModal('eventActionModalBg');
  });

  // ---------- 1. the form defaults to «only this week» ----------
  const form = await page.evaluate(()=>{
    openEventModal();
    const out={
      selected:document.querySelector('#eRepeat .chip-opt.sel')?.dataset.v,
      modes:[...document.querySelectorAll('#eRepeat .chip-opt')].map(c=>c.dataset.v),
      pressed:document.querySelector('#eRepeat [data-v="once"]').getAttribute('aria-pressed'),
      pickerHidden:document.getElementById('eWeekPicker').hidden,
      hint:document.getElementById('eRepeatHint').textContent,
      summary:document.getElementById('calWeekSummary').textContent,
      weekKey:window.__eventWeekKey
    };
    closeModal('eventModalBg');
    return out;
  });
  assert.equal(form.selected,'once');
  assert.equal(form.pressed,'true');
  assert.equal(form.pickerHidden,true);
  assert.deepEqual(form.modes,['once','always','even','odd','weeks']);
  assert.ok(form.hint.includes('فقط هفته'));
  assert.ok(form.summary.includes('زوج') && form.summary.includes('رویدادی ندارد'));
  ok('a new event belongs to the shown week by default, with five recurrence choices');

  // ---------- 2. one-week events never leak into another week ----------
  const thisWeek = await create({title:'برنامه این هفته',days:[0],start:'09:00',end:'10:00'});
  assert.equal(thisWeek.repeat,'once');
  assert.equal(thisWeek.weekKey,await page.evaluate(()=>weekDates(0)[0]));
  assert.deepEqual(await titles(0),['برنامه این هفته']);
  assert.deepEqual(await titles(1),[]);
  assert.deepEqual(await titles(-1),[]);
  ok('an event made in this week appears in this week only');

  await page.evaluate(()=>calWeekShift(1));
  const nextWeek = await create({title:'برنامه هفته بعد',days:[0],start:'09:00',end:'10:00'});
  assert.equal(nextWeek.weekKey,await page.evaluate(()=>weekDates(1)[0]));
  assert.deepEqual(await titles(1),['برنامه هفته بعد']);
  assert.deepEqual(await titles(0),['برنامه این هفته']); // exactly one: this week's own plan
  assert.deepEqual(await titles(2),[]);
  ok('an event made while looking at next week belongs to next week only');

  // ---------- 3. clash detection is week-aware ----------
  const clash = await page.evaluate(async ()=>{
    calWeekShift(1);
    const before=DB.events.length;
    openEventModal();
    document.getElementById('eTitle').value='تداخل همان هفته';
    document.getElementById('eHourStart').value='09:00';
    document.getElementById('eHourEnd').value='10:00';
    document.querySelector('#eDays .chip-opt[data-v="0"]').classList.add('sel');
    await saveEvent();
    const afterSameWeek=DB.events.length;
    closeModal('eventModalBg');
    calWeekShift(2);
    openEventModal();
    document.getElementById('eTitle').value='همان ساعت، هفته دیگر';
    document.getElementById('eHourStart').value='09:00';
    document.getElementById('eHourEnd').value='10:00';
    document.querySelector('#eDays .chip-opt[data-v="0"]').classList.add('sel');
    await saveEvent();
    return {before,afterSameWeek,afterOtherWeek:DB.events.length,
      other:DB.events.find(e=>e.title==='همان ساعت، هفته دیگر')?.weekKey};
  });
  assert.equal(clash.afterSameWeek,clash.before,'same-week overlap must be refused');
  assert.equal(clash.afterOtherWeek,clash.before+1,'the same clock time in another week is free');
  assert.equal(clash.other,await page.evaluate(()=>weekDates(2)[0]));
  ok('overlap is checked inside the week, not across every week');

  // ---------- 4. legacy data is still fixed, with no destructive migration ----------
  await page.evaluate(()=>{
    DB.events.push({id:'legacy-fixed',title:'قدیمی ثابت',days:[0],startMin:11*60,endMin:12*60,reminder:false});
    save();
  });
  for(const off of [-1,0,1,2]) assert.ok((await titles(off)).includes('قدیمی ثابت'));
  const legacyShape = await page.evaluate(()=>{
    const e=DB.events.find(x=>x.id==='legacy-fixed');
    return {repeat:Object.hasOwn(e,'repeat'),weekKey:Object.hasOwn(e,'weekKey'),applies:lpEventAppliesToWeek(e,weekDates(3)[0])};
  });
  assert.deepEqual(legacyShape,{repeat:false,weekKey:false,applies:true});
  ok('pre-v24 events keep behaving like fixed weekly events and are not rewritten');

  // ---------- 5. a newly created fixed event keeps going in every week ----------
  await page.evaluate(()=>calWeekShift(0));
  const fixed = await create({title:'🔁 ورزش ثابت',days:[3],start:'18:00',end:'19:00',mode:'always'});
  assert.equal(fixed.repeat,'always');
  for(const off of [-2,-1,0,1,2,3]) assert.ok((await titles(off)).includes('🔁 ورزش ثابت'));
  assert.ok((await titles(1)).includes('برنامه هفته بعد'),'the one-week plan is still there too');
  ok('fixed events continue in every week alongside each week\u200cs own plan');

  // ---------- 6. even / odd school weeks (same clock time is allowed) ----------
  await reset();
  const evenEv = await create({title:'مدرسه زوج',days:[1],start:'08:00',end:'15:00',mode:'even'});
  const oddEv  = await create({title:'مدرسه فرد',days:[1],start:'08:00',end:'17:00',mode:'odd'});
  assert.equal(evenEv.repeat,'even'); assert.equal(oddEv.repeat,'odd');
  assert.equal(await page.evaluate(()=>DB.events.length),2,'even and odd may share the same hours');
  assert.deepEqual(await titles(0),['مدرسه زوج']);
  assert.deepEqual(await titles(1),['مدرسه فرد']);
  assert.deepEqual(await titles(2),['مدرسه زوج']);
  assert.deepEqual(await titles(-1),['مدرسه فرد']);
  ok('even weeks and odd weeks show their own school hours, alternating forever');

  const parity = await page.evaluate(()=>{
    calWeekShift(0);
    const before=DB.calWeekAnchor;
    lpFlipWeekParity();
    return {before,after:DB.calWeekAnchor,shown:lpWeekParity(weekDates(0)[0])};
  });
  assert.notEqual(parity.after,parity.before);
  assert.equal(parity.shown,'odd');
  assert.deepEqual(await titles(0),['مدرسه فرد']);
  assert.deepEqual(await titles(1),['مدرسه زوج']);
  await page.evaluate(()=>lpFlipWeekParity()); // back to the original anchor
  ok('the user chooses which weeks count as even; flipping swaps the pattern');

  // parity chooser inside the event sheet changes the same anchor
  const chooser = await page.evaluate(()=>{
    openEventModal();
    document.querySelector('#eRepeat [data-v="even"]').click();
    const before=DB.calWeekAnchor;
    const current=document.querySelector('#eRepeatHint .lp-parity-btn.sel')?.dataset.p;
    const other=current==='even'?'odd':'even';
    document.querySelector(`#eRepeatHint .lp-parity-btn[data-p="${other}"]`).click();
    const after=DB.calWeekAnchor;
    const selected=document.querySelector('#eRepeatHint .lp-parity-btn.sel')?.dataset.p;
    closeModal('eventModalBg');
    return {before,after,selected,other};
  });
  assert.notEqual(chooser.before,chooser.after);
  assert.equal(chooser.selected,chooser.other);
  ok('the even/odd anchor can also be chosen from inside the event form');

  // ---------- 7. hand-picked weeks ----------
  await reset();
  const picked = await create({title:'هفته انتخابی',days:[2],start:'10:00',end:'11:00',mode:'weeks',weekOffsets:[3,5]});
  assert.equal(picked.repeat,'weeks');
  assert.equal(picked.weeks.length,2);
  assert.deepEqual(await titles(3),['هفته انتخابی']);
  assert.deepEqual(await titles(5),['هفته انتخابی']);
  assert.deepEqual(await titles(4),[]);
  assert.deepEqual(await titles(0),[]);
  ok('hand-picked weeks appear only in the weeks the user ticked');

  // ---------- 8. only-this-week delete / edit leaves the series alone ----------
  await reset();
  const series = await create({title:'سری ثابت',days:[3],start:'13:00',end:'14:00',mode:'always'});
  const scopeMenu = await page.evaluate(id=>{
    calWeekShift(1);
    onEventBlockClick(id,3,weekDates(1)[0]);
    return {
      editWeek:document.getElementById('editThisWeekBtn').style.display,
      deleteWeek:document.getElementById('deleteThisWeekBtn').style.display,
      wholeEdit:document.getElementById('editWholeEventBtn').textContent,
      details:document.getElementById('eventActionDetails').textContent
    };
  },series.id);
  assert.equal(scopeMenu.editWeek,'flex');
  assert.equal(scopeMenu.deleteWeek,'flex');
  assert.ok(scopeMenu.wholeEdit.includes('همه'));
  assert.ok(scopeMenu.details.includes('ثابت'));
  ok('repeating blocks offer «only this week» actions and say they repeat');

  await page.evaluate(()=>deleteEventThisWeek());
  assert.deepEqual(await titles(1),[]);
  assert.deepEqual(await titles(0),['سری ثابت']);
  assert.deepEqual(await titles(2),['سری ثابت']);
  assert.ok(await page.evaluate(id=>DB.events.find(e=>e.id===id).exceptions.includes(weekDates(1)[0]),series.id));
  ok('deleting only this week hides the series there and keeps the other weeks');

  const oneWeekEdit = await page.evaluate(async id=>{
    calWeekShift(0);
    onEventBlockClick(id,3,weekDates(0)[0]);
    startEditEventThisWeek();
    const title=document.getElementById('eventModalTitle').textContent;
    const locked=document.getElementById('eRepeatField').classList.contains('is-locked');
    const mode=lpGetEventRepeat();
    document.getElementById('eTitle').value='نسخه فقط این هفته';
    document.getElementById('eHourEnd').value='15:00';
    await saveEvent();
    return {title,locked,mode,events:DB.events.length,
      original:DB.events.find(e=>e.id===id).title,
      copy:DB.events.find(e=>e.title==='نسخه فقط این هفته')?.repeat};
  },series.id);
  assert.ok(oneWeekEdit.title.includes('فقط این هفته'));
  assert.equal(oneWeekEdit.locked,true);
  assert.equal(oneWeekEdit.mode,'once');
  assert.equal(oneWeekEdit.original,'سری ثابت');
  assert.equal(oneWeekEdit.copy,'once');
  assert.deepEqual(await titles(0),['نسخه فقط این هفته']);
  assert.deepEqual(await titles(2),['سری ثابت']);
  ok('editing only this week detaches a one-week copy; the rest keep going');

  // ---------- 9. quick-add, reminders and the week summary use the same rule ----------
  const weekAware = await page.evaluate(()=>{
    DB.events=[{id:'qa-1',title:'فقط هفته بعد',days:[0],startMin:6*60,endMin:7*60,
      repeat:'once',weekKey:weekDates(1)[0],reminder:true}];
    DB.calWeekAnchor=weekDates(0)[0];
    save();
    calWeekShift(1);
    const busy=calQuickAddWindow(0,6);
    calWeekShift(0);
    const free=calQuickAddWindow(0,6);
    const ev=DB.events[0];
    const next=nextEventOccurrence(ev);
    const nextWeek=lpWeekKeyOf(next);
    return {busy:busy&&busy.startGrid,free:free&&free.startGrid,nextWeek,eventWeek:ev.weekKey,
      appliesNow:lpEventAppliesToWeek(ev,weekDates(0)[0]),
      appliesLater:lpEventAppliesToWeek(ev,weekDates(1)[0]),
      summaryHasRange:document.getElementById('calWeekSummary').textContent.includes('📆')};
  });
  assert.equal(weekAware.busy,7*60);
  assert.equal(weekAware.free,6*60);
  assert.equal(weekAware.nextWeek,weekAware.eventWeek);
  assert.equal(weekAware.appliesNow,false);
  assert.equal(weekAware.appliesLater,true);
  assert.equal(weekAware.summaryHasRange,true);
  ok('quick-add, reminders and the summary all read only the shown week\u200cs plan');

  // ---------- 10. backup + reload keep the week scope ----------
  const backup = await page.evaluate(()=>{
    const payload=JSON.parse(JSON.stringify(buildBackupPayload()));
    return {anchor:payload.calWeekAnchor,events:payload.events.map(e=>({repeat:e.repeat,weekKey:e.weekKey,exceptions:e.exceptions}))};
  });
  assert.ok(backup.anchor);
  assert.equal(backup.events[0].repeat,'once');
  await page.reload({waitUntil:'load'});
  await new Promise(resolve=>setTimeout(resolve,1400));
  const afterReload = await page.evaluate(()=>{
    showView('calendar'); calWeekShift(1); renderCalendar();
    const shown=[...document.querySelectorAll('#weekGrid .ev-block .ev-title')].map(x=>x.textContent);
    return {anchor:DB.calWeekAnchor,shown,repeat:DB.events[0].repeat,weekKey:DB.events[0].weekKey};
  });
  assert.equal(afterReload.anchor,backup.anchor);
  assert.deepEqual(afterReload.shown,['فقط هفته بعد']);
  assert.equal(afterReload.repeat,'once');
  ok('week keys, the parity anchor and exceptions survive a reload and a backup');

  // ---------- 11. English + static release checks ----------
  await page.evaluate(()=>localStorage.setItem('lifePlannerLang_v1','en'));
  await page.reload({waitUntil:'load'});
  await new Promise(resolve=>setTimeout(resolve,500));
  const english = await page.evaluate(()=>{
    showView('calendar');
    const label=document.querySelector('#eRepeatField label').textContent;
    const chip=document.querySelector('#eRepeat [data-v="once"]').textContent.trim();
    return {label,chip};
  });
  assert.equal(english.label,'Week recurrence — every week has its own separate plan');
  assert.equal(english.chip,'📌 This week only');
  ok('the new week controls translate to English');
  await page.evaluate(()=>localStorage.removeItem('lifePlannerLang_v1'));

  const coreJs=fs.readFileSync(path.join(ROOT,'js/core.js'),'utf8');
  const indexHtml=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
  const swJs=fs.readFileSync(path.join(ROOT,'sw.js'),'utf8');
  const css=fs.readFileSync(path.join(ROOT,'css/v24.css'),'utf8');
  const langJs=fs.readFileSync(path.join(ROOT,'js/lang.js'),'utf8');
  assert.ok(['function lpEventAppliesToWeek','function eventsForWeekKey','function renderCalWeekSummary',
    'function startEditEventThisWeek','function deleteEventThisWeek','function lpFlipWeekParity',
    'function lpSetWeekParity'].every(f=>coreJs.includes(f)));
  assert.ok(indexHtml.includes('id="calWeekSummary"') && indexHtml.includes('id="eRepeat"') &&
    indexHtml.includes('id="editThisWeekBtn"') && indexHtml.includes('id="deleteThisWeekBtn"') &&
    indexHtml.includes('css/v24.css?v=24.0'));
  assert.ok(swJs.includes("const CACHE_NAME = 'life-planner-cache-v98';") && swJs.includes('css/v24.css?v=${VERSION}'));
  assert.ok(css.includes('.cal-week-summary') && css.includes('.ev-block.ev-week-recurring::before'));
  assert.ok(langJs.includes('var EXTRA_V240'));
  ok('the v24 build is wired into HTML, CSS, the service worker and translations');

  assert.deepEqual(errors,[]);
  ok('no browser JavaScript errors');
  console.log(`\n${passed} CALENDAR WEEK TESTS PASSED`);
}finally{
  if(browser) await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
