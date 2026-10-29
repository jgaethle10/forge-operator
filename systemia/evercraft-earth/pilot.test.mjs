// node --test systemia/evercraft-earth/pilot.test.mjs
// Zero-dependency syntax and DOM-stub behavioral smoke tests for the static pilot.
// Not a substitute for browser, cartographic, accessibility or data-quality QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import vm from 'node:vm';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const html=readFileSync(resolve(root,'public/apps/evercraft-earth/index.html'),'utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
const inline=scripts.map(x=>x[1]).filter(Boolean).at(-1);

function harness(){
 const nodes=new Map();
 function node(tag='div'){
  return {tag,className:'',textContent:'',value:'',children:[],handlers:{},dataset:{},
   addEventListener(name,cb){this.handlers[name]=cb;},
   querySelectorAll(){return[];},
   append(...args){this.children.push(...args);},
   replaceChildren(...args){this.children=[...args];},
   setAttribute(name,value){this[name]=value;},
   scrollIntoView(){},
   click(){if(this.handlers.click)this.handlers.click();}};
 }
 const get=id=>{
  if(!nodes.has(id))nodes.set(id,node());
  return nodes.get(id);
 };
 get('fromDate').value='2023-01-01';
 get('toDate').value='2026-10-23';
 get('place').value='yakima';
 const doc={getElementById:get,createElement:node};
 const context={document:doc,URL,Date,Number,Blob,console,setTimeout};
 vm.runInNewContext(inline,context,{timeout:2000,filename:'pilot-inline.js'});
 return {get,context};
}
test('static application has parseable JavaScript and production-truth labels',()=>{
 assert.ok(inline,'inline script present');
 assert.doesNotThrow(()=>new vm.Script(inline));
 for(const phrase of ['SYNTHETIC','NO VERIFIED DATA LOADED','not independently verified','Coverage unknown','Washington State DOH','US EPA']){
  assert.ok(html.includes(phrase),'missing: '+phrase);
 }
});
test('empty state does not suggest absence of contamination',()=>{
 const {get}=harness();
 assert.match(get('summary').textContent,/coverage gap/i);
 assert.equal(get('pointCount').textContent,'0');
});
test('synthetic demo creates a correctly labeled dated comparison',()=>{
 const {get}=harness();
 get('demo').click();
 assert.match(get('modeFlag').textContent,/SYNTHETIC/);
 assert.equal(get('pointCount').textContent,'1');
 assert.equal(get('pairCount').textContent,'1');
 assert.match(get('overlayMode').textContent,/SIMULATED/);
});
test('date ordering prevents misleading comparisons',()=>{
 const {get}=harness();
 get('demo').click();
 get('fromDate').value='2026-01-01';
 get('toDate').value='2023-01-01';
 get('fromDate').handlers.change();
 assert.match(get('summary').textContent,/earlier snapshot must not be later/i);
});
test('clearing observations removes all comparisons',()=>{
 const {get}=harness();
 get('demo').click();get('clear').click();
 assert.equal(get('pointCount').textContent,'0');
 assert.match(get('summary').textContent,/coverage gap/i);
});
test('all four layers are exposed',()=>{
 for(const topic of ['pfas','fire','land','infrastructure'])
  assert.ok(html.includes('data-topic="'+topic+'"'));
});


test('EPA ledger displays quantified and below-MRL values without assigning map coordinates',async()=>{
 const {get}=harness();
 const ledger={
  schema:'evercraft.earth.ucmr5-evidence-ledger.v1',
  source:{original_file_sha256:'a'.repeat(64),url:'https://www.epa.gov/dwucmr/occurrence-data-unregulated-contaminant-monitoring-rule'},
  records:[{pws_id:'WA1234567',pws_name:'TEST WATER SYSTEM',sample_id:'S1',sample_point_id:'EP1',
   contaminant:'PFOS',observed_at:'2025-10-09',result_status:'quantified',value:0.01,reporting_limit:0.004,
   unit:'µg/L',geolocation_status:'not_geocoded',latitude:null,longitude:null},
   {pws_id:'WA1234567',pws_name:'TEST WATER SYSTEM',sample_id:'S2',sample_point_id:'EP1',
   contaminant:'PFOA',observed_at:'2025-10-09',result_status:'below_reporting_limit',value:null,reporting_limit:0.004,
   unit:'µg/L',geolocation_status:'not_geocoded',latitude:null,longitude:null}]
 };
 const file={size:1000,text:async()=>JSON.stringify(ledger)};
 await get('file').handlers.change({target:{files:[file],value:'ledger.json'}});
 assert.match(get('modeFlag').textContent,/NOT GEOCODED/);
 assert.equal(get('pointCount').textContent,'0');
 assert.equal(get('pairCount').textContent,'0');
 assert.match(get('summary').textContent,/1 quantified, 1 below reporting limit/);
 const cards=get('findings').children;
 assert.equal(cards.length,2);
 assert.match(cards[1].children.map(x=>x.textContent).join(' '),/Below reporting limit/);
});
test('EPA ledger refuses invented geolocation supplied with tabular records',async()=>{
 const {get}=harness();
 const ledger={
 schema:'evercraft.earth.ucmr5-evidence-ledger.v1',
 source:{original_file_sha256:'a'.repeat(64),url:'https://www.epa.gov/dwucmr/occurrence-data-unregulated-contaminant-monitoring-rule'},
 records:[{pws_id:'WA1111111',pws_name:'TEST',sample_id:'S1',sample_point_id:'EP1',contaminant:'PFOS',
 observed_at:'2025-10-09',result_status:'quantified',value:0.01,reporting_limit:0.004,unit:'µg/L',
 geolocation_status:'not_geocoded',latitude:46.6,longitude:-120.5}]
 };
 await get('file').handlers.change({target:{files:[{size:100,text:async()=>JSON.stringify(ledger)}],value:'test.json'}});
 assert.match(get('uploadStatus').textContent,/Unverified geolocation/);
 assert.equal(get('pointCount').textContent,'0');
});
