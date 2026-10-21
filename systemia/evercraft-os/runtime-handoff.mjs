import { randomUUID, createPublicKey, verify } from 'node:crypto';
import { evercraftOsSha256 } from './package-trust.mjs';
import { observeProcessInstance } from './process-instance.mjs';

const PLAN_SCHEMA = 'evercraft.os.runtime-handoff-plan.v1';
const CLAIM_SCHEMA = 'evercraft.os.runtime-process-observation.v1';
const RESULT_SCHEMA = 'evercraft.os.runtime-handoff-decision.v1';
const MAX_PLAN_AGE_MS = 5 * 60_000;
const MAX_CLAIM_AGE_MS = 30_000;

function field(value, label, expression, max = 200) {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.length > max || !expression.test(value)) {
    throw new Error(label + '_invalid');
  }
  return value;
}
function digest(value, label) {
  return field(value, label, /^sha256:[a-f0-9]{64}$/, 71);
}
function stamp(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new Error(label + '_invalid');
  }
  return Date.parse(value);
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object' && !Buffer.isBuffer(value)) {
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  }
  return value;
}
function held(reason, extra = {}) {
  return { schema: RESULT_SCHEMA, state: 'held', reason, mutation_performed: false,
    permit_minted: false, permit_consumed: false, execution_authority_granted: false,
    process_started_claimed: false, runtime_health_claimed: false, ...extra };
}
function cleanOutcome(outcome) {
  if (!outcome || outcome.schema !== 'evercraft.home.os-package-runtime-state.v1' ||
      outcome.state !== 'aligned' || outcome.desired_active_aligned !== true ||
      outcome.activation_lineage_aligned !== true ||
      outcome.transition_integrity?.state !== 'verified' ||
      outcome.transition_writer?.state !== 'free' ||
      !['clean', undefined].includes(outcome.transition_recovery?.state) ||
      outcome.activation?.integrity !== 'verified' || outcome.runtime_health_claimed !== false ||
      outcome.execution_authority_granted !== false) {
    return false;
  }
  return true;
}
function observedSnapshot(home, store, productKey, nodeId) {
  const state = home.status({ productKey, nodeId });
  if (!cleanOutcome(state)) throw new Error('home_runtime_not_aligned:' + (state?.state || 'invalid'));
  const active = digest(state.active_package_fingerprint, 'active_package_fingerprint');
  const staged = store.inspect(productKey, active);
  if (staged?.integrity !== 'verified' || staged.materialized !== true) throw new Error('staged_package_not_verified');
  const epoch = store.trustProvider?.current();
  if (epoch?.state !== 'verified' || epoch.epoch_hash !== staged.publisher_trust_epoch_hash) {
    throw new Error('publisher_trust_epoch_changed_during_preflight');
  }
  const snapshot = {
    package_fingerprint: active,
    activation_hash: digest(state.activation.activation_hash, 'activation_hash'),
    transition_receipt_hash: digest(state.activation.transition_receipt_hash, 'transition_receipt_hash'),
    transition_head_receipt_hash: digest(state.transition_integrity.head_receipt_hash, 'transition_head_receipt_hash'),
    publisher_trust_epoch_hash: digest(epoch.epoch_hash, 'publisher_trust_epoch_hash'),
    staged_verification_receipt_hash: digest(staged.verification_receipt_hash, 'staged_verification_receipt_hash'),
  };
  if (snapshot.transition_receipt_hash !== state.expected_transition_receipt_hash ||
      active !== state.desired_package_fingerprint) throw new Error('runtime_desired_activation_mismatch');
  return snapshot;
}

/** No process creation, no permits, no mutable state. External receipts are REFERENCES, not verified authority. */
export class EvercraftOsRuntimeHandoff {
  constructor({ home, packageStore, pinnedNodePublicKeys = {} } = {}) {
    if (!home || typeof home.status !== 'function') throw new Error('runtime_handoff_home_required');
    if (!packageStore || typeof packageStore.inspect !== 'function') throw new Error('runtime_handoff_package_store_required');
    this.home = home;
    this.packageStore = packageStore;
    // These public keys MUST come from device identity enrollment, not package metadata or caller-supplied plans.
    this.nodeKeys = new Map(Object.entries(pinnedNodePublicKeys).map(([nodeId, pem]) => {
      const key = createPublicKey(pem);
      if (key.asymmetricKeyType !== 'ed25519') throw new Error('runtime_node_key_must_be_ed25519');
      return [field(nodeId, 'node_id', /^[a-zA-Z0-9._:-]{1,160}$/, 160), key];
    }));
  }

