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

test('planner fills unhealthy Chromebook edge gaps from commercial discovery without leasing',()=>{
  const plan=planProductionCapacity({
    radar,
    chromebook:{authorized:true,online:true,public_ingress_ready:false,node_identity_ready:false,outbound_compute_ready:false},
    broker:{ready:false,authorized_node_count:0},
  });
  assert.equal(plan.state,'fillable');
  assert.equal(plan.roles.find(x=>x.role==='public_ingress').preferred_source,'commercial_capacity');
  assert.equal(plan.roles.find(x=>x.role==='rivet_runtime').preferred_source,'commercial_capacity');
  assert.equal(plan.roles.find(x=>x.role==='aliev_source_store').preferred_source,'commercial_capacity');
  assert.equal(plan.policy.no_market_order_created,true);
  assert.equal(plan.policy.no_paid_lease_created,true);
});

test('planner prefers authorized Evercraft capacity when it is healthy',()=>{
  const plan=planProductionCapacity({
    radar,
    chromebook:{authorized:true,online:true,public_ingress_ready:true,node_identity_ready:true,outbound_compute_ready:true},
    broker:{ready:true,authorized_node_count:2},
  });
  assert.equal(plan.state,'ready');
  assert.equal(plan.roles.find(x=>x.role==='public_ingress').preferred_source,'chromebook_operator_edge');
  assert.equal(plan.roles.find(x=>x.role==='rivet_runtime').preferred_source,'evercraft_broker');
  assert.equal(plan.roles.find(x=>x.role==='aliev_source_store').preferred_source,'evercraft_broker');
});
