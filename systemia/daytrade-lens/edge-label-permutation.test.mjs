import assert from "node:assert/strict";
import {
  evaluateLabelPermutation,
  runLabelPermutationLab,
} from "./edge-label-permutation.mjs";

const candidate = {
  signal_key: "ai_models|sec_8_k|SOXX|1d",
  rockies_range: "ai_models",
  observation_kind: "sec_8_k",
  benchmark: "SPY",
  status: "RESEARCH_CANDIDATE",
  learned_direction: "POSITIVE_EXCESS_RETURN",
};

const actual = Array.from({ length: 40 }, (_, i) => ({
  source_observation_id: "obs:" + i,
  signal_key: candidate.signal_key,
  origin_entity_ref: "issuer:" + (i % 8),
  forward_return: 0.015,
  benchmark_return: 0.002,
}));

const placebo = actual.flatMap((row, i) => [-7,7].map((offset) => ({
  source_observation_id: "placebo:" + i + ":" + offset,
  placebo_for_source_observation_id: row.source_observation_id,
  placebo_offset_days: offset,
  signal_key: candidate.signal_key,
  origin_entity_ref: row.origin_entity_ref,
  forward_return: 0.0025 + (i % 3) * 0.0001,
  benchmark_return: 0.002,
})));

const separated = evaluateLabelPermutation(candidate, actual, placebo, {
  transaction_cost_bps: 20,
  iterations: 2000,
  seed: "separated-proof",
});
assert.equal(separated.underlying_events, 40);
assert.equal(separated.distinct_origins, 8);
assert.ok(separated.observed_actual_minus_placebo > 0);
assert.ok(separated.label_permutation_p_value < 0.05);
assert.equal(separated.raw_status, "LABEL_PERMUTATION_SEPARATED_RAW");

const nullLike = evaluateLabelPermutation(
  candidate,
  actual,
  placebo.map((row) => ({ ...row, forward_return: 0.015 })),
  { transaction_cost_bps: 20, iterations: 1000, seed: "null-proof" }
);
assert.equal(nullLike.raw_status, "LABEL_PERMUTATION_NOT_SEPARATED_RAW");

const secondCandidate = {
  ...candidate,
  signal_key: "ai_models|sec_8_k|SMH|1d",
};
const secondActual = actual.map((row) => ({
  ...row,
  signal_key: secondCandidate.signal_key,
  source_observation_id: "smh:" + row.source_observation_id,
}));
const secondPlacebo = secondActual.flatMap((row, i) => [-7,7].map((offset) => ({
  source_observation_id: "smh-placebo:" + i + ":" + offset,
  placebo_for_source_observation_id: row.source_observation_id,
  placebo_offset_days: offset,
  signal_key: secondCandidate.signal_key,
  origin_entity_ref: row.origin_entity_ref,
  forward_return: 0.002,
  benchmark_return: 0.002,
})));

const lab = runLabelPermutationLab({
  evaluations: [candidate, secondCandidate],
  measurements: [...actual, ...secondActual],
  placebo_measurements: [...placebo, ...secondPlacebo],
}, {
  transaction_cost_bps: 20,
  iterations: 2000,
});
assert.equal(lab.candidate_count, 2);
assert.equal(lab.bh_separated_count, 2);
assert.equal(lab.bonferroni_separated_count, 2);
assert.equal(
  lab.family_multiple_testing_control,
  "benjamini_hochberg_plus_bonferroni_diagnostic"
);
assert.ok(lab.reviews.every((row) => row.label_permutation_q_bh < 0.05));
assert.equal(lab.historical_exploratory_only, true);
assert.equal(lab.live_trade_authority, false);

console.log(JSON.stringify({
  ok:true,
  schema:"evercraft.daytrade.edge-label-permutation-proof.v1",
  actual_placebo_labels_permuted_within_underlying_event:true,
  underlying_event_is_independence_unit:true,
  bh_family_correction:true,
  bonferroni_family_diagnostic:true,
  exploratory_only:true,
  eligibility_mutated:false,
  live_trade_authority:false,
}));
