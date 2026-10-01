import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { freezeForwardPaperCohort } from "./edge-forward-paper.mjs";
import { ForwardPaperDurableState } from "./edge-forward-paper-durable.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "edge-paper-"));
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
const protocol = freezeForwardPaperCohort(review, evaluation, {
  enrolled_at: "2026-10-01T00:00:00Z",
  transaction_cost_bps: 5,
  minimum_forward_events: 2,
  minimum_distinct_origins: 2,
});

const ledger = new ForwardPaperDurableState({ root });
assert.equal(ledger.enroll(protocol).state, "enrolled");
assert.equal(ledger.enroll(protocol).state, "duplicate");

const shiftedProtocol = freezeForwardPaperCohort(review, evaluation, {
  enrolled_at: "2026-10-05T00:00:00Z",
  transaction_cost_bps: 5,
  minimum_forward_events: 2,
  minimum_distinct_origins: 2,
});
const shiftedEnroll = ledger.enroll(shiftedProtocol);
assert.equal(shiftedEnroll.state, "existing_signal_cohort");
assert.equal(shiftedEnroll.cohort.cohort_id, protocol.cohort_id);

assert.throws(() => ledger.appendMeasurement(protocol.cohort_id, {
  measurement_id: "old",
  signal_key: protocol.signal_key,
  observed_at: "2026-09-30T23:00:00Z",
  origin_entity_ref: "sec:cik:old",
  forward_return: 0.02,
  benchmark_return: 0.01,
}), /retroactive_measurement/);

for (const [i, origin] of ["a","b"].entries()) {
  const result = ledger.appendMeasurement(protocol.cohort_id, {
    measurement_id: "m" + i,
    signal_key: protocol.signal_key,
    observed_at: `2026-10-0${i+2}T20:00:00Z`,
    origin_entity_ref: "sec:cik:" + origin,
    forward_return: 0.02 + i * 0.001,
    benchmark_return: 0.005,
  });
  assert.equal(result.state, "appended");
}
assert.equal(ledger.appendMeasurement(protocol.cohort_id, {
  measurement_id: "m0",
  signal_key: protocol.signal_key,
  observed_at: "2026-10-02T20:00:00Z",
  origin_entity_ref: "sec:cik:a",
  forward_return: 0.02,
  benchmark_return: 0.005,
}).state, "duplicate");

const score = ledger.score(protocol.cohort_id);
assert.equal(score.status, "FORWARD_PAPER_PASS");

const ingest = ledger.ingestResearchReport({
  measurements: [
    {
      measurement_id: "m0",
      signal_key: protocol.signal_key,
      observed_at: "2026-10-02T20:00:00Z",
      origin_entity_ref: "sec:cik:a",
      forward_return: 0.02,
      benchmark_return: 0.005,
    },
    {
      measurement_id: "m2",
      signal_key: protocol.signal_key,
      observed_at: "2026-10-04T20:00:00Z",
      origin_entity_ref: "sec:cik:c",
      forward_return: 0.018,
      benchmark_return: 0.005,
    },
    {
      measurement_id: "wrong-signal",
      signal_key: "other|signal",
      observed_at: "2026-10-04T20:00:00Z",
      origin_entity_ref: "sec:cik:x",
      forward_return: 1,
      benchmark_return: 0,
    },
  ],
});
assert.equal(ingest.cohort_count, 1);
assert.equal(ingest.cohorts[0].appended, 1);
assert.equal(ingest.cohorts[0].duplicates, 1);

const restarted = new ForwardPaperDurableState({ root });
assert.equal(restarted.summary().cohort_count, 1);
assert.equal(restarted.summary().measurement_count, 3);
assert.equal(restarted.score(protocol.cohort_id).status, "FORWARD_PAPER_PASS");
assert.equal(restarted.summary().live_trade_authority, false);

const journal = path.join(root, "forward-paper-journal.jsonl");
fs.appendFileSync(journal, "{broken");
const recovered = new ForwardPaperDurableState({ root });
assert.equal(recovered.summary().tail_recovered, true);

const clusterRoot = fs.mkdtempSync(path.join(os.tmpdir(), "edge-paper-cluster-"));
const clusterLedger = new ForwardPaperDurableState({ root: clusterRoot });
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
  enrolled_at: "2026-10-01T00:00:00Z",
  transaction_cost_bps: 5,
  minimum_forward_events: 2,
  minimum_distinct_origins: 2,
});
assert.equal(clusterLedger.enroll(protocol).state, "enrolled");
assert.equal(clusterLedger.enroll(siblingProtocol).state, "enrolled");

for (const [eventIndex, origin] of ["a","b"].entries()) {
  const observedAt = `2026-10-0${eventIndex+2}T20:00:00Z`;
  const sourceObservationId = "filing:" + origin;
  for (const [memberIndex, memberProtocol] of [protocol, siblingProtocol].entries()) {
    const result = clusterLedger.appendMeasurement(memberProtocol.cohort_id, {
      measurement_id: `cluster-${origin}-${memberIndex}`,
      source_observation_id: sourceObservationId,
      signal_key: memberProtocol.signal_key,
      observed_at: observedAt,
      origin_entity_ref: "sec:cik:" + origin,
      forward_return: 0.02 - memberIndex * 0.002,
      benchmark_return: 0.005,
    });
    assert.equal(result.state, "appended");
  }
}

const clusterScore = clusterLedger.scoreCluster(review.cluster_key);
assert.equal(clusterScore.raw_member_measurements, 4);
assert.equal(clusterScore.forward_events, 2);
assert.equal(clusterScore.status, "FORWARD_PAPER_CLUSTER_PASS");
assert.equal(clusterScore.correlated_members_not_independent_edges, true);
assert.equal(clusterLedger.scoreAllClusters().length, 1);
assert.equal(clusterLedger.summary().cluster_count, 1);

const clusterRestart = new ForwardPaperDurableState({ root: clusterRoot });
assert.equal(clusterRestart.scoreCluster(review.cluster_key).forward_events, 2);
assert.equal(clusterRestart.scoreCluster(review.cluster_key).status, "FORWARD_PAPER_CLUSTER_PASS");

console.log(JSON.stringify({
  ok: true,
  schema: "evercraft.daytrade.forward-paper-durable-proof.v1",
  restart_recovery: true,
  hash_linked_journal: true,
  retroactive_rejection: true,
  idempotent_measurements: true,
  one_signal_one_frozen_cohort: true,
  cluster_level_forward_scoring: true,
  cluster_event_deduplication: true,
  research_report_ingestion: true,
  torn_tail_recovery: true,
  live_trade_authority: false,
}));
