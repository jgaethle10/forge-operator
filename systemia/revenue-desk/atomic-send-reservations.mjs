import fs from 'node:fs';
import path from 'node:path';
import { createHmac, createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import { EvercraftInteractionLedger } from '../interaction-ledger/ledger.mjs';
import { checkOutboundCandidate } from './gmail-reconciliation.mjs';

// Owned PRIVATE single-filesystem reservation gate. No Gmail send action.
// Multiple agents must share exactly one stateDir and Passport/Interaction Ledger.
const OPAQUE=/^hmac256:[0-9a-f]{64}$/;
const MAX_SNAPSHOT_AGE_MS=5*60_000;
const DAY_MS=24*60*60_000;
const clean=v=>String(v??'').trim();
const sha=v=>'sha256:'+createHash('sha256').update(v).digest('hex');
function privateDir(dir){
 if(!dir||!path.isAbsolute(dir))throw Error('shared_absolute_private_state_dir_required');
 const segments=path.resolve(dir).split(path.sep).filter(Boolean);
 let current=path.parse(path.resolve(dir)).root;
 for(const segment of segments){
  current=path.join(current,segment);
  if(fs.existsSync(current)){
   const st=fs.lstatSync(current);
   if(st.isSymbolicLink())throw Error('symlink_in_private_path');
  }
 }
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const st=fs.lstatSync(dir);
 if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0)
  throw Error('private_reservation_directory_permissions_invalid');
 return dir;
}
function readRecords(dir){
 const file=path.join(dir,'reservation-events.jsonl');
 if(!fs.existsSync(file))return [];
 const st=fs.lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0)
  throw Error('unsafe_reservation_ledger');
 return fs.readFileSync(file,'utf8').split('\n').filter(Boolean).map(line=>{
  const r=JSON.parse(line);
  // A tampered, truncated or partially upgraded row must never undercount
  // the shared 24-hour quota. Until provider finalization is implemented,
  // the only valid persisted event is an unconfirmed, single-recipient hold.
  if(r.schema!=='evercraft.systemia.outreach-reservation.v1'||
    !OPAQUE.test(r.contact_ref)||!OPAQUE.test(r.opportunity_ref)||
    typeof r.reservation_id!=='string'||!/^outreach_[0-9a-f-]{36}$/i.test(r.reservation_id)||
    typeof r.reserved_at!=='string'||!Number.isFinite(Date.parse(r.reserved_at))||
    r.units!==1||r.state!=='reserved_not_sent'||
    r.provider_confirmed!==false||r.send_performed!==false||
    typeof r.message_fingerprint!=='string'||!/^sha256:[0-9a-f]{64}$/i.test(r.message_fingerprint)||
    typeof r.passport_permit_id!=='string'||!r.passport_permit_id.startsWith('permit_outreach_')||
    typeof r.ledger_subject_ref!=='string'||!/^contact:[A-Za-z0-9_.:-]{1,120}$/.test(r.ledger_subject_ref)||
    typeof r.actor_ref!=='string'||!r.actor_ref.includes(':')||r.actor_ref.includes('@'))
   throw Error('corrupt_outreach_reservation_record');
  return r;
 });
}
function appendRecord(dir,record){
 const fd=fs.openSync(path.join(dir,'reservation-events.jsonl'),'a',0o600);
 try{fs.writeSync(fd,JSON.stringify(record)+'\n');fs.fsyncSync(fd);}
 finally{fs.closeSync(fd);}
}
function signedSnapshot(report,proof,{secretFile,nowMs}){
 if(!secretFile||!path.isAbsolute(secretFile))throw Error('gmail_coverage_signer_key_required');
 const st=fs.lstatSync(secretFile);
 if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0)throw Error('gmail_coverage_key_permissions_invalid');
 const key=fs.readFileSync(secretFile);
 if(key.length<32)throw Error('gmail_coverage_key_too_short');
 const mark=clean(proof?.hmac_sha256);
 if(!/^[0-9a-f]{64}$/.test(mark))throw Error('gmail_coverage_signature_missing');
 const expected=createHmac('sha256',key).update(JSON.stringify(report)).digest();
 const actual=Buffer.from(mark,'hex');
 if(!timingSafeEqual(expected,actual))throw Error('gmail_coverage_signature_invalid');
 const at=Date.parse(report.generated_at);
 if(!Number.isFinite(at)||at>nowMs||nowMs-at>MAX_SNAPSHOT_AGE_MS)
  throw Error('gmail_coverage_snapshot_stale');
 if(report.record_coverage?.complete!==true||report.record_coverage?.invalid!==0||
    report.quota?.quota_verified!==true)throw Error('gmail_coverage_unverified');
 return at;
}
function requireInt(n,name){if(!Number.isSafeInteger(n)||n<0)throw Error(name+'_invalid');return n;}

