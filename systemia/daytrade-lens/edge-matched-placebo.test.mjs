import assert from "node:assert/strict";
import {
  evaluateMatchedPlacebo,
  runMatchedPlaceboLab,
} from "./edge-matched-placebo.mjs";

const candidate = {
  signal_key: "ai_models|sec_8_k|SOXX|1d",
  rockies_range: "ai_models",
  observation_kind: "sec_8_k",
  benchmark: "SPY",
  status: "RESEARCH_CANDIDATE",
  learned_direction: "POSITIVE_EXCESS_RETURN",
};

const actual = Array.from({ length: 30 }, (_, i) => ({
  measurement_id: "actual:" + i,
  signal_key: candidate.signal_key,
  source_observation_id: "obs:" + i,
  origin_entity_ref: "issuer:" + (i % 6),
  forward_return: 0.014,
  benchmark_return: 0.002,
}));

const placebo = actual.flatMap((row, i) => [-7, 7].map((offset) => ({
  measurement_id: "placebo:" + i + ":" + offset,
  signal_key: candidate.signal_key,
  source_observation_id: "fake:" + i + ":" + offset,
  placebo_for_source_observation_id: row.source_observation_id,
  placebo_offset_days: offset,
  origin_entity_ref: row.origin_entity_ref,
  forward_return: 0.004,
  benchmark_return: 0.002,
})));

const separated = evaluateMatchedPlacebo(candidate, actual, placebo, {
  transaction_cost_bps: 20,
});
assert.equal(separated.placebo_status, "PLACEBO_SEPARATED_DIAGNOSTIC");
assert.ok(separated.mean_actual_minus_placebo > 0);
assert.equal(separated.checks.both_offsets_present, true);

const fakeAlpha = placebo.map((row) => ({
  ...row,
  forward_return: 0.016,
}));
const notSeparated = evaluateMatchedPlacebo(candidate, actual, fakeAlpha, {
  transaction_cost_bps: 20,
});
assert.equal(notSeparated.placebo_status, "PLACEBO_NOT_SEPARATED_DIAGNOSTIC");
assert.ok(notSeparated.mean_actual_minus_placebo < 0);

const negativeCandidate = {
  ...candidate,
  signal_key: "ai_models|sec_8_k|SOXX|negative",
  learned_direction: "NEGATIVE_EXCESS_RETURN",
};
const negativeActual = actual.map((row, i) => ({
  ...row,
  measurement_id: "negative-actual:" + i,
  signal_key: negativeCandidate.signal_key,
  forward_return: -0.014,
  benchmark_return: 0,
}));
const negativePlacebo = negativeActual.flatMap((row, i) => [-7, 7].map((offset) => ({
  measurement_id: "negative-placebo:" + i + ":" + offset,
  signal_key: negativeCandidate.signal_key,
  source_observation_id: "negative-fake:" + i + ":" + offset,
  placebo_for_source_observation_id: row.source_observation_id,
  placebo_offset_days: offset,
  origin_entity_ref: row.origin_entity_ref,
  forward_return: -0.003,
  benchmark_return: 0,
})));
assert.equal(
  evaluateMatchedPlacebo(negativeCandidate, negativeActual, negativePlacebo, {
    transaction_cost_bps: 20,
  }).placebo_status,
  "PLACEBO_SEPARATED_DIAGNOSTIC"
);

const report = runMatchedPlaceboLab({
  evaluations: [candidate],
  measurements: actual,
  placebo_measurements: placebo,
});
assert.equal(report.candidate_count, 1);
assert.equal(report.placebo_separated_count, 1);
assert.equal(report.candidate_cluster_count, 1);
assert.equal(report.clusters[0].correlated_members_not_independent_edges, true);
assert.equal(report.live_trade_authority, false);

console.log(JSON.stringify({
  ok: true,
  schema: "evercraft.daytrade.edge-matched-placebo-proof.v1",
  matched_same_signal_controls: true,
  one_week_pre_event_control: true,
  one_week_post_event_control: true,
  paired_advantage_required: true,
  negative_direction_supported: true,
  historical_diagnostic_only: true,
  live_trade_authority: false,
}));
