import { createHash } from 'node:crypto';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

const ACTIONS=new Set([
  'release_paid_lease',
  'relinquish_voluntary_capacity',
  'stop_spawned_owned_capacity',
]);

function authorityDecision(authority,entry,nowMs){
  const action=String(entry?.recommended_action||'');
  if(!ACTIONS.has(action)) return {ok:false,reason:'action_not_executable'};
  if(!authority||typeof authority!=='object'){
    return {ok:false,reason:'reclamation_authority_missing'};
  }
  if(authority.schema!=='evercraft.saban.capacity-reclamation-authority.v1'){
    return {ok:false,reason:'reclamation_authority_schema_invalid'};
  }
  if(authority.approved!==true){
    return {ok:false,reason:'reclamation_authority_not_approved'};
  }
  const expires=Date.parse(String(authority.expires_at||''));
  if(Number.isFinite(expires)&&nowMs>=expires){
    return {ok:false,reason:'reclamation_authority_expired'};
  }
  const actions=new Set((authority.allowed_actions||[]).map(String));
  if(actions.size&&!actions.has(action)){
    return {ok:false,reason:'reclamation_action_not_allowed'};
  }
  const offers=new Set((authority.allowed_offer_ids||[]).map(String));
  if(offers.size&&!offers.has(String(entry.offer_id||''))){
    return {ok:false,reason:'reclamation_offer_not_allowed'};
  }
  return {ok:true,reason:'authorized'};
}

function bindingFor(bindings,offerId){
  if(bindings instanceof Map) return bindings.get(offerId)||null;
  return bindings?.[offerId]||null;
}

function publicResult(row={}){
  return {
    offer_id:row.offer_id||null,
    provider_id:row.provider_id||null,
    action:row.action||null,
    state:row.state||null,
    reason:row.reason||null,
    receipt:row.receipt||null,
    reconciliation_required:row.reconciliation_required===true,
  };
}

