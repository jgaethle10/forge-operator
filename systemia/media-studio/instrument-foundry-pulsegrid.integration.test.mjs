import test from 'node:test';
import assert from 'node:assert/strict';
import {createPulseGridSession,applyPulseGridTransaction,undoPulseGridReceipt} from './pulsegrid-session.ts';
import {compileFoundryImport} from './instrument-foundry-bridge.mjs';

// This uses the EXISTING canonical PulseGrid engine, not a mocked mutation.
test('Foundry transaction can register and attach through canonical PulseGrid, then undo',()=>{
  const source=createPulseGridSession('Foundry owned sample proof');
  const track=source.tracks.find(t=>t.type==='audio');
  assert.ok(track);
  const digest='a'.repeat(64);
  const candidate={id:'audio-sha256:'+digest,digest,kind:'audio',mime_type:'audio/wav',
    byte_length:20000,duration_sec:1,sample_rate:48000,channels:2,source_name:'synthetic-fixture',
    source_refs:['sha256:'+'b'.repeat(64)],source_state:'bounce',rights:'unknown',
    parent_asset_ids:[],created_at:'2026-10-17T00:00:00Z'};
  const compiled=compileFoundryImport({session:source,assets:[candidate],
    attachments:[{track_id:track.id,scene:0,asset_id:candidate.id}]});
  const result=applyPulseGridTransaction(source,compiled.transaction,compiled.actor);
  assert.equal(source.assets.length,0);
  assert.equal(result.session.assets.length,1);
  assert.equal(result.session.assets[0].rights,'unknown');
  assert.equal(result.session.tracks.find(t=>t.id===track.id).clips[0].audio_asset_id,candidate.id);
  assert.equal(compiled.custody.release_ready,false);
  const reverted=undoPulseGridReceipt(result.session,result.receipt.id,'human');
  assert.equal(reverted.session.assets.length,0);
  assert.equal(reverted.session.tracks.find(t=>t.id===track.id).clips[0].audio_asset_id,null);
});

test('piano one-shot playback mode is a canonical reversible transaction, independent of loop mode',()=>{
  const source=createPulseGridSession('One-shot piano release');
  const track=source.tracks.find(t=>t.type==='audio');
  const original=track.clips[0].provenance.audio_playback_mode;
  assert.equal(original,undefined);
  const result=applyPulseGridTransaction(source,{
    intent:'Admit expressive piano one-shot without repetition',
    operations:[
      {type:'clip.set_bars',track_id:track.id,scene:0,bars:2},
      {type:'clip.set_audio_playback_mode',track_id:track.id,scene:0,mode:'one_shot'},
    ],
  },'human');
  assert.equal(result.session.tracks.find(t=>t.id===track.id).clips[0].provenance.audio_playback_mode,'one_shot');
  assert.equal(source.tracks.find(t=>t.id===track.id).clips[0].provenance.audio_playback_mode,undefined);
  const undone=undoPulseGridReceipt(result.session,result.receipt.id,'human');
  assert.equal(undone.session.tracks.find(t=>t.id===track.id).clips[0].provenance.audio_playback_mode,undefined);
  assert.equal(undone.session.tracks.find(t=>t.id===track.id).clips[0].bars,1);
});
test('invalid playback modes fail closed and cannot alter an existing graph',()=>{
  const source=createPulseGridSession('Invalid mode');
  const track=source.tracks.find(t=>t.type==='audio');
  assert.throws(()=>applyPulseGridTransaction(source,{
    intent:'Invalid sound mode must not mutate',
    operations:[{type:'clip.set_audio_playback_mode',track_id:track.id,scene:0,mode:'alien_mode'}],
  },'human'),/Unsupported audio playback mode/);
  assert.equal(source.tracks.find(t=>t.id===track.id).clips[0].provenance.audio_playback_mode,undefined);
});
test('synth track cannot masquerade as a one-shot recorded piano',()=>{
  const source=createPulseGridSession('Cross-track denial');
  const track=source.tracks.find(t=>t.type==='synth');
  assert.throws(()=>applyPulseGridTransaction(source,{
    intent:'Audio mode cannot apply to synth',
    operations:[{type:'clip.set_audio_playback_mode',track_id:track.id,scene:0,mode:'one_shot'}],
  },'human'),/only to audio tracks/);
});
