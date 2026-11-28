// Pure private CRM projection. No I/O, sending, dispatch, persistence or scheduler.
// Inputs must originate in existing authorized CRM/Interaction Ledger evidence adapters.
import {createHash} from 'node:crypto';
const text=v=>typeof v==='string'&&v.trim().length>0;
const need=(v,k)=>{if(!text(v))throw Error(k+'_required');return v};
const date=(v,k)=>{need(v,k);const n=Date.parse(v);if(!Number.isFinite(n))throw Error(k+'_invalid');return n};
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const types=new Set(['public_records','research','document','application','approval','quote','commitment']);
const kinds=new Set(['acknowledged','clarification','fee','partial','response','denied','no_records']);
const terminal=new Set(['resolved','cancelled']);
function requireArray(v,k){if(!Array.isArray(v))throw Error(k+'_array_required')}
export function projectExternalDependencies({requests=[],receipts=[],reviewedContinuationIds=[],now}={}){
 requireArray(requests,'requests');requireArray(receipts,'receipts');requireArray(reviewedContinuationIds,'reviewed');
 const clock=date(now,'now'), seen=new Map(), rows=new Map(), review=[], candidates=[];
 for(const r of requests){
  const id=need(r.request_id,'request_id');
  if(rows.has(id))throw Error('duplicate_request_id');
  if(!types.has(r.type))throw Error('request_type_invalid');
  need(r.subject_ref,'subject_ref');
  need(r.scope_ref,'scope_ref');
  if(!['draft','submitted','resolved','cancelled'].includes(r.state))throw Error('request_state_invalid');
  const submitted=r.state!=='draft';
  if(submitted){need(r.submission_evidence_ref,'submission_evidence_ref');if(date(r.submitted_at,'submitted_at')>clock)throw Error('future_submission')}
  if(r.follow_up_at!=null){date(r.follow_up_at,'follow_up_at');need(r.follow_up_basis_ref,'follow_up_basis_ref')}
  if(terminal.has(r.state))need(r.closure_evidence_ref,'closure_evidence_ref');
  const contextReady=['mission_ref','owner_ref','intent_snapshot_ref','continuation_plan_ref'].every(k=>text(r[k]));
  rows.set(id,{request:r,contextReady,status:r.state,remaining:r.scope_ref,received:[],last_receipt_at:null});
 }
 for(const e of receipts){
  const id=need(e.event_id,'event_id');
  if(!kinds.has(e.kind))throw Error('receipt_kind_invalid');
  need(e.evidence_ref,'evidence_ref');need(e.subject_ref,'subject_ref');
  if(date(e.occurred_at,'occurred_at')>clock)throw Error('future_receipt');
  // Canonical field projection excludes arbitrary email text or embedded instructions.
  const clean={event_id:id,kind:e.kind,evidence_ref:e.evidence_ref,subject_ref:e.subject_ref,
   occurred_at:e.occurred_at,thread_ref:e.thread_ref??null,case_ref:e.case_ref??null,
   artifact_ref:e.artifact_ref??null,remaining_scope_ref:e.remaining_scope_ref??null};
  if(['response','partial'].includes(clean.kind))need(clean.artifact_ref,'artifact_ref');
  if(clean.kind==='partial')need(clean.remaining_scope_ref,'remaining_scope_ref');
  const prev=seen.get(id);if(prev&&hash(prev)!==hash(clean))throw Error('conflicting_receipt_id');
  seen.set(id,clean);
 }
 const ordered=[...seen.values()].sort((a,b)=>date(a.occurred_at,'occurred_at')-date(b.occurred_at,'occurred_at')||a.event_id.localeCompare(b.event_id));
 const reviewed=new Set(reviewedContinuationIds);
 for(const e of ordered){
  const match=[...rows.values()].filter(x=>{
   const r=x.request;
   return r.state!=='draft'&&r.subject_ref===e.subject_ref&&
    ((text(e.thread_ref)&&e.thread_ref===r.thread_ref)||(text(e.case_ref)&&e.case_ref===r.case_ref));
  });
  if(match.length!==1){review.push({event_id:e.event_id,reason:match.length?'ambiguous_match':'unmatched'});continue}
  const row=match[0],r=row.request;
  if((text(e.thread_ref)&&text(r.thread_ref)&&e.thread_ref!==r.thread_ref)||
     (text(e.case_ref)&&text(r.case_ref)&&e.case_ref!==r.case_ref)){
   review.push({event_id:e.event_id,reason:'conflicting_identifiers'});continue;
  }
  if(terminal.has(r.state)||date(e.occurred_at,'occurred_at')<date(r.submitted_at,'submitted_at')){
   review.push({event_id:e.event_id,reason:'closed_or_predates_submission'});continue;
  }
  row.last_receipt_at=e.occurred_at;
  if(e.kind==='acknowledged'){if(row.status==='submitted')row.status='acknowledged';continue}
  if(['clarification','fee'].includes(e.kind)){row.status=e.kind+'_review';continue}
  if(['denied','no_records'].includes(e.kind)){row.status=e.kind+'_review';continue}
  row.status=e.kind==='partial'?'partial':'response_unreviewed';
  row.remaining=e.kind==='partial'?e.remaining_scope_ref:null;
  row.received.push(e.artifact_ref);
  if(!row.contextReady){review.push({event_id:e.event_id,reason:'context_recovery'});continue}
  const id='continuation:'+hash([r.request_id,e.event_id]);
  if(!reviewed.has(id))candidates.push({continuation_id:id,request_id:r.request_id,
   mission_ref:r.mission_ref,owner_ref:r.owner_ref,intent_snapshot_ref:r.intent_snapshot_ref,
   continuation_plan_ref:r.continuation_plan_ref,artifact_ref:e.artifact_ref,
   evidence_ref:e.evidence_ref,remaining_scope_ref:row.remaining,disposition:'admission_review_required'});
 }
 const views=[...rows.values()].map(x=>{
  const r=x.request;
  const waiting=['submitted','acknowledged','partial'].includes(x.status);
  return {request_id:r.request_id,status:x.status,context_recovery:!x.contextReady,
   remaining_scope_ref:x.remaining,artifact_refs:[...new Set(x.received)],
   last_receipt_at:x.last_receipt_at,
   follow_up_review_due:waiting&&r.follow_up_hold!==true&&r.follow_up_at!=null&&date(r.follow_up_at,'follow_up_at')<=clock,
   follow_up_held:r.follow_up_hold===true};
 });
 const count=f=>views.filter(f).length;
 return {schema:'evercraft.crm.external-dependencies.projection.v1',views,review,candidates,
  heartbeat_digest:{requests:views.length,waiting:count(x=>['submitted','acknowledged','partial'].includes(x.status)),
   follow_up_review_due:count(x=>x.follow_up_review_due),partial:count(x=>x.status==='partial'),
   response_unreviewed:count(x=>x.status==='response_unreviewed'),context_recovery:count(x=>x.context_recovery),
   receipt_review:review.length,continuation_review:candidates.length},
  side_effects:false};
}
