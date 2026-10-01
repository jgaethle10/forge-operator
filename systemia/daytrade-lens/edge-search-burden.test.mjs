import assert from "node:assert/strict";
import { summarizeResearchSearchBurden } from "./edge-search-burden.mjs";

const report={
  evaluations:[
    {signal_key:"a",status:"RESEARCH_CANDIDATE",rockies_range:"ai_models",observation_kind:"sec_8_k",instrument:"SOXX",lag_key:"1d"},
    {signal_key:"b",status:"REJECTED",rockies_range:"ai_models",observation_kind:"sec_8_k",instrument:"SOXX",lag_key:"3d"},
    {signal_key:"c",status:"REJECTED",rockies_range:"semiconductors_compute",observation_kind:"sec_8_k",instrument:"SOXX",lag_key:"1d"},
    {signal_key:"d",status:"REJECTED",rockies_range:"semiconductors_compute",observation_kind:"sec_10_q",instrument:"QQQ",lag_key:"1d"},
  ]
};

const receipt=summarizeResearchSearchBurden(report);
assert.equal(receipt.signal_family_count,4);
assert.equal(receipt.research_candidate_count,1);
assert.equal(receipt.candidate_share,0.25);
assert.equal(receipt.variants_per_candidate,4);
assert.equal(receipt.multiple_testing_reference.bonferroni_per_family_alpha,0.0125);
assert.ok(receipt.multiple_testing_reference.sidak_per_family_alpha_if_independent>0);
assert.ok(receipt.multiple_testing_reference.probability_at_least_one_false_positive_if_all_families_independent>0.18);
assert.equal(receipt.multiple_testing_reference.independence_assumption_is_not_claimed,true);
assert.equal(receipt.doctrine.survivor_count_is_never_the_search_denominator,true);
assert.equal(receipt.doctrine.eligibility_mutated,false);
assert.equal(receipt.doctrine.live_trade_authority,false);

console.log(JSON.stringify({
  ok:true,
  schema:"evercraft.daytrade.edge-search-burden-proof.v1",
  full_trial_denominator:true,
  bonferroni_reference:true,
  sidak_reference_labeled_independence_only:true,
  survivor_denominator_forbidden:true,
  eligibility_mutated:false,
  live_trade_authority:false
}));
