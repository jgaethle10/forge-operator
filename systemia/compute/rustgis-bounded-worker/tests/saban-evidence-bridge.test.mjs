import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { stable } from '../src/worker.mjs';
import { BridgeHold, reconcileRustgisSabanEvidence, RUSTGIS_MISSION_KEY } from '../src/saban-evidence-bridge.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const {publicKey, privateKey} = generateKeyPairSync('ed25519');
const pub = publicKey.export({format:'pem',type:'spki'});
const another = generateKeyPairSync('ed25519').publicKey.export({format:'pem',type:'spki'});
const now = Date.now();
const png = Buffer.alloc(32);
Buffer.from([137,80,78,71,13,10,26,10]).copy(png);
png.writeUInt32BE(640,16);
png.writeUInt32BE(420,20);
const project = Buffer.from('synthetic-buffer-project-test-bytes');
const make = (operation = 'render') => {
  const job = {
    schema:'evercraft.rustgis.job.v1',job_id:'canary-bridge-001',
    mission_key:RUSTGIS_MISSION_KEY,target_node_id:'evercraft-node-test',
    issued_at:new Date(now).toISOString(),expires_at:new Date(now+120000).toISOString(),
    nonce:'nonce-bridge-001',operation,dataset:'canary_baseline.geojson',
    dataset_sha256:'a'.repeat(64),expected_binary_sha256:'b'.repeat(64),synthetic_only:true
  };
  const permit = {
    schema:'evercraft.rustgis.permit.v1',job_id:job.job_id,
    signature:sign(null,Buffer.from(stable(job)),privateKey).toString('base64')
  };
  const assignment = {agent_id:'agent-bridge-test',role:'geospatial_canary_guard',
    idempotency_key:job.job_id,work:{key:job.job_id,raw:{job_id:job.job_id}}};
  const bytes = operation==='render' ? png : project;
  const workerReceipt = {
    schema:'evercraft.rustgis.worker-receipt.v1',
    job_id:job.job_id,mission_key:job.mission_key,nonce:job.nonce,operation,
    state:'verified',synthetic_only:true,source_sha256:job.dataset_sha256,
    binary_sha256:job.expected_binary_sha256,feature_count:41,
    artifacts:[{file:operation==='render'?'map.png':'buffered.rgis',
      size:bytes.length,sha256:digest(bytes)}],
    observed_at_utc:new Date(now+1000).toISOString(),
    evidence_level:'locally-verified-not-production'
  };
  return {job,permit,assignment,workerReceipt,artifactBytes:bytes,
    trustedIssuerPublicKey:pub,expectedNodeId:job.target_node_id};
};
const result = [];
function check(label,fn){
  try {fn();result.push(true);console.log('PASS',label);}
  catch(e){result.push(false);console.error('FAIL',label,e.message);}
}
function held(label,change,code){
  check(label,()=>{
    const p=make();change(p);
    assert.throws(()=>reconcileRustgisSabanEvidence(p),
      e=>e instanceof BridgeHold&&e.code===code);
  });
}
check('synthetic signed render evidence accepted with all authority flags false',()=>{
  const out=reconcileRustgisSabanEvidence(make());
  assert.equal(out.state,'verified_synthetic_evidence_only');
  for(const flag of ['dispatch_allowed','machine_attestation_verified','remote_execution_authorized','systemia_release_ready','external_recipient_access_verified']){
    assert.equal(out[flag],false);
  }
});
check('signed buffer receipt checks artifact byte hash',()=>{
  const out=reconcileRustgisSabanEvidence(make('buffer_100m'));
  assert.equal(out.artifact.file,'buffered.rgis');
});
held('reject fabricated signer',p=>{p.trustedIssuerPublicKey=another;},'SIGNATURE_DENIED');
held('reject altered signed job',p=>{p.job.operation='buffer_100m';},'SIGNATURE_DENIED');
held('reject unauthorized node',p=>{p.expectedNodeId='different-node';},'NODE_MISMATCH');
held('reject assignment job mismatch',p=>{p.assignment.work.key='different-job';},'SABAN_JOB_BINDING_MISMATCH');
held('reject assignment idempotency mismatch',p=>{p.assignment.idempotency_key='different-job';},'SABAN_IDEMPOTENCY_MISMATCH');
held('reject assignment role',p=>{p.assignment.role='shell_operator';},'SABAN_ROLE_DENIED');
held('reject mission misbinding',p=>{p.workerReceipt.mission_key='another';},'RECEIPT_JOB_MISMATCH');
held('reject fake receipt state',p=>{p.workerReceipt.state='live';},'RECEIPT_NOT_VERIFIED');
held('reject fabricated production authority',p=>{p.workerReceipt.evidence_level='production_verified';},'RECEIPT_NOT_VERIFIED');
held('reject source digest mismatch',p=>{p.workerReceipt.source_sha256='f'.repeat(64);},'RECEIPT_HASH_MISMATCH');
held('reject artifact byte tampering',p=>{p.artifactBytes=Buffer.from('changed artifact despite receipt');},'ARTIFACT_INTEGRITY_FAILED');
held('reject wrong artifact filename',p=>{p.workerReceipt.artifacts[0].file='other.png';},'ARTIFACT_NAME_INVALID');
held('reject extra unaccounted artifact',p=>{p.workerReceipt.artifacts.push({file:'secret.txt',size:5,sha256:'0'.repeat(64)});},'ARTIFACT_COUNT_INVALID');
held('reject expired receipt timestamp',p=>{p.workerReceipt.observed_at_utc=new Date(now+3600000).toISOString();},'RECEIPT_TIME_INVALID');
held('reject fake PNG',p=>{
  const bytes=Buffer.alloc(32);bytes.writeUInt32BE(640,16);bytes.writeUInt32BE(420,20);
  p.artifactBytes=bytes;p.workerReceipt.artifacts[0].sha256=digest(bytes);
},'PNG_HEADER_INVALID');
held('reject unknown signed job field',p=>{p.job.command='execute_anything';},'JOB_SCHEMA_INVALID');
held('reject attempt to relabel synthetic job',p=>{p.job.synthetic_only=false;},'REAL_DATA_HELD');
held('reject oversized project artifact',p=>{
  const bytes=Buffer.alloc(10*1024*1024);p.artifactBytes=bytes;
  p.workerReceipt.artifacts[0].size=bytes.length;p.workerReceipt.artifacts[0].sha256=digest(bytes);
},'ARTIFACT_BYTES_INVALID');
const summary={passed:result.filter(Boolean).length,failed:result.filter(x=>!x).length,
  status:'read_only_reconciliation_no_compute_enrollment'};
console.log(JSON.stringify(summary));
if(summary.failed)process.exitCode=1;
