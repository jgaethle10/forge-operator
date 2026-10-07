import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LineageStore } from './core.mjs';

const human = (id) => ({ type: 'human', id });

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'lineage-local-ref-'));
  const store = new LineageStore(root);
  await store.init();
  await writeFile(join(root, 'state.txt'), 'base\n');
  const base = await store.commit({
    message: 'base',
    actor: human('operator'),
  });
  return { root, store, base };
}

async function commitObject(store, {
  treeId,
  parent,
  message,
  actorId,
}) {
  return await store.putObject('commit', {
    tree_id: treeId,
    parents: parent ? [parent] : [],
    message,
    actor: human(actorId),
    rationale: null,
    created_at: new Date().toISOString(),
    provenance: { sources: [], evidence: [], rights: [] },
    authority: { mutation: true, publish: false, payment: false },
    transactions: [],
    metadata: {},
  });
}

test('local ref compare-and-swap rejects stale writers and preserves the winner', async () => {
  const { root, store, base } = await setup();
  try {
    const tree = await store.getTree(base.commit_id);
    const first = await commitObject(store, {
      treeId: tree.tree_id,
      parent: base.commit_id,
      message: 'first',
      actorId: 'first',
    });
    const second = await commitObject(store, {
      treeId: tree.tree_id,
      parent: base.commit_id,
      message: 'second',
      actorId: 'second',
    });

    const firstUpdate = await store.writeRef('main', first, {
      expected: base.commit_id,
      actor: human('first'),
      reason: 'test_first_writer',
    });
    assert.equal(firstUpdate.previous, base.commit_id);
    assert.equal(firstUpdate.current, first);
    assert.equal(firstUpdate.compare_and_swap, true);

    await assert.rejects(
      () => store.writeRef('main', second, {
        expected: base.commit_id,
        actor: human('second'),
        reason: 'test_stale_writer',
      }),
      (error) =>
        error.code === 'LINEAGE_STALE_REF' &&
        error.current === first &&
        error.expected === base.commit_id &&
        error.next === second
    );

    assert.equal(await store.resolveRef('main'), first);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a slow commit cannot overwrite a branch that moved during snapshot work', async () => {
  const { root, store, base } = await setup();
  try {
    const staleSnapshot = await store.snapshotWorkspace();

    await writeFile(join(root, 'state.txt'), 'winner\n');
    const winner = await store.commit({
      message: 'winner',
      actor: human('fast-agent'),
    });

    await assert.rejects(
      () => store._createCommitFromTree(
        staleSnapshot.tree_id,
        [base.commit_id],
        {
          message: 'slow stale proposal',
          actor: human('slow-agent'),
        }
      ),
      (error) =>
        error.code === 'LINEAGE_STALE_REF' &&
        error.current === winner.commit_id &&
        error.expected === base.commit_id &&
        /^[a-f0-9]{64}$/.test(String(error.proposed_commit_id || ''))
    );

    assert.equal(await store.resolveRef('main'), winner.commit_id);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('active local ref lock prevents a second writer from entering the critical section', async () => {
  const { root, store, base } = await setup();
  const lockPath = join(store.dir, 'refs', 'heads', 'main.lock');
  let lock;
  try {
    const tree = await store.getTree(base.commit_id);
    const next = await commitObject(store, {
      treeId: tree.tree_id,
      parent: base.commit_id,
      message: 'locked proposal',
      actorId: 'locked-agent',
    });

    lock = await open(lockPath, 'wx');

    await assert.rejects(
      () => store.writeRef('main', next, {
        expected: base.commit_id,
        actor: human('locked-agent'),
      }),
      (error) =>
        error.code === 'LINEAGE_REF_LOCKED' &&
        error.branch === 'main'
    );

    assert.equal(await store.resolveRef('main'), base.commit_id);
  } finally {
    if (lock) await lock.close();
    await rm(lockPath, { force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test('reflog records immutable before/after ref movement context', async () => {
  const { root, store, base } = await setup();
  try {
    await writeFile(join(root, 'state.txt'), 'next\n');
    const next = await store.commit({
      message: 'next',
      actor: human('history-agent'),
    });

    const log = await store.readRefLog('main', 10);
    assert.ok(log.length >= 3, 'init, base commit and next commit should be recorded');

    const latest = log[0];
    assert.equal(latest.current, next.commit_id);
    assert.equal(latest.previous, base.commit_id);
    assert.equal(latest.reason, 'commit');
    assert.deepEqual(latest.actor, human('history-agent'));
    assert.equal(latest.schema, 'evercraft.lineage.reflog.v1');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('createBranch refuses to silently replace an existing non-empty branch', async () => {
  const { root, store, base } = await setup();
  try {
    await store.createBranch('feature', base.commit_id);

    await writeFile(join(root, 'state.txt'), 'other\n');
    const other = await store.commit({
      message: 'other',
      actor: human('operator'),
    });

    await assert.rejects(
      () => store.createBranch('feature', other.commit_id),
      (error) =>
        error.code === 'LINEAGE_STALE_REF' &&
        error.branch === 'feature' &&
        error.current === base.commit_id
    );
    assert.equal(await store.resolveRef('feature'), base.commit_id);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
