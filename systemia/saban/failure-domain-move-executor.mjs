import { createHash } from 'node:crypto';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

const EXECUTABLE=new Set([
  'move_replica_to_independent_domain',
  'drain_then_rebalance',
]);

function actionId(action={}){
  return 'fdmove:'+createHash('sha256').update([
    action.task_id||'',
    action.unit_id||'',
    action.action||'',
    action.from_offer_id||'',
    action.to_offer_id||'',
  ].join('|')).digest('hex').slice(0,24);
}

function bindingFor(bindings,unitId){
  if(bindings instanceof Map) return bindings.get(unitId)||null;
  return bindings?.[unitId]||null;
}

function authorityDecision(authority,action,nowMs){
  if(!EXECUTABLE.has(String(action?.action||''))){
    return {ok:false,reason:'rebalance_action_not_executable'};
  }
  if(!authority||typeof authority!=='object'){
    return {ok:false,reason:'rebalance_move_authority_missing'};
  }
  if(authority.schema!=='evercraft.saban.failure-domain-move-authority.v1'){
    return {ok:false,reason:'rebalance_move_authority_schema_invalid'};
  }
  if(authority.approved!==true){
    return {ok:false,reason:'rebalance_move_authority_not_approved'};
  }
  const expires=Date.parse(String(authority.expires_at||''));
  if(Number.isFinite(expires)&&nowMs>=expires){
    return {ok:false,reason:'rebalance_move_authority_expired'};
  }
  const allowedActions=new Set((authority.allowed_actions||[]).map(String));
  if(allowedActions.size&&!allowedActions.has(String(action.action))){
    return {ok:false,reason:'rebalance_move_action_not_allowed'};
  }
  const allowedUnits=new Set((authority.allowed_unit_ids||[]).map(String));
  if(allowedUnits.size&&!allowedUnits.has(String(action.unit_id||''))){
    return {ok:false,reason:'rebalance_move_unit_not_allowed'};
  }
  return {ok:true,reason:'authorized'};
}

export async function executeFailureDomainRebalance({
  plan,
  authority=null,
  bindings={},
  completedActionIds=[],
  now=new Date(),
}={}){
  if(plan?.schema!=='evercraft.saban.failure-domain-rebalance-plan.v1'){
    throw new Error('failure_domain_rebalance_plan_required');
  }
  const nowDate=now instanceof Date?now:new Date(now);
  const nowMs=nowDate.getTime();
  if(!Number.isFinite(nowMs)) throw new Error('failure_domain_move_now_invalid');

  const completed=new Set((completedActionIds||[]).map(String));
  const results=[];
  let reconciliationRequired=false;

  for(const action of plan.actions||[]){
    const id=actionId(action);

    if(!EXECUTABLE.has(String(action.action||''))){
      results.push({
        action_id:id,
        task_id:action.task_id||null,
        unit_id:action.unit_id||null,
        action:action.action||null,
        state:'advisory_only',
        reason:
          action.action==='collect_failure_domain_evidence'
            ? 'collect_evidence_before_move'
            : action.action==='expand_resource_field_for_distinct_failure_domain'
              ? 'resource_field_expansion_required'
              : 'non_executable_rebalance_action',
      });
      continue;
    }

    if(completed.has(id)){
      results.push({
        action_id:id,
        task_id:action.task_id||null,
        unit_id:action.unit_id||null,
        action:action.action,
        state:'already_completed',
        reason:'prior_move_receipt_present',
      });
      continue;
    }

    if(
      action.action==='move_replica_to_independent_domain' &&
      action.checkpoint_required===true &&
      action.checkpoint_present!==true
    ){
      results.push({
        action_id:id,
        task_id:action.task_id||null,
        unit_id:action.unit_id||null,
        action:action.action,
        state:'held',
        reason:'required_checkpoint_missing',
      });
      continue;
    }

    const gate=authorityDecision(authority,action,nowMs);
    if(!gate.ok){
      results.push({
        action_id:id,
        task_id:action.task_id||null,
        unit_id:action.unit_id||null,
        action:action.action,
        state:'held',
        reason:gate.reason,
      });
      continue;
    }

    const binding=bindingFor(bindings,String(action.unit_id||''));
    if(!binding){
      results.push({
        action_id:id,
        task_id:action.task_id||null,
        unit_id:action.unit_id||null,
        action:action.action,
        state:'held',
        reason:'fabric_move_binding_missing',
      });
      continue;
    }

    try{
      let execution=null;
      if(action.action==='move_replica_to_independent_domain'){
        if(typeof binding.move!=='function'){
          throw new Error('fabric_move_boundary_missing');
        }
        execution=await binding.move({
          action,
          checkpoint:action.checkpoint??null,
          authority,
        });
      }else{
        if(typeof binding.drain!=='function'){
          throw new Error('fabric_drain_boundary_missing');
        }
        execution=await binding.drain({action,authority});
      }

      const receiptBody={
        schema:'evercraft.saban.failure-domain-move-receipt.v1',
        action_id:id,
        task_id:action.task_id||null,
        unit_id:action.unit_id||null,
        action:action.action,
        from_offer_id:action.from_offer_id||null,
        to_offer_id:action.to_offer_id||null,
        plan_receipt:plan.receipt_hash||null,
        authority_ref:authority.authority_id||null,
        fabric_receipt:
          execution?.receipt_hash||
          execution?.receipt||
          execution?.id||
          null,
        completed_at:nowDate.toISOString(),
      };
      const receipt={...receiptBody,receipt_hash:sha(receiptBody)};
      completed.add(id);
      results.push({
        action_id:id,
        task_id:action.task_id||null,
        unit_id:action.unit_id||null,
        action:action.action,
        state:'completed',
        reason:'failure_domain_rebalance_executed',
        receipt:receipt.receipt_hash,
      });
    }catch(error){
      results.push({
        action_id:id,
        task_id:action.task_id||null,
        unit_id:action.unit_id||null,
        action:action.action,
        state:'uncertain',
        reason:String(error?.message||error),
        reconciliation_required:true,
      });
      reconciliationRequired=true;
      break;
    }
  }

  const body={
    schema:'evercraft.saban.failure-domain-move-run.v1',
    plan_receipt:plan.receipt_hash||null,
    considered:results.length,
    completed_count:results.filter(x=>x.state==='completed').length,
    held_count:results.filter(x=>x.state==='held').length,
    advisory_count:results.filter(x=>x.state==='advisory_only').length,
    already_completed_count:results.filter(x=>x.state==='already_completed').length,
    uncertain_count:results.filter(x=>x.state==='uncertain').length,
    reconciliation_required:reconciliationRequired,
    completed_action_ids:[...completed].sort(),
    results,
    automatic_authority_expansion:false,
    paid_capacity_acquisition_authorized:false,
    arbitrary_code_execution:false,
    executed_at:nowDate.toISOString(),
  };
  return {...body,receipt_hash:sha(body)};
}
