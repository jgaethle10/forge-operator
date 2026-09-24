import assert from 'node:assert/strict';
import {
  admitGoalPlan,
  authorizeGoalWork,
  createGoalCompletionReceipt,
  createGoalState,
  goalSnapshot,
  recordGoalOutcome,
  startGoalWork,
} from './goal-runtime.mjs';

const t0 = new Date('2026-09-24T17:00:00Z');
let state = createGoalState({
  goalKey: 'goal-runtime-proof',
  missionKey: 'systemia-outcome-engine',
  objective: 'Carry a multi-step goal across pauses without losing authority boundaries.',
  successCondition: 'Every task finishes with evidence and gated work waits for authorization.',
  contextRefs: ['context:proof'],
  now: t0,
});

state = admitGoalPlan({ state, plan: [
  { work_key: 'research', work_type: 'research' },
  { work_key: 'build', work_type: 'build', dependency_keys: ['research'] },
  { work_key: 'commit-money', work_type: 'commercial', dependency_keys: ['build'], human_gate_required: true },
  { work_key: 'verify', work_type: 'verify', dependency_keys: ['commit-money'] },
], now: t0 });
assert.deepEqual(state.next_work_keys, ['research']);

state = startGoalWork({ state, workKey: 'research', now: new Date('2026-09-24T17:01:00Z') });
assert.equal(state.status, 'executing');
assert.throws(() => recordGoalOutcome({ state, workKey: 'research', result: 'complete' }), /requires an execution receipt/);
state = recordGoalOutcome({ state, workKey: 'research', result: 'complete', receiptRef: 'exec:research', now: new Date('2026-09-24T17:02:00Z') });
assert.deepEqual(state.next_work_keys, ['build']);

state = startGoalWork({ state, workKey: 'build', now: new Date('2026-09-24T17:03:00Z') });
state = recordGoalOutcome({ state, workKey: 'build', result: 'complete', evidenceRefs: ['artifact:build'], now: new Date('2026-09-24T17:04:00Z') });
assert.equal(state.status, 'waiting');
assert.deepEqual(state.next_work_keys, []);
assert.ok(state.blockers.some((entry) => entry.includes('commit-money')));

const serialized = JSON.stringify(state);
state = JSON.parse(serialized);
state = authorizeGoalWork({ state, workKey: 'commit-money', authorizationRef: 'human:approval:001', now: new Date('2026-09-24T17:05:00Z') });
assert.deepEqual(state.next_work_keys, ['commit-money']);

state = startGoalWork({ state, workKey: 'commit-money', now: new Date('2026-09-24T17:06:00Z') });
state = recordGoalOutcome({ state, workKey: 'commit-money', result: 'complete', receiptRef: 'exec:commercial', now: new Date('2026-09-24T17:07:00Z') });
assert.deepEqual(state.next_work_keys, ['verify']);

state = startGoalWork({ state, workKey: 'verify', now: new Date('2026-09-24T17:08:00Z') });
state = recordGoalOutcome({ state, workKey: 'verify', result: 'blocked', blocker: 'synthetic verification failure', now: new Date('2026-09-24T17:09:00Z') });
assert.equal(state.status, 'blocked');
state = recordGoalOutcome({ state, workKey: 'verify', result: 'retry', now: new Date('2026-09-24T17:10:00Z') });
assert.deepEqual(state.next_work_keys, ['verify']);
state = startGoalWork({ state, workKey: 'verify', now: new Date('2026-09-24T17:11:00Z') });
state = recordGoalOutcome({ state, workKey: 'verify', result: 'complete', receiptRef: 'exec:verify', evidenceRefs: ['evidence:verified'], now: new Date('2026-09-24T17:12:00Z') });
assert.equal(state.status, 'complete');

const snapshot = goalSnapshot(state);
assert.equal(snapshot.status, 'complete');
assert.equal(snapshot.counts.complete, 4);
const receipt = createGoalCompletionReceipt({ state, successEvidenceRefs: ['acceptance:goal'], now: new Date('2026-09-24T17:13:00Z') });
assert.equal(receipt.task_count, 4);
assert.ok(receipt.task_receipts.find((task) => task.work_key === 'commit-money').authorization_refs.includes('human:approval:001'));

assert.throws(() => admitGoalPlan({
  state: createGoalState({ goalKey: 'cycle', objective: 'reject cyclic plans' }),
  planS¢Ê
    { work_key: 'a', dependency_keys: ['b'] },
    { work_key: 'b', dependency_keys: ['a'] },
  ],
}), /dependency cycle/);

console.log(JSON.stringify {
  ok: true,
  schema: 'evercraft.goal.runtime-proof.v1',
  goal_key: state.goal_key,
  final_status: state.status,
  revision: state.revision,
  completion_receipt: receipt.receipt_key,
  evidence_count: receipt.evidence_refs.length,
  human_gate_preserved: true,
  serialize_resume_preserved: true,
  blocked_retry_preserved: true,
}, null, 2));
