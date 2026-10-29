import { createPublicKey, verify } from 'node:crypto';

// Internal policy gate, NOT an account monitor, bank adapter, or transfer API.
// All 'trusted*' parameters must come from privileged Systemia/Raven Nexus services,
// never directly from an agent, model output, browser, or an external request body.
const GRANT_KEYS = ['schema', 'grant_id', 'subject_id', 'agent_id', 'connector_id',
  'account_refs', 'scopes', 'issued_at', 'expires_at'];
const READ_OPS = Object.freeze({
  'account.read': 'accounts:read',
  'balance.read': 'balances:read',
  'transactions.read': 'transactions:read',
});
const GRANT_SCHEMA = 'evercraft.account-sentinel.grant.v1';
const ENVELOPE_SCHEMA = 'evercraft.account-sentinel.signed-grant.v1';
const REQUEST_SCHEMA = 'evercraft.account-sentinel.request.v1';
const MAX_GRANT_MS = 24 * 60 * 60 * 1000;
const FUTURE_SKEW_MS = 5 * 60 * 1000;
const field = value => typeof value === 'string' && value.trim().length > 0;
const exactKeys = (o, keys) => o && typeof o === 'object' && !Array.isArray(o) &&
  Object.keys(o).sort().join('|') === [...keys].sort().join('|');
const uniqueStrings = a => Array.isArray(a) && a.length > 0 && a.length <= 32 &&
  a.every(field) && new Set(a).size === a.length;
const deny = reason => Object.freeze({ schema: 'evercraft.account-sentinel.decision.v1',
  allowed: false, decision: 'deny', reason });

export function signedGrantMessage(claims) {
  if (!exactKeys(claims, GRANT_KEYS) || claims.schema !== GRANT_SCHEMA ||
      ![claims.grant_id, claims.subject_id, claims.agent_id, claims.connector_id,
        claims.issued_at, claims.expires_at].every(field) ||
      !uniqueStrings(claims.account_refs) || !uniqueStrings(claims.scopes)) {
    throw new Error('invalid_financial_grant_claims');
  }
  // Domain separation prevents reusing unrelated Systemia approvals as banking grants.
  return Buffer.from('evercraft.account-sentinel.signed-grant.v1\n' +
    JSON.stringify(Object.fromEntries(GRANT_KEYS.map(k => [k, claims[k]]))), 'utf8');
}

export function evaluateFinancialAgentRequest({
  request,
  signedGrant,
  trustedPublicKeys,
  trustedPrincipal,
  trustedConnector,
  trustedRevocations,
  now = new Date(),
} = {}) {
  // Policy is read-only in v1. Not even a valid grant can authorize transfers.
  if (!exactKeys(request, ['schema', 'operation', 'account_ref', 'connector_id', 'method']) ||
      request.schema !== REQUEST_SCHEMA || ![request.operation, request.account_ref,
        request.connector_id, request.method].every(field)) return deny('invalid_request');
  if (!Object.hasOwn(READ_OPS, request.operation) || request.method !== 'GET') {
    return deny('financial_write_or_unknown_operation_forbidden');
  }
  if (!trustedPrincipal || trustedPrincipal.authenticated !== true ||
      trustedPrincipal.auth_source !== 'evercraft_identity' ||
      !field(trustedPrincipal.subject_id) || !field(trustedPrincipal.agent_id)) {
    return deny('unverified_agent_principal');
  }
  // Must be a fresh authoritative revocation lookup. Fail closed if unavailable.
  if (trustedRevocations?.fresh !== true || !(trustedRevocations.revoked_ids instanceof Set)) {
    return deny('revocation_check_unavailable');
  }
  // Registry values must originate from privileged connector configuration, not agent input.
  if (!trustedConnector || trustedConnector.connector_id !== request.connector_id ||
      trustedConnector.status !== 'active' || trustedConnector.mode !== 'delegated_oauth' ||
      trustedConnector.read_only !== true || trustedConnector.approved !== true ||
      !Array.isArray(trustedConnector.scopes) ||
      !trustedConnector.scopes.includes(READ_OPS[request.operation])) {
    return deny('connector_not_approved_for_scoped_read');
  }
  if (!exactKeys(signedGrant, ['schema', 'claims', 'key_id', 'signature_base64']) ||
      signedGrant.schema !== ENVELOPE_SCHEMA || !field(signedGrant.key_id) ||
      !field(signedGrant.signature_base64) ||
      !trustedPublicKeys || !Object.hasOwn(trustedPublicKeys, signedGrant.key_id)) {
    return deny('trusted_signed_consent_required');
  }
  const claims = signedGrant.claims;
  let payload;
  try { payload = signedGrantMessage(claims); }
  catch { return deny('invalid_consent_scope'); }
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const issued = Date.parse(claims.issued_at);
  const expires = Date.parse(claims.expires_at);
  if (![nowMs, issued, expires].every(Number.isFinite) ||
      expires <= issued || expires - issued > MAX_GRANT_MS ||
      issued > nowMs + FUTURE_SKEW_MS || expires <= nowMs) {
    return deny('expired_or_invalid_consent');
  }
  if (trustedRevocations.revoked_ids.has(claims.grant_id)) return deny('consent_revoked');
  if (claims.subject_id !== trustedPrincipal.subject_id ||
      claims.agent_id !== trustedPrincipal.agent_id ||
      claims.connector_id !== request.connector_id ||
      !claims.account_refs.includes(request.account_ref) ||
      !claims.scopes.includes(READ_OPS[request.operation])) {
    return deny('consent_request_mismatch');
  }
  try {
    const pub = createPublicKey(trustedPublicKeys[signedGrant.key_id]);
    if (pub.asymmetricKeyType !== 'ed25519') return deny('unsupported_signer');
    const encoded = signedGrant.signature_base64;
    if (!/^[A-Za-z0-9+/]{86}==$/.test(encoded)) return deny('invalid_signature');
    const sig = Buffer.from(encoded, 'base64');
    if (sig.length !== 64 || !verify(null, payload, pub, sig)) return deny('invalid_signature');
  } catch { return deny('invalid_signature'); }
  return Object.freeze({ schema: 'evercraft.account-sentinel.decision.v1',
    allowed: true, decision: 'allow_read_only', reason: 'scoped_consent_verified',
    grant_id: claims.grant_id, operation: request.operation, account_ref: request.account_ref,
    connector_id: request.connector_id, expires_at: claims.expires_at });
}
