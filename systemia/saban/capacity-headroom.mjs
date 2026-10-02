import {createHash} from 'node:crypto';

const sha=v=>'sha256:'+createHash('sha256').update(
  typeof v==='string'?v:JSON.stringify(v)
).digest('hex');

function workloadSupported(offer,workload){
  const supported=new Set((offer.metadata?.supported_workloads||[]).map(String));
  return supported.has(workload)||offer.metadata?.generic_container_runtime===true;
}

function rightSizeScore(offer,resources){
  const cpuNeed=Math.max(0.001,Number(resources.cpu_units||0.001));
  const memNeed=Math.max(1,Number(resources.memory_mb||1));
  const cpuRatio=Number(offer.resources?.cpu_units||0)/cpuNeed;
  const memRatio=Number(offer.resources?.memory_mb||0)/memNeed;
  const gpuNeed=Math.max(0,Math.floor(Number(resources.gpu_count||0)));
  const gpuRatio=gpuNeed>0
    ? Number(offer.resources?.gpu_count||0)/gpuNeed
    : 1;
  if(cpuRatio<1||memRatio<1||gpuRatio<1)return Infinity;
  return Math.max(cpuRatio,memRatio,gpuRatio);
}

export function buildForecastHeadroomReservations({
  forecast,
  tasks=[],
  offers=[],
  maxReserveFraction=0.35,
}={}){
  if(forecast?.schema!=='evercraft.saban.capacity-demand-forecast.v1'){
    throw new Error('saban_capacity_demand_forecast_required');
  }
  const fraction=Math.max(0.05,Math.min(0.5,Number(maxReserveFraction||0.35)));
  const reservations=[];
  const skipped=[];

  for(const row of forecast.workload_forecasts||[]){
    if(row.prewarm_recommended!==true)continue;
    if(Number(row.current_held||0)>0||Number(row.current_retry_wait||0)>0){
      skipped.push({
        workload_class:row.workload_class,
        reason:'current_pressure_takes_priority_over_forecast_reserve',
      });
      continue;
    }
    const growth=Math.max(0,Number(row.projected_jobs||0)-Number(row.current_jobs||0));
    if(growth<0.75){
      skipped.push({workload_class:row.workload_class,reason:'projected_growth_below_one_slot'});
      continue;
    }
    const task=(tasks||[])
      .filter(t=>String(t.workload_class||'')===String(row.workload_class||''))
      .sort((a,b)=>
        Number(a.resources_per_execution?.memory_mb||0)-Number(b.resources_per_execution?.memory_mb||0)
      )[0]||null;
    if(!task){
      skipped.push({workload_class:row.workload_class,reason:'no_fabric_task_for_forecast_workload'});
      continue;
    }
    const r=task.resources_per_execution||{};
    const candidates=(offers||[])
      .filter(offer=>
        offer?.schema==='evercraft.saban.compute-offer.v1' &&
        offer.access_class==='authorized_compute' &&
        offer.trust?.attested===true &&
        offer.economics?.zero_cost===true &&
        workloadSupported(offer,row.workload_class)
      )
      .filter(offer=>
        Number(offer.resources?.cpu_units||0)>=Number(r.cpu_units||0) &&
        Number(offer.resources?.memory_mb||0)>=Number(r.memory_mb||0) &&
        Number(offer.resources?.storage_gb||0)>=Number(r.storage_gb||0) &&
        Number(offer.resources?.gpu_count||0)>=Number(r.gpu_count||0) &&
        (
          !Array.isArray(r.gpu_models) ||
          r.gpu_models.length===0 ||
          r.gpu_models.every(model=>
            (offer.resources?.gpu_models||[])
              .map(x=>String(x).toLowerCase())
              .includes(String(model).toLowerCase())
          )
        )
      )
      .filter(offer=>
        Number(r.cpu_units||0)<=Number(offer.resources.cpu_units||0)*fraction &&
        Number(r.memory_mb||0)<=Number(offer.resources.memory_mb||0)*fraction
      )
      .sort((a,b)=>
        rightSizeScore(a,r)-rightSizeScore(b,r) ||
        Number(b.metadata?.micro_node===true)-Number(a.metadata?.micro_node===true) ||
        String(a.offer_id).localeCompare(String(b.offer_id))
      );
    const chosen=candidates[0]||null;
    if(!chosen){
      skipped.push({workload_class:row.workload_class,reason:'no_safe_zero_cost_headroom_offer'});
      continue;
    }
    reservations.push({
      schema:'evercraft.saban.capacity-headroom-reservation.v1',
      reservation_id:'reserve:'+String(row.workload_class)+':'+String(chosen.offer_id),
      offer_id:chosen.offer_id,
      provider_id:chosen.provider_id,
      workload_class:String(row.workload_class),
      resources:{
        cpu_units:Number(r.cpu_units||0),
        memory_mb:Number(r.memory_mb||0),
        storage_gb:Number(r.storage_gb||0),
        gpu_count:Math.max(0,Math.floor(Number(r.gpu_count||0))),
        gpu_models:Array.isArray(r.gpu_models)?r.gpu_models:[],
      },
      reason:'forecast_growth_without_current_queue_pressure',
      projected_growth:Number(growth.toFixed(3)),
      confidence:Number(row.confidence||0),
      authority_expansion:false,
      commercial_spend_usd:0,
    });
  }

  const body={
    schema:'evercraft.saban.capacity-headroom-plan.v1',
    reservations,
    reservation_count:reservations.length,
    skipped,
    max_reserve_fraction:fraction,
    current_pressure_always_wins:true,
    existing_authorized_attested_zero_cost_capacity_only:true,
    authority_expansion:false,
    commercial_spend_usd:0,
    generated_at:forecast.generated_at,
  };
  return {...body,receipt_hash:sha(body)};
}
