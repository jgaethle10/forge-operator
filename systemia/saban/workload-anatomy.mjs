import { createHash } from 'node:crypto';
import { normalizeFabricTask } from './heterogeneous-fabric-planner.mjs';
import { microSeedWorkloadSpec } from './microseed-workload-registry.mjs';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

const DOMAIN_COUNT=14;

function task(input){
  return normalizeFabricTask(input);
}

export function rivetAliEvProductionAnatomy({
  reportParallelism=4,
  domainParallelism=DOMAIN_COUNT,
}={}){
  const tasks=[
    task({
      task_id:'edge-health-witness',
      workload_class:'systemia.health-probe.v1',
      replicas:2,
      resources:{cpu_units:0.05,memory_mb:64,storage_gb:0},
      require_attestation:true,
      require_always_on:true,
      minimum_uptime_7d:0.95,
      required_labels:['edge-observer'],
    }),
    task({
      task_id:'source-domain-record-digest',
      workload_class:'systemia.aliev.domain-record-digest.v1',
      execution_shape:'shardable',
      shard_count:Math.max(1,Math.floor(Number(domainParallelism||DOMAIN_COUNT))),
      resources:{cpu_units:0.08,memory_mb:96,storage_gb:0},
      preemptible:true,
      checkpointable:true,
      require_attestation:true,
      minimum_uptime_7d:0.5,
      max_observation_age_ms:120000,
      allowed_device_classes:[
        'refrigerator','phone','router','raspberry-pi','sbc','nas','desktop','laptop','server','unknown'
      ],
      max_power_budget_watts:200,
    }),
    task({
      task_id:'source-domain-canonicalize',
      workload_class:'systemia.json-canonicalize.v1',
      execution_shape:'shardable',
      shard_count:Math.max(1,Math.floor(Number(domainParallelism||DOMAIN_COUNT))),
      resources:{cpu_units:0.05,memory_mb:64,storage_gb:0},
      preemptible:true,
      checkpointable:true,
      require_attestation:true,
      minimum_uptime_7d:0.4,
      max_observation_age_ms:120000,
      max_power_budget_watts:200,
    }),
    task({
      task_id:'aliev-source-runtime',
      workload_class:'systemia.aliev-source-runtime.v1',
      resources:{cpu_units:2,memory_mb:4096,storage_gb:100},
      required_labels:['persistent-storage'],
      require_attestation:true,
      private_data:true,
      require_always_on:true,
      minimum_uptime_7d:0.95,
      forbidden_device_classes:['refrigerator','phone','router','smart-tv','kiosk'],
    }),
    task({
      task_id:'aliev-content-addressed-backup',
      workload_class:'systemia.content-addressed-backup.v1',
      resources:{cpu_units:0.5,memory_mb:512,storage_gb:150},
      required_labels:['persistent-storage'],
      require_attestation:true,
      private_data:true,
      require_always_on:true,
      minimum_uptime_7d:0.90,
      forbidden_device_classes:['refrigerator','phone','router','smart-tv','kiosk'],
    }),
    task({
      task_id:'rivet-report-runtime',
      workload_class:'systemia.rivet-report-runtime.v1',
      resources:{cpu_units:4,memory_mb:8192,storage_gb:50},
      required_labels:['heavy-compute'],
      require_attestation:true,
      private_data:true,
      require_always_on:true,
      minimum_uptime_7d:0.95,
      forbidden_device_classes:['refrigerator','phone','router','smart-tv','kiosk'],
    }),
    task({
      task_id:'rivet-report-projection',
      workload_class:'systemia.chunk-transform.v1',
      execution_shape:'shardable',
      shard_count:Math.max(1,Math.floor(Number(reportParallelism||4))),
      resources:{cpu_units:0.25,memory_mb:512,storage_gb:1},
      preemptible:true,
      checkpointable:true,
      require_attestation:true,
      private_data:true,
      minimum_uptime_7d:0.70,
    }),
    task({
      task_id:'rivet-session-semantics-audit',
      workload_class:'systemia.rivet.observed-session-sanity.v1',
      execution_shape:'shardable',
      shard_count:Math.max(1,Math.floor(Number(domainParallelism||DOMAIN_COUNT))),
      resources:{cpu_units:0.08,memory_mb:160,storage_gb:0},
      preemptible:true,
      checkpointable:true,
      require_attestation:true,
      private_data:true,
      minimum_uptime_7d:0.60,
      max_observation_age_ms:120000,
    }),
    task({
      task_id:'rivet-source-coverage-audit',
      workload_class:'systemia.rivet.source-coverage-audit.v1',
      execution_shape:'shardable',
      shard_count:Math.max(1,Math.floor(Number(reportParallelism||4))),
      resources:{cpu_units:0.05,memory_mb:64,storage_gb:0},
      preemptible:true,
      checkpointable:true,
      require_attestation:true,
      private_data:true,
      minimum_uptime_7d:0.60,
    }),
  ];

  const dependencies=[
    ['source-domain-record-digest','aliev-source-runtime'],
    ['source-domain-canonicalize','aliev-source-runtime'],
    ['aliev-source-runtime','rivet-report-runtime'],
    ['source-domain-record-digest','rivet-session-semantics-audit'],
    ['rivet-session-semantics-audit','rivet-report-runtime'],
    ['aliev-source-runtime','aliev-content-addressed-backup'],
    ['rivet-report-runtime','rivet-report-projection'],
    ['rivet-report-runtime','rivet-source-coverage-audit'],
    ['edge-health-witness','rivet-report-runtime'],
  ];

  const body={
    schema:'evercraft.saban.workload-anatomy.v1',
    anatomy_id:'rivet-aliev-production',
    owner:'Systemia',
    tasks,
    dependencies:dependencies.map(([from,to])=>({from,to})),
    invariants:{
      missing_is_never_zero:true,
      source_truth_stays_with_aliev:true,
      report_truth_stays_source_bound:true,
      durable_state_never_requires_micro_nodes:true,
      private_data_requires_authorized_compute:true,
      micro_nodes_are_for_bounded_shards_not_stateful_core:true,
      backup_is_separate_failure_surface:true,
    },
    generated_at:new Date().toISOString(),
  };

  return {...body,receipt_hash:sha(body)};
}

