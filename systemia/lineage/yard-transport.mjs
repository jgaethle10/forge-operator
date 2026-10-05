import { createYardRelayLineageRemote } from './http-remote.mjs';

const WORKLOAD = 'systemia.lineage-remote.v1';

async function requestJson(url, options = {}, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(options.headers || {}),
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(String(body?.error || `http_${response.status}`));
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function eligibleNode(inventory, nodeId, { requireZeroCost = true } = {}) {
  const node = (inventory?.nodes || []).find(
    (row) => String(row.node_id || '') === String(nodeId || '')
  );
  if (!node) throw new Error('lineage_yard_node_not_found');

  const capacity = node.capacity || {};
  const workloads = new Set((capacity.supported_workloads || []).map(String));
  const eligible = Boolean(
    node.connected === true &&
    capacity.authorized === true &&
    capacity.session_attestation_verified === true &&
    workloads.has(WORKLOAD) &&
    String(node.device_fingerprint || '') &&
    String(capacity.device_fingerprint || '') === String(node.device_fingerprint || '') &&
    (!requireZeroCost || capacity.zero_cost === true)
  );

  if (!eligible) {
    const error = new Error('lineage_yard_node_not_eligible');
    error.node = {
      node_id: node.node_id || null,
      connected: node.connected === true,
      authorized: capacity.authorized === true,
      attested: capacity.session_attestation_verified === true,
      workload_supported: workloads.has(WORKLOAD),
      zero_cost: capacity.zero_cost === true,
      device_fingerprint_match:
        Boolean(node.device_fingerprint) &&
        String(capacity.device_fingerprint || '') === String(node.device_fingerprint || ''),
    };
    throw error;
  }
  return node;
}

export async function openYardLineageRemote({
  yard,
  brokerDeploymentId,
  nodeId,
  remoteKey = 'default',
  requireZeroCost = true,
  leaseTtlMs = 5 * 60_000,
  relayTtlMs = 5 * 60_000,
  allowLoopbackProof = false,
  timeoutMs = 15_000,
} = {}) {
  if (!yard || typeof yard.listRemoteCapacityNodes !== 'function') {
    throw new Error('lineage_yard_operator_required');
  }
  if (typeof yard.remoteCapacityGrant !== 'function') {
    throw new Error('lineage_yard_grant_capability_required');
  }
  if (typeof yard.createRemoteServiceRelay !== 'function') {
    throw new Error('lineage_yard_relay_capability_required');
  }
  if (typeof yard.releaseRemoteServiceRelay !== 'function') {
    throw new Error('lineage_yard_relay_release_capability_required');
  }
  if (!brokerDeploymentId) throw new Error('lineage_yard_broker_deployment_required');
  if (!nodeId) throw new Error('lineage_yard_node_id_required');
  if (!/^[a-zA-Z0-9._-]{1,80}$/.test(String(remoteKey))) {
    throw new Error('lineage_yard_remote_key_invalid');
  }

  const inventory = await yard.listRemoteCapacityNodes(brokerDeploymentId);
  const selected = eligibleNode(inventory, nodeId, { requireZeroCost });
  const grant = await yard.remoteCapacityGrant(
    brokerDeploymentId,
    nodeId,
    { allowLoopbackProof }
  );

  if (
    String(grant.node_id || '') !== String(selected.node_id || '') ||
    String(grant.device_fingerprint || '') !== String(selected.device_fingerprint || '') ||
    !grant.capacity_endpoint ||
    !grant.allocator_token
  ) {
    throw new Error('lineage_yard_grant_identity_mismatch');
  }

  const authority = {
    allocatorToken: String(grant.allocator_token),
    leaseToken: '',
    relayToken: '',
  };
  let lease = null;
  let relay = null;
  let serviceId = null;
  let closed = false;

  const cleanup = async (reason = 'lineage_session_close') => {
    if (closed) {
      return {
        schema: 'evercraft.lineage.yard-session-close.v1',
        closed: true,
        deduplicated: true,
        authority_material_persisted: false,
      };
    }
    closed = true;
    const errors = [];

    if (relay?.relay_id) {
      try {
        await yard.releaseRemoteServiceRelay(
          brokerDeploymentId,
          relay.relay_id,
          { reason }
        );
      } catch (error) {
        errors.push(`relay_release:${String(error?.message || error)}`);
      }
    }

    if (lease?.lease_id && authority.leaseToken) {
      try {
        await requestJson(
          `${grant.capacity_endpoint}/v1/leases/${encodeURIComponent(lease.lease_id)}/release`,
          {
            method: 'POST',
            body: JSON.stringify({ token: authority.leaseToken }),
          },
          timeoutMs
        );
      } catch (error) {
        errors.push(`lease_release:${String(error?.message || error)}`);
      }
    }

    authority.allocatorToken = '';
    authority.leaseToken = '';
    authority.relayToken = '';

    return {
      schema: 'evercraft.lineage.yard-session-close.v1',
      closed: true,
      deduplicated: false,
      node_id: String(nodeId),
      remote_key: String(remoteKey),
      service_id: serviceId,
      relay_id: relay?.relay_id || null,
      authority_material_persisted: false,
      allocator_token_retained: false,
      lease_token_retained: false,
      relay_token_retained: false,
      cleanup_errors: errors,
    };
  };

  try {
    lease = await requestJson(
      `${grant.capacity_endpoint}/v1/leases`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${authority.allocatorToken}` },
        body: JSON.stringify({
          workload_class: WORKLOAD,
          requested_ttl_ms: Math.max(60_000, Number(leaseTtlMs || 5 * 60_000)),
        }),
      },
      timeoutMs
    );
    authority.leaseToken = String(lease.token || '');
    if (!lease.lease_id || !authority.leaseToken) {
      throw new Error('lineage_yard_lease_invalid');
    }

    const job = await requestJson(
      `${grant.capacity_endpoint}/v1/jobs`,
      {
        method: 'POST',
        body: JSON.stringify({
          lease_id: lease.lease_id,
          token: authority.leaseToken,
          workload_class: WORKLOAD,
          input: { remote_key: String(remoteKey) },
        }),
      },
      timeoutMs
    );

    if (
      job?.result?.schema !== 'evercraft.compute.resident-service.v1' ||
      job?.result?.workload_class !== WORKLOAD ||
      job?.result?.protocol !== 'evercraft.lineage.remote.v1' ||
      !job?.result?.service_id
    ) {
      throw new Error('lineage_yard_resident_service_contract_invalid');
    }
    serviceId = String(job.result.service_id);

    relay = await yard.createRemoteServiceRelay(brokerDeploymentId, {
      nodeId,
      serviceId,
      ttlMs: Math.max(60_000, Number(relayTtlMs || 5 * 60_000)),
      allowLoopbackProof,
    });
    authority.relayToken = String(relay.relay_token || '');
    if (!relay.relay_url || !relay.relay_id || !authority.relayToken) {
      throw new Error('lineage_yard_relay_invalid');
    }

    const remote = createYardRelayLineageRemote({
      relayUrl: relay.relay_url,
      tokenProvider: () => authority.relayToken,
      timeoutMs,
    });
    const health = await remote.init();

    return {
      schema: 'evercraft.lineage.yard-session.v1',
      remote,
      node_id: String(nodeId),
      device_fingerprint: String(selected.device_fingerprint || ''),
      remote_key: String(remoteKey),
      service_id: serviceId,
      relay_id: relay.relay_id,
      health,
      receipts: {
        inventory: inventory.compute_management_receipt_hash || null,
        control_grant: grant.control_grant_receipt_hash || null,
        public_route: grant.public_route_receipt_hash || null,
        service_start: job.receipt?.receipt_hash || null,
        relay: relay.compute_management_receipt_hash || null,
      },
      authority_material_persisted: false,
      allocator_token_persisted: false,
      lease_token_persisted: false,
      relay_token_persisted: false,
      close: cleanup,
    };
  } catch (error) {
    await cleanup('lineage_session_open_failed');
    throw error;
  }
}

export const yardLineageTransport = { workload_class: WORKLOAD };
