/**
 * Systemia Living Graph, internal Passport-gated read adapter.
 *
 * This is a trusted-server library function, NOT an HTTP route.
 * verifiedSubjectRef must come from authoritative identity verification.
 * Passport checks authorization; it does not independently prove identity.
 */
import { lstat, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { EvercraftPassport } from '../../passport/passport.mjs';
import { readGoalState } from '../../organism/goal-store.mjs';
import { projectGoalToVisualSnapshot } from './goal-visual-bridge.mjs';
import { correlateSignedDeviceEvidence } from './signed-device-evidence.mjs';
import { readSignedMicroSeedReceipt } from '../../saban/microseed-signed-receipt-store.mjs';
import { loadActiveAmbientReceiptKeys } from './ambient-receipt-trust.mjs';

const SCOPE = 'mission.visual.read';
const PRODUCT = 'systemia';
const MAX_INPUT_BYTES = 524288;
const GOAL_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

function required(value, field) {
  if (typeof value !== 'string' || value.trim() !== value || !value.length) {
    throw new Error('visual_' + field + '_required');
  }
  return value;
}
function checkGrant(passport, subjectRef, resourceRef, at) {
  const decision = passport.authorize({
    subject_ref: subjectRef,
    product: PRODUCT,
    scope: SCOPE,
    resource_ref: resourceRef,
    at,
  });
  if (decision.decision !== 'allow' || !decision.grant_id) {
    throw new Error('visual_access_denied');
  }
  const state = passport.getGrantState(decision.grant_id, { at });
  // Passport allows unscoped grants; this viewer intentionally does not.
  if (!state.active || !Array.isArray(state.resource_refs) ||
      !state.resource_refs.includes(resourceRef)) {
    throw new Error('visual_access_denied');
  }
}

/**
 * Call only after the hosting system authenticates a subject.
 * Requires an exact goal:KEY resource and a local KEY.json goal file.
 */
async function loadAuthorizedGoalState({
  passportStateDir,
  goalStateDir,
  verifiedSubjectRef,
  goalKey,
  now = new Date(),
} = {}) {
  required(passportStateDir, 'passport_state_dir');
  required(goalStateDir, 'goal_state_dir');
  const subjectRef = required(verifiedSubjectRef, 'verified_subject');
  const key = required(goalKey, 'goal_key');
  if (!GOAL_KEY.test(key) || key.includes('..')) throw new Error('visual_goal_key_invalid');

  const instant = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(instant.getTime())) throw new Error('visual_clock_invalid');
  const at = instant.toISOString();
  const passport = new EvercraftPassport({ stateDir: passportStateDir });
  const resourceRef = 'goal:' + key;

  // Deny before opening or even statting the private goal file.
  checkGrant(passport, subjectRef, resourceRef, at);

  const root = await realpath(resolve(goalStateDir));
  const candidate = join(root, key + '.json');
  const info = await lstat(candidate);
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_INPUT_BYTES) {
    throw new Error('visual_input_file_invalid');
  }
  if (await realpath(candidate) !== candidate) {
    throw new Error('visual_input_file_invalid');
  }
  const state = await readGoalState(candidate);
  if (state.goal_key !== key) throw new Error('visual_goal_identity_mismatch');

  // Recheck revocations before returning any data.
  checkGrant(passport, subjectRef, resourceRef, at);
  return { state, instant, passport, subjectRef, resourceRef, at };
}

function annotatePassportScope(snapshot) {
  return {
    ...snapshot,
    source: 'systemia.goal-store.passport-scoped-internal-read.v1',
    provenance: {
      ...snapshot.provenance,
      trust: 'passport_scoped_local_file_only',
      passport_authorization_verified: true,
      identity_verification_performed_here: false,
      signature_verified: false,
      independent_effect_verified: false,
      execution_authority_granted: false,
      production_promotion_allowed: false,
      note: snapshot.provenance.device_receipt_signature_count
        ? 'Passport authorized an identity-bound mission read and pinned device receipts have verified signatures. Actual mission effects and delivery remain unverified.'
        : 'Passport authorized the subject for this mission. Identity validation is external to this library; no execution or outcome evidence was independently checked.',
    },
  };
}

export async function readPassportScopedGoalVisualSnapshot(options = {}) {
  const { state, instant, passport, subjectRef, resourceRef, at } = await loadAuthorizedGoalState(options);
  const snapshot = projectGoalToVisualSnapshot(state, { now: instant });
  checkGrant(passport, subjectRef, resourceRef, at);
  return annotatePassportScope(snapshot);
}

/**
 * Only call from an authenticated, trusted Systemia server process.
 * signedReceipts must come from an owned, independently scoped receipt store.
 * trustedDeviceKeys must come from pinned server configuration, NEVER from
 * receipt payloads, untrusted JSON, client headers or remote request bodies.
 * The caller's identity proof happens outside this library.
 */
