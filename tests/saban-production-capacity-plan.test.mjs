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
    {
      role:'public_ingress',
      demand:{
        demand_id:'evercraft-production-public-ingress',
        workload_class:'systemia.public-edge.v1',
        resources:{cpu_units:1,memory_mb:1024,storage_gb:10,gpu_count:0,gpu_models:[]},
        placement:{require_public_ingress:true,require_persistent_storage:false},
        trust:{minimum_uptime_7d:0.95,audited_only:false,valid_version_only:true},
      },
      eligible_offer_count:39,
      selected_candidate:candidate,
    },
    {
      role:'rivet_runtime',
      demand:{
        demand_id:'evercraft-production-rivet-runtime',
        workload_class:'systemia.rivet-report-runtime.v1',
        resources:{cpu_units:4,memory_mb:8192,storage_gb:50,gpu_count:0,gpu_models:[]},
        placement:{require_public_ingress:false,require_persistent_storage:true},
        trust:{minimum_uptime_7d:0.95,audited_only:false,valid_version_only:true},
      },
      eligible_offer_count:31,
      selected_candidate:candidate,
    },
    {
      role:'aliev_source_store',
      demand:{
        demand_id:'evercraft-production-aliev-source-store',
        workload_class:'systemia.aliev-source-runtime.v1',
        resources:{cpu_units:2,memory_mb:4096,storage_gb:100,gpu_count:0,gpu_models:[]},
        placement:{require_public_ingress:false,require_persistent_storage:true},
        trust:{minimum_uptime_7d:0.95,audited_only:false,valid_version_only:true},
      },
      eligible_offer_count:31,
      selected_candidate:candidate,
    },
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
  assert.equal(plan.buyer_handoff.directive_count,3);
  assert.equal(plan.buyer_handoff.executable_zero_spend_directive_count,3);
  assert.equal(plan.buyer_handoff.authority_material_present,false);
  assert.equal(plan.buyer_handoff.paid_market_order_authorized,false);
  assert.equal(plan.buyer_handoff.paid_lease_authorized,false);
  for(const directive of plan.buyer_handoff.directives){
    assert.equal(directive.zero_spend_phase.state,'ready_to_execute');
    assert.equal(
      directive.zero_spend_phase.formation_acquisition.zero_spend_only,
      true
    );
    assert.equal(
      directive.zero_spend_phase.formation_acquisition.markets.evercraft_broker.enabled_if_configured,
      true
    );
    assert.equal(
      directive.zero_spend_phase.formation_acquisition.markets.evercraft_voluntary.enabled_if_configured,
      true
    );
    assert.equal(
      directive.zero_spend_phase.formation_acquisition.markets.golem.enabled,
      false
    );
    assert.equal(
      directive.zero_spend_phase.formation_acquisition.markets.akash.enabled,
      false
    );
    assert.equal(
      directive.commercial_fallback.state,
      'disabled_by_zero_spend_policy'
    );
    assert.equal(directive.commercial_fallback.market_order_authorized,false);
    assert.equal(directive.commercial_fallback.paid_lease_authorized,false);
  }
  const ingress=plan.buyer_handoff.directives.find(
    (row)=>row.role==='public_ingress'
  );
  assert.equal(
    ingress.zero_spend_phase.formation_acquisition.require_public_ingress,
    true
  );
  assert.equal(
    ingress.zero_spend_phase.formation_acquisition.cpu_units,
    1
  );
  assert.equal(
    JSON.stringify(plan).includes('EVERCRAFT_VOLUNTARY_CONTROL_TOKEN'),
    true
  );
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
  assert.equal(plan.buyer_handoff.directive_count,0);
  assert.equal(plan.buyer_handoff.executable_zero_spend_directive_count,0);
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
  assert.equal(plan.buyer_handoff.directive_count,0);
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
  assert.equal(plan.buyer_handoff.directive_count,3);
  for(const directive of plan.buyer_handoff.directives){
    assert.equal(
      directive.commercial_fallback.state,
      'explicit_quote_and_spend_authority_required'
    );
    assert.equal(directive.commercial_fallback.commercial_capacity_allowed,true);
    assert.equal(directive.commercial_fallback.quote_authority_required,true);
    assert.equal(directive.commercial_fallback.spend_authority_required,true);
    assert.equal(directive.commercial_fallback.hard_cost_ceiling_required,true);
    assert.equal(directive.commercial_fallback.market_order_authorized,false);
    assert.equal(directive.commercial_fallback.paid_lease_authorized,false);
    assert.equal(
      directive.zero_spend_phase.formation_acquisition.zero_spend_only,
      true
    );
  }
});
