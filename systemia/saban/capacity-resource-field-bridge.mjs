import { createHash } from 'node:crypto';
import { normalizeResourceNeed } from './resource-field.mjs';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

function taskById(tasks=[]){
  return new Map((tasks||[]).map(task=>[String(task?.task_id||''),task]));
}

function memorySemantics(task){
  const workload=String(task?.workload_class||'').toLowerCase();
  if(workload.includes('blob-store')||workload.includes('content-addressed-backup')){
    return 'object';
  }
  if(workload.includes('vector')) return 'vector';
  return 'local';
}

function needFromTask({task,unitId,reason,source='current_pressure'}={}){
  const resources=task?.resources_per_execution||{};
  const need=normalizeResourceNeed({
    need_id:'organism:'+String(unitId||task?.task_id||'capacity-gap'),
    workload_class:String(task?.workload_class||''),
    topology:'single_node',
    memory_semantics:memorySemantics(task),
    resources:{
      cpu_units:Number(resources.cpu_units||0),
      memory_mb:Number(resources.memory_mb||0),
      storage_gb:Number(resources.storage_gb||0),
      gpu_units:Number(resources.gpu_count||0),
      gpu_models:Array.isArray(resources.gpu_models)?resources.gpu_models:[],
      vram_mb:Number(resources.vram_mb||0),
    },
    required_labels:Array.isArray(task?.required_labels)?task.required_labels:[],
    max_hourly_usd:0,
    external_spend_requires_human_approval:true,
  });

  const body={
    schema:'evercraft.saban.resource-field-expansion-intent.v1',
    intent_id:'rfi-'+createHash('sha256')
      .update([need.need_id,need.workload_class,source].join('|'))
      .digest('hex')
      .slice(0,24),
    source,
    source_task_id:String(task?.task_id||''),
    source_unit_id:String(unitId||''),
    source_reason:String(reason||'capacity_gap'),
    need,
    policy:{
      zero_spend_first:true,
      automatic_paid_lease_authorized:false,
      automatic_owned_bootstrap_allowed:true,
      automatic_authorized_peer_use_allowed:true,
      automatic_voluntary_zero_cost_use_allowed:true,
      external_market_discovery_allowed:true,
      external_paid_execution_requires_explicit_authority:true,
      observation_never_grants_authority:true,
      scarcity_is_engineering_input:true,
    },
    next_lanes:[
      'live_attested_nodeseed_discovery',
      'owned_host_bootstrap',
      'authorized_ambient_or_microseed_capacity',
      'voluntary_zero_cost_capacity',
      'external_market_discovery',
      'new_adapter_or_capacity_engineering',
    ],
  };
  return {...body,receipt_hash:sha(body)};
}

function currentPressureIntents(capacityState,tasks){
  const byId=taskById(tasks);
  const rows=[];
  const seen=new Set();

  for(const gap of capacityState?.missing_capacity||[]){
    if(gap?.class!=='workload') continue;
    const task=byId.get(String(gap.task_id||''));
    if(!task) continue;
    const unitId=String(gap.unit_id||gap.task_id||'');
    const key='current|'+unitId;
    if(seen.has(key)) continue;
    seen.add(key);
    rows.push(needFromTask({
      task,
      unitId,
      reason:gap.reason,
      source:'current_pressure',
    }));
  }
  return rows;
}

function forecastIntents({capacityState,tasks,demandForecast,current=[]}={}){
  const byWorkload=new Map();
  for(const task of tasks||[]){
    const workload=String(task?.workload_class||'');
    if(!workload) continue;
    const list=byWorkload.get(workload)||[];
    list.push(task);
    byWorkload.set(workload,list);
  }

  const activeWorkloads=new Set(current.map(row=>row.need.workload_class));
  const rows=[];
  for(const workload of demandForecast?.prewarm_workloads||[]){
    const key=String(workload||'');
    if(!key||activeWorkloads.has(key)) continue;
    for(const task of byWorkload.get(key)||[]){
      rows.push(needFromTask({
        task,
        unitId:'forecast:'+task.task_id,
        reason:'predicted_demand_prewarm',
        source:'forecast_pressure',
      }));
      break;
    }
  }
  return rows;
}

export function buildResourceFieldExpansionIntents({
  capacityState,
  tasks=[],
  demandForecast=null,
}={}){
  if(capacityState?.schema!=='evercraft.saban.capacity-organism-state.v1'){
    throw new Error('capacity_organism_state_required');
  }

  const current=currentPressureIntents(capacityState,tasks);
  const forecast=forecastIntents({
    capacityState,
    tasks,
    demandForecast,
    current,
  });
  const intents=[...current,...forecast];

  const body={
    schema:'evercraft.saban.resource-field-expansion-queue.v1',
    intent_count:intents.length,
    current_pressure_intent_count:current.length,
    forecast_pressure_intent_count:forecast.length,
    intents,
    policy:{
      zero_spend_first:true,
      paid_capacity_auto_authorized:false,
      authority_expansion:false,
      proactive_before_failure:true,
      current_pressure_precedes_forecast:true,
      cross_device_ram_never_assumed_contiguous:true,
    },
    generated_at:capacityState.generated_at||new Date().toISOString(),
  };
  return {...body,receipt_hash:sha(body)};
}