export async function readPassportScopedGoalWithDeviceEvidence({
  signedReceipts = [],
  trustedDeviceKeys = {},
  ...options
} = {}) {
  const { state, instant, passport, subjectRef, resourceRef, at } = await loadAuthorizedGoalState(options);
  const snapshot = correlateSignedDeviceEvidence(state, {
    signedReceipts,
    trustedDeviceKeys,
    now: instant,
  });
  checkGrant(passport, subjectRef, resourceRef, at);
  return annotatePassportScope(snapshot);
}


/**
 * Internal owned-state reader. The attempt-to-device binding and device
 * state roots are injected ONLY by trusted server configuration, never a
 * browser or user-supplied JSON. No remote fetch, work dispatch or mutation.
 *
 * An absent journal entry remains a missing evidence gap, not a success.
 * A present malformed/unsigned/tampered entry fails the entire read.
 */
export async function readPassportScopedGoalFromSignedStore({
  receiptStateDirsByDevice = {},
  attemptDeviceMap = {},
  trustedDeviceKeys = {},
  ambientRegistryRoot = null,
  ...options
} = {}) {
  const {state, instant, passport, subjectRef, resourceRef, at} =
    await loadAuthorizedGoalState(options);
  if (!receiptStateDirsByDevice || typeof receiptStateDirsByDevice !== 'object' ||
      Array.isArray(receiptStateDirsByDevice) ||
      !attemptDeviceMap || typeof attemptDeviceMap !== 'object' ||
      Array.isArray(attemptDeviceMap)) {
    throw new Error('visual_signed_receipt_source_config_invalid');
  }
  // Check current device approval before reading private signed journals.
  // Passport has already authorized this exact mission.
  const activeDevices = [...new Set(state.tasks
    .filter(task => task.status === 'complete' && task.attempt_key &&
      Object.hasOwn(attemptDeviceMap, task.attempt_key) &&
      Object.hasOwn(receiptStateDirsByDevice, attemptDeviceMap[task.attempt_key]))
    .map(task => attemptDeviceMap[task.attempt_key]))];
  const effectiveKeys = ambientRegistryRoot === null
    ? trustedDeviceKeys
    : activeDevices.length
      ? await loadActiveAmbientReceiptKeys({
          ambientRegistryRoot, deviceIds:activeDevices, now:instant,
        })
      : {};
  const signedReceipts = [];
  let missingSource = 0;
  for (const task of state.tasks) {
    if (task.status !== 'complete' || !task.attempt_key ||
        !Array.isArray(task.receipt_refs) || task.receipt_refs.length === 0) continue;
    const device = Object.hasOwn(attemptDeviceMap, task.attempt_key)
      ? attemptDeviceMap[task.attempt_key] : null;
    const stateDir = typeof device === 'string' &&
      Object.hasOwn(receiptStateDirsByDevice, device)
      ? receiptStateDirsByDevice[device] : null;
    if (typeof device !== 'string' || typeof stateDir !== 'string' || !stateDir) {
      missingSource++;
      continue;
    }
    try {
      signedReceipts.push(await readSignedMicroSeedReceipt({
        stateDir, device_id:device, idempotency_key:task.attempt_key,
      }));
    } catch (error) {
      if (error?.code === 'ENOENT') {
        missingSource++;
        continue;
      }
      throw error;
    }
  }
  const snapshot = correlateSignedDeviceEvidence(state, {
    signedReceipts, trustedDeviceKeys:effectiveKeys, now:instant,
  });
  snapshot.summary.signed_receipt_sources_missing = missingSource;
  snapshot.provenance.ambient_registry_active_trust_checked =
    ambientRegistryRoot !== null && activeDevices.length > 0;
  snapshot.provenance.signed_receipt_source_state = 'owned_local_journal_not_remote_telemetry';
  // Re-read current Ambient authority immediately before disclosure.
  // A revoked device or rotated signer key cannot be allowed mid-read.
  if (ambientRegistryRoot !== null && activeDevices.length) {
    const latestKeys = await loadActiveAmbientReceiptKeys({
      ambientRegistryRoot, deviceIds:activeDevices, now:instant,
    });
    if (JSON.stringify(latestKeys) !== JSON.stringify(effectiveKeys)) {
      throw new Error('visual_ambient_trust_changed_during_read');
    }
  }
  // Validate Passport authorization after all local receipt reads and verification.
  checkGrant(passport, subjectRef, resourceRef, at);
  return annotatePassportScope(snapshot);
}

/**
 * Production-intended internal entry point. Requires an approved, fresh
 * Ambient Device Registry before accepting any signed device evidence.
 * A revoked, expired, stale or changed device identity fails closed.
 */
export async function readPassportScopedGoalFromActiveAmbientRegistry({
  ambientRegistryRoot,
  ...options
} = {}) {
  required(ambientRegistryRoot, 'ambient_registry_root');
  return readPassportScopedGoalFromSignedStore({
    ...options,
    ambientRegistryRoot,
    trustedDeviceKeys:{},
  });
}
