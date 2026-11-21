import test from 'node:test';
import assert from 'node:assert/strict';
import {runReactiveEpisode,verifyReactiveEpisode} from './native-reactive-rc05.mjs';
import {runFamilyTrial,verifyFamilyTrial} from './family-trial-rc05f.mjs';
test('RC05F preserves canonical legacy baseline exactly',()=>{
  const a=runReactiveEpisode({seed:55,maxTicks:70});
  const b=runReactiveEpisode({seed:55,maxTicks:70,scenarioFamily:'legacy'});
  assert.equal(a.sha256,b.sha256);
});
test('RC05F crossing-lanes and offset-slalom run real native set_velocity inputs',()=>{
  for(const scenarioFamily of ['crossing-lanes','offset-slalom']){
    const ep=runReactiveEpisode({seed:101,maxTicks:100,controllerMode:'observed-motion-latched',scenarioFamily});
    assert.equal(ep.scenarioFamily,scenarioFamily);
    assert.equal(ep.hardwareExecution,false);
    assert.equal(ep.noTeleportInputs,true);
    assert.ok(ep.inputs.every(x=>x.kind==='set_velocity'));
    assert.equal(ep.frames.length,ep.outcome.ticks);
    assert.equal(ep.proof.deterministicReplay,true);
    assert.equal(verifyReactiveEpisode(ep),true);
  }
});
test('RC05F deterministic synthetic family episode and digest',()=>{
  for(const family of ['crossing-lanes','offset-slalom']){
    const a=runReactiveEpisode({seed:103,scenarioFamily:family,maxTicks:110});
    const b=runReactiveEpisode({seed:103,scenarioFamily:family,maxTicks:110});
    assert.equal(a.sha256,b.sha256);
    assert.equal(a.finalSnapshotDigest,b.finalSnapshotDigest);
  }
});
test('RC05F paired family trial records failures, passes integrity and forbids authority',()=>{
  for(const family of ['crossing-lanes','offset-slalom']){
    const r=runFamilyTrial({family,firstSeed:101,seeds:2,maxTicks:120});
    assert.equal(r.pairs.length,2);
    assert.equal(r.productionAuthorized,false);
    assert.equal(r.review.hardwareAuthorized,false);
    assert.equal(verifyFamilyTrial(r),true);
    const a=r.scores.latched;
    assert.equal(a.total,a.arrived+a.collisions+a.geofence+a.timeouts);
  }
});
test('RC05F rejects altered or fabricated reports, invalid families and size',()=>{
  const r=runFamilyTrial({family:'offset-slalom',firstSeed:107,seeds:1,maxTicks:50});
  r.scores.latched.collisions++;
  assert.equal(verifyFamilyTrial(r),false);
  assert.throws(()=>runFamilyTrial({family:'legacy'}),/rc05f_trial_options_invalid/);
  assert.throws(()=>runFamilyTrial({seeds:17}),/rc05f_trial_options_invalid/);
  assert.throws(()=>runReactiveEpisode({scenarioFamily:'fictional'}),/rc05f_invalid_scenario_family/);
});