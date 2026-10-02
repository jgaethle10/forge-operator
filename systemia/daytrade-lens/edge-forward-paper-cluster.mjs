function mean(values) {
  return values.length ? values.reduce((a,b) => a + b, 0) / values.length : 0;
}

function signedNet(protocol, row) {
  const raw = Number(row.forward_return || 0) - Number(row.benchmark_return || 0);
  const expectedSign = protocol.learned_direction === "NEGATIVE_EXCESS_RETURN" ? -1 : 1;
  return expectedSign * raw - Number(protocol.transaction_cost_bps || 0) / 10000;
}

function eventKey(row) {
  return String(
    row?.source_observation_id ||
    row?.hypothesis_id ||
    row?.measurement_id ||
    ""
  );
}

export function scoreForwardPaperCluster(protocols = [], measurementsByCohort = new Map()) {
  if (!protocols.length) throw new Error("edge_forward_cluster_protocols_required");
  const clusterKey = protocols[0].cluster_key;
  if (protocols.some((protocol) => protocol.cluster_key !== clusterKey)) {
    throw new Error("edge_forward_cluster_mixed_cluster_keys");
  }

  const eventMap = new Map();
  for (const protocol of protocols) {
    const rows = measurementsByCohort instanceof Map
      ? (measurementsByCohort.get(protocol.cohort_id) || [])
      : (measurementsByCohort?.[protocol.cohort_id] || []);

    for (const row of rows) {
      const key = eventKey(row);
      if (!key) continue;
      if (!eventMap.has(key)) {
        eventMap.set(key, {
          event_key: key,
          origin_entity_ref: row.origin_entity_ref || null,
          members: new Map(),
        });
      }
      const event = eventMap.get(key);
      if (!event.origin_entity_ref && row.origin_entity_ref) {
        event.origin_entity_ref = row.origin_entity_ref;
      }
      if (!event.members.has(protocol.signal_key)) {
        event.members.set(protocol.signal_key, signedNet(protocol, row));
      }
    }
  }

  const requiredSignals = new Set(protocols.map((protocol) => protocol.signal_key));
  const completeEvents = [...eventMap.values()]
    .filter((event) =>
      event.members.size === requiredSignals.size &&
      [...requiredSignals].every((signal) => event.members.has(signal))
    )
    .map((event) => ({
      event_key: event.event_key,
      origin_entity_ref: event.origin_entity_ref,
      member_count: event.members.size,
      mean_member_signed_net: mean([...event.members.values()]),
    }));

  const origins = [...new Set(
    completeEvents.map((event) => event.origin_entity_ref).filter(Boolean)
  )];
  const eventReturns = completeEvents.map((event) => event.mean_member_signed_net);
  const minimumForwardEvents = Math.max(
    ...protocols.map((protocol) => Number(protocol.minimum_forward_events || 0))
  );
  const minimumDistinctOrigins = Math.max(
    ...protocols.map((protocol) => Number(protocol.minimum_distinct_origins || 0))
  );

  const checks = {
    minimum_complete_forward_events: completeEvents.length >= minimumForwardEvents,
    minimum_distinct_origins: origins.length >= minimumDistinctOrigins,
    cluster_mean_positive_after_costs: mean(eventReturns) > 0,
  };
  const sampleReady =
    checks.minimum_complete_forward_events &&
    checks.minimum_distinct_origins;

  return {
    schema: "evercraft.daytrade.forward-paper-cluster-score.v1",
    cluster_key: clusterKey,
    member_cohorts: protocols.map((protocol) => protocol.cohort_id),
    member_signals: protocols.map((protocol) => protocol.signal_key),
    member_count: protocols.length,
    unique_underlying_events_seen: eventMap.size,
    complete_underlying_events: completeEvents.length,
    distinct_origins: origins.length,
    minimum_forward_events: minimumForwardEvents,
    minimum_distinct_origins: minimumDistinctOrigins,
    mean_complete_event_signed_net: mean(eventReturns),
    positive_complete_event_rate: eventReturns.length
      ? eventReturns.filter((value) => value > 0).length / eventReturns.length
      : 0,
    sample_ready: sampleReady,
    checks,
    status: !sampleReady
      ? "FORWARD_CLUSTER_PENDING"
      : checks.cluster_mean_positive_after_costs
        ? "FORWARD_CLUSTER_PASS"
        : "FORWARD_CLUSTER_FAIL",
    correlated_members_not_independent_edges: true,
    live_trade_authority: false,
  };
}

export function scoreForwardPaperClusters(protocols = [], measurementsByCohort = new Map()) {
  const groups = new Map();
  for (const protocol of protocols) {
    const key = protocol.cluster_key || protocol.signal_key;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(protocol);
  }
  const scores = [...groups.values()].map((members) =>
    scoreForwardPaperCluster(members, measurementsByCohort)
  );
  return {
    schema: "evercraft.daytrade.forward-paper-cluster-scores.v1",
    cluster_count: scores.length,
    scores,
    live_trade_authority: false,
  };
}
