import {createHash} from 'node:crypto';

const sha=v=>'sha256:'+createHash('sha256').update(
  typeof v==='string'?v:JSON.stringify(v)
).digest('hex');
const clean=v=>String(v??'').trim();

function validConformance(row,nowMs){
  const c=row?.conformance;
  if(c?.schema!=='evercraft.microseed.conformance-receipt.v1')return false;
  if(c.device_id!==row.device_id)return false;
  if(c.manifest_hash!==row.manifest?.manifest_hash)return false;
  const exp=Date.parse(String(c.expires_at||''));
  return Number.isFinite(exp)&&nowMs<exp&&(c.verified_workloads||[]).length>0;
}

function stalePerformanceWorkloads(row,performanceLedger,nowMs,maxAgeMs){
  const workloads=[...(row?.conformance?.verified_workloads||[])].map(String);
  if(!workloads.length)return [];
  const profiles=performanceLedger?.profiles&&typeof performanceLedger.profiles==='object'
    ? performanceLedger.profiles
    : {};
  return workloads.filter(workload=>{
    const profile=profiles[String(row.device_id)+'|'+workload]||null;
    if(!profile)return true;
    const observed=Date.parse(String(profile.last_observed_at||''))||0;
    return !observed || nowMs-observed>Math.max(60_000,Number(maxAgeMs||0));
  });
}

function prewarmByDevice(prewarmPlan){
  const map=new Map();
  if(prewarmPlan?.schema!=='evercraft.saban.prewarm-plan.v1')return map;
  for(const row of prewarmPlan.actions||[]){
    const id=String(row?.device_id||'').trim();
    if(!id)continue;
    const entry=map.get(id)||new Set();
    for(const workload of row.matched_workloads||[])entry.add(String(workload));
    map.set(id,entry);
  }
  return map;
}

function authorityRequestForRow(row,now){
  const manifest=row?.manifest||null;
  if(!manifest)return null;
  const requestedWorkloads=[...(manifest.supported_workloads||[])].map(String).sort();
  const requestedCapabilities=(manifest.declared_capabilities||[]).map((cap,index)=>({
    capability_index:index,
    kind:String(cap.kind||'unknown'),
    operations:[...(cap.operations||[])].map(String).sort(),
    consequential:
      cap.kind==='actuation' ||
      cap.metadata?.consequential===true ||
      cap.metadata?.requires_per_action_approval===true,
  }));
  const identity={
    device_id:row.device_id,
    manifest_hash:manifest.manifest_hash,
    requested_workloads:requestedWorkloads,
    requested_capabilities:requestedCapabilities,
  };
  const requestId='saban-auth-'+createHash('sha256')
    .update(JSON.stringify(identity))
    .digest('hex').slice(0,24);
  return {
    schema:'evercraft.saban.capacity-authority-request.v1',
    request_id:requestId,
    device_id:row.device_id,
    manifest_hash:manifest.manifest_hash,
    reason:'candidate_capacity_matches_live_evercraft_demand',
    requested_scope:{
      workloads:requestedWorkloads,
      capabilities:requestedCapabilities,
      arbitrary_code_execution:false,
      commercial_spend_usd:0,
      bounded_by_manifest:true,
      per_action_approval_still_required_for_consequential_capabilities:true,
    },
    proposed_authorization:{
      expires_after_hours:168,
      heartbeat_target_seconds:300,
      attestation_mode:manifest.attestation?.mode||'gateway_bound',
      exact_device_only:true,
    },
    authority_state:'explicit_owner_or_operator_approval_required',
    observation_is_not_authority:true,
    generated_at:(now instanceof Date?now:new Date(now)).toISOString(),
  };
}

function opportunityRequests(opportunityMap,now){
  const byObservation=new Map();
  for(const match of opportunityMap?.matches||[]){
    for(const candidate of match.candidates||[]){
      const key=clean(candidate.observation_ref);
      if(!key)continue;
      const entry=byObservation.get(key)||{
        observation_ref:key,
        device_family:candidate.device_family||'unknown',
        workloads:new Set(),
        gap_ids:new Set(),
        score:0,
      };
      if(match.gap?.workload_class)entry.workloads.add(String(match.gap.workload_class));
      if(match.gap?.gap_id)entry.gap_ids.add(String(match.gap.gap_id));
      entry.score=Math.max(entry.score,Number(candidate.score||0));
      byObservation.set(key,entry);
    }
  }
  return [...byObservation.values()]
    .sort((a,b)=>b.score-a.score||a.observation_ref.localeCompare(b.observation_ref))
    .map(entry=>({
      schema:'evercraft.saban.observed-capacity-authority-lead.v1',
      lead_id:'saban-lead-'+createHash('sha256').update(entry.observation_ref).digest('hex').slice(0,20),
      observation_ref:entry.observation_ref,
      device_family:entry.device_family,
      matched_workloads:[...entry.workloads].sort(),
      matched_gap_ids:[...entry.gap_ids].sort(),
      score:entry.score,
      next_required_step:'identify_exact_device_and_current_owner_before_any_active_probe',
      active_probe_authorized:false,
      ownership_inferred:false,
      authority_inferred:false,
      generated_at:(now instanceof Date?now:new Date(now)).toISOString(),
    }));
}

