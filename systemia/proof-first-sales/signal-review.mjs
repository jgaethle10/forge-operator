// Read-only review candidate for the existing Proof-First Sales qualifier.
// Private input/output; no sender, scheduler, CRM write, or authority.
import {qualifyClientSignal} from './client-qualifier.mjs';
function reconcileSignalGroups(signals, qualify, now=new Date()) {
  if(!Array.isArray(signals)||signals.length>10000)throw Error('invalid_signal_batch');
  if(typeof qualify!=='function'||!Number.isFinite(new Date(now).getTime()))throw Error('invalid_review_context');
  const groups=new Map();
  for(const raw of signals){
    if(!raw||typeof raw.prospect_key!=='string'||!raw.prospect_key.trim()||raw.prospect_key.trim().length>256)throw Error('invalid_prospect_key');
    const key=raw.prospect_key.trim();
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(raw);
  }
  const rows=[];
  for(const [key,records] of groups){
    const optOut=records.some(r=>r.opted_out===true);
    const overdue=records.some(r=>r.unfulfilled_commitment===true);
    const limit=records.some(r=>Number(r.unanswered_outbound)>=2);
    let state,reason,qualification=null;
    if(optOut){state='do_not_contact';reason='opt_out_in_any_record';}
    else if(overdue){state='fulfill_prior_commitment';reason='prior_commitment_in_any_record';}
    else if(limit){state='waiting_reply';reason='unanswered_limit_in_any_record';}
    else if(records.length>1){state='reconcile_history';reason='multiple_records_require_authoritative_reconciliation';}
    else{
      qualification=qualify(records[0],now);
      state=qualification.disposition;
      reason=qualification.reason;
    }
    rows.push({prospect_key:key,records_seen:records.length,state,reason,qualification,
      independent_review_required:true,send_authority:false,contact_clearance:false});
  }
  const priority={fulfill_prior_commitment:0,scoping_priority:1,relationship_review:2,reconcile_history:3,research_only:4,waiting_reply:5,do_not_contact:6};
  rows.sort((a,b)=>(priority[a.state]??99)-(priority[b.state]??99)||a.prospect_key.localeCompare(b.prospect_key));
  const counts={};for(const row of rows)counts[row.state]=(counts[row.state]||0)+1;
  return {schema:'evercraft.proof-first-sales.signal-review.v1',input_count:signals.length,prospect_count:rows.length,counts,rows,send_authority:false};
}
export function buildSignalReviewQueue(signals,now=new Date()){
 return reconcileSignalGroups(signals,qualifyClientSignal,now);
}
