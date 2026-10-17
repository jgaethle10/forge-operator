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
