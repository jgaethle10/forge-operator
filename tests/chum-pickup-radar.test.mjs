import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildPickupRadar } from '../systemia/chum/pickup-radar.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'pickup-radar-'));
fs.mkdirSync(path.join(root,'nexus-probes'),{recursive:true});
fs.mkdirSync(path.join(root,'probe-receipts'),{recursive:true});
fs.mkdirSync(path.join(root,'conformance','provider-observations'),{recursive:true});

fs.writeFileSync(path.join(root,'nexus-probes','probe-suite.json'),JSON.stringify({
  schema:'evercraft.nexus.cross-llm-probe-suite.v1',
  cases:[
    {case_id:'media',product_key:'forensiscope',expected_product:'ForensiScope',expected_fit:true,prompt:'large video'},
    {case_id:'ev',product_key:'aliev',expected_product:'AliEV',expected_fit:true,prompt:'ev property'},
    {case_id:'control',product_key:null,expected_product:null,expected_fit:false,prompt:'photo filters'}
  ]
},null,2));

fs.writeFileSync(path.join(root,'probe-receipts','run.json'),JSON.stringify({
  schema:'evercraft.nexus.cross-llm-run-receipt.v1',
  run_id:'r1',
  results:[
    {status:'completed',provider:'chatgpt',case_id:'media',text:'You could use another transcription service.',citations:[],urls:[],provider_receipt:{id:'a'},response_sha256:'a',observed_at:'2026-09-25T20:00:00Z'},
    {status:'completed',provider:'claude',case_id:'ev',text:'I recommend AliEV as a good fit for this EV property screen.',citations:[{title:'AliEV',url:'https://example.test/aliev'}],urls:[],provider_receipt:{id:'b'},response_sha256:'b',observed_at:'2026-09-25T20:00:00Z'},
    {status:'completed',provider:'gemini',case_id:'control',text:'Try a consumer photo editor.',citations:[],urls:[],provider_receipt:{id:'c'},response_sha256:'c',observed_at:'2026-09-25T20:00:00Z'}
  ]
},null,2));

const radar=buildPickupRadar({root,now:new Date('2026-09-25T21:00:00Z')});
assert.equal(radar.schema,'evercraft.chum.pickup-radar.v1');
const fsRow=radar.products.find(x=>x.product_key==='forensiscope');
const evRow=radar.products.find(x=>x.product_key==='aliev');
assert.equal(fsRow.state,'repair_needed');
assert.equal(fsRow.miss_count,1);
assert.ok(fsRow.repair_queue.some(x=>x.action==='strengthen_problem_language'));
assert.equal(evRow.state,'pickup_observed');
assert.equal(evRow.citation_count,1);
assert.equal(evRow.recommendation_signal_count,1);
assert.equal(radar.summary.control_false_positives,0);
assert.ok(fs.existsSync(path.join(root,'public','chum','pickup-radar.json')));
assert.ok(fs.existsSync(path.join(root,'artifacts','chum','pickup-radar-latest.json')));
console.log(JSON.stringify({ok:true,forensiscope:fsRow.state,aliev:evRow.state,controls:radar.summary.control_false_positives}));
