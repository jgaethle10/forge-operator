/**
 * Authorized read membrane for the One-Body Living Graph projection.
 * This is a service adapter, NOT an HTTP handler. Authentication belongs
 * to the host identity middleware; permission comes from existing Passport.
 */
import { EvercraftPassport } from '../passport/passport.mjs';
import { readOneBodyStore } from './one-body-store.mjs';
import { buildOneBodyVisualSnapshot } from './one-body-visibility.mjs';
import { verifySignedBodyLaneReceipt } from './one-body-lane-signature.mjs';

const DENIED=Object.freeze({
  schema:'evercraft.one-body.snapshot-access.v1',
  allowed:false,
  reason:'not_authorized',
  snapshot:null,
});
const text=v=>typeof v==='string'?v.trim():'';

export function createOneBodySnapshotReader({
  passportStateDir, bodyStateFile,
  verifySession, trustedConsumers = {},
  clock = () => new Date(),
}={}) {
  if (typeof verifySession !== 'function') throw Error('trusted_identity_verifier_required');
  if (!text(passportStateDir) || !text(bodyStateFile)) throw Error('snapshot_reader_configuration_required');
  if (!trustedConsumers || typeof trustedConsumers !== 'object' ||
      Array.isArray(trustedConsumers)) throw Error('invalid_consumer_trust_configuration');
  if (typeof clock!=='function') throw Error('invalid_snapshot_clock');
  // Snapshot the operator-provisioned trust map, not the user's request data.
  const pinnedTrust=structuredClone(trustedConsumers);

  return {
    async read(session) {
      let subject;
      try {
        // The callback must be a privileged host verifier, not a caller-claimed
        // subject_ref from query params, cookies or JSON.
        const resolved=await verifySession(session);
        subject=text(resolved?.subject_ref);
      } catch {
        return {...DENIED};
      }
      if (!subject) return {...DENIED};
      const now=clock();
      const iso=now instanceof Date?now.toISOString():new Date(now).toISOString();
      // Passport determines permissions on EVERY read, preserving revocation.
      const passport=new EvercraftPassport({stateDir:passportStateDir});
      const decision=passport.authorize({
        subject_ref:subject,
        product:'evercraft-context',
        scope:'context.read.systemia',
        resource_ref:'systemia:one-body',
        at:iso,
      });
      if (decision.decision!=='allow') return {...DENIED};

      const stored=await readOneBodyStore(bodyStateFile);
      const snapshot=buildOneBodyVisualSnapshot({
        state:stored.state,
        observedAt:iso,
        verifyReceipt:r=>verifySignedBodyLaneReceipt(r,{trustedConsumers:pinnedTrust}),
      });
      return {
        schema:'evercraft.one-body.snapshot-access.v1',
        allowed:true,
        snapshot,
        authority:'passport_live_read_decision',
        mutation_performed:false,
        execution_authority_granted:false,
      };
    }
  };
}
