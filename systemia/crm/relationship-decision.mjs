import {createHash} from 'node:crypto';
import {validateRelationshipRecord} from './relationship-policy.mjs';

const sha=x=>'sha256:'+createHash('sha256').update(x).digest('hex');
const req=(s,n)=>{if(typeof s!=='string'||!s.trim())throw Error(n+'_required');return s.trim()};
const MODES=new Set(['paused','manual_review_only','preflight_eligible']);
const STATES=new Set(['open','snoozed','completed','cancelled']);
const iso=(s,n)=>{const d=new Date(req(s,n));if(!Number.isFinite(d.getTime()))throw Error(n+'_invalid');return d.toISOString()};
const identical=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

/** Governance decisions must be admitted by a trusted human authority callback. */
export function applyRelationshipDecision({
 ledger,decision,verifyApproval,now=new Date()
}={}) {
 if(ledger?.schema!=='evercraft.crm.relationship-ledger.v1'||
    ledger.tenant_id!=='evercraft'||!Array.isArray(ledger.records))
   throw Error('relationship_ledger_invalid');
 const ref=req(decision?.relationship_ref,'relationship_ref');
 const eventRef=req(decision?.decision_ref,'decision_ref');
 const evidenceRef=req(decision?.evidence_ref,'evidence_ref');
 const actorRef=req(decision?.actor_ref,'actor_ref');
 const approvalRef=req(decision?.approval_ref,'approval_ref');
 const kind=req(decision?.kind,'kind');
 if(!['change_policy','resolve_followup'].includes(kind))throw Error('decision_kind_invalid');
 if(ledger.revision!==decision?.expected_revision)throw Error('relationship_revision_conflict');
 const record=ledger.records.find(x=>x.relationship_ref===ref);
 if(!record)throw Error('relationship_missing');
 if(ledger.records.filter(x=>x.relationship_ref===ref).length!==1)throw Error('relationship_ambiguous');
 validateRelationshipRecord(record,{now});
 const existing=record.timeline.find(e=>e.event_ref===eventRef);
 if(existing)throw Error('decision_ref_already_used');
 const normalized={
  kind,relationship_ref:ref,decision_ref:eventRef,evidence_ref:evidenceRef,
  actor_ref:actorRef,approval_ref:approvalRef,
  expected_revision:ledger.revision
 };
 if(kind==='change_policy'){
  if(!MODES.has(decision.outbound_policy))throw Error('outbound_policy_invalid');
  if(!Array.isArray(decision.allowed_purposes)||new Set(decision.allowed_purposes).size!==decision.allowed_purposes.length)throw Error('purposes_invalid');
  Object.assign(normalized,{
    outbound_policy:decision.outbound_policy,
    allowed_purposes:[...decision.allowed_purposes],
    not_before:decision.not_before?iso(decision.not_before,'not_before'):null
  });
  if(normalized.outbound_policy==='preflight_eligible'&&normalized.allowed_purposes.length===0)
    throw Error('unscoped_contact_policy_invalid');
 }else{
  if(!STATES.has(decision.next_action_state))throw Error('next_action_state_invalid');
  Object.assign(normalized,{next_action_state:decision.next_action_state});
  if(decision.next_review_at)normalized.next_review_at=iso(decision.next_review_at,'next_review_at');
 }
 const fingerprint=sha(JSON.stringify(normalized));
 if(typeof verifyApproval!=='function')throw Error('trusted_decision_authority_missing');
 let approval;
 try{approval=verifyApproval({
  approval_ref:approvalRef,actor_ref:actorRef,decision_fingerprint:fingerprint,now
 });}catch{throw Error('relationship_decision_authorization_failed');}
 if(approval?.then||approval?.approved!==true||
    approval?.approval_ref!==approvalRef||
    approval?.decision_fingerprint!==fingerprint||
    !Number.isFinite(Date.parse(String(approval?.expires_at||'')))||
    Date.parse(approval.expires_at)<=now.getTime())throw Error('relationship_decision_authorization_failed');
 const updated=structuredClone(record);
 if(kind==='change_policy'){
  updated.outbound_policy=normalized.outbound_policy;
  updated.allowed_purposes=normalized.allowed_purposes;
  updated.not_before=normalized.not_before;
 }else{
  updated.next_action_state=normalized.next_action_state;
  if(normalized.next_review_at)updated.next_review_at=normalized.next_review_at;
  if(['completed','cancelled'].includes(normalized.next_action_state)){
    updated.next_action_evidence_ref=evidenceRef;
    updated.next_action_decided_at=now.toISOString();
  }else{
    delete updated.next_action_evidence_ref;
    delete updated.next_action_decided_at;
  }
 }
 updated.observed_at=now.toISOString();
 updated.timeline.push({
  event_ref:eventRef,type:'relationship_changed',
  occurred_at:now.toISOString(),evidence_ref:evidenceRef
 });
 validateRelationshipRecord(updated,{now});
 const next={...ledger,revision:sha(ledger.revision+'|'+fingerprint),
  records:ledger.records.map(x=>x.relationship_ref===ref?updated:x)};
 return {ledger:next,receipt:{
  schema:'evercraft.crm.relationship-decision.v1',
  state:'applied',kind,
  relationship_fingerprint:sha(ref),
  decision_fingerprint:fingerprint,
  approval_verified:true,
  contact_authority_granted:false,
  message_sent:false
 }};
}
