import { createHash } from 'node:crypto';
import { discoverCapacityBeacons } from '../compute/capacity-beacon.mjs';

const sha = (value) => createHash('sha256').update(
  typeof value === 'string' ? value : JSON.stringify(value)
).digest('hex');

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export async function discoverEligibleCapacity({
  workloadClass,
  requiredWorkloads = [],
  requiredPlacementLabels = [],
  requiredServiceCapabilities = [],
  requireAttestation = false,
  discovery = {},
  endpointTimeoutMs = 750,
  excludeNodeIds = [],
} = {}) {
  if (!workloadClass) throw new Error('workloadClass is required');
  const workloadRequirements = [...new Set(
    [workloadClass, ...(requiredWorkloads || [])].map(String).filter(Boolean)
  )];
  const labelRequirements = [...new Set(
    (requiredPlacementLabels || []).map((x) => String(x).trim().toLowerCase()).filter(Boolean)
  )];
  const serviceRequirements = [...new Set(
    (requiredServiceCapabilities || []).map((x) => String(x).trim()).filter(Boolean)
  )];

  const beacons = await discoverCapacityBeacons(discovery);
  const excluded = new Set((excludeNodeIds || []).map(String));
  const observedAt = new Date().toISOString();
  const candidates = [];

  for (const beacon of beacons) {
    const candidate = {
      node_id: beacon.node_id,
      endpoint: beacon.endpoint,
      beacon_expires_at: beacon.expires_at,
      eligible: false,
      reason: null,
      allocation_auth: null,
      runtime: null,
      placement_labels: [],
      service_capabilities: {},
      attestation_supported: null,
      device_fingerprint_present: null,
    };

    try {
      if (excluded.has(String(beacon.node_id || ''))) {
        candidate.reason = 'node_excluded';
        candidates.push(candidate);
        continue;
      }
      if (Date.parse(beacon.expires_at) < Date.now()) {
        candidate.reason = 'beacon_expired';
        candidates.push(candidate);
        continue;
      }

      const capacity = await fetchJson(
        `${beacon.endpoint}/v1/capacity`,
        endpointTimeoutMs
      );

      if (capacity.protocol !== 'evercraft.capacity.v1') {
        candidate.reason = 'protocol_mismatch';
      } else if (String(capacity.node_id || '') !== String(beacon.node_id || '')) {
        candidate.reason = 'node_identity_mismatch';
      } else if (!Array.isArray(capacity.supported_workloads) ||
                 !workloadRequirements.every((required) =>
                   capacity.supported_workloads.includes(required)
                 )) {
        candidate.reason = 'workload_unsupported';
      } else if (!labelRequirements.every((required) =>
                   (capacity.placement_labels || []).map((x) => String(x).toLowerCase()).includes(required)
                 )) {
        candidate.reason = 'placement_label_missing';
      } else if (!serviceRequirements.every((required) => {
                   const value = capacity.capacity_hint?.services?.[required];
                   return value === true || value?.ready === true;
                 })) {
        candidate.reason = 'service_capability_not_ready';
      } else if (requireAttestation === true && capacity.attestation_supported !== true) {
        candidate.reason = 'attestation_not_supported';
      } else if (requireAttestation === true && !String(capacity.device_fingerprint || '').trim()) {
        candidate.reason = 'device_fingerprint_missing';
      } else if (capacity.expires_at &&
                 Number.isFinite(Date.parse(capacity.expires_at)) &&
                 Date.parse(capacity.expires_at) < Date.now()) {
        candidate.reason = 'capacity_offer_expired';
      } else {
        candidate.eligible = true;
        candidate.allocation_auth = String(capacity.allocation_auth || 'unspecified');
        candidate.runtime = String(capacity.runtime || '');
        candidate.platform = String(capacity.platform || '');
        candidate.placement_labels = Array.isArray(capacity.placement_labels)
          ? capacity.placement_labels.map(String)
          : [];
        candidate.service_capabilities = Object.fromEntries(
          serviceRequirements.map((key) => [
            key,
            capacity.capacity_hint?.services?.[key] ?? null
          ])
        );
        candidate.attestation_supported = capacity.attestation_supported === true;
        candidate.device_fingerprint_present = Boolean(
          String(capacity.device_fingerprint || '').trim()
        );
      }
    } catch (error) {
      candidate.reason = error?.name === 'AbortError'
        ? 'capacity_endpoint_timeout'
        : 'capacity_endpoint_unreachable';
    }

    candidates.push(candidate);
  }

  const eligible = candidates
    .filter((candidate) => candidate.eligible)
    .sort((a, b) =>
      String(a.node_id).localeCompare(String(b.node_id)) ||
      String(a.endpoint).localeCompare(String(b.endpoint))
    );

  const body = {
    schema: 'evercraft.yard.capacity-resolution.v1',
    workload_class: workloadClass,
    requirements: {
      workloads: workloadRequirements,
      placement_labels: labelRequirements,
      service_capabilities: serviceRequirements,
      attestation_required: requireAttestation === true,
    },
    observed_at: observedAt,
    discovered_count: beacons.length,
    eligible_count: eligible.length,
    excluded_node_ids: [...excluded],
    selected: eligible[0] || null,
    candidates,
  };

  return {
    ...body,
    receipt_hash: sha(body),
  };
}

export function allocatorTokenForOffer(offer, {
  allocatorToken = '',
  allocatorTokens = {},
} = {}) {
  if (!offer) return '';
  return String(
    allocatorTokens?.[offer.node_id] ||
    allocatorTokens?.[offer.endpoint] ||
    allocatorToken ||
    ''
  );
}
