import { createHash } from 'node:crypto';

const sha = (value) => createHash('sha256').update(
  typeof value === 'string' ? value : JSON.stringify(value)
).digest('hex');
const IDENTIFIER = /^[a-zA-Z0-9._-]{1,128}$/;
const REF = /^[a-zA-Z0-9._:@/-]{8,256}$/;
const ENGINE = 'evercraft-owned-browser-worker-v1';
const WORKLOAD = 'systemia.evercraft-web-browser.v1';
const MAX_BODY_BYTES = 3 * 1024 * 1024;

function name(value, label) {
  const clean = String(value || '');
  if (!IDENTIFIER.test(clean)) throw new Error('fabric_compute_' + label + '_invalid');
  return clean;
}
function deploymentRef(value) {
  const ref = String(value || '');
  if (!REF.test(ref)) throw new Error('fabric_compute_deployment_receipt_ref_invalid');
  return ref;
}
function loopbackOrigin(input) {
  let url;
  try { url = new URL(String(input || '')); }
  catch { throw new Error('fabric_compute_origin_invalid'); }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      url.protocol !== 'http:' ||
      !['127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('fabric_compute_private_loopback_required');
  }
  return url.origin;
}
function verifyComputeReceipt(raw, { serviceId, leaseId, nodeId, url, result }) {
  if (!raw || raw.schema !== 'evercraft.compute.receipt.v1' ||
      raw.type !== 'browser.render.executed' ||
      raw.service_id !== serviceId || raw.lease_id !== leaseId ||
      raw.node_id !== nodeId || raw.workload_class !== WORKLOAD ||
      raw.evidence_receipt_sha256 !== result?.evidence_receipt_sha256 ||
      raw.requested_url_sha256 !== sha(String(url || '')) ||
      !Number.isInteger(raw.seq) || raw.seq < 1 ||
      !/^[a-f0-9]{64}$/.test(String(raw.receipt_hash || ''))) {
    return false;
  }
  const { receipt_hash, ...body } = raw;
  return sha(body) === receipt_hash;
}
async function boundedJson(fetchImpl, url, options, timeoutMs, maxBytes = MAX_BODY_BYTES) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal, redirect: 'error' });
    if (!response || !response.ok || response.status < 200 || response.status >= 300) {
      throw new Error('fabric_compute_private_route_request_failed');
    }
    // Bounded response streaming. Checking size after response.text() would
    // let a faulty local Compute service exhaust Fabric memory first.
    const declaredLength = Number(response.headers?.get?.('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new Error('fabric_compute_response_too_large');
    }
    let text;
    if (response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) throw new Error('fabric_compute_response_too_large');
          chunks.push(Buffer.from(value));
        }
      } catch (error) {
        await reader.cancel().catch(() => {});
        throw error;
      }
      text = Buffer.concat(chunks, size).toString('utf8');
    } else {
      text = await response.text();
      if (Buffer.byteLength(text) > maxBytes) {
        throw new Error('fabric_compute_response_too_large');
      }
    }
    let payload;
    try { payload = JSON.parse(text); }
    catch { throw new Error('fabric_compute_response_invalid_json'); }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('fabric_compute_response_invalid');
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}
/**
 * Wrap an actual private Compute node browser service, not the public
 * /v1/browser/render edge. This only accepts explicit loopback Compute routes.
 * Cross-device browser access must come from an independently attested private
 * relay, not by weakening this adapter into an arbitrary HTTP fetch proxy.
 *
 * A trusted Yard/Compute control plane supplies deploymentReceiptRef and
 * leaseProvider. Secret lease tokens remain private, never appear in results.
 */
export function createComputeBrowserLeaseRuntime({
  origin, serviceId, nodeId, instanceId, deploymentReceiptRef,
  leaseProvider, fetchImpl = fetch, clock = () => Date.now(),
} = {}) {
  const base = loopbackOrigin(origin);
  const service = name(serviceId, 'service_id');
  const node = name(nodeId, 'node_id');
  const instance = name(instanceId, 'instance_id');
  const deployment = deploymentRef(deploymentReceiptRef);
  if (typeof leaseProvider !== 'function') throw new Error('fabric_compute_lease_provider_required');
  if (typeof fetchImpl !== 'function') throw new Error('fabric_compute_transport_required');
  const route = base + '/v1/services/' + encodeURIComponent(service);

  async function health() {
    const result = await boundedJson(fetchImpl, route + '/health', { method: 'GET' }, 3000, 16 * 1024);
    if (result.ok !== true || result.service !== 'evercraft-owned-browser-worker' ||
        result.engine !== ENGINE || result.instance_id !== instance ||
        result.deployment_receipt_ref !== deployment) {
      throw new Error('fabric_compute_browser_health_attestation_mismatch');
    }
    return {
      ...result,
      private_lease_transport: true,
      expected_node_id: node,
      workload_class: WORKLOAD,
      attested_deployment_receipt_ref: deployment,
    };
  }

  async function browse(job = {}) {
    if (!job || typeof job !== 'object' || typeof job.url !== 'string') {
      throw new Error('fabric_compute_browser_job_invalid');
    }
    // Require an independent health/deployment match on every dispatch.
    await health();
    const lease = await leaseProvider({
      service_id: service, workload_class: WORKLOAD, node_id: node,
    });
    if (!lease || lease.service_id !== service || lease.node_id !== node ||
        lease.workload_class !== WORKLOAD ||
        typeof lease.token !== 'string' || lease.token.length < 32 ||
        lease.token.length > 512 ||
        !IDENTIFIER.test(String(lease.lease_id || ''))) {
      throw new Error('fabric_compute_lease_binding_invalid');
    }
    const expiry = Date.parse(String(lease.expires_at || ''));
    const timeout = Number(job.timeout_ms || 15000);
    if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 30000 ||
        !Number.isFinite(expiry) || expiry <= clock() + timeout + 1000) {
      throw new Error('fabric_compute_lease_expired_or_expiring');
    }
    const envelope = await boundedJson(fetchImpl, route + '/browser', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept': 'application/json' },
      body: JSON.stringify({ token: lease.token, job }),
    }, timeout + 1000);
    if (envelope.ok !== true || envelope.service_id !== service ||
        envelope.result?.ok !== true ||
        verifyComputeReceipt(envelope.receipt, {
          serviceId: service, leaseId: lease.lease_id, nodeId: node,
          url: job.url, result: envelope.result,
        }) !== true) {
      throw new Error('fabric_compute_browser_receipt_unverified');
    }
    return envelope.result;
  }

  return {
    health,
    browse,
    serviceId: service,
    nodeId: node,
    instanceId: instance,
    deploymentReceiptRef: deployment,
    mode: 'owned_private_compute_lease',
  };
}
