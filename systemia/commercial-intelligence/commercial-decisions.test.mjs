import test from 'node:test';
import assert from 'node:assert/strict';
import {planCommercialDecisions} from './commercial-decisions.mjs';
const all={publisher:true,web:true,checkout:true,payments:true,shipping:true};
const input=(counts,coverage=all)=>({scorecard:{coverage,counts,state:'observed'}});
const ready={liveOfferVerified:true,clipPostsVerified:true};
test('never claims revenue from researched signals with unverified storefront',()=>{
 const r=planCommercialDecisions({researchQueue:{candidates:[{id:'signal-1',lane:'market_research_question',provenance_refs:['https://example.gov']}]},...input({})});
 assert.equal(r.priority_decision.kind,'verify_public_offer');
 assert.equal(r.research_work_candidates[0].kind,'validate_market_hypothesis');
 assert.equal(r.research_work_candidates[0].outreach_authority,false);
});
test('clip publication receipts are a hard gate after storefront verification',()=>{
 const r=planCommercialDecisions({liveOfferVerified:true,...input({})});
 assert.equal(r.priority_decision.kind,'verify_clip_distribution');
});
test('unknown payment coverage triggers instrumentation not declaration of zero sales',()=>{
 const r=planCommercialDecisions({...ready,...input({web:10,publisher:100,checkout:2,payments:null,shipping:0},{...all,payments:false})});
 assert.equal(r.priority_decision.kind,'connect_payments_evidence');
});
test('concrete zero-value bottlenecks select the right operating work',()=>{
 assert.equal(planCommercialDecisions({...ready,...input({publisher:30,web:5,checkout:0,payments:0,shipping:0})}).priority_decision.kind,'test_offer_clarity');
 assert.equal(planCommercialDecisions({...ready,...input({publisher:30,web:5,checkout:2,payments:0,shipping:0})}).priority_decision.kind,'diagnose_checkout_to_settlement');
 assert.equal(planCommercialDecisions({...ready,...input({publisher:30,web:5,checkout:2,payments:1,shipping:0})}).priority_decision.kind,'diagnose_delivery');
 assert.equal(planCommercialDecisions({...ready,...input({publisher:30,web:5,checkout:2,payments:1,shipping:1})}).priority_decision.kind,'replicate_verified_cycle');
});
