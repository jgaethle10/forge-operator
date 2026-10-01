import { createHash } from 'node:crypto';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

function byUnit(plan){
  return new Map((plan?.placements||[]).map(p=>[p.unit_id,p]));
}

export function planFabricRebalance({
  previousPlan=null,
  nextPlan,
  checkpoints={},
  now=new Date(),
  minimumMoveScoreDelta=300,
}={}){
  if(nextPlan?.schema!=='evercraft.saban.heterogeneous-fabric-plan.v1'){
    throw new Error('next_heterogeneous_fabric_plan_required');
  }
  if(previousPlan&&previousPlan.schema!=='evercraft.saban.heterogeneous-fabric-plan.v1'){
    throw new Error('previous_heterogeneous_fabric_plan_invalid');
  }

  const before=byUnit(previousPlan);
  const after=byUnit(nextPlan);
  const allUnitIds=[...new Set([...before.keys(),...after.keys()])].sort();
  const actions=[];

  for(const unitId of allUnitIds){
    const oldPlacement=before.get(unitId)||null;
    const newPlacement=after.get(unitId)||null;
    const checkpoint=checkpoints?.[unitId]??null;

    if(!oldPlacement&&newPlacement){
      actions.push({
        action:'start',
        unit_id:unitId,
        to_offer_id:newPlacement.offer_id,
        to_provider_id:newPlacement.provider_id,
        checkpoint:null,
        reason:'new_unit_or_capacity_restored',
      });
      continue;
    }

    if(oldPlacement&&!newPlacement){
      actions.push({
        action:'hold',
        unit_id:unitId,
        from_offer_id:oldPlacement.offer_id,
        from_provider_id:oldPlacement.provider_id,
        checkpoint:checkpoint??null,
        reason:'no_current_eligible_capacity',
      });
      continue;
    }

    if(!oldPlacement||!newPlacement)continue;

    if(oldPlacement.offer_id===newPlacement.offer_id){
      actions.push({
        action:'keep',
        unit_id:unitId,
        offer_id:newPlacement.offer_id,
        provider_id:newPlacement.provider_id,
        reason:'placement_still_preferred',
      });
      continue;
    }

    const oldScore=Number(oldPlacement.effective_score??oldPlacement.score??0);
    const nextScore=Number(newPlacement.effective_score??newPlacement.score??0);
    const delta=nextScore-oldScore;
    const failedOrIneligible=nextPlan.held?.some(h=>h.unit_id===unitId)===true;
    const checkpointable=newPlacement.checkpointable===true||oldPlacement.checkpointable===true;

    if(!failedOrIneligible&&delta<Math.max(0,Number(minimumMoveScoreDelta||0))){
      actions.push({
        action:'keep',
        unit_id:unitId,
        offer_id:oldPlacement.offer_id,
        provider_id:oldPlacement.provider_id,
        reason:'anti_flap_score_delta_below_threshold',
        score_delta:delta,
      });
      continue;
    }

    if(oldPlacement.preemptible!==true&&!failedOrIneligible){
      actions.push({
        action:'keep',
        unit_id:unitId,
        offer_id:oldPlacement.offer_id,
        provider_id:oldPlacement.provider_id,
        reason:'nonpreemptible_work_stays_put',
        score_delta:delta,
      });
      continue;
    }

    if(oldPlacement.preemptible===true&&checkpointable!==true){
      actions.push({
        action:'hold',
        unit_id:unitId,
        from_offer_id:oldPlacement.offer_id,
        to_offer_id:newPlacement.offer_id,
        reason:'preemptible_move_requires_checkpointable_work',
      });
      continue;
    }

    actions.push({
      action:'move',
      unit_id:unitId,
      from_offer_id:oldPlacement.offer_id,
      from_provider_id:oldPlacement.provider_id,
      to_offer_id:newPlacement.offer_id,
      to_provider_id:newPlacement.provider_id,
      checkpoint:checkpoint??null,
      checkpoint_required:oldPlacement.preemptible===true,
      reason:failedOrIneligible?'current_placement_failed_or_ineligible':'materially_better_capacity',
      score_delta:delta,
    });
  }

  const counts=actions.reduce((acc,a)=>{
    acc[a.action]=(acc[a.action]||0)+1;
    return acc;
  },{});

  const body={
    schema:'evercraft.saban.fabric-rebalance-plan.v1',
    state:actions.some(a=>a.action==='hold')?'held_partial':'ready',
    previous_plan_receipt:previousPlan?.receipt_hash||null,
    next_plan_receipt:nextPlan.receipt_hash||null,
    actions,
    counts,
    minimum_move_score_delta:Math.max(0,Number(minimumMoveScoreDelta||0)),
    anti_flap:true,
    checkpoint_preservation:true,
    nonpreemptible_work_never_moved_for_optimization:true,
    generated_at:(now instanceof Date?now:new Date(now)).toISOString(),
  };
  return {...body,receipt_hash:sha(body)};
}
