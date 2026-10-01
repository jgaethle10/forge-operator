import test from 'node:test';
import assert from 'node:assert/strict';
import { planHeterogeneousFabric } from '../systemia/saban/heterogeneous-fabric-planner.mjs';
import { createPerformanceLedger, recordPerformanceSample } from '../systemia/saban/performance-learning.mjs';

function offer({
  id,deviceClass,cpu,memory,storage,workloads,
  access='authorized_compute',attested=true,uptime=0.99,
  zeroCost=true,persistent=false,publicIngress=false,
  labels=[],locality=[],duty='always_on',power=5,
  failureDomain=id,maxConcurrency=8,observedAt='2026-10-01T03:00:00.000Z',
}){
  return {
    schema:'evercraft.saban.compute-offer.v1',
    offer_id:'ambient:'+id,
    provider_id:id,
    market:'ambient-fabric',
    access_class:access,
    endpoint:'evercraft://'+id,
    resources:{cpu_units:cpu,memory_mb:memory,storage_gb:storage,gpu_count:0,gpu_models:[]},
    placement:{public_ingress:publicIngress,persistent_storage:persistent},
    trust:{uptime_7d:uptime,audited:false,valid_version:true,attested},
    economics:{zero_cost:zeroCost,quoted:true,hourly_usd:0,total_usd:0,native_price:null},
    quote_required:false,
    metadata:{
      device_id:id,
      device_class:deviceClass,
      supported_workloads:workloads,
      placement_labels:labels,
      locality_tags:locality,
      duty_cycle:duty,
      power_budget_watts:power,
      failure_domain:failureDomain,
      max_concurrency:maxConcurrency,
      micro_node:['refrigerator','phone','router'].includes(deviceClass),
    },
    observed_at:observedAt,
  };
}

const fridge=offer({
  id:'fridge',deviceClass:'refrigerator',cpu:0.2,memory:256,storage:0.5,
  workloads:['systemia.content-hash.v1','systemia.sensor-relay.v1'],
  locality:['home'],duty:'opportunistic',power:2,maxConcurrency:1,failureDomain:'kitchen-power',
});
const phone=offer({
  id:'old-phone',deviceClass:'phone',cpu:0.5,memory:1024,storage:8,
  workloads:['systemia.content-hash.v1','systemia.chunk-transform.v1'],
  locality:['home'],duty:'opportunistic',power:4,maxConcurrency:2,failureDomain:'battery-1',
});
const router=offer({
  id:'router',deviceClass:'router',cpu:0.4,memory:512,storage:1,
  workloads:['systemia.health-probe.v1','systemia.queue-relay.v1'],
  locality:['home'],duty:'always_on',power:8,maxConcurrency:2,failureDomain:'network-edge',
});
const nas=offer({
  id:'nas',deviceClass:'nas',cpu:4,memory:8192,storage:4000,
  workloads:['systemia.aliev-source-runtime.v1','systemia.content-hash.v1'],
  persistent:true,labels:['storage'],locality:['home'],power:35,maxConcurrency:16,failureDomain:'storage-box',
});
const desktop=offer({
  id:'desktop',deviceClass:'desktop',cpu:12,memory:32768,storage:1000,
  workloads:['systemia.rivet-report-runtime.v1','systemia.content-hash.v1','systemia.chunk-transform.v1'],
  labels:['heavy-compute'],locality:['home'],power:120,maxConcurrency:12,failureDomain:'office-power',
});

test('micro work is peeled onto appliance-class nodes while stateful work stays on real storage',()=>{
  const plan=planHeterogeneousFabric({
    now:new Date('2026-10-01T03:01:00.000Z'),
    offers:[fridge,phone,router,nas,desktop],
    tasks:[
      {
        task_id:'hashes',
        workload_class:'systemia.content-hash.v1',
        execution_shape:'shardable',
        shard_count:2,
        resources:{cpu_units:0.1,memory_mb:128,storage_gb:0},
        preemptible:true,
        checkpointable:true,
        require_attestation:true,
      },
      {
        task_id:'aliev-store',
        workload_class:'systemia.aliev-source-runtime.v1',
        resources:{cpu_units:2,memory_mb:4096,storage_gb:100},
        required_labels:['storage'],
        require_always_on:true,
        minimum_uptime_7d:0.95,
      },
      {
        task_id:'rivet',
        workload_class:'systemia.rivet-report-runtime.v1',
        resources:{cpu_units:4,memory_mb:8192,storage_gb:20},
        required_labels:['heavy-compute'],
        require_always_on:true,
        minimum_uptime_7d:0.95,
      },
    ],
  });
  assert.equal(plan.state,'ready');
  assert.equal(plan.zero_cost_plan,true);
  assert.equal(plan.placements.find(x=>x.task_id==='aliev-store').provider_id,'nas');
  assert.equal(plan.placements.find(x=>x.task_id==='rivet').provider_id,'desktop');
  const hashProviders=plan.placements.filter(x=>x.task_id==='hashes').map(x=>x.provider_id);
  assert.ok(hashProviders.some(x=>['fridge','old-phone'].includes(x)));
});

