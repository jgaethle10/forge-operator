const STATE = Object.freeze({
  VERIFIED: 'verified',
  PLANNED: 'planned',
  UNAVAILABLE: 'unavailable'
});

function finite(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export { STATE };

export function selectTransport({
  transports,
  purpose = 'data',
  payload_bytes = 0,
  requires_offline = true,
  max_latency_class = 'delay_tolerant'
}) {
  const latencyRank = {
    realtime: 0,
    near_realtime: 1,
    delay_tolerant: 2
  };
  const maxRank = latencyRank[max_latency_class] ?? latencyRank.delay_tolerant;

  const candidates = (transports || [])
    .filter((transport) => transport.state === STATE.VERIFIED)
    .filter((transport) => (transport.purposes || []).includes(purpose))
    .filter((transport) => !requires_offline || transport.offline_usable === true)
    .filter((transport) => {
      const maxPayload = finite(transport.max_payload_bytes, Number.MAX_SAFE_INTEGER);
      return payload_bytes <= maxPayload;
    })
    .filter((transport) => {
      const rank = latencyRank[transport.latency_class] ?? latencyRank.delay_tolerant;
      return rank <= maxRank;
    })
    .map((transport) => {
      const latency = latencyRank[transport.latency_class] ?? 2;
      const power = finite(transport.power_cost, 5);
      const infrastructurePenalty = transport.requires_external_infrastructure ? 10 : 0;
      const routeScore =
        (transport.offline_usable ? 50 : 0) +
        (transport.bidirectional ? 10 : 0) -
        latency * 5 -
        power -
        infrastructurePenalty;
      return { ...transport, route_score: routeScore };
    })
    .sort((a, b) =>
      b.route_score - a.route_score ||
      String(a.id).localeCompare(String(b.id))
    );

  if (!candidates.length) {
    return {
      schema: 'evercraft.transport-selection.v1',
      status: 'NO_ROUTE',
      selected: null,
      candidates: []
    };
  }

  return {
    schema: 'evercraft.transport-selection.v1',
    status: 'ROUTE_READY',
    selected: candidates[0],
    candidates
  };
}

export function defaultTransportCatalog({
  lanAvailable = true,
  fileCourierAvailable = true
} = {}) {
  return [
    {
      id: 'lan_http',
      kind: 'ip',
      state: lanAvailable ? STATE.VERIFIED : STATE.UNAVAILABLE,
      purposes: ['data'],
      offline_usable: true,
      bidirectional: true,
      latency_class: 'realtime',
      power_cost: 2,
      max_payload_bytes: 16 * 1024 * 1024,
      requires_external_infrastructure: false,
      evidence: 'existing Evercraft local HTTP/NodeSeed execution path'
    },
    {
      id: 'udp_multicast_beacon',
      kind: 'udp_multicast',
      state: STATE.VERIFIED,
      purposes: ['discovery'],
      offline_usable: true,
      bidirectional: false,
      latency_class: 'near_realtime',
      power_cost: 1,
      max_payload_bytes: 1400,
      requires_external_infrastructure: false,
      evidence: 'systemia/compute/capacity-beacon.mjs'
    },
    {
      id: 'file_courier',
      kind: 'removable_media_or_shared_directory',
      state: fileCourierAvailable ? STATE.VERIFIED : STATE.UNAVAILABLE,
      purposes: ['data'],
      offline_usable: true,
      bidirectional: false,
      latency_class: 'delay_tolerant',
      power_cost: 0,
      max_payload_bytes: 4 * 1024 * 1024 * 1024,
      requires_external_infrastructure: false,
      evidence: 'systemia/network/file-courier.mjs'
    },
    {
      id: 'wifi_direct',
      kind: 'wifi_direct',
      state: STATE.PLANNED,
      purposes: ['discovery', 'data'],
      offline_usable: true,
      bidirectional: true,
      latency_class: 'realtime',
      power_cost: 3,
      requires_external_infrastructure: false,
      evidence: 'field proof not yet present'
    },
    {
      id: 'ble_store_forward',
      kind: 'bluetooth_le',
      state: STATE.PLANNED,
      purposes: ['discovery', 'data'],
      offline_usable: true,
      bidirectional: true,
      latency_class: 'delay_tolerant',
      power_cost: 1,
      max_payload_bytes: 256 * 1024,
      requires_external_infrastructure: false,
      evidence: 'field proof not yet present'
    },
    {
      id: 'radio_gateway',
      kind: 'authorized_radio_gateway',
      state: STATE.PLANNED,
      purposes: ['data'],
      offline_usable: true,
      bidirectional: true,
      latency_class: 'delay_tolerant',
      power_cost: 4,
      requires_external_infrastructure: false,
      evidence: 'field proof not yet present'
    }
  ];
}
