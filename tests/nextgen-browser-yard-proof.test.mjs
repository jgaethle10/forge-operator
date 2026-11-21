import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {verifyLocalYardMilestone} from '../scripts/nextgen-browser-yard-proof.mjs';

const hash='a'.repeat(64), lease='b'.repeat(64), browser='c'.repeat(64);
const node='evercraft-node002-nextgen-yard-local-proof';
function fixture(){
  const seed={node_id:node,device_fingerprint:'sha256:'+hash};
  const deployment={receipt:{
    capacity_node_id:node,capacity_device_fingerprint:seed.device_fingerprint,
    workload_class:'systemia.evercraft-web-browser.v1',
    attestation_supported:true,receipt_hash:'sha256:'+lease,
  },result:{instance_id:'native-browser-worker-fixture'}};
  // Yard verifies the resident local service but deliberately DOES NOT claim
  // a verified public route. This is the actual unbound-route contract.
  const route={ok:false,state:'public_route_unbound',local_health_ok:true,health:{
    ok:true,runtime:'Evercraft Compute',mode:'public_read_only',
    instance_id:deployment.result.instance_id,
    deployment_receipt_ref:deployment.receipt.receipt_hash,
    service:'evercraft-owned-browser-worker',
  }};
  const attestation={
    identity_verified:true,device_fingerprint:seed.device_fingerprint,
    node_id:node,field_verified:false,
  };
  const invoke={ok:true,deployment_id:'nextgen-yard-browser-local-only',compute_receipt_hash:hash};
  const verified={verified:true,target_origin:'https://www.dshs.wa.gov',http_status:200,evidence_receipt_sha256:browser};
  return {seed,deployment,route,attestation,invoke,verified,negativeBlocked:true};
}
test('local NodeSeed/Yard browser proof accepts exact bound private worker result',()=>{
  const result=verifyLocalYardMilestone(fixture());
  assert.equal(result.stage,'passed_local_compute_yard_browser');
  assert.equal(result.local_nodeseed_lease_verified,true);
  assert.equal(result.software_key_attestation_verified,true);
  assert.equal(result.ephemeral_identity_not_enrolled,true);
  assert.equal(result.field_enrollment_verified,false);
  assert.equal(result.saban_remote_dispatch_verified,false);
  assert.equal(result.procurement_application_submitted,false);
});
test('rejects NodeSeed identity and workload substitution',()=>{
  const nodeDrift=fixture();nodeDrift.seed.node_id='another-node';
  assert.throws(()=>verifyLocalYardMilestone(nodeDrift),/seed_identity_missing/);
  const fingerprint=fixture();fingerprint.deployment.receipt.capacity_device_fingerprint='sha256:'+'d'.repeat(64);
  assert.throws(()=>verifyLocalYardMilestone(fingerprint),/deployment_unverified/);
  const classDrift=fixture();classDrift.deployment.receipt.workload_class='systemia.remote-capacity-broker.v1';
  assert.throws(()=>verifyLocalYardMilestone(classDrift),/deployment_unverified/);
});
test('requires actual Yard health binding and nonce-verified device attestation',()=>{
  const health=fixture();health.route.health.deployment_receipt_ref='invalid';
  assert.throws(()=>verifyLocalYardMilestone(health),/health_receipt_not_bound/);
  const sig=fixture();sig.attestation.identity_verified=false;
  assert.throws(()=>verifyLocalYardMilestone(sig),/ephemeral_identity_not_verified/);
  const field=fixture();field.attestation.field_verified=true;
  assert.throws(()=>verifyLocalYardMilestone(field),/ephemeral_identity_not_verified/);
});
test('public route is NOT a valid substitute for a private-only Yard milestone',()=>{
  const incorrectlyPublic=fixture();
  incorrectlyPublic.route.ok=true;
  incorrectlyPublic.route.state='public_route_verified';
  incorrectlyPublic.route.local_health_ok=true;
  assert.throws(()=>verifyLocalYardMilestone(incorrectlyPublic),/health_receipt_not_bound/);

  const noLocalHealth=fixture();
  noLocalHealth.route.local_health_ok=false;
  assert.throws(()=>verifyLocalYardMilestone(noLocalHealth),/health_receipt_not_bound/);

  const unhealthy=fixture();
  unhealthy.route.health.ok=false;
  assert.throws(()=>verifyLocalYardMilestone(unhealthy),/health_receipt_not_bound/);

  const mismatchedWorker=fixture();
  mismatchedWorker.route.health.instance_id='wrong-worker';
  assert.throws(()=>verifyLocalYardMilestone(mismatchedWorker),/health_receipt_not_bound/);

  const noHealth=fixture();
  delete noHealth.route.health;
  assert.throws(()=>verifyLocalYardMilestone(noHealth),/health_receipt_not_bound/);
});
test('fails closed on missing Compute receipt, page result or unsafe private target',()=>{
  const receipt=fixture();receipt.invoke.compute_receipt_hash='';
  assert.throws(()=>verifyLocalYardMilestone(receipt),/browser_job_not_verified/);
  const page=fixture();page.verified.verified=false;
  assert.throws(()=>verifyLocalYardMilestone(page),/browser_job_not_verified/);
  const privateTarget=fixture();privateTarget.negativeBlocked=false;
  assert.throws(()=>verifyLocalYardMilestone(privateTarget),/private_target_not_rejected/);
});
test('status is safe without running NodeSeed on hosted CI',()=>{
  const file=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts/nextgen-browser-yard-proof.mjs');
  const r=spawnSync(process.execPath,[file,'--status'],{encoding:'utf8',timeout:15000});
  assert.equal(r.status,0,r.stderr.slice(-600));
  const body=JSON.parse(r.stdout);
  assert.equal(body.schema,'evercraft.node002.yard-browser-proof-status.v1');
  assert.equal(body.remote_dispatch_verified,false);
  assert.equal(body.production_identity_verified,false);
});
test('runner pins exact public DSHS page and does not start remote control or publish',()=>{
  const file=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts/nextgen-browser-yard-proof.mjs');
  const source=fs.readFileSync(file,'utf8');
  assert.match(source,/startNodeSeed\(/);
  assert.match(source,/yard\.deployRelease\(/);
  assert.match(source,/yard\.attestDeployment\(/);
  assert.match(source,/yard\.invokeBrowser\(/);
  assert.match(source,/yard\.stopDeployment\(/);
  assert.match(source,/url:TARGET/);
  assert.match(source,/announce:false/);
  assert.match(source,/remoteOperatorRoots:null/);
  assert.match(source,/fs\.rmSync\(session/);
  assert.match(source,/allowInstall:false/);
  assert.doesNotMatch(source,/child_process.*execSync|sudo|apt-get|page\.goto/);
});