test('private data never routes onto voluntary compute',()=>{
  const volunteer=offer({
    id:'volunteer',deviceClass:'desktop',cpu:8,memory:16384,storage:100,
    workloads:['systemia.private-transform.v1'],
    access:'voluntary_compute',attested:true,zeroCost:true,
  });
  const plan=planHeterogeneousFabric({
    now:new Date('2026-10-01T03:01:00.000Z'),
    offers:[volunteer],
    tasks:[{
      task_id:'private',
      workload_class:'systemia.private-transform.v1',
      resources:{cpu_units:1,memory_mb:512,storage_gb:1},
      private_data:true,
      allowed_access_classes:['authorized_compute','voluntary_compute'],
    }],
  });
  assert.equal(plan.state,'held');
  assert.ok(plan.held[0].candidate_rejections[0].reasons.includes('private_data_requires_authorized_compute'));
});

test('replicas are placed across distinct failure domains',()=>{
  const a=offer({
    id:'edge-a',deviceClass:'router',cpu:2,memory:2048,storage:4,
    workloads:['systemia.health-probe.v1'],
    failureDomain:'isp-a',duty:'always_on',maxConcurrency:4,
  });
  const b=offer({
    id:'edge-b',deviceClass:'router',cpu:2,memory:2048,storage:4,
    workloads:['systemia.health-probe.v1'],
    failureDomain:'isp-b',duty:'always_on',maxConcurrency:4,
  });
  const plan=planHeterogeneousFabric({
    now:new Date('2026-10-01T03:01:00.000Z'),
    offers:[a,b],
    tasks:[{
      task_id:'critical-health',
      workload_class:'systemia.health-probe.v1',
      replicas:2,
      resources:{cpu_units:0.1,memory_mb:64,storage_gb:0},
      require_always_on:true,
    }],
  });
  assert.equal(plan.state,'ready');
  const domains=new Set(plan.placements.map(x=>x.failure_domain));
  assert.equal(domains.size,2);
});

test('non-preemptible work is rejected from sleepy devices',()=>{
  const plan=planHeterogeneousFabric({
    now:new Date('2026-10-01T03:01:00.000Z'),
    offers:[fridge],
    tasks:[{
      task_id:'continuous',
      workload_class:'systemia.content-hash.v1',
      resources:{cpu_units:0.1,memory_mb:64,storage_gb:0},
      preemptible:false,
      checkpointable:false,
    }],
  });
  assert.equal(plan.state,'held');
  assert.ok(plan.held[0].candidate_rejections[0].reasons.includes('nonpreemptible_on_intermittent_device'));
});

test('stale devices disappear from placement instead of lingering forever',()=>{
  const stale=offer({
    id:'stale-phone',deviceClass:'phone',cpu:1,memory:2048,storage:16,
    workloads:['systemia.content-hash.v1'],
    observedAt:'2026-10-01T02:00:00.000Z',
  });
  const plan=planHeterogeneousFabric({
    now:new Date('2026-10-01T03:01:00.000Z'),
    offers:[stale],
    tasks:[{
      task_id:'fresh-only',
      workload_class:'systemia.content-hash.v1',
      resources:{cpu_units:0.1,memory_mb:64,storage_gb:0},
      max_observation_age_ms:300000,
      preemptible:true,
      checkpointable:true,
    }],
  });
  assert.equal(plan.state,'held');
  assert.ok(plan.held[0].candidate_rejections[0].reasons.includes('offer_stale'));
});


test('performance circuit ejects a repeatedly failing device and calibration-style successes restore eligibility',()=>{
  const bad=offer({
    id:'learned-phone',deviceClass:'phone',cpu:1,memory:2048,storage:8,
    workloads:['systemia.content-hash.v1'],
    duty:'always_on',
  });
  const ledger=createPerformanceLedger();
  for(let i=0;i<3;i++){
    recordPerformanceSample(ledger,{
      device_id:'learned-phone',
      workload_class:'systemia.content-hash.v1',
      ok:false,
      duration_ms:25,
      observed_at:`2026-10-01T03:0${i}:00.000Z`,
    });
  }
  const task={
    task_id:'learned-hash',
    workload_class:'systemia.content-hash.v1',
    resources:{cpu_units:0.1,memory_mb:64,storage_gb:0},
    preemptible:true,
    checkpointable:true,
    max_observation_age_ms:2*60*60*1000,
  };
  let plan=planHeterogeneousFabric({
    now:new Date('2026-10-01T03:03:00.000Z'),
    offers:[bad],
    tasks:[task],
    performanceLedger:ledger,
  });
  assert.equal(plan.state,'held');
  assert.ok(plan.held[0].candidate_rejections[0].reasons.includes('performance_circuit_open'));

  for(let i=0;i<6;i++){
    recordPerformanceSample(ledger,{
      device_id:'learned-phone',
      workload_class:'systemia.content-hash.v1',
      ok:true,
      duration_ms:15,
      observed_at:`2026-10-01T03:1${i}:00.000Z`,
    });
  }
  plan=planHeterogeneousFabric({
    now:new Date('2026-10-01T03:16:00.000Z'),
    offers:[bad],
    tasks:[task],
    performanceLedger:ledger,
  });
  assert.equal(plan.state,'ready');
  assert.equal(plan.placements[0].provider_id,'learned-phone');
  assert.equal(plan.placements[0].performance_adjustment.circuit_open,false);
});
