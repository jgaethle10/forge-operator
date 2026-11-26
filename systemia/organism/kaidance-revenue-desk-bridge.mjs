// KAIDANCE read-only handoff from the EXISTING private Systemia Revenue Desk
// reconciliation receipt. No Gmail credentials, new CRM/scheduler, mail, payments,
// public customer data or remote effects. An inbox event is not a qualified lead.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const SOURCE='evercraft.systemia.gmail-reconciliation.v1';
const REF=/^hmac256:[a-f0-9]{64}$/;
const EMPTY={status:'not_connected',review_candidates:[],rows_seen:0,
  unreviewed_inbound_candidates:0,suppressed_contacts:0,
  paid_orders_verified:0,outreach_authorized:false,payment_authorized:false};
const hash=v=>'sha256:'+createHash('sha256').update(JSON.stringify(v)).digest('hex');
const safe=n=>Number.isSafeInteger(n)&&n>=0;
const date=v=>{const n=Date.parse(v||'');return Number.isFinite(n)?n:null;};

// Operator-supplied, PRIVATE 0600 snapshot, produced by existing Revenue Desk.
// Never derive it from a public feed or from an assistant-authored example.
export function readPrivateRevenueDeskReceipt(filename){
 if(!filename)return null;
 const full=path.resolve(filename);
 const parent=path.dirname(full);
 if(fs.lstatSync(parent).isSymbolicLink()||fs.lstatSync(full).isSymbolicLink())
   throw Error('private_revenue_receipt_symlink_refused');
 const dir=fs.statSync(parent),file=fs.statSync(full);
 if(!dir.isDirectory()||(dir.mode&0o077)!==0||
    !file.isFile()||(file.mode&0o077)!==0||file.size>1048576)
   throw Error('private_revenue_receipt_permissions_or_size_invalid');
 return JSON.parse(fs.readFileSync(full,'utf8'));
}
export function classifyRevenueDeskReceipt(value,now=new Date()){
 if(!value)return {...EMPTY};
 const clock=+new Date(now),generated=date(value.generated_at);
 if(!Number.isFinite(clock)||generated===null||generated>clock+60000||
    clock-generated>2*3600000)return {...EMPTY,status:'stale'};
 const invalid=()=>({...EMPTY,status:'invalid'});
 if(value.schema!==SOURCE||
   value.advisory_only!==true||value.send_performed!==false||
   value.private_identifiers_exported!==false||value.private_body_exported!==false||
   value.provider_delivery_verified!==false||value.customer_acceptance_verified!==false||
   value.paid_revenue_verified!==false||
   value.quota?.allow_unattended_sending!==false||
   !Array.isArray(value.prospects)||value.prospects.length>2000||
   !safe(value.record_coverage?.valid)||!safe(value.record_coverage?.invalid)||
   !safe(value.funnel?.inbound_non_auto_messages)||
   value.funnel?.newly_paid_orders_verified!==0)return invalid();
 const seen=new Set(),eligible=[];
 let suppressed=0;
 for(const p of value.prospects){
  if(!REF.test(p?.prospect_ref||'')||!REF.test(p?.contact_ref||'')||
     !['researched','verified','contact_ready','sent','replied','quoted','accepted','invoiced','paid','fulfilled'].includes(p.stage)||
     p.send_authorized!==false||typeof p.contact_state!=='string'||
     !Array.isArray(p.reasons)||p.reasons.length>30||
     p.reasons.some(r=>typeof r!=='string'||r.length>80)||
     (p.last_contact_at!==null&&p.last_contact_at!==undefined&&date(p.last_contact_at)===null)||
     (p.last_reply_at!==null&&p.last_reply_at!==undefined&&date(p.last_reply_at)===null))
   return invalid();
  const blocked=['opted_out','bounced','blocked','do_not_contact','customer_hold','declined','delivery_delayed']
    .includes(p.contact_state);
  if(blocked){suppressed++;continue;}
  const reply=date(p.last_reply_at),outbound=date(p.last_contact_at);
  // A human inbox event needs triage only if it is LATER than the latest outbound.
  // An acknowledged bid or already-answered reply is not a new buyer request.
  if(p.stage==='replied'&&reply!==null&&reply<=clock+60000&&
     (outbound===null||reply>outbound)&&
     typeof p.latest_inbound_ref==='string'&&/^gmail:[a-zA-Z0-9_-]{6,90}$/.test(p.latest_inbound_ref)&&
     !seen.has(p.prospect_ref)){
   seen.add(p.prospect_ref);
   eligible.push({ref:p.prospect_ref,at:reply});
  }
 }
 if(value.record_coverage.complete!==true||
    value.record_coverage.invalid!==0||value.quota?.quota_verified!==true){
  return {...EMPTY,status:'held_incomplete_source',rows_seen:value.prospects.length,
    suppressed_contacts:suppressed,source_fresh_at:value.generated_at};
 }
 const selected=eligible.sort((a,b)=>b.at-a.at||a.ref.localeCompare(b.ref)).slice(0,3);
 const summary={status:'verified_private_advisory',source_fresh_at:value.generated_at,
   rows_seen:value.prospects.length,
   unreviewed_inbound_candidates:eligible.length,suppressed_contacts:suppressed,
   inbound_non_auto_count:value.funnel.inbound_non_auto_messages,
   paid_orders_verified:0,outreach_authorized:false,payment_authorized:false,
   source_reconciliation_only:true,
   // Keep all opaque identifiers local to the private company review queue.
   review_candidates:selected.map(x=>({
     work_key:'revenue:reply:'+x.ref,lane_key:'revenue',priority:1,
     action:'review_unanswered_inbound_in_existing_revenue_desk',
     authority:'systemia_operator_review_required',
     execution_authorized:false,outreach_authorized:false,
     application_authorized:false,payment_authorized:false,
     customer_acceptance_verified:false,payment_verified:false
   }))};
 return {...summary,receipt_ref:hash({
   source_fresh_at:summary.source_fresh_at,rows_seen:summary.rows_seen,
   inbound_non_auto_count:summary.inbound_non_auto_count,
   unreviewed_inbound_candidates:summary.unreviewed_inbound_candidates,
   suppressed_contacts:summary.suppressed_contacts})};
}
