import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createGoalState, admitGoalPlan } from '../organism/goal-runtime.mjs';
import { createGoalStateFile, readGoalState } from '../organism/goal-store.mjs';
import { createNativeSystemiaOutcomeWriter } from './systemia-goal-ack.mjs';

const digest = (value) => 'sha256:' + createHash('sha256').update(value).digest('hex');
const mission = 'mission:fabric-ack-test';
const request = {
  mission_key: mission,
  work_key: 'read-public',
  correlation_id: digest('correlation'),
  lineage_receipt_id: 'a'.repeat(64),
  lineage_transaction_id: 'b'.repeat(64),
  worker_receipt_digest: digest('worker-evidence'),
};

async function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fabric-goal-ack-'));
  const goalStateFile = path.join(root, 'systemia-goal.json');
  const goal = admitGoalPlan({
    state: createGoalState({
      goalKey: 'fabric-ack-test', missionKey: mission,
      objective: 'Durably complete browser read work',
    }),
    plan: [{ work_key: 'read-public', work_type: 'browser_read' }],
  });
  await createGoalStateFile(goalStateFile, goal);
  return { root, goalStateFile, writer: createNativeSystemiaOutcomeWriter({ goalStateFile }),
    close: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test('native Systemia goal ack persists completion, evidence and stable duplicate acknowledgment', async () => {
  const f = await fixture();
  try {
    const result = await f.writer(request);
    assert.equal(result.state, 'recorded');
    assert.equal(result.durable_goal_verified, true);
    assert.match(result.receipt_hash, /^sha256:[a-f0-9]{64}$/);
    const state = await readGoalState(f.goalStateFile);
    assert.equal(state.tasks[0].status, 'complete');
    assert.ok(state.tasks[0].receipt_refs.includes(request.lineage_receipt_id));
    assert.ok(state.tasks[0].evidence_refs.includes('fabric-correlation:' + request.correlation_id));
    assert.ok(state.tasks[0].evidence_refs.includes(request.worker_receipt_digest));
    assert.ok(state.tasks[0].evidence_refs.includes('fabric-lineage-tx:' + request.lineage_transaction_id));
    const replay = createNativeSystemiaOutcomeWriter({ goalStateFile: f.goalStateFile });
    const again = await replay(request);
    assert.equal(again.receipt_hash, result.receipt_hash);
    assert.equal((await readGoalState(f.goalStateFile)).revision, state.revision);
  } finally { f.close(); }
});

test('a completed Systemia task cannot be rebound to another invocation, receipt or worker', async () => {
  const f = await fixture();
  try {
    await f.writer(request);
    for (const patch of [
      { correlation_id: digest('different') },
      { lineage_transaction_id: 'c'.repeat(64) },
      { lineage_receipt_id: 'd'.repeat(64) },
      { worker_receipt_digest: digest('other-worker') },
    ]) {
      await assert.rejects(f.writer({ ...request, ...patch }), /fabric_goal_completion_binding_conflict/);
    }
  } finally { f.close(); }
});

test('failed completion cannot claim acknowledgment when state is unadmitted or not writable', async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      f.writer({ ...request, mission_key: 'mission:other' }),
      /fabric_goal_mission_mismatch/,
    );
    await assert.rejects(
      f.writer({ ...request, work_key: 'never-admitted' }),
      /fabric_goal_work_not_found/,
    );
    assert.equal((await readGoalState(f.goalStateFile)).tasks[0].status, 'pending');
  } finally { f.close(); }
});

test('read-only reconciliation across process restart verifies matching persisted receipt', async () => {
  const f = await fixture();
  try {
    const first = await f.writer(request);
    const second = await createNativeSystemiaOutcomeWriter({ goalStateFile: f.goalStateFile })(request);
    assert.equal(second.receipt_hash, first.receipt_hash);
    assert.equal(second.goal_state_digest, first.goal_state_digest);
  } finally { f.close(); }
});
