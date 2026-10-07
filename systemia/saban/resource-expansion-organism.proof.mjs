import assert from 'node:assert/strict';
import { evaluateResourceExpansionIntent, runResourceExpansionCycle } from './resource-expansion-organism.mjs';

const intent={
  schema:'evercraft.saban.resource-field-expansion-intent.v1',
  intent_id:'proof-current',
  source:'current_pressure',
  source_task_id:'proof-task',
  source_unit_id:'proof-task:s0:r0',
  source_reason:'no_capacity',
  need:{
    need_id:'organism:proof-task:s0:r0',
    workload_class:'systemia.proof-work.v1',
    topology:'single_node',
    memory_semantics:'local',
    resources:{
      cpu_units:2,
      memory_mb:2048,
      storage_gb:1,
      gpu_units:0,
      vram_mb:0,
      gpu_models:[],
    },
    min_per_node:{cpu_units:0,memory_mb:0,storage_gb:0,gpu_units:0,vram_mb:0},
    required_labels:[],
    forbidden_labels:[],
    required_transports:[],
    max_hourly_usd:0,
    max_ready_seconds:null,
    external_spend_requires_human_approval:true,
  },
  policy:{},
  next_lanes:[],
};

const ready=await evaluateResourceExpansionIntent({
  intent,
  discoveryProvider:async()=>({
    candidates:[{
      candidate_id:'ready-node',
      source_kind:'owned_node',
      authority:'owned',
      connected:true,
      attested:true,
      spawn_capable:false,
      resources:{
        cpu_units:4,
        memory_mb:4096,
        storage_gb:10,
        gpu_units:0,
        vram_mb:0,
        gpu_models:[],
      },
      workloads:['systemia.proof-work.v1'],
      labels:[],
      transports:[],
      ready_seconds:0,
      hourly_usd:0,
      acquisition_usd:0,
      failure_domain:'proof',
    }],
    rejected:[],
    runtime_authorities:new Map(),
    discovered_count:1,
    attested_authorized_count:1,
    resolution_receipt:'sha256:proof',
  }),
  localCandidateProvider:()=>null,
  marketFactory:async()=>({adapters:[],markets:[],diagnostics:[]}),
});
assert.equal(ready.state,'ready_internal');
assert.equal(ready.execution_ready,true);

let spawnCalls=0;
const spawned=await evaluateResourceExpansionIntent({
  intent,
  discoveryProvider:async()=>({
    candidates:[],
    rejected:[],
    runtime_authorities:new Map(),
    discovered_count:0,
    attested_authorized_count:0,
    resolution_receipt:null,
  }),
  localCandidateProvider:()=>({
    candidate_id:'owned-local',
    source_kind:'owned_bootstrap_target',
    authority:'owned',
    connected:false,
    attested:false,
    spawn_capable:true,
    resources:{
      cpu_units:8,
      memory_mb:8192,
      storage_gb:100,
      gpu_units:0,
      vram_mb:0,
      gpu_models:[],
    },
    workloads:[],
    labels:['owned'],
    transports:[],
    ready_seconds:1,
    hourly_usd:0,
    acquisition_usd:0,
    failure_domain:'local',
    bootstrap:{adapter:'local_owned_host',target:'proof'},
    metadata:{ownership_basis:'proof'},
  }),
  localSpawnAdapterFactory:()=>({
    async activate(){
      spawnCalls+=1;
      const row={
        execution_ready:true,
        capacity_endpoint:'http://127.0.0.1:4444',
      };
      Object.defineProperty(row,'runtime_authority',{
        value:Object.freeze({allocator_token:'secret'}),
        enumerable:false,
      });
      return row;
    },
  }),
  marketFactory:async()=>({adapters:[],markets:[],diagnostics:[]}),
});
assert.equal(spawned.state,'owned_spawn_activated');
assert.equal(spawnCalls,1);
assert.equal(spawned.managed_capacity.schema,'evercraft.saban.managed-capacity.v1');
assert.equal(spawned.managed_capacity.offer_id,'nodeseed:owned-local');
assert.equal(spawned.managed_capacity.kind,'owned_spawn');
assert.equal(spawned.managed_capacity.lifecycle_reclaimable,true);
assert.equal(
  spawned.managed_capacity.authority_basis,
  'explicit_evercraft_owned_host_configuration'
);
assert.equal(JSON.stringify(spawned).includes('secret'),false);

