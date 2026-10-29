import test from 'node:test';
import assert from 'node:assert/strict';
import {challengeWorld,challengeEpisode,challengeBenchmark,verifyEpisode,verifyBenchmark,
  scanObstacles,hardwareActuation} from './rover-challenge.mjs';
import {projectEpisodeToWorldEngine,verifyWorldEngineHandoff} from './world-engine-handoff.mjs';

test('same seed and policy produce identical digest and recorded frames',()=>{
  const a=challengeEpisode({seed:12,policy:'safety-first'});
  const b=challengeEpisode({seed:12,policy:'safety-first'});
  assert.deepEqual(a,b);assert.equal(verifyEpisode(a),true);
});
test('different seed changes scenario parameters',()=>{
  assert.notDeepEqual(challengeWorld(1).params,challengeWorld(2).params);
});
test('unknown/moving obstacles are present without supplying a map to controller',()=>{
  const w=challengeWorld(3);
  assert.equal(w.obstacles.length,4);
  assert.equal(w.obstacles.filter(o=>o.moving).length,1);
  const near=scanObstacles({x:2,y:0,heading:0},w.obstacles,()=>.5,0);
  assert.ok(near.length>=1);
  assert.equal('id' in near[0],false);
});
test('missing sensor data causes fail-stop request rather than false clear',()=>{
  const e=challengeEpisode({seed:2,policy:'safety-first',maxSteps:25,forcedBlackout:{start:0,length:25}});
  assert.equal(e.outcome.holdRequests,25);
  assert.equal(e.outcome.sensorMissTicks,25);
  assert.ok(e.frames.every(f=>f.command==='sensor_stale_hold'&&f.commandedSpeed===0));
});
test('stop requests do not imply immediate stopping under command latency',()=>{
  const e=challengeEpisode({seed:1,policy:'safety-first'});
  assert.ok(e.world.params.commandDelaySteps>=1);
  assert.ok(e.world.params.braking>0);
  assert.equal(e.provenance.realSensorData,false);
});
test('benchmark retains failure modes without turning missing into success',()=>{
  const b=challengeBenchmark({seeds:40});
  assert.equal(b.runs.length,80);
  assert.equal(verifyBenchmark(b),true);
  for(const p of ['blind','safety-first']){
    const x=b.scores[p];
    assert.equal(x.total,x.arrived+x.collisions+x.geofence+x.timeouts);
  }
});
test('tampered episode or benchmark fails integrity check',()=>{
  const ep=challengeEpisode({seed:3});
  ep.outcome.status=ep.outcome.status==='arrived'?'collision':'arrived';assert.equal(verifyEpisode(ep),false);
  const b=challengeBenchmark({seeds:2});
  b.runs[0].outcome.success=true;assert.equal(verifyBenchmark(b),false);
});
test('invalid policy, step count, seed count, and blackout reject',()=>{
  assert.throws(()=>challengeEpisode({policy:'unsafe'}),/invalid_policy/);
  assert.throws(()=>challengeEpisode({maxSteps:Infinity}),/invalid_max_steps/);
  assert.throws(()=>challengeBenchmark({seeds:301}),/invalid_seed_count/);
  assert.throws(()=>challengeEpisode({forcedBlackout:{start:-1,length:2}}),/invalid_blackout/);
});
test('hardware actuation always rejects',()=>{
  assert.throws(()=>hardwareActuation({speed:1}),/hardware_actuation_not_implemented/);
});
test('handoff is canonical-shaped World Engine playback data, not native execution',()=>{
  const ep=challengeEpisode({seed:2});
  const projection=projectEpisodeToWorldEngine(ep);
  assert.equal(projection.world.schema,'evercraft.world-engine.world.v1');
  assert.equal(projection.world.tickRateHz,10);
  assert.equal(projection.projectionOnly,true);
  assert.equal(projection.nativeEngineExecuted,false);
  assert.equal(projection.world.entities.find(e=>e.id==='rover').transform.position.z,0);
  assert.ok(projection.inputs.length>=2);
  assert.ok(projection.inputs.every(i=>i.kind==='teleport'&&i.value.y===0));
  assert.equal(verifyWorldEngineHandoff(projection),true);
});
test('projection requires intact sampled episode and receipt changes detected',()=>{
  const ep=challengeEpisode({seed:3,recordFrames:false});
  assert.throws(()=>projectEpisodeToWorldEngine(ep),/frames_required/);
  const good=challengeEpisode({seed:3});
  const projection=projectEpisodeToWorldEngine(good);
  projection.inputs[0].value.x=1000;
  assert.equal(verifyWorldEngineHandoff(projection),false);
  good.frames[0].x=123;
  assert.throws(()=>projectEpisodeToWorldEngine(good),/invalid_episode_or_digest/);
});