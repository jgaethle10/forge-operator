/**
 * Read-only Systemia ingress evidence gate.
 *
 * CI and source revisions do not establish live mission intake. Only a fresh,
 * exact-order, independently signed runtime observation may prove the transport.
 * It never grants mission, execution, external contact or release authority.
 */
import { createPublicKey, verify } from 'node:crypto';

export const CLAIM_SCHEMA = 'evercraft.systemia.ingress-runtime-claims.v1';
export const ENVELOPE_SCHEMA = 'evercraft.systemia.ingress-runtime-attestation.v1';
export const SNAPSHOT_SCHEMA = 'evercraft.systemia.ingress-evidence.v1';
const SIGNING_PREFIX = 'evercraft.systemia.ingress-observation.v1\n';
const FRESH_MS = 10 * 60_000;
const SKEW_MS = 30_000;
const CLAIM_KEYS = [
  'schema', 'scope', 'issuer', 'mission_key', 'dispatch_order_id',
  'trace_id', 'transport_run_id', 'runtime_revision', 'observed_at', 'expires_at',
];
const string = value => typeof value === 'string' ? value.trim() : '';
const isExact = (value, keys) => Boolean(value && typeof value === 'object' &&
  !Array.isArray(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|'));
const timestamp = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value)
  ? Date.parse(value) : NaN;
function fresh(value, nowMs) {
  const seen = timestamp(value);
  return Number.isFinite(seen) && seen <= nowMs + SKEW_MS && nowMs - seen <= FRESH_MS;
}
export function ingressClaimsMessage(claims) {
  if (!isExact(claims, CLAIM_KEYS) || claims.schema !== CLAIM_SCHEMA)
    throw new Error('invalid_ingress_claim_shape');
  return Buffer.from(SIGNING_PREFIX + JSON.stringify(
    Object.fromEntries(CLAIM_KEYS.map(key => [key, claims[key]]))), 'utf8');
}
export function assessIngressEvidence({
  snapshot, expectedMissionKey, expectedOrderId, trustedObservers = {}, now = new Date(),
} = {}) {
  const issues = [];
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(nowMs)) throw new Error('invalid_clock');
  if (!snapshot || snapshot.schema !== SNAPSHOT_SCHEMA) issues.push('snapshot_schema_invalid');
  if (!string(expectedMissionKey) || !string(expectedOrderId)) issues.push('exact_mission_and_order_required');
  if (snapshot?.scope !== 'internal_non_disputed') issues.push('scope_not_cleared');
  if (snapshot?.legal_hold === true) issues.push('legal_hold');
  const order = snapshot?.order || {};
  if (order.id !== expectedOrderId || order.mission_key !== expectedMissionKey)
    issues.push('order_identity_mismatch');
  if (!['acknowledged', 'in_progress', 'completed'].includes(order.status) ||
      !fresh(order.acknowledged_at, nowMs)) issues.push('order_unacknowledged');
  const trace = snapshot?.trace || {};
  if (trace.dispatch_order_id !== expectedOrderId || trace.agent_name !== 'Systemia' ||
      !string(trace.trace_id) || trace.status !== 'completed' ||
      !fresh(trace.started_at, nowMs)) issues.push('systemia_trace_missing_or_stale');
  const transport = snapshot?.transport || {};
  if (!['entity_trigger', 'bounded_scheduler'].includes(transport.kind) ||
      !string(transport.run_id) || transport.status !== 'completed' ||
      !fresh(transport.observed_at, nowMs)) issues.push('transport_receipt_missing_or_stale');
  const runtime = snapshot?.runtime || {};
  if (!/^[0-9a-f]{40}$/.test(string(runtime.revision)) ||
      runtime.source !== 'live_runtime_readback' ||
      !fresh(runtime.observed_at, nowMs)) issues.push('live_runtime_readback_missing');
  const att = snapshot?.attestation || {};
  const claims = att.claims;
  let validSignature = false;
  try {
    if (att.schema !== ENVELOPE_SCHEMA || !string(att.key_id) ||
        !string(att.signature_base64)) throw new Error('attestation_absent');
    const anchor = Object.hasOwn(trustedObservers, att.key_id) ? trustedObservers[att.key_id] : null;
    if (!anchor || anchor.issuer !== 'base44' || !string(anchor.public_key_pem))
      throw new Error('trusted_verifier_missing');
    const key = createPublicKey(anchor.public_key_pem);
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('wrong_key_type');
    const message = ingressClaimsMessage(claims);
    const observed = timestamp(claims.observed_at);
    const expires = timestamp(claims.expires_at);
    if (!Number.isFinite(observed) || !Number.isFinite(expires) ||
        expires <= observed || expires - observed > FRESH_MS ||
        !fresh(claims.observed_at, nowMs) || nowMs >= expires)
      throw new Error('attestation_expired');
    if (claims.scope !== 'systemia.ingress.observe' || claims.issuer !== 'base44' ||
        claims.mission_key !== expectedMissionKey || claims.dispatch_order_id !== expectedOrderId ||
        claims.trace_id !== trace.trace_id || claims.transport_run_id !== transport.run_id ||
        claims.runtime_revision !== runtime.revision) throw new Error('attestation_binding_mismatch');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(att.signature_base64))
      throw new Error('bad_signature_encoding');
    const signature = Buffer.from(att.signature_base64, 'base64');
    if (signature.length !== 64 || !verify(null, message, key, signature))
      throw new Error('signature_not_verified');
    validSignature = true;
  } catch {
    issues.push('independent_runtime_attestation_not_verified');
  }
  return {
    schema: 'evercraft.systemia.ingress-readiness.v1',
    mission_key: string(expectedMissionKey),
    dispatch_order_id: string(expectedOrderId),
    state: issues.length ? 'blocked' : 'ingress_transport_verified',
    issues: [...new Set(issues)],
    independent_observer_signature_verified: validSignature,
    source_ci_reported_success: snapshot?.source_ci?.conclusion === 'success',
    live_ingress_verified: issues.length === 0,
    agent_mission_completed: false,
    execution_authority_granted: false,
    external_contact_authorized: false,
    publication_authorized: false,
    production_release_authorized: false,
    notes: 'Signed exact-order ingress observation only. No mission completion or operational authority is conferred.',
  };
}
