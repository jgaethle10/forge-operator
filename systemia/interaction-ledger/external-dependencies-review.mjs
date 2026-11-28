// Pure historical review gate. Only authenticated owner-reviewed facts from an
// authorized adapter may be supplied; this is not an authentication mechanism.
import {createHash} from 'node:crypto';
const str=v=>typeof v==='string'&&v.trim().length>0&&v.length<=1000;
const required=(v,k)=>{if(!str(v))throw Error(k+'_required');return v};
const dispositions=new Set(['sent_only','agency_acknowledged','delivery_failed','portal_required',
 'clarification_required','duplicate_review','partial_delivery_reported','final_delivery_reported','denied_or_no_records']);
const types=new Set(['public_records','research','document','application','approval','quote','commitment']);
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function reviewHistoricalRequest({candidate,review}={}){
 if(!candidate||candidate.review_required!==true||!Array.isArray(candidate.message_refs)||
    !candidate.message_refs.length||candidate.message_refs.length>10000||
    !/^gmail-thread:[a-f0-9]{64}$/.test(candidate.thread_ref||'')||
    !candidate.message_refs.every(x=>/^gmail-message:[a-f0-9]{64}$/.test(x)))
  throw Error('historical_candidate_required');
 if(!review||review.thread_ref!==candidate.thread_ref)throw Error('review_candidate_mismatch');
 const reviewer=required(review.reviewer_ref,'reviewer_ref'),reviewRef=required(review.review_evidence_ref,'review_evidence_ref');
 const reviewTime=Date.parse(required(review.reviewed_at,'reviewed_at'));
 if(!Number.isFinite(reviewTime))throw Error('review_timestamp_invalid');
 if(!dispositions.has(review.disposition)||!types.has(review.type))throw Error('invalid_review_disposition_or_type');
 const evidence=review.message_refs;
 if(!Array.isArray(evidence)||!evidence.length||new Set(evidence).size!==evidence.length||
    evidence.some(x=>!candidate.message_refs.includes(x)))throw Error('review_evidence_not_in_candidate');
 const result={schema:'evercraft.crm.historical-request-review.v1',thread_ref:candidate.thread_ref,
  review_ref:reviewRef,reviewer_ref:reviewer,reviewed_at:new Date(reviewTime).toISOString(),
  evidence_refs:[...evidence].sort(),disposition:review.disposition,type:review.type,
  review_id:'review:'+sha([candidate.thread_ref,reviewRef]),execution_authorized:false,
  contact_authorized:false,publication_authorized:false,closure_authorized:false};
 const holds=[];
 if(review.request_verified!==true)holds.push('request_not_verified');
 if(!['mission_ref','owner_ref','intent_snapshot_ref','continuation_plan_ref','context_evidence_ref'].every(k=>str(review[k]))||
    review.context_verified!==true)holds.push('context_recovery_required');
 if(['delivery_failed','portal_required','duplicate_review','clarification_required'].includes(review.disposition))
  holds.push(review.disposition);
 if(review.disposition==='final_delivery_reported'||review.disposition==='partial_delivery_reported'){
  // The agency reporting a release is not proof the bytes were retrieved.
  if(review.artifact_custody_verified!==true||!str(review.artifact_ref))holds.push('artifact_custody_review');
 }
 if(review.follow_up_at!=null&&(!str(review.follow_up_basis_ref)||!Number.isFinite(Date.parse(review.follow_up_at))))
  holds.push('follow_up_basis_missing');
 return {...result,holds,ready_for_private_import_review:holds.length===0,
  context:holds.includes('context_recovery_required')?null:{
   mission_ref:review.mission_ref,owner_ref:review.owner_ref,intent_snapshot_ref:review.intent_snapshot_ref,
   continuation_plan_ref:review.continuation_plan_ref,context_evidence_ref:review.context_evidence_ref},
  follow_up_at:holds.includes('follow_up_basis_missing')?null:review.follow_up_at??null,
  follow_up_basis_ref:holds.includes('follow_up_basis_missing')?null:review.follow_up_basis_ref??null};
}
