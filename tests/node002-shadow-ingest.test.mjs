import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifyNode002ShadowRequest} from '../systemia/compute/node002-shadow-ingest.mjs';

const id='sha256:f3d8d3ac5f9e96bf234db821b43c1c72379d6c763b25c6edc7a23f506ac24eaa';
function setup(){
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const dir=mkdtempSync(join(tmpdir(),'node002-shadow-'));
 const now=Date.parse('2026-10-22T20:00:00.000Z');
 const opts={registeredPublicKeyPem:publicKey.export({format:'pem',type:'spki'}),nonceDirectory:dir,now};
 const statement={
  schema:'evercraft.node002.signed-telemetry.v1',
  node_id:'evercraft-node002-nextgen',
  node_key:'personal:hp-nextgen:node-002:v1',
  device_fingerprint:id,
  nonce:'1234567890abcdef1234567890abcdef',
  observed_at_utc:new Date(now).toISOString(),
  sample:{memory_pct:31.2,uptime_seconds:500},
 };
 const signed=(s=statement)=>({statement:s,signature:sign(null,Buffer.from(JSON.stringify(s)),privateKey).toString('base64')});
 return {opts,statement,signed,cleanup:()=>rmSync(dir,{recursive:true,force:true})};
}
test('accepts pinned Ed25519 sender, returns shadow-only acknowledgement',()=>{
 const x=setup();try{
  const r=verifyNode002ShadowRequest(x.signed(),x.opts);
  assert.equal(r.ok,true);assert.equal(r.schema,'evercraft.node002.shadow-ack.v1');
  assert.equal(r.execution_authorized,false);assert.equal(r.lease_created,false);assert.equal(r.shadow,true);
  assert.ok(r.sample_key);
 }finally{x.cleanup()}
});
test('rejects replayed nonce persistently',()=>{
 const x=setup();try{
  assert.equal(verifyNode002ShadowRequest(x.signed(),x.opts).ok,true);
  assert.equal(verifyNode002ShadowRequest(x.signed(),x.opts).reason,'nonce_replayed');
 }finally{x.cleanup()}
});
test('rejects changed signed metrics',()=>{
 const x=setup();try{
  const r=x.signed();r.statement.sample.memory_pct=99;
  assert.equal(verifyNode002ShadowRequest(r,x.opts).reason,'signature_invalid');
 }finally{x.cleanup()}
});
test('rejects untrusted key',()=>{
 const x=setup(),y=setup();try{
  assert.equal(verifyNode002ShadowRequest(x.signed(),y.opts).reason,'signature_invalid');
 }finally{x.cleanup();y.cleanup()}
});
test('rejects stale timestamps',()=>{
 const x=setup();try{
  assert.equal(verifyNode002ShadowRequest(x.signed(),{...x.opts,now:x.opts.now+180000}).reason,'timestamp_stale');
 }finally{x.cleanup()}
});
test('rejects mismatched identity even if signed',()=>{
 const x=setup();try{
  assert.equal(verifyNode002ShadowRequest(x.signed({...x.statement,node_key:'wrong'}),x.opts).reason,'identity_rejected');
 }finally{x.cleanup()}
});
test('does not accept extra protocol fields',()=>{
 const x=setup();try{
  assert.equal(verifyNode002ShadowRequest(x.signed({...x.statement,execution_authorized:true}),x.opts).reason,'statement_shape_invalid');
 }finally{x.cleanup()}
});
test('fails closed when receiver is not configured',()=>{
 const x=setup();try{
  assert.equal(verifyNode002ShadowRequest(x.signed(),{}).reason,'receiver_not_configured');
 }finally{x.cleanup()}
});
