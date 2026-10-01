import assert from "node:assert/strict";
import {
  evaluateBenchmarkFragility,
  runBenchmarkFragilityLab,
} from "./edge-benchmark-fragility.mjs";

const candidate = {
  signal_key: "ai_models|sec_8_k|SOXX|1d",
  rockies_range: "ai_models",
  observation_kind: "sec_8_k",
  instrument: "SOXX",
  benchmark: "SPY",
  status: "RESEARCH_CANDIDATE",
  learned_direction: "POSITIVE_EXCESS_RETURN",
};

const rows = Array.from({ length: 60 }, (_, i) => ({
  measurement_id: "bench:" + i,
  signal_key: candidate.signal_key,
  origin_entity_ref: "issuer:" + (i % 6),
  forward_return: 0.014,
  benchmark_return: 0.002,
  alternate_benchmarks: {
    QQQ: { benchmark_return: 0.006 },
    SMH: { benchmark_return: 0.009 },
  },
}));

const robust = evaluateBenchmarkFragility(candidate, rows, {
  transaction_cost_bps: 20,
});
assert.equal(robust.benchmark_status, "BENCHMARK_ROBUST_DIAGNOSTIC");
assert.equal(robust.broad_tech_benchmark_robust, true);
assert.equal(robust.peer_benchmark_robust, true);

const broadOnlyRows = rows.map((row) => ({
  ...row,
  alternate_benchmarks: {
    QQQ: { benchmark_return: 0.006 },
    SMH: { benchmark_return: 0.0145 },
  },
}));
const broadOnly = evaluateBenchmarkFragility(candidate, broadOnlyRows, {
  transaction_cost_bps: 20,
});
assert.equal(broadOnly.benchmark_status, "BROAD_THEME_ONLY_DIAGNOSTIC");
assert.equal(broadOnly.broad_tech_benchmark_robust, true);
assert.equal(broadOnly.peer_benchmark_robust, false);

const fragileRows = rows.map((row) => ({
  ...row,
  alternate_benchmarks: {
    QQQ: { benchmark_return: 0.015 },
    SMH: { benchmark_return: 0.010 },
  },
}));
const fragile = evaluateBenchmarkFragility(candidate, fragileRows, {
  transaction_cost_bps: 20,
});
assert.equal(fragile.benchmark_status, "BENCHMARK_FRAGILE_DIAGNOSTIC");

const report = runBenchmarkFragilityLab({
  evaluations: [candidate],
  measurements: rows,
});
assert.equal(report.candidate_count, 1);
assert.equal(report.status_counts.BENCHMARK_ROBUST_DIAGNOSTIC, 1);
assert.equal(report.live_trade_authority, false);

console.log(JSON.stringify({
  ok: true,
  schema: "evercraft.daytrade.edge-benchmark-fragility-proof.v1",
  broad_tech_substitution: true,
  semiconductor_peer_substitution: true,
  origin_balanced_benchmark_test: true,
  broad_theme_only_classification: true,
  historical_diagnostic_only: true,
  live_trade_authority: false,
}));
