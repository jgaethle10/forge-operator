import assert from "node:assert/strict";
import {
  emptyContextState,
  ingestContextObservation,
} from "../worldstate/observation-fabric.mjs";
import subscriptions from "../worldstate/subscriptions.json" with { type: "json" };
import { buildRockiesEdgeResearchQueue, EDGE_LAB_CONSUMER } from "./rockies-edge-consumer.mjs";

const source = {
  source_system: "rockies",
  source_family: "regional_grid_operators",
  observed_at: "2026-09-30T15:00:00Z",
  region_keys: ["us-west"],
  domains: ["energy", "infrastructure"],
  kind: "grid_stress",
  evidence_state: "verified",
  reliability: 0.95,
  anomaly_score: 0.82,
  summary: "Grid stress materially above learned operating baseline.",
  provenance_refs: ["public:grid:proof"],
  correlation_keys: ["us-west::energy::grid-stress"],
  metadata: {
    rockies_range: "grid_energy",
    independent_source_family_count: 3,
  },
};

const ingested = ingestContextObservation(emptyContextState(), source, { subscriptions });
assert.equal(ingested.decision.action, "propagate");
assert.ok(ingested.decision.consumers.includes(EDGE_LAB_CONSUMER));

const queue = buildRockiesEdgeResearchQueue(ingested.state);
assert.equal(queue.consumer, EDGE_LAB_CONSUMER);
assert.equal(queue.pending_dispatches, 1);
assert.ok(queue.hypothesis_count >= 1);
assert.equal(queue.live_trade_authority, false);
assert.ok(queue.hypotheses.every((row) => row.direction === "LEARN_FROM_DATA"));
assert.ok(queue.hypotheses.every((row) => row.provenance_refs.includes("public:grid:proof")));
assert.ok(queue.hypotheses.some((row) => row.rockies_range === "grid_energy"));

console.log(JSON.stringify({
  ok: true,
  schema: "evercraft.daytrade.rockies-edge-integration-proof.v1",
  worldstate_subscription: true,
  provenance_preserved: true,
  direction_precommitment: false,
  live_trade_authority: false,
  hypotheses: queue.hypothesis_count,
}));
