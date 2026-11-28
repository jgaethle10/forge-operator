// Review existing private Gmail drafts before any reservation. Never sends,
// edits drafts, infers buyer intent, or treats a targeted search as full history.
const email=v=>typeof v==='string'&&/^[^\s@<>]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(v.trim())?v.trim().toLowerCase():null;
const lanes=new Set(['direct_offer','customer_reply','supplier','partner','procurement','other']);
export function reviewPreparedDrafts(records,{now=new Date()}={}){
 if(!Array.isArray(records)||records.length>1000||!Number.isFinite(+now))throw Error('invalid_draft_inventory');
 const ids=new Set(),recipients=new Map();
 for(const r of records){
  const d=r?.draft;if(typeof d?.id!=='string'||!d.id||ids.has(d.id))throw Error('invalid_or_duplicate_draft');
  ids.add(d.id);const a=Array.isArray(d.to)&&d.to.length===1?email(d.to[0]):null;
  if(a)recipients.set(a,(recipients.get(a)||0)+1);
 }
 const rows=records.map(r=>{
  const d=r.draft,h=r.history,a=Array.isArray(d.to)&&d.to.length===1?email(d.to[0]):null;
  const lane=lanes.has(r.lane)?r.lane:'other',reasons=[];
  const historyOK=!!a&&h?.recipient===a&&h.search_exhausted===true&&Array.isArray(h.messages);
  let prior=0,inbound=0;
  if(historyOK){
    const seen=new Set();
    for(const m of h.messages){
      if(typeof m?.id!=='string'||!m.id||seen.has(m.id)||!Array.isArray(m.labels)){reasons.push('history_record_invalid');continue;}
      seen.add(m.id);
      if(m.labels.includes('SENT'))prior++;
      else if(!m.labels.includes('DRAFT'))inbound++;
    }
  }else reasons.push('targeted_history_missing_or_incomplete');
  if(!a||d.cc?.length||d.bcc?.length)reasons.push('recipient_scope_requires_review');
  if(a&&recipients.get(a)>1)reasons.push('multiple_drafts_same_recipient');
  if(prior)reasons.push('prior_send_requires_relationship_review');
  if(inbound)reasons.push('inbound_requires_original_thread_review');
  if(typeof d.body!=='string'||!d.body.trim())reasons.push('draft_body_missing');
  else if(/\[(?:add|insert|enter|confirm|verify|replace|your)\b[^\]]{1,240}\]/i.test(d.body))reasons.push('unresolved_draft_placeholder');
  if(r.opted_out===true||r.customer_hold===true)reasons.push('contact_hold');
  if(r.unfulfilled_commitment===true)reasons.push('fulfillment_first');
  if(!Number.isFinite(Date.parse(d.email_ts))||Date.parse(d.email_ts)>+now||+now-Date.parse(d.email_ts)>7*86400000)reasons.push('draft_needs_freshness_review');
  // A lane label is reviewer supplied and does not prove willingness to pay.
  const state=reasons.length?'hold_review':lane==='direct_offer'||lane==='customer_reply'?'commercial_review':'nonclosing_review';
  return {draft_ref:d.id,lane,state,reasons:[...new Set(reasons)],prior_sent_in_search:prior,inbound_in_search:inbound,
   next_action:reasons.includes('fulfillment_first')?'fulfill_existing_commitment':reasons.includes('contact_hold')?'do_not_contact':prior||inbound?'reconcile_existing_relationship':state==='commercial_review'?'verify_current_need_exact_message_and_existing_authority':'review_nonclosing_or_missing_evidence',
   complete_contact_history_verified:false,send_authority:false,paid_order_confirmed:false};
 });
 const counts={drafts:rows.length,prior_send_drafts:rows.filter(x=>x.prior_sent_in_search>0).length,placeholder_drafts:rows.filter(x=>x.reasons.includes('unresolved_draft_placeholder')).length,held:rows.filter(x=>x.state==='hold_review').length,commercial_review:rows.filter(x=>x.state==='commercial_review').length,nonclosing_review:rows.filter(x=>x.state==='nonclosing_review').length};
 return {schema:'evercraft.systemia.prepared-draft-review.v1',counts,rows,review_only:true,external_effects_authorized:false};
}
