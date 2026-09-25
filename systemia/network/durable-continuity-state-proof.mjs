import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DurableReplayLedger, DurableCheckpointJournal } from './durable-state.mjs';
import { createCheckpoint, reconcileCheckpoints } from './reconciliation.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-durable-proof-'));

try {
  const replayRoot = path.join(root, 'replay');
  let replay = new DurableReplayLedger({ root: replayRoot });
  replay.markExecuted({
    message_id: 'irreversible-001',
    mission_id: 'mission-restart',
    kind: 'payment-or-other-consequential-action',
    irreversible: true,
    execution_receipt_hash: 'receipt-proof-001'
  });
  replay.markExecuted({
    message_id: 'ordinary-002',
    mission_id: 'mission-restart',
    kind: 'continuity.message',
    irreversible: false
  });

  assert.equal(replay.hasExecuted('irreversible-001'), true);
  const headBeforeRestart = replay.summary().head_hash;

  replay = null;
  const replayAfterRestart = new DurableReplayLedger({ root: replayRoot });
  assert.equal(replayAfterRestart.hasExecuted('irreversible-001'), true);
  assert.equal(replayAfterRestart.summary().head_hash, headBeforeRestart);
  assert.throws(
    () => replayAfterRestart.markExecuted({ message_id: 'irreversible-001' }),
    /replay_detected/
  );

  const replayFile = path.join(replayRoot, 'replay-ledger.jsonl');
  fs.appendFileSync(replayFile, '{"schema":"evercraft.replay-ledger.record.v1","seq":3');
  const replayRecovered = new DurableReplayLedger({ root: replayRoot });
  assert.equal(replayRecovered.hasExecuted('irreversible-001'), true);
  assert.equal(replayRecovered.summary().tail_recovered, true);
  assert.equal(replayRecovered.summary().executed_count, 2);

  const raw = fs.readFileSync(replayFile, 'utf8');
  const clean = raw.slice(0, raw.lastIndexOf('\n') + 1);
  fs.writeFileSync(replayFile, clean);

  fs.appendFileSync(replayFile, JSON.stringify({
    schema: 'evercraft.replay-ledger.record.v1',
    seq: 3,
    type: 'message.executed',
    at: new Date().toISOString(),
    previous_hash: replayRecovered.summary().head_hash,
    message_id: 'forged-003',
    mission_id: 'mission-restart',
    irreversible: true,
    record_hash: 'not-a-valid-hash'
  }) + '\n');
  assert.throws(
    () => new DurableReplayLedger({ root: replayRoot }),
    /durable_journal_hash_mismatch/
  );

  const checkpointRoot = path.join(root, 'checkpoints');
  let checkpoints = new DurableCheckpointJournal({ root: checkpointRoot });
  const cp1 = createCheckpoint({
    mission_id: 'mission-restart',
    generation: 1,
    state: { phase: 'boot' },
    origin_node: 'nexus-a'
  });
  checkpoints.commit(cp1);

  const cp2 = createCheckpoint({
    mission_id: 'mission-restart',
    generation: 2,
    parent_hash: cp1.checkpoint_hash,
    state: { phase: 'running', work: 42 },
    origin_node: 'nexus-b'
  });
  checkpoints.commit(cp2);
  const checkpointHead = checkpoints.summary().head_hash;

  checkpoints = null;
  const checkpointsAfterRestart = new DurableCheckpointJournal({ root: checkpointRoot });
  assert.equal(checkpointsAfterRestart.latest('mission-restart').checkpoint_hash, cp2.checkpoint_hash);
  assert.equal(checkpointsAfterRestart.summary().head_hash, checkpointHead);

  const reconciliation = reconcileCheckpoints([
    checkpointsAfterRestart.replica('mission-restart', 'hearth-after-restart')
  ]);
  assert.equal(reconciliation.status, 'READY');
  assert.equal(reconciliation.auto_resume_allowed, true);
  assert.equal(reconciliation.canonical.checkpoint.generation, 2);

  console.log(JSON.stringify({
    schema: 'evercraft.durable-continuity-state-proof.v1',
    status: 'PASS',
    replay_memory: {
      survives_process_restart: true,
      irreversible_duplicate_blocked_after_restart: true,
      torn_tail_recovers_committed_prefix: true,
      committed_tamper_fails_closed: true
    },
    checkpoint_memory: {
      lineage_survives_process_restart: true,
      latest_generation: 2,
      reconciler_accepts_restarted_state: true
    },
    storage_scope: 'local durable filesystem proof',
    field_proof_required: [
      'real sudden power removal during sync/write',
      'filesystem corruption and bad-sector recovery',
      'removable storage durability',
      'multi-day restart cycles on physical Nexus/Hearth hardware'
    ]
  }, null, 2));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
