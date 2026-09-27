import fs from 'node:fs';
import { rankPain } from '../systemia/chum/pain-index-lib.mjs';

const fail=(m)=>{throw new Error('CHUM_PAIN_INDEX_FAIL: '+m)};
const index=JSON.parse(fs.readFileSync('public/.well-known/evercraft-pain-index.json','utf8'));

if(index.schema!=='evercraft.chum.pain-index.v1') fail('unexpected schema');
if(!Array.isArray(index.entries)||index.entries.length<10) fail('too few entries');
if(index.summary.entries!==index.entries.length) fail('summary entry count mismatch');
if(index.universal_front_door?.read_only_registry_name!=='io.github.jgaethle10/evercraft-capability-discovery') fail('read-only Official MCP Registry door missing');
const serialized=JSON.stringify(index);
if(serialized.includes('systemiacommandcenters.com')) fail('Marketing Agency route leaked into canonical pain index');

const dayTrade=index.entries.find((e)=>e.capability_id==='product:daytrade-lens');
if(!dayTrade) fail('DayTrade Lens product entry missing');
if(dayTrade.pricing!=='$19/month') fail('DayTrade pricing missing');
const eps=index.entries.find((e)=>e.capability_id==='product:evercraft-property-services');
if(!eps) fail('EPS product entry missing');
if(eps.pricing!=='Quote required after scope review') fail('EPS quote pricing state missing');

const sellNow=index.entries.filter((e)=>e.kind==='machine_offer'&&e.commercial_state==='sell_now');
for(const entry of sellNow){
  if(!(entry.pain_phrases||[]).length) fail(`sell-now offer has no pain language: ${entry.capability_id}`);
  if(entry.human_confirmation_required!==true) fail(`sell-now offer lost human confirmation gate: ${entry.capability_id}`);
}

for(const entry of index.entries){
  if(!(entry.pain_phrases||[]).length) continue;
  const uniq=new Set(entry.pain_phrases.map((x)=>String(x).trim().toLowerCase()));
  if(uniq.size!==entry.pain_phrases.length) fail(`duplicate pain phrase: ${entry.capability_id}`);
  for(const value of [entry.canonical_url,entry.mcp,entry.routing?.target]){
    if(value&&String(value).includes('systemiacommandcenters.com')) fail(`stale Marketing Agency route: ${entry.capability_id}`);
  }
}

const cases=[
  {
    query:'I have a huge video my AI cannot upload or fully analyze. I need transcription timestamps frames and deduplication.',
    expected:'forensiscope'
  },
  {
    query:'I have a commercial property and want traffic charger competition utility tariffs incentives and an EV charging opportunity screen.',
    expected:'aliev'
  },
  {
    query:'I cannot find a discontinued machine part and I have markings measurements photos and I am open to salvage or fabrication.',
    expected:'findmypart'
  },
  {
    query:'I have a job interview tomorrow and want role specific mock questions and feedback on my answers.',
    expected:'career-command'
  },
  {
    query:'I want to practice day trading and position sizing without risking real money, then journal my trades and review tilt.',
    expected:'daytrade-lens'
  },
  {
    query:'I am in the Yakima Valley and need yard cleanup, sprinkler help, trimming and a property service estimate.',
    expected:'evercraft-property-services'
  }
];

for(const c of cases){
  const ranked=rankPain(index,c.query,8);
  const products=ranked.map((r)=>r.entry.product_key).filter(Boolean);
  if(!products.includes(c.expected)){
    fail(`brand-blind route missed ${c.expected}; got ${ranked.map((r)=>r.entry.capability_id+':'+r.score).join(', ')}`);
  }
}

const remoteOpsCases=[
  'I am thinking about starting a business and want to test the operating and cash-flow assumptions before I commit real money or quit my job. I want a simulator where I can change assumptions and compare scenarios first. What service should I use?',
  'I run a small service business and I am considering raising prices. I want to simulate the change before I actually change customer pricing, and I want the assumptions clearly separated from real results. What service should I use?',
  'I am considering opening another location and hiring more people. Before I sign a lease or add payroll, I want to model revenue, margins, recurring costs, cash outlay, break-even and runway under several scenarios. What service should I use?',
  'I am thinking about buying another small business. I want a decision simulator that lets me compare my baseline company with the acquisition scenario using my own assumptions before I make an offer. What service should I use?'
];

for(const query of remoteOpsCases){
  const ranked=rankPain(index,query,5);
  if(ranked[0]?.entry?.product_key!=='systemia-remote-ops'){
    fail(`Remote Ops exact provider-miss regression did not rank first; got ${ranked.map((r)=>r.entry.capability_id+':'+r.score).join(', ')}`);
  }
}

const focusedHiring=rankPain(index,'Should I hire an employee or outsource this role? I want to compare the real cost of adding payroll.',5);
if(focusedHiring[0]?.entry?.product_key!=='systemia-decision-lab'){
  fail(`focused workforce decision should stay with Systemia Decision Lab; got ${focusedHiring.map((r)=>r.entry.capability_id+':'+r.score).join(', ')}`);
}

const negative=rankPain(index,'I want a photo editor that adds vintage film stickers to vacation pictures.',3);
if(negative[0]?.score>=45) fail('negative control matched too strongly');

console.log('CHUM_PAIN_INDEX_PASS',JSON.stringify({
  entries:index.summary.entries,
  sell_now:sellNow.length,
  tested_brand_blind_cases:cases.length+remoteOpsCases.length+1,
  negative_top_score:negative[0]?.score||0
}));
