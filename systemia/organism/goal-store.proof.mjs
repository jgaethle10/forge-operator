import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  admitGoalPlan,
  createGoalState,
  recordGoalOutcome,
  startGoalWork,
} from './goal-runtime.mjs';
import {
  createGoalStateFile,
  mutateGoalState,
  readGoalState,
  writeGoalState,
} from './goal-store.mjs';

const dir = await mkdtemp(path.join(os.tmpdir(), 'evercraft-goal-store-'));
const file = path.join(dir, 'goal.json');

try {
  let state = createGoalState({
    goalKey: 'persistent-store-proof',
    objective: 'Persist a Systemia goal across independent process lifetimes.',
    now: new Date('2026-09-24T19:30:00Z'),
  });

  const initial = await createGoalStateFile(file, state, { now: new Date('2026-09-24T19:30:01Z') });
  assert.equal(initial.revision, 1);

  let loaded = await readGoalState(file);
  assert.equal(loaded.goal_key, 'persistent-store-proof');

  const planned = await mutateGoalState(file, (current) => admitGoalPlan({
    state: current,
    plan: [{ work_key: 'persist-me', work_type: 'build' }],
    now: new Date('2026-09-24T19:31:00Z'),
  }), { now: new Date('2026-09-24T19:31:01Z') });
  assert.equal(planned.state.revision, 2);
  assert.deepEqual(planned.state.next_work_keys, ['persist-me']);

  loaded = await readGoalState(file);
  const started = await mutateGoalState(file, (current) => startGoalWork({
    state: current,
    workKey: 'persist-me',
    now: new Date('2026-09-24T19:32:00Z'),
  }), { now: new Date('2026-09-24T19:32:01Z') });
  assert.equal(started.state.status, 'executing');

  const staleCopy = structuredClone(loaded);
  staleCopy.revision += 10;
  await assert.rejects(
    () => writeGoalState(file, staleCopy, { expectedRevision: 2 }),
    /revision conflict/,
  );

  const finished = await mutateGoalState(file, (current) => recordGoalOutcome({
    state: current,
    workKey: 'persist-me',
    result: 'complete',
    receiptRef: 'exec:persist-me',
    evidenceRefs: ['artifact:persist-me'],
    now: new Date('2026-09-24T19:33:00Z'),
  }), { now: new Date('2026-09-24T19:33:01Z') });

  assert.equal(finished.state.status, 'complete');
  const final = await readGoalState(file);
  assert.equal(final.status, 'complete');
  assert.ok(final.evidence_refs.includes('exec:persist-me'));

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.goal.store-proof.v1',
    goal_key: final.goal_key,
    final_revision: final.revision,
    atomic_storage_receipt: finished.receipt.schema,
    optimistic_revision_conflict: true,
    restart_resume: true,
  }, null, 2));
} finally {
  await rm(dir, { recursive: true, force: true });
}
