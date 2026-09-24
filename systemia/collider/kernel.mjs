import { clean, uniqueStrings } from '../organism/kernel.mjs';

const DEFAULT_HEARTBEAT_SECONDS = 300;
const DEFAULT_GRACE_SECONDS = 90;

function iso(now) {
  return (now instanceof Date ? now : new Date(now || Date.now())).toISOString();
}

function ms(now) {
  return (now instanceof Date ? now : new Date(now || Date.now())).getTime();
}

function requireState(state) {
  if (!state || state.schema !== 'evercraft.kaidance.state.v1') {
    throw new Error('valid KAIDANCE state is required');
  }
}

function requireLease(lease, now) {
  if (!lease || lease.schema !== 'evercraft.machine-wake-lease.v1') {
    return { ok: false, reason: 'wake_lease_missing' };
  }
  const expires = Date.parse(clean(lease.expires_at));
  if (!Number.isFinite(expires) || expires < ms(now)) {
    return { ok: false, reason: 'wake_lease_expired' };
  }
  return { ok: true };
}

export function createKaidanceState({
  colliderKey = 'systemia-collider',
  heartbeatTargetSeconds = DEFAULT_HEARTBEAT_SECONDS,
  graceSeconds = DEFAULT_GRACE_SECONDS,
  now = new Date(),
} = {}) {
  const at = iso(now);
  return {
    schema: 'evercraft.kaidance.state.v1',
    collider_key: clean(colliderKey) || 'systemia-collider',
    heartbeat_target_seconds: Math.max(60, Number(heartbeatTargetSeconds || DEFAULT_HEARTBEAT_SECONDS)),
    grace_seconds: Math.max(0, Number(graceSeconds || DEFAULT_GRACE_SECONDS)),
    state_version: 1,
    cycle_number: 0,
    last_cycle_started_at: null,
    last_completed_cycle_at: null,
    last_cycle_key: null,
    last_coverage_receipt_key: null,
    last_deployment_receipt: null,
    last_counts: {
      scanned: 0,
      changed: 0,
      admitted: 0,
      held: 0,
    },
    created_at: at,
    updated_at: at,
  };
}

export function createMachineWakeLease({
  leaseKey,
  acquiredAt = new Date(),
  ttlSeconds = 120,
  authorityRef = '',
}) {
  const acquired = acquiredAt instanceof Date ? acquiredAt : new Date(acquiredAt);
  if (!clean(leaseKey)) throw new Error('leaseKey is required');
  if (!Number.isFinite(acquired.getTime())) throw new Error('valid acquiredAt is required');
  const ttl = Math.max(30, Number(ttlSeconds || 120));
  return {
    schema: 'evercraft.machine-wake-lease.v1',
    lease_key: clean(leaseKey),
    acquired_at: acquired.toISOString(),
    expires_at: new Date(acquired.getTime() + ttl * 1000).toISOString(),
    authority_ref: clean(authorityRef),
  };
}

export function cycleDue(state, now = new Date()) {
  requireState(state);
  if (!state.last_completed_cycle_at) return true;
  const last = Date.parse(state.last_completed_cycle_at);
  if (!Number.isFinite(last)) return true;
  return ms(now) - last >= state.heartbeat_target_seconds * 1000;
}

export function admitColliderCycle({
  state,
  wakeLease,
  candidateCount = 0,
  now = new Date(),
}) {
  requireState(state);
  const lease = requireLease(wakeLease, now);
  if (!lease.ok) {
    return { ok: false, hold: lease.reason, state };
  }
  if (!cycleDue(state, now)) {
    return { ok: false, hold: 'heartbeat_not_due', state };
  }

  const startedAt = iso(now);
  const cycleNumber = Number(state.cycle_number || 0) + 1;
  const cycleKey = `${state.collider_key}:cycle:${cycleNumber}`;
  const admission = {
    schema: 'evercraft.machine-cycle-admission.v1',
    admission_key: `admission:${cycleKey}`,
    collider_key: state.collider_key,
    cycle_key: cycleKey,
    wake_lease_key: wakeLease.lease_key,
    admitted_at: startedAt,
    candidate_count: Math.max(0, Number(candidateCount || 0)),
    authority_ref: clean(wakeLease.authority_ref),
  };

  return {
    ok: true,
    admission,
    state: {
      ...state,
      state_version: state.state_version + 1,
      cycle_number: cycleNumber,
      last_cycle_started_at: startedAt,
      last_cycle_key: cycleKey,
      updated_at: startedAt,
    },
  };
}

