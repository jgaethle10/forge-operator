const VERIFIED = 'verified';
const PREDICTED = 'predicted';

const CIVILIAN_PURPOSES = new Set([
  'disaster_recovery',
  'emergency_communications',
  'environmental_monitoring',
  'infrastructure_inspection',
  'agriculture',
  'rural_connectivity',
  'search_and_rescue',
  'temporary_event_connectivity'
]);

const FORBIDDEN_TERMS = [
  'combat',
  'weapon',
  'targeting',
  'strike',
  'munition',
  'jamming',
  'interception',
  'evasion',
  'person_tracking',
  'mass_surveillance'
];

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isoMs(value) {
  const ms = Date.parse(String(value || ''));
  return Number.isFinite(ms) ? ms : null;
}

function missionGate(mission = {}) {
  const corpus = [
    mission.purpose,
    mission.intent,
    mission.description,
    ...(Array.isArray(mission.tags) ? mission.tags : [])
  ].filter(Boolean).join(' ').toLowerCase();

  const forbidden = FORBIDDEN_TERMS.find((term) => corpus.includes(term));
  if (forbidden) return { ok: false, reason: 'forbidden_intent:' + forbidden };

  const purpose = String(mission.purpose || '').trim().toLowerCase();
  if (!CIVILIAN_PURPOSES.has(purpose)) {
    return { ok: false, reason: 'purpose_not_in_civilian_allowlist' };
  }

  if (!mission.source_node_id || !mission.destination_node_id) {
    return { ok: false, reason: 'source_and_destination_required' };
  }

  return { ok: true, purpose };
}

function aircraftEligible(node) {
  return Boolean(
    node &&
    node.kind === 'aircraft_relay' &&
    node.state === VERIFIED &&
    node.authorized === true &&
    node.participation_opt_in === true &&
    node.avionics_isolated === true &&
    node.flight_control_access === false &&
    node.safe_operating_state === true
  );
}

function endpointEligible(node) {
  return Boolean(
    node &&
    node.kind !== 'aircraft_relay' &&
    node.state === VERIFIED &&
    node.authorized === true
  );
}

function normalizeWindow(window) {
  const startMs = isoMs(window.start_at);
  const endMs = isoMs(window.end_at);
  if (!startMs || !endMs || endMs <= startMs) return null;

  const state = String(window.state || '').toLowerCase();
  if (![VERIFIED, PREDICTED].includes(state)) return null;

  const bandwidth = finite(window.bandwidth_mbps, 0);
  const efficiency = Math.max(0.05, Math.min(1, finite(window.link_efficiency, 0.7)));
  const durationSeconds = Math.max(0, (endMs - startMs) / 1000);
  const transferableBytes = Math.floor(
    bandwidth * 1_000_000 / 8 * durationSeconds * efficiency
  );

  return {
    ...window,
    state,
    start_ms: startMs,
    end_ms: endMs,
    bandwidth_mbps: bandwidth,
    link_efficiency: efficiency,
    transferable_bytes: transferableBytes
  };
}

function contactEligible(window, nodesById, mission) {
  if (!window) return false;
  if (!nodesById.has(window.from) || !nodesById.has(window.to)) return false;
  if (window.authorized !== true) return false;
  if (!window.evidence) return false;

  const minimumBandwidth = finite(mission.minimum_bandwidth_mbps, 0);
  if (window.bandwidth_mbps < minimumBandwidth) return false;

  if (mission.mode === 'live_relay' && window.state !== VERIFIED) return false;
  if (window.state === PREDICTED && mission.allow_predicted_contacts !== true) return false;

  return true;
}

function overlaps(a, b) {
  return Math.max(a.start_ms, b.start_ms) < Math.min(a.end_ms, b.end_ms);
}

function effectiveWindow(a, b) {
  const start = Math.max(a.start_ms, b.start_ms);
  const end = Math.min(a.end_ms, b.end_ms);
  return {
    start_ms: start,
    end_ms: end,
    duration_seconds: Math.max(0, (end - start) / 1000)
  };
}

function livePlans({ mission, aircraft, sourceWindows, destinationWindows }) {
  const rows = [];
  for (const uplink of sourceWindows) {
    for (const downlink of destinationWindows) {
      if (!overlaps(uplink, downlink)) continue;
      const overlap = effectiveWindow(uplink, downlink);
      const bottleneckMbps = Math.min(
        uplink.bandwidth_mbps,
        downlink.bandwidth_mbps
      );
      const transferableBytes = Math.floor(
        bottleneckMbps * 1_000_000 / 8 *
        overlap.duration_seconds *
        Math.min(uplink.link_efficiency, downlink.link_efficiency)
      );
      if (transferableBytes < finite(mission.payload_bytes, 0)) continue;

      rows.push({
        mode: 'live_relay',
        aircraft_node_id: aircraft.id,
        status: 'ROUTE_READY',
        contact_start_at: new Date(overlap.start_ms).toISOString(),
        contact_end_at: new Date(overlap.end_ms).toISOString(),
        contact_duration_seconds: overlap.duration_seconds,
        bottleneck_bandwidth_mbps: bottleneckMbps,
        transferable_bytes: transferableBytes,
        uplink: summarizeWindow(uplink),
        downlink: summarizeWindow(downlink),
        evidence_state: VERIFIED
      });
    }
  }
  return rows;
}

