import assert from 'node:assert/strict';
import {
  admitColliderCycle,
  completeColliderCycle,
  createKaidanceState,
  createMachineWakeLease,
  cycleDue,
  kaidanceHealth,
} from './kernel.mjs';

let state = createKaidanceState({
  colliderKey: 'systemia-collider',
  heartbeatTargetSeconds: 300,
  graceSeconds: 90,
  now: new Date('2026-09-24T16:00:00Z'),
});

assert.equal(kaidanceHealth(state, new Date('2026-09-24T16:00:00Z')).state, 'starting');
assert.equal(cycleDue(state, new Date('2026-09-24T16:00:00Z')), true);

const lease = createMachineWakeLease({
  leaseKey: 'wake:systemia:001',
  acquiredAt: new Date('2026-09-24T16:05:00Z'),
  ttlSeconds: 120,
  authorityRef: 'authority:internal-cycle',
});

const admission = admitColliderCycle({
  state,
  wakeLease: lease,
  candidateCount: 147,
  now: new Date('2026-09-24T16:05:00Z'),
});
assert.equal(admission.ok, true);
assert.equal(admission.admission.schema, 'evercraft.machine-cycle-admission.v1');
state = admission.state;

const complete = completeColliderCycle({
  state,
  admission: admission.admission,
  scanned: 147,
  changed: 11,
  admitted: 4,
  held: 7,
  evidenceRefs: ['evidence:portfolio-scan:001'],
  deploymentReceipt: 'deploy:systemia-core:proof',
  now: new Date('2026-09-24T16:05:10Z'),
});
assert.equal(complete.ok, true);
assert.equal(complete.cycle.schema, 'evercraft.collider-cycle.v1');
assert.equal(complete.coverageReceipt.schema, 'evercraft.kaidance-coverage-receipt.v1');
assert.equal(complete.coverageReceipt.result, 'pass');
state = complete.state;

const healthy = kaidanceHealth(state, new Date('2026-09-24T16:07:00Z'));
assert.equal(healthy.state, 'healthy');
assert.equal(healthy.coverage_receipt_valid, true);
assert.equal(healthy.admitted_count, 4);
assert.equal(healthy.held_count, 7);

const earlyLease = createMachineWakeLease({
  leaseKey: 'wake:systemia:002',
  acquiredAt: new Date('2026-09-24T16:08:00Z'),
});
const early = admitColliderCycle({
  state,
  wakeLease: earlyLease,
  candidateCount: 12,
  now: new Date('2026-09-24T16:08:00Z'),
});
assert.equal(early.ok, false);
assert.equal(early.hold, 'heartbeat_not_due');

const degraded = kaidanceHealth(state, new Date('2026-09-24T16:12:00Z'));
assert.equal(degraded.state, 'degraded');

console.log(JSON.stringify({
  ok: true,
  schema: 'evercraft.kaidance.proof.v1',
  proof_chain: [
    'MachineWakeLease',
    'MachineCycleAdmission',
    'ColliderCycle',
    'KaidanceCoverageReceipt',
  ],
  heartbeat_target_seconds: state.heartbeat_target_seconds,
  healthy_snapshot: healthy,
  degraded_snapshot: degraded,
  coverage_receipt: complete.coverageReceipt.receipt_key,
}, null, 2));
