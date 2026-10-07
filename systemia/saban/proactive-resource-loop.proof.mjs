import assert from 'node:assert/strict';
import { normalizeFabricTask } from './heterogeneous-fabric-planner.mjs';
import { buildResourceFieldExpansionIntents } from './capacity-resource-field-bridge.mjs';
import { runResourceExpansionCycle } from './resource-expansion-organism.mjs';

const task=normalizeFabricTask({
  task_id:'proactive-heavy-job',
  workload_class:'systemia.proactive-heavy-job.v1',
  resources:{
    cpu_units:8,
    memory_mb:16384,
    storage_gb:40,
    gpu_count:1,
    gpu_models:['NVIDIA RTX 4090'],
  },
  required_labels:['heavy-compute'],
  require_attestation:true,
});

const capacityState={
  schema:'evercraft.saban.capacity-organism-state.v1',
  missing_capacity:[{
    class:'workload',
    task_id:'proactive-heavy-job',
    unit_id:'proactive-heavy-job:s0:r0',
    reason:'no_eligible_offer',
  }],
  generated_at:'2026-10-06T18:00:00.000Z',
};

const queue=buildResourceFieldExpansionIntents({
  capacityState,
  tasks:[task],
  demandForecast:{prewarm_workloads:[]},
});

assert.equal(queue.intent_count,1);
assert.equal(queue.current_pressure_intent_count,1);
assert.equal(queue.intents[0].need.resources.gpu_units,1);
assert.deepEqual(queue.intents[0].need.resources.gpu_models,['nvidia rtx 4090']);
assert.equal(queue.intents[0].need.max_hourly_usd,0);

let spawned=0;
const cycle=await runResourceExpansionCycle({
  queue,
  acquisition:{
    allow_local_host_bootstrap:true,
  },
  poolOptions:{},
  discoveryProvider:async()=>({
    schema:'evercraft.saban.resource-discovery.v1',
    candidates:[],
    rejected:[],
    runtime_authorities:new Map(),
    discovered_count:0,
    yard_eligible_count:0,
    attested_authorized_count:0,
    resolution_receipt:null,
  }),
  localCandidateProvider:()=>({
    candidate_id:'owned-proactive-gpu',
    source_kind:'owned_bootstrap_target',
    authority:'owned',
    connected:false,
    attested:false,
    spawn_capable:true,
    resources:{
      cpu_units:16,
      memory_mb:32768,
      storage_gb:200,
      gpu_units:1,
      vram_mb:24576,
      gpu_models:['nvidia rtx 4090'],
    },
    workloads:[],
    labels:['owned','heavy-compute','gpu'],
    transports:[],
    ready_seconds:1,
    hourly_usd:0,
    acquisition_usd:0,
    failure_domain:'owned-proactive-host',
    bootstrap:{adapter:'local_owned_host',target:'proof'},
    metadata:{ownership_basis:'proof'},
  }),
  localSpawnAdapterFactory:()=>({
    async activate({need,candidate}){
      spawned+=1;
      assert.equal(need.workload_class,'systemia.proactive-heavy-job.v1');
      assert.equal(candidate.authority,'owned');
      const activated={
        execution_ready:true,
        capacity_endpoint:'http://127.0.0.1:9999',
        receipt:'sha256:proactive-owned-spawn',
      };
      Object.defineProperty(activated,'runtime_authority',{
        value:Object.freeze({allocator_token:'proactive-secret'}),
        enumerable:false,
      });
      return activated;
    },
  }),
  marketFactory:async()=>({
    adapters:[{
      market:'paid-proof',
      async discover(){
        return {
          offers:[{
            schema:'evercraft.saban.compute-offer.v1',
            offer_id:'paid:proof',
            provider_id:'paid-provider',
            market:'paid-proof',
            access_class:'approved_provider',
            resources:{
              cpu_units:64,
              memory_mb:131072,
              storage_gb:1000,
              gpu_count:4,
              gpu_models:['nvidia rtx 4090'],
            },
            placement:{public_ingress:false,persistent_storage:true},
            trust:{uptime_7d:1,audited:true,valid_version:true,attested:true},
            economics:{
              zero_cost:false,
              quoted:true,
              hourly_usd:9.99,
              total_usd:9.99,
              native_price:null,
            },
            quote_required:false,
            metadata:{
              supported_workloads:['systemia.proactive-heavy-job.v1'],
              placement_labels:['heavy-compute'],
            },
            observed_at:'2026-10-06T18:00:00.000Z',
          }],
        };
      },
    }],
    markets:['paid-proof'],
    diagnostics:[],
  }),
});

assert.equal(spawned,1);
assert.equal(cycle.considered,1);
assert.equal(cycle.owned_spawn_activated,1);
assert.equal(cycle.paid_capacity_visible_authority_required,0);
assert.equal(cycle.engineering_required,0);
assert.equal(cycle.paid_execution_authorized,false);
assert.equal(cycle.market_order_created,false);
assert.equal(cycle.paid_lease_created,false);
assert.equal(JSON.stringify(cycle).includes('proactive-secret'),false);

const evalRow=cycle.evaluations[0];
assert.equal(evalRow.state,'owned_spawn_activated');
assert.equal(evalRow.execution_ready,true);
assert.deepEqual(evalRow.selected_candidates,['owned-proactive-gpu']);

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.saban.proactive-resource-loop-proof.v1',
  capacity_pressure_created_resource_intent:true,
  exact_gpu_requirement_preserved:true,
  owned_capacity_spawned_before_paid_market:true,
  surprise_paid_lease_prevented:true,
  authority_secret_not_serialized:true,
  proactive_loop_execution_ready:true,
},null,2));
