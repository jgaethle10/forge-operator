import {createHash} from 'node:crypto';
import {validateRelationshipRecord} from './relationship-policy.mjs';

const digest=v=>'sha256:'+createHash('sha256').update(v).digest('hex');
const required=(v,n)=>{if(typeof v!=='string'||!v.trim())throw Error(n+'_required');return v.trim()};
const time=(v,n)=>{const ms=Date.parse(required(v,n));if(!Number.isFinite(ms))throw Error(n+'_invalid');return ms};
const TYPES=new Set(['interest_expressed','contact_window_requested','contact_window_acknowledged',
 'meeting_discussed','meeting_scheduled','meeting_held','work_in_progress',
 'payment_processing_reported','payment_verified','followup_requested',
 'followup_completed','no_contact_requested','relationship_changed',
 'issue_opened','issue_resolved','note']);
const safe=(s)=>String(s||'').slice(0,80);

/**
 * Deterministic append-only evidence intake for an already trusted private
 * caller. Neither email content nor auto-generated classifications can elevate
 * permissions: a record starts manual-review-only and timeline events do not
 * change its covenant.
 */
export function appendRelationshipEvidence({
 ledger,initial=null,event,now=new Date()
}={}) {
 if(ledger?.schema!=='evercraft.crm.relationship-ledger.v1'||ledger?.tenant_id!=='evercraft'||
    !Array.isArray(ledger.records))throw Error('relationship_ledger_invalid');
 const ref=required(initial?.relationship_ref,'relationship_ref');
 const subject=required(initial?.subject_ref,'subject_ref');
 const division=required(initial?.division_id,'division_id');
 const eventRef=required(event?.event_ref,'event_ref');
 required(event?.evidence_ref,'evidence_ref');
 if(!TYPES.has(event?.type))throw Error('event_type_invalid');
 if(time(event?.occurred_at,'occurred_at')>now.getTime()+120000)throw Error('event_in_future');
 if(typeof event?.private_context!=='undefined'&&
   (typeof event.private_context!=='string'||event.private_context.length>4000))
   throw Error('private_context_invalid');
 if(typeof event?.source_message_ref!=='undefined')
   required(event.source_message_ref,'source_message_ref');
 const records=ledger.records.map(record=>structuredClone(record));
 const existing=records.find(r=>r.relationship_ref===ref);
 if(existing&&(existing.subject_ref!==subject||existing.division_id!==division))
   throw Error('relationship_identity_conflict');
 if(records.some(r=>r.relationship_ref!==ref&&r.subject_ref===subject&&r.division_id===division))
   throw Error('relationship_duplicate_subject_division');
 if(!existing) {
   const base={...initial,
     schema:'evercraft.crm.relationship.v1',outbound_policy:'manual_review_only',
     allowed_purposes:[],next_action_state:'open',
     observed_at:new Date(time(event.occurred_at,'occurred_at')).toISOString(),timeline:[]};
   validateRelationshipRecord(base,{now});
   records.push(base);
 }
 const record=existing||records.at(-1);
 const clean={
  event_ref:eventRef,type:event.type,evidence_ref:event.evidence_ref,
  occurred_at:new Date(time(event.occurred_at,'occurred_at')).toISOString(),
  ...(event.private_context?{private_context:event.private_context}:{}),
  ...(event.source_message_ref?{source_message_ref:event.source_message_ref}:{})
 };
 const before=record.timeline.find(x=>x.event_ref===eventRef);
 if(before){
   if(JSON.stringify(before)!==JSON.stringify(clean))throw Error('relationship_event_conflict');
   return {state:'duplicate',ledger,receipt:{schema:'evercraft.crm.evidence-receipt.v1',
    state:'duplicate',event_ref_hash:digest(eventRef),mutation_performed:false}};
 }
 if(record.timeline.length>=2000)throw Error('relationship_timeline_full');
 record.timeline.push(clean);
 record.timeline.sort((a,b)=>a.occurred_at.localeCompare(b.occurred_at)||a.event_ref.localeCompare(b.event_ref));
 // The relationship's current status / next action are not inferred from a reply.
 // Explicit review decisions must separately change those private fields.
 validateRelationshipRecord(record,{now});
 const revision=digest(JSON.stringify({before:ledger.revision||'genesis',event:clean,
  relation:ref,division}));
 const next={...ledger,revision,records};
 return {state:existing?'appended':'created',ledger:next,receipt:{
  schema:'evercraft.crm.evidence-receipt.v1',state:existing?'appended':'created',
  event_ref_hash:digest(eventRef),revision_hash:digest(revision),
  contact_permission_granted:false,outbound_policy_unchanged:!!existing,
  mutation_performed:true
 }};
}
