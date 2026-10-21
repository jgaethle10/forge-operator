// Commercial decision queue: turns research plus audited funnel evidence into Systemia work CANDIDATES.
// This module neither fetches private accounts nor authorizes outreach or publication.
const stageOrder=['publisher','web','checkout','payments','shipping'];
const task=(kind,priority,nextGate,detail)=>({kind,priority,next_gate:nextGate,detail,
  systemia_admission_required:true,execution_authority:false,publication_authority:false,outreach_authority:false});
export function planCommercialDecisions({
 researchQueue={},scorecard={},liveOfferVerified=false,clipPostsVerified=false
}={}){
 const coverage=scorecard.coverage||{},counts=scorecard.counts||{};
 const work=(researchQueue.candidates||[]).slice(0,20).map(candidate=>{
  if(candidate.lane==='evidence_first_proof_candidate'){
   return {...task('validate_public_website_problem','P2','Systemia research review -> independent website canary -> Proof-First Sales Interaction Ledger',
    'Confirm specific public site issue remains present; determine buyer relevance and permission before messaging.'),
    candidate_id:candidate.id,provenance_refs:candidate.provenance_refs||[]};
  }
  return {...task('validate_market_hypothesis','P3','Systemia research review -> independent corroboration -> buyer discovery',
   'Investigate if this broad context corresponds to buyer needs. Do not infer an individual business has this problem.'),
   candidate_id:candidate.id,provenance_refs:candidate.provenance_refs||[]};
 });
 let bottleneck;
 if(!liveOfferVerified)bottleneck=task('verify_public_offer','P0','External mobile 200 + current visual + real checkout intent canary','Do not send more visitors to an unverified purchase path.');
 else if(!clipPostsVerified)bottleneck=task('verify_clip_distribution','P0','Authorized provider post IDs + public URLs + campaign tags','Staged graphics or captions do not prove actual distribution.');
 else {
  const missing=stageOrder.find(s=>coverage[s]!==true);
  if(missing)bottleneck=task('connect_'+missing+'_evidence','P0','Authorize a complete, source-authenticated measurement window','Unknown source coverage cannot be treated as zero or as conversion evidence.');
  else if(counts.web===0)bottleneck=task('acquire_qualified_visits','P1','Approved content experiment with real publishing receipts','Inspect authentic customer reach and audience fit; do not boost impressions blindly.');
  else if(counts.checkout===0)bottleneck=task('test_offer_clarity','P1','One change to proof/sample deliverable and attributed cohort measurement','Qualified visitors are not beginning checkout. Examine message-to-offer fit.');
  else if(counts.payments===0)bottleneck=task('diagnose_checkout_to_settlement','P0','Evercraft Payments provider-reconciled intent and settlement path','Checkout creation is not successful purchase. Inspect friction or payment failures.');
  else if(counts.shipping===0)bottleneck=task('diagnose_delivery','P0','Systemia Shipping verified completion','Payment without fulfilled audits is an operational debt, not a scalable acquisition loop.');
  else bottleneck=task('replicate_verified_cycle','P1','Multiple distinct provider-verified customer cohorts and acceptable unit economics','Repeat successful source-to-fulfillment cycle; inspect returns, costs and optional referrals.');
 }
 return {
  schema:'evercraft.systemia.commercial-decision-queue.v1',
  mission_key:'website-audit-first-closed-distribution-loop-2026-10-07',
  priority_decision:bottleneck,
  research_work_candidates:work,
  source_candidate_count:(researchQueue.candidates||[]).length,
  revenue_state:scorecard.state||'unobserved',
  source_reconciliation:'incomplete_until_authenticated_provider_adapters',
  external_action_authority:false,
  auto_publish_authority:false,
  auto_outreach_authority:false,
  allocation_rule:'Repair verified conversion and delivery bottlenecks before scaling research or impressions.'
 };
}
