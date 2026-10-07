import assert from 'node:assert/strict';
import { executeFailureDomainRebalance } from './failure-domain-move-executor.mjs';

const plan={
  schema:'evercraft.saban.failure-domain-rebalance-plan.v1',
  actions:[
    {
      task_id:'moveable',
      unit_id:'moveable:r1',
      action:'move_replica_to_independent_domain',
      from_offer_id:'a',
      to_offer_id:'b',
      checkpoint_required:true,
      checkpoint_present:true,
      checkpoint:{checkpoint_id:'cp-1'},
    },
    {
      task_id:'drain',
      unit_id:'drain:r1',
      action:'drain_then_rebalance',
      from_offer_id:'c',
      to_offer_id:'b',
    },
    {
      task_id:'unknown',
      action:'collect_failure_domain_evidence',
      missing_axes:['site_id'],
    },
    {
      task_id:'expand',
      action:'expand_resource_field_for_distinct_failure_domain',
      colliding_axes:['network_id'],
    },
  ],
  receipt_hash:'sha256:plan-proof',
};

let moveCalls=0;
let drainCalls=0;
const bindings={
  'moveable:r1':{
    async move({checkpoint}){
      moveCalls+=1;
      assert.equal(checkpoint.checkpoint_id,'cp-1');
      return {receipt:'sha256:move'};
    },
  },
  'drain:r1':{
    async drain(){
      drainCalls+=1;
      return {receipt_hash:'sha256:drain'};
    },
  },
};

const noAuthority=await executeFailureDomainRebalance({
  plan,
  bindings,
  now:'2026-10-07T17:00:00.000Z',
});
assert.equal(noAuthority.completed_count,0);
assert.equal(moveCalls,0);
assert.equal(drainCalls,0);
assert.equal(noAuthority.advisory_count,2);

const authority={
  schema:'evercraft.saban.failure-domain-move-authority.v1',
  authority_id:'fd-authority-proof',
  approved:true,
  allowed_actions:[
    'move_replica_to_independent_domain',
    'drain_then_rebalance',
  ],
  allowed_unit_ids:['moveable:r1','drain:r1'],
  expires_at:'2026-10-08T17:00:00.000Z',
};

const run=await executeFailureDomainRebalance({
  plan,
  authority,
  bindings,
  now:'2026-10-07T17:00:00.000Z',
});
assert.equal(run.completed_count,2);
assert.equal(run.advisory_count,2);
assert.equal(run.reconciliation_required,false);
assert.equal(moveCalls,1);
assert.equal(drainCalls,1);

const duplicate=await executeFailureDomainRebalance({
  plan,
  authority,
  bindings,
  completedActionIds:run.completed_action_ids,
  now:'2026-10-07T17:01:00.000Z',
});
assert.equal(duplicate.completed_count,0);
assert.equal(duplicate.already_completed_count,2);
assert.equal(moveCalls,1);
assert.equal(drainCalls,1);

const missingCheckpoint=await executeFailureDomainRebalance({
  plan:{
    ...plan,
    actions:[{
      task_id:'missing',
      unit_id:'missing:r1',
      action:'move_replica_to_independent_domain',
      from_offer_id:'a',
      to_offer_id:'b',
      checkpoint_required:true,
      checkpoint_present:false,
    }],
  },
  authority:{...authority,allowed_unit_ids:['missing:r1']},
  bindings:{
    'missing:r1':{
      async move(){throw new Error('must_not_run');},
    },
  },
  now:'2026-10-07T17:02:00.000Z',
});
assert.equal(missingCheckpoint.completed_count,0);
assert.equal(missingCheckpoint.results[0].reason,'required_checkpoint_missing');

let uncertainCalls=0;
const uncertain=await executeFailureDomainRebalance({
  plan:{
    ...plan,
    actions:[
      {
        task_id:'uncertain',
        unit_id:'uncertain:r1',
        action:'move_replica_to_independent_domain',
        from_offer_id:'a',
        to_offer_id:'b',
        checkpoint_required:false,
      },
      {
        task_id:'after',
        unit_id:'after:r1',
        action:'drain_then_rebalance',
        from_offer_id:'c',
        to_offer_id:'b',
      },
    ],
  },
  authority:{
    ...authority,
    allowed_unit_ids:['uncertain:r1','after:r1'],
  },
  bindings:{
    'uncertain:r1':{
      async move(){
        uncertainCalls+=1;
        throw new Error('transport_dropped_after_move_request');
      },
    },
    'after:r1':{
      async drain(){
        uncertainCalls+=1;
        return {receipt:'sha256:should-not-run'};
      },
    },
  },
  now:'2026-10-07T17:03:00.000Z',
});
assert.equal(uncertain.reconciliation_required,true);
assert.equal(uncertain.uncertain_count,1);
assert.equal(uncertainCalls,1);

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.saban.failure-domain-move-executor-proof.v1',
  scoped_authority_required:true,
  checkpoint_required_before_preemptible_move:true,
  fabric_specific_move_boundary:true,
  drain_boundary_preserved:true,
  advisory_actions_never_execute:true,
  completed_moves_idempotent:true,
  uncertain_move_stops_batch:true,
  arbitrary_code_execution:false,
},null,2));
