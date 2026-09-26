import assert from 'node:assert/strict';
import { classifyIBMiDirectBuyerEvidence } from './ibmi-direct-buyer-signal.mjs';

const generic = classifyIBMiDirectBuyerEvidence({
  company:'Example Manufacturing',
  url:'https://example.com/careers/ibmi',
  source_type:'official_company',
  text:'Join our team as an IBM i programmer. Maintain RPGLE, SQLRPGLE, CL and DB2 applications, APIs and existing business systems.',
  observed_at:'2026-09-25T20:00:00Z',
});

assert.equal(generic.technology_use_state,'observed_public_strong');
assert.equal(generic.release_state,'unknown');
assert.equal(generic.observed_release,null);
assert.equal(generic.buying_intent_state,'unknown');
assert.equal(generic.upgrade_need_state,'unknown');
assert.equal(generic.recommended_offer_key,'ibmi_estate_xray_250');
assert.equal(generic.human_review_required,true);
assert(generic.score >= 75);

const v74 = classifyIBMiDirectBuyerEvidence({
  company:'Example Distribution',
  url:'https://example.com/modernization',
  source_type:'official_company',
  text:'Our IBM i 7.4 estate includes RPG IV, CL, DB2 and EDI workloads. We are planning an upgrade and modernization program.',
  observed_at:'2026-09-25T20:00:00Z',
});
assert.equal(v74.release_state,'observed_public_exact_release');
assert.equal(v74.observed_release,'7.4');
assert.equal(v74.recommended_offer_key,'ibmi_74_deadline_xray_250');
assert.equal(v74.upgrade_need_state,'possible_public_signal_not_confirmed');

const weak = classifyIBMiDirectBuyerEvidence({
  company:'Example',
  source_type:'job_board',
  text:'SQL developer wanted for cloud applications.',
  observed_at:'2026-09-25T20:00:00Z',
});
assert.equal(weak.technology_use_state,'not_established');
assert.equal(weak.outreach_state,'hold');

console.log(JSON.stringify({
  ok:true,
  generic_score:generic.score,
  generic_offer:generic.recommended_offer_key,
  exact_release_offer:v74.recommended_offer_key,
  inference_guard:generic.release_state,
}));
