import test from 'node:test';
import assert from 'node:assert/strict';
import {runReactiveEpisode,verifyReactiveEpisode} from './native-reactive-rc05.mjs';
import {runProgressTrial,verifyProgressTrial} from './progress-trial-rc05.mjs';
test('progress-gated rover runs in native World Engine with no teleport or hardware control',()=>{
  const r=runReactiveEpisode({seed:41,controllerMode:'progress-gated',maxTicks:150});
  assert.equal(r.controllerMode,'progress-gated');
  assert.equal(r.nativeWorldEngineExecuted,true);
  assert.equal(r.hardwareExecution,false);
  assert.equal(r.noTeleportInputs,true);
  assert.equal(r.proof.allTicksRecorded,true);
  assert.ok(r.inputs.every(i=>i.kind==='set_velocity'));
  assert.equal(verifyReactiveEpisode(r),true);
});
test('progress-gated mode is deterministic and retains observed outcomes',()=>{
  const a=runReactiveEpisode({seed:42,controllerMode:'progress-gated',maxTicks:120});
  const b=runReactiveEpisode({seed:42,controllerMode:'progress-gated',maxTicks:120});
  assert.equal(a.sha256,b.sha256);
  assert.equal(a.finalSnapshotDigest,b.finalSnapshotDigest);
});
test('invalid controller mode rejects before native execution',()=>{
  assert.throws(()=>runReactiveEpisode({seed:42,controllerMode:'hardware'}),/rc05_invalid_controller_mode/);
});
test('paired trial records all failures and rejects digest tampering',()=>{
  const r=runProgressTrial({firstSeed:49,seeds:2,maxTicks:110});
  assert.equal(verifyProgressTrial(r),true);
  assert.equal(r.pairs.length,2);
  for(const p of r.pairs)assert.ok(p.baseline.digest&&p.progress.digest);
  r.pairs[0].progress.status='arrived';
  assert.equal(verifyProgressTrial(r),false);
  assert.throws(()=>runProgressTrial({seeds:17}),/rc05a_invalid_trial_options/);
});
