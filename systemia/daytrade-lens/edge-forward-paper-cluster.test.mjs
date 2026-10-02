import assert from "node:assert/strict";
import { freezeForwardPaperCohort } from "./edge-forward-paper.mjs";
import {
  scoreForwardPaperCluster,
  scoreForwardPaperClusters,
} from "./edge-forward-paper-cluster.mjs";

function protocol(signal, instrument, lag) {
  return freezeForwardPaperCohort({
    signal_key: signal,
    cluster_key: "ai_models|sec_8_k|SPY",
    adversarial_status: "FORWARD_PAPER_ELIGIBLE",
  }, {
    signal_key: signal,
    rockies_range: "ai_models",
    observation_kind: "sec_8_k",
    instrument,
    benchmark: "SPY",
    lag_key: lag,
    learned_direction: "POSITIVE_EXCESS_RETURN",
  }, {
    enrolled_at: "2026-10-01T00:00:00Z",
    transaction_cost_bps: 5,
    minimum_forward_events: 2,
    minimum_distinct_origins: 2,
  });
}

const p1 = protocol("ai_models|sec_8_k|SOXX|1d", "SOXX", "1d");
const p2 = protocol("ai_models|sec_8_k|SMH|1d", "SMH", "1d");
const measurements = new Map([
  [p1.cohort_id, [
    {measurement_id:"a1",source_observation_id:"event:a",signal_key:p1.signal_key,origin_entity_ref:"issuer:a",forward_return:0.02,benchmark_return:0.005},
    {measurement_id:"b1",source_observation_id:"event:b",signal_key:p1.signal_key,origin_entity_ref:"issuer:b",forward_return:0.018,benchmark_return:0.005},
  ]],
  [p2.cohort_id, [
    {measurement_id:"a2",source_observation_id:"event:a",signal_key:p2.signal_key,origin_entity_ref:"issuer:a",forward_return:0.019,benchmark_return:0.005},
    {measurement_id:"b2",source_observation_id:"event:b",signal_key:p2.signal_key,origin_entity_ref:"issuer:b",forward_return:0.017,benchmark_return:0.005},
  ]],
]);

const pass = scoreForwardPaperCluster([p1,p2], measurements);
assert.equal(pass.member_count, 2);
assert.equal(pass.complete_underlying_events, 2);
assert.equal(pass.distinct_origins, 2);
assert.equal(pass.status, "FORWARD_CLUSTER_PASS");
assert.equal(pass.correlated_members_not_independent_edges, true);

const incomplete = new Map(measurements);
incomplete.set(p2.cohort_id, [
  {measurement_id:"a2",source_observation_id:"event:a",signal_key:p2.signal_key,origin_entity_ref:"issuer:a",forward_return:0.019,benchmark_return:0.005},
]);
const pending = scoreForwardPaperCluster([p1,p2], incomplete);
assert.equal(pending.complete_underlying_events, 1);
assert.equal(pending.status, "FORWARD_CLUSTER_PENDING");

const losing = new Map([
  [p1.cohort_id, [
    {measurement_id:"a1",source_observation_id:"event:a",signal_key:p1.signal_key,origin_entity_ref:"issuer:a",forward_return:-0.02,benchmark_return:0},
    {measurement_id:"b1",source_observation_id:"event:b",signal_key:p1.signal_key,origin_entity_ref:"issuer:b",forward_return:-0.02,benchmark_return:0},
  ]],
  [p2.cohort_id, [
    {measurement_id:"a2",source_observation_id:"event:a",signal_key:p2.signal_key,origin_entity_ref:"issuer:a",forward_return:-0.01,benchmark_return:0},
    {measurement_id:"b2",source_observation_id:"event:b",signal_key:p2.signal_key,origin_entity_ref:"issuer:b",forward_return:-0.01,benchmark_return:0},
  ]],
]);
assert.equal(
  scoreForwardPaperCluster([p1,p2], losing).status,
  "FORWARD_CLUSTER_FAIL"
);

const all = scoreForwardPaperClusters([p1,p2], measurements);
assert.equal(all.cluster_count, 1);
assert.equal(all.scores[0].status, "FORWARD_CLUSTER_PASS");
assert.equal(all.live_trade_authority, false);

console.log(JSON.stringify({
  ok:true,
  schema:"evercraft.daytrade.forward-paper-cluster-proof.v1",
  unique_underlying_event_counting:true,
  sibling_signals_not_independent:true,
  complete_event_requirement:true,
  pending_pass_fail_separated:true,
  live_trade_authority:false,
}));
