import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function check(name, condition, extra=''){
  console.log(`${condition?'✅':'❌'} ${name}${condition?'':'  '+extra}`);
  if(!condition) failures++;
}

const fields = new Map();
function field(id, value=''){
  if(!fields.has(id)) fields.set(id,{id,value:String(value),style:{},focus(){}});
  return fields.get(id);
}
const context = {
  console,
  DB:{rewards:[]},
  window:null,
  document:{
    readyState:'loading',
    documentElement:{classList:{toggle(){}}},
    getElementById(id){ return fields.get(id)||null; },
    querySelectorAll(){ return []; },
    addEventListener(){}
  },
  uid:()=> 'reward-test-id',
  esc:s=>String(s||'').replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])),
  toFaDigits:s=>String(s).replace(/[0-9]/g,d=>'۰۱۲۳۴۵۶۷۸۹'[Number(d)]),
  save(){ context.saved=(context.saved||0)+1; },
  persist(){},
  toast(msg){ context.lastToast=msg; },
  confirm(){ return true; },
  openModal(){}, closeModal(){},
  setInterval(){}, setTimeout(){},
  Date,
  Number,
  Math
};
context.window=context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(ROOT,'js/rewards.js'),'utf8'),context);

const weekly = {frequency:'weekly',customValue:3,customUnit:'hours'};
const at = Date.UTC(2026,0,10,12);
check('weekly rewards repeat after exactly seven days',context.lpRewards.nextRewardAt(weekly,at)===at+7*86400000);
const customHours = {frequency:'custom',customValue:6,customUnit:'hours'};
check('custom hourly rewards use the chosen number of hours',context.lpRewards.nextRewardAt(customHours,at)===at+6*3600000);
const customDays = {frequency:'custom',customValue:3,customUnit:'days'};
check('custom daily rewards use the chosen number of days',context.lpRewards.nextRewardAt(customDays,at)===at+3*86400000);
const monthly = {frequency:'monthly'};
const endOfJanuary = new Date(2026,0,31,10,30).getTime();
const endOfFebruary = new Date(2026,1,28,10,30).getTime();
check('monthly rewards use calendar months and clamp short months',context.lpRewards.nextRewardAt(monthly,endOfJanuary)===endOfFebruary);
const parts = context.lpRewards.countdownParts(2*86400000+3*3600000+4*60000+5000);
check('countdown exposes days, hours, minutes and seconds',JSON.stringify(parts)===JSON.stringify({days:2,hours:3,minutes:4,seconds:5}),JSON.stringify(parts));

field('rewardTitle','تفریح با کامپیوتر');
field('rewardNote','یک ساعت بازی');
field('rewardFrequency','custom');
field('rewardCustomValue','6');
field('rewardCustomUnit','hours');
field('rewardEditId','');
context.saveReward();
check('the real save handler creates a reward and starts its timer',context.DB.rewards.length===1 && context.DB.rewards[0].nextAt>Date.now()+5*3600000);
check('saving persists the reward',context.saved===1);
const earlyNext = context.DB.rewards[0].nextAt;
context.claimReward('reward-test-id');
check('a reward cannot be claimed before its deadline',context.DB.rewards[0].claims===0 && context.DB.rewards[0].nextAt===earlyNext);
const previousCycleStartedAt = context.DB.rewards[0].cycleStartedAt;
context.DB.rewards[0].nextAt=Date.now()-1000;
context.claimReward('reward-test-id');
check('claiming a due reward increments its claim count',context.DB.rewards[0].claims===1 && context.DB.rewards[0].lastClaimedAt>0);
check('claiming starts the next cycle automatically',context.DB.rewards[0].nextAt>Date.now()+5*3600000 && context.DB.rewards[0].cycleStartedAt>=previousCycleStartedAt);

const dirty = context.lpRewards.normalize({id:'bad id!',title:'  جایزه  ',frequency:'unknown',customValue:-5,nextAt:-1});
check('imported reward data is defensively normalized',dirty.id==='reward-test-id' && dirty.title==='جایزه' && dirty.frequency==='weekly' && dirty.customValue===1 && dirty.nextAt>0);

const index = fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const core = fs.readFileSync(path.join(ROOT,'js/core.js'),'utf8');
const sw = fs.readFileSync(path.join(ROOT,'sw.js'),'utf8');
check('rewards have a real view, dashboard slot and creation modal',index.includes('id="view-rewards"') && index.includes('id="dashboardRewards"') && index.includes('id="rewardModalBg"'));
check('rewards are available in app navigation',core.includes("{id:'rewards', label:'جایزه', icon:'🎁'}"));
check('old stores and backups get an empty rewards collection',core.includes('if(!Array.isArray(db.rewards)) db.rewards = [];') && core.includes('DB.rewards = Array.isArray(DB.rewards) ? DB.rewards : [];'));
const ver = JSON.parse(fs.readFileSync(path.join(ROOT,'app-version.json'),'utf8')).version;
check('new reward assets are precached for offline use',index.includes(`js/rewards.js?v=${ver}`) && index.includes(`css/rewards.css?v=${ver}`) && sw.includes('`./js/rewards.js?v=${VERSION}`') && sw.includes('`./css/rewards.css?v=${VERSION}`'));

console.log(failures===0?'\nALL REWARD TESTS PASSED':`\n${failures} REWARD TEST(S) FAILED`);
process.exit(failures===0?0:1);
