import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {publishKaidanceOnce,readApprovedKaidancePolicy} from '../systemia/yard/kaidance-public-publisher.mjs';
import {assessPublicPulse} from '../public/kaidance/pulse-source.mjs';

const NOW=new Date('2026-11-19T20:06:00Z');
const DEPLOYMENT='evercraft-real-kaidance-field-test';
function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'kaidance-public-publisher-test-'));
  const publicRoot=path.join(root,'public');
  fs.mkdirSync(publicRoot);
  const policyFile=path.join(root,'policy.json');
  const policy={
    schema:'evercraft.kaidance.public-publish-policy.v1',
    enabled:true,
    deployment_id:DEPLOYMENT,
    public_root:publicRoot,
    operator_approval_ref:'approved:public-kaidance-review-001',
    approved_at:'2026-11-19T20:00:00Z',
    expires_at:'2026-12-10T20:00:00Z',
  };
  const save=()=>fs.writeFileSync(policyFile,JSON.stringify(policy),{mode:0o600});
  save();
  return {root,publicRoot,policyFile,policy,save,close(){fs.rmSync(root,{recursive:true,force:true})}};
}
function healthyPulse({cycle=17,field=true}={}){
 return {
   schema:'evercraft.kaidance.pulse.v1',
   state:'healthy',resident:true,cycle_number:cycle,last_cycle_key:'PRIVATE-CYCLE',
   last_completed_cycle:'2026-11-19T20:05:00Z',
   heartbeat_target_seconds:300,coverage_receipt_valid:true,
   admitted_count:3,held_count:1,
   deployment_receipt:'PRIVATE-DEPLOYMENT',
   compute_node_id:'PRIVATE-NODE',
   last_coverage_receipt_key:'PRIVATE-RECEIPT',
   field_attestation:{state:field?'verified':'not_verified',receipt:'PRIVATE-FIELD-RECEIPT'},
   observed_at:'2026-11-19T20:05:30Z',
 };
}
test('owned publisher writes only a source-backed, privacy-safe, atomic public pulse',async()=>{
 const f=fixture();
 try{
  const published=await publishKaidanceOnce({
    policyFile:f.policyFile,publicRoot:f.publicRoot,deploymentId:DEPLOYMENT,now:NOW,
    getPulse:async(id)=>{assert.equal(id,DEPLOYMENT);return healthyPulse();},
  });
  const target=path.join(f.publicRoot,'kaidance','pulse.json');
  const raw=fs.readFileSync(target,'utf8');
  const out=JSON.parse(raw);
  assert.equal(published.state,'published');
  assert.equal(published.cycle_number,17);
  assert.equal(out.schema,'evercraft.kaidance.public-pulse.v1');
  assert.equal(out.field_attestation_verified,true);
  assert.equal(assessPublicPulse(out,NOW.getTime()).verified,true);
  for(const secret of ['PRIVATE-NODE','PRIVATE-CYCLE','PRIVATE-DEPLOYMENT','PRIVATE-RECEIPT','PRIVATE-FIELD-RECEIPT','compute_node_id','field_attestation.state','deployment_receipt']){
    assert.equal(raw.includes(secret),false,secret);
  }
  assert.deepEqual(fs.readdirSync(path.dirname(target)),['pulse.json']);
 }finally{f.close()}
});
test('unattested field may be transparently reported but never displayed as verified',async()=>{
 const f=fixture();
 try{
  await publishKaidanceOnce({policyFile:f.policyFile,publicRoot:f.publicRoot,deploymentId:DEPLOYMENT,now:NOW,getPulse:async()=>healthyPulse({field:false})});
  const p=JSON.parse(fs.readFileSync(path.join(f.publicRoot,'kaidance','pulse.json'),'utf8'));
  assert.equal(p.field_attestation_verified,false);
  assert.equal(assessPublicPulse(p,NOW.getTime()).verified,false);
 }finally{f.close()}
});
test('missing or expired approval blocks private Yard lookup',async()=>{
 const f=fixture();let readCount=0;
 try{
  f.policy.expires_at='2026-11-19T19:59:00Z';f.save();
  await assert.rejects(()=>publishKaidanceOnce({policyFile:f.policyFile,publicRoot:f.publicRoot,deploymentId:DEPLOYMENT,now:NOW,getPulse:async()=>{readCount++;return healthyPulse()}}),/approval_expired_or_invalid/);
  assert.equal(readCount,0);
  f.policy.expires_at='2026-12-10T20:00:00Z';
  f.policy.deployment_id='other';f.save();
  await assert.rejects(()=>publishKaidanceOnce({policyFile:f.policyFile,publicRoot:f.publicRoot,deploymentId:DEPLOYMENT,now:NOW,getPulse:async()=>{readCount++;return healthyPulse()}}),/deployment_mismatch/);
  assert.equal(readCount,0);
  f.policy.deployment_id=DEPLOYMENT;f.save();
  fs.chmodSync(f.policyFile,0o644);
  await assert.rejects(()=>publishKaidanceOnce({policyFile:f.policyFile,publicRoot:f.publicRoot,deploymentId:DEPLOYMENT,now:NOW,getPulse:async()=>{readCount++;return healthyPulse()}}),/permissions_too_broad/);
  assert.equal(readCount,0);
 }finally{f.close()}
});
test('a symlinked public output cannot be overwritten',async()=>{
 const f=fixture();
 try{
  const privateFile=path.join(f.root,'secret.json');fs.writeFileSync(privateFile,'DO NOT TOUCH');
  fs.mkdirSync(path.join(f.publicRoot,'kaidance'));
  fs.symlinkSync(privateFile,path.join(f.publicRoot,'kaidance','pulse.json'));
  await assert.rejects(()=>publishKaidanceOnce({policyFile:f.policyFile,publicRoot:f.publicRoot,deploymentId:DEPLOYMENT,now:NOW,getPulse:async()=>healthyPulse()}),/target_invalid/);
  assert.equal(fs.readFileSync(privateFile,'utf8'),'DO NOT TOUCH');
 }finally{f.close()}
});
test('stale, nonresident, invalid, and regressed cycles do not refresh public state',async()=>{
 const f=fixture();
 const args={policyFile:f.policyFile,publicRoot:f.publicRoot,deploymentId:DEPLOYMENT,now:NOW};
 try{
  await assert.rejects(()=>publishKaidanceOnce({...args,getPulse:async()=>({...healthyPulse(),resident:false})}),/not_resident/);
  await assert.rejects(()=>publishKaidanceOnce({...args,getPulse:async()=>({...healthyPulse(),last_completed_cycle:'2026-11-19T19:40:00Z'})}),/current_cycle_not_publishable/);
  await publishKaidanceOnce({...args,getPulse:async()=>healthyPulse()});
  const output=path.join(f.publicRoot,'kaidance','pulse.json');
  const first=fs.readFileSync(output,'utf8');
  await assert.rejects(()=>publishKaidanceOnce({...args,getPulse:async()=>healthyPulse({cycle:16})}),/cycle_regression/);
  assert.equal(fs.readFileSync(output,'utf8'),first);
 }finally{f.close()}
});
test('policy files are private and tied to a fixed absolute public root',()=>{
 const f=fixture();
 try{
  assert.equal(readApprovedKaidancePolicy(f.policyFile,{deploymentId:DEPLOYMENT,publicRoot:f.publicRoot,now:NOW}).deploymentId,DEPLOYMENT);
  assert.throws(()=>readApprovedKaidancePolicy(f.policyFile,{deploymentId:DEPLOYMENT,publicRoot:'/tmp/another-root',now:NOW}),/root_mismatch/);
 }finally{f.close()}
});
