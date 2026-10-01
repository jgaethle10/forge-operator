import assert from "node:assert/strict";
import {
  selectNonOverlappingMeasurements,
  evaluateOverlapFragility,
  runOverlapFragilityLab,
} from "./edge-overlap-fragility.mjs";

const candidate = {
  signal_key: "ai_models|sec_8_k|SOXX|1d",
  rockies_range: "ai_models",
  observation_kind: "sec_8_k",
  benchmark: "SPY",
  status: "RESEARCH_CANDIDATE",
  learned_direction: "POSITIVE_EXCESS_RETURN",
};

const rows = Array.from({ length: 48 }, (_, i) => {
  const start = Date.parse("2026-01-02T14:30:00Z") + i * 2 * 86400000;
  return {
    measurement_id: "independent:" + i,
    signal_key: candidate.signal_key,
    observed_at: new Date(start - 60_000).toISOString(),
    origin_entity_ref: "issuer:" + (i % 6),
    forward_return: 0.012,
    benchmark_return: 0.002,
    instrument_start_time: new Date(start).toISOString(),
    instrument_end_time: new Date(start + 6 * 60 * 60 * 1000).toISOString(),
  };
});

const selection = selectNonOverlappingMeasurements(rows);
assert.equal(selection.selected.length, rows.length);

const robust = evaluateOverlapFragility(candidate, rows, {
  transaction_cost_bps: 20,
  minimum_non_overlapping_events: 20,
  minimum_distinct_origins: 5,
});
assert.equal(robust.overlap_status, "OVERLAP_ROBUST_DIAGNOSTIC");
assert.equal(robust.non_overlapping_measurements, 48);
assert.ok(robust.mean_signed_net_non_overlapping > 0);

const overlapped = Array.from({ length: 48 }, (_, i) => {
  const block = Math.floor(i / 6);
  const start = Date.parse("2026-01-02T14:30:00Z") + block * 6 * 86400000 + (i % 6) * 60_000;
  return {
    ...rows[i],
    measurement_id: "overlap:" + i,
    instrument_start_time: new Date(start).toISOString(),
    instrument_end_time: new Date(start + 5 * 86400000).toISOString(),
  };
});
const fragile = evaluateOverlapFragility(candidate, overlapped, {
  transaction_cost_bps: 20,
  minimum_non_overlapping_events: 20,
  minimum_distinct_origins: 5,
});
assert.equal(fragile.overlap_status, "OVERLAP_FRAGILE_DIAGNOSTIC");
assert.ok(fragile.non_overlapping_measurements < 20);
assert.ok(fragile.retention_rate < 0.5);

const report = runOverlapFragilityLab({
  evaluations: [candidate],
  measurements: rows,
});
assert.equal(report.candidate_count, 1);
assert.equal(report.overlap_robust_count, 1);
assert.equal(report.candidate_cluster_count, 1);
assert.equal(report.clusters[0].correlated_members_not_independent_edges, true);
assert.equal(report.live_trade_authority, false);

console.log(JSON.stringify({
  ok: true,
  schema: "evercraft.daytrade.edge-overlap-fragility-proof.v1",
  interval_purge: true,
  effective_sample_size: true,
  distinct_origin_requirement: true,
  cluster_dependence_preserved: true,
  historical_diagnostic_only: true,
  live_trade_authority: false,
}));
