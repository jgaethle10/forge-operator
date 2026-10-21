import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGoldenBridgeBenchmark } from './golden-bridge-benchmark.js';
import { compileCinematicSequence } from './cinematic-sequence.js';
import { compilePerformancePlan } from './performance-director.js';
import type { VisualReference } from './model-fabric.js';

function image(id:string,role:'identity'|'environment'):VisualReference{
  return {
    id,kind:'image',role,digest:id[0].repeat(64),sourceRefs:['fixture:'+id],
    locators:[
      {kind:'url',value:'https://assets.example/'+id+'.png'},
      {kind:'provider_asset',providerId:'elevenlabs',value:'asset-'+id}
    ]
  };
}

function audio():VisualReference{
  return {
    id:'eli-line',kind:'audio',role:'dialogue_audio',digest:'d'.repeat(64),
    sourceRefs:['fixture:dialogue'],
    locators:[
      {kind:'url',value:'https://assets.example/eli-line.wav'},
      {kind:'provider_asset',providerId:'sync',value:'audio-eli-line'}
    ]
  };
}

test('canonical benchmark compiles into accepted cinematic and performance plans',()=>{
  const bundle=buildGoldenBridgeBenchmark({
    eliIdentity:[image('eli','identity')],
    foxIdentity:[image('fox','identity')],
    bridgeEnvironment:[image('bridge','environment')],
    eliDialogueAudio:audio(),
    sourceRefs:['book:watcher-mask','benchmark:golden-bridge']
  });
  const performance=compilePerformancePlan({
    sequence:bundle.sequence,
    performance:bundle.performance
  });
  assert.equal(performance.status,'accepted');
  const sequence=compileCinematicSequence(bundle.sequence);
  assert.equal(sequence.status,'accepted');
  assert.equal(sequence.shots.length,4);
  assert.equal(sequence.shots[1].carryInFromShotId,'bridge-01-establish');
  assert.equal(sequence.shots[2].carryInFromShotId,'bridge-02-catch');
  assert.equal(sequence.shots[3].axisReset,true);
  assert.equal(sequence.shots[3].mustProvideStartFrame,false);
  assert.equal(bundle.expectations.candidateCount,4);
  assert.equal(bundle.expectations.requiredSequenceMetrics.length,8);
  assert.equal(bundle.boundaries.sameBenchmarkMustBeReusedForRegression,true);
});

test('benchmark refuses to exist without explicit identity and environment canon',()=>{
  assert.throws(()=>buildGoldenBridgeBenchmark({
    eliIdentity:[],
    foxIdentity:[image('fox','identity')],
    bridgeEnvironment:[image('bridge','environment')],
    sourceRefs:['benchmark']
  }),/golden_bridge_reference_missing:eli/);

  assert.throws(()=>buildGoldenBridgeBenchmark({
    eliIdentity:[image('eli','identity')],
    foxIdentity:[image('fox','identity')],
    bridgeEnvironment:[],
    sourceRefs:['benchmark']
  }),/golden_bridge_reference_missing:bridge/);
});

test('dialogue audio remains optional for case definition but must be correctly typed when supplied',()=>{
  const without=buildGoldenBridgeBenchmark({
    eliIdentity:[image('eli','identity')],
    foxIdentity:[image('fox','identity')],
    bridgeEnvironment:[image('bridge','environment')],
    sourceRefs:['benchmark']
  });
  assert.equal(without.dialogue.approvedAudio,undefined);

  assert.throws(()=>buildGoldenBridgeBenchmark({
    eliIdentity:[image('eli','identity')],
    foxIdentity:[image('fox','identity')],
    bridgeEnvironment:[image('bridge','environment')],
    eliDialogueAudio:image('wrong','identity'),
    sourceRefs:['benchmark']
  }),/golden_bridge_dialogue_audio_invalid/);
});

test('benchmark digest changes when canon references change',()=>{
  const a=buildGoldenBridgeBenchmark({
    eliIdentity:[image('eli','identity')],
    foxIdentity:[image('fox','identity')],
    bridgeEnvironment:[image('bridge','environment')],
    sourceRefs:['benchmark']
  });
  const changed=image('eli2','identity');
  changed.digest='9'.repeat(64);
  const b=buildGoldenBridgeBenchmark({
    eliIdentity:[changed],
    foxIdentity:[image('fox','identity')],
    bridgeEnvironment:[image('bridge','environment')],
    sourceRefs:['benchmark']
  });
  assert.notEqual(a.bundleDigest,b.bundleDigest);
  assert.notEqual(a.sequence.continuityDigest,b.sequence.continuityDigest);
});