  prepare({ productKey, nodeId, subjectRef, capabilityRef, capsuleContractHash,
            systemiaMissionReceiptHash, executionPolicyHash, deviceAttestationHash, now = new Date() } = {}) {
    try {
      const product = field(productKey, 'product_key', /^[a-z0-9][a-z0-9._-]{0,79}$/, 80);
      const node = field(nodeId, 'node_id', /^[a-zA-Z0-9._:-]{1,160}$/, 160);
      const subject = field(subjectRef, 'subject_ref', /^[a-zA-Z0-9._:@/-]{1,200}$/);
      const capability = field(capabilityRef, 'capability_ref', /^[a-zA-Z0-9._:@/-]{1,200}$/);
      const capsule = digest(capsuleContractHash, 'capsule_contract_hash');
      const systemia = digest(systemiaMissionReceiptHash, 'systemia_mission_receipt_hash');
      const execution = digest(executionPolicyHash, 'execution_policy_hash');
      const device = digest(deviceAttestationHash, 'device_attestation_hash');
      const at = new Date(now);
      if (!Number.isFinite(at.getTime())) throw new Error('runtime_handoff_time_invalid');
      const snapshot = observedSnapshot(this.home, this.packageStore, product, node);
      const body = {
        schema: PLAN_SCHEMA, operation: 'prepare_runtime_handoff',
        product_key: product, node_id: node, subject_ref: subject, capability_ref: capability,
        capsule_contract_hash: capsule, systemia_mission_receipt_hash: systemia,
        execution_policy_hash: execution, device_attestation_hash: device,
        ...snapshot, nonce: randomUUID(), prepared_at: at.toISOString(),
        expires_at: new Date(at.getTime() + MAX_PLAN_AGE_MS).toISOString(),
        systemia_authority_verified: false, execution_gate_authority_verified: false,
        execution_authority_granted: false, process_started: false, runtime_health_claimed: false,
        required_gate: 'systemia+passport+execution-gate+capsule+nodeseed',
      };
      return {
        schema: RESULT_SCHEMA, state: 'prepared_for_independent_gate_review',
        plan: { ...body, request_fingerprint: evercraftOsSha256(body) },
        references_verified_as_authority: false, mutation_performed: false,
        permit_minted: false, permit_consumed: false,
        execution_authority_granted: false, process_started_claimed: false, runtime_health_claimed: false,
      };
    } catch (error) { return held(String(error?.message || error)); }
  }

