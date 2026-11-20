import {createHmac,createHash} from 'node:crypto';

// Read-only reconciliation of an authorized PRIVATE Gmail export with existing
// Systemia lead records. Does not fetch mail, create permits, send, or mutate a CRM.
const VALID_MAIL_DIRECTIONS=new Set(['inbound','outbound']);
const VALID_STAGES=new Set(['researched','verified','contact_ready','sent','replied','quoted','accepted','invoiced','paid','fulfilled']);
const BLOCK_STATES=new Set(['opted_out','bounced','blocked','do_not_contact','customer_hold','declined']);
const clean=v=>String(v??'').trim();
function parseTime(value,field){
 const t=Date.parse(clean(value));
 if(!Number.isFinite(t))throw Error(field+'_invalid');
 return t;
}
function canonicalEmail(email){
 const value=clean(email).toLowerCase().replace(/^mailto:/,'');
 if(value.length>254||/\s/.test(value)||! /^[^\s@]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(value))return null;
 return value;
}
function digest(key,value){
 if(typeof key!=='string'||Buffer.byteLength(key)<32)throw Error('private_hmac_key_required');
 return 'hmac256:'+createHmac('sha256',key).update(value).digest('hex');
}
function fingerprint(v){return 'sha256:'+createHash('sha256').update(v).digest('hex');}
function assertArray(v,n){if(!Array.isArray(v))throw Error(n+'_array_required');}
function safeCount(x){return Number.isSafeInteger(x)&&x>=0?x:null;}

/** Canonical private Gmail export rows: {message_id,thread_id,direction,
 * occurred_at,from_address,to_addresses[],is_auto_reply?,is_bounce?}.
 * For Gmail Sent, each record is counted even if it is a reply. Bulk recipients
 * use per-recipient conservative units; never infer deliverability from SENT.
 */
