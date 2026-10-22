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

// A price move against the frozen direction must remain a loss AFTER costs.
// Previously, subtracting the signed cost from the raw return could turn a
// small losing observation into an apparent positive edge.
const slightlyNegative = [
  { signal_key: review.signal_key, observed_at: "2026-10-02T20:00:00Z", origin_entity_ref: "a", forward_return: -0.0002, benchmark_return: 0 },
  { signal_key: review.signal_key, observed_at: "2026-10-03T20:00:00Z", origin_entity_ref: "b", forward_return: -0.0002, benchmark_return: 0 },
];
const positiveDirectionLoss = scoreForwardPaperCohort(protocol, slightlyNegative);
assert.equal(positiveDirectionLoss.status, "FORWARD_PAPER_PENDING_OR_FAIL");
assert.ok(Math.abs(positiveDirectionLoss.mean_signed_excess_return_net - (-0.0007)) < 1e-12);

const negativeEvaluation = { ...evaluation, learned_direction: "NEGATIVE_EXCESS_RETURN" };
const negativeProtocol = freezeForwardPaperCohort(review, negativeEvaluation, {
  enrolled_at: enrolled,
  transaction_cost_bps: 5,
  minimum_forward_events: 2,
  minimum_distinct_origins: 2,
});
const slightlyPositive = [
  { signal_key: review.signal_key, observed_at: "2026-10-02T20:00:00Z", origin_entity_ref: "a", forward_return: 0.0002, benchmark_return: 0 },
  { signal_key: review.signal_key, observed_at: "2026-10-03T20:00:00Z", origin_entity_ref: "b", forward_return: 0.0002, benchmark_return: 0 },
];
const negativeDirectionLoss = scoreForwardPaperCohort(negativeProtocol, slightlyPositive);
assert.equal(negativeDirectionLoss.status, "FORWARD_PAPER_PENDING_OR_FAIL");
assert.ok(Math.abs(negativeDirectionLoss.mean_signed_excess_return_net - (-0.0007)) < 1e-12);
const negativeDirectionWin = scoreForwardPaperCohort(negativeProtocol, slightlyNegative);
assert.equal(negativeDirectionWin.status, "FORWARD_PAPER_PENDING_OR_FAIL");
assert.ok(Math.abs(negativeDirectionWin.mean_signed_excess_return_net - (-0.0003)) < 1e-12);
const clearNegativeDirectionWin = scoreForwardPaperCohort(negativeProtocol,
  slightlyNegative.map((row) => ({ ...row, forward_return: -0.001 })));
assert.equal(clearNegativeDirectionWin.status, "FORWARD_PAPER_PASS");
assert.ok(Math.abs(clearNegativeDirectionWin.mean_signed_excess_return_net - 0.0005) < 1e-12);

const invalidReturn = scoreForwardPaperCohort(protocol, [
  rows[1],
  { ...rows[2], forward_return: "not-a-number" },
]);
assert.equal(invalidReturn.checks.valid_finite_returns, false);
assert.equal(invalidReturn.status, "FORWARD_PAPER_PENDING_OR_FAIL");

assert.throws(() => freezeForwardPaperCohort(review, evaluation, {
  transaction_cost_bps: -5,
}), /transaction_cost_invalid/);
assert.throws(() => freezeForwardPaperCohort(review, { ...evaluation, learned_direction: "UNKNOWN" }),
  /direction_invalid/);

console.log(JSON.stringify({
  ok: true,
  schema: "evercraft.daytrade.forward-paper-proof.v1",
  immutable_protocol_hash: true,
  retroactive_events_excluded: true,
  forward_only_scoring: true,
  live_trade_authority: false,
}));