  revalidate({ plan, subjectRef, now = new Date() } = {}) {
    try {
      if (!plan || plan.schema !== PLAN_SCHEMA) throw new Error('runtime_plan_schema_invalid');
      const { request_fingerprint: fingerprint, ...body } = plan;
      if (digest(fingerprint, 'request_fingerprint') !== evercraftOsSha256(body)) throw new Error('runtime_plan_hash_mismatch');
      if (plan.operation !== 'prepare_runtime_handoff' || plan.required_gate !== 'systemia+passport+execution-gate+capsule+nodeseed' ||
          plan.systemia_authority_verified !== false || plan.execution_gate_authority_verified !== false ||
          plan.execution_authority_granted !== false || plan.process_started !== false || plan.runtime_health_claimed !== false) {
        throw new Error('runtime_plan_authority_contract_invalid');
      }
      if (field(subjectRef, 'subject_ref', /^[a-zA-Z0-9._:@/-]{1,200}$/) !== plan.subject_ref) throw new Error('runtime_plan_subject_mismatch');
      for (const key of ['package_fingerprint','activation_hash','transition_receipt_hash','transition_head_receipt_hash','publisher_trust_epoch_hash','staged_verification_receipt_hash','capsule_contract_hash','systemia_mission_receipt_hash','execution_policy_hash','device_attestation_hash']) {
        digest(plan[key], key);
      }
      field(plan.product_key, 'product_key', /^[a-z0-9][a-z0-9._-]{0,79}$/, 80);
      field(plan.node_id, 'node_id', /^[a-zA-Z0-9._:-]{1,160}$/, 160);
      field(plan.capability_ref, 'capability_ref', /^[a-zA-Z0-9._:@/-]{1,200}$/);
      field(plan.nonce, 'nonce', /^[a-f0-9-]{36}$/, 36);
      const currentTime = new Date(now).getTime();
      const issued = stamp(plan.prepared_at, 'prepared_at');
      const expires = stamp(plan.expires_at, 'expires_at');
      if (!Number.isFinite(currentTime) || issued > currentTime || expires <= currentTime ||
          expires - issued !== MAX_PLAN_AGE_MS) throw new Error('runtime_plan_expired_or_clock_invalid');
      const snapshot = observedSnapshot(this.home, this.packageStore, plan.product_key, plan.node_id);
      for (const [k, value] of Object.entries(snapshot)) {
        if (plan[k] !== value) throw new Error('runtime_plan_stale:' + k);
      }
      return { schema: RESULT_SCHEMA, state: 'still_prepared_for_independent_gate_review',
        request_fingerprint: fingerprint, mutation_performed: false, permit_minted: false,
        permit_consumed: false, execution_authority_granted: false, process_started_claimed: false,
        runtime_health_claimed: false };
    } catch (error) { return held(String(error?.message || error)); }
  }

  /** Authenticated *claim* + local PID identity observation, NOT authorization or application health. */
  inspectSignedProcessClaim({ plan, subjectRef, observation, now = new Date() } = {}) {
    const gate = this.revalidate({ plan, subjectRef, now });
    if (gate.state !== 'still_prepared_for_independent_gate_review') return gate;
    try {
      const key = this.nodeKeys.get(plan.node_id);
      if (!key) throw new Error('node_identity_key_not_pinned');
      if (!observation || observation.schema !== 'evercraft.os.runtime-process-signed-observation.v1' ||
          observation.signature_algorithm !== 'ed25519' ||
          !observation.body || observation.body.schema !== CLAIM_SCHEMA) throw new Error('runtime_observation_schema_invalid');
      if (typeof observation.signature_base64 !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(observation.signature_base64)) throw new Error('runtime_observation_signature_invalid');
      const { body } = observation;
      if (body.node_id !== plan.node_id || body.product_key !== plan.product_key ||
          body.package_fingerprint !== plan.package_fingerprint ||
          body.activation_hash !== plan.activation_hash ||
          body.transition_receipt_hash !== plan.transition_receipt_hash ||
          body.request_fingerprint !== plan.request_fingerprint || body.nonce !== plan.nonce) {
        throw new Error('runtime_observation_binding_mismatch');
      }
      const instant = new Date(now).getTime();
      const observedAt = stamp(body.observed_at, 'observed_at');
      const expires = stamp(body.expires_at, 'expires_at');
      if (observedAt > instant || expires <= instant || expires - observedAt > MAX_CLAIM_AGE_MS) {
        throw new Error('runtime_observation_not_fresh');
      }
      const signature = Buffer.from(observation.signature_base64, 'base64');
      if (signature.length !== 64 || !verify(null, Buffer.from(JSON.stringify(canonical(body))), key, signature)) {
        throw new Error('runtime_observation_signature_not_verified');
      }
      const proc = observeProcessInstance(body.process_instance);
      return {
        schema: RESULT_SCHEMA,
        state: proc.state === 'same_process_alive' ? 'authenticated_process_identity_observed' : 'held',
        reason: proc.state === 'same_process_alive' ? null : 'process_instance_' + proc.state,
        node_identity_claim_signature_verified: true,
        local_process_instance_verified: proc.state === 'same_process_alive',
        process_observation: proc,
        mutation_performed: false, permit_minted: false, permit_consumed: false,
        process_started_claimed: false, runtime_health_claimed: false, execution_authority_granted: false,
      };
    } catch (error) { return held(String(error?.message || error)); }
  }
}
