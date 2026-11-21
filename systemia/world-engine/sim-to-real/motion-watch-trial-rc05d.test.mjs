import test from 'node:test';
import assert from 'node:assert/strict';
import {runMotionWatchTrial,verifyMotionWatchTrial} from './motion-watch-trial-rc05d.mjs';
import {runReactiveEpisode} from './native-reactive-rc05.mjs';
test('RC05D native modeled monitor does not alter original default',()=>{
  const a=runReactiveEpisode({seed:51,maxTicks:50});
  const b=runReactiveEpisode({seed:51,maxTicks:50,controllerMode:'baseline'});
  assert.equal(a.sha256,b.sha256);
});
test('RC05D records native velocity inputs and anonymous motion-watch evidence',()=>{
  const ep=runReactiveEpisode({seed:51,maxTicks:160,controllerMode:'observed-motion-watch'});
  assert.ok(ep.inputs.every(x=>x.kind==='set_velocity'));
  assert.equal(ep.noTeleportInputs,true);
  assert.equal(ep.hardwareExecution,false);
  assert.ok(ep.frames.some(f=>typeof f.requested==='string'));
});
test('RC05D short paired trial is integrity-checked and has explicit outcome accounting',()=>{
  const r=runMotionWatchTrial({firstSeed:49,seeds:2,maxTicks:110});
  assert.equal(verifyMotionWatchTrial(r),true);
  assert.equal(r.scores.motionWatch.total,2);
  assert.equal(r.review.productionAuthorized,false);
  assert.equal(r.review.hardwareAuthorized,false);
  r.scores.motionWatch.collisions++;
  assert.equal(verifyMotionWatchTrial(r),false);
});
test('RC05D bounds cohort inputs and cannot confer production authority',()=>{
  assert.throws(()=>runMotionWatchTrial({firstSeed:0}),/rc05d_invalid_cohort/);
  assert.throws(()=>runMotionWatchTrial({seeds:17}),/rc05d_invalid_cohort/);
  const r=runMotionWatchTrial({firstSeed:50,seeds:1,maxTicks:80});
  r.productionAuthorized=true;
  assert.equal(verifyMotionWatchTrial(r),false);
});