export function reconcileGmailOutreach({
 messages=[],prospects=[],now=new Date().toISOString(),hmacKey,
 historyComplete=false,providerDailyCap=null,coldTarget=400,replyReserve=100,
 minimumCooldownHours=72
}={}){
 assertArray(messages,'messages');assertArray(prospects,'prospects');
 const clock=parseTime(now,'now'),cold=safeCount(coldTarget),reserve=safeCount(replyReserve);
 const cap=safeCount(providerDailyCap);
 if(cold===null||reserve===null||!Number.isSafeInteger(minimumCooldownHours)||minimumCooldownHours<0)
   throw Error('invalid_quota_configuration');
 // Refuse a real quota claim when the Gmail export is incomplete or has
 // unknown recipient counts. Local projections remain shadow-only.
 const seenIds=new Set(),mail=[],invalid=[];
 for(const m of messages){
  const id=clean(m?.message_id),direction=clean(m?.direction);
  if(!id||!VALID_MAIL_DIRECTIONS.has(direction)||!m?.occurred_at){
   invalid.push('missing_email_receipt_fields');continue;
  }
  let t;try{t=parseTime(m.occurred_at,'message_occurred_at');}
  catch{invalid.push('invalid_email_timestamp');continue;}
  if(t>clock+300000){invalid.push('future_email_receipt');continue;}
  if(seenIds.has(id))continue;
  seenIds.add(id);
  const addresses=Array.isArray(m.to_addresses)?m.to_addresses:[];
  const recipients=[...new Set(addresses.map(canonicalEmail).filter(Boolean))];
  if(direction==='outbound'&&recipients.length!==addresses.length){
    invalid.push('unverified_outbound_recipient');continue;
  }
  if(direction==='outbound'&&!recipients.length){
    invalid.push('outbound_recipient_missing');continue;
  }
  const sender=canonicalEmail(m.from_address);
  if(direction==='inbound'&&!sender){
    invalid.push('inbound_sender_missing');continue;
  }
  mail.push({id,thread_id:clean(m.thread_id)||null,direction,time:t,
    recipients,recipient_keys:recipients.map(x=>digest(hmacKey,x)),
    sender_key:sender?digest(hmacKey,sender):null,
    content_ref:clean(m.content_fingerprint)||null,
    is_auto_reply:m.is_auto_reply===true,is_bounce:m.is_bounce===true});
 }
 const trailing=mail.filter(m=>m.direction==='outbound'&&m.time>clock-86400000&&m.time<=clock);
 const sentUnits=trailing.reduce((n,m)=>n+Math.max(1,m.recipients.length),0);
 const actualCap=cap===null?null:cap;
 const usedColdBudget=Math.max(0,Math.min(cold,actualCap===null?cold:actualCap-reserve));
 const coldRemaining=actualCap===null?0:Math.max(0,Math.min(usedColdBudget,actualCap-reserve-sentUnits));
 const providerRemaining=actualCap===null?0:Math.max(0,actualCap-sentUnits);
 const provenComplete=historyComplete===true&&invalid.length===0&&actualCap!==null&&actualCap>=reserve;

 const addressed=new Map();
 for(const m of mail){
  if(m.direction!=='outbound')continue;
  for(const key of m.recipient_keys){
   const prev=addressed.get(key);
   if(!prev||prev.time<m.time)addressed.set(key,m);
  }
 }
 const byThread=new Map();
 for(const m of mail){
  if(!m.thread_id)continue;
  const a=byThread.get(m.thread_id)||[];
  a.push(m);byThread.set(m.thread_id,a);
 }
 const keyedProspects=[],usedKeys=new Set();
 for(const p of prospects){
  const prospectKey=clean(p?.prospect_key);
  const email=canonicalEmail(p?.business_email);
  if(!prospectKey||!email){
    invalid.push('prospect_missing_verified_business_contact');continue;
  }
  const emailKey=digest(hmacKey,email);
  const composite=prospectKey+'|'+emailKey;
  if(usedKeys.has(composite))continue;
  usedKeys.add(composite);
  const latest=addressed.get(emailKey)||null;
  const status=BLOCK_STATES.has(p.contact_state)?p.contact_state:clean(p.contact_state)||'unknown';
  const stage=VALID_STAGES.has(p.stage)?p.stage:'researched';
  const inbound=mail.filter(m=>m.direction==='inbound'&&m.sender_key===emailKey&&!m.is_auto_reply&&!m.is_bounce);
  const latestBuyerReply=inbound.sort((a,b)=>b.time-a.time)[0]||null;
  const cooldown=Boolean(latest&&clock-latest.time<3600000*minimumCooldownHours);
  const priorContact=Boolean(latest);
  const suppressed=BLOCK_STATES.has(status)||p.opted_out===true;
  const reasons=[];
  if(suppressed)reasons.push('suppressed_or_customer_hold');
  if(priorContact)reasons.push('prior_contact_reconcile_before_new_outreach');
  if(cooldown)reasons.push('cooldown_active');
  if(p.unfulfilled_commitment===true)reasons.push('complete_customer_commitment_first');
  if(!provenComplete)reasons.push('quota_or_receipt_coverage_unverified');
  if(provenComplete&&coldRemaining<1)reasons.push('cold_outreach_quota_exhausted');
  if(!clean(p.source_ref)||!clean(p.pain_evidence_ref))reasons.push('insufficient_buying_signal_evidence');
  if(p.official_contact_verified!==true)reasons.push('contact_not_first_party_verified');
  if(p.provider_status_verified!==true)reasons.push('sender_account_not_verified');
  if(p.legal_requirements_verified!==true)reasons.push('legal_requirements_not_verified');
  if(p.delivery_scope_verified!==true)reasons.push('fulfillment_not_verified');
  if(p.passport_exact_message_permit_verified!==true)reasons.push('passport_permit_missing');
  // A permit record in source data is NOT a live Passport execution permit.
  keyedProspects.push({
    prospect_key:prospectKey,contact_ref:emailKey,source_ref_hash:clean(p.source_ref)?digest(hmacKey,clean(p.source_ref)):null,
    stage:latestBuyerReply?'replied':priorContact?'sent':stage,
    last_contact_ref:latest?'gmail:'+latest.id:null,
    last_contact_at:latest?new Date(latest.time).toISOString():null,
    latest_inbound_ref:latestBuyerReply?'gmail:'+latestBuyerReply.id:null,
    last_reply_at:latestBuyerReply?new Date(latestBuyerReply.time).toISOString():null,
    prior_contact:priorContact,contact_state:status,
    actionable_as_new_cold_target:reasons.length===0,
    reasons,send_authorized:false
  });
 }
 const inboxBuyerReplies=mail.filter(m=>m.direction==='inbound'&&!m.is_auto_reply&&!m.is_bounce).length;
 return {
  schema:'evercraft.systemia.gmail-reconciliation.v1',generated_at:now,
  record_coverage:{complete:historyComplete===true,valid:mail.length,invalid:invalid.length,
    invalid_reasons:[...new Set(invalid)]},
  quota:{provider_daily_cap:actualCap,rolling_24h_units:sentUnits,
    reply_reserve:reserve,cold_target:cold,cold_budget_remaining:provenComplete?coldRemaining:null,
    provider_units_remaining:provenComplete?providerRemaining:null,
    quota_verified:provenComplete,allow_unattended_sending:false},
  funnel:{research_candidates:prospects.length,matched_contact_rows:keyedProspects.length,
    verified_contact_rows:keyedProspects.filter(p=>p.reasons.every(x=>x!=='contact_not_first_party_verified')).length,
    outbound_messages:mail.filter(m=>m.direction==='outbound').length,
    inbound_non_auto_messages:inboxBuyerReplies,
    newly_paid_orders_verified:0},
  prospects:keyedProspects,
  private_identifiers_exported:false,private_body_exported:false,
  provider_delivery_verified:false,customer_acceptance_verified:false,paid_revenue_verified:false,
  advisory_only:true,send_performed:false
 };
}

