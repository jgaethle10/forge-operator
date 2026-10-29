import test from 'node:test';
import assert from 'node:assert/strict';
import {createPulseGridSession,applyPulseGridTransaction} from './pulsegrid-session.ts';
import {pulseGridAudioAuthoritySignature} from './pulsegrid-audio-authority.mjs';

const sha='a'.repeat(64),asset_id='audio-sha256:'+sha;
function session(){
  const base=createPulseGridSession('recording custody');
  return applyPulseGridTransaction(base,{intent:'register synthetic audio fixture',
    operations:[{type:'asset.register_audio',asset:{
      digest:sha,mime_type:'audio/wav',byte_length:48044,
      duration_sec:.5,sample_rate:48000,channels:1,
      source_refs:['sha256:'+sha],source_state:'recording',rights:'unknown',
      source_name:'not-a-piano',parent_asset_ids:[],
    }}]},'human').session;
}
test('recording authority includes graph owner and rights metadata',()=>{
 const a=session(),same=structuredClone(a);
 assert.equal(pulseGridAudioAuthoritySignature(a),pulseGridAudioAuthoritySignature(same));
 const differentSession=structuredClone(a);differentSession.session_id='another-tenant-session';
 assert.notEqual(pulseGridAudioAuthoritySignature(a),pulseGridAudioAuthoritySignature(differentSession));
 const restriction=structuredClone(a);restriction.assets[0].rights='restricted';
 assert.notEqual(pulseGridAudioAuthoritySignature(a),pulseGridAudioAuthoritySignature(restriction));
 const provenance=structuredClone(a);provenance.assets[0].source_refs=['some-other-origin'];
 assert.notEqual(pulseGridAudioAuthoritySignature(a),pulseGridAudioAuthoritySignature(provenance));
});
test('unrelated mixer gain edits do not cause unnecessary sample cache resets',()=>{
 const a=session(),volume=structuredClone(a);volume.tracks[0].volume=.4;
 assert.equal(pulseGridAudioAuthoritySignature(a),pulseGridAudioAuthoritySignature(volume));
});
test('sample references and MIDI note coverage force new authorization boundary',()=>{
 const a=session(),attached=structuredClone(a);
 attached.tracks.find(t=>t.id==='audio').clips[0].audio_asset_id=asset_id;
 assert.notEqual(pulseGridAudioAuthoritySignature(a),pulseGridAudioAuthoritySignature(attached));
 const piano=structuredClone(a);
 piano.tracks.find(t=>t.id==='keys').clips[0].provenance.foundry_piano_patch={
   kind:'recorded_piano_v1',max_transpose_semitones:2,
   samples:[{asset_id,root_pitch:60,velocity_min:0,velocity_max:1,release_sec:.2}]
 };
 const shifted=structuredClone(piano);
 shifted.tracks.find(t=>t.id==='keys').clips[0].notes.push({
   id:'sample-note',pitch:61,velocity:.5,start:0,length:1,probability:1,microtiming:0
 });
 assert.notEqual(pulseGridAudioAuthoritySignature(piano),pulseGridAudioAuthoritySignature(shifted));
});
test('malformed authority inputs fail closed',()=>{
 assert.throws(()=>pulseGridAudioAuthoritySignature({}),/Canonical audio session/);
});