const zeroMarket={
  market:'zero-proof',
  async discover(){
    return {
      offers:[{
        schema:'evercraft.saban.compute-offer.v1',
        offer_id:'zero:1',
        provider_id:'zero-provider',
        market:'zero-proof',
        access_class:'voluntary_compute',
        resources:{cpu_units:4,memory_mb:4096,storage_gb:10,gpu_count:0,gpu_models:[]},
        placement:{public_ingress:false,persistent_storage:false},
        trust:{uptime_7d:1,audited:false,valid_version:true,attested:true},
        economics:{zero_cost:true,quoted:true,hourly_usd:0,total_usd:0,native_price:null},
        quote_required:false,
        metadata:{supported_workloads:['systemia.proof-work.v1'],placement_labels:[]},
        observed_at:new Date().toISOString(),
      }],
    };
  },
};
const zeroVisible=await evaluateResourceExpansionIntent({
  intent,
  discoveryProvider:async()=>({
    candidates:[],rejected:[],runtime_authorities:new Map(),
    discovered_count:0,attested_authorized_count:0,resolution_receipt:null,
  }),
  localCandidateProvider:()=>null,
  marketFactory:async()=>({adapters:[zeroMarket],markets:['zero-proof'],diagnostics:[]}),
});
assert.equal(zeroVisible.state,'zero_cost_market_visible');
assert.equal(zeroVisible.market_order_created,false);
assert.equal(zeroVisible.paid_lease_created,false);

const paidMarket={
  market:'paid-proof',
  async discover(){
    return {
      offers:[{
        schema:'evercraft.saban.compute-offer.v1',
        offer_id:'paid:1',
        provider_id:'paid-provider',
        market:'paid-proof',
        access_class:'approved_provider',
        resources:{cpu_units:4,memory_mb:4096,storage_gb:10,gpu_count:0,gpu_models:[]},
        placement:{public_ingress:false,persistent_storage:false},
        trust:{uptime_7d:1,audited:true,valid_version:true,attested:true},
        economics:{zero_cost:false,quoted:true,hourly_usd:0.2,total_usd:0.2,native_price:null},
        quote_required:false,
        metadata:{supported_workloads:['systemia.proof-work.v1'],placement_labels:[]},
        observed_at:new Date().toISOString(),
      }],
    };
  },
};
const paidVisible=await evaluateResourceExpansionIntent({
  intent,
  discoveryProvider:async()=>({
    candidates:[],rejected:[],runtime_authorities:new Map(),
    discovered_count:0,attested_authorized_count:0,resolution_receipt:null,
  }),
  localCandidateProvider:()=>null,
  marketFactory:async()=>({adapters:[paidMarket],markets:['paid-proof'],diagnostics:[]}),
});
assert.equal(paidVisible.state,'paid_capacity_visible_authority_required');
assert.equal(paidVisible.paid_execution_authorized,false);
assert.equal(paidVisible.market_order_created,false);
assert.equal(paidVisible.paid_lease_created,false);

const cycle=await runResourceExpansionCycle({
  queue:{
    schema:'evercraft.saban.resource-field-expansion-queue.v1',
    intents:[
      {...intent,intent_id:'forecast',source:'forecast_pressure'},
      intent,
    ],
  },
  discoveryProvider:async()=>({
    candidates:[{
      candidate_id:'ready-node',
      source_kind:'owned_node',
      authority:'owned',
      connected:true,
      attested:true,
      resources:{
        cpu_units:4,memory_mb:4096,storage_gb:10,
        gpu_units:0,vram_mb:0,gpu_models:[],
      },
      workloads:['systemia.proof-work.v1'],
      labels:[],transports:[],ready_seconds:0,hourly_usd:0,acquisition_usd:0,
    }],
    rejected:[],runtime_authorities:new Map(),
    discovered_count:1,attested_authorized_count:1,resolution_receipt:'sha256:proof',
  }),
  localCandidateProvider:()=>null,
  marketFactory:async()=>({adapters:[],markets:[],diagnostics:[]}),
});
assert.equal(cycle.considered,2);
assert.equal(cycle.ready_internal,2);
assert.equal(cycle.evaluations[0].intent_id,'proof-current');
assert.equal(cycle.paid_execution_authorized,false);

const idleManaged=await runResourceExpansionCycle({
  queue:{
    schema:'evercraft.saban.resource-field-expansion-queue.v1',
    intents:[],
  },
  previousManagedCapacity:[spawned.managed_capacity],
  now:new Date('2026-10-07T16:05:00.000Z'),
});
assert.equal(idleManaged.managed_capacity_count,1);
assert.equal(idleManaged.managed_capacity[0].state,'idle');
assert.equal(
  idleManaged.managed_capacity[0].authority_basis,
  'explicit_evercraft_owned_host_configuration'
);
assert.equal(JSON.stringify(idleManaged).includes('secret'),false);

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.saban.resource-expansion-organism-proof.v1',
  ready_internal_detected:true,
  owned_host_auto_spawn_supported:true,
  zero_cost_market_discovery_supported:true,
  paid_market_visibility_held_for_authority:true,
  current_pressure_prioritized:true,
  spawned_capacity_management_receipt:true,
  managed_capacity_survives_idle_cycle:true,
  authority_material_not_serialized:true,
},null,2));