export function buildCapacityAutonomyPlan({
  registrySnapshot,
  opportunityMap=null,
  performanceLedger=null,
  prewarmPlan=null,
  maxPerformanceAgeMs=30*60*1000,
  now=new Date(),
}={}){
  if(registrySnapshot?.schema!=='evercraft.saban.ambient-device-registry-snapshot.v1'){
    throw new Error('ambient_device_registry_snapshot_required');
  }
  const nowDate=now instanceof Date?now:new Date(now);
  const nowMs=nowDate.getTime();
  if(!Number.isFinite(nowMs))throw new Error('capacity_autonomy_now_invalid');

  const safeAutonomousActions=[];
  const authorityRequests=[];
  const prewarmTargets=prewarmByDevice(prewarmPlan);
  const postAuthorityPipelines=[];
  const holds=[];

  for(const row of registrySnapshot.rows||[]){
    const state=String(row.state||'');
    const manifest=row.manifest||null;

    if(state==='candidate'){
      const request=authorityRequestForRow(row,nowDate);
      if(request)authorityRequests.push(request);
      else holds.push({
        device_id:row.device_id,
        reason:'candidate_manifest_missing',
        required_action:'finish_passive_profile_before_authority_request',
      });
      continue;
    }

    if(state==='observed'){
      safeAutonomousActions.push({
        device_id:row.device_id,
        action:'continue_passive_deduplicated_observation',
        authority_required:false,
        active_probe:false,
        reason:'observation_can_improve_candidate_profile_without_device_control',
      });
      continue;
    }

    if(state==='authorized'){
      safeAutonomousActions.push({
        device_id:row.device_id,
        action:'request_first_attested_heartbeat',
        authority_required:false,
        authority_basis:'existing_unexpired_device_authorization',
        active_probe:true,
        bounded_to_manifest:true,
      });
      postAuthorityPipelines.push({
        device_id:row.device_id,
        state:'resume_when_heartbeat_active',
        steps:[
          'attested_heartbeat',
          'registered_workload_conformance',
          'safe_calibration',
          'compile_zero_cost_compute_offer',
          'place_matching_work',
          'record_performance',
          'rebalance_if_materially_better_or_current_node_degrades',
        ],
      });
      continue;
    }

    if(state==='active'){
      if(!manifest){
        holds.push({device_id:row.device_id,reason:'active_device_manifest_missing'});
        continue;
      }
      if(!validConformance(row,nowMs)){
        safeAutonomousActions.push({
          device_id:row.device_id,
          action:'run_registered_workload_conformance_canaries',
          authority_required:false,
          authority_basis:'existing_active_device_authorization',
          arbitrary_code_execution:false,
          canaries_only:true,
          reason:'conformance_missing_or_near_expiry',
        });
      }else{
        const stale=stalePerformanceWorkloads(
          row,
          performanceLedger,
          nowMs,
          maxPerformanceAgeMs
        );
        const forecast=[...(prewarmTargets.get(row.device_id)||new Set())];
        const targetWorkloads=[...new Set([...stale,...forecast])].sort();
        if(targetWorkloads.length){
          safeAutonomousActions.push({
            device_id:row.device_id,
            action:'run_safe_calibration_and_refresh_performance_profile',
            authority_required:false,
            authority_basis:'existing_active_device_authorization',
            verified_workloads:[...(row.conformance?.verified_workloads||[])],
            target_workloads:targetWorkloads,
            stale_performance_workloads:stale,
            forecast_prewarm_workloads:forecast,
            reason:forecast.length
              ? 'predicted_demand_or_stale_performance'
              : 'performance_profile_stale',
          });
        }
        safeAutonomousActions.push({
          device_id:row.device_id,
          action:'compile_offer_and_rebalance_matching_checkpointable_work',
          authority_required:false,
          anti_flap:true,
          checkpoint_preservation:true,
          private_data_never_expands_authority:true,
          calibration_required:targetWorkloads.length>0,
        });
      }
      continue;
    }

    if(state==='degraded'){
      safeAutonomousActions.push({
        device_id:row.device_id,
        action:'suspend_new_assignments',
        authority_required:false,
        reason:row.reason||'trust_degraded',
      });
      safeAutonomousActions.push({
        device_id:row.device_id,
        action:'request_attested_recovery_heartbeat',
        authority_required:false,
        authority_basis:'existing_unexpired_device_authorization',
      });
      continue;
    }

    if(state==='expired'){
      authorityRequests.push({
        schema:'evercraft.saban.capacity-authority-renewal.v1',
        request_id:'saban-renew-'+createHash('sha256').update(row.device_id).digest('hex').slice(0,20),
        device_id:row.device_id,
        reason:'authorization_expired',
        authority_state:'renewal_required',
        prior_authority_does_not_auto_extend:true,
        generated_at:nowDate.toISOString(),
      });
      continue;
    }

    if(state==='revoked'){
      holds.push({
        device_id:row.device_id,
        reason:'revoked',
        autonomous_reactivation_forbidden:true,
      });
    }
  }

  const observedLeads=opportunityRequests(opportunityMap,nowDate);
  const body={
    schema:'evercraft.saban.capacity-autonomy-plan.v1',
    safe_autonomous_action_count:safeAutonomousActions.length,
    authority_request_count:authorityRequests.length,
    observed_authority_lead_count:observedLeads.length,
    post_authority_pipeline_count:postAuthorityPipelines.length,
    hold_count:holds.length,
    safe_autonomous_actions:safeAutonomousActions,
    authority_requests:authorityRequests,
    observed_authority_leads:observedLeads,
    post_authority_pipelines:postAuthorityPipelines,
    holds,
    policies:{
      observation_never_grants_authority:true,
      owner_or_operator_authority_is_exact_device_scoped:true,
      authority_resume_is_automatic_after_valid_grant:true,
      consequential_capabilities_keep_per_action_approval:true,
      arbitrary_code_execution:false,
      commercial_spend_without_authority:false,
      stale_or_revoked_authority_never_auto_renews:true,
      calibration_is_evidence_or_forecast_driven:true,
      forecast_prewarm_never_expands_authority:true,
    },
    generated_at:nowDate.toISOString(),
  };
  return {...body,receipt_hash:sha(body)};
}