export function formationWaves(anatomy){
  if(anatomy?.schema!=='evercraft.saban.workload-anatomy.v1'){
    throw new Error('saban_workload_anatomy_required');
  }
  const ids=new Set((anatomy.tasks||[]).map(t=>t.task_id));
  const incoming=new Map([...ids].map(id=>[id,new Set()]));
  const outgoing=new Map([...ids].map(id=>[id,new Set()]));

  for(const edge of anatomy.dependencies||[]){
    if(!ids.has(edge.from)||!ids.has(edge.to)) throw new Error('anatomy_dependency_unknown_task');
    incoming.get(edge.to).add(edge.from);
    outgoing.get(edge.from).add(edge.to);
  }

  const remaining=new Set(ids);
  const waves=[];
  while(remaining.size){
    const ready=[...remaining].filter(id=>
      [...incoming.get(id)].every(dep=>!remaining.has(dep))
    ).sort();
    if(!ready.length) throw new Error('anatomy_dependency_cycle');
    waves.push(ready);
    for(const id of ready) remaining.delete(id);
  }

  return {
    schema:'evercraft.saban.workload-formation-waves.v1',
    anatomy_id:anatomy.anatomy_id,
    wave_count:waves.length,
    waves:waves.map((task_ids,index)=>({wave:index+1,task_ids})),
  };
}


function safeTaskId(workload){
  return String(workload||'workload')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g,'-')
    .replace(/^-+|-+$/g,'')
    .slice(0,120)||'workload';
}

export function portfolioWorkloadAnatomy({
  demandRadar=null,
  includeRivetAliEv=true,
  reportParallelism=4,
  domainParallelism=DOMAIN_COUNT,
}={}){
  const base=includeRivetAliEv
    ? rivetAliEvProductionAnatomy({reportParallelism,domainParallelism})
    : {
        schema:'evercraft.saban.workload-anatomy.v1',
        anatomy_id:'empty',
        owner:'Systemia',
        tasks:[],
        dependencies:[],
        invariants:{},
      };

  const tasks=[...(base.tasks||[])];
  const dependencies=[...(base.dependencies||[])];
  const represented=new Set(tasks.map(t=>String(t.workload_class||'')));
  const demandRows=demandRadar?.schema==='evercraft.saban.ambient-demand-radar.v1'
    ? (demandRadar.workloads||[])
    : [];

  for(const row of demandRows){
    const workload=String(row.workload_class||'').trim();
    if(!workload||represented.has(workload)||Number(row.jobs||0)<=0)continue;
    const registered=microSeedWorkloadSpec(workload);
    const jobs=Math.max(1,Math.floor(Number(row.jobs||1)));
    const fullyPreemptible=Number(row.preemptible_jobs||0)===jobs;
    const fullyCheckpointable=Number(row.checkpointable_jobs||0)===jobs;
    const privateData=Number(row.private_jobs||0)>0;
    const shardable=jobs>1&&fullyPreemptible&&fullyCheckpointable;

    tasks.push(task({
      task_id:'queued-'+safeTaskId(workload),
      workload_class:workload,
      execution_shape:shardable?'shardable':'atomic',
      shard_count:shardable?Math.min(64,jobs):1,
      resources:{
        cpu_units:Math.max(0.001,Number(row.max_cpu_units||0.05)),
        memory_mb:Math.max(1,Number(row.max_memory_mb||64)),
        storage_gb:Math.max(0,Number(row.max_storage_gb||0)),
      },
      preemptible:shardable,
      checkpointable:shardable,
      require_attestation:true,
      private_data:privateData,
      minimum_uptime_7d:fullyPreemptible?0.4:0.85,
      max_observation_age_ms:120000,
      allowed_device_classes:registered
        ? ['phone','tablet','router','raspberry-pi','sbc','nas','desktop','laptop','server','unknown']
        : [],
      max_power_budget_watts:registered?250:null,
    }));
    represented.add(workload);
  }

  const body={
    schema:'evercraft.saban.workload-anatomy.v1',
    anatomy_id:'evercraft-portfolio-live',
    owner:'Systemia',
    tasks,
    dependencies,
    source_anatomies:includeRivetAliEv?['rivet-aliev-production']:[],
    live_demand_workload_count:demandRows.length,
    live_demand_tasks_added:tasks.length-(base.tasks?.length||0),
    invariants:{
      ...(base.invariants||{}),
      live_queue_can_extend_anatomy:true,
      unregistered_workloads_require_explicit_node_support_or_generic_runtime:true,
      private_data_requires_authorized_compute:true,
      observation_never_grants_authority:true,
      commercial_spend_requires_explicit_authority:true,
    },
    generated_at:demandRadar?.generated_at||new Date().toISOString(),
  };
  return {...body,receipt_hash:sha(body)};
}
