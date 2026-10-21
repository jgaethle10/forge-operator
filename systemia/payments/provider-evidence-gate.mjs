// Provider-neutral, read-only reconciliation recommendation.
// Only a Raven Nexus server-side adapter may execute an authoritative provider
// verification. This module cannot authenticate webhooks or move money.
const exact=(x)=>typeof x==='string'&&x.trim().length>0&&x===x.trim();
const money=(x)=>Number.isSafeInteger(x)&&x>0;
const iso=(x)=>typeof x==='string'&&Number.isFinite(Date.parse(x));
const types=new Set(['verified_webhook','provider_refetch']);
export async function evaluateProviderPaymentEvidence({
 order,claimed_event,verify_with_raven,previously_recorded_event_ids=[],
}={}){
 const base={
  schema:'evercraft.payments.provider-evidence-gate.v1',
  decision:'HOLD',payment_record_updated:false,entitlement_granted:false,
  fulfillment_dispatched:false,payout_settled:false,money_moved:false,
  invoice_sent:false,external_action_taken:false,verification_performed:false,
  evidence_state:'unverified',reasons:[],
 };
 if(!order||!claimed_event) return {...base,reasons:['missing_order_or_evidence']};
 if(order.synthetic===true||claimed_event.synthetic===true)
  return {...base,reasons:['synthetic_evidence_cannot_unlock_paid_state']};
 if(order.buyer_confirmed!==true)
  return {...base,reasons:['buyer_consent_missing']};
 for(const key of ['order_key','offer_key','merchant_id']){
  if(!exact(order[key])||!exact(claimed_event[key])||order[key]!==claimed_event[key])
   return {...base,reasons:['identity_mismatch_'+key]};
 }
 if(!money(order.amount_cents)||order.amount_cents!==claimed_event.amount_cents)
  return {...base,reasons:['amount_mismatch']};
 if(!exact(order.currency)||order.currency.toLowerCase()!==String(claimed_event.currency||'').toLowerCase())
  return {...base,reasons:['currency_mismatch']};
 if(!exact(claimed_event.provider_id)||!exact(claimed_event.provider_event_id)||
    !exact(claimed_event.session_id)||!types.has(claimed_event.verification_path))
  return {...base,reasons:['missing_provider_event_identity_or_path']};
 if(!['pending','checkout_prepared','awaiting_payment'].includes(order.state))
  return {...base,reasons:['order_not_in_payable_state']};
 if(!Array.isArray(previously_recorded_event_ids))
  return {...base,reasons:['invalid_event_dedupe_input']};
 if(previously_recorded_event_ids.includes(claimed_event.provider_event_id))
  return {...base,reasons:['duplicate_provider_event']};
 if(typeof verify_with_raven!=='function')
  return {...base,reasons:['server_side_raven_verification_unavailable']};
 let verified;
 try {
  // The untrusted caller cannot furnish verification authority in the event itself.
  verified=await verify_with_raven({
   provider_id:claimed_event.provider_id,
   provider_event_id:claimed_event.provider_event_id,
   session_id:claimed_event.session_id,
   verification_path:claimed_event.verification_path,
  });
 }catch{
  return {...base,verification_performed:true,reasons:['provider_verification_error']};
 }
 const checked={...base,verification_performed:true};
 if(verified?.verified!==true||verified.source!=='raven_nexus'||
    !exact(verified.evidence_ref)||!iso(verified.verified_at)||
    !exact(verified.provider_event_id)||!exact(verified.session_id)||
    !exact(verified.provider_id)||!exact(verified.order_key)||
    !exact(verified.offer_key)||!exact(verified.merchant_id)||
    !money(verified.amount_cents)||!exact(verified.currency))
  return {...checked,reasons:['raven_verification_not_authoritative']};
 const keys=['provider_id','provider_event_id','session_id','order_key','offer_key','merchant_id','amount_cents'];
 for(const k of keys){
  const want=k==='order_key'||k==='offer_key'||k==='merchant_id'||k==='amount_cents'?order[k]:claimed_event[k];
  if(verified[k]!==want) return {...checked,reasons:['verified_'+k+'_mismatch']};
 }
 if(verified.currency.toLowerCase()!==order.currency.toLowerCase())
  return {...checked,reasons:['verified_currency_mismatch']};
 if(verified.payment_status!=='paid')
  return {...checked,evidence_state:verified.payment_status==='refunded'?'reversed':'not_paid',reasons:['provider_payment_not_paid']};
 if(verified.disputed===true||verified.reversed===true||verified.refunded===true)
  return {...checked,evidence_state:'reversed_or_disputed',reasons:['reversal_or_dispute']};
 return {
  ...checked,decision:'CANDIDATE_FOR_CANONICAL_ORDER_RECONCILIATION',
  evidence_state:'raven_provider_paid_verified',
  order_key:order.order_key,provider_id:verified.provider_id,
  provider_event_id:verified.provider_event_id,
  verification_evidence_ref:verified.evidence_ref,
  verified_at:verified.verified_at,
  reasons:[],notice:'Server-side Raven Nexus verification must be audited and authenticated outside this pure module. This advisory result never changes Evercraft PaymentOrder, releases fulfillment or proves provider payout settlement.',
 };
}
