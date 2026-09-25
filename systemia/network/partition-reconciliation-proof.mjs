import assert from 'node:assert/strict';
import {
  ReplayGuard,
  sealEnvelope,
  openEnvelope
} from './secure-envelope.mjs';
import {
  createCheckpoint,
  reconcileCheckpoints,
  classifyRecoveredEnvelopes
} from './reconciliation.mjs';

const now = Date.now();
const key = 'proof-key-material';
const wrongKey = 'wrong-proof-key';

// Authenticated delayed-delivery envelope.
const envelope = sealEnvelope({
  key,
  key_id: 'proof-key-v1',
  source: 'hearth-a',
  destination: 'guardian-b',
  kind: 'guardian.continuity',
  message_id: 'message-safe-1',
  created_at: new Date(now).toISOString(),
  expires_at: new Date(now + 60_000).toISOString(),
  payload: {
    mission_id: 'mission-proof',
    action: 'continuity-status'
  }
});

const replayGuard = new ReplayGuard();
const opened = openEnvelope({
  envelope,
  key,
  expected_destination: 'guardian-b',
  now,
  replay_guard: replayGuard
});
assert.equal(opened.payload.mission_id, 'mission-proof');

assert.throws(
  () => openEnvelope({
    envelope,
    key,
    expected_destination: 'guardian-b',
    now,
    replay_guard: replayGuard
  }),
  /replay_detected/
);

assert.throws(
  () => openEnvelope({
    envelope,
    key: wrongKey,
    expected_destination: 'guardian-b',
    now
  }),
  /envelope_authentication_failed/
);

const tampered = {
  ...envelope,
  ciphertext: Buffer.from('tampered').toString('base64')
};
assert.throws(
  () => openEnvelope({
    envelope: tampered,
    key,
    expected_destination: 'guardian-b',
    now
  }),
  /envelope_authentication_failed/
);

const expiredEnvelope = sealEnvelope({
  key,
  source: 'hearth-a',
  destination: 'guardian-b',
  message_id: 'message-expired-1',
  created_at: new Date(now - 120_000).toISOString(),
  expires_at: new Date(now - 1_000).toISOString(),
  payload: { stale: true }
});
assert.throws(
  () => openEnvelope({
    envelope: expiredEnvelope,
    key,
    expected_destination: 'guardian-b',
    now
  }),
  /envelope_expired/
);

// Canonical checkpoint lineage across stale and corrupt replicas.
const cp1 = createCheckpoint({
  mission_id: 'mission-proof',
  generation: 1,
  state: { phase: 'boot' },
  origin_node: 'nexus-a',
  committed_at: '2026-09-25T12:00:00.000Z'
});
const cp2 = createCheckpoint({
  mission_id: 'mission-proof',
  generation: 2,
  parent_hash: cp1.checkpoint_hash,
  state: { phase: 'running', counter: 1 },
  origin_node: 'nexus-a',
  committed_at: '2026-09-25T12:01:00.000Z'
});
const cp3 = createCheckpoint({
  mission_id: 'mission-proof',
  generation: 3,
  parent_hash: cp2.checkpoint_hash,
  state: { phase: 'running', counter: 2 },
  origin_node: 'nexus-b',
  committed_at: '2026-09-25T12:02:00.000Z'
});

const corruptCp3 = {
  ...cp3,
  state: { phase: 'corrupted', counter: 999 }
};

const ready = reconcileCheckpoints([
  {
    node_id: 'hearth-a',
    checkpoint: cp1,
    history: []
  },
  {
    node_id: 'hearth-b',
    checkpoint: corruptCp3,
    history: [cp1, cp2]
  },
  {
    node_id: 'hearth-c',
    checkpoint: cp3,
    history: [cp1, cp2]
  }
]);

assert.equal(ready.status, 'READY');
assert.equal(ready.auto_resume_allowed, true);
assert.equal(ready.canonical.node_id, 'hearth-c');
assert.equal(ready.canonical.checkpoint.generation, 3);
assert.ok(ready.invalid.some((row) =>
  row.node_id === 'hearth-b' &&
  row.reason === 'hash_mismatch'
));
assert.ok(ready.refill_nodes.includes('hearth-a'));
assert.ok(ready.refill_nodes.includes('hearth-b'));

// A real same-generation fork must stop automatic recovery.
const forkA = createCheckpoint({
  mission_id: 'mission-fork',
  generation: 1,
  state: { phase: 'root' },
  origin_node: 'nexus-a',
  committed_at: '2026-09-25T12:00:00.000Z'
});
const fork2a = createCheckpoint({
  mission_id: 'mission-fork',
  generation: 2,
  parent_hash: forkA.checkpoint_hash,
  state: { decision: 'A' },
  origin_node: 'nexus-a',
  committed_at: '2026-09-25T12:01:00.000Z'
});
const fork2b = createCheckpoint({
  mission_id: 'mission-fork',
  generation: 2,
  parent_hash: forkA.checkpoint_hash,
  state: { decision: 'B' },
  origin_node: 'nexus-b',
  committed_at: '2026-09-25T12:01:01.000Z'
});

const conflict = reconcileCheckpoints([
  {
    node_id: 'hearth-left',
    checkpoint: fork2a,
    history: [forkA]
  },
  {
    node_id: 'hearth-right',
    checkpoint: fork2b,
    history: [forkA]
  }
]);

assert.equal(conflict.status, 'HOLD_CONFLICT');
assert.equal(conflict.auto_resume_allowed, false);
assert.equal(conflict.forks.length, 1);

// Recovered delayed work must not replay irreversible actions automatically.
const recoveredPlan = classifyRecoveredEnvelopes({
  now,
  executed_message_ids: ['already-done'],
  envelopes: [
    {
      message_id: 'already-done',
      expires_at: new Date(now + 60_000).toISOString(),
      irreversible: false
    },
    {
      message_id: 'safe-to-resume',
      expires_at: new Date(now + 60_000).toISOString(),
      irreversible: false
    },
    {
      message_id: 'irreversible-after-partition',
      expires_at: new Date(now + 60_000).toISOString(),
      irreversible: true
    },
    {
      message_id: 'expired-after-partition',
      expires_at: new Date(now - 1_000).toISOString(),
      irreversible: false
    },
    {
      message_id: 'safe-to-resume',
      expires_at: new Date(now + 60_000).toISOString(),
      irreversible: false
    }
  ]
});

assert.deepEqual(
  recoveredPlan.auto_resume.map((row) => row.message_id),
  ['safe-to-resume']
);
assert.deepEqual(
  recoveredPlan.hold_for_review.map((row) => row.message_id),
  ['irreversible-after-partition']
);
assert.equal(recoveredPlan.discard.length, 3);

console.log(JSON.stringify({
  schema: 'evercraft.partition-reconciliation-proof.v1',
  status: 'PASS',
  secure_envelope: {
    authenticated: true,
    tamper_rejected: true,
    wrong_key_rejected: true,
    replay_rejected: true,
    expired_rejected: true
  },
  reconciliation: {
    stale_replica_tolerated: true,
    corrupt_replica_rejected: true,
    latest_valid_lineage_selected: true,
    replica_refill_planned: ready.refill_nodes,
    fork_auto_resume_blocked: true
  },
  recovered_work: {
    safe_auto_resume: recoveredPlan.auto_resume.length,
    irreversible_held: recoveredPlan.hold_for_review.length,
    discarded: recoveredPlan.discard.length
  }
}, null, 2));
