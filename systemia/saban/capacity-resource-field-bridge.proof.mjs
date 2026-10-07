import assert from 'node:assert/strict';
import { normalizeFabricTask } from './heterogeneous-fabric-planner.mjs';
import { buildResourceFieldExpansionIntents } from './capacity-resource-field-bridge.mjs';

const gpuTask=normalizeFabricTask({
  task_id:'gpu-report',
  workload_class:'systemia.gpu-report.v1',
  resources:{
    cpu_units:8,
    memory_mb:32768,
    storage_gb:50,
    gpu_count:1,
    gpu_models:['NVIDIA H100'],
  },
  required_labels:['heavy-compute'],
  require_attestation:true,
});

const blobTask=normalizeFabricTask({
  task_id:'durable-blob',
  workload_class:'systemia.blob-store.v1',
  resources:{
    cpu_units:0.2,
    memory_mb:256,
    storage_gb:100,
  },
  required_labels:['persistent-storage'],
  require_attestation:true,
});

const forecastTask=normalizeFabricTask({
  task_id:'forecast-worker',
  workload_class:'systemia.forecast-worker.v1',
  resources:{
    cpu_units:2,
    memory_mb:4096,
    storage_gb:5,
  },
  require_attestation:true,
});

const state={
  schema:'evercraft.saban.capacity-organism-state.v1',
  missing_capacity:[
    {
      class:'workload',
      task_id:'gpu-report',
      unit_id:'gpu-report:s0:r0',
      reason:'no_eligible_offer',
    },
    {
      class:'workload',
      task_id:'durable-blob',
      unit_id:'durable-blob:s0:r0',
      reason:'persistent_storage_missing',
    },
    {
      class:'capability',
      role_id:'public-network-ingress',
      reason:'missing_capability',
    },
  ],
  generated_at:'2026-10-05T16:00:00.000Z',
};

const queue=buildResourceFieldExpansionIntents({
  capacityState:state,
  tasks:[gpuTask,blobTask,forecastTask],
  demandForecast:{
    prewarm_workloads:[
      'systemia.gpu-report.v1',
      'systemia.forecast-worker.v1',
    ],
  },
});

assert.equal(queue.intent_count,3);
assert.equal(queue.current_pressure_intent_count,2);
assert.equal(queue.forecast_pressure_intent_count,1);

const gpu=queue.intents.find(row=>row.source_task_id==='gpu-report');
assert.equal(gpu.need.resources.cpu_units,8);
assert.equal(gpu.need.resources.memory_mb,32768);
assert.equal(gpu.need.resources.gpu_units,1);
assert.deepEqual(gpu.need.resources.gpu_models,['nvidia h100']);
assert.deepEqual(gpu.need.required_labels,['heavy-compute']);
assert.equal(gpu.need.max_hourly_usd,0);
assert.equal(gpu.policy.automatic_paid_lease_authorized,false);
assert.equal(gpu.policy.external_paid_execution_requires_explicit_authority,true);

const blob=queue.intents.find(row=>row.source_task_id==='durable-blob');
assert.equal(blob.need.memory_semantics,'object');
assert.equal(blob.need.resources.storage_gb,100);

const forecast=queue.intents.find(row=>row.source==='forecast_pressure');
assert.equal(forecast.need.workload_class,'systemia.forecast-worker.v1');
assert.equal(forecast.source_reason,'predicted_demand_prewarm');

assert.equal(
  queue.intents.filter(row=>row.need.workload_class==='systemia.gpu-report.v1').length,
  1
);
assert.equal(queue.policy.cross_device_ram_never_assumed_contiguous,true);
assert.equal(queue.policy.proactive_before_failure,true);

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.saban.resource-field-expansion-bridge-proof.v1',
  current_gaps_become_resource_field_intents:true,
  forecast_pressure_becomes_prewarm_intent:true,
  duplicate_forecast_for_current_pressure_suppressed:true,
  exact_gpu_requirements_preserved:true,
  object_memory_semantics_preserved:true,
  paid_capacity_not_auto_authorized:true,
},null,2));
