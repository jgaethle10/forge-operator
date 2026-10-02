import { createHash } from 'node:crypto';

const sha=v=>'sha256:'+createHash('sha256').update(
  typeof v==='string'?v:JSON.stringify(v)
).digest('hex');

export function buildAmbientDemandRadar({
  jobs=[],
  now=new Date(),
}={}){
  const nowMs=now instanceof Date?now.getTime():Date.parse(String(now));
  if(!Number.isFinite(nowMs)) throw new Error('ambient_demand_now_invalid');

  const active=(jobs||[]).filter(j=>['queued','held','retry_wait'].includes(j.state));
  const byWorkload=new Map();

  for(const job of active){
    const workload=String(job.workload_class||'unknown');
    const current=byWorkload.get(workload)||{
      workload_class:workload,
      jobs:0,
      queued:0,
      held:0,
      retry_wait:0,
      private_jobs:0,
      total_cpu_units:0,
      max_cpu_units:0,
      total_memory_mb:0,
      max_memory_mb:0,
      total_storage_gb:0,
      max_storage_gb:0,
      total_gpu_count:0,
      max_gpu_count:0,
      gpu_models:new Set(),
      preemptible_jobs:0,
      checkpointable_jobs:0,
      oldest_requested_at:null,
      oldest_age_ms:0,
    };
    current.jobs+=1;
    current[job.state]=(current[job.state]||0)+1;
    if(job.private_data===true) current.private_jobs+=1;
    if(job.preemptible===true) current.preemptible_jobs+=1;
    if(job.checkpointable===true) current.checkpointable_jobs+=1;

    const cpu=Math.max(0,Number(job.resources?.cpu_units||0));
    const memory=Math.max(0,Number(job.resources?.memory_mb||0));
    const storage=Math.max(0,Number(job.resources?.storage_gb||0));
    const gpuCount=Math.max(0,Math.floor(Number(job.resources?.gpu_count||0)));
    const gpuModels=Array.isArray(job.resources?.gpu_models)
      ? job.resources.gpu_models.map(x=>String(x).toLowerCase())
      : [];
    current.total_cpu_units+=cpu;
    current.max_cpu_units=Math.max(current.max_cpu_units,cpu);
    current.total_memory_mb+=memory;
    current.max_memory_mb=Math.max(current.max_memory_mb,memory);
    current.total_storage_gb+=storage;
    current.max_storage_gb=Math.max(current.max_storage_gb,storage);
    current.total_gpu_count+=gpuCount;
    current.max_gpu_count=Math.max(current.max_gpu_count,gpuCount);
    for(const model of gpuModels) current.gpu_models.add(model);

    const requested=Date.parse(String(job.requested_at||''))||nowMs;
    const age=Math.max(0,nowMs-requested);
    if(!current.oldest_requested_at||requested<Date.parse(current.oldest_requested_at)){
      current.oldest_requested_at=new Date(requested).toISOString();
      current.oldest_age_ms=age;
    }
    byWorkload.set(workload,current);
  }

  const workloads=[...byWorkload.values()]
    .map(row=>({
      ...row,
      total_cpu_units:Number(row.total_cpu_units.toFixed(4)),
      total_memory_mb:Number(row.total_memory_mb.toFixed(2)),
      total_storage_gb:Number(row.total_storage_gb.toFixed(4)),
      total_gpu_count:row.total_gpu_count,
      max_gpu_count:row.max_gpu_count,
      gpu_models:[...row.gpu_models].sort(),
      private_fraction:row.jobs?Number((row.private_jobs/row.jobs).toFixed(6)):0,
      checkpointable_fraction:row.jobs?Number((row.checkpointable_jobs/row.jobs).toFixed(6)):0,
      urgency_score:
        row.held*1000+
        row.retry_wait*500+
        Math.min(500,Math.round(row.oldest_age_ms/60000))+
        row.private_jobs*50+
        Math.round(row.max_memory_mb/128),
    }))
    .sort((a,b)=>b.urgency_score-a.urgency_score||a.workload_class.localeCompare(b.workload_class));

  const body={
    schema:'evercraft.saban.ambient-demand-radar.v1',
    active_jobs:active.length,
    queued_jobs:active.filter(x=>x.state==='queued').length,
    held_jobs:active.filter(x=>x.state==='held').length,
    retry_wait_jobs:active.filter(x=>x.state==='retry_wait').length,
    private_jobs:active.filter(x=>x.private_data===true).length,
    workload_count:workloads.length,
    workloads,
    commercial_capacity_considered:false,
    commercial_capacity_authorized:false,
    generated_at:new Date(nowMs).toISOString(),
  };
  return {...body,receipt_hash:sha(body)};
}

export function deriveZeroSpendCapacityNeeds(demandRadar={}){
  if(demandRadar?.schema!=='evercraft.saban.ambient-demand-radar.v1'){
    throw new Error('ambient_demand_radar_required');
  }
  return (demandRadar.workloads||[]).map(row=>({
    workload_class:row.workload_class,
    minimum_single_execution:{
      cpu_units:row.max_cpu_units,
      memory_mb:row.max_memory_mb,
      storage_gb:row.max_storage_gb,
      gpu_count:row.max_gpu_count,
      gpu_models:row.gpu_models,
    },
    preferred_parallel_capacity:{
      cpu_units:row.total_cpu_units,
      memory_mb:row.total_memory_mb,
      storage_gb:row.total_storage_gb,
      gpu_count:row.total_gpu_count,
      gpu_models:row.gpu_models,
    },
    authorized_only:row.private_jobs>0,
    checkpoint_friendly:row.checkpointable_fraction===1,
    urgency_score:row.urgency_score,
    acceptable_sources:[
      'existing_evercraft_compute',
      'authorized_microseed',
      'authorized_owned_hardware',
      'authorized_partner_zero_spend',
    ],
    commercial_capacity_authorized:false,
  }));
}