function ferryPlans({ mission, aircraft, sourceWindows, destinationWindows, nowMs }) {
  const rows = [];
  const deadlineMs = mission.deliver_by ? isoMs(mission.deliver_by) : null;
  const payloadBytes = finite(mission.payload_bytes, 0);

  for (const pickup of sourceWindows) {
    if (pickup.end_ms < nowMs) continue;
    if (pickup.transferable_bytes < payloadBytes) continue;

    for (const drop of destinationWindows) {
      if (drop.start_ms < pickup.end_ms) continue;
      if (drop.transferable_bytes < payloadBytes) continue;
      if (deadlineMs && drop.end_ms > deadlineMs) continue;

      const predicted =
        pickup.state === PREDICTED ||
        drop.state === PREDICTED;

      rows.push({
        mode: 'data_ferry',
        aircraft_node_id: aircraft.id,
        status: predicted ? 'FORECAST_PLAN_READY' : 'ROUTE_READY',
        pickup_start_at: new Date(pickup.start_ms).toISOString(),
        pickup_end_at: new Date(pickup.end_ms).toISOString(),
        drop_start_at: new Date(drop.start_ms).toISOString(),
        drop_end_at: new Date(drop.end_ms).toISOString(),
        carry_duration_seconds: Math.max(0, (drop.start_ms - pickup.end_ms) / 1000),
        transferable_bytes: Math.min(
          pickup.transferable_bytes,
          drop.transferable_bytes
        ),
        pickup: summarizeWindow(pickup),
        drop: summarizeWindow(drop),
        evidence_state: predicted ? PREDICTED : VERIFIED
      });
    }
  }
  return rows;
}

function summarizeWindow(window) {
  return {
    from: window.from,
    to: window.to,
    state: window.state,
    start_at: new Date(window.start_ms).toISOString(),
    end_at: new Date(window.end_ms).toISOString(),
    bandwidth_mbps: window.bandwidth_mbps,
    transferable_bytes: window.transferable_bytes,
    evidence: window.evidence
  };
}

function scorePlan(plan, nowMs) {
  const firstContact = isoMs(
    plan.contact_start_at ||
    plan.pickup_start_at
  ) || nowMs;
  const waitSeconds = Math.max(0, (firstContact - nowMs) / 1000);
  const carrySeconds = finite(plan.carry_duration_seconds, 0);
  const evidenceBonus = plan.evidence_state === VERIFIED ? 1000 : 0;
  return (
    evidenceBonus +
    Math.log10(Math.max(10, plan.transferable_bytes)) * 25 -
    waitSeconds * 0.01 -
    carrySeconds * 0.005
  );
}

export function planAircraftRelay({
  mission = {},
  nodes = [],
  contact_windows = [],
  now = new Date()
} = {}) {
  const gate = missionGate(mission);
  if (!gate.ok) {
    return {
      schema: 'evercraft.aircraft-relay-plan.v1',
      status: 'POLICY_DENIED',
      reason: gate.reason,
      selected: null,
      candidates: []
    };
  }

  const mode = String(mission.mode || 'data_ferry').trim().toLowerCase();
  if (!['live_relay', 'data_ferry'].includes(mode)) {
    return {
      schema: 'evercraft.aircraft-relay-plan.v1',
      status: 'POLICY_DENIED',
      reason: 'unsupported_mode',
      selected: null,
      candidates: []
    };
  }

  const normalizedMission = { ...mission, mode };
  const nodesById = new Map(
    nodes
      .filter((node) => aircraftEligible(node) || endpointEligible(node))
      .map((node) => [node.id, node])
  );

  const source = nodesById.get(mission.source_node_id);
  const destination = nodesById.get(mission.destination_node_id);
  if (!source || !destination || source.kind === 'aircraft_relay' || destination.kind === 'aircraft_relay') {
    return {
      schema: 'evercraft.aircraft-relay-plan.v1',
      status: 'NO_ROUTE',
      reason: 'source_or_destination_not_eligible_ground_endpoint',
      selected: null,
      candidates: []
    };
  }

  const normalizedWindows = contact_windows
    .map(normalizeWindow)
    .filter(Boolean)
    .filter((window) => contactEligible(window, nodesById, normalizedMission));

  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const aircraftNodes = [...nodesById.values()].filter(aircraftEligible);
  const candidates = [];

  for (const aircraft of aircraftNodes) {
    const sourceWindows = normalizedWindows.filter((window) =>
      (window.from === mission.source_node_id && window.to === aircraft.id) ||
      (window.to === mission.source_node_id && window.from === aircraft.id)
    );
    const destinationWindows = normalizedWindows.filter((window) =>
      (window.from === mission.destination_node_id && window.to === aircraft.id) ||
      (window.to === mission.destination_node_id && window.from === aircraft.id)
    );

    const planned = mode === 'live_relay'
      ? livePlans({
          mission: normalizedMission,
          aircraft,
          sourceWindows,
          destinationWindows
        })
      : ferryPlans({
          mission: normalizedMission,
          aircraft,
          sourceWindows,
          destinationWindows,
          nowMs
        });

    candidates.push(...planned);
  }

  for (const candidate of candidates) {
    candidate.score = scorePlan(candidate, nowMs);
  }

  candidates.sort((a, b) =>
    b.score - a.score ||
    String(a.aircraft_node_id).localeCompare(String(b.aircraft_node_id))
  );

  if (!candidates.length) {
    return {
      schema: 'evercraft.aircraft-relay-plan.v1',
      status: 'NO_ROUTE',
      reason: 'no_authorized_contact_plan_meets_requirements',
      selected: null,
      candidates: []
    };
  }

  const selected = candidates[0];
  return {
    schema: 'evercraft.aircraft-relay-plan.v1',
    status: selected.status,
    purpose: gate.purpose,
    mode,
    selected,
    candidates,
    truth_boundary: {
      flight_control_performed: false,
      avionics_access_performed: false,
      aircraft_navigation_influenced: false,
      predicted_contact_is_not_live_route: true,
      participation_requires_opt_in: true,
      aircraft_systems_must_remain_isolated: true
    }
  };
}
