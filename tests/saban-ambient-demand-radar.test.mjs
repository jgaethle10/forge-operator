import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildAmbientDemandRadar,
  deriveZeroSpendCapacityNeeds,
} from '../systemia/saban/ambient-demand-radar.mjs';

test('demand radar summarizes exact backlog shape by workload',()=>{
  const jobs=[
    {
      state:'held',
      workload_class:'systemia.content-hash.v1',
      private_data:true,
      preemptible:true,
      checkpointable:true,
      resources:{cpu_units:0.2,memory_mb:128,storage_gb:0},
      requested_at:'2026-10-01T04:00:00.000Z',
    },
    {
      state:'queued',
      workload_class:'systemia.content-hash.v1',
      private_data:true,
      preemptible:true,
      checkpointable:true,
      resources:{cpu_units:0.4,memory_mb:256,storage_gb:0},
      requested_at:'2026-10-01T04:30:00.000Z',
    },
    {
      state:'retry_wait',
      workload_class:'systemia.telemetry-normalizer.v1',
      private_data:false,
      preemptible:true,
      checkpointable:true,
      resources:{cpu_units:0.1,memory_mb:64,storage_gb:0},
      requested_at:'2026-10-01T04:45:00.000Z',
    },
    {
      state:'completed',
      workload_class:'systemia.content-hash.v1',
      private_data:true,
      resources:{cpu_units:99,memory_mb:99999,storage_gb:99},
      requested_at:'2026-10-01T01:00:00.000Z',
    },
  ];
  const radar=buildAmbientDemandRadar({
    jobs,
    now:new Date('2026-10-01T05:00:00.000Z'),
  });
  assert.equal(radar.active_jobs,3);
  assert.equal(radar.workload_count,2);
  assert.equal(radar.commercial_capacity_authorized,false);

  const hash=radar.workloads.find(x=>x.workload_class==='systemia.content-hash.v1');
  assert.equal(hash.jobs,2);
  assert.equal(hash.held,1);
  assert.equal(hash.queued,1);
  assert.equal(hash.private_jobs,2);
  assert.equal(hash.total_cpu_units,0.6);
  assert.equal(hash.max_cpu_units,0.4);
  assert.equal(hash.total_memory_mb,384);
  assert.equal(hash.max_memory_mb,256);
  assert.equal(hash.oldest_age_ms,60*60*1000);

  const needs=deriveZeroSpendCapacityNeeds(radar);
  const hashNeed=needs.find(x=>x.workload_class==='systemia.content-hash.v1');
  assert.deepEqual(hashNeed.minimum_single_execution,{
    cpu_units:0.4,
    memory_mb:256,
    storage_gb:0,
  });
  assert.equal(hashNeed.authorized_only,true);
  assert.equal(hashNeed.checkpoint_friendly,true);
  assert.equal(hashNeed.commercial_capacity_authorized,false);
});

test('completed and dead-letter jobs do not inflate current capacity demand',()=>{
  const radar=buildAmbientDemandRadar({
    jobs:[
      {state:'completed',workload_class:'a',resources:{cpu_units:10}},
      {state:'dead_letter',workload_class:'b',resources:{cpu_units:10}},
    ],
    now:new Date(),
  });
  assert.equal(radar.active_jobs,0);
  assert.equal(radar.workload_count,0);
  assert.deepEqual(deriveZeroSpendCapacityNeeds(radar),[]);
});


test('ambient demand radar preserves accelerator requirements from queued work',()=>{
  const queue=new AmbientWorkQueue({root:fs.mkdtempSync(path.join(os.tmpdir(),'saban-gpu-demand-'))});
  try{
    queue.submit({
      workload_class:'systemia.content-hash.v1',
      payload:{value:'gpu-pressure-proof'},
      idempotency_key:'gpu-pressure-proof',
      resources:{
        cpu_units:1,
        memory_mb:1024,
        storage_gb:1,
        gpu_count:1,
        gpu_models:['proof-gpu'],
      },
      preemptible:true,
      checkpointable:true,
      requested_at:'2026-10-02T04:00:00.000Z',
    });
    const radar=buildAmbientDemandRadar({
      jobs:queue.list(),
      now:new Date('2026-10-02T04:01:00.000Z'),
    });
    const row=radar.workloads.find(x=>x.workload_class==='systemia.content-hash.v1');
    assert.ok(row);
    assert.equal(row.total_gpu_count,1);
    assert.equal(row.max_gpu_count,1);
    assert.deepEqual(row.gpu_models,['proof-gpu']);
    const need=deriveZeroSpendCapacityNeeds(radar)[0];
    assert.equal(need.minimum_single_execution.gpu_count,1);
    assert.deepEqual(need.minimum_single_execution.gpu_models,['proof-gpu']);
  }finally{
    fs.rmSync(queue.root,{recursive:true,force:true});
  }
});
