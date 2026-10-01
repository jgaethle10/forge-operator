import assert from "node:assert/strict";
import {
  rockiesObservationToEdgeHypotheses,
  evaluateRockiesEdgeCandidate,
  marketRelevantRockiesRanges,
} from "./rockies-edge-fabric.mjs";

const observation = {
  source_system: "rockies",
  source_family: "port_authorities",
  observed_at: "2026-09-01T15:00:00Z",
  region_keys: ["us-west"],
  domains: ["maritime", "supply_chain"],
  kind: "flow_anomaly",
  evidence_state: "verified",
  reliability: 0.9,
  anomaly_score: 0.8,
  summary: "Port dwell time materially above learned baseline.",
  provenance_refs: ["public:port-status:proof"],
  correlation_keys: ["us-west::supply-chain::port-flow"],
  facts: { direction: "worse_than_baseline" },
  metadata: { rockies_range: "maritime", market_symbols: ["MATX"] },
};

const hypotheses = rockiesObservationToEdgeHypotheses(observation, {
  independent_source_family_count: 3,
});
assert.equal(hypotheses.length, 1);
assert.ok(hypotheses.some((x) => x.rockies_range === "maritime"));
assert.equal(hypotheses.some((x) => x.rockies_range === "supply_chain"), false);
assert.ok(hypotheses.every((x) => x.research_instruments.includes("MATX")));

const expanded = rockiesObservationToEdgeHypotheses({
  ...observation,
  metadata: {
    ...observation.metadata,
    allow_domain_range_expansion: true,
  },
}, {
  independent_source_family_count: 3,
});
assert.ok(expanded.some((x) => x.rockies_range === "maritime"));
assert.ok(expanded.some((x) => x.rockies_range === "supply_chain"));
assert.ok(hypotheses.every((x) => x.direction === "LEARN_FROM_DATA"));
assert.ok(hypotheses.every((x) => x.constraints.no_live_trade_instruction === true));
assert.ok(hypotheses.every((x) => x.provenance_refs.length === 1));

const weak = rockiesObservationToEdgeHypotheses({
  ...observation,
  anomaly_score: 0.1,
});
assert.deepEqual(weak, []);

const goodSamples = Array.from({ length: 50 }, (_, i) => ({
  observed_at: new Date(Date.parse("2026-01-01T15:00:00Z") + i * 86400000).toISOString(),
  forward_return: i % 4 === 0 ? 0.0010 : 0.0030,
  benchmark_return: 0.0005,
}));
const good = evaluateRockiesEdgeCandidate(goodSamples, { transaction_cost_bps: 2 });
assert.equal(good.status, "RESEARCH_CANDIDATE");
assert.equal(good.edge_claimed, false);
assert.equal(good.live_trade_authority, false);
assert.equal(good.learned_direction, "POSITIVE_EXCESS_RETURN");


const mixedPositive = Array.from({ length: 50 }, (_, i) => ({
  observed_at: new Date(Date.parse("2026-03-01T15:00:00Z") + i * 86400000).toISOString(),
  forward_return: i % 5 === 0 ? -0.004 : 0.004,
  benchmark_return: 0,
}));
const mixedNoCost = evaluateRockiesEdgeCandidate(mixedPositive, { transaction_cost_bps: 0 });
const mixedWithCost = evaluateRockiesEdgeCandidate(mixedPositive, { transaction_cost_bps: 20 });
assert.ok(mixedNoCost.overall.mean_strategy_return_net > mixedWithCost.overall.mean_strategy_return_net);
assert.ok(
  Math.abs(
    (mixedNoCost.overall.mean_strategy_return_net - mixedWithCost.overall.mean_strategy_return_net) - 0.002
  ) < 1e-12
);

const negativeSamples = Array.from({ length: 50 }, (_, i) => ({
  observed_at: new Date(Date.parse("2026-05-01T15:00:00Z") + i * 86400000).toISOString(),
  forward_return: i % 5 === 0 ? 0.002 : -0.006,
  benchmark_return: 0,
}));
const negativeCandidate = evaluateRockiesEdgeCandidate(negativeSamples, { transaction_cost_bps: 20 });
assert.equal(negativeCandidate.status, "RESEARCH_CANDIDATE");
assert.equal(negativeCandidate.learned_direction, "NEGATIVE_EXCESS_RETURN");
assert.ok(negativeCandidate.overall.mean_strategy_return_net > 0);

const overfit = Array.from({ length: 50 }, (_, i) => ({
  observed_at: new Date(Date.parse("2026-01-01T15:00:00Z") + i * 86400000).toISOString(),
  forward_return: i < 35 ? 0.003 : -0.003,
  benchmark_return: 0,
}));
const failed = evaluateRockiesEdgeCandidate(overfit, { transaction_cost_bps: 2 });
assert.equal(failed.status, "NOT_VALIDATED");
assert.equal(failed.checks.train_holdout_sign_agreement, false);

const ranges = marketRelevantRockiesRanges();
assert.ok(ranges.length >= 15);
assert.ok(ranges.some((x) => x.range === "semiconductors_compute"));
assert.ok(ranges.some((x) => x.range === "grid_energy"));

console.log(JSON.stringify({
  ok: true,
  schema: "evercraft.daytrade.rockies-edge-fabric-proof.v1",
  hypothesis_direction_is_learned: true,
  provenance_preserved: true,
  holdout_required: true,
  overfit_candidate_rejected: true,
  live_trade_authority: false,
  mapped_ranges: ranges.length,
}));
