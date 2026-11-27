// One-shot, read-only evidence collection via existing Yard, broker and NodeSeed.
// Does not grant authority, dispatch agents, deploy services or persist source bytes.
// Device identity attests the session, not cryptographically signed file pages.
import { randomBytes } from 'node:crypto';
import { verifyNodeAttestation } from '../compute/device-identity.mjs';
import { verifyRemoteSourceObservation } from './remote-source-observation.mjs';

const HASH = /^sha256:[a-f0-9]{64}$/;
const MAX_SOURCE_BYTES = 16 * 1024 * 1024;
const MAX_PAGES = 128;
const MAX_PAGE_BYTES = 8 * 1024 * 1024;
const SCHEMA = 'evercraft.saban.attested-remote-source.v1';

function hold(receipt, reason) {
  return { ...receipt, status: 'hold', reason };
}

async function requestJson(url, { token, body, timeoutMs, fetchImpl }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + token,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('remote_http_not_successful');
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function collectAttestedRemoteSource({
  yard,
  brokerDeploymentId,
  nodeId,
  missionId,
  sourceId,
  rootKey = 'home',
  relativePath,
  expectedSha256,
  expectedBytes,
  pageBytes = 8192,
  timeoutMs = 15000,
  allowLoopbackProof = false,
  fetchImpl = fetch,
} = {}) {
  const receipt = {
    schema: SCHEMA,
    status: 'hold',
    reason: null,
    mission_id: missionId ?? null,
    source_id: sourceId ?? null,
    node_id: nodeId ?? null,
    device_fingerprint: null,
    broker_deployment_id: brokerDeploymentId ?? null,
    control_grant_receipt_hash: null,
    remote_node_identity_attested: false,
    broker_session_attestation_verified: false,
    secure_envelope_broker_route: false,
    source_bytes_verified: false,
    source_observation_receipt: null,
    pages_verified: 0,
    field_verified: false,
    physical_hardware_verified: false,
    objective_semantics_verified: false,
    coordinator_expectation_origin_attested: false,
    source_content_persisted: false,
    authority_material_persisted: false,
    runtime_dispatched: false,
    runtime_mutated: false,
  };

  // No unbounded reads or invalid source declarations. The original expected
  // SHA/length must be established by the trusted coordinator before calling.
  if (!yard || typeof yard.listRemoteCapacityNodes !== 'function' ||
      typeof yard.remoteCapacityGrant !== 'function' ||
      typeof brokerDeploymentId !== 'string' || !brokerDeploymentId ||
      typeof nodeId !== 'string' || !nodeId) {
    return hold(receipt, 'yard_broker_binding_required');
  }
  if (!HASH.test(String(expectedSha256 || '')) ||
      !Number.isSafeInteger(expectedBytes) || expectedBytes < 0 ||
      expectedBytes > MAX_SOURCE_BYTES ||
      !Number.isSafeInteger(pageBytes) || pageBytes < 1 ||
      pageBytes > MAX_PAGE_BYTES ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 100 ||
      timeoutMs > 30000) {
    return hold(receipt, 'source_read_constraints_invalid');
  }

  try {
    const inventory = await yard.listRemoteCapacityNodes(brokerDeploymentId);
    if (inventory?.schema !== 'evercraft.yard.remote-capacity-nodes.v1' ||
        inventory.broker_deployment_id !== brokerDeploymentId) {
      return hold(receipt, 'yard_inventory_binding_invalid');
    }
    const selected = (inventory.nodes || []).find(n => n.node_id === nodeId);
    if (!selected || selected.connected !== true ||
        selected.capacity?.authorized !== true ||
        selected.capacity?.session_attestation_verified !== true ||
        selected.capacity?.attestation_supported !== true ||
        !HASH.test(String(selected.device_fingerprint || '')) ||
        selected.capacity?.device_fingerprint !== selected.device_fingerprint ||
        selected.secure_envelope_schema !== 'evercraft.secure-envelope.v1') {
      return hold(receipt, 'eligible_attested_remote_session_required');
    }
    receipt.broker_session_attestation_verified = true;
    const grant = await yard.remoteCapacityGrant(brokerDeploymentId, nodeId, {
      allowLoopbackProof,
    });
    if (grant?.schema !== 'evercraft.yard.remote-capacity-grant.v1' ||
        grant.broker_deployment_id !== brokerDeploymentId ||
        grant.node_id !== nodeId ||
        grant.device_fingerprint !== selected.device_fingerprint ||
        !grant.allocator_token || !grant.capacity_endpoint ||
        !HASH.test(String(grant.control_grant_receipt_hash || ''))) {
      return hold(receipt, 'yard_grant_identity_mismatch');
    }

    // Reuse Yard's verified-route policy. Loopback is allowed only for an
    // explicitly scoped proof and never advertised as public reachability.
    const origin = new URL(grant.broker_origin);
    const capacity = new URL(grant.capacity_endpoint);
    const loopback = allowLoopbackProof === true &&
      grant.route_scope === 'loopback_proof' &&
      origin.protocol === 'http:' &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname);
    const publicHttps = grant.route_scope === 'public_https' &&
      origin.protocol === 'https:';
    if ((!loopback && !publicHttps) ||
        capacity.origin !== origin.origin ||
        capacity.pathname !== '/nodes/' + encodeURIComponent(nodeId)) {
      return hold(receipt, 'verified_broker_route_required');
    }
    receipt.secure_envelope_broker_route = true;
    receipt.control_grant_receipt_hash = grant.control_grant_receipt_hash;

    const nonce = randomBytes(24).toString('hex');
    const issued = await requestJson(grant.capacity_endpoint + '/v1/attest', {
      token: grant.allocator_token,
      body: { nonce },
      timeoutMs,
      fetchImpl,
    });
    if (issued?.ok !== true) return hold(receipt, 'attestation_request_failed');
    const verified = verifyNodeAttestation({
      attestation: issued.attestation,
      expectedNonce: nonce,
      expectedNodeId: nodeId,
      maxAgeMs: 60000,
    });
    if (!verified.ok || verified.device_fingerprint !== selected.device_fingerprint) {
      return hold(receipt, 'signed_device_attestation_mismatch');
    }
    receipt.remote_node_identity_attested = true;
    receipt.device_fingerprint = verified.device_fingerprint;

    const pages = [];
    let cursor = 0;
    let fileHash;
    for (let i = 0; i < MAX_PAGES; i++) {
      const page = await requestJson(grant.capacity_endpoint + '/v1/operator/fs/read', {
        token: grant.allocator_token,
        body: {
          root_key: rootKey,
          path: relativePath,
          encoding: 'base64',
          max_bytes: pageBytes,
          offset_bytes: cursor,
          ...(fileHash ? { expected_sha256: fileHash } : {}),
        },
        timeoutMs,
        fetchImpl,
      });
      // Reject identity/cursor problems *before* trusting the next cursor.
      if (page?.ok !== true || page.read_mode !== 'paged' ||
          page.offset_bytes !== cursor ||
          !HASH.test(String(page.sha256 || '')) ||
          (fileHash && fileHash !== page.sha256)) {
        return hold(receipt, 'source_page_transport_binding_invalid');
      }
      fileHash ||= page.sha256;
      pages.push(page);
      if (page.truncated === false) break;
      if (page.truncated !== true ||
          !Number.isSafeInteger(page.next_offset_bytes) ||
          page.next_offset_bytes <= cursor ||
          page.next_offset_bytes > expectedBytes) {
        return hold(receipt, 'source_page_cursor_invalid');
      }
      cursor = page.next_offset_bytes;
    }

    const checked = verifyRemoteSourceObservation({
      missionId, sourceId, rootKey, relativePath,
      expectedSha256, expectedBytes, pages,
    });
    receipt.pages_verified = checked.pages_verified;
    // Expose only hashes/counters/status. Do not return raw base64 pages, tokens,
    // attestation public key material or full provider response objects.
    receipt.source_observation_receipt = {
      schema: checked.schema,
      status: checked.status,
      reason: checked.reason,
      expected_sha256: checked.expected_sha256,
      observed_sha256: checked.observed_sha256,
      expected_bytes: checked.expected_bytes,
      observed_bytes: checked.observed_bytes,
      pages_verified: checked.pages_verified,
    };
    if (checked.status !== 'source_bytes_verified') {
      return hold(receipt, 'source_observation_' + checked.reason);
    }
    receipt.source_bytes_verified = true;
    receipt.status = 'attested_source_bytes_verified';
    return receipt;
  } catch {
    // Fail closed without exposing HTTP headers, remote filenames, credentials,
    // model output, or arbitrary content from remote/connector exceptions.
    return hold(receipt, 'remote_source_collection_failed');
  }
}
