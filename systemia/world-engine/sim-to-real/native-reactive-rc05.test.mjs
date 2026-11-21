import test from 'node:test';
import assert from 'node:assert/strict';
import {runReactiveEpisode,verifyReactiveEpisode,runHeldOut,verifyHeldOut} from './native-reactive-rc05.mjs';
test('RC05 native dynamic simulator executes anonymized reactive control with every tick recorded',()=>{
  const e=runReactiveEpisode({seed:41,maxTicks:140});
  assert.equal(e.nativeWorldEngineExecuted,true);
  assert.equal(e.hardwareExecution,false);
  assert.equal(e.noTeleportInputs,true);
  assert.equal(e.outcome.ticks,e.frames.length);
  assert.ok(e.inputs.length>=e.frames.length);
  assert.ok(e.inputs.every(x=>x.kind==='set_velocity'));
  assert.equal(verifyReactiveEpisode(e),true);
  assert.equal(e.proof.deterministicReplay,true);
});
test('same seed is deterministic',()=>{
  const a=runReactiveEpisode({seed:42,maxTicks:130});
  const b=runReactiveEpisode({seed:42,maxTicks:130});
  assert.equal(a.sha256,b.sha256);
  assert.equal(a.finalSnapshotDigest,b.finalSnapshotDigest);
});
test('forced blackout records stale-sensor holds without claiming physical e-stop',()=>{
  const e=runReactiveEpisode({seed:43,maxTicks:25,forcedBlackout:{start:0,length:25}});
  assert.ok(e.outcome.holdRequests>0);
  assert.ok(e.frames.some(f=>f.requested==='stale_sensor_hold'));
  assert.equal(e.realSensorData,false);
});
test('tampering and invalid options fail closed',()=>{
  const e=runReactiveEpisode({seed:44,maxTicks:55});
  e.frames[0].position.x=999;
  assert.equal(verifyReactiveEpisode(e),false);
  assert.throws(()=>runReactiveEpisode({seed:0}),/rc05_invalid_seed/);
  assert.throws(()=>runReactiveEpisode({maxTicks:999}),/rc05_invalid_max_ticks/);
});
test('held-out paired benchmark retains failures and verifies digest',()=>{
  const r=runHeldOut({firstSeed:41,seeds:2,maxTicks:130});
  assert.equal(r.runs.length,2);
  assert.equal(verifyHeldOut(r),true);
  for(const key of ['reactive','priorKnownCorridor']){
    const s=r[key];assert.equal(s.total,s.arrived+s.collisions+s.geofence+s.timeouts);
  }
  r.priorKnownCorridor.collisions++;
  assert.equal(verifyHeldOut(r),false);
  assert.throws(()=>runHeldOut({seeds:20}),/rc05_invalid_benchmark/);
});
