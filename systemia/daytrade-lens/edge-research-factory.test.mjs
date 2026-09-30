import assert from "node:assert/strict";
import {
  FIVE_MINUTE_LAG_BARS,
  measureRockiesHypotheses,
  evaluateEdgeFamilies,
  benjaminiHochberg,
} from "./edge-research-factory.mjs";

function bars(start, count, drift) {
  const out = [];
  let price = 100;
  for (let i = 0; i < count; i++) {
    price *= 1 + drift;
    out.push({
      t: new Date(Date.parse(start) + i * 5 * 60_000).toISOString(),
      c: price,
    });
  }
  return out;
}

const hypothesis = {
  hypothesis_id: "edgehyp:proof",
  source_observation_id: "ctxobs:proof",
  observed_at: "2026-09-01T13:30:00Z",
  rockies_range: "grid_energy",
  observation_kind: "grid_stress",
  research_instruments: ["XLU"],
  lag_windows: [{ key: "15m", minutes: 15 }],
  source_family: "regional_grid_operators",
  independent_source_family_count: 2,
  provenance_refs: ["public:grid:proof"],
  evidence_state: "verified",
  anomaly_score: 0.8,
  source_reliability: 0.9,
};

const measured = measureRockiesHypotheses([hypothesis], {
  XLU: bars("2026-09-01T13:30:00Z", 10, 0.002),
  SPY: bars("2026-09-01T13:30:00Z", 10, 0.0005),
});
assert.equal(measured.length, 1);
assert.equal(measured[0].lag_bars, FIVE_MINUTE_LAG_BARS["15m"]);
assert.equal(measured[0].live_trade_authority, false);
assert.equal(measured[0].instrument_start_time >= hypothesis.observed_at, true);

const many = [];
for (let i = 0; i < 50; i++) {
  many.push({
    ...measured[0],
    measurement_id: "m:" + i,
    source_observation_id: "o:" + i,
    observed_at: new Date(Date.parse("2026-01-01T15:00:00Z") + i * 86400000).toISOString(),
    source_family: i % 2 ? "grid_operator" : "utility_public_status",
    forward_return: (i < 35 ? 0.0030 : 0.0025) + (i % 5) * 0.0001,
    benchmark_return: 0.0005 + (i % 3) * 0.00002,
  });
}
const evaluated = evaluateEdgeFamilies(many, {
  transaction_cost_bps: 2,
  false_discovery_rate: 0.10,
});
assert.equal(evaluated.length, 1);
assert.equal(evaluated[0].distinct_source_families, 2);
assert.equal(evaluated[0].candidate_checks.minimum_source_family_diversity, true);
assert.equal(evaluated[0].status, "RESEARCH_CANDIDATE");
assert.equal(evaluated[0].live_trade_authority, false);

const oneSource = many.map((row) => ({ ...row, source_family: "one_source" }));
const rejected = evaluateEdgeFamilies(oneSource, {
  transaction_cost_bps: 2,
  false_discovery_rate: 0.10,
});
assert.equal(rejected[0].candidate_checks.minimum_source_family_diversity, false);
assert.equal(rejected[0].status, "NOT_VALIDATED");

const bh = benjaminiHochberg([
  { id: "a", development_p_approx: 0.001 },
  { id: "b", development_p_approx: 0.02 },
  { id: "c", development_p_approx: 0.20 },
]);
assert.ok(bh[0].development_q_bh <= bh[1].development_q_bh);
assert.ok(bh[1].development_q_bh <= bh[2].development_q_bh);

console.log(JSON.stringify({
  ok: true,
  schema: "evercraft.daytrade.edge-research-factory-proof.v1",
  no_lookahead: true,
  benchmark_adjusted: true,
  source_diversity_required: true,
  false_discovery_control: "benjamini_hochberg",
  live_trade_authority: false,
}));
