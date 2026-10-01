import assert from "node:assert/strict";
import {
  evaluateRandomPlacebo,
  runRandomPlaceboLab,
} from "./edge-random-placebo.mjs";

const candidate = {
  signal_key: "ai_models|sec_8_k|SOXX|1d",
  rockies_range: "ai_models",
  observation_kind: "sec_8_k",
  benchmark: "SPY",
  status: "RESEARCH_CANDIDATE",
  learned_direction: "POSITIVE_EXCESS_RETURN",
};

const actual = Array.from({ length: 30 }, (_, i) => ({
  measurement_id: "a:" + i,
  source_observation_id: "obs:" + i,
  signal_key: candidate.signal_key,
  origin_entity_ref: "issuer:" + (i % 6),
  forward_return: 0.012,
  benchmark_return: 0.002,
}));

const offsets = [-35,-28,-21,-14,14,21,28,35];
const placebo = actual.flatMap((row, i) => [0,1].map((j) => ({
  measurement_id: "p:" + i + ":" + j,
  source_observation_id: "random:" + i + ":" + j,
  placebo_for_source_observation_id: row.source_observation_id,
  placebo_offset_days: offsets[(i + j * 3) % offsets.length],
  placebo_scheme: "deterministic_random_calendar",
  signal_key: candidate.signal_key,
  origin_entity_ref: row.origin_entity_ref,
  forward_return: 0.003,
  benchmark_return: 0.002,
})));

const separated = evaluateRandomPlacebo(candidate, actual, placebo, {
  transaction_cost_bps: 20,
});
assert.equal(
  separated.random_placebo_status,
  "RANDOM_PLACEBO_SEPARATED_DIAGNOSTIC"
);
assert.ok(separated.distinct_offsets.length >= 4);
assert.ok(separated.mean_actual_minus_random_placebo > 0);
assert.equal(separated.eligibility_mutated, false);

const notSeparated = evaluateRandomPlacebo(
  candidate,
  actual,
  placebo.map((row) => ({ ...row, forward_return: 0.014 })),
  { transaction_cost_bps: 20 }
);
assert.equal(
  notSeparated.random_placebo_status,
  "RANDOM_PLACEBO_NOT_SEPARATED_DIAGNOSTIC"
);

const negativeCandidate = {
  ...candidate,
  learned_direction: "NEGATIVE_EXCESS_RETURN",
};
const negativeActual = actual.map((row) => ({
  ...row,
  forward_return: -0.012,
  benchmark_return: 0,
}));
const negativePlacebo = placebo.map((row) => ({
  ...row,
  forward_return: -0.002,
  benchmark_return: 0,
}));
assert.equal(
  evaluateRandomPlacebo(
    negativeCandidate,
    negativeActual,
    negativePlacebo,
    { transaction_cost_bps: 20 }
  ).random_placebo_status,
  "RANDOM_PLACEBO_SEPARATED_DIAGNOSTIC"
);

const lab = runRandomPlaceboLab({
  evaluations: [candidate],
  measurements: actual,
  random_placebo_measurements: placebo,
});
assert.equal(lab.candidate_count, 1);
assert.equal(lab.separated_count, 1);
assert.equal(lab.historical_exploratory_only, true);
assert.equal(lab.live_trade_authority, false);

console.log(JSON.stringify({
  ok:true,
  schema:"evercraft.daytrade.edge-random-placebo-proof.v1",
  deterministic_random_calendar_supported:true,
  same_issuer_pairing:true,
  paired_actual_minus_placebo:true,
  positive_and_negative_directions_supported:true,
  exploratory_only:true,
  eligibility_mutated:false,
  live_trade_authority:false,
}));
