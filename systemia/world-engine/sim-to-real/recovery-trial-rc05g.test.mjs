import test from 'node:test';
import assert from 'node:assert/strict';
import {runReactiveEpisode,verifyReactiveEpisode} from './native-reactive-rc05.mjs';
import {runRecoveryTrial,verifyRecoveryTrial} from './recovery-trial-rc05g.mjs';

test('RC05G opt-in mode leaves both default and existing RC05E receipt unchanged',()=>{
  for(const mode of ['baseline','observed-motion-latched']){
    const old=runReactiveEpisode({seed:55,maxTicks:80,controllerMode:mode});
    const newCall=runReactiveEpisode({seed:55,maxTicks:80,controllerMode:mode,scenarioFamily:'legacy'});
    assert.equal(old.sha256,newCall.sha256);
  }
});
test('RC05G native speed commands preserve no-hardware, no-teleport, replay receipt',()=>{
  const r=runReactiveEpisode({seed:55,controllerMode:'observed-goal-recovery',maxTicks:350});
  assert.equal(verifyReactiveEpisode(r),true);
  assert.equal(r.hardwareExecution,false);
  assert.equal(r.noTeleportInputs,true);
  assert.equal(r.proof.deterministicReplay,true);
  assert.ok(r.frames.every(f=>typeof f.requested==='string'));
  assert.ok(r.inputs.every(i=>i.kind==='set_velocity'));
});
test('RC05G modeled regression seeds 55 and 56 produce fully accounted outcomes',()=>{
  for(const seed of [55,56]){
    const a=runReactiveEpisode({seed,maxTicks:350,controllerMode:'observed-goal-recovery'});
    assert.ok(['arrived','collision','geofence','timeout'].includes(a.outcome.status));
    assert.equal(a.frames.length,a.outcome.ticks);
    assert.equal(verifyReactiveEpisode(a),true);
  }
});
test('RC05G native trial integrity and research-only scope',()=>{
  const r=runRecoveryTrial({firstSeed:54,seeds:3,maxTicks:110});
  assert.equal(r.scores.recovery.total,3);
  assert.equal(r.hardwareExecution,false);
  assert.equal(r.productionAuthorized,false);
  assert.equal(r.review.hardwareAuthorized,false);
  assert.equal(verifyRecoveryTrial(r),true);
  r.review.productionAuthorized=true;
  assert.equal(verifyRecoveryTrial(r),false);
});
test('RC05G supports both new families without altering default controller',()=>{
  for(const family of ['crossing-lanes','offset-slalom']){
    const a=runReactiveEpisode({seed:210,maxTicks:90,scenarioFamily:family});
    const b=runReactiveEpisode({seed:210,maxTicks:90,scenarioFamily:family,controllerMode:'baseline'});
    assert.equal(a.sha256,b.sha256);
    const recovery=runReactiveEpisode({seed:210,maxTicks:90,scenarioFamily:family,controllerMode:'observed-goal-recovery'});
    assert.equal(verifyReactiveEpisode(recovery),true);
  }
});
test('RC05G rejects invalid trial parameters and integrity corruption',()=>{
  assert.throws(()=>runRecoveryTrial({scenarioFamily:'unknown'}),/rc05g_invalid_trial_options/);
  assert.throws(()=>runRecoveryTrial({seeds:17}),/rc05g_invalid_trial_options/);
  const r=runRecoveryTrial({seeds:1,maxTicks:40});
  r.scores.recovery.collisions+=1;
  assert.equal(verifyRecoveryTrial(r),false);
});

test('RC05G native receipt does not omit hazard-latch hold and cancellation counts',()=>{
  const ep=runReactiveEpisode({seed:51,maxTicks:200,controllerMode:'observed-goal-recovery'});
  const observedHolds=ep.frames.filter(f=>f.latchDiagnostics?.phase==='hold').length;
  assert.equal(ep.outcome.latchedHoldTicks,observedHolds);
  assert.equal(typeof ep.outcome.modeledCanceledCommands,'number');
  assert.ok(ep.outcome.modelledCanceledCommands===undefined);
  assert.ok(ep.outcome.modeledCanceledCommands>=0);
});
