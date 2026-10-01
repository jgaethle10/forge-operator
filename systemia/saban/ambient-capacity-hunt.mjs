import { createHash } from 'node:crypto';

const sha=v=>'sha256:'+createHash('sha256').update(
  typeof v==='string'?v:JSON.stringify(v)
).digest('hex');

function candidateRegistryId(profile){
  const hash=String(profile?.observation_ref||'').replace(/^sha256:/,'');
  return hash?'observed-'+hash.slice(0,24):null;
}

export function buildAmbientCapacityHuntPlan({
  demandRadar,
  candidateInventory,
}={}){
  if(demandRadar?.schema!=='evercraft.saban.ambient-demand-radar.v1'){
    throw new Error('ambient_demand_radar_required');
  }
  if(candidateInventory?.schema!=='evercraft.saban.ambient-candidate-inventory.v1'){
    throw new Error('ambient_candidate_inventory_required');
  }

  const opportunities=[];
  for(const need of demandRadar.workloads||[]){
    if(need.jobs<=0) continue;
    const candidates=(candidateInventory.profiles||[])
      .filter(p=>p.candidate_capability_kinds?.includes('compute'))
      .map(p=>{
        const bridgeBonus=p.suggested_bridge_modes?.includes('native_agent')?500:0;
        const score=
          Math.round(Number(p.confidence||0)*1000)+
          bridgeBonus+
          (need.held||0)*300+
          (need.retry_wait||0)*150;
        return {
          registry_candidate_id:candidateRegistryId(p),
          observation_ref:p.observation_ref,
          device_family:p.device_family,
          suggested_bridge_modes:p.suggested_bridge_modes,
          confidence:p.confidence,
          score,
          resource_shape_verified:false,
          ownership_verified:false,
          authorization_granted:false,
          active_probe_performed:false,
          next_actions:[
            'identify_owner_and_confirm_device_is_available_for_evercraft',
            'authorize_exact_device',
            'bootstrap_or_verify_native_microseed_agent',
            'measure_cpu_memory_storage_and_safety_telemetry',
            'run_workload_conformance',
            'run_safe_calibration',
          ],
        };
      })
      .sort((a,b)=>b.score-a.score||String(a.observation_ref).localeCompare(String(b.observation_ref)));

    opportunities.push({
      workload_class:need.workload_class,
      waiting_jobs:need.jobs,
      held_jobs:need.held,
      retry_wait_jobs:need.retry_wait,
      required_single_execution:{
        cpu_units:need.max_cpu_units,
        memory_mb:need.max_memory_mb,
        storage_gb:need.max_storage_gb,
      },
      private_work_present:need.private_jobs>0,
      authorized_capacity_required:need.private_jobs>0,
      candidate_count:candidates.length,
      candidates:candidates.slice(0,12),
      state:candidates.length?'candidate_surfaces_visible':'no_passive_compute_candidate_visible',
    });
  }

  const body={
    schema:'evercraft.saban.ambient-capacity-hunt-plan.v1',
    demand_workloads:opportunities.length,
    candidate_matches:opportunities.reduce((n,x)=>n+x.candidate_count,0),
    opportunities,
    passive_visibility_only:true,
    ownership_inferred:false,
    authorization_inferred:false,
    active_probe_performed:false,
    commercial_capacity_considered:false,
    commercial_capacity_authorized:false,
    generated_at:demandRadar.generated_at||new Date().toISOString(),
  };
  return {...body,receipt_hash:sha(body)};
}
