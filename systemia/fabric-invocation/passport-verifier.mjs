import { createHash } from 'node:crypto';
import { EvercraftPassport } from '../passport/passport.mjs';

const RECEIPT = /^sha256:[a-f0-9]{64}$/i;
const digest = (value) => 'sha256:' + createHash('sha256')
  .update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');

function checked(value, name) {
  const text = String(value || '').trim();
  if (!text || text.length > 180) throw new Error('fabric_passport_' + name + '_invalid');
  return text;
}
function verifiedReceipt(receipt) {
  if (!receipt || !RECEIPT.test(String(receipt.receipt_hash || ''))) return false;
  const { receipt_hash, ...body } = receipt;
  return digest(body) === receipt_hash;
}

/**
 * Private Passport authority binding. The caller's actor_ref/tenant_key
 * are treated as claims, not authentication. identityVerifier MUST inspect
 * an independently authenticated connection or agent delegation and return
 * an attested identity. Never use a request-body "verified" boolean.
 *
 * This adapter is a local owned Passport implementation, not proof that a
 * production Systemia identity/session provider is connected.
 */
export function createFabricPassportVerifier({
  stateDir, identityVerifier, product = 'systemia',
  capabilityScopes = {
    'evercraft.web.browser.public.v1': 'fabric.browser.public.read',
  },
  clock = () => new Date(),
} = {}) {
  if (!stateDir || typeof identityVerifier !== 'function') {
    throw new Error('fabric_passport_private_identity_dependency_required');
  }
  const productKey = checked(product, 'product');
  const scopes = new Map(Object.entries(capabilityScopes));
  if (!scopes.size) throw new Error('fabric_passport_capability_registry_required');
  for (const [capability, scope] of scopes) {
    checked(capability, 'capability_key');
    checked(scope, 'scope');
  }

  return async ({ actor_ref, tenant_key, mission_key, capability_key, work_key }) => {
    const actor = checked(actor_ref, 'actor_ref');
    const tenant = checked(tenant_key, 'tenant_key');
    const mission = checked(mission_key, 'mission_key');
    checked(work_key, 'work_key');
    const capability = checked(capability_key, 'capability_key');
    const scope = scopes.get(capability);
    if (!scope) throw new Error('fabric_passport_capability_not_registered');

    const identity = await identityVerifier({
      requested_actor_ref: actor, requested_tenant_key: tenant,
      mission_key: mission, work_key, capability_key: capability,
    });
    if (identity?.verified !== true ||
        identity.actor_ref !== actor || identity.tenant_key !== tenant ||
        !RECEIPT.test(String(identity.receipt_hash || '')) ||
        !Number.isFinite(Date.parse(String(identity.expires_at || '')))) {
      throw new Error('fabric_passport_identity_unverified');
    }
    const at = clock().toISOString();
    const passport = new EvercraftPassport({ stateDir });
    const decision = passport.authorize({
      subject_ref: actor,
      product: productKey,
      scope, resource_ref: mission, at,
    });
    if (!verifiedReceipt(decision) ||
        decision.schema !== 'evercraft.passport.authorization-decision.v1' ||
        decision.subject_ref !== actor || decision.product !== productKey ||
        decision.scope !== scope || decision.resource_ref !== mission) {
      throw new Error('fabric_passport_decision_invalid');
    }
    if (decision.decision !== 'allow' || !decision.grant_id) {
      throw new Error('fabric_passport_scope_denied');
    }
    const grant = passport.getGrantState(decision.grant_id, { at });
    if (grant?.schema !== 'evercraft.passport.grant-state.v1' ||
        grant.active !== true || grant.subject_ref !== actor ||
        grant.product !== productKey || !grant.lineage.includes(decision.grant_id)) {
      throw new Error('fabric_passport_grant_not_active');
    }
    const expiry = Math.min(
      Date.parse(identity.expires_at), Date.parse(grant.ends_at),
    );
    if (!Number.isFinite(expiry) || expiry <= clock().getTime()) {
      throw new Error('fabric_passport_authority_expired');
    }
    return {
      decision: 'allow', actor_ref: actor, tenant_key: tenant,
      capability_key: capability,
      expires_at: new Date(expiry).toISOString(),
      receipt_hash: decision.receipt_hash,
      grant_id: decision.grant_id,
      identity_receipt_hash: identity.receipt_hash,
      authorization_product: productKey,
      authorization_scope: scope,
      resource_ref: mission,
      source: 'evercraft.passport.authorization-decision.v1',
    };
  };
}
