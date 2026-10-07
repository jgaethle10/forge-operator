import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LineageStore } from './core.mjs';
import { semanticDiff } from './semantic-diff.mjs';
import { LocalLineageRemote, fetchCommitGraph, pushCommitGraph } from './remote-protocol.mjs';

const chunking = {
  minChunkBytes: 16 * 1024,
  averageChunkBytes: 32 * 1024,
  maxChunkBytes: 64 * 1024,
};

test('large workspace files become manifest-backed refs and restore byte-identically', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lineage-large-ref-'));
  const restoreDir = await mkdtemp(join(tmpdir(), 'lineage-large-restore-'));
  try {
    const store = new LineageStore(root);
    await store.init();
    const bytes = Buffer.concat([
      Buffer.alloc(140_000, 'A'),
      Buffer.alloc(140_000, 'B'),
      Buffer.alloc(140_000, 'C'),
    ]);
    await writeFile(join(root, 'master.mov'), bytes);

    const committed = await store.commit({
      message: 'large master',
      snapshot: {
        largeObjectThresholdBytes: 64 * 1024,
        largeObjectChunking: chunking,
      },
    });

    const tree = await store.getTree(committed.commit_id);
    assert.equal(tree.entries.length, 1);
    const entry = tree.entries[0];
    assert.equal(entry.storage, 'large_object');
    assert.match(entry.manifest_id, /^[a-f0-9]{64}$/);

    const object = await store.readObject(entry.object_id);
    assert.equal(object.type, 'large_blob_ref');
    assert.equal(object.payload.manifest_id, entry.manifest_id);
    assert.equal(object.payload.content_sha256, entry.content_sha256);
    assert.ok(object.payload.chunk_count > 1);

    await store.restore(committed.commit_id, restoreDir);
    assert.deepEqual(await readFile(join(restoreDir, 'master.mov')), bytes);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(restoreDir, { recursive: true, force: true });
  }
});

test('commit graph push and fetch automatically carry referenced large assets', async () => {
  const sourceRoot = await mkdtemp(join(tmpdir(), 'lineage-large-graph-source-'));
  const targetRoot = await mkdtemp(join(tmpdir(), 'lineage-large-graph-target-'));
  const remoteRoot = await mkdtemp(join(tmpdir(), 'lineage-large-graph-remote-'));
  const restoreDir = await mkdtemp(join(tmpdir(), 'lineage-large-graph-restore-'));
  try {
    const source = new LineageStore(sourceRoot);
    const target = new LineageStore(targetRoot);
    const remote = new LocalLineageRemote(remoteRoot);
    await source.init();
    await target.init();

    const bytes = Buffer.concat([
      Buffer.alloc(120_000, 'X'),
      Buffer.from('SHOT-42'),
      Buffer.alloc(120_000, 'Y'),
      Buffer.alloc(120_000, 'Z'),
    ]);
    await writeFile(join(sourceRoot, 'world-cache.glb'), bytes);
    const committed = await source.commit({
      message: 'world cache',
      snapshot: {
        largeObjectThresholdBytes: 64 * 1024,
        largeObjectChunking: chunking,
      },
    });

    const pushed = await pushCommitGraph({
      store: source,
      remote,
      branch: 'main',
      expectedRemoteHead: null,
    });
    assert.equal(pushed.head, committed.commit_id);
    assert.equal(pushed.large_objects, 1);
    assert.ok(pushed.transferred_large_chunks > 0);
    assert.equal(await remote.readRef('main'), committed.commit_id);

    const fetched = await fetchCommitGraph({
      store: target,
      remote,
      remoteBranch: 'main',
      localBranch: 'main',
    });
    assert.equal(fetched.large_objects, 1);
    assert.ok(fetched.transferred_large_chunks > 0);
    assert.equal(await target.resolveRef('main'), committed.commit_id);

    await target.restore('main', restoreDir);
    assert.deepEqual(await readFile(join(restoreDir, 'world-cache.glb')), bytes);
  } finally {
    await rm(sourceRoot, { recursive: true, force: true });
    await rm(targetRoot, { recursive: true, force: true });
    await rm(remoteRoot, { recursive: true, force: true });
    await rm(restoreDir, { recursive: true, force: true });
  }
});

test('large-object transfer failure leaves remote branch head unchanged', async () => {
  const sourceRoot = await mkdtemp(join(tmpdir(), 'lineage-large-atomic-source-'));
  const remoteRoot = await mkdtemp(join(tmpdir(), 'lineage-large-atomic-remote-'));
  try {
    const source = new LineageStore(sourceRoot);
    const remote = new LocalLineageRemote(remoteRoot);
    await source.init();
    await remote.init();

    await writeFile(join(sourceRoot, 'master.mov'), Buffer.alloc(300_000, 'Q'));
    await source.commit({
      message: 'atomic large push',
      snapshot: {
        largeObjectThresholdBytes: 64 * 1024,
        largeObjectChunking: chunking,
      },
    });

    let casCalls = 0;
    const originalCas = remote.compareAndSwapRef.bind(remote);
    remote.compareAndSwapRef = async (...args) => {
      casCalls += 1;
      return originalCas(...args);
    };
    remote.putChunk = async () => {
      throw new Error('simulated_large_asset_transfer_failure');
    };

    await assert.rejects(
      () => pushCommitGraph({
        store: source,
        remote,
        branch: 'main',
        expectedRemoteHead: null,
      }),
      /simulated_large_asset_transfer_failure/
    );

    assert.equal(casCalls, 0);
    assert.equal(await remote.readRef('main'), null);
  } finally {
    await rm(sourceRoot, { recursive: true, force: true });
    await rm(remoteRoot, { recursive: true, force: true });
  }
});

test('semantic diff does not materialize oversized large refs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lineage-large-semantic-'));
  try {
    const store = new LineageStore(root);
    await store.init();
    const firstBytes = Buffer.alloc((2 * 1024 * 1024) + 4096, 'A');
    const secondBytes = Buffer.from(firstBytes);
    secondBytes[secondBytes.length - 1] = 'B'.charCodeAt(0);

    await writeFile(join(root, 'huge.txt'), firstBytes);
    const first = await store.commit({
      message: 'huge text one',
      snapshot: {
        largeObjectThresholdBytes: 64 * 1024,
        largeObjectChunking: chunking,
      },
    });

    await writeFile(join(root, 'huge.txt'), secondBytes);
    const second = await store.commit({
      message: 'huge text two',
      snapshot: {
        largeObjectThresholdBytes: 64 * 1024,
        largeObjectChunking: chunking,
      },
    });

    const diff = await semanticDiff(store, first.commit_id, second.commit_id);
    assert.equal(diff.changes.length, 1);
    assert.equal(diff.changes[0].semantic.semantic_comparison_available, false);
    assert.match(diff.changes[0].semantic.reason, /large_object/);
    assert.notEqual(
      diff.changes[0].semantic.before_content_sha256,
      diff.changes[0].semantic.after_content_sha256
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
