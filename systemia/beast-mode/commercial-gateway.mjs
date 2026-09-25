import { createHash } from 'node:crypto';

export const COMMERCIAL_SCHEMA = 'evercraft.beast-mode.commercial-job.v1';
export const AUTH_SCHEMA = 'evercraft.beast-mode.commercial-authorization.v1';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}
function digest(value) {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
function clean(value) { return String(value ?? '').trim(); }
function positiveInt(value, name, { allowZero = false } = {}) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || (allowZero ? n < 0 : n <= 0)) throw new Error(`${name}_invalid`);
  return n;
}
function requireString(value, name) {
  const out = clean(value);
  if (!out) throw new Error(`${name}_required`);
  return out;
}

export function createQuote(input, { now = new Date().toISOString(), ttlSeconds = 900 } = {}) {
  const expires = new Date(Date.parse(now) + positiveInt(ttlSeconds, 'quote_ttl_seconds') * 1000).toISOString();
  const request = {
    customer_ref: requireString(input?.customer_ref, 'customer_ref'),
    source_scope: requireString(input?.source_scope, 'source_scope'),
    destination_scope: requireString(input?.destination_scope, 'destination_scope'),
    byte_count: positiveInt(input?.byte_count, 'byte_count', { allowZero: true }),
    artifact_count: positiveInt(input?.artifact_count, 'artifact_count'),
    destination_complexity: clean(input?.destination_complexity) || 'standard',
    retention_class: clean(input?.retention_class) || 'transient',
    verification_depth: clean(input?.verification_depth) || 'full',
    priority: clean(input?.priority) || 'standard'
  };
  return {
    schema: 'evercraft.beast-mode.quote.v1',
    quote_id: `beast-quote:${digest({ request, now, expires })}`,
    created_at: now,
    expires_at: expires,
    request,
    status: 'quoted'
  };
}

export function authorizeQuote(quote, input, { now = new Date().toISOString() } = {}) {
  if (quote?.schema !== 'evercraft.beast-mode.quote.v1') throw new Error('quote_schema_invalid');
  if (Date.parse(quote.expires_at) <= Date.parse(now)) throw new Error('quote_expired');
  if (input?.human_or_customer_authorized !== true) throw new Error('human_or_customer_authority_required');
  if (input?.payment_entitlement_verified !== true) throw new Error('payment_entitlement_required');
  const authority = {
    schema: AUTH_SCHEMA,
    authorization_id: `beast-auth:${digest({
      quote_id: quote.quote_id,
      customer_ref: quote.request.customer_ref,
      source_scope: quote.request.source_scope,
      destination_scope: quote.request.destination_scope,
      entitlement_ref: requireString(input?.entitlement_ref, 'entitlement_ref'),
      expires_at: requireString(input?.expires_at, 'authorization_expires_at')
    })}`,
    quote_id: quote.quote_id,
    customer_ref: quote.request.customer_ref,
    source_scope: quote.request.source_scope,
    destination_scope: quote.request.destination_scope,
    entitlement_ref: requireString(input?.entitlement_ref, 'entitlement_ref'),
    authorized_at: now,
    expires_at: requireString(input?.expires_at, 'authorization_expires_at'),
    customer_delivery_authorized: true,
    authority_escalation: false
  };
  if (Date.parse(authority.expires_at) <= Date.parse(now)) throw new Error('authorization_expired');
  return authority;
}

export function admitCommercialJob({ quote, authorization, cargoId }, { now = new Date().toISOString() } = {}) {
  if (quote?.schema !== 'evercraft.beast-mode.quote.v1') throw new Error('quote_schema_invalid');
  if (authorization?.schema !== AUTH_SCHEMA) throw new Error('authorization_schema_invalid');
  if (authorization.quote_id !== quote.quote_id) throw new Error('authorization_quote_mismatch');
  if (authorization.customer_ref !== quote.request.customer_ref) throw new Error('authorization_customer_mismatch');
  if (authorization.source_scope !== quote.request.source_scope) throw new Error('authorization_source_scope_mismatch');
  if (authorization.destination_scope !== quote.request.destination_scope) throw new Error('authorization_destination_scope_mismatch');
  if (authorization.customer_delivery_authorized !== true) throw new Error('customer_delivery_authority_required');
  if (Date.parse(authorization.expires_at) <= Date.parse(now)) throw new Error('authorization_expired');
  const cargo_id = requireString(cargoId, 'cargo_id');
  return {
    schema: COMMERCIAL_SCHEMA,
    job_id: `beast-job:${digest({ quote_id: quote.quote_id, authorization_id: authorization.authorization_id, cargo_id })}`,
    quote_id: quote.quote_id,
    authorization_id: authorization.authorization_id,
    cargo_id,
    customer_ref: quote.request.customer_ref,
    source_scope: quote.request.source_scope,
    destination_scope: quote.request.destination_scope,
    entitlement_ref: authorization.entitlement_ref,
    admitted_at: now,
    state: 'AUTHORIZED',
    agent_financial_authority: false
  };
}
