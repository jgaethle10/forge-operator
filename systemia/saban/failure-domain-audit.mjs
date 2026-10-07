import { createHash } from 'node:crypto';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

const AXES=[
  'failure_domain',
  'site_id',
  'network_id',
  'power_domain',
  'provider_account',
];

function offerDomains(offer={}){
  const meta=offer.metadata||{};
  const explicit=meta.failure_domains&&typeof meta.failure_domains==='object'
    ? Object.fromEntries(
        Object.entries(meta.failure_domains)
          .map(([k,v])=>[
            String(k).trim().toLowerCase(),
            String(v??'').trim().toLowerCase(),
          ])
          .filter(([k,v])=>k&&v)
      )
    : {};
  return {
    failure_domain:String(
      explicit.failure_domain||
      meta.failure_domain||
      meta.gateway_identity||
      offer.provider_id||
      ''
    ).trim().toLowerCase()||null,
    site_id:String(
      explicit.site_id||
      meta.site_id||
      meta.location_id||
      ''
    ).trim().toLowerCase()||null,
    network_id:String(
      explicit.network_id||
      meta.network_id||
      meta.isp_id||
      ''
    ).trim().toLowerCase()||null,
    power_domain:String(
      explicit.power_domain||
      meta.power_domain||
      meta.power_source_id||
      ''
    ).trim().toLowerCase()||null,
    provider_account:String(
      explicit.provider_account||
      meta.provider_account||
      meta.account_id||
      meta.billing_account||
      ''
    ).trim().toLowerCase()||null,
  };
}

function groupPlacements(plan){
  const groups=new Map();
  for(const row of plan?.placements||[]){
    const task=String(row.task_id||'');
    if(!task) continue;
    const list=groups.get(task)||[];
    list.push(row);
    groups.set(task,list);
  }
  return groups;
}

export function auditFailureDomains({
  offers=[],
  fabricPlan,
  requiredAxes=AXES,
}={}){
  if(fabricPlan?.schema!=='evercraft.saban.heterogeneous-fabric-plan.v1'){
    throw new Error('failure_domain_audit_fabric_plan_required');
  }
  const axes=[...new Set((requiredAxes||AXES).map(x=>String(x).trim().toLowerCase()).filter(Boolean))];
  const byOffer=new Map((offers||[])
    .filter(x=>x?.schema==='evercraft.saban.compute-offer.v1')
    .map(x=>[String(x.offer_id||''),x])
  );
  const tasks=[];

  for(const [taskId,placements] of groupPlacements(fabricPlan)){
    const replicas=placements.length;
    const axisResults=[];
    for(const axis of axes){
      const values=[];
      let missing=0;
      for(const placement of placements){
        const offer=byOffer.get(String(placement.offer_id||''))||null;
        const value=offer?offerDomains(offer)[axis]||null:null;
        if(value) values.push(value);
        else missing+=1;
      }
      const distinct=[...new Set(values)];
      const collisionCount=Math.max(0,values.length-distinct.length);
      axisResults.push({
        axis,
        placement_count:replicas,
        observed_count:values.length,
        missing_count:missing,
        distinct_count:distinct.length,
        collision_count:collisionCount,
        values:distinct,
        sufficient_for_replica_independence:
          replicas<=1
            ? true
            : missing===0&&distinct.length===replicas,
      });
    }

    const missingAxes=axisResults.filter(x=>x.missing_count>0).map(x=>x.axis);
    const collidingAxes=axisResults.filter(x=>
      replicas>1 &&
      x.missing_count===0 &&
      x.distinct_count<replicas
    ).map(x=>x.axis);
    const independentAxes=axisResults.filter(x=>x.sufficient_for_replica_independence).map(x=>x.axis);

    tasks.push({
      task_id:taskId,
      placement_count:replicas,
      replicated:replicas>1,
      missing_axes:missingAxes,
      colliding_axes:collidingAxes,
      independent_axes:independentAxes,
      axis_results:axisResults,
      state:
        replicas<=1
          ? 'single_placement'
          : missingAxes.length
            ? 'evidence_incomplete'
            : collidingAxes.length
              ? 'correlated_failure_risk'
              : 'independent',
      next_actions:[
        ...(missingAxes.length
          ? ['collect_missing_failure_domain_evidence']
          : []),
        ...(collidingAxes.length
          ? ['replan_across_distinct_failure_domains']
          : []),
      ],
    });
  }

  const replicated=tasks.filter(x=>x.replicated);
  const body={
    schema:'evercraft.saban.failure-domain-audit.v1',
    task_count:tasks.length,
    replicated_task_count:replicated.length,
    independent_replicated_task_count:replicated.filter(x=>x.state==='independent').length,
    evidence_incomplete_task_count:replicated.filter(x=>x.state==='evidence_incomplete').length,
    correlated_failure_risk_task_count:replicated.filter(x=>x.state==='correlated_failure_risk').length,
    tasks,
    required_axes:axes,
    policy:{
      replica_count_is_not_resilience:true,
      missing_evidence_is_not_independence:true,
      provider_id_only_does_not_prove_site_network_or_power_diversity:true,
      account_concentration_is_a_failure_domain:true,
      no_authority_expansion:true,
    },
    generated_at:new Date().toISOString(),
  };
  return {...body,receipt_hash:sha(body)};
}
