import test from 'node:test';
import assert from 'node:assert/strict';
import {simulate,benchmark,safetyGate,hardwareCommand,SCENE,makeRng} from './rover-lab.mjs';

test('runs and receipts reproducible from same seed/policy',()=>{
  assert.deepEqual(simulate({seed:19,policy:'guarded'}),simulate({seed:19,policy:'guarded'}));
  assert.notEqual(simulate({seed:19,policy:'guarded'}).sha256,simulate({seed:20,policy:'guarded'}).sha256);
});
test('safety gate rejects malformed commands or estimates',()=>{
  assert.equal(safetyGate({v:Infinity,yaw:0},{x:0,y:0,heading:0}).blocked,true);
  assert.equal(safetyGate({v:.5,yaw:0},{x:NaN,y:0,heading:0}).blocked,true);
});
test('safety gate halts positive motion aimed at nearby obstacle',()=>{
  const result=safetyGate({v:1,yaw:0},{x:SCENE.obstacle.x-SCENE.obstacle.radius-SCENE.robotRadius-.1,y:0,heading:0});
  assert.equal(result.reason,'obstacle_proximity');assert.equal(result.v,0);
});
test('hardware commands are prohibited',()=>assert.throws(()=>hardwareCommand(),/hardware_actuation_not_implemented/));
test('benchmark uses matched randomized conditions across policies',()=>{
  const r=benchmark({seeds:8});
  assert.equal(r.runs.length,16);
  for(let i=0;i<8;i++){
    assert.deepEqual(r.runs[i*2].parameters,r.runs[i*2+1].parameters);
    assert.equal(r.runs[i*2].seed,r.runs[i*2+1].seed);
  }
});
test('randomization samples change environment across different seeds',()=>{
  assert.notDeepEqual(simulate({seed:1}).parameters,simulate({seed:2}).parameters);
});
test('guarded controller beats collision-bound baseline in demonstration cohort',()=>{
  const r=benchmark({seeds:40});
  assert.ok(r.scores.guarded.arrived>r.scores.baseline.arrived);
  assert.ok(r.scores.guarded.successRate>=0.65);
  assert.equal(r.scores.guarded.collisions,0);
});
test('invalid policies and benchmark size fail closed',()=>{
  assert.throws(()=>simulate({policy:'magic'}),/invalid_policy/);
  assert.throws(()=>benchmark({seeds:100000}),/invalid_seed_count/);
  assert.throws(()=>makeRng(-1),/invalid_seed/);
});