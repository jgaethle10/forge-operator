import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createFoundryVerifiedResolver} from './instrument-foundry-resolver.mjs';

const scope=()=>({tenant_id:'tenant-a',session_id:'session-a',purpose:'audition'});
function fixtureWav(){
 const b=Buffer.alloc(44+32);b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);
 b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);
 b.writeUInt32LE(48000,24);b.writeUInt32LE(96000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
 b.write('data',36);b.writeUInt32LE(32,40);return b;
}
function assetOf(bytes){
 const digest=createHash('sha256').update(bytes).digest('hex');
 return {id:'audio-sha256:'+digest,digest,kind:'audio',mime_type:'audio/wav',byte_length:bytes.length,
  duration_sec:.00033,sample_rate:48000,channels:1,rights:'unknown'};
}
function build(bytes,overrides={}){
 return createFoundryVerifiedResolver({scope:scope(),authorizeRead:async()=>true,
  readBytes:async()=>new Uint8Array(bytes),...overrides});
}
test('returns authorized hash-verified playable WAV Blob without claiming release rights',async()=>{
 const bytes=fixtureWav(),a=assetOf(bytes),receipts=[];
 const blob=await build(bytes,{onReceipt:async r=>receipts.push(r)})(a);
 assert.equal(blob.type,'audio/wav');assert.equal(blob.size,bytes.length);
 assert.deepEqual(Buffer.from(await blob.arrayBuffer()),bytes);
 assert.equal(receipts[0].asset_id,a.id);assert.equal(receipts[0].release_ready,false);
});
test('denies cross-tenant reads before storage',async()=>{
 const bytes=fixtureWav(),calls=[];
 const res=build(bytes,{authorizeRead:async({scope:s})=>s.tenant_id==='tenant-b',
  readBytes:async()=>{calls.push(1);return bytes;}});
 await assert.rejects(res(assetOf(bytes)),/not authorized/);assert.equal(calls.length,0);
});
test('trusted review scope required',()=>assert.throws(()=>createFoundryVerifiedResolver({
 scope:{tenant_id:'t',session_id:'s',purpose:'publish'},authorizeRead:()=>true,
 readBytes:()=>fixtureWav()}),/Trusted/));
test('missing authorization adapter fails closed',()=>assert.throws(()=>createFoundryVerifiedResolver({
 scope:scope(),readBytes:()=>fixtureWav()}),/authorization/));
test('missing file reader fails closed',()=>assert.throws(()=>createFoundryVerifiedResolver({
 scope:scope(),authorizeRead:()=>true}),/authorization/));
test('tampered bytes fail even with matching manifest',async()=>{
 const b=fixtureWav(),a=assetOf(b),bad=Buffer.from(b);bad[60]=1;
 await assert.rejects(build(bad)(a),/SHA-256 mismatch/);
});
test('cannot self-declare commercial clearance',async()=>{
 const b=fixtureWav(),a=assetOf(b);a.commercial_rights_verified=true;
 await assert.rejects(build(b)(a),/self-certify/);
});
test('restricted recordings never reach storage',async()=>{
 const b=fixtureWav(),a=assetOf(b),calls=[];a.rights='restricted';
 await assert.rejects(build(b,{readBytes:async()=>{calls.push(1);return b;}})(a),/rights/);
 assert.equal(calls.length,0);
});
test('oversize byte claim never hits storage',async()=>{
 const b=fixtureWav(),a=assetOf(b),calls=[];a.byte_length=70000000;
 await assert.rejects(build(b,{readBytes:async()=>{calls.push(1);return b;}})(a),/budget/);
 assert.equal(calls.length,0);
});
test('Blob-provided data independently verifies',async()=>{
 const b=fixtureWav();
 assert.equal((await build(b,{readBytes:async()=>new Blob([b])})(assetOf(b))).size,b.length);
});
test('mutable read buffer cannot alter verified Blob',async()=>{
 const b=fixtureWav(),a=assetOf(b);let ref;
 const res=build(b,{readBytes:async()=>{ref=new Uint8Array(b);return ref;}});
 const wav=await res(a);ref[50]=255;
 assert.deepEqual(Buffer.from(await wav.arrayBuffer()),b);
});
test('no success receipts from forged recording',async()=>{
 const b=fixtureWav(),a=assetOf(b),bad=Buffer.from(b),receipts=[];bad[50]=2;
 await assert.rejects(build(bad,{onReceipt:async r=>receipts.push(r)})(a),/SHA-256 mismatch/);
 assert.equal(receipts.length,0);
});
test('invalid asset identity rejects before authorization',async()=>{
 const b=fixtureWav(),a=assetOf(b),calls=[];a.id='audio-sha256:'+'a'.repeat(64);
 await assert.rejects(build(b,{authorizeRead:async()=>{calls.push(1);return true;}})(a),/identity/);
 assert.equal(calls.length,0);
});
test('ArrayBuffer bytes accepted',async()=>{
 const b=fixtureWav();
 assert.equal((await build(b,{readBytes:async()=>Uint8Array.from(b).buffer})(assetOf(b))).size,b.length);
});
