import test from 'node:test';
import assert from 'node:assert/strict';
import { planFabricRebalance } from '../systemia/saban/fabric-rebalance.mjs';

function plan(placements,eligible={}){
  return {
    schema:'evercraft.saban.heterogeneous-fabric-plan.v1',
    receipt_hash:'sha256:'+Math.random().toString(16).slice(2).padEnd(64,'0').slice(0,64),
    placements,
    held:[],
    eligible_offers_by_task:eligible,
  };
}
function placement({
  unit='task:s0:r0',task='task',offer='a',provider='a',score=1000,
  preemptible=true,checkpointable=true,
}={}){
  return {
    unit_id:unit,task_id:task,offer_id:offer,provider_id:provider,
    score,effective_score:score,preemptible,checkpointable,
  };
}

test('small optimization deltas do not flap a healthy placement',()=>{
  const before=plan([placement({offer:'a',score:1000})],{task:['a','b']});
  const after=plan([placement({offer:'b',score:1100})],{task:['a','b']});
  const result=planFabricRebalance({
    previousPlan:before,nextPlan:after,minimumMoveScoreDelta:300,
  });
  assert.equal(result.actions[0].action,'keep');
  assert.equal(result.actions[0].reason,'anti_flap_score_delta_below_threshold');
});

test('materially better capacity moves checkpointable preemptible work',()=>{
  const before=plan([placement({offer:'a',score:1000})],{task:['a','b']});
  const after=plan([placement({offer:'b',score:1500})],{task:['a','b']});
  const result=planFabricRebalance({
    previousPlan:before,
    nextPlan:after,
    checkpoints:{'task:s0:r0':{cursor:42}},
    minimumMoveScoreDelta:300,
  });
  assert.equal(result.actions[0].action,'move');
  assert.deepEqual(result.actions[0].checkpoint,{cursor:42});
  assert.equal(result.actions[0].checkpoint_required,true);
});

test('loss of current eligibility forces migration even to a lower-scoring replacement',()=>{
  const before=plan([placement({offer:'a',score:2000})],{task:['a']});
  const after=plan([placement({offer:'b',score:1200})],{task:['b']});
  const result=planFabricRebalance({
    previousPlan:before,nextPlan:after,minimumMoveScoreDelta:300,
  });
  assert.equal(result.actions[0].action,'move');
  assert.equal(result.actions[0].reason,'current_placement_failed_or_ineligible');
});

test('nonpreemptible healthy work never moves merely for optimization',()=>{
  const before=plan([placement({offer:'a',score:1000,preemptible:false,checkpointable:false})],{task:['a','b']});
  const after=plan([placement({offer:'b',score:5000,preemptible:false,checkpointable:false})],{task:['a','b']});
  const result=planFabricRebalance({previousPlan:before,nextPlan:after});
  assert.equal(result.actions[0].action,'keep');
  assert.equal(result.actions[0].reason,'nonpreemptible_work_stays_put');
});

test('disappearing capacity with no replacement becomes a held unit instead of invented execution',()=>{
  const before=plan([placement({offer:'a'})],{task:['a']});
  const after=plan([],{task:[]});
  after.held=[{task_id:'task',unit_id:'task:s0:r0',reason:'no_eligible_capacity'}];
  const result=planFabricRebalance({
    previousPlan:before,nextPlan:after,checkpoints:{'task:s0:r0':{cursor:9}},
  });
  assert.equal(result.state,'held_partial');
  assert.equal(result.actions[0].action,'hold');
  assert.deepEqual(result.actions[0].checkpoint,{cursor:9});
});
