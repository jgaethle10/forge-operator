/**
 * Private, append-only source-reference desk for REIGNITE feasibility.
 * Canonical gates are imported. Owner entries are source reports, not approvals.
 */
import { randomUUID } from 'node:crypto';
import { assessReigniteConcept, eventNextActions } from '../opportunity-fabric/event-coordination.mjs';

export const EVIDENCE_SCHEMA='evercraft.reignite.owner-evidence.v1';
const FINDINGS=Object.freeze(['submitted','unsafe','denied','not_permitted','unknown']);
const HOLD_FINDINGS=new Set(['unsafe','denied','not_permitted']);
const gateIds=new Set(assessReigniteConcept().checks.map(x=>x.id));
const validIso=(x)=>typeof x==='string'&&Number.isFinite(Date.parse(x))&&
  new Date(x).toISOString()===x;
const trim=(s,max)=>typeof s==='string'?s.trim().slice(0,max):'';
export function emptyEvidenceDesk(){
 return {schema:EVIDENCE_SCHEMA,revision:0,items:[]};
}
function validateDesk(desk){
 if(!desk||desk.schema!==EVIDENCE_SCHEMA||!Number.isSafeInteger(desk.revision)||
    desk.revision<0||!Array.isArray(desk.items)||desk.items.length>2000)
   throw Error('evidence_desk_schema_invalid');
 if(desk.revision!==desk.items.length)throw Error('evidence_desk_revision_invalid');
 for(const item of desk.items){
   if(!gateIds.has(item.gate_id)||!FINDINGS.includes(item.finding)||
      !validIso(item.recorded_at)||typeof item.source_ref!=='string')
     throw Error('evidence_desk_item_invalid');
 }
 return desk;
}
export function allowedEvidenceSource(source){
 if(typeof source!=='string'||source!==source.trim()||source.length<10||source.length>300)
   return false;
 // Private evidence is already held in the existing owner-controlled ledger.
 if(/^private-ledger:[a-z0-9][a-z0-9/_-]{7,180}$/i.test(source))return true;
 let parsed;try{parsed=new URL(source)}catch{return false}
 if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.hash||
    parsed.search||parsed.hostname.length<4||!parsed.hostname.includes('.'))
   return false;
 if(parsed.hostname==='localhost'||parsed.hostname.endsWith('.local'))return false;
 return true;
}
export function addOwnerEvidence(desk,payload,{actor='Evercraft owner',recordedAt=new Date().toISOString()}={}){
 validateDesk(desk);
 if(!payload||typeof payload!=='object'||Array.isArray(payload))
   throw Error('evidence_input_required');
 if(payload.base_revision!==desk.revision)throw Error('evidence_revision_conflict');
 if(!gateIds.has(payload.gate_id))throw Error('unknown_event_gate');
 if(!FINDINGS.includes(payload.finding))throw Error('invalid_source_finding');
 if(!allowedEvidenceSource(payload.source_ref))throw Error('source_reference_required');
 const note=trim(payload.note,800);
 if(note.length<15||payload.note!==note)throw Error('evidence_note_minimum_15_required');
 if(!validIso(recordedAt))throw Error('recorded_time_invalid');
 if(desk.items.length>=2000)throw Error('evidence_desk_capacity_reached');
 const item={
  id:'ev-'+randomUUID(),gate_id:payload.gate_id,source_ref:payload.source_ref,
  finding:payload.finding,note,recorded_at:recordedAt,recorded_by:trim(actor,80),
  independent_review:'not_verified',
  permission_to_proceed:false
 };
 return {
  desk:{...desk,revision:desk.revision+1,items:[...desk.items,item]},
  receipt:{id:item.id,gate_id:item.gate_id,revision:desk.revision+1,
    source_status:HOLD_FINDINGS.has(item.finding)?'hold_reported':'submitted_unverified',
    independent_review:'not_verified',permission_to_proceed:false}
 };
}
export function ownerReadiness(desk){
 validateDesk(desk);
 const evidence={};
 const latest=new Map();
 const holds=new Map();
 for(const item of desk.items){
  latest.set(item.gate_id,item);
  if(HOLD_FINDINGS.has(item.finding)&&!holds.has(item.gate_id))
   holds.set(item.gate_id,item);
 }
 for(const [gate_id,item] of latest){
  const active=holds.get(gate_id)||item;
  evidence[gate_id]={
   source_ref:active.source_ref,observed_at:active.recorded_at,
   finding:active.finding
  };
 }
 const assessment=assessReigniteConcept({evidence});
 const next=eventNextActions(assessment);
 return {
  schema:'evercraft.reignite.owner-readiness.v1',
  desk_revision:desk.revision,
  headline:next.headline,
  summary:{
   requirements:assessment.checks.length,
   missing:assessment.checks.filter(c=>c.status==='missing').length,
   submitted_unverified:assessment.checks.filter(c=>c.status==='submitted_unverified').length,
   reported_holds:assessment.checks.filter(c=>c.status==='hold_reported').length,
   independently_approved:0
  },
  next:next.next,
  gates:assessment.checks.map(g=>({
   gate_id:g.id,owner:g.owner,question:g.question,status:g.status,
   last_report:latest.has(g.id)?{
    record_id:latest.get(g.id).id,source_ref:latest.get(g.id).source_ref,
    note:latest.get(g.id).note,recorded_at:latest.get(g.id).recorded_at
   }:null,
   hold_pending_independent_review:holds.has(g.id)
  })),
  history_count:desk.items.length,
  source_report_only:true,
  event_approved:false,venue_authorized:false,ticket_sales_authorized:false,
  charitable_collection_authorized:false,external_contact_authorized:false
 };
}
