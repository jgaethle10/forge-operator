import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PULSEGRID_SESSION_SCHEMA,
  applyPulseGridOperation,
  createPulseGridSession,
  migratePulseGridSession,
  validatePulseGridSession,
} from './pulsegrid-session.js';

test('PulseGrid creates a valid canonical Fallen music session',()=>{
  const session=createPulseGridSession('Proof Song');
  assert.equal(session.schema,PULSEGRID_SESSION_SCHEMA);
  assert.equal(session.project_name,'Proof Song');
  assert.equal(session.tracks.length,5);
  assert.equal(session.tracks[0].clips.length,4);
  assert.equal(validatePulseGridSession(session).ok,true);
});

test('PulseGrid migrates older sparse browser sessions into the canonical graph',()=>{
  const migrated=migratePulseGridSession({
    version:'0.3.0',
    projectName:'Old Session',
    bpm:128,
    tracks:[{
      id:'keys',
      name:'Keys',
      type:'synth',
      clips:[{id:'keys-scene-1',steps:[1,0,0,0]}]
    }]
  });
  assert.equal(migrated.version,'0.5.0');
  assert.equal(migrated.transport.bpm,128);
  assert.equal(migrated.tracks[0].clips[0].steps.length,16);
  assert.equal(migrated.tracks[0].clips[0].probabilities.length,16);
  assert.equal(validatePulseGridSession(migrated).ok,true);
});

test('PulseGrid semantic edits return reversible receipts',()=>{
  const original=createPulseGridSession();
  const {session,receipt}=applyPulseGridOperation(original,{type:'track.set_filter',track_id:'bass',filter_hz:880},'agent');
  assert.equal(original.tracks.find((track)=>track.id==='bass')?.filterHz,1200);
  assert.equal(session.tracks.find((track)=>track.id==='bass')?.filterHz,880);
  assert.equal(receipt.actor,'agent');
  assert.equal(receipt.reversible,true);
  assert.deepEqual(receipt.targets,['track:bass.filterHz']);
});
