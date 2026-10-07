import { createHash } from 'node:crypto';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

function domains(offer={}){
  const meta=offer.metadata||{};
  const explicit=meta.failure_domains&&typeof meta.failure_domains==='object'
    ? Object.fromEntries(
        Object.entries(meta.failure_domains)
          .map(([k,v])=>[String(k).toLowerCase(),String(v??'').toLowerCase()])
          .filter(([k,v])=>k&&v)
      )
    : {};
  return {
    failure_domain:String(explicit.failure_domain||meta.failure_domain||offer.provider_id||'').toLowerCase()||null,
    site_id:String(explicit.site_id||meta.site_id||meta.location_id||'').toLowerCase()||null,
    network_id:String(explicit.network_id||meta.network_id||meta.isp_id||'').toLowerCase()||null,
    power_domain:String(explicit.power_domain||meta.power_domain||meta.power_source_id||'').toLowerCase()||null,
    provider_account:String(explicit.provider_account||meta.provider_account||meta.account_id||meta.billing_account||'').toLowerCase()||null,
  };
}

function byTaskPlacements(plan){
  const out=new Map();
  for(const p of plan?.placements||[]){
    const key=String(p.task_id||'');
    if(!key) continue;
    const list=out.get(key)||[];
    list.push(p);
    out.set(key,list);
  }
  return out;
}

function candidateForMove({
  taskId,
  moving,
  siblings,
  collidingAxes,
  eligibleOfferIds,
  offerMap,
}){
  const siblingDomains=siblings.map(p=>domains(offerMap.get(String(p.offer_id||''))||{}));
  const currentIds=new Set([moving,...siblings].map(p=>String(p.offer_id||'')));
  for(const offerId of eligibleOfferIds){
    if(currentIds.has(String(offerId))) continue;
    const offer=offerMap.get(String(offerId));
    if(!offer) continue;
    const d=domains(offer);
    let ok=true;
    for(const axis of collidingAxes){
      const value=d[axis]||null;
      if(!value){ok=false;break;}
      if(siblingDomains.some(sd=>sd[axis]===value)){ok=false;break;}
    }
    if(ok) return offer;
  }
  return null;
}

export function planFailureDomainRebalance({
  audit,
  fabricPlan,
  offers=[],
  checkpoints={},
}={}){
  if(audit?.schema!=='evercraft.saban.failure-domain-audit.v1'){
    throw new Error('failure_domain_audit_required');
  }
  if(fabricPlan?.schema!=='evercraft.saban.heterogeneous-fabric-plan.v1'){
    throw new Error('failure_domain_rebalance_fabric_plan_required');
  }

  const offerMap=new Map((offers||[])
    .filter(x=>x?.schema==='evercraft.saban.compute-offer.v1')
    .map(x=>[String(x.offer_id||''),x]));
  const placementsByTask=byTaskPlacements(fabricPlan);
  const actions=[];

  for(const taskAudit of audit.tasks||[]){
    const taskId=String(taskAudit.task_id||'');
    const placements=placementsByTask.get(taskId)||[];

    if(taskAudit.state==='evidence_incomplete'){
      actions.push({
        task_id:taskId,
        action:'collect_failure_domain_evidence',
        missing_axes:[...(taskAudit.missing_axes||[])],
        automatic_move_authorized:false,
        reason:'failure_domain_evidence_incomplete',
      });
      continue;
    }

    if(taskAudit.state!=='correlated_failure_risk') continue;

    const collidingAxes=[...(taskAudit.colliding_axes||[])];
    const eligible=Array.isArray(fabricPlan.eligible_offers_by_task?.[taskId])
      ? fabricPlan.eligible_offers_by_task[taskId]
      : [];

    let planned=false;
    for(let i=placements.length-1;i>=0;i--){
      const moving=placements[i];
      const siblings=placements.filter((_,idx)=>idx!==i);
      const candidate=candidateForMove({
        taskId,
        moving,
        siblings,
        collidingAxes,
        eligibleOfferIds:eligible,
        offerMap,
      });
      if(!candidate) continue;

      const checkpoint=checkpoints?.[moving.unit_id]??null;
      if(moving.preemptible===true&&moving.checkpointable===true){
        actions.push({
          task_id:taskId,
          unit_id:moving.unit_id,
          action:'move_replica_to_independent_domain',
          from_offer_id:moving.offer_id,
          to_offer_id:candidate.offer_id,
          from_provider_id:moving.provider_id,
          to_provider_id:candidate.provider_id,
          colliding_axes:collidingAxes,
          checkpoint_required:true,
          checkpoint_present:checkpoint!=null,
          checkpoint:checkpoint??null,
          automatic_execution_authorized:false,
          reason:'eligible_distinct_failure_domain_available',
        });
      }else{
        actions.push({
          task_id:taskId,
          unit_id:moving.unit_id,
          action:'drain_then_rebalance',
          from_offer_id:moving.offer_id,
          to_offer_id:candidate.offer_id,
          colliding_axes:collidingAxes,
          automatic_execution_authorized:false,
          reason:'work_not_safely_preemptible_checkpointable',
        });
      }
      planned=true;
      break;
    }

    if(!planned){
      actions.push({
        task_id:taskId,
        action:'expand_resource_field_for_distinct_failure_domain',
        colliding_axes:collidingAxes,
        required_constraints:Object.fromEntries(collidingAxes.map(axis=>[
          axis,
          {must_not_match_current_replicas:true}
        ])),
        authority_expansion:false,
        paid_capacity_auto_authorized:false,
        reason:'no_current_eligible_distinct_failure_domain',
      });
    }
  }

  const body={
    schema:'evercraft.saban.failure-domain-rebalance-plan.v1',
    action_count:actions.length,
    move_count:actions.filter(x=>x.action==='move_replica_to_independent_domain').length,
    drain_count:actions.filter(x=>x.action==='drain_then_rebalance').length,
    evidence_collection_count:actions.filter(x=>x.action==='collect_failure_domain_evidence').length,
    resource_expansion_count:actions.filter(x=>x.action==='expand_resource_field_for_distinct_failure_domain').length,
    actions,
    policy:{
      audit_never_moves_work_by_itself:true,
      preemptible_moves_require_checkpointable_work:true,
      missing_evidence_never_treated_as_diversity:true,
      resource_expansion_does_not_expand_authority:true,
      paid_capacity_not_auto_authorized:true,
    },
    generated_at:new Date().toISOString(),
  };
  return {...body,receipt_hash:sha(body)};
}
