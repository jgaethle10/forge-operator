import test from 'node:test';
import assert from 'node:assert/strict';
import {createMotionWorld,runMotionEpisode,verifyMotionEpisode,motionBatch,
  verifyMotionBatch,sweptCircleContact} from './native-motion-rc04.mjs';

test('RC04 world uses a dynamic rover and native colliders with no hardware authority',()=>{
  const {world,course}=createMotionWorld(1);
  assert.equal(world.schema,'evercraft.world-engine.world.v1');
  assert.equal(world.tickRateHz,10);
  assert.equal(world.entities.length,5);
  assert.equal(world.entities.find(e=>e.id==='rover').rigidBody.mass,1);
  assert.equal(world.entities.find(e=>e.id==='moving').rigidBody.mass,1e8);
  assert.equal(course.dt,.1);
  assert.equal(world.metadata.no_hardware_authority,true);
});
test('RC04 actually moves the rover using native set_velocity, never teleport',()=>{
  const report=runMotionEpisode({seed:2,policy:'known-corridor',maxTicks:105});
  assert.equal(report.nativeWorldEngineExecuted,true);
  assert.equal(report.physicsDrivenMovement,true);
  assert.equal(report.teleportInputs,false);
  assert.equal(report.realSensors,false);
  assert.equal(report.hardwareExecution,false);
  assert.equal(report.outcome.recordedFrames,report.outcome.ticks);
  assert.ok(report.velocityLedger.length>=report.outcome.ticks);
  assert.ok(report.velocityLedger.every(i=>i.kind==='set_velocity'));
  assert.ok(report.frames.some(f=>Math.hypot(f.position.x,f.position.z)>.1));
  assert.equal(report.integrity.deterministicReplay,true);
  assert.equal(verifyMotionEpisode(report),true);
});
test('matched episodes and native replay produce deterministic receipts',()=>{
  const a=runMotionEpisode({seed:3,policy:'blind',maxTicks:95});
  const b=runMotionEpisode({seed:3,policy:'blind',maxTicks:95});
  assert.deepEqual(a,b);
  assert.equal(a.finalSnapshotDigest,b.finalSnapshotDigest);
});
test('the independent sweep detects crossings that endpoint contacts may miss',()=>{
  const hit=sweptCircleContact({x:-2,z:0},{x:2,z:0},.2,
    {x:0,z:0},{x:0,z:0},.3);
  assert.equal(hit.contact,true);
  assert.equal(hit.fraction,.5);
  assert.ok(hit.clearance<0);
  const clear=sweptCircleContact({x:-2,z:2},{x:2,z:2},.2,
    {x:0,z:0},{x:0,z:0},.3);
  assert.equal(clear.contact,false);
  assert.throws(()=>sweptCircleContact({x:NaN,z:0},{x:1,z:0},.2,
    {x:0,z:0},{x:0,z:0},.3),/rc04_invalid_sweep_value/);
});
test('sensor blackout invokes conservative stale-hold requests',()=>{
  const e=runMotionEpisode({seed:5,policy:'known-corridor',maxTicks:20,
    forcedBlackout:{start:0,length:20}});
  assert.ok(e.outcome.holdRequests>0);
  assert.ok(e.frames.every(f=>f.requested==='stale_sensor_hold'));
  assert.equal(e.hardwareExecution,false);
});
test('bad inputs reject and cannot silently assert hardware or safety claims',()=>{
  assert.throws(()=>createMotionWorld(0),/rc04_invalid_seed/);
  assert.throws(()=>runMotionEpisode({policy:'physical-robot'}),/rc04_invalid_policy/);
  assert.throws(()=>runMotionEpisode({maxTicks:0}),/rc04_invalid_max_ticks/);
  assert.throws(()=>runMotionEpisode({forcedBlackout:{start:-2,length:10}}),/rc04_invalid_blackout/);
  const r=runMotionEpisode({seed:1,policy:'blind',maxTicks:80});
  r.hardwareExecution=true;
  assert.equal(verifyMotionEpisode(r),false);
});
test('receipt integrity and full-tick ledger are fail closed on tampering',()=>{
  const r=runMotionEpisode({seed:1,policy:'blind',maxTicks:85});
  assert.equal(verifyMotionEpisode(r),true);
  r.frames[0].position.x=999;
  assert.equal(verifyMotionEpisode(r),false);
});
test('small paired batch verifies outcomes and rejects corruption',()=>{
  const batch=motionBatch({seeds:2,maxTicks:120});
  assert.equal(batch.runs.length,4);
  assert.equal(verifyMotionBatch(batch),true);
  for(const policy of ['blind','known-corridor']){
    const row=batch.scores[policy];
    assert.equal(row.total,row.arrived+row.collisions+row.geofence+row.timeouts);
  }
  batch.scores.blind.collisions+=1;
  assert.equal(verifyMotionBatch(batch),false);
  assert.throws(()=>motionBatch({seeds:13}),/rc04_invalid_seed_count/);
});