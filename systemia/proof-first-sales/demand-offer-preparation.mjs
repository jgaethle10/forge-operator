// Prepare buyer-specific scope/response drafts inside existing Proof-First Sales.
// No sender, checkout URL generation, provider writes or customer commitment.
import {createHash} from 'node:crypto';
import {reviewDemandBatch} from './demand-portfolio-review.mjs';
import {qualifyClientSignal} from './client-qualifier.mjs';
const clean=v=>typeof v==='string'?v.trim():'';
const line=(v,max)=>{const s=clean(v);return s.length>0&&s.length<=max&&!/[\r\n\x00-\x1f\x7f]/.test(s)?s:null;};
const hash=v=>'sha256:'+createHash('sha256').update(v).digest('hex');
const allowed=new Set(['client_request','client_reply','public_hiring','partner_invitation']);
export function prepareDemandOffers(signals,{portfolio,painIndex,now=new Date()}={}){
 const review=reviewDemandBatch(signals,{portfolio,painIndex,now,qualify:qualifyClientSignal});
 const byKey=new Map(signals.map(s=>[clean(s.prospect_key),s]));
 const rows=[];
 for(const row of review.rows){
  const raw=byKey.get(row.prospect_key);
  const base={prospect_key:row.prospect_key,review_state:row.state,send_authority:false,checkout_authority:false,paid_order_confirmed:false};
  const hold=reason=>rows.push({...base,state:'held',reason,draft:null});
  if(row.records_seen!==1||['do_not_contact','fulfill_prior_commitment','waiting_reply','reconcile_history'].includes(row.state)){hold(row.state);continue;}
  if(!row.hypotheses.length||!allowed.has(raw.source_kind)){hold('no_current_evidenced_portfolio_fit');continue;}
  // Evidence fields are private reviewer assertions, not independent authentication.
  const e=raw.offer_review;
  const ref=clean(raw.demand_evidence_ref);
  const match=row.hypotheses.find(h=>h.key===e?.capability_key&&h.source===e?.capability_source&&h.evidence_ref===ref);
  if(!match||e?.source_ref!==ref||e?.source_current!==true||e?.buyer_identity_checked!==true||e?.response_channel_checked!==true||e?.history_reviewed!==true){hold('review_current_source_buyer_channel_history_and_exact_fit');continue;}
  if(e.contact_suppressed!==false||e.capacity_reviewed!==true||e.delivery_scope_reviewed!==true){hold('review_suppression_capacity_and_scope');continue;}
  const business=line(raw.business,150),need=line(e.buyer_need_summary,400),scope=line(e.deliverable,600),accept=line(e.acceptance_criteria,400),question=line(e.next_question,300),proof=line(e.proof_url,2048);
  let proofOk=false;try{const u=new URL(proof);proofOk=u.protocol==='https:'&&!u.username&&!u.password&&e.proof_checked===true;}catch{}
  if(!business||!need||!scope||!accept||!question||!proofOk){hold('specific_need_scope_acceptance_question_and_checked_proof_required');continue;}
  // Never infer a quote from catalog prices. An exact price may be proposed only
  // when it is the reviewed structured catalog tier and source permits sell-now.
  let proposedPrice=null;
  const entry=painIndex.entries.filter(x=>x.kind==='machine_offer'&&x.public_id===match.key);
  if(match.source==='machine_offer'&&entry.length===1&&entry[0].commercial_state==='sell_now'&&e.price_reviewed===true){
   const tiers=(entry[0].offers||[]).filter(t=>typeof t.offer_key==='string'&&t.offer_key===e.offer_key&&Number.isFinite(t.price_usd)&&t.price_usd>0&&t.billing==='one_time');
   if(tiers.length===1&&e.price_usd===tiers[0].price_usd)proposedPrice=tiers[0].price_usd;
  }
  const subject='Regarding your '+business+' request';
  const body=['Hello '+business+' team,','', 'I saw your request and noted this specific need: '+need,'',
   'Through Evercraft LLC, I would propose '+scope,'',
   'We would agree the acceptance criteria before starting: '+accept,'',
   'Relevant work or capability reference: '+proof,'',
   ...(proposedPrice===null?['I would confirm the scope, price and turnaround with you before any commitment.']:['The proposed scoped fee is $'+proposedPrice+' USD before applicable tax; scope, timing and payment method would be confirmed before starting.']),
   '',question,'','Evercraft LLC'].join('\n');
  rows.push({...base,state:'draft_for_owner_review',capability_key:match.key,source_ref:ref,proposed_price_usd:proposedPrice,
   draft:{subject,body,body_sha256:hash(body)},required_before_send:['independent_evidence_review','exact_message_owner_approval','interaction_ledger','passport','provider_and_channel_policy'],
   draft_is_not_quote_or_permission:true});
 }
 return {schema:'evercraft.systemia.demand-offer-preparation.v1',review_only:true,external_effects_authorized:false,
  counts:{signals:signals.length,reviewed_drafts:rows.filter(r=>r.draft!==null).length,held:rows.filter(r=>r.draft===null).length},rows};
}
