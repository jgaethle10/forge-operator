import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {publishApprovedKaidancePulse,verifyPrivatePulseForPublication} from '../systemia/collider/public-publisher.mjs';

const now=new Date('2026-11-19T20:06:00Z');
function healthyPulse(){
 return {
  schema:'evercraft.kaidance.pulse.v1',
  resident:true,state:'healthy',cycle_number:17,last_completed_cycle:'2026-11-19T20:05:00Z',
  heartbeat_target_seconds:300,coverage_receipt_valid:true,
  admitted_count:6,held_count:2,observed_at:'2026-11-19T20:05:10Z',
  field_attestation:{state:'verified',receipt:'private:field:receipt',verified_at:'2026-11-19T20:05:11Z'},
  compute_node_id:'private-node',last_cycle_key:'private:cycle',last_coverage_receipt_key:'private:coverage',
  deployment_receipt:'private:deployment',safe_holds:[{category:'remote_device_trust',count:4}]
 };
}
function sandbox(t,{mode=0o600}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'kaidance-publisher-test-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const web=path.join(root,'web');fs.mkdirSync(path.join(web,'kaidance'),{recursive:true});
 const approval=path.join(root,'approval.json');
 fs.writeFileSync(approval,JSON.stringify({
  schema:'evercraft.kaidance.public-publication-approval.v1',
  allow_publish:true,approved_by:'owner-review',
  deployment_id:'kaidance-live',
  public_root:web,approved_at:'2026-11-19T20:00:00Z',expires_at:'2026-11-22T20:00:00Z'
 }),{mode});
 return {root,web,approval,output:path.join(web,'kaidance','pulse.json')};
}
function publish(s,getPulse=async()=>healthyPulse()){
 return publishApprovedKaidancePulse({
  approvalFile:s.approval,publicRoot:s.web,deploymentId:'kaidance-live',getPulse,now
 });
}
test('owner-authorized publisher writes minimal public pulse, never a private record',async t=>{
 const s=sandbox(t);
 const receipt=await publish(s);
 assert.equal(receipt.status,'published');
 assert.equal(receipt.cycle_number,17);
 assert.equal(receipt.projection_sha256.length,64);
 const output=JSON.parse(fs.readFileSync(s.output,'utf8'));
 assert.equal(output.schema,'evercraft.kaidance.public-pulse.v1');
 assert.equal(output.field_attestation_verified,true);
 const raw=fs.readFileSync(s.output,'utf8');
 for(const secret of ['private:field:receipt','private:cycle','private-node','private:coverage',
 'deployment_receipt','safe_holds','continuity','lease_id','token']){
  assert.equal(raw.includes(secret),false,secret);
 }
 assert.deepEqual(Object.keys(output),[
  'schema','state','cycle_number','last_completed_cycle','heartbeat_target_seconds','admitted_count',
  'held_count','coverage_receipt_valid','field_attestation_verified','observed_at','published_at'
 ]);
});
test('a missing owner approval or publicly readable approval cannot produce a feed',async t=>{
 const s=sandbox(t);
 fs.chmodSync(s.approval,0o644);
 await assert.rejects(()=>publish(s),/approval_permissions_too_broad/);
 assert.equal(fs.existsSync(s.output),false);
 fs.chmodSync(s.approval,0o600);
 const a=JSON.parse(fs.readFileSync(s.approval,'utf8'));a.allow_publish=false;
 fs.writeFileSync(s.approval,JSON.stringify(a));
 await assert.rejects(()=>publish(s),/explicit_publication_approval_missing/);
 assert.equal(fs.existsSync(s.output),false);
});
test('approval scope, expiry, and symlinked public path hold',async t=>{
 const s=sandbox(t);const a=JSON.parse(fs.readFileSync(s.approval,'utf8'));
 a.deployment_id='other';fs.writeFileSync(s.approval,JSON.stringify(a));
 await assert.rejects(()=>publish(s),/approval_deployment_mismatch/);
 a.deployment_id='kaidance-live';a.expires_at='2026-11-19T20:05:00Z';
 fs.writeFileSync(s.approval,JSON.stringify(a));
 await assert.rejects(()=>publish(s),/approval_outside_valid_window/);
 a.expires_at='2026-11-22T20:00:00Z';fs.writeFileSync(s.approval,JSON.stringify(a));
 fs.rmSync(path.join(s.web,'kaidance'),{recursive:true});
 fs.symlinkSync(s.root,path.join(s.web,'kaidance'),'dir');
 await assert.rejects(()=>publish(s),/public_subdirectory_not_real_directory/);
});
test('healthy resident state, authentic field status, receipt and fresh heartbeat required',()=>{
 const good=healthyPulse();
 assert.equal(verifyPrivatePulseForPublication(good,{now}).cycle_number,17);
 for(const variant of [
  {...good,resident:false},
  {...good,state:'degraded'},
  {...good,coverage_receipt_valid:false},
  {...good,field_attestation:{state:'not_verified'}},
  {...good,last_completed_cycle:'2026-11-19T19:40:00Z'},
  {...good,observed_at:'2026-11-19T19:40:00Z'},
  {...good,heartbeat_target_seconds:60}
 ])assert.throws(()=>verifyPrivatePulseForPublication(variant,{now}));
});
test('failed private Yard read cannot create a public record',async t=>{
 const s=sandbox(t);
 await assert.rejects(()=>publish(s,async()=>{throw Error('yard_route_unavailable')}),/yard_route_unavailable/);
 assert.equal(fs.existsSync(s.output),false);
});
