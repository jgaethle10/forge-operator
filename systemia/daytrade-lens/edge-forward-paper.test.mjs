import assert from "node:assert/strict";
import {
  freezeForwardPaperCohort,
  validateFrozenProtocol,
  scoreForwardPaperCohort,
  scoreForwardPaperCluster,
  loadCanonicalFrozenCohorts,
  CANONICAL_FORWARD_PAPER_CUTOFF,
  CANONICAL_FORWARD_PAPER_ARTIFACT_DIGEST,
} from "./edge-forward-paper.mjs";

const canonical = loadCanonicalFrozenCohorts();
assert.equal(canonical.cohort_count, 6);
assert.equal(
  canonical.source.original_manifest_generated_at,
  "2026-09-30T23:10:52.172Z"
);
assert.equal(
  canonical.source.github_artifact_digest,
  "sha256:fad591be832d023188e60908afee9252713545e0cb42ae3cc2ebcea698ac7a96"
);
assert.equal(CANONICAL_FORWARD_PAPER_CUTOFF, canonical.source.original_manifest_generated_at);
assert.equal(CANONICAL_FORWARD_PAPER_ARTIFACT_DIGEST, canonical.source.github_artifact_digest);
assert.deepEqual(
  canonical.cohorts.map((row) => row.cohort_id).sort(),
  [
    "edgepaper_22ea75a0c57431c6a7f2",
    "edgepaper_29a22b58b874a6e2e67f",
    "edgepaper_54602e95f170ad2f4c5f",
    "edgepaper_d129c116e7639b613c6c",
    "edgepaper_ead63d28c4c2ff1b4f66",
    "edgepaper_f50c186a5a795bbe41f6",
  ]
);
assert.ok(canonical.cohorts.every((row) => row.enrolled_at === CANONICAL_FORWARD_PAPER_CUTOFF));
assert.ok(canonical.cohorts.every((row) => row.observation_cutoff === CANONICAL_FORWARD_PAPER_CUTOFF));
assert.ok(canonical.cohorts.every((row) => row.minimum_forward_events === 20));
assert.ok(canonical.cohorts.every((row) => row.minimum_distinct_origins === 5));
assert.ok(canonical.cohorts.every((row) => row.live_trade_authority === false));

const canonicalHashesBefore = canonical.cohorts.map((row) => row.protocol_hash);
const hypotheticalLaterHistoricalWinner = {
  signal_key: "ai_models|sec_8_k|XLK|3d",
  cluster_key: "ai_models|sec_8_k|SPY",
  adversarial_status: "FORWARD_PAPER_ELIGIBLE",
};
const hypotheticalLaterEvaluation = {
  signal_key: hypotheticalLaterHistoricalWinner.signal_key,
  rockies_range: "ai_models",
  observation_kind: "sec_8_k",
  instrument: "XLK",
  benchmark: "SPY",
  lag_key: "3d",
  learned_direction: "POSITIVE_EXCESS_RETURN",
};
const hypotheticalReplacement = freezeForwardPaperCohort(
  hypotheticalLaterHistoricalWinner,
  hypotheticalLaterEvaluation,
  { enrolled_at: "2026-10-01T18:30:00.000Z" }
);
assert.equal(
  canonical.cohorts.some((row) => row.cohort_id === hypotheticalReplacement.cohort_id),
  false
);
assert.deepEqual(
  loadCanonicalFrozenCohorts().cohorts.map((row) => row.protocol_hash),
  canonicalHashesBefore
);

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
const pendingScore = scoreForwardPaperCohort(protocol, rows.slice(0, 2));
assert.equal(pendingScore.forward_events, 1);
assert.equal(pendingScore.status, "FORWARD_PAPER_PENDING");
assert.equal(pendingScore.sample_ready, false);

const score = scoreForwardPaperCohort(protocol, rows);
assert.equal(score.forward_events, 2);
assert.equal(score.distinct_origins, 2);
assert.equal(score.status, "FORWARD_PAPER_PASS");
assert.equal(score.sample_ready, true);
assert.equal(score.live_trade_authority, false);

const failScore = scoreForwardPaperCohort(protocol, [
  { signal_key: review.signal_key, observed_at: "2026-10-02T20:00:00Z", origin_entity_ref: "a", forward_return: -0.02, benchmark_return: 0 },
  { signal_key: review.signal_key, observed_at: "2026-10-03T20:00:00Z", origin_entity_ref: "b", forward_return: -0.01, benchmark_return: 0 },
]);
assert.equal(failScore.status, "FORWARD_PAPER_FAIL");
assert.equal(failScore.sample_ready, true);


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

const siblingReview = {
  ...review,
  signal_key: "ai_models|sec_8_k|SMH|1d",
};
const siblingEvaluation = {
  ...evaluation,
  signal_key: siblingReview.signal_key,
  instrument: "SMH",
};
const siblingProtocol = freezeForwardPaperCohort(siblingReview, siblingEvaluation, {
  enrolled_at: enrolled,
  transaction_cost_bps: 5,
  minimum_forward_events: 2,
  minimum_distinct_origins: 2,
});

const clusterScore = scoreForwardPaperCluster(
  [protocol, siblingProtocol],
  [
    {
      measurement_id: "cluster-a-soxx",
      source_observation_id: "filing:a",
      signal_key: protocol.signal_key,
      observed_at: "2026-10-02T20:00:00Z",
      origin_entity_ref: "sec:cik:a",
      forward_return: 0.02,
      benchmark_return: 0.005,
    },
    {
      measurement_id: "cluster-a-smh",
      source_observation_id: "filing:a",
      signal_key: siblingProtocol.signal_key,
      observed_at: "2026-10-02T20:00:00Z",
      origin_entity_ref: "sec:cik:a",
      forward_return: 0.018,
      benchmark_return: 0.005,
    },
    {
      measurement_id: "cluster-b-soxx",
      source_observation_id: "filing:b",
      signal_key: protocol.signal_key,
      observed_at: "2026-10-03T20:00:00Z",
      origin_entity_ref: "sec:cik:b",
      forward_return: 0.015,
      benchmark_return: 0.005,
    },
    {
      measurement_id: "cluster-b-smh",
      source_observation_id: "filing:b",
      signal_key: siblingProtocol.signal_key,
      observed_at: "2026-10-03T20:00:00Z",
      origin_entity_ref: "sec:cik:b",
      forward_return: 0.014,
      benchmark_return: 0.005,
    },
  ]
);
assert.equal(clusterScore.raw_member_measurements, 4);
assert.equal(clusterScore.forward_events, 2);
assert.equal(clusterScore.effective_independent_events, 2);
assert.equal(clusterScore.distinct_origins, 2);
assert.equal(clusterScore.independence_ratio, 0.5);
assert.equal(clusterScore.status, "FORWARD_PAPER_CLUSTER_PASS");
assert.equal(clusterScore.correlated_members_not_independent_edges, true);
assert.equal(clusterScore.live_trade_authority, false);

console.log(JSON.stringify({
  ok: true,
  schema: "evercraft.daytrade.forward-paper-proof.v1",
  immutable_protocol_hash: true,
  retroactive_events_excluded: true,
  forward_only_scoring: true,
  canonical_six_cohorts_recovered_from_original_artifact: true,
  canonical_cutoff_locked: true,
  historical_reruns_cannot_refreeze_cohorts: true,
  cluster_level_event_deduplication: true,
  correlated_siblings_not_independent_edges: true,
  live_trade_authority: false,
}));
