// Read-only public-health comparison against a Yard broker-route receipt.
// This helper cannot authorize a NodeSeed, mint broker grants, enable Remote
// Operator, or determine whether the supplied Yard receipt was authenticated.
// The caller MUST independently trust the Yard source and provide an explicit
// exact-origin allowlist before calling it.
function hexReceipt(value) {
  return /^sha256:[a-f0-9]{64}$/i.test(String(value || ''));
}
function origin(value) {
  const url = new URL(String(value || ''));
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password ||
      url.search || url.hash || url.pathname !== '/' ||
      !host || host === 'localhost' || host.endsWith('.localhost') ||
      host.endsWith('.local') || host.endsWith('.internal') ||
      /^\\d{1,3}(?:\\.\\d{1,3}){3}$/.test(host) ||
      host.includes(':')) {
    throw new Error('broker_public_origin_invalid');
  }
  return url.origin;
}
function claim(yardReceipt) {
  if (!yardReceipt || yardReceipt.schema !== 'evercraft.remote-capacity.public-broker.v1' ||
      yardReceipt.verified !== true ||
      yardReceipt.source !== 'Systemia Yard Operator' ||
      yardReceipt.health_path !== '/v1/remote/health' ||
      yardReceipt.secure_envelope_schema !== 'evercraft.secure-envelope.v1' ||
      !hexReceipt(yardReceipt.deployment_receipt_hash) ||
      !hexReceipt(yardReceipt.public_route_receipt_hash) ||
      !/^remote_broker_[a-f0-9]{24}$/.test(String(yardReceipt.instance_id || ''))) {
    throw new Error('yard_broker_route_receipt_invalid');
  }
  return origin(yardReceipt.origin);
}
export async function comparePublicBrokerWithYardReceipt({
  yardReceipt,
  allowedOrigins,
  fetchImpl = fetch,
  timeoutMs = 5000,
} = {}) {
  // Require both an independently obtained Yard record AND a separately
  // approved exact origin. Comparing a self-supplied claim is not trust.
  const expectedOrigin = claim(yardReceipt);
  if (!Array.isArray(allowedOrigins) || !allowedOrigins.length ||
      !allowedOrigins.some(x => {
        try { return origin(x) === expectedOrigin; } catch { return false; }
      })) throw new Error('broker_origin_not_independently_allowlisted');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 250 || timeoutMs > 10000)
    throw new Error('broker_health_timeout_out_of_bounds');
  if (typeof fetchImpl !== 'function') throw new Error('broker_health_fetch_required');
  const target = expectedOrigin + '/v1/remote/health';
  let response;
  try {
    response = await fetchImpl(target, {
      method: 'GET',
      redirect: 'error',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return {
      schema: 'evercraft.remote-broker.public-route-preflight.v1',
      result: 'unreachable',
      health_matches_yard_claim: false,
      yard_receipt_source_authenticated_by_this_tool: false,
      remote_control_authorized: false,
    };
  }
  let health = null;
  if (response?.status === 200) {
    try { health = await response.json(); } catch {}
  }
  const matched = response?.status === 200 &&
    health?.ok === true &&
    health?.schema === 'evercraft.remote-capacity.broker-health.v1' &&
    health?.service === 'remote-capacity-broker' &&
    health?.runtime === 'Evercraft Compute' &&
    health?.instance_id === yardReceipt.instance_id &&
    health?.deployment_receipt_bound === true &&
    health?.deployment_receipt_ref === yardReceipt.deployment_receipt_hash &&
    health?.secure_envelope_schema === 'evercraft.secure-envelope.v1';
  return {
    schema: 'evercraft.remote-broker.public-route-preflight.v1',
    result: matched ? 'health_matches_claim' : 'health_mismatch',
    health_matches_yard_claim: Boolean(matched),
    yard_receipt_source_authenticated_by_this_tool: false,
    remote_control_authorized: false,
  };
}
