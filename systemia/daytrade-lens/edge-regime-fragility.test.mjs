import assert from "node:assert/strict";
import {
  evaluateRegimeFragility,
  runRegimeFragilityLab,
} from "./edge-regime-fragility.mjs";

const candidate = {
  signal_key: "ai_models|sec_8_k|SOXX|1d",
  rockies_range: "ai_models",
  observation_kind: "sec_8_k",
  benchmark: "SPY",
  status: "RESEARCH_CANDIDATE",
  learned_direction: "POSITIVE_EXCESS_RETURN",
};

const rows = Array.from({ length: 60 }, (_, i) => ({
  measurement_id: "regime:" + i,
  signal_key: candidate.signal_key,
  origin_entity_ref: "issuer:" + (i % 6),
  forward_return: 0.012 + (i % 5) * 0.0002,
  benchmark_return: -0.006 + (i % 15) * 0.001,
  benchmark_realized_volatility_5m: 0.0005 + (i % 12) * 0.00015,
  benchmark_opening_gap_return: ((i % 10) - 5) * 0.001,
  instrument_max_path_drawdown: -0.006 - (i % 4) * 0.001,
  instrument_max_path_gain: 0.015 + (i % 4) * 0.001,
}));

const robust = evaluateRegimeFragility(candidate, rows, {
  transaction_cost_bps: 20,
  minimum_bucket_events: 8,
});
assert.equal(robust.regime_status, "REGIME_ROBUST_DIAGNOSTIC");
assert.equal(robust.market_direction_regimes.ready_bucket_count, 3);
assert.equal(robust.volatility_regimes.ready_bucket_count, 3);
assert.equal(
  robust.market_direction_regimes.leave_one_regime_out.all_positive,
  true
);
assert.equal(
  robust.volatility_regimes.leave_one_regime_out.all_positive,
  true
);
assert.ok(robust.gap_day_control.excluded > 0);
assert.ok(robust.adverse_excursion.observations > 0);
assert.equal(robust.eligibility_mutated, false);

const missingMetricRows = rows.map((row, i) => ({
  ...row,
  benchmark_opening_gap_return: i < 5 ? null : row.benchmark_opening_gap_return,
  benchmark_realized_volatility_5m:
    i < 4 ? null : row.benchmark_realized_volatility_5m,
  instrument_max_path_drawdown:
    i < 3 ? null : row.instrument_max_path_drawdown,
}));
const missingMetrics = evaluateRegimeFragility(candidate, missingMetricRows, {
  transaction_cost_bps: 20,
  minimum_bucket_events: 8,
});
assert.equal(missingMetrics.gap_day_control.missing_gap_observations, 5);
assert.equal(missingMetrics.gap_day_control.available_gap_observations, 55);
assert.equal(missingMetrics.adverse_excursion.observations, 57);

const fragileRows = rows.map((row, i) => ({
  ...row,
  forward_return:
    row.benchmark_realized_volatility_5m > 0.0015 ? -0.010 : 0.012,
}));
const fragile = evaluateRegimeFragility(candidate, fragileRows, {
  transaction_cost_bps: 20,
  minimum_bucket_events: 8,
});
assert.equal(fragile.regime_status, "REGIME_FRAGILE_DIAGNOSTIC");
assert.equal(
  fragile.checks.volatility_all_ready_regimes_positive,
  false
);

const negativeCandidate = {
  ...candidate,
  learned_direction: "NEGATIVE_EXCESS_RETURN",
};
const negativeRows = rows.map((row) => ({
  ...row,
  forward_return: -0.012,
  benchmark_return: 0,
  instrument_max_path_gain: 0.007,
  instrument_max_path_drawdown: -0.018,
}));
const negative = evaluateRegimeFragility(negativeCandidate, negativeRows, {
  transaction_cost_bps: 20,
  minimum_bucket_events: 8,
});
assert.ok(negative.adverse_excursion.mean_adverse_excursion < 0);
assert.equal(
  negative.adverse_excursion.direction_interpretation,
  "short_candidate_adverse_rally"
);

const lab = runRegimeFragilityLab({
  evaluations: [candidate],
  measurements: rows,
}, {
  transaction_cost_bps: 20,
  minimum_bucket_events: 8,
});
assert.equal(lab.candidate_count, 1);
assert.equal(lab.status_counts.REGIME_ROBUST_DIAGNOSTIC, 1);
assert.equal(lab.historical_exploratory_only, true);
assert.equal(lab.live_trade_authority, false);

console.log(JSON.stringify({
  ok:true,
  schema:"evercraft.daytrade.edge-regime-fragility-proof.v1",
  market_direction_regimes:true,
  realized_volatility_regimes:true,
  leave_one_regime_out:true,
  missing_metrics_never_zero:true,
  extreme_gap_day_exclusion:true,
  maximum_adverse_excursion:true,
  positive_and_negative_directions_supported:true,
  exploratory_only:true,
  eligibility_mutated:false,
  live_trade_authority:false,
}));
