import test from 'node:test';
import assert from 'node:assert/strict';

import {buildForecastHeadroomReservations} from '../systemia/saban/capacity-headroom.mjs';

function offer(id,{micro=false,cpu=1,memory=2048}={}){
  return {
    schema:'evercraft.saban.compute-offer.v1',
    offer_id:id,
    provider_id:id,
    market:micro?'ambient-fabric':'evercraft-nodeseed',
    access_class:'authorized_compute',
    resources:{cpu_units:cpu,memory_mb:memory,storage_gb:32},
    trust:{attested:true},
    economics:{zero_cost:true},
    metadata:{
      supported_workloads:['systemia.content-hash.v1'],
      micro_node:micro,
    },
  };
}
const task={
  schema:'evercraft.saban.fabric-task.v1',
  task_id:'queued-systemia.content-hash.v1',
  workload_class:'systemia.content-hash.v1',
  resources_per_execution:{cpu_units:0.1,memory_mb:64,storage_gb:0},
};

test('clean rising forecast reserves one right-sized zero-cost authorized slot',()=>{
  const plan=buildForecastHeadroomReservations({
    forecast:{
      schema:'evercraft.saban.capacity-demand-forecast.v1',
      generated_at:'2026-10-02T04:00:00.000Z',
      workload_forecasts:[{
        workload_class:'systemia.content-hash.v1',
        current_jobs:1,
        current_held:0,
        current_retry_wait:0,
        projected_jobs:3,
        confidence:0.75,
        prewarm_recommended:true,
      }],
    },
    tasks:[task],
    offers:[
      offer('heavy',{cpu:8,memory:16384}),
      offer('micro',{micro:true,cpu:1,memory:2048}),
    ],
  });
  assert.equal(plan.reservation_count,1);
  assert.equal(plan.reservations[0].offer_id,'micro');
  assert.equal(plan.reservations[0].workload_class,'systemia.content-hash.v1');
  assert.equal(plan.current_pressure_always_wins,true);
  assert.equal(plan.authority_expansion,false);
  assert.equal(plan.commercial_spend_usd,0);
});

test('current held or retrying work cancels forecast reservation',()=>{
  for(const pressure of [
    {current_held:1,current_retry_wait:0},
    {current_held:0,current_retry_wait:1},
  ]){
    const plan=buildForecastHeadroomReservations({
      forecast:{
        schema:'evercraft.saban.capacity-demand-forecast.v1',
        generated_at:'2026-10-02T04:00:00.000Z',
        workload_forecasts:[{
          workload_class:'systemia.content-hash.v1',
          current_jobs:2,
          projected_jobs:5,
          confidence:0.9,
          prewarm_recommended:true,
          ...pressure,
        }],
      },
      tasks:[task],
      offers:[offer('micro',{micro:true})],
    });
    assert.equal(plan.reservation_count,0);
    assert.equal(plan.skipped[0].reason,'current_pressure_takes_priority_over_forecast_reserve');
  }
});
