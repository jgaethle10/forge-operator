import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {reviewKaidanceExternalSkills} from '../systemia/organism/kaidance-external-skill-intake.mjs';
import {runCompanyHeartbeat} from '../systemia/organism/kaidance-company-heartbeat-runner.mjs';

const at=new Date('2026-11-25T20:00:00Z');
const rel='systemia/saban/external-skill-candidates.json';
function fixture(fn){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kaidance-external-skill-proof-'));
 const file=path.join(dir,rel);
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const registry=JSON.parse(fs.readFileSync(rel,'utf8'));
 try{return fn({dir,file,registry,save:v=>fs.writeFileSync(file,JSON.stringify(v))});}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test('existing external-skill registry stays quarantined and produces only review keys',()=>{
 const v=reviewKaidanceExternalSkills({root:'.',now:at});
 assert.equal(v.status,'quarantined');
 assert.equal(v.candidate_count,3);
 assert.equal(v.quarantined,3);
 assert.equal(v.review_candidates.length,23);
 assert.equal(v.technology_candidate_count,20);
 assert.equal(v.technology_quarantined,20);
 assert.match(v.source_fingerprint,/^sha256:[a-f0-9]{64}$/);
 assert.ok(v.review_candidates.every(x=>!x.execution_authorized&&!x.install_authorized&&!x.outreach_authorized));
 assert.equal(v.worker_dispatched,false);assert.equal(v.verified_customer_delivery,false);
});
test('invalid or missing metadata fails closed, not empty green',()=>{
 fixture(({dir,file,registry,save})=>{
  assert.equal(reviewKaidanceExternalSkills({root:dir,now:at}).status,'held');
  registry.candidates[0].id='secret-injection';
  save(registry);
  const v=reviewKaidanceExternalSkills({root:dir,now:at});
  assert.equal(v.status,'held');assert.equal(v.candidate_count,0);assert.equal(v.review_candidates.length,0);
  assert.equal(JSON.stringify(v).includes('secret-injection'),false);
  fs.unlinkSync(file);
  fs.symlinkSync('/etc/passwd',file);
  assert.equal(reviewKaidanceExternalSkills({root:dir,now:at}).status,'held');
 });
});
test('skill metadata with dangerous scopes cannot gain eligibility',()=>{
 fixture(({dir,registry,save})=>{
  registry.candidates[0].requested_scopes=['credentials','network'];
  save(registry);
  const v=reviewKaidanceExternalSkills({root:dir,now:at});
  assert.equal(v.status,'quarantined');
  assert.ok(v.review_candidates[0].blockers.includes('forbidden_scope:credentials'));
  assert.equal(v.execution_authorized,false);
 });
});
test('even approved source paperwork only qualifies for separate admission',()=>{
 fixture(({dir,registry,save})=>{
  for(const candidate of registry.candidates){
   candidate.source.commit='a'.repeat(40);
   candidate.source.sha256='b'.repeat(64);
   candidate.legal={spdx:'MIT',reviewed:true,notice_path:'LICENSE'};
   candidate.review={
    source_reviewed:true,dependencies_reviewed:true,sandbox_passed:true,
    fixture_comparison_passed:true,product_contract_checked:true,owner_approved:true
   };
  }
  save(registry);
  const v=reviewKaidanceExternalSkills({root:dir,now:at});
  assert.equal(v.status,'eligible_for_separate_contract_review');
  assert.equal(v.eligible_for_admission,3);
  assert.ok(v.review_candidates.filter(x=>x.work_key.startsWith('external-skill:')).every(x=>x.action==='review_separate_systemia_capability_contract_admission'));
  assert.equal(v.technology_quarantined,20);
  assert.equal(v.install_authorized,false);
  assert.equal(v.worker_dispatched,false);
 });
});
test('same Kaidance 300-second tick includes skill review but no extra scheduler or progress claim',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kaidance-skills-pulse-'));
 try{
  const one=runCompanyHeartbeat({root:'.',outDir:dir,now:at,proveWorlds:false});
  assert.equal(one.duplicate,false);
  assert.equal(one.report.external_skill_intake.status,'quarantined');
  const queue=one.queue.candidates.filter(x=>x.work_key?.startsWith('external-skill:'));
  assert.equal(queue.length,3);
  const tech=one.queue.candidates.filter(x=>x.work_key?.startsWith('external-tech:'));
  assert.equal(tech.length,20);
  assert.ok(tech.every(x=>x.dispatch_authorized===false&&x.execution_authorized===false&&x.install_authorized===false));
  assert.ok(queue.every(x=>x.dispatch_authorized===false&&x.execution_authorized===false));
  assert.equal(one.mission_snapshot.counts.admitted,0);
  assert.equal(one.report.advancement.autonomous_development_workers_launched,0);
  assert.equal(runCompanyHeartbeat({root:'.',outDir:dir,now:at}).duplicate,true);
  const later=runCompanyHeartbeat({root:'.',outDir:dir,now:new Date(+at+300000)});
  assert.equal(later.duplicate,false);
  assert.deepEqual(later.queue.candidates.filter(x=>x.work_key?.startsWith('external-skill:')).map(x=>x.work_key),queue.map(x=>x.work_key));
  assert.deepEqual(later.queue.candidates.filter(x=>x.work_key?.startsWith('external-tech:')).map(x=>x.work_key),tech.map(x=>x.work_key));
  assert.equal(later.report.advancement.code_changes,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('all six technology families remain visible without admission authority',()=>{
 const r=reviewKaidanceExternalSkills({root:'.',now:at});
 const rows=r.review_candidates.filter(x=>x.work_key.startsWith('external-tech:'));
 assert.equal(rows.length,20);assert.equal(new Set(rows.map(x=>x.work_key)).size,20);
 assert.equal(new Set(rows.map(x=>x.category)).size,6);
 assert.equal(rows[0].technology_id,'explee-six-role');
 assert.equal(rows.find(x=>x.technology_id==='propainter').restriction,'noncommercial_hold');
 assert.ok(rows.every(x=>x.state==='quarantined'&&!x.execution_authorized&&!x.customer_data_authorized&&!x.payment_authorized));
});
test('technology metadata tampering or dropped candidate fails closed',()=>{
 for(const mutate of [r=>r.technology_candidates.pop(),r=>r.technology_candidates[0].source_url='https://invalid.example/',r=>r.technology_candidates[0].requested_scopes=['network'],r=>r.technology_candidates[0].license_verified=true,r=>r.technology_candidates[0].id=r.technology_candidates[1].id]){
  fixture(({dir,registry,save})=>{mutate(registry);save(registry);const v=reviewKaidanceExternalSkills({root:dir,now:at});assert.equal(v.status,'held');assert.equal(v.review_candidates.length,0);});
 }
});
