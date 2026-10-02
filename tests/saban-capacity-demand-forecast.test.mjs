import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appendDemandHistory,
  forecastCapacityDemand,
  prewarmActionsForAuthorizedCapacity,
} from '../systemia/saban/capacity-demand-forecast.mjs';

function radar(at,jobs,held=0){
  return {
    schema:'evercraft.saban.ambient-demand-radar.v1',
    active_jobs:jobs,
    queued_jobs:jobs-held,
    held_jobs:held,
    retry_wait_jobs:0,
    private_jobs:0,
    workload_count:1,
    workloads:[{
      workload_class:'systemia.content-hash.v1',
      jobs,
      queued:jobs-held,
      held,
      retry_wait:0,
      private_jobs:0,
      max_cpu_units:0.1,
      max_memory_mb:64,
      max_storage_gb:0,
      checkpointable_fraction:1,
      private_fraction:0,
      urgency_score:held*1000+jobs,
    }],
    commercial_capacity_considered:false,
    commercial_capacity_authorized:false,
    generated_at:at,
  };
}

test('rising held demand triggers forecast prewarm without granting authority',()=>{
  let history=null;
  const rows=[
    radar('2026-10-02T03:00:00.000Z',1,0),
    radar('2026-10-02T03:02:00.000Z',2,0),
    radar('2026-10-02T03:04:00.000Z',3,1),
    radar('2026-10-02T03:06:00.000Z',5,2),
  ];
  for(const row of rows) history=appendDemandHistory(history,row);
  const forecast=forecastCapacityDemand({
    demandHistory:history,
    currentRadar:rows.at(-1),
    horizonCycles:3,
  });
  const f=forecast.workload_forecasts[0];
  assert.equal(f.workload_class,'systemia.content-hash.v1');
  assert.ok(f.jobs_per_cycle_slope>0);
  assert.equal(f.prewarm_recommended,true);
  assert.equal(f.authority_expansion_allowed,false);
  assert.equal(forecast.policies.prewarm_existing_authorized_capacity_only,true);
  assert.equal(forecast.policies.commercial_spend_without_authority,false);
});

test('prewarm plan touches only already-authorized trust states',()=>{
  const forecast={
    schema:'evercraft.saban.capacity-demand-forecast.v1',
    prewarm_workloads:['systemia.content-hash.v1'],
    generated_at:'2026-10-02T03:06:00.000Z',
  };
  const registrySnapshot={
    schema:'evercraft.saban.ambient-device-registry-snapshot.v1',
    rows:[
      {device_id:'candidate',state:'candidate',manifest:{supported_workloads:['systemia.content-hash.v1']}},
      {device_id:'observed',state:'observed',manifest:{supported_workloads:['systemia.content-hash.v1']}},
      {device_id:'authorized',state:'authorized',manifest:{supported_workloads:['systemia.content-hash.v1']}},
      {device_id:'active',state:'active',manifest:{supported_workloads:['systemia.content-hash.v1']}},
      {device_id:'degraded',state:'degraded',manifest:{supported_workloads:['systemia.content-hash.v1']}},
      {device_id:'revoked',state:'revoked',manifest:{supported_workloads:['systemia.content-hash.v1']}},
    ],
  };
  const plan=prewarmActionsForAuthorizedCapacity({forecast,registrySnapshot});
  assert.deepEqual(
    plan.actions.map(x=>x.device_id).sort(),
    ['active','authorized','degraded']
  );
  assert.equal(plan.unauthorized_candidates_activated,0);
  assert.equal(plan.commercial_spend_usd,0);
  assert.ok(plan.actions.every(x=>x.authority_expansion===false));
});

test('bounded demand history deduplicates timestamps and remains finite',()=>{
  let history=null;
  for(let i=0;i<12;i++){
    const at='2026-10-02T03:'+String(i).padStart(2,'0')+':00.000Z';
    history=appendDemandHistory(history,radar(at,i%3),{maxSnapshots:6});
  }
  history=appendDemandHistory(history,radar('2026-10-02T03:11:00.000Z',9),{maxSnapshots:6});
  assert.equal(history.snapshot_count,6);
  assert.equal(new Set(history.snapshots.map(x=>x.observed_at)).size,6);
  assert.equal(history.max_snapshots,6);
});
