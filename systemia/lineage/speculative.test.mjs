import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LineageStore } from './core.mjs';
import {
  planReconciliation,
  provisionSpeculativeBranches,
  speculativeBranchName
} from './speculative.mjs';

const agent = (id) => ({ type: 'agent', id });

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'lineage-speculation-'));
  const store = new LineageStore(root);
  await store.init();
  await writeFile(join(root, 'base.json'), '{"base":true}\n');
  const base = await store.commit({ message: 'base', actor: { type: 'human', id: 'operator' } });
  return { root, store, base };
}

test('provisions bounded Saban branches from one immutable base', async () => {
  const { root, store, base } = await setup();
  try {
    const plan = await provisionSpeculativeBranches(store, {
      missionId: 'Fallen Shot 17',
      workerIds: ['worker-a', 'worker-b'],
      baseRef: base.commit_id
    });
    assert.equal(plan.base_commit, base.commit_id);
    assert.deepEqual(plan.branches.map((x) => x.branch), [
      'saban/fallen-shot-17/worker-a',
      'saban/fallen-shot-17/worker-b'
    ]);
    assert.equal(plan.publication_authority, false);
    assert.equal(await store.resolveRef(plan.branches[0].branch), base.commit_id);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('reconciliation allows non-overlapping speculative work', async () => {
  const { root, store, base } = await setup();
  try {
    const plan = await provisionSpeculativeBranches(store, {
      missionId: 'rivet-session-proof',
      workerIds: ['a', 'b'],
      baseRef: base.commit_id
    });

    await store.switchBranch(plan.branches[0].branch);
    await store.restore(base.commit_id, root);
    await writeFile(join(root, 'worker-a.json'), '{"source":"observed"}\n');
    await store.commit({ message: 'worker a', actor: agent('a') });

    await store.switchBranch(plan.branches[1].branch);
    await store.restore(base.commit_id, root);
    await writeFile(join(root, 'worker-b.json'), '{"model":"bounded"}\n');
    await store.commit({ message: 'worker b', actor: agent('b') });

    const review = await planReconciliation(store, {
      baseCommit: base.commit_id,
      branches: plan.branches.map((x) => x.branch)
    });
    assert.equal(review.conflicts.length, 0);
    assert.equal(review.auto_merge_allowed, true);
    assert.equal(review.safe_branches.length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('reconciliation quarantines different edits to the same artifact', async () => {
  const { root, store, base } = await setup();
  try {
    await writeFile(join(root, 'scene.json'), '{"camera":"wide"}\n');
    const seeded = await store.commit({ message: 'seed scene', actor: { type: 'human', id: 'operator' } });
    const plan = await provisionSpeculativeBranches(store, {
      missionId: 'fallen-camera',
      workerIds: ['director-a', 'director-b'],
      baseRef: seeded.commit_id
    });

    await store.switchBranch(plan.branches[0].branch);
    await store.restore(seeded.commit_id, root);
    await writeFile(join(root, 'scene.json'), '{"camera":"close"}\n');
    await store.commit({ message: 'close', actor: agent('director-a') });

    await store.switchBranch(plan.branches[1].branch);
    await store.restore(seeded.commit_id, root);
    await writeFile(join(root, 'scene.json'), '{"camera":"dolly"}\n');
    await store.commit({ message: 'dolly', actor: agent('director-b') });

    const review = await planReconciliation(store, {
      baseCommit: seeded.commit_id,
      branches: plan.branches.map((x) => x.branch)
    });
    assert.equal(review.auto_merge_allowed, false);
    assert.equal(review.conflicts.length, 1);
    assert.equal(review.conflicts[0].path, 'scene.json');
    assert.deepEqual(review.conflicted_branches, [
      'saban/fallen-camera/director-a',
      'saban/fallen-camera/director-b'
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('identical independent edits are equivalent overlap, not a conflict', async () => {
  const { root, store, base } = await setup();
  try {
    const plan = await provisionSpeculativeBranches(store, {
      missionId: 'same-answer',
      workerIds: ['one', 'two'],
      baseRef: base.commit_id
    });

    for (const item of plan.branches) {
      await store.switchBranch(item.branch);
      await store.restore(base.commit_id, root);
      await writeFile(join(root, 'answer.json'), '{"value":42}\n');
      await store.commit({ message: 'same result', actor: agent(item.worker_id) });
    }

    const review = await planReconciliation(store, {
      baseCommit: base.commit_id,
      branches: plan.branches.map((x) => x.branch)
    });
    assert.equal(review.conflicts.length, 0);
    assert.equal(review.equivalent_overlaps.length, 1);
    assert.equal(review.equivalent_overlaps[0].path, 'answer.json');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('branch names are deterministic and filesystem-safe', () => {
  assert.equal(
    speculativeBranchName({ missionId: 'Mission #001 / Nepal', workerId: 'Agent 7' }),
    'saban/mission-001-nepal/agent-7'
  );
});