export function completeColliderCycle({
  state,
  admission,
  scanned = 0,
  changed = 0,
  admitted = 0,
  held = 0,
  evidenceRefs = [],
  deploymentReceipt = '',
  now = new Date(),
}) {
  requireState(state);
  if (!admission || admission.schema !== 'evercraft.machine-cycle-admission.v1') {
    throw new Error('valid cycle admission is required');
  }
  if (clean(admission.cycle_key) !== clean(state.last_cycle_key)) {
    throw new Error('cycle admission does not match active KAIDANCE cycle');
  }

  const completedAt = iso(now);
  const counts = {
    scanned: Math.max(0, Number(scanned || 0)),
    changed: Math.max(0, Number(changed || 0)),
    admitted: Math.max(0, Number(admitted || 0)),
    held: Math.max(0, Number(held || 0)),
  };
  if (counts.changed > counts.scanned) throw new Error('changed cannot exceed scanned');
  if (counts.admitted + counts.held > counts.changed) {
    throw new Error('admitted + held cannot exceed changed');
  }

  const refs = uniqueStrings(evidenceRefs || [], 200);
  const cycle = {
    schema: 'evercraft.collider-cycle.v1',
    cycle_key: admission.cycle_key,
    collider_key: state.collider_key,
    admission_key: admission.admission_key,
    wake_lease_key: admission.wake_lease_key,
    started_at: admission.admitted_at,
    completed_at: completedAt,
    counts,
    evidence_refs: refs,
  };

  const receiptKey = `kaidance:${admission.cycle_key}:coverage`;
  const coverageReceipt = {
    schema: 'evercraft.kaidance-coverage-receipt.v1',
    receipt_key: receiptKey,
    collider_key: state.collider_key,
    cycle_key: admission.cycle_key,
    admission_key: admission.admission_key,
    wake_lease_key: admission.wake_lease_key,
    completed_at: completedAt,
    heartbeat_target_seconds: state.heartbeat_target_seconds,
    result: 'pass',
    counts,
    evidence_refs: refs,
  };

  return {
    ok: true,
    cycle,
    coverageReceipt,
    state: {
      ...state,
      state_version: state.state_version + 1,
      last_completed_cycle_at: completedAt,
      last_coverage_receipt_key: receiptKey,
      last_deployment_receipt: clean(deploymentReceipt) || state.last_deployment_receipt || null,
      last_counts: counts,
      updated_at: completedAt,
    },
  };
}

export function kaidanceHealth(state, now = new Date()) {
  requireState(state);
  const currentMs = ms(now);
  const lastMs = state.last_completed_cycle_at ? Date.parse(state.last_completed_cycle_at) : NaN;
  const cycleAgeSeconds = Number.isFinite(lastMs)
    ? Math.max(0, Math.floor((currentMs - lastMs) / 1000))
    : null;
  const allowed = state.heartbeat_target_seconds + state.grace_seconds;
  const coverageReceiptValid = Boolean(state.last_coverage_receipt_key && state.last_completed_cycle_at);
  const health = cycleAgeSeconds === null
    ? 'starting'
    : cycleAgeSeconds <= allowed && coverageReceiptValid
      ? 'healthy'
      : 'degraded';

  return {
    schema: 'evercraft.kaidance.health.v1',
    collider_key: state.collider_key,
    state: health,
    last_completed_cycle: state.last_completed_cycle_at,
    cycle_age_seconds: cycleAgeSeconds,
    heartbeat_target_seconds: state.heartbeat_target_seconds,
    coverage_receipt_valid: coverageReceiptValid,
    admitted_count: Number(state.last_counts?.admitted || 0),
    held_count: Number(state.last_counts?.held || 0),
    deployment_receipt: state.last_deployment_receipt,
    observed_at: iso(now),
  };
}
