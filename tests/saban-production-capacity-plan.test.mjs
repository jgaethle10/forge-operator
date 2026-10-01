import test from 'node:test';
import assert from 'node:assert/strict';
import { planProductionCapacity } from '../systemia/saban/production-capacity-plan.mjs';

const candidate={
  provider_id:'provider-1',
  market:'akash',
  quote_required:true,
  placement:{public_ingress:true,persistent_storage:true},
};
const radar={
  schema:'evercraft.saban.production-capacity-radar.v1',
  roles:[
    {role:'public_ingress',eligible_offer_count:39,selected_candidate:candidate},
    {role:'rivet_runtime',eligible_offer_count:31,selected_candidate:candidate},
    {role:'aliev_source_store',eligible_offer_count:31,selected_candidate:candidate},
  ],
};

test('commercial supply is visibility-only by default',()=>{
  const plan=planProductionCapacity({
    radar,
    chromebook:{authorized:true,online:true,public_ingress_ready:false,node_identity_ready:false,outbound_compute_ready:false},
    broker:{ready:false,authorized_node_count:0},
  });
  assert.equal(plan.schema,'evercraft.saban.production-capacity-plan.v2');
  assert.equal(plan.state,'zero_spend_capacity_needed');
  assert.equal(plan.policy.zero_spend_default,true);
  assert.equal(plan.policy.commercial_capacity_allowed,false);
  for(const role of plan.roles){
    assert.equal(role.preferred_source,'authorized_capacity_required');
    assert.equal(role.acquisition_gate,'commercial_disabled_by_zero_spend_policy');
  }
});

test('authorized ambient devices satisfy roles before commercial capacity',()=>{
  const ambient={
    roles:{
      public_ingress:{eligible_count:1,selected_candidate:{provider_id:'owned-gateway'}},
      rivet_runtime:{eligible_count:1,selected_candidate:{provider_id:'owned-pc'}},
      aliev_source_store:{eligible_count:1,selected_candidate:{provider_id:'owned-nas'}},
    },
  };
  const plan=planProductionCapacity({
    radar,
    chromebook:{authorized:true,online:true,public_ingress_ready:false,node_identity_ready:false,outbound_compute_ready:false},
    broker:{ready:false,authorized_node_count:0},
    ambient,
  });
  assert.equal(plan.state,'ready_zero_spend');
  for(const role of plan.roles){
    assert.equal(role.preferred_source,'ambient_zero_cost_capacity');
    assert.equal(role.zero_cost,true);
  }
});

test('planner prefers healthy Evercraft capacity over ambient and commercial',()=>{
  const plan=planProductionCapacity({
    radar,
    chromebook:{authorized:true,online:true,public_ingress_ready:true,node_identity_ready:true,outbound_compute_ready:true},
    broker:{ready:true,authorized_node_count:2},
    ambient:{roles:{public_ingress:{eligible_count:5},rivet_runtime:{eligible_count:5},aliev_source_store:{eligible_count:5}}},
  });
  assert.equal(plan.state,'ready_zero_spend');
  assert.equal(plan.roles.find(x=>x.role==='public_ingress').preferred_source,'chromebook_operator_edge');
  assert.equal(plan.roles.find(x=>x.role==='rivet_runtime').preferred_source,'evercraft_broker');
  assert.equal(plan.roles.find(x=>x.role==='aliev_source_store').preferred_source,'evercraft_broker');
});

test('commercial placement requires an explicit opt-in',()=>{
  const plan=planProductionCapacity({
    radar,
    chromebook:{authorized:true,online:true,public_ingress_ready:false,node_identity_ready:false,outbound_compute_ready:false},
    broker:{ready:false,authorized_node_count:0},
    commercialCapacityAllowed:true,
  });
  assert.equal(plan.state,'commercial_fillable_with_explicit_authority');
  assert.equal(plan.policy.commercial_capacity_allowed,true);
  for(const role of plan.roles){
    assert.equal(role.acquisition_gate,'explicit_commercial_authority_required');
  }
});
