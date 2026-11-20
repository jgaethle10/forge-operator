import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {publishApprovedKaidancePulse,validatePublicApproval,verifyPrivatePulseForPublication} from '../systemia/collider/public-publisher.mjs';
import {projectPublicKaidancePulse} from '../systemia/collider/public-projection.mjs';

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
test('private pulse verifier preserves full field authority and safe projection',()=>{
 const good=healthyPulse();
 const p=verifyPrivatePulseForPublication(good,{now});
 assert.equal(p.schema,'evercraft.kaidance.public-pulse.v1');
 assert.equal(p.cycle_number,17);assert.equal(p.field_attestation_verified,true);
 const raw=JSON.stringify(p);
 for(const secret of ['private:field:receipt','private:cycle','private-node','private:coverage','deployment_receipt','safe_holds'])
  assert.equal(raw.includes(secret),false,secret);
 for(const bad of [
  {...good,resident:false},{...good,state:'degraded'},{...good,coverage_receipt_valid:false},
  {...good,field_attestation:{state:'not_verified'}},
  {...good,last_completed_cycle:'2026-11-19T19:40:00Z'},
  {...good,observed_at:'2026-11-19T19:40:00Z'},
  {...good,heartbeat_target_seconds:60}
 ])assert.throws(()=>verifyPrivatePulseForPublication(bad,{now}));
});
test('obsolete unverified approval cannot publish anything even with a private directory',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'kaidance-unsigned-refusal-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const publicRoot=path.join(root,'public');fs.mkdirSync(path.join(publicRoot,'kaidance'),{recursive:true});
 const approval=path.join(root,'unsigned.json');
 fs.writeFileSync(approval,JSON.stringify({schema:'evercraft.kaidance.public-publication-approval.v1',allow_publish:true,approved_by:'test-owner'}),{mode:0o600});
 const target=path.join(publicRoot,'kaidance','pulse.json');
 await assert.rejects(()=>publishApprovedKaidancePulse({
  approvalFile:approval,publicRoot,deploymentId:'kaidance-live',getPulse:async()=>healthyPulse(),now
 }),/legacy_unsigned_publication_disabled_use_signed_owned_pulse_publisher/);
 assert.throws(()=>validatePublicApproval({allow_publish:true}),/legacy_unsigned_publication_disabled/);
 assert.equal(fs.existsSync(target),false);
});
test('legacy unsigned publisher CLI refuses even with a real-looking approval reference',()=>{
 const entry=filePath('../systemia/collider/public-publisher.mjs');
 const result=spawnSync(process.execPath,[entry,'--approval-ref','approved:fake-operator'],{encoding:'utf8'});
 assert.equal(result.status,2);
 assert.match(result.stderr,/legacy unsigned publisher disabled/i);
});
test('public projection module has no command-line file writer',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'kaidance-projection-refusal-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const out=path.join(root,'pulse.json');
 const result=spawnSync(process.execPath,[filePath('../systemia/collider/public-projection.mjs'),
  '--input',path.join(root,'private.json'),'--output',out,'--approval-ref','approved:fake-operator'],{encoding:'utf8'});
 assert.equal(result.status,0);
 assert.equal(fs.existsSync(out),false);
 assert.equal(typeof projectPublicKaidancePulse,'function');
});
function filePath(relative){return path.resolve(path.dirname(new URL(import.meta.url).pathname),relative)}
