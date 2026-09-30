import { pendingContextForConsumer } from "../worldstate/observation-fabric.mjs";
import { rockiesObservationToEdgeHypotheses } from "./rockies-edge-fabric.mjs";

export const EDGE_LAB_CONSUMER = "daytrade_edge_lab";

export function buildRockiesEdgeResearchQueue(contextState, {
  consumer = EDGE_LAB_CONSUMER,
} = {}) {
  const pending = pendingContextForConsumer(contextState, consumer);
  const hypotheses = [];
  const ignored = [];

  for (const dispatch of pending) {
    const observation = dispatch.observation;
    const independentSourceFamilyCount = Number(
      observation?.metadata?.independent_source_family_count || 1
    );

    const rows = rockiesObservationToEdgeHypotheses(observation, {
      independent_source_family_count: independentSourceFamilyCount,
    });

    if (!rows.length) {
      ignored.push({
        observation_id: observation?.observation_id || null,
        reason: "no_market_hypothesis_or_anomaly_below_floor",
      });
      continue;
    }

    for (const row of rows) {
      hypotheses.push({
        ...row,
        dispatch_key: dispatch.dispatch_key,
        context_keys: [...dispatch.context_keys],
        dispatch_priority: dispatch.priority,
      });
    }
  }

  return {
    schema: "evercraft.daytrade.rockies-edge-research-queue.v1",
    consumer,
    pending_dispatches: pending.length,
    hypothesis_count: hypotheses.length,
    hypotheses,
    ignored,
    live_trade_authority: false,
  };
}
