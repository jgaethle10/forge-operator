import assert from "node:assert/strict";
import {
  freezeForwardPaperCohort,
  validateFrozenProtocol,
  scoreForwardPaperCohort,
} from "./edge-forward-paper.mjs";

const review = {
  signal_key: "ai_models|sec_8_k|SOXX|1d",
  cluster_key: "ai_models|sec_8_k|SPY",
  adversarial_status: "FORWARD_PAPER_ELIGIBLE",
};
const evaluation = {
  signal_key: review.signal_key,
  rockies_range: "ai_models",
  observation_kind: "sec_8_k",
  instrument: "SOXX",
  benchmark: "SPY",
  lag_key: "1d",
  learned_direction: "POSITIVE_EXCESS_RETURN",
};
const enrolled = "2026-10-01T00:00:00.000Z";
const protocol = freezeForwardPaperCohort(review, evaluation, {
  enrolled_at: enrolled,
  transaction_cost_bps: 5,
  minimum_forward_events: 2,
  minimum_distinct_origins: 2,
});
assert.equal(validateFrozenProtocol(protocol), true);
assert.equal(protocol.live_trade_authority, false);

assert.throws(() => validateFrozenProtocol({ ...protocol, lag_key: "5d" }), /protocol_mutated/);
assert.throws(() => freezeForwardPaperCohort({ ...review, adversarial_status: "REJECT_OR_RESEARCH_MORE" }, evaluation), /candidate_not_eligible/);

const rows = [
  { signal_key: review.signal_key, observed_at: "2026-09-30T20:00:00Z", origin_entity_ref: "old", forward_return: 1, benchmark_return: 0 },
  { signal_key: review.signal_key, observed_at: "2026-10-02T20:00:00Z", origin_entity_ref: "a", forward_return: 0.02, benchmark_return: 0.005 },
  { signal_key: review.signal_key, observed_at: "2026-10-03T20:00:00Z", origin_entity_ref: "b", forward_return: 0.015, benchmark_return: 0.005 },
];
const score = scoreForwardPaperCohort(protocol, rows);
assert.equal(score.forward_events, 2);
assert.equal(score.distinct_origins, 2);
assert.equal(score.status, "FORWARD_PAPER_PASS");
assert.equal(score.live_trade_authority, false);


const negativeEvaluation = {
  ...evaluation,
  signal_key: "ai_models|sec_8_k|SOXX|negative",
  learned_direction: "NEGATIVE_EXCESS_RETURN",
};
const negativeReview = {
  ...review,
  signal_key: negativeEvaluation.signal_key,
};
const negativeProtocol = freezeForwardPaperCohort(negativeReview, negativeEvaluation, {
  enrolled_at: enrolled,
  transaction_cost_bps: 20,
  minimum_forward_events: 2,
  minimum_distinct_origins: 2,
});
const negativeScore = scoreForwardPaperCohort(negativeProtocol, [
  { signal_key: negativeEvaluation.signal_key, observed_at: "2026-10-02T20:00:00Z", origin_entity_ref: "a", forward_return: -0.010, benchmark_return: 0 },
  { signal_key: negativeEvaluation.signal_key, observed_at: "2026-10-03T20:00:00Z", origin_entity_ref: "b", forward_return: -0.008, benchmark_return: 0 },
]);
assert.equal(negativeScore.status, "FORWARD_PAPER_PASS");
assert.ok(negativeScore.mean_signed_excess_return_net > 0);

const weakNegativeScore = scoreForwardPaperCohort(negativeProtocol, [
  { signal_key: negativeEvaluation.signal_key, observed_at: "2026-10-02T20:00:00Z", origin_entity_ref: "a", forward_return: -0.0005, benchmark_return: 0 },
  { signal_key: negativeEvaluation.signal_key, observed_at: "2026-10-03T20:00:00Z", origin_entity_ref: "b", forward_return: -0.0004, benchmark_return: 0 },
]);
assert.notEqual(weakNegativeScore.status, "FORWARD_PAPER_PASS");
assert.ok(weakNegativeScore.mean_signed_excess_return_net < 0);

console.log(JSON.stringify({
  ok: true,
  schema: "evercraft.daytrade.forward-paper-proof.v1",
  immutable_protocol_hash: true,
  retroactive_events_excluded: true,
  forward_only_scoring: true,
  live_trade_authority: false,
}));
