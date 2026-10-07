import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LineageStore } from './core.mjs';

const actor = (id) => ({ type: 'agent', id });

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'lineage-local-cas-'));
  const store = new LineageStore(root);
  await store.init();
  await writeFile(join(root, 'base.txt'), 'base\n');
  const base = await store.commit({
    message: 'base',
    actor: { type: 'human', id: 'operator' },
  });
  return { root, store, base };
}

test('two commits from the same expected head cannot silently overwrite each other', async () => {
  const { root, store, base } = await setup();
  try {
    const tree = await store.getTree(base.commit_id);

    const results = await Promise.allSettled([
      store._createCommitFromTree(
        tree.tree_id,
        [base.commit_id],
        {
          message: 'worker-a',
          actor: actor('worker-a'),
          expected_head: base.commit_id,
        }
      ),
      store._createCommitFromTree(
        tree.tree_id,
        [base.commit_id],
        {
          message: 'worker-b',
          actor: actor('worker-b'),
          expected_head: base.commit_id,
        }
      ),
    ]);

    const fulfilled = results.filter((row) => row.status === 'fulfilled');
    const rejected = results.filter((row) => row.status === 'rejected');
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);

    const stale = rejected[0].reason;
    assert.equal(stale.code, 'LINEAGE_STALE_REF');
    assert.equal(stale.expected, base.commit_id);
    assert.match(stale.proposed_commit_id, /^[a-f0-9]{64}$/);

    const winner = fulfilled[0].value.commit_id;
    assert.equal(await store.resolveRef('main'), winner);
    assert.equal((await store.readObject(stale.proposed_commit_id)).type, 'commit');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('commit detects branch movement that occurs during workspace snapshot', async () => {
  const { root, store, base } = await setup();
  try {
    const originalSnapshot = store.snapshotWorkspace.bind(store);
    let competingCommit = null;

    store.snapshotWorkspace = async (...args) => {
      const snapshot = await originalSnapshot(...args);
      competingCommit = await store.putObject('commit', {
        tree_id: snapshot.tree_id,
        parents: [base.commit_id],
        message: 'competing writer',
        actor: actor('competitor'),
        rationale: null,
        created_at: new Date().toISOString(),
        provenance: { sources: [], evidence: [], rights: [] },
        authority: { mutation: true, publish: false, payment: false },
        transactions: [],
        metadata: {},
      });
      await store.compareAndSwapRef('main', base.commit_id, competingCommit);
      return snapshot;
    };

    await assert.rejects(
      () => store.commit({
        message: 'slow snapshot writer',
        actor: actor('slow-worker'),
      }),
      (error) =>
        error.code === 'LINEAGE_STALE_REF' &&
        error.current === competingCommit &&
        error.expected === base.commit_id
    );

    assert.equal(await store.resolveRef('main'), competingCommit);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('creating an existing branch fails stale instead of replacing its head', async () => {
  const { root, store, base } = await setup();
  try {
    const first = await store.createBranch('worker', base.commit_id);
    assert.equal(first.commit_id, base.commit_id);

    await writeFile(join(root, 'base.txt'), 'next\n');
    const next = await store.commit({ message: 'next main' });

    await assert.rejects(
      () => store.createBranch('worker', next.commit_id),
      (error) =>
        error.code === 'LINEAGE_STALE_REF' &&
        error.current === base.commit_id &&
        error.expected === null
    );

    assert.equal(await store.resolveRef('worker'), base.commit_id);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rollback uses compare-and-swap and refuses a concurrent branch move', async () => {
  const { root, store, base } = await setup();
  try {
    await writeFile(join(root, 'base.txt'), 'second\n');
    const second = await store.commit({ message: 'second' });
    const secondTree = await store.getTree(second.commit_id);

    const competitor = await store.putObject('commit', {
      tree_id: secondTree.tree_id,
      parents: [second.commit_id],
      message: 'competitor',
      actor: actor('competitor'),
      rationale: null,
      created_at: new Date().toISOString(),
      provenance: { sources: [], evidence: [], rights: [] },
      authority: { mutation: true, publish: false, payment: false },
      transactions: [],
      metadata: {},
    });

    const originalCas = store.compareAndSwapRef.bind(store);
    let injected = false;
    store.compareAndSwapRef = async (branch, expected, next, options) => {
      if (!injected) {
        injected = true;
        await originalCas(branch, expected, competitor, options);
      }
      return originalCas(branch, expected, next, options);
    };

    await assert.rejects(
      () => store.rollback(base.commit_id),
      (error) =>
        error.code === 'LINEAGE_STALE_REF' &&
        error.current === competitor &&
        error.expected === second.commit_id
    );

    assert.equal(await store.resolveRef('main'), competitor);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


test('existing ref lock fails with a bounded timeout and leaves the ref unchanged', async () => {
  const { root, store, base } = await setup();
  try {
    const lockPath = store.refLockPath('main');
    await writeFile(lockPath, '{"held":true}\n');

    await assert.rejects(
      () => store.compareAndSwapRef(
        'main',
        base.commit_id,
        base.commit_id,
        { timeoutMs: 5, retryMs: 1 }
      ),
      (error) =>
        error.code === 'LINEAGE_REF_LOCK_TIMEOUT' &&
        error.branch === 'main'
    );

    assert.equal(await store.resolveRef('main'), base.commit_id);
    await rm(lockPath, { force: true });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('ref CAS rechecks GC lock after acquiring its ref critical section', async () => {
  const { root, store, base } = await setup();
  try {
    const tree = await store.getTree(base.commit_id);
    const next = await store.putObject('commit', {
      tree_id: tree.tree_id,
      parents: [base.commit_id],
      message: 'next',
      actor: actor('next-worker'),
      rationale: null,
      created_at: new Date().toISOString(),
      provenance: { sources: [], evidence: [], rights: [] },
      authority: { mutation: true, publish: false, payment: false },
      transactions: [],
      metadata: {},
    });

    const originalAcquire = store._acquireRefLock.bind(store);
    store._acquireRefLock = async (...args) => {
      const lock = await originalAcquire(...args);
      await writeFile(
        join(store.dir, 'gc.lock'),
        '{"schema":"evercraft.lineage.gc-lock.v1"}\n'
      );
      return lock;
    };

    await assert.rejects(
      () => store.compareAndSwapRef('main', base.commit_id, next),
      (error) => error.code === 'LINEAGE_GC_LOCKED'
    );

    assert.equal(await store.resolveRef('main'), base.commit_id);
    await rm(join(store.dir, 'gc.lock'), { force: true });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
