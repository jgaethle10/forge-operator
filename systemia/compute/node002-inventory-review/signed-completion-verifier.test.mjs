import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {verifyPinnedNode002Completion,SCOPE} from './signed-completion-verifier.mjs';
import {NODE_ID,NODE_KEY,WORKLOAD_KEY} from './operator-inventory.mjs';

const {privateKey,publicKey}=crypto.generateKeyPairSync('ed25519'); // TEST ONLY
const pubPem=publicKey.export({type:'spki',format:'pem'});
const fingerprint='sha256:'+crypto.createHash('sha256').update(publicKey.export({type:'spki',format:'der'})).digest('hex');
const source='sha256:'+'a'.repeat(64);
const nonce='proof_nonce_0123456789abcdef';
const jobId='job_0123456789abcdef0123456789abcdef';
const requestId='localproof_0123456789abcdef';
const now=Date.parse('2026-10-15T04:18:54.000Z');
const canonical=o=>JSON.stringify(Object.fromEntries(Object.keys(o).sort().map(k=>[k,o[k]])));
const statement=()=>({
 schema:SCOPE,
 node_id:NODE_ID,node_key:NODE_KEY,workload_key:WORKLOAD_KEY,
 job_id:jobId,request_id:requestId,source_sha256:source,
 inventory_sha256:'sha256:'+'b'.repeat(64),
 nonce,
 started_at:'2026-10-15T04:18:53.000Z',
 completed_at:'2026-10-15T04:18:53.877Z',
});
const sign=s=>({
 statement:s,
 signature:{
  algorithm:'Ed25519',scope:SCOPE,key_id:'test-device-ed25519',
  value_base64:crypto.sign(null,Buffer.from('EVERCRAFT-NODE002-INVENTORY-COMPLETION-V1\n'+canonical(s)),privateKey).toString('base64'),
 }
});
const opts={
 pinnedDevicePublicKeyPem:pubPem,pinnedDeviceFingerprint:fingerprint,
 expectedJobId:jobId,expectedRequestId:requestId,
 expectedSourceSha256:source,expectedInventorySha256:'sha256:'+'b'.repeat(64),
 expectedDeviceKeyId:'test-device-ed25519',expectedNonce:nonce,now,
};
const verify=(e,more={})=>verifyPinnedNode002Completion(e,{...opts,...more});

test('a pinned, synthetic Ed25519 signed claim authenticates, not execution',()=>{
 const r=verify(sign(statement()));
 assert.equal(r.envelope_signature_valid,true);
 assert.equal(r.device_public_key_pinned,true);
 assert.equal(r.physical_execution_verified,false);
 assert.equal(r.systemia_admission_verified,false);
 assert.equal(r.live_compute_lease_verified,false);
 assert.equal(r.revocation_and_atomic_fence_verified,false);
 assert.equal(r.production_completion_verified,false);
 assert.equal(r.authorization_granted,false);
});
test('missing or substituted trust anchor fails closed',()=>{
 const p=sign(statement());
 assert.throws(()=>verifyPinnedNode002Completion(p),/trusted_device_key_missing/);
 assert.throws(()=>verify(p,{pinnedDeviceFingerprint:'sha256:'+'0'.repeat(64)}),/fingerprint_mismatch/);
 const other=crypto.generateKeyPairSync('ed25519').publicKey.export({format:'pem',type:'spki'});
 assert.throws(()=>verify(p,{pinnedDevicePublicKeyPem:other}),/fingerprint_mismatch/);
});
test('binding to exactly expected job, source, request, and nonce is required',()=>{
 const p=sign(statement());
 for(const item of [
  {expectedJobId:'job_other_0000000000'},
  {expectedRequestId:'other_req_123456789'},
  {expectedSourceSha256:'sha256:'+'0'.repeat(64)},
  {expectedInventorySha256:'sha256:'+'0'.repeat(64)},
  {expectedNonce:'other_nonce_123456789'},
 ]){
  assert.throws(()=>verify(p,item),/completion_binding_invalid/);
 }
});
test('independently pinned key ID prevents issuer-label substitution',()=>{
 assert.throws(()=>verify(sign(statement()),{expectedDeviceKeyId:'other-device-ed25519'}),/completion_signature_fields_invalid/);
});
test('tampering and extra authority claims fail closed',()=>{
 const p=sign(statement());
 const modified=structuredClone(p);
 modified.statement.inventory_sha256='sha256:'+'c'.repeat(64);
 assert.throws(()=>verify(modified),/completion_binding_invalid/);
 const extra=structuredClone(p);extra.statement.execution_permitted=true;
 assert.throws(()=>verify(extra),/completion_fields_invalid/);
 const bogus=structuredClone(p);bogus.signature.value_base64='x';
 assert.throws(()=>verify(bogus),/completion_signature_fields_invalid/);
});
test('signer key ID and reported inventory digest cannot silently drift',()=>{
 const p=sign(statement());
 const alteredId=structuredClone(p);
 alteredId.signature.key_id='untrusted-key-id';
 assert.throws(()=>verify(alteredId),/completion_signature_fields_invalid/);
 const alteredInventory=structuredClone(p);
 alteredInventory.statement.inventory_sha256='sha256:'+'c'.repeat(64);
 const signedOther=sign(alteredInventory.statement);
 assert.throws(()=>verify(signedOther),/completion_binding_invalid/);
 assert.throws(()=>verifyPinnedNode002Completion(p,{
  ...opts,expectedInventorySha256:undefined
 }),/expected_job_scope_missing/);
 assert.throws(()=>verifyPinnedNode002Completion(p,{
  ...opts,expectedDeviceKeyId:undefined
 }),/expected_job_scope_missing/);
});
test('stale claims and oversized runtime intervals fail closed',()=>{
 assert.throws(()=>verify(sign(statement()),{now:now+300001}),/completion_time_invalid/);
 const s=statement();s.started_at='2026-10-15T04:14:53.000Z';
 assert.throws(()=>verify(sign(s)),/completion_time_invalid/);
});
test('signed claim with wrong device or workload never admitted',()=>{
 const s=statement();s.node_id='other';assert.throws(()=>verify(sign(s)),/wrong_node_or_workload/);
 const s2=statement();s2.workload_key='shell.exec';assert.throws(()=>verify(sign(s2)),/wrong_node_or_workload/);
});
