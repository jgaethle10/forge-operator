import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {verifyFieldCandidatePacket} from './field-node-readback.mjs';
const script=fileURLToPath(new URL('./field-node-selfcheck-cli.mjs',import.meta.url));
function run(root,id){
 const r=spawnSync(process.execPath,[script,'--root',root,'--node-id',id],
  {encoding:'utf8',timeout:20000,maxBuffer:32768,
   env:{PATH:process.env.PATH||'',HOME:root,TMPDIR:root}});
 assert.equal(r.status,0,'Selfcheck failed: '+String(r.stderr||r.error).slice(0,700));
 return {packet:JSON.parse(r.stdout),raw:r.stdout};
}
test('owner selfcheck starts official real local NodeSeed, issues signed public evidence and cleanly stops test server',()=>{
 const base=mkdtempSync(join(tmpdir(),'evercraft-operator-field-proof-'));
 try{
  const p=join(base,'candidate-a'),id='evercraft-field-test-a';
  const first=run(p,id);
  assert.equal(first.packet.schema,'evercraft.blackbox.operator-node-field-selfcheck.v1');
  assert.equal(first.packet.identity_preexisting_in_operator_selected_root,false);
  assert.equal(first.packet.candidate_identity_persisted_locally,true);
  assert.equal(first.packet.test_server_stopped_after_probe,true);
  assert.equal(first.packet.canonical_systemia_enrollment_record_created,false);
  assert.equal(first.packet.no_spider_or_chum_service_invoked,true);
  assert.equal(first.packet.execution_authority,'NONE_READ_ONLY');
  assert.equal(first.packet.public_evidence.private_key_exported,false);
  assert.equal(first.packet.public_evidence.bearer_token_exported,false);
  assert.equal(first.packet.public_evidence.owner_control_plane_pinning_verified,false);
  assert.equal(first.raw.includes('PRIVATE KEY'),false);
  assert.equal(first.raw.includes(p),false);
  const v=verifyFieldCandidatePacket(first.packet.public_evidence,{expectedNodeId:id,
   expectedFingerprint:first.packet.public_evidence.device_fingerprint});
  assert.equal(v.signed_attestation_verified,true);
  const second=run(p,id);
  assert.equal(second.packet.identity_preexisting_in_operator_selected_root,true);
  assert.equal(second.packet.public_evidence.device_fingerprint,first.packet.public_evidence.device_fingerprint);
  assert.notEqual(second.packet.public_evidence.local_client_challenge_nonce,
   first.packet.public_evidence.local_client_challenge_nonce);
  const other=run(join(base,'candidate-b'),'evercraft-field-test-b');
  assert.notEqual(other.packet.public_evidence.device_fingerprint,
   first.packet.public_evidence.device_fingerprint);
  assert.equal(other.packet.operator_hardware_identity_independently_verified,false);
 }finally{rmSync(base,{recursive:true,force:true})}
});
test('selfcheck will not create keys without exact ID and operator-supplied absolute root',()=>{
 const b=mkdtempSync(join(tmpdir(),'evercraft-field-denials-'));
 try{
  for(const args of [
    ['--root',join(b,'no-node-id')],
    ['--node-id','valid-machine','--root','relative-path'],
    ['--node-id','INVALID ID','--root',join(b,'bad-id')]
  ]){
   const r=spawnSync(process.execPath,[script,...args],{encoding:'utf8',timeout:5000});
   assert.notEqual(r.status,0);
   assert.equal(r.stdout,'');
  }
 }finally{rmSync(b,{recursive:true,force:true})}
});