/** A separate, runtime-only readiness check for an exact message.
 * It does not replace the live Interaction Ledger/Passport/provider checks.
 */
export function checkOutboundCandidate({
 row,quota,sender={},message='',opportunity={},now=new Date().toISOString()
}={}){
 const reasons=[];
 if(!row||!quota?.quota_verified)reasons.push('gmail_quota_not_authoritatively_verified');
 if(!row?.actionable_as_new_cold_target)reasons.push(...(row?.reasons||['candidate_not_contact_ready']));
 if(!clean(message)||message.length<80)reasons.push('individual_message_required');
 if(!clean(opportunity.buyer_specific_opening))reasons.push('buyer_specific_opening_required');
 if(!clean(opportunity.fixed_scope_deliverables)||!clean(opportunity.verified_offer_ref))reasons.push('scope_and_proof_missing');
 if(sender.spf_dkim_dmarc_verified!==true)reasons.push('sender_authentication_unverified');
 if(sender.postal_address_verified!==true||!clean(sender.postal_address))
   reasons.push('valid_postal_address_missing');
 if(sender.opt_out_functional_verified!==true||!clean(sender.opt_out_instructions))
   reasons.push('working_opt_out_missing');
 if(sender.suppression_current!==true)reasons.push('suppression_sync_missing');
 if(sender.bounce_health_verified!==true)reasons.push('deliverability_health_unverified');
 if(sender.hourly_owner_signoff!==true)reasons.push('recent_owner_quality_gate_missing');
 if(!Number.isFinite(Date.parse(now)))reasons.push('invalid_evaluation_time');
 return {
  decision:reasons.length?'hold':'candidate_passed_non_authoritative_preflight',
  reasons:[...new Set(reasons)],
  must_recheck_passport_ledger_and_gmail_before_send:true,
  ready_to_send:false,send_performed:false,
  message_sha256:clean(message)?fingerprint(message):null
 };
}
