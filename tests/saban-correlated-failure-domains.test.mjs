import test from 'node:test';
import assert from 'node:assert/strict';
import { planHeterogeneousFabric } from '../systemia/saban/heterogeneous-fabric-planner.mjs';

function offer(id,domains){
  return {
    schema:'evercraft.saban.compute-offer.v1',
    offer_id:'ambient:'+id,
    provider_id:id,
    market:'ambient-fabric',
    access_class:'authorized_compute',
    endpoint:'evercraft://'+id,
    resources:{cpu_units:2,memory_mb:2048,storage_gb:10},
    placement:{public_ingress:false,persistent_storage:false},
    trust:{uptime_7d:0.99,audited:false,valid_version:true,attested:true},
    economics:{zero_cost:true,quoted:true,hourly_usd:0,total_usd:0,native_price:null},
    quote_required:false,
    metadata:{
      device_class:'sbc',
      supported_workloads:['systemia.health-probe.v1'],
      placement_labels:[],
      duty_cycle:'always_on',
      max_concurrency:2,
      failure_domains:domains,
    },
    observed_at:'2026-10-01T04:00:00.000Z',
  };
}

test('replicas separate across every required correlated failure axis',()=>{
  const plan=planHeterogeneousFabric({
    now:new Date('2026-10-01T04:01:00.000Z'),
    offers:[
      offer('node-a',{power:'circuit-1',network:'ap-1',site:'home'}),
      offer('node-b',{power:'circuit-2',network:'ap-1',site:'home'}),
      offer('node-c',{power:'circuit-3',network:'ap-2',site:'garage'}),
    ],
    tasks:[{
      task_id:'health',
      workload_class:'systemia.health-probe.v1',
      replicas:2,
      failure_domain_axes:['power','network'],
      resources:{cpu_units:0.1,memory_mb:64,storage_gb:0},
      require_always_on:true,
    }],
  });
  assert.equal(plan.state,'ready');
  assert.equal(plan.placements.length,2);
  const powers=new Set(plan.placements.map(x=>x.failure_domains.power));
  const networks=new Set(plan.placements.map(x=>x.failure_domains.network));
  assert.equal(powers.size,2);
  assert.equal(networks.size,2);
  assert.deepEqual(plan.placements[0].separated_failure_domain_axes,['power','network']);
  assert.equal(plan.correlated_failure_domain_axes,true);
});

test('different machines on the same required network domain do not count as redundant',()=>{
  const plan=planHeterogeneousFabric({
    now:new Date('2026-10-01T04:01:00.000Z'),
    offers:[
      offer('node-a',{power:'circuit-1',network:'ap-1'}),
      offer('node-b',{power:'circuit-2',network:'ap-1'}),
    ],
    tasks:[{
      task_id:'health',
      workload_class:'systemia.health-probe.v1',
      replicas:2,
      failure_domain_axes:['power','network'],
      resources:{cpu_units:0.1,memory_mb:64,storage_gb:0},
      require_always_on:true,
    }],
  });
  assert.equal(plan.state,'held');
  assert.equal(plan.placements.length,1);
  assert.equal(plan.held.length,1);
});

test('unknown required failure domain is held instead of treated as independent',()=>{
  const plan=planHeterogeneousFabric({
    now:new Date('2026-10-01T04:01:00.000Z'),
    offers:[
      offer('node-a',{power:'circuit-1'}),
      offer('node-b',{power:'circuit-2'}),
    ],
    tasks:[{
      task_id:'health',
      workload_class:'systemia.health-probe.v1',
      replicas:2,
      failure_domain_axes:['power','network'],
      resources:{cpu_units:0.1,memory_mb:64,storage_gb:0},
      require_always_on:true,
    }],
  });
  assert.equal(plan.state,'held');
  assert.equal(plan.placements.length,0);
  const reasons=plan.held[0].candidate_rejections.flatMap(x=>x.reasons);
  assert.ok(reasons.includes('failure_domain_axis_missing:network'));
});
