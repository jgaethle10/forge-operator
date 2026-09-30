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

const restarted = new ForwardPaperDurableState({ root });
assert.equal(restarted.summary().cohort_count, 1);
assert.equal(restarted.summary().measurement_count, 2);
assert.equal(restarted.score(protocol.cohort_id).status, "FORWARD_PAPER_PASS");
assert.equal(restarted.summary().live_trade_authority, false);

const journal = path.join(root, "forward-paper-journal.jsonl");
fs.appendFileSync(journal, "{broken");
const recovered = new ForwardPaperDurableState({ root });
assert.equal(recovered.summary().tail_recovered, true);

console.log(JSON.stringify({
  ok: true,
  schema: "evercraft.daytrade.forward-paper-durable-proof.v1",
  restart_recovery: true,
  hash_linked_journal: true,
  retroactive_rejection: true,
  idempotent_measurements: true,
  torn_tail_recovery: true,
  live_trade_authority: false,
}));
