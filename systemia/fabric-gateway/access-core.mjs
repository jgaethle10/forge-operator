import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALLOWED_ENVIRONMENTS = new Set(['test', 'live', 'sandbox']);
const nowIso = () => new Date().toISOString();

export function normalizeScopes(scopes = []) {
  return [...new Set(
    (Array.isArray(scopes) ? scopes : [])
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean)
  )].sort();
}

function verifierFor(secret, pepper) {
  if (!pepper || typeof pepper !== 'string' || pepper.length < 32) {
    throw new Error('verification_pepper_required');
  }
  return createHmac('sha256', pepper).update(secret).digest('hex');
}

function equalHex(left, right) {
  if (
    typeof left !== 'string' ||
    typeof right !== 'string' ||
    left.length !== right.length ||
    !/^[a-f0-9]+$/i.test(left) ||
    !/^[a-f0-9]+$/i.test(right)
  ) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

export function scopeAllows(granted, requested) {
  const have = String(granted || '').trim().toLowerCase();
  const need = String(requested || '').trim().toLowerCase();
  if (!have || !need) return false;
  if (have === '*' || have === need) return true;
  if (have.endsWith('*')) return need.startsWith(have.slice(0, -1));
  return false;
}

export function issueApiKey({
  projectKey,
  tenantKey,
  principalRef = null,
  hostType = 'external_host',
  environment = 'test',
  scopes = [],
  expiresAt = null,
  pepper,
  clock = nowIso,
} = {}) {
  if (!projectKey || !tenantKey) throw new Error('project_and_tenant_required');
  if (!ALLOWED_ENVIRONMENTS.has(environment)) throw new Error('invalid_environment');

  const keyId = randomBytes(12).toString('base64url');
  const secret = randomBytes(32).toString('base64url');
  const prefix = `ecf_${environment}_${keyId}`;
  const credential = `${prefix}.${secret}`;
  const issuedAt = clock();

  if (expiresAt && Date.parse(expiresAt) <= Date.parse(issuedAt)) {
    throw new Error('credential_expiry_invalid');
  }

  const actorRef = principalRef || `host:${tenantKey}:${projectKey}:${keyId}`;
  const record = {
    schema: 'evercraft.fabric.credential.v1',
    credential_id: `cred_${keyId}`,
    key_id: keyId,
    display_prefix: prefix,
    credential_fingerprint: createHmac('sha256', pepper).update(prefix).digest('hex').slice(0, 24),
    verifier: verifierFor(credential, pepper),
    project_key: String(projectKey),
    tenant_key: String(tenantKey),
    actor_ref: String(actorRef),
    host_type: String(hostType || 'external_host'),
    principal_type: 'fabric_host_credential',
    environment,
    scope_keys: normalizeScopes(scopes),
    status: 'active',
    issued_at: issuedAt,
    expires_at: expiresAt,
    revoked_at: null,
    revocation_reason: '',
    secret_material_stored: false,
  };

  return { secret_once: credential, record };
}

export function parseApiKey(presented) {
  const value = String(presented || '');
  const match = value.match(/^ecf_(test|live|sandbox)_([A-Za-z0-9_-]{8,})\.([A-Za-z0-9_-]{20,})$/);
  if (!match) return null;
  return {
    environment: match[1],
    key_id: match[2],
    secret: match[3],
    prefix: `ecf_${match[1]}_${match[2]}`,
  };
}

export function verifyApiKey(presented, record, { pepper, clock = nowIso } = {}) {
  if (!record) return { ok: false, reason: 'credential_not_found' };
  const parsed = parseApiKey(presented);
  if (!parsed) return { ok: false, reason: 'credential_malformed' };
  if (record.status !== 'active') return { ok: false, reason: `credential_${record.status || 'inactive'}` };
  if (parsed.key_id !== record.key_id || parsed.environment !== record.environment) {
    return { ok: false, reason: 'credential_identity_mismatch' };
  }
  if (record.expires_at && Date.parse(record.expires_at) <= Date.parse(clock())) {
    return { ok: false, reason: 'credential_expired' };
  }
  const actual = verifierFor(String(presented), pepper);
  if (!equalHex(actual, record.verifier)) return { ok: false, reason: 'credential_invalid' };

  return {
    ok: true,
    principal: {
      credential_id: record.credential_id,
      project_key: record.project_key,
      tenant_key: record.tenant_key,
      actor_ref: record.actor_ref,
      host_type: record.host_type,
      principal_type: record.principal_type,
      environment: record.environment,
      scope_keys: normalizeScopes(record.scope_keys),
      passport_grant_id: record.passport_grant_id || null,
    },
  };
}

export function authorizeCapability({
  principal,
  capabilityKey,
  environment = null,
  requiredScopes = [],
  entitlement = null,
} = {}) {
  if (!principal) return { allowed: false, reason: 'principal_missing' };
  if (!capabilityKey) return { allowed: false, reason: 'capability_missing' };
  if (environment && principal.environment !== environment) {
    return { allowed: false, reason: 'environment_mismatch' };
  }

  const held = normalizeScopes(principal.scope_keys);
  const missing = normalizeScopes(requiredScopes).filter(
    (scope) => !held.some((granted) => scopeAllows(granted, scope))
  );
  if (missing.length) return { allowed: false, reason: 'scope_denied', missing_scopes: missing };

  if (entitlement) {
    if (entitlement.status !== 'active') return { allowed: false, reason: 'entitlement_inactive' };
    if (entitlement.project_key && entitlement.project_key !== principal.project_key) {
      return { allowed: false, reason: 'entitlement_project_mismatch' };
    }
    if (
      Array.isArray(entitlement.capability_keys) &&
      !entitlement.capability_keys.includes(capabilityKey)
    ) return { allowed: false, reason: 'capability_not_entitled' };
  }

  return { allowed: true, reason: null };
}

export function revokeCredential(record, reason = 'revoked', at = nowIso()) {
  if (!record) throw new Error('credential_required');
  return {
    ...record,
    status: 'revoked',
    revoked_at: at,
    revocation_reason: String(reason || 'revoked'),
  };
}

export function safeCredentialRecord(record) {
  if (!record) return null;
  const { verifier: _verifier, ...safe } = record;
  return safe;
}
