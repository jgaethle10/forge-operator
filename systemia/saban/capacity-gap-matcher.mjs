import { createHash } from 'node:crypto';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

const ROLE_KIND={
  'public-network-ingress':'network_ingress',
  'source-network-egress':'network_egress',
  'durable-source-storage':'storage',
  'physical-world-observation':'observation',
};

function taskMap(tasks=[]){
  return new Map((tasks||[]).map(t=>[String(t.task_id||''),t]));
}

function normalizeGap(gap,tasks){
  if(gap?.class==='capability'){
    return {
      gap_id:'capability:'+String(gap.role_id||'unknown'),
      class:'capability',
      role_id:gap.role_id||null,
      task_id:null,
      needed_kinds:[ROLE_KIND[gap.role_id]||'unknown'],
      persistent_storage:gap.role_id==='durable-source-storage',
      required_labels:[],
      workload_class:null,
      reason:gap.reason||'missing_capability',
    };
  }

  const task=tasks.get(String(gap?.task_id||''));
  return {
    gap_id:'workload:'+String(gap?.unit_id||gap?.task_id||'unknown'),
    class:'workload',
    role_id:null,
    task_id:gap?.task_id||null,
    unit_id:gap?.unit_id||null,
    needed_kinds:['compute'],
    persistent_storage:Number(task?.resources_per_execution?.storage_gb||0)>0 &&
      task?.continuity?.require_always_on===true,
    required_labels:[...(task?.required_labels||[])],
    workload_class:task?.workload_class||null,
    reason:gap?.reason||'missing_workload_capacity',
  };
}

function adapterState(candidate,adapterHealth){
  const modes=candidate?.suggested_bridge_modes||[];
  if(!modes.length){
    return {state:'unknown',ready_modes:[],blocked_modes:[]};
  }
  const ready=[];
  const blocked=[];
  for(const mode of modes){
    const status=adapterHealth?.adapters?.[mode]||null;
    if(status?.available===true) ready.push(mode);
    else blocked.push({mode,reason:status?.reason||'adapter_health_unknown'});
  }
  return {
    state:ready.length?'ready':blocked.length?'blocked':'unknown',
    ready_modes:ready,
    blocked_modes:blocked,
  };
}

function candidateScore(gap,candidate,adapter){
  const kinds=new Set(candidate?.candidate_capability_kinds||[]);
  const kindMatches=gap.needed_kinds.filter(k=>kinds.has(k)).length;
  if(!kindMatches)return null;

  let score=kindMatches*1000;
  score+=Math.round(Number(candidate.confidence||0)*500);

  if(adapter.state==='ready') score+=500;
  else if(adapter.state==='blocked') score-=300;

  if(gap.persistent_storage&&candidate.device_family==='network_storage') score+=800;
  if(gap.needed_kinds.includes('compute')&&candidate.device_family==='general_compute_candidate') score+=700;
  if(gap.needed_kinds.includes('observation')&&candidate.device_family==='matter_device') score+=350;
  if(gap.needed_kinds.includes('network_ingress')&&candidate.device_family==='mqtt_endpoint') score+=150;

  return score;
}

function nextActions(gap,candidate,adapter){
  const actions=[
    'identify_exact_owned_or_authorized_device',
    'confirm_owner_authorization',
  ];
  if(adapter.state==='blocked'){
    for(const item of adapter.blocked_modes){
      if(String(item.reason).startsWith('runtime_dependency_missing:')){
        actions.push('install_or_supply_runtime_dependency:'+item.reason.split(':').slice(1).join(':'));
      }else if(item.reason==='adapter_not_implemented'){
        actions.push('implement_bridge_adapter:'+item.mode);
      }else{
        actions.push('resolve_bridge_adapter:'+item.mode);
      }
    }
  }
  actions.push('declare_exact_bounded_capabilities');
  actions.push('heartbeat_and_attest');
  if(gap.needed_kinds.includes('compute')){
    actions.push('install_or_verify_native_agent');
    actions.push('run_safe_workload_conformance');
    actions.push('calibrate_verified_workload');
  }else{
    actions.push('probe_declared_capability_after_authorization');
  }
  return [...new Set(actions)];
}

export function matchCapacityGapsToAmbientCandidates({
  capacityState,
  candidateInventory,
  tasks=[],
  adapterHealth=null,
  maxCandidatesPerGap=5,
}={}){
  if(capacityState?.schema!=='evercraft.saban.capacity-organism-state.v1'){
    throw new Error('capacity_organism_state_required');
  }
  if(candidateInventory?.schema!=='evercraft.saban.ambient-candidate-inventory.v1'){
    throw new Error('ambient_candidate_inventory_required');
  }

  const tasksById=taskMap(tasks);
  const gaps=(capacityState.missing_capacity||[]).map(g=>normalizeGap(g,tasksById));
  const candidates=candidateInventory.profiles||[];
  const matches=[];

  for(const gap of gaps){
    const ranked=[];
    for(const candidate of candidates){
      const adapter=adapterState(candidate,adapterHealth);
      const score=candidateScore(gap,candidate,adapter);
      if(score==null)continue;
      ranked.push({
        observation_ref:candidate.observation_ref,
        device_family:candidate.device_family,
        confidence:Number(candidate.confidence||0),
        candidate_capability_kinds:candidate.candidate_capability_kinds||[],
        suggested_bridge_modes:candidate.suggested_bridge_modes||[],
        adapter_state:adapter,
        score,
        authorization_granted:false,
        active_probe_performed:false,
        compute_implied:false,
        next_actions:nextActions(gap,candidate,adapter),
      });
    }
    ranked.sort((a,b)=>b.score-a.score||String(a.observation_ref).localeCompare(String(b.observation_ref)));
    matches.push({
      gap,
      candidate_count:ranked.length,
      candidates:ranked.slice(0,Math.max(1,Number(maxCandidatesPerGap||5))),
      state:ranked.length?'candidate_found':'no_observed_candidate',
    });
  }

  const matched=matches.filter(x=>x.candidate_count>0).length;
  const adapterBlocked=matches.reduce(
    (n,m)=>n+m.candidates.filter(c=>c.adapter_state.state==='blocked').length,
    0
  );
  const body={
    schema:'evercraft.saban.capacity-gap-opportunity-map.v1',
    gap_count:gaps.length,
    matched_gap_count:matched,
    unmatched_gap_count:gaps.length-matched,
    adapter_blocked_candidate_count:adapterBlocked,
    matches,
    authorization_granted:false,
    active_probe_performed:false,
    commercial_capacity_considered:false,
    purpose:'connect_missing_production_capacity_to_existing_observed_zero_spend_hardware_candidates',
    generated_at:candidateInventory.generated_at||new Date().toISOString(),
  };
  return {...body,receipt_hash:sha(body)};
}
