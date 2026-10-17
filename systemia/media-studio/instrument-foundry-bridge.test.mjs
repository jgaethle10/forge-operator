import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {compileFoundryImport,verifyFoundryWavBytes} from './instrument-foundry-bridge.mjs';

const hash='a'.repeat(64),parent='b'.repeat(64);
function asset(){return {id:'audio-sha256:'+hash,digest:hash,kind:'audio',mime_type:'audio/wav',
  byte_length:10000,duration_sec:1,sample_rate:48000,channels:2,source_name:'test',
  source_refs:['sha256:'+parent],source_state:'bounce',rights:'unknown',
  created_at:'2026-10-17T00:00:00Z',parent_asset_ids:[]};}
function session(){return {schema:'evercraft.fallen.pulsegrid.session.v1',assets:[],
  tracks:[{id:'audio',type:'audio',clips:[{audio_asset_id:null}]},
    {id:'synth',type:'synth',clips:[{audio_asset_id:null}]}]};}
function input(){return {session:session(),assets:[asset()],
  attachments:[{track_id:'audio',scene:0,asset_id:'audio-sha256:'+hash}]};}
test('builds register plus attach without self-declaring execution or release',()=>{
  const plan=compileFoundryImport(input());
  assert.deepEqual(plan.transaction.operations.map(op=>op.type),['asset.register_audio','clip.attach_audio_asset']);
  assert.equal(plan.custody.release_ready,false);
  assert.equal(plan.custody.playback_verified,false);
  assert.equal(plan.custody.unknown_rights.length,1);
});
test('rejects invalid digest',()=>{const x=input();x.assets[0].digest='bad';assert.throws(()=>compileFoundryImport(x),/SHA-256/)});
test('rejects digest identity mismatch',()=>{const x=input();x.assets[0].id='wrong';assert.throws(()=>compileFoundryImport(x),/identity/)});
test('rejects restricted rights',()=>{const x=input();x.assets[0].rights='restricted';assert.throws(()=>compileFoundryImport(x),/Restricted/)});
test('rejects asserted release clearance',()=>{const x=input();x.assets[0].release_ready=true;assert.throws(()=>compileFoundryImport(x),/self-certify/)});
test('rejects missing source receipts',()=>{const x=input();x.assets[0].source_refs=[];assert.throws(()=>compileFoundryImport(x),/provenance/)});
test('rejects malformed source digest reference',()=>{const x=input();x.assets[0].source_refs=['sha256:bad'];assert.throws(()=>compileFoundryImport(x),/provenance/)});
test('rejects non-audio target',()=>{const x=input();x.attachments[0].track_id='synth';assert.throws(()=>compileFoundryImport(x),/audio tracks/)});
test('rejects out-of-range clip',()=>{const x=input();x.attachments[0].scene=9;assert.throws(()=>compileFoundryImport(x),/scene index/)});
test('rejects alien asset attachment',()=>{const x=input();x.attachments[0].asset_id='audio-sha256:'+'c'.repeat(64);assert.throws(()=>compileFoundryImport(x),/unverified batch/)});
test('refuses to overwrite existing clip take',()=>{const x=input();x.session.tracks[0].clips[0].audio_asset_id='audio-sha256:'+'c'.repeat(64);assert.throws(()=>compileFoundryImport(x),/silently overwritten/)});
test('does not allow reusing a digest with different rights',()=>{const x=input();x.session.assets=[{...asset(),rights:'owned'}];assert.throws(()=>compileFoundryImport(x),/custody or rights/)});
test('does not allow same digest with different byte length',()=>{const x=input();x.session.assets=[{...asset(),byte_length:99}];assert.throws(()=>compileFoundryImport(x),/custody or rights/)});
test('idempotent registration generates only attach operation',()=>{const x=input();x.session.assets=[asset()];assert.equal(compileFoundryImport(x).transaction.operations.length,1)});
test('rejects duplicate attachment targets',()=>{const x=input();x.attachments.push(x.attachments[0]);assert.throws(()=>compileFoundryImport(x),/Duplicate audio clip/)});
test('rejects non-audio asset kind',()=>{const x=input();x.assets[0].kind='video';assert.throws(()=>compileFoundryImport(x),/identity/)});
function wav(){
  const b=Buffer.alloc(60);
  b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);
  b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);
  b.writeUInt16LE(1,22);b.writeUInt32LE(48000,24);b.writeUInt32LE(96000,28);
  b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
  b.write('data',36);b.writeUInt32LE(16,40);return b;
}
function meta(buffer){return {...asset(),byte_length:buffer.length,channels:1,
  digest:createHash('sha256').update(buffer).digest('hex')};}
test('byte-accurate original WAV verifies independently',async()=>{
  const b=wav();const p=await verifyFoundryWavBytes(meta(b),new Uint8Array(b));
  assert.equal(p.verified,true);
});
test('tampering rejects WAV even when metadata unchanged',async()=>{
  const b=wav(),m=meta(b);b[b.length-1]=9;
  await assert.rejects(verifyFoundryWavBytes(m,b),/SHA-256 mismatch/);
});
test('malformed chunk refuses playback',async()=>{
  const b=wav(),m=meta(b);b.writeUInt32LE(999999,40);
  await assert.rejects(verifyFoundryWavBytes(m,b),/Malformed WAV chunk/);
});
test('forged sample rate fails verified-byte check',async()=>{
  const b=wav(),m=meta(b);m.sample_rate=44100;
  await assert.rejects(verifyFoundryWavBytes(m,b),/disagrees/);
});
test('arraybuffer decode accepted',async()=>{
  const b=wav(),m=meta(b);
  assert.equal((await verifyFoundryWavBytes(m,new Uint8Array(b).buffer)).digest,m.digest);
});
