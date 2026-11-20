import {createHash} from 'node:crypto';

// Read-only exact-account Stripe Payment Link destination audit.
// No checkout, charges, link updates or fulfillment authorization.
const RETIRED_HOST=/(^|\.)base44\.(app|com|ai)$/i;
const validId=v=>typeof v==='string'&&/^plink_[A-Za-z0-9]+$/.test(v);
const validAccount=v=>typeof v==='string'&&/^acct_[A-Za-z0-9]+$/.test(v);
const hash=v=>'sha256:'+createHash('sha256').update(v).digest('hex').slice(0,24);
function validURL(url){
 try{
  const p=new URL(url);
  return p.protocol==='https:'&&!p.username&&!p.password?p:null;
 }catch{return null;}
}
function retiredAnywhere(value){
 let current=String(value||'');
 for(let i=0;i<3;i++){
  if(/base44\.(?:app|com|ai)|base44%2e(?:app|com|ai)/i.test(current))return true;
  try{
   const next=decodeURIComponent(current);
   if(next===current)break;
   current=next;
  }catch{break;}
 }
 return false;
}
export function auditPaymentLinkDestinations({
 accountId,approvedAccountId,links,hasMore,knownOwnedRedirects=[]
}={}){
 if(!validAccount(accountId)||accountId!==approvedAccountId)
  throw Error('stripe_merchant_account_identity_unverified');
 if(!Array.isArray(links)||hasMore!==false)
  throw Error('stripe_payment_link_list_incomplete');
 if(!Array.isArray(knownOwnedRedirects))
  throw Error('owned_redirect_attestations_invalid');
 for(const url of knownOwnedRedirects){
  const p=validURL(url);
  if(!p||RETIRED_HOST.test(p.hostname)||retiredAnywhere(url)||
     url!==p.origin+p.pathname)throw Error('invalid_owned_redirect_attestation');
 }
 const seen=new Set(),findings=[];
 let active=0,inactive=0,hosted=0,retired=0,unknown=0;
 for(const link of links){
  if(!validId(link?.id)||typeof link.active!=='boolean'||seen.has(link.id))
   throw Error('stripe_payment_link_record_invalid');
  seen.add(link.id);
  if(!link.active){inactive++;continue;}
  active++;
  let state,reason;
  const after=link.after_completion;
  if(after?.type==='hosted_confirmation'){
   state='provider_hosted_confirmation';
   reason='post_payment_fulfillment_still_unverified';
   hosted++;
  }else if(after?.type==='redirect'){
   const url=after.redirect?.url;
   const p=validURL(url);
   if(!p){
    state='hold_invalid_redirect';reason='invalid_or_non_https_redirect';unknown++;
   }else if(RETIRED_HOST.test(p.hostname)||retiredAnywhere(url)){
    state='hold_retired_runtime_redirect';reason='retired_base44_destination';retired++;
   }else if(!knownOwnedRedirects.includes(p.origin+p.pathname)){
    state='hold_unattested_success_redirect';reason='redirect_not_exactly_owner_attested';unknown++;
   }else{
    state='owned_destination_attested';
    reason='destination_attested_not_fulfillment_verified';
   }
  }else{
   state='hold_unknown_completion_type';
   reason='provider_completion_contract_unrecognized';unknown++;
  }
  findings.push({
   link_ref:hash(link.id),state,reason,
   send_to_customer_authorized:false,fulfillment_verified:false,
   payment_received_verified:false,
   action:state.startsWith('hold_')?'owner_review_disable_or_migrate':'verify_order_and_fulfillment'
  });
 }
 const held=findings.filter(x=>x.state.startsWith('hold_')).length;
 return {
  schema:'evercraft.payments.destination-preflight.v1',
  provider_records_complete:true,account_identity_verified:true,
  active,inactive,hosted_confirmation:hosted,
  retired_runtime_redirects:retired,other_unattested_holds:unknown,
  held_count:held,findings,
  raw_link_ids_exported:false,redirect_urls_exported:false,
  checkout_created:false,charge_attempted:false,received_payment_verified:false,
  fulfillment_verified:false,provider_mutations:0,
  status:held?'owner_action_required':'no_destination_holds_in_provider_snapshot',
  caveat:'No destination hold is not proof of payment, fulfillment, deployment, tax, legal or sale readiness.'
 };
}