/** The report must be signed by a trusted OWNED adapter after genuine full
 * Gmail history coverage. A caller-supplied flag is not proof.
 * This function NEVER invokes Gmail and does not finalize or send email. */
export function reserveColdOutreach({
 stateDir,ledger,report,reportProof,coverageSecretFile,prospect,opportunityRef,
 subjectRef,actorRef,subject,body,sender={},opportunity={},now=new Date().toISOString()
}={}){
 if(!(ledger instanceof EvercraftInteractionLedger))throw Error('owned_interaction_ledger_required');
 const at=Date.parse(now);
 if(!Number.isFinite(at))throw Error('reservation_time_invalid');
 if(!OPAQUE.test(prospect?.contact_ref||'')||!OPAQUE.test(opportunityRef||''))
  throw Error('opaque_contact_and_opportunity_required');
 if(!/^contact:[A-Za-z0-9_.:-]{1,120}$/.test(subjectRef||'')||!/[A-Za-z0-9]+:[A-Za-z0-9_.:-]{1,120}$/.test(actorRef||'')||String(actorRef).includes('@'))
  throw Error('passport_actor_and_opaque_contact_resource_required');
 if(!clean(subject)||!clean(body))throw Error('exact_email_required');
 if(!body.includes(clean(sender.postal_address))||!clean(sender.postal_address)||
    !body.includes(clean(sender.opt_out_instructions))||!clean(sender.opt_out_instructions))
  throw Error('legal_footer_missing_from_exact_body');
 if(report?.generated_at!==now && Math.abs(Date.parse(report?.generated_at)-at)>MAX_SNAPSHOT_AGE_MS)
  throw Error('snapshot_outside_reservation_window');
 const signedAt=signedSnapshot(report,reportProof,{secretFile:coverageSecretFile,nowMs:at});
 // Use the authenticated row, never a caller-supplied readiness flag.
 // A second row sharing either identity is ambiguous and must hold.
 const matching=Array.isArray(report.prospects)?report.prospects.filter(row=>
   row?.contact_ref===prospect.contact_ref||row?.prospect_ref===opportunityRef):[];
 if(matching.length!==1||matching[0].contact_ref!==prospect.contact_ref||
    matching[0].prospect_ref!==opportunityRef)
  return {state:'held',reasons:['signed_contact_or_opportunity_unresolved'],send_performed:false};
 const verifiedProspect=matching[0];
 if(report.organization_registry_valid!==true||
    !OPAQUE.test(verifiedProspect.organization_ref||'')||
    verifiedProspect.organization_contact_state!=='clear')
  return {state:'held',reasons:['signed_organization_identity_or_hold'],send_performed:false};
 if(verifiedProspect.actionable_as_new_cold_target!==true||
    !Array.isArray(verifiedProspect.reasons)||verifiedProspect.reasons.length!==0||
    ['opted_out','bounced','blocked','do_not_contact','customer_hold','declined'].includes(verifiedProspect.contact_state))
  return {state:'held',reasons:['signed_contact_preference_or_readiness_hold'],send_performed:false};
 const q=report.quota;
 const providerCap=requireInt(q.provider_daily_cap,'provider_cap');
 const sent=requireInt(q.rolling_24h_units,'gmail_sent_units');
 const reserve=requireInt(q.reply_reserve,'reply_reserve');
 const maxCold=Math.min(400,requireInt(q.cold_target,'cold_target'),providerCap-reserve);
 if(providerCap<reserve||maxCold<1)throw Error('insufficient_provider_capacity');
 const exactMessage=subject+'\n\n'+body;
 const permitCheck=checkOutboundCandidate({row:verifiedProspect,quota:q,sender,message:exactMessage,opportunity,now});
 if(permitCheck.decision!=='candidate_passed_non_authoritative_preflight')
  return {state:'held',reasons:permitCheck.reasons,send_performed:false};
 const dir=privateDir(stateDir),lock=path.join(dir,'.reservation-lock');
 try{fs.mkdirSync(lock,{mode:0o700});}
 catch(e){if(e.code==='EEXIST')return {state:'held',reasons:['reservation_lock_busy_or_stale'],send_performed:false};throw e;}
 try{
  const entries=readRecords(dir);
  // Prevent replay across Grok/Harbor/Saban, even if Gmail sends have not yet
  // appeared in a new export or an agent changes its "prospect_key".
  if(entries.some(e=>e.contact_ref===prospect.contact_ref||e.opportunity_ref===opportunityRef))
   return {state:'held',reasons:['contact_or_opportunity_already_reserved'],send_performed:false};
  if(entries.some(e=>Date.parse(e.reserved_at)>at))
   return {state:'held',reasons:['clock_rollback_or_future_record'],send_performed:false};
  // Count all recent unsynced reservations conservatively, in addition to
  // provider actual sends. Never treat the 100 closing slots as cold capacity.
  const recent=entries.filter(e=>at-Date.parse(e.reserved_at)<DAY_MS);
  const unsynced=recent.filter(e=>Date.parse(e.reserved_at)>=signedAt||e.provider_confirmed!==true);
  const alreadyReserved=unsynced.reduce((n,e)=>n+e.units,0);
  if(sent+alreadyReserved>=maxCold||sent+alreadyReserved>=providerCap-reserve)
   return {state:'held',reasons:['cold_outreach_budget_exhausted'],send_performed:false};
  const id='outreach_'+randomUUID();
  // Independently authorize the exact message with the existing Passport
  // and Interaction Ledger. This is done UNDER the shared reservation lock.
  const prepared=ledger.prepareContactPermit({
   subject_ref:subjectRef,actor_ref:actorRef,channel:'email',
   content:exactMessage,at:now,permit_id:'permit_'+id,
   permit_idempotency_key:'permit:'+id,permit_ttl_seconds:300,
   minimum_cooldown_minutes:72*60,
  });
  if(prepared.state!=='permit_minted'||prepared.preflight?.decision!=='allow')
   return {state:'held',reasons:prepared.preflight?.reasons||['passport_permit_not_minted'],send_performed:false};
  const row={
   schema:'evercraft.systemia.outreach-reservation.v1',
   reservation_id:id,contact_ref:prospect.contact_ref,opportunity_ref:opportunityRef,
   ledger_subject_ref:subjectRef,actor_ref:actorRef,
   message_fingerprint:sha(exactMessage),
   passport_permit_id:prepared.permit.permit_id,
   reserved_at:now,units:1,state:'reserved_not_sent',
   provider_confirmed:false,send_performed:false
  };
  appendRecord(dir,row);
  return {state:'reserved_not_sent',reservation_id:id,permit_id:row.passport_permit_id,
   message_fingerprint:row.message_fingerprint,send_performed:false,
   authority:'requires_second_stage_provider_and_passport_recheck'};
 }finally{fs.rmdirSync(lock);}
}

export function inspectReservations({stateDir}={}){
 const data=readRecords(privateDir(stateDir));
 return {schema:'evercraft.systemia.reservation-audit.v1',
  count:data.length,pending:data.filter(x=>!x.provider_confirmed).length,
  confirmed:data.filter(x=>x.provider_confirmed).length,
  send_performed:false,identifiers_exported:false};
}
