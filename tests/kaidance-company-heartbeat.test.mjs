import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {planCompanyHeartbeat,validateCompanyLanes} from '../systemia/organism/kaidance-company-heartbeat.mjs';
import {runCompanyHeartbeat,sourceFingerprint} from '../systemia/organism/kaidance-company-heartbeat-runner.mjs';
const products=JSON.parse(fs.readFileSync('registry/public-products.json','utf8'));
const supervisor=JSON.parse(fs.readFileSync('systemia/core/resident-services.json','utf8'));
const lanes=JSON.parse(fs.readFileSync('registry/kaidance-company-lanes.v1.json','utf8'));
const now=new Date('2026-11-21T16:00:00.000Z');
const fingerprint='sha256:'+'b'.repeat(64);
test('Kaidance company catalog identifies all existing products, actual services and unbound lanes',()=>{
 const validated=validateCompanyLanes(lanes,products,supervisor);
 assert.equal(validated.catalogKeys.length,products.products.length);
 assert.equal(validated.serviceKeys.length,supervisor.services.length);
 const first=planCompanyHeartbeat({manifest:lanes,products,supervisor,now,
  worldsFingerprint:fingerprint,proof:{status:'not_run',executed:false}});
 assert.equal(first.report.company_portfolio.public_products,products.products.length);
 assert.equal(first.report.company_portfolio.resident_services_configured,supervisor.services.length);
 assert.equal(first.report.company_portfolio.registered_lanes,lanes.lanes.length);
 assert.ok(first.report.company_portfolio.products_discovered_without_named_lane>0);
 assert.equal(first.report.advancement.code_changes,0);
 assert.equal(first.report.advancement.autonomous_development_workers_launched,0);
 assert.equal(first.snapshot.counts.admitted,0);
 assert.equal(first.snapshot.schema,'evercraft.kaidance.mission-snapshot.v1');
 assert.equal(first.snapshot.counts.held,0);
 assert.ok(first.snapshot.counts.scanned>=first.snapshot.counts.changed);
});
test('Kaidance never turns an unchanged heartbeat into engineering progress',()=>{
 const first=planCompanyHeartbeat({manifest:lanes,products,supervisor,now,
  worldsFingerprint:fingerprint,proof:{status:'passed',executed:true}});
 const duplicate=planCompanyHeartbeat({manifest:lanes,products,supervisor,previous:first.state,
  now:new Date(now.getTime()+20000),worldsFingerprint:fingerprint});
 assert.equal(duplicate.duplicate,true);
 const next=planCompanyHeartbeat({manifest:lanes,products,supervisor,previous:first.state,
  now:new Date(now.getTime()+300000),worldsFingerprint:fingerprint,proof:{status:'fresh_prior_evidence',executed:false}});
 assert.equal(next.duplicate,false);
 assert.equal(next.snapshot.counts.changed,0);
 assert.equal(next.report.advancement.read_only_worlds_proof_run,false);
 assert.equal(next.report.lanes.find(x=>x.lane_key==='worlds').source_proof.tests_verified,false);
 assert.equal(next.state.worlds_last_verified_at,now.toISOString());
});
test('Unsafe authority, unknown products and duplicate claims fail closed',()=>{
 for(const mutate of [
  m=>{m.automatic_production_mutations=true},
  m=>{m.lanes[0].mode='deploy_code'},
  m=>{m.lanes[0].source_files=['../../private/key']},
  m=>{m.lanes[1].products=['nonexistent-product']},
  m=>{m.lanes.push({...m.lanes[0]})},
  m=>{m.lanes[2].products.push(m.lanes[1].products[0])}
 ]){
  const bad=structuredClone(lanes);mutate(bad);
  assert.throws(()=>validateCompanyLanes(bad,products,supervisor));
 }
});
test('Company source fingerprint is deterministic and rejects missing or unsafe inputs',()=>{
 const f=lanes.lanes.find(x=>x.lane_key==='worlds').source_files;
 assert.match(sourceFingerprint('.',f),/^sha256:[a-f0-9]{64}$/);
 assert.equal(sourceFingerprint('.',f),sourceFingerprint('.',[...f].reverse()));
 assert.throws(()=>sourceFingerprint('.', ['../private/secret']));
 assert.throws(()=>sourceFingerprint('.',['public/worlds/missing-file']));
});
test('Runner writes local private receipts; no worker, deployment, or code write is implied',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kaidance-company-proof-'));
 try{
  const first=runCompanyHeartbeat({root:'.',outDir:dir,now,proveWorlds:false});
  assert.equal(first.duplicate,false);
  assert.equal(first.report.proof.status,'due_not_executed');
  const latest=JSON.parse(fs.readFileSync(path.join(dir,'latest.json'),'utf8'));
  const snapshot=JSON.parse(fs.readFileSync(path.join(dir,'mission-snapshot.json'),'utf8'));
  const queue=JSON.parse(fs.readFileSync(path.join(dir,'queue.json'),'utf8'));
  assert.equal(latest.advancement.code_changes,0);
  assert.equal(queue.execution_authorized,false);
  assert.equal(snapshot.counts.admitted,0);
  const nextAction=JSON.parse(fs.readFileSync(path.join(dir,'next-action.json'),'utf8'));
  const nextSnapshot=JSON.parse(fs.readFileSync(path.join(dir,'next-action-mission-snapshot.json'),'utf8'));
  assert.equal(nextAction.schema,'evercraft.kaidance.next-action.v1');
  assert.equal(nextAction.execution_performed,false);
  assert.equal(nextSnapshot.counts.admitted,0);
  assert.equal(fs.statSync(path.join(dir,'next-action-state.json')).mode&0o777,0o600);
  assert.equal(fs.statSync(path.join(dir,'state.json')).mode&0o777,0o600);
  assert.equal(runCompanyHeartbeat({root:'.',outDir:dir,now,proveWorlds:true}).duplicate,true);
  const next=runCompanyHeartbeat({root:'.',outDir:dir,now:new Date(now.getTime()+300000),
   proveWorlds:true,spawn:()=>({status:0,error:null})});
  assert.equal(next.report.proof.status,'passed');
  assert.equal(next.report.proof.executed,true);
  assert.equal(next.report.advancement.read_only_worlds_proof_passed,true);
  assert.equal(next.report.advancement.autonomous_development_workers_launched,0);
  assert.equal(next.mission_snapshot.counts.admitted,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});


test('company heartbeat keeps unpublished LightForge blocked and queued for review only',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kaidance-lightforge-intake-'));
 try{
  const result=runCompanyHeartbeat({root:'.',outDir:dir,now,proveWorlds:false});
  const report=result.report.lightforge_development;
  assert.equal(report.schema,'evercraft.kaidance.lightforge-readiness.v1');
  assert.equal(report.product_key,'evercraft-lightforge');
  assert.equal(report.status,'release_blocked');
  assert.equal(report.gates_independently_verified,0);
  assert.equal(report.shipping_authorized,false);
  assert.equal(report.development_worker_dispatched,false);
  const candidate=result.queue.candidates.find(x=>x.lane_key==='lightforge');
  assert.equal(candidate.work_key,'lightforge:gate:canonical-source');
  assert.equal(candidate.execution_authorized,false);
  assert.equal(candidate.publication_authorized,false);
  assert.ok(result.mission_snapshot.counts.held>=1);
  const later=runCompanyHeartbeat({root:'.',outDir:dir,
    now:new Date(now.getTime()+300000),proveWorlds:false});
  assert.equal(later.report.lightforge_development.source_digest,report.source_digest);
  assert.equal(later.report.advancement.autonomous_development_workers_launched,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('company heartbeat surfaces a verified existing checkout handoff, without performing it',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'kaidance-next-action-integration-'));
 const out=path.join(root,'kaidance-company-heartbeat');
 const offer=path.join(root,'kaidance-offer-checkout');
 const at=new Date('2026-11-22T23:00:00.000Z');
 function save(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  fs.writeFileSync(file,JSON.stringify(value)+'\n',{mode:0o600});
 }
 try{
  save(path.join(offer,'latest.json'),{
   schema:'evercraft.kaidance.offer-checkout-heartbeat.v1',
   observed_at:at.toISOString(),readiness:'exact_link_candidates_verified',
   changes_to_stripe_tax_settings:0,sensitive_provider_data_exported:false});
  save(path.join(offer,'actions.json'),{
   schema:'evercraft.payments.kaidance-heartbeat-actions.v1',
   observed_at:at.toISOString(),candidate_count:1,actions:[{kind:'review'}],
   proposed_checkout_placements:[{offer_key:'approved-product'}],
   provider_write_authorized:false,publisher_write_authorized:false});
  const result=runCompanyHeartbeat({root:'.',outDir:out,now:at});
  assert.equal(result.next_action.current_next_action.work_key,'checkout:verified-candidates');
  assert.equal(result.next_action.execution_performed,false);
  assert.equal(result.next_action.checkout_mutations,0);
  const next=JSON.parse(fs.readFileSync(path.join(out,'next-action.json'),'utf8'));
  assert.equal(next.decision_ref,result.next_action.decision_ref);
  assert.equal(JSON.parse(fs.readFileSync(
    path.join(out,'next-action-mission-snapshot.json'),'utf8')).counts.admitted,0);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
