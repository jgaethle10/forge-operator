import assert from "node:assert/strict";
import {
  evaluateTimingFragility,
  runTimingFragilityLab,
} from "./edge-timing-fragility.mjs";

const candidate = {
  signal_key: "ai_models|sec_8_k|SOXX|1d",
  rockies_range: "ai_models",
  observation_kind: "sec_8_k",
  benchmark: "SPY",
  status: "RESEARCH_CANDIDATE",
  learned_direction: "POSITIVE_EXCESS_RETURN",
};

const rows = Array.from({ length: 60 }, (_, i) => ({
  measurement_id: "timing:" + i,
  source_observation_id: "obs:" + i,
  signal_key: candidate.signal_key,
  origin_entity_ref: "issuer:" + (i % 6),
  execution_delay_stress: {
    "5m": { forward_return: 0.012, benchmark_return: 0.002 },
    "15m": { forward_return: 0.010, benchmark_return: 0.002 },
    "30m": { forward_return: 0.008, benchmark_return: 0.002 },
    "60m": { forward_return: 0.007, benchmark_return: 0.002 },
    "90m": { forward_return: 0.006, benchmark_return: 0.002 },
    next_session_open: { forward_return: 0.0065, benchmark_return: 0.002 },
  },
}));

const robust = evaluateTimingFragility(candidate, rows, { transaction_cost_bps: 20 });
assert.equal(robust.timing_status, "TIMING_ROBUST_DIAGNOSTIC");
assert.equal(robust.extended_timing_status, "EXTENDED_TIMING_ROBUST_DIAGNOSTIC");
assert.equal(robust.checks.survives_30m_delay, true);
assert.equal(robust.exploratory_checks.survives_60m_delay, true);
assert.equal(robust.exploratory_checks.survives_90m_delay, true);
assert.equal(robust.exploratory_checks.survives_next_session_open, true);
assert.equal(robust.checks.event_hit_rate_30m_above_half, true);
assert.equal(robust.eligibility_mutated, false);
assert.equal(robust.live_trade_authority, false);

const fragileRows = rows.map((row, i) => ({
  ...row,
  execution_delay_stress: {
    ...row.execution_delay_stress,
    "30m": {
      forward_return: i % 3 === 0 ? 0.004 : -0.010,
      benchmark_return: 0.002,
    },
  },
}));
const fragile = evaluateTimingFragility(candidate, fragileRows, { transaction_cost_bps: 20 });
assert.equal(fragile.timing_status, "TIMING_FRAGILE_DIAGNOSTIC");
assert.equal(fragile.extended_timing_status, "EXTENDED_TIMING_FRAGILE_DIAGNOSTIC");
assert.equal(fragile.checks.survives_30m_delay, false);

const lateFragileRows = rows.map((row, i) => ({
  ...row,
  execution_delay_stress: {
    ...row.execution_delay_stress,
    next_session_open: {
      forward_return: i % 4 === 0 ? 0.004 : -0.006,
      benchmark_return: 0.002,
    },
  },
}));
const lateFragile = evaluateTimingFragility(candidate, lateFragileRows, {
  transaction_cost_bps: 20,
});
assert.equal(lateFragile.timing_status, "TIMING_ROBUST_DIAGNOSTIC");
assert.equal(
  lateFragile.extended_timing_status,
  "EXTENDED_TIMING_FRAGILE_DIAGNOSTIC"
);
assert.equal(lateFragile.exploratory_checks.survives_next_session_open, false);

const negativeCandidate = {
  ...candidate,
  signal_key: "ai_models|sec_8_k|SOXX|negative",
  learned_direction: "NEGATIVE_EXCESS_RETURN",
};
const negativeRows = rows.map((row, i) => ({
  ...row,
  measurement_id: "negative:" + i,
  signal_key: negativeCandidate.signal_key,
  execution_delay_stress: {
    "5m": { forward_return: -0.012, benchmark_return: 0 },
    "15m": { forward_return: -0.010, benchmark_return: 0 },
    "30m": { forward_return: -0.008, benchmark_return: 0 },
    "60m": { forward_return: -0.007, benchmark_return: 0 },
    "90m": { forward_return: -0.006, benchmark_return: 0 },
    next_session_open: { forward_return: -0.0065, benchmark_return: 0 },
  },
}));
const negative = evaluateTimingFragility(negativeCandidate, negativeRows, {
  transaction_cost_bps: 20,
});
assert.equal(negative.timing_status, "TIMING_ROBUST_DIAGNOSTIC");
assert.equal(negative.extended_timing_status, "EXTENDED_TIMING_ROBUST_DIAGNOSTIC");

const report = runTimingFragilityLab({
  evaluations: [candidate],
  measurements: rows,
});
assert.equal(report.candidate_count, 1);
assert.equal(report.timing_robust_count, 1);
assert.equal(report.extended_timing_robust_count, 1);
assert.equal(report.candidate_cluster_count, 1);
assert.equal(report.clusters[0].correlated_members_not_independent_edges, true);
assert.equal(report.historical_diagnostic_only, true);
assert.equal(report.historical_exploratory_only, true);
assert.equal(report.live_trade_authority, false);

console.log(JSON.stringify({
  ok: true,
  schema: "evercraft.daytrade.edge-timing-fragility-proof.v2",
  delayed_entry_5m: true,
  delayed_entry_15m: true,
  delayed_entry_30m: true,
  delayed_entry_60m: true,
  delayed_entry_90m: true,
  next_session_open_execution_stress: true,
  deterministic_publication_jitter: true,
  origin_balanced_delay_stress: true,
  cluster_dependence_preserved: true,
  historical_diagnostic_only: true,
  exploratory_only: true,
  eligibility_mutated: false,
  live_trade_authority: false,
}));
