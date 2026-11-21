import test from 'node:test';
import assert from 'node:assert/strict';
import { challengeEpisode } from './rover-challenge.mjs';
import { EvercraftWorldRuntime } from '../engine.js';
import { nativeBatch, runNativeEpisode, verifyNativeProof } from './native-engine-proof.mjs';

test('RC03 replays seeded sampled telemetry in actual native World Engine with matching contacts',()=>{
  for(const policy of ['blind','safety-first']){
    const proof=runNativeEpisode(challengeEpisode({seed:1,policy}));
    assert.equal(proof.nativeEngineExecuted,true);
    assert.equal(proof.hardwareExecution,false);
    assert.equal(proof.nativePhysicsSimulatedController,false);
    assert.equal(proof.maxRecordedPoseDifferenceMeters,0);
    assert.equal(proof.recordedSampleFrames,proof.validatedCollisionSamples);
    assert.equal(proof.nativeContactSamples,proof.independentGeometryOverlapSamples);
    assert.equal(verifyNativeProof(proof),true);
  }
});

test('RC03 final digest matches deterministic engine rerun, restore and reversed ledger',()=>{
  const e=challengeEpisode({seed:3,policy:'safety-first'});
  const proof=runNativeEpisode(e);
  assert.equal(proof.deterministicReplay,true);
  assert.equal(proof.checkpointRestoreVerified,true);
  assert.equal(proof.inputOrderInvariant,true);
  assert.equal(proof.nativeSnapshotVerified,true);
});

test('RC03 rejects changed modeled frames with stale digest',()=>{
  const ep=challengeEpisode({seed:1,policy:'blind'});
  ep.frames[0].x+=1;
  assert.throws(()=>runNativeEpisode(ep),/rc03_source_episode_invalid/);
});

test('RC03 proof receipt integrity detects modification',()=>{
  const proof=runNativeEpisode(challengeEpisode({seed:2,policy:'safety-first'}));
  proof.nativeEngineExecuted=false;
  assert.equal(verifyNativeProof(proof),false);
});

test('RC03 batch checks both policies and validates seed limits',()=>{
  const batch=nativeBatch({seeds:2});
  assert.equal(batch.episodes,4);
  assert.equal(batch.allNativeReplaysVerified,true);
  assert.equal(batch.runs.every(r=>r.realSensorData===false&&r.hardwareExecution===false),true);
  assert.throws(()=>nativeBatch({seeds:13}),/rc03_invalid_seed_count/);
});

test('native engine itself reports static sphere contact on synthetic overlap',()=>{
  const world={schema:'evercraft.world-engine.world.v1',id:'rc03-contact-contract',version:1,
    tickRateHz:10,gravity:{x:0,y:0,z:0},entities:[
      {id:'robot',transform:{position:{x:0,y:0,z:0}},collider:{type:'sphere',radius:.25}},
      {id:'obstacle',transform:{position:{x:1,y:0,z:0}},collider:{type:'sphere',radius:.25}}
    ]};
  const native=new EvercraftWorldRuntime(world);
  const contact=native.step([{id:'deliberate-overlap',tick:1,entityId:'robot',kind:'teleport',value:{x:.9,y:0,z:0}}]).collisions;
  assert.equal(contact.length,1);
  assert.equal(contact[0].kind,'sphere_sphere');
});