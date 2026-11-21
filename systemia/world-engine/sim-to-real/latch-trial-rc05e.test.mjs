import test from 'node:test';
import assert from 'node:assert/strict';
import {runReactiveEpisode,verifyReactiveEpisode} from './native-reactive-rc05.mjs';
import {runLatchTrial,verifyLatchTrial} from './latch-trial-rc05e.mjs';
test('RC05E mode is opt-in and baseline native digest remains identical',()=>{
 const a=runReactiveEpisode({seed:51,maxTicks:45});
 const b=runReactiveEpisode({seed:51,maxTicks:45,controllerMode:'baseline'});
 assert.equal(a.sha256,b.sha256);
});
test('latched native motion retains dynamic inputs and per-tick receipts without hardware claims',()=>{
 const x=runReactiveEpisode({seed:56,maxTicks:180,controllerMode:'observed-motion-latched'});
 assert.equal(verifyReactiveEpisode(x),true);
 assert.equal(x.hardwareExecution,false);
 assert.equal(x.noTeleportInputs,true);
 assert.ok(x.inputs.every(i=>i.kind==='set_velocity'));
 assert.equal(x.frames.length,x.outcome.ticks);
 assert.ok(x.frames.some(f=>f.latchDiagnostics?.schema==='evercraft.sim-to-real.hazard-latch.rc05e'));
});
test('known regression seeds preserve collisions or arrivals explicitly, without erasing failures',()=>{
 const e51=runReactiveEpisode({seed:51,maxTicks:350,controllerMode:'observed-motion-latched'});
 const e56=runReactiveEpisode({seed:56,maxTicks:350,controllerMode:'observed-motion-latched'});
 assert.ok(['arrived','collision','geofence','timeout'].includes(e51.outcome.status));
 assert.ok(['arrived','collision','geofence','timeout'].includes(e56.outcome.status));
 for(const e of [e51,e56])assert.equal(verifyReactiveEpisode(e),true);
});
test('seeded RC05E native episode is deterministic and exact replay digest validated',()=>{
 const a=runReactiveEpisode({seed:65,maxTicks:130,controllerMode:'observed-motion-latched'});
 const b=runReactiveEpisode({seed:65,maxTicks:130,controllerMode:'observed-motion-latched'});
 assert.equal(a.sha256,b.sha256);assert.equal(a.proof.deterministicReplay,true);
});
test('full modeled cohort review rejects tampering and never allows hardware or release',()=>{
 const r=runLatchTrial({firstSeed:49,seeds:2,maxTicks:110});
 assert.equal(r.scores.latched.total,2);
 assert.equal(verifyLatchTrial(r),true);
 assert.equal(r.hardwareExecution,false);
 assert.equal(r.review.hardwareAuthorized,false);
 r.scores.latched.collisions++;
 assert.equal(verifyLatchTrial(r),false);
 assert.throws(()=>runLatchTrial({seeds:18}),/rc05e_invalid_trial/);
});