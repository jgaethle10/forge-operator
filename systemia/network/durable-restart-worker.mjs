#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { DurableReplayLedger, DurableCheckpointJournal } from './durable-state.mjs';
import { sealEnvelope, openEnvelope } from './secure-envelope.mjs';
import { createCheckpoint } from './reconciliation.mjs';

const mode = process.argv[2];
const root = process.argv[3];
if (!mode || !root) throw new Error('usage: durable-restart-worker <mode> <root>');

const key = 'restart-proof-key';
const envelopeFile = path.join(root, 'envelope.json');

if (mode === 'seed') {
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });

  const envelope = sealEnvelope({
    key,
    key_id: 'restart-proof-v1',
    source: 'saban-seed',
    destination: 'guardian-restart-proof',
    message_id: 'restart-message-001',
    kind: 'guardian.continuity',
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    irreversible: true,
    payload: {
      mission_id: 'restart-proof',
      action: 'already-executed-before-restart'
    }
  });
  fs.writeFileSync(envelopeFile, JSON.stringify(envelope), { mode: 0o600 });

  const replay = new DurableReplayLedger({ root: path.join(root, 'replay') });
  const opened = openEnvelope({
    envelope,
    key,
    expected_destination: 'guardian-restart-proof',
    replay_guard: replay
  });
  if (opened.payload.mission_id !== 'restart-proof') throw new Error('seed_open_failed');

  const checkpoints = new DurableCheckpointJournal({ root: path.join(root, 'checkpoints') });
  const cp1 = createCheckpoint({
    mission_id: 'restart-proof',
    generation: 1,
    origin_node: 'nexus-before-restart',
    state: { phase: 'before-restart', completed: ['restart-message-001'] }
  });
  checkpoints.commit(cp1);

  process.stdout.write(JSON.stringify({
    event: 'seed-complete',
    replay_head: replay.summary().head_hash,
    checkpoint_hash: cp1.checkpoint_hash
  }) + '\n');
  process.exit(0);
}

if (mode === 'verify') {
  const envelope = JSON.parse(fs.readFileSync(envelopeFile, 'utf8'));
  const replay = new DurableReplayLedger({ root: path.join(root, 'replay') });
  const checkpoints = new DurableCheckpointJournal({ root: path.join(root, 'checkpoints') });

  let replayBlocked = false;
  try {
    openEnvelope({
      envelope,
      key,
      expected_destination: 'guardian-restart-proof',
      replay_guard: replay
    });
  } catch (error) {
    if (String(error?.message || error).includes('replay_detected')) replayBlocked = true;
    else throw error;
  }

  const latest = checkpoints.latest('restart-proof');
  if (!replayBlocked) throw new Error('replay_not_blocked_after_restart');
  if (!latest || latest.generation !== 1) throw new Error('checkpoint_not_restored_after_restart');

  process.stdout.write(JSON.stringify({
    event: 'verify-complete',
    replay_blocked: true,
    checkpoint_generation: latest.generation,
    replay_head: replay.summary().head_hash
  }) + '\n');
  process.exit(0);
}

if (mode === 'torn-tail') {
  const replayRoot = path.join(root, 'replay');
  const replay = new DurableReplayLedger({ root: replayRoot });
  replay.markExecuted({
    message_id: 'before-kill-002',
    mission_id: 'restart-proof',
    kind: 'continuity.message'
  });
  const file = path.join(replayRoot, 'replay-ledger.jsonl');
  fs.appendFileSync(file, '{"schema":"evercraft.replay-ledger.record.v1","seq":3');
  process.stdout.write(JSON.stringify({ event: 'partial-tail-written' }) + '\n');
  setInterval(() => {}, 1000);
}

if (mode === 'verify-tail') {
  const replay = new DurableReplayLedger({ root: path.join(root, 'replay') });
  if (!replay.hasExecuted('restart-message-001')) throw new Error('original_replay_memory_missing');
  if (!replay.hasExecuted('before-kill-002')) throw new Error('prekill_replay_memory_missing');
  if (!replay.summary().tail_recovered) throw new Error('torn_tail_not_detected');
  process.stdout.write(JSON.stringify({
    event: 'tail-verify-complete',
    executed_count: replay.summary().executed_count,
    tail_recovered: true
  }) + '\n');
  process.exit(0);
}

throw new Error(`unknown mode: ${mode}`);
