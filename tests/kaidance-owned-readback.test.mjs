import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {inspectOwnedKaidance} from '../systemia/organism/kaidance-owned-readback.mjs';
import {worldsSabanSourceFingerprint} from '../systemia/organism/kaidance-worlds-saban-review.mjs';

const NOW=new Date('2026-11-22T11:30:00.000Z');
const sha=v=>'sha256:'+createHash('sha256').update(JSON.stringify(v)).digest('hex');
const serviceKeys=['kaidance-company-heartbeat','kaidance-worlds-saban-review'];
function fixture(){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'kaidance-owned-proof-'));
 const paths=Object.fromEntries(['supervisor','company','worlds','publisher'].map(k=>[k,path.join(base,k)]));
 for(const dir of Object.values(paths))fs.mkdirSync(dir,{recursive:true,mode:0o700});
 fs.mkdirSync(path.join(paths.worlds,'goals'),{mode:0o700});
 const write=(file,obj)=>{
  fs.writeFileSync(file,JSON.stringify(obj,null,2)+'\n',{mode:0o600});
 };
 const previous='2026-11-22T11:20:00.000Z';
 const latest='2026-11-22T11:25:00.000Z';
 const receipts=[];
 for(const at of [previous,latest]){
  for(const service_key of serviceKeys){
   const body={schema:'evercraft.systemia.resident-supervisor-receipt.v1',
    type:'cycle.completed',at,service_key,exit_code:0,
    stdout_hash:sha('completed'),stderr_hash:sha('')};
   receipts.push({...body,receipt_hash:sha(body)});
  }
 }
 fs.writeFileSync(path.join(paths.supervisor,'receipts.jsonl'),
  receipts.map(x=>JSON.stringify(x)).join('\n')+'\n',{mode:0o600});
 const health={schema:'evercraft.systemia.resident-supervisor-health.v1',running:true,
  observed_at:'2026-11-22T11:29:00.000Z',deployment_receipt:'deployment:owned:verified',
  services:serviceKeys.map(service_key=>({service_key,status:'idle',
   run_count:2,last_exit_code:0}))};
 write(path.join(paths.supervisor,'health.json'),health);
 write(path.join(paths.supervisor,'deployment-receipt.json'),
  {schema:'evercraft.systemia.core-deployment-binding.v1',
   receipt_ref:'deployment:owned:verified'});
 const fingerprint=worldsSabanSourceFingerprint(process.cwd());
 const goalKey='mossmere-engine-review-'+fingerprint.slice(7,31);
 const goal={schema:'evercraft.goal.state.v1',mission_key:'evercraft-worlds-source-development',
  goal_key:goalKey,status:'complete',context_refs:[fingerprint],
  tasks:[{work_key:'worlds-mossmere-source-architect-review',
   status:'complete',attempt:1,receipt_refs:['sha256:'+'c'.repeat(64)]}]};
 write(path.join(paths.worlds,'goals',goalKey+'.json'),goal);
 write(path.join(paths.worlds,'latest.json'),
  {schema:'evercraft.kaidance.saban-world-review.v1',
   observed_at:'2026-11-22T11:29:00.000Z',state:'complete',goal_key:goalKey,
   source_fingerprint:fingerprint,local_readonly_completed:true,
   execution_receipt_verified:true,receipt_refs:goal.tasks[0].receipt_refs,
   source_code_changes:0,features_deployed:0,payment_mutations:0,publication_actions:0});
 const snapshot={schema:'evercraft.kaidance.mission-snapshot.v1',
  snapshot_ref:'sha256:'+'b'.repeat(64),observed_at:'2026-11-22T11:29:00.000Z',
  counts:{scanned:1,changed:0,admitted:0,held:0},evidence_refs:[fingerprint]};
 write(path.join(paths.worlds,'mission-snapshot.json'),snapshot);
 write(path.join(paths.company,'latest.json'),
  {schema:'evercraft.kaidance.company-heartbeat.v1',heartbeat_seconds:300,
   tick:123,observed_at:'2026-11-22T11:29:00.000Z',
   company_portfolio:{public_products:69}});
 write(path.join(paths.company,'state.json'),
  {schema:'evercraft.kaidance.company-heartbeat-state.v1',tick:123});
 const ledger={schema:'evercraft.systemia.mission-publisher-ledger.v1',
  deployment_id:'kaidance-local',updated_at:'2026-11-22T11:29:10.000Z',
  published:{'kaidance-worlds-saban-review':{
   snapshot_ref:snapshot.snapshot_ref,snapshot_hash:sha(snapshot),
   ingress_receipt_hash:'sha256:'+'a'.repeat(64),
   pushed_at:'2026-11-22T11:29:10.000Z'}}};
 write(path.join(paths.publisher,'ledger.json'),ledger);
 const args={root:process.cwd(),supervisorDir:paths.supervisor,
  companyDir:paths.company,worldsDir:paths.worlds,
  publisherLedger:path.join(paths.publisher,'ledger.json'),now:NOW};
 return {base,paths,args,write,receipts};
}
function runWithFixture(fn){
 const f=fixture();
 try{return fn(f)}finally{fs.rmSync(f.base,{recursive:true,force:true})}
}
test('two distinct owned resident cycles plus a persisted Saban goal and publisher receipt pass',()=>{
 runWithFixture(({args})=>{
  const v=inspectOwnedKaidance(args);
  assert.equal(v.status,'resident_evidence_verified');
  assert.equal(v.checks['kaidance-worlds-saban-review'].completed_cycles_evidenced,2);
  assert.equal(v.checks.worlds_goal_receipt.completed_goal,true);
  assert.equal(v.checks.mission_publisher.publisher_ingress_receipt_verified,true);
  assert.equal(v.authority.production_deployment_performed,false);
  assert.equal(JSON.stringify(v).includes(args.supervisorDir),false);
 });
});
test('one-cycle, repeated-timestamp and tampered receipts never certify continuity',()=>{
 runWithFixture(({args,paths,write,receipts})=>{
  for(const change of ['single','same-time','tampered']){
   const rows=structuredClone(receipts);
   if(change==='single')rows.splice(0,2);
   if(change==='same-time'){
    for(const row of rows.slice(2))row.at=rows[0].at;
    for(const row of rows.slice(2)){
     const {receipt_hash,...body}=row;row.receipt_hash=sha(body);
    }
   }
   if(change==='tampered')rows[1].exit_code=1;
   fs.writeFileSync(path.join(paths.supervisor,'receipts.jsonl'),
    rows.map(x=>JSON.stringify(x)).join('\n')+'\n',{mode:0o600});
   const out=inspectOwnedKaidance(args);
   assert.equal(out.status,'hold',change);
   assert.equal(out.checks['kaidance-worlds-saban-review'].ok,false);
  }
 });
});
test('source changes, goal identity mismatch or stale receipts hold instead of claiming live',()=>{
 runWithFixture(({args,paths})=>{
  const reportPath=path.join(paths.worlds,'latest.json');
  const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));
  report.source_fingerprint='sha256:'+'f'.repeat(64);
  fs.writeFileSync(reportPath,JSON.stringify(report),{mode:0o600});
  const r=inspectOwnedKaidance(args);
  assert.equal(r.status,'hold');
  assert.equal(r.checks.worlds_goal_receipt.reason,'worlds_source_fingerprint_changed');
  const old=inspectOwnedKaidance({...args,now:new Date('2026-11-22T12:30:00.000Z')});
  assert.equal(old.status,'hold');
  assert.equal(old.checks.resident_supervisor.reason,'missing_or_stale_timestamp');
 });
});
test('publisher record must match exact private snapshot and be source accepted',()=>{
 runWithFixture(({args,paths})=>{
  const p=path.join(paths.publisher,'ledger.json');
  const ledger=JSON.parse(fs.readFileSync(p,'utf8'));
  ledger.published['kaidance-worlds-saban-review'].snapshot_hash='sha256:'+'0'.repeat(64);
  fs.writeFileSync(p,JSON.stringify(ledger),{mode:0o600});
  const r=inspectOwnedKaidance(args);
  assert.equal(r.status,'hold');
  assert.equal(r.checks.mission_publisher.reason,'current_saban_snapshot_not_accepted_by_publisher');
 });
});
test('world-readable private evidence cannot qualify as owned continuity',()=>{
 runWithFixture(({args,paths})=>{
  fs.chmodSync(path.join(paths.supervisor,'health.json'),0o644);
  const r=inspectOwnedKaidance(args);
  assert.equal(r.status,'hold');
  assert.equal(r.checks.resident_supervisor.reason,'private_state_mode_0600_required');
 });
});


test('large long-lived supervisor journal checks only recent valid receipt tail',()=>{
 runWithFixture(({args,paths,receipts})=>{
  const filler={schema:'evercraft.systemia.resident-supervisor-receipt.v1',
   type:'resident.started',service_key:'unrelated',at:'2026-11-01T00:00:00.000Z'};
  const old={...filler,receipt_hash:sha(filler)};
  const history=(JSON.stringify(old)+'\n').repeat(15000);
  assert.ok(Buffer.byteLength(history)>2*1024*1024);
  const file=path.join(paths.supervisor,'receipts.jsonl');
  fs.writeFileSync(file,history+receipts.map(x=>JSON.stringify(x)).join('\n')+'\n',{mode:0o600});
  const result=inspectOwnedKaidance(args);
  assert.equal(result.status,'resident_evidence_verified');
  assert.equal(result.checks['kaidance-worlds-saban-review'].completed_cycles_evidenced,2);
 });
});
