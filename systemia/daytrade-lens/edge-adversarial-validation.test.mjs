import assert from "node:assert/strict";
import {
  leaveOneOriginOut,
  splitByCalendarPeriod,
  clusterCandidateEvaluations,
  adversarialValidateCandidates,
} from "./edge-adversarial-validation.mjs";

const measurements = [];
for (let i = 0; i < 48; i++) {
  measurements.push({
    signal_key: "ai_models|sec_8_k|SOXX|1d",
    rockies_range: "ai_models",
    observation_kind: "sec_8_k",
    instrument: "SOXX",
    benchmark: "SPY",
    lag_key: "1d",
    origin_entity_ref: "sec:cik:" + String(i % 6),
    observed_at: new Date(Date.UTC(2025 + Math.floor(i / 24), (i % 12), 15)).toISOString(),
    forward_return: 0.010 + (i % 3) * 0.001,
    benchmark_return: 0.002,
  });
}

const loo = leaveOneOriginOut(measurements, { transaction_cost_bps: 2, expected_sign: 1 });
assert.equal(loo.origin_count, 6);
assert.equal(loo.all_signs_preserved, true);

const q = splitByCalendarPeriod(measurements, {
  transaction_cost_bps: 2,
  expected_sign: 1,
  period: "quarter",
});
assert.ok(q.period_count >= 4);
assert.equal(q.sign_preservation_rate, 1);

const evaluations = [{
  signal_key: "ai_models|sec_8_k|SOXX|1d",
  rockies_range: "ai_models",
  observation_kind: "sec_8_k",
  instrument: "SOXX",
  benchmark: "SPY",
  lag_key: "1d",
  status: "RESEARCH_CANDIDATE",
  learned_direction: "POSITIVE_EXCESS_RETURN",
  development_q_bh: 0.01,
  holdout_origin_entities: 6,
  candidate_checks: { false_discovery_rate_pass: true },
}];

const clusters = clusterCandidateEvaluations(evaluations);
assert.equal(clusters.length, 1);
assert.equal(clusters[0].candidate_count, 1);

const review = adversarialValidateCandidates({ evaluations, measurements }, {
  transaction_cost_bps: 2,
});
assert.equal(review.candidate_count, 1);
assert.equal(review.candidate_cluster_count, 1);
assert.equal(review.forward_paper_eligible_count, 1);
assert.equal(review.live_trade_authority, false);

const poisoned = measurements.map((row, i) => i % 6 === 0 ? {
  ...row,
  forward_return: -0.20,
} : row);
const rejected = adversarialValidateCandidates({ evaluations, measurements: poisoned }, {
  transaction_cost_bps: 2,
});
assert.equal(rejected.forward_paper_eligible_count, 0);

console.log(JSON.stringify({
  ok: true,
  schema: "evercraft.daytrade.edge-adversarial-proof.v1",
  candidate_clustering: true,
  leave_one_origin_out: true,
  calendar_regime_splits: true,
  forward_paper_gate_only: true,
  live_trade_authority: false,
}));


assert.throws(
  () => adversarialValidateCandidates({ evaluations, measurements: [] }, {
    transaction_cost_bps: 2,
  }),
  /edge_adversarial_measurement_evidence_missing/
);
