import test from 'node:test';
import assert from 'node:assert/strict';
import {runShieldTrial,verifyShieldTrial} from './shield-trial-rc05b.mjs';
import {runReactiveEpisode} from './native-reactive-rc05.mjs';
test('RC05B runs native triple comparison with modeled evidence only',()=>{
  const p=runShieldTrial({firstSeed:51,seeds:1,maxTicks:85});
  assert.equal(p.scores.baseline.total,1);
  assert.equal(p.scores.progress.total,1);
  assert.equal(p.scores.shield.total,1);
  assert.equal(p.noHardwareAuthority,true);
  assert.equal(p.productionAuthorized,false);
  assert.equal(verifyShieldTrial(p),true);
});
test('RC05B does not change default controller',()=>{
  const a=runReactiveEpisode({seed:41,maxTicks:65});
  const b=runReactiveEpisode({seed:41,maxTicks:65,controllerMode:'baseline'});
  assert.equal(a.sha256,b.sha256);
  assert.equal(a.controllerMode,'baseline');
});
test('RC05B uses only tick-bound native set_velocity',()=>{
  const e=runReactiveEpisode({seed:56,maxTicks:120,controllerMode:'progress-shielded'});
  assert.equal(e.hardwareExecution,false);
  assert.equal(e.noTeleportInputs,true);
  assert.ok(e.inputs.every(i=>i.kind==='set_velocity'));
  assert.ok(e.frames.every(f=>typeof f.requested==='string'));
});
test('RC05B tampering cannot confer hardware or production authority',()=>{
  const trial=runShieldTrial({firstSeed:49,seeds:1,maxTicks:90});
  trial.review.productionAuthorized=true;
  assert.equal(verifyShieldTrial(trial),false);
});
test('RC05B rejects invalid scenario options',()=>{
  assert.throws(()=>runShieldTrial({firstSeed:0}),/rc05b_trial_invalid_options/);
  assert.throws(()=>runShieldTrial({seeds:30}),/rc05b_trial_invalid_options/);
});