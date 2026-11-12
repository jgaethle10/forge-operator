import test from 'node:test';
import assert from 'node:assert/strict';
import {runEscapeTrial,verifyEscapeTrial} from './escape-trial-rc05c.mjs';
import {runReactiveEpisode} from './native-reactive-rc05.mjs';

test('RC05C runs modeled native World Engine motion in opt-in mode',()=>{
 const x=runReactiveEpisode({seed:51,maxTicks:160,controllerMode:'observed-lateral-escape'});
 assert.equal(x.nativeWorldEngineExecuted,true);
 assert.equal(x.hardwareExecution,false);
 assert.equal(x.noTeleportInputs,true);
 assert.ok(x.inputs.every(i=>i.kind==='set_velocity'));
 assert.equal(x.controllerMode,'observed-lateral-escape');
 assert.ok(x.frames.some(f=>f.requested==='observed_lateral_escape'));
});
test('RC05C leaves default RC05 behavior unchanged',()=>{
 const a=runReactiveEpisode({seed:51,maxTicks:90});
 const b=runReactiveEpisode({seed:51,maxTicks:90,controllerMode:'baseline'});
 assert.equal(a.sha256,b.sha256);
 assert.equal(b.controllerMode,'baseline');
});
test('RC05C four-way evidence has explicit outcomes and no authority',()=>{
 const x=runEscapeTrial({firstSeed:65,seeds:2,maxTicks:120});
 assert.equal(x.pairs.length,2);
 assert.equal(verifyEscapeTrial(x),true);
 assert.equal(x.hardwareExecution,false);
 assert.equal(x.review.hardwareAuthorized,false);
 for(const key of ['baseline','progress','shield','escape']){
  const s=x.scores[key];
  assert.equal(s.total,s.arrived+s.collisions+s.geofence+s.timeouts);
 }
});
test('RC05C rejects modified digest, fabricated production claims and bad cohort options',()=>{
 const x=runEscapeTrial({firstSeed:65,seeds:1,maxTicks:70});
 x.review.productionAuthorized=true;
 assert.equal(verifyEscapeTrial(x),false);
 assert.throws(()=>runEscapeTrial({seeds:20}),/rc05c_invalid_trial_options/);
 assert.throws(()=>runEscapeTrial({firstSeed:0}),/rc05c_invalid_trial_options/);
 assert.throws(()=>runReactiveEpisode({controllerMode:'physical'}),/rc05_invalid_controller_mode/);
});
test('RC05C repeated modeled run is deterministic',()=>{
 const a=runReactiveEpisode({seed:56,maxTicks:150,controllerMode:'observed-lateral-escape'});
 const b=runReactiveEpisode({seed:56,maxTicks:150,controllerMode:'observed-lateral-escape'});
 assert.equal(a.sha256,b.sha256);
 assert.equal(a.finalSnapshotDigest,b.finalSnapshotDigest);
});
