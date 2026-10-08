import { createHash } from 'node:crypto';
import { verifyEvercraftSession } from '../evercraft-home/identity.mjs';
import { EvercraftIdentity } from '../identity/identity.mjs';

const HASH = /^sha256:[a-f0-9]{64}$/i;
const hash = (value) => 'sha256:' + createHash('sha256').update(JSON.stringify(value)).digest('hex');

/**
 * Native Evercraft Identity to private Fabric subject attestation.
 *
 * The session is read from a TRUSTED server-side source, never from a Fabric
 * payload or a self-asserted actor. This adapter is only appropriate for
 * direct human subject execution. Agent execution needs an independently
 * verified human-to-agent delegation bound to Passport.
 */
export function createEvercraftFabricSessionVerifier({
  identityStateDir, signingKeys, trustedSessionSource, trustedTenantResolver,
  clock = () => new Date(),
} = {}) {
  if (!identityStateDir || typeof trustedSessionSource !== 'function' ||
      typeof trustedTenantResolver !== 'function' ||
      !signingKeys || typeof signingKeys !== 'object' ||
      Array.isArray(signingKeys) || !Object.keys(signingKeys).length) {
    throw new Error('fabric_signed_identity_private_dependencies_required');
  }
  const identity = new EvercraftIdentity({ stateDir: identityStateDir });
  return async ({ requested_actor_ref, requested_tenant_key, mission_key, work_key, capability_key }) => {
    const actor = String(requested_actor_ref || '').trim();
    const tenant = String(requested_tenant_key || '').trim();
    const mission = String(mission_key || '').trim();
    const work = String(work_key || '').trim();
    const capability = String(capability_key || '').trim();
    if (![actor, tenant, mission, work, capability].every((v) => v && v.length <= 180)) {
      throw new Error('fabric_signed_identity_binding_invalid');
    }

    // Token source and tenant resolution are injected ONLY by the private
    // HTTP/session boundary after its own client authentication.
    const token = await trustedSessionSource();
    if (typeof token !== 'string' || token.length < 20 || token.length > 16384) {
      throw new Error('fabric_signed_identity_session_unavailable');
    }
    const now = clock();
    const session = verifyEvercraftSession(token, signingKeys, { now });
    identity.assertSessionActive(session);
    if (session.subject_ref !== actor) {
      throw new Error('fabric_signed_identity_subject_mismatch');
    }
    const subject = identity.getSubject(session.subject_ref);
    if (subject?.schema !== 'evercraft.identity.subject.v1' ||
        subject.status !== 'active') {
      throw new Error('fabric_signed_identity_subject_inactive');
    }
    const resolvedTenant = await trustedTenantResolver({
      subject_ref: session.subject_ref, session_id: session.session_id,
      mission_key: mission, capability_key: capability, work_key: work,
    });
    if (typeof resolvedTenant !== 'string' || resolvedTenant !== tenant) {
      throw new Error('fabric_signed_identity_tenant_unverified');
    }
    if (Date.parse(session.expires_at) <= now.getTime()) {
      throw new Error('fabric_signed_identity_session_expired');
    }
    // This receipt is a hash of an independently verified session decision.
    // It is not a stand-alone bearer credential or signature.
    const receiptBody = {
      schema: 'evercraft.fabric.signed-identity-decision.v1',
      subject_ref: session.subject_ref,
      session_id_hash: hash(session.session_id),
      tenant_key: resolvedTenant,
      mission_key: mission,
      work_key: work,
      capability_key: capability,
      signing_key_id: session.signing_key_id,
      verified_at: now.toISOString(),
      expires_at: session.expires_at,
      token_stored: false,
      agent_delegation_inferred: false,
    };
    return {
      verified: true,
      actor_ref: session.subject_ref,
      tenant_key: resolvedTenant,
      expires_at: session.expires_at,
      receipt_hash: hash(receiptBody),
      source: 'evercraft.identity.signed-session.v1',
    };
  };
}