export async function executeCapacityReclamation({
  lifecycleLedger,
  authority=null,
  bindings={},
  completedOfferIds=[],
  now=new Date(),
}={}){
  if(lifecycleLedger?.schema!=='evercraft.saban.capacity-lifecycle-ledger.v1'){
    throw new Error('capacity_lifecycle_ledger_required');
  }
  const nowDate=now instanceof Date?now:new Date(now);
  const nowMs=nowDate.getTime();
  if(!Number.isFinite(nowMs)) throw new Error('capacity_reclamation_now_invalid');

  const completed=new Set((completedOfferIds||[]).map(String));
  const results=[];
  let reconciliationRequired=false;

  for(const entry of lifecycleLedger.entries||[]){
    if(entry?.reclaim_eligible!==true) continue;
    const action=String(entry.recommended_action||'');

    if(action==='reconcile_paid_lease_before_release'){
      results.push({
        offer_id:entry.offer_id,
        provider_id:entry.provider_id,
        action,
        state:'held',
        reason:entry.hold_reason||'lease_state_uncertain',
        reconciliation_required:true,
      });
      reconciliationRequired=true;
      continue;
    }

    if(['hold_paid_capacity_release','hold_idle_capacity'].includes(action)){
      results.push({
        offer_id:entry.offer_id,
        provider_id:entry.provider_id,
        action,
        state:'held',
        reason:entry.hold_reason||'lifecycle_reclamation_hold',
      });
      continue;
    }

    if(action==='cool_down_owned_capacity'){
      results.push({
        offer_id:entry.offer_id,
        provider_id:entry.provider_id,
        action,
        state:'advisory_only',
        reason:'ordinary_owned_capacity_not_powered_off_automatically',
      });
      continue;
    }

    if(!ACTIONS.has(action)){
      results.push({
        offer_id:entry.offer_id,
        provider_id:entry.provider_id,
        action,
        state:'held',
        reason:'reclamation_action_not_supported',
      });
      continue;
    }

    if(completed.has(String(entry.offer_id||''))){
      results.push({
        offer_id:entry.offer_id,
        provider_id:entry.provider_id,
        action,
        state:'already_completed',
        reason:'prior_reclamation_receipt_present',
      });
      continue;
    }

    if(entry.reclamation_execution_ready===false){
      results.push({
        offer_id:entry.offer_id,
        provider_id:entry.provider_id,
        action,
        state:'held',
        reason:'lifecycle_action_not_execution_ready',
      });
      continue;
    }

    const gate=authorityDecision(authority,entry,nowMs);
    if(!gate.ok){
      results.push({
        offer_id:entry.offer_id,
        provider_id:entry.provider_id,
        action,
        state:'held',
        reason:gate.reason,
      });
      continue;
    }

    const binding=bindingFor(bindings,String(entry.offer_id||''));
    if(!binding){
      results.push({
        offer_id:entry.offer_id,
        provider_id:entry.provider_id,
        action,
        state:'held',
        reason:'reclamation_binding_missing',
      });
      continue;
    }

    if(action==='stop_spawned_owned_capacity'&&binding.spawned_owned!==true){
      results.push({
        offer_id:entry.offer_id,
        provider_id:entry.provider_id,
        action,
        state:'held',
        reason:'spawned_owned_provenance_required',
      });
      continue;
    }

    try{
      let released=null;
      if(action==='stop_spawned_owned_capacity'){
        if(typeof binding.stop!=='function'){
          throw new Error('spawned_owned_stop_boundary_missing');
        }
        released=await binding.stop({entry,authority});
      }else{
        if(typeof binding.adapter?.release!=='function'){
          throw new Error('market_release_boundary_missing');
        }
        if(!binding.lease){
          throw new Error('market_release_lease_missing');
        }
        released=await binding.adapter.release({
          lease:binding.lease,
          authority,
        });
      }

      const receiptBody={
        schema:'evercraft.saban.capacity-reclamation-receipt.v1',
        offer_id:String(entry.offer_id),
        provider_id:String(entry.provider_id||''),
        action,
        lifecycle_receipt:lifecycleLedger.receipt_hash||null,
        authority_ref:authority.authority_id||null,
        provider_receipt:
          released?.receipt_hash||
          released?.receipt||
          released?.id||
          null,
        completed_at:nowDate.toISOString(),
      };
      const receipt={...receiptBody,receipt_hash:sha(receiptBody)};
      completed.add(String(entry.offer_id));
      results.push({
        offer_id:entry.offer_id,
        provider_id:entry.provider_id,
        action,
        state:'completed',
        reason:'reclamation_executed',
        receipt:receipt.receipt_hash,
      });
    }catch(error){
      results.push({
        offer_id:entry.offer_id,
        provider_id:entry.provider_id,
        action,
        state:'uncertain',
        reason:String(error?.message||error),
        reconciliation_required:true,
      });
      reconciliationRequired=true;
      break;
    }
  }

  const body={
    schema:'evercraft.saban.capacity-reclamation-run.v1',
    lifecycle_receipt:lifecycleLedger.receipt_hash||null,
    considered:results.length,
    completed_count:results.filter(x=>x.state==='completed').length,
    held_count:results.filter(x=>x.state==='held').length,
    advisory_count:results.filter(x=>x.state==='advisory_only').length,
    already_completed_count:results.filter(x=>x.state==='already_completed').length,
    uncertain_count:results.filter(x=>x.state==='uncertain').length,
    reconciliation_required:reconciliationRequired,
    lifecycle_execution_readiness_enforced:true,
    lifecycle_hold_reasons_preserved:true,
    results:results.map(publicResult),
    completed_offer_ids:[...completed].sort(),
    ordinary_owned_shutdown_authorized:false,
    paid_capacity_acquisition_authorized:false,
    secrets_serialized:false,
    executed_at:nowDate.toISOString(),
  };
  return {...body,receipt_hash:sha(body)};
}
