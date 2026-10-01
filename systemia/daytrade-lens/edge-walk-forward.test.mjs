import assert from "node:assert/strict";
import {
  evaluateWalkForward,
  runWalkForwardLab,
} from "./edge-walk-forward.mjs";

const candidate = {
  signal_key: "ai_models|sec_8_k|SOXX|1d",
  rockies_range: "ai_models",
  observation_kind: "sec_8_k",
  benchmark: "SPY",
  status: "RESEARCH_CANDIDATE",
  learned_direction: "POSITIVE_EXCESS_RETURN",
};

const rows = Array.from({ length: 72 }, (_, i) => {
  const observed = Date.parse("2025-01-02T15:00:00Z") + i * 4 * 86400000;
  return {
    measurement_id: "wf:" + i,
    signal_key: candidate.signal_key,
    observed_at: new Date(observed).toISOString(),
    origin_entity_ref: "issuer:" + (i % 6),
    forward_return: 0.012 + (i % 4) * 0.0005,
    benchmark_return: 0.002,
    instrument_start_time: new Date(observed + 5 * 60_000).toISOString(),
    instrument_end_time: new Date(observed + 6 * 60 * 60 * 1000).toISOString(),
  };
});

const robust = evaluateWalkForward(candidate, rows, {
  transaction_cost_bps: 20,
  minimum_test_events: 8,
  minimum_distinct_test_origins: 3,
});
assert.equal(robust.usable_fold_count, 3);
assert.equal(robust.passing_fold_count, 3);
assert.equal(robust.walk_forward_status, "WALK_FORWARD_ROBUST_DIAGNOSTIC");
assert.ok(robust.folds.every((fold) => fold.test_mean_signed_net > 0));

const lateCollapse = rows.map((row, i) => i >= 60 ? {
  ...row,
  forward_return: -0.020,
} : row);
const fragile = evaluateWalkForward(candidate, lateCollapse, {
  transaction_cost_bps: 20,
  minimum_test_events: 8,
  minimum_distinct_test_origins: 3,
});
assert.equal(fragile.walk_forward_status, "WALK_FORWARD_FRAGILE_DIAGNOSTIC");
assert.ok(fragile.passing_fold_count < 3);

const overlapRows = rows.map((row, i) => {
  if (i !== 36) return row;
  return {
    ...row,
    instrument_start_time: rows[35].instrument_start_time,
  };
});
const purged = evaluateWalkForward(candidate, overlapRows, {
  transaction_cost_bps: 20,
  minimum_test_events: 7,
  minimum_distinct_test_origins: 3,
});
assert.ok(purged.folds.some((fold) => fold.purged_for_overlap > 0));

const report = runWalkForwardLab({
  evaluations: [candidate],
  measurements: rows,
});
assert.equal(report.candidate_count, 1);
assert.equal(report.walk_forward_robust_count, 1);
assert.equal(report.candidate_cluster_count, 1);
assert.equal(report.clusters[0].correlated_members_not_independent_edges, true);
assert.equal(report.live_trade_authority, false);

console.log(JSON.stringify({
  ok: true,
  schema: "evercraft.daytrade.edge-walk-forward-proof.v1",
  expanding_walk_forward:true,
  fixed_three_fold_policy:true,
  overlap_boundary_purge:true,
  late_regime_collapse_detected:true,
  correlated_cluster_reporting:true,
  historical_diagnostic_only:true,
  live_trade_authority:false,
}));
