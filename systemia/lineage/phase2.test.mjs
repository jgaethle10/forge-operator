import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LineageStore } from './core.mjs';
import { LargeObjectStore } from './large-object.mjs';
import { LocalLineageRemote, pushCommitGraph } from './remote-protocol.mjs';

test('large-object store materializes byte-identical content and deduplicates shared chunks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lineage-large-'));
  try {
    const store = new LargeObjectStore(join(root, '.lineage'));
    const a = Buffer.concat([
      Buffer.alloc(180000, 'A'),
      Buffer.alloc(180000, 'B'),
      Buffer.alloc(180000, 'C')
    ]);
    const b = Buffer.concat([
      Buffer.alloc(180000, 'A'),
      Buffer.from('INSERTED-PREFIX'),
      Buffer.alloc(180000, 'B'),
      Buffer.alloc(180000, 'C')
    ]);
    const first = await store.putBuffer(a, {
      logicalName: 'film-master.mov',
      chunking: { minChunkBytes: 16 * 1024, averageChunkBytes: 32 * 1024, maxChunkBytes: 64 * 1024 }
    });
    const second = await store.putBuffer(b, {
      logicalName: 'film-master-v2.mov',
      chunking: { minChunkBytes: 16 * 1024, averageChunkBytes: 32 * 1024, maxChunkBytes: 64 * 1024 }
    });
    assert.deepEqual(await store.materialize(first.manifest_id), a);
    assert.deepEqual(await store.materialize(second.manifest_id), b);
    assert.ok(second.reused_chunks > 0, 'edited large object should reuse unchanged content-defined chunks');
    assert.equal((await store.verify(second.manifest_id)).ok, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('remote ref compare-and-swap rejects stale writers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lineage-remote-'));
  try {
    const remote = new LocalLineageRemote(root);
    await remote.init();
    const one = '1'.repeat(64);
    const two = '2'.repeat(64);
    const three = '3'.repeat(64);
    await remote.compareAndSwapRef('main', null, one);
    await remote.compareAndSwapRef('main', one, two);
    await assert.rejects(
      () => remote.compareAndSwapRef('main', one, three),
      (error) => error.code === 'STALE_REF' && error.current === two
    );
    assert.equal(await remote.readRef('main'), two);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('pushCommitGraph transfers immutable history and then reuses it', async () => {
  const localRoot = await mkdtemp(join(tmpdir(), 'lineage-local-'));
  const remoteRoot = await mkdtemp(join(tmpdir(), 'lineage-peer-'));
  try {
    const store = new LineageStore(localRoot);
    const remote = new LocalLineageRemote(remoteRoot);
    await store.init();
    await writeFile(join(localRoot, 'brief.json'), '{"state":"observed"}\n');
    const first = await store.commit({ message: 'first' });

    const pushed = await pushCommitGraph({ store, remote, branch: 'main', expectedRemoteHead: null });
    assert.equal(pushed.head, first.commit_id);
    assert.ok(pushed.transferred_objects >= 3);

    await writeFile(join(localRoot, 'brief.json'), '{"state":"observed","count":2}\n');
    const second = await store.commit({ message: 'second' });
    const pushedAgain = await pushCommitGraph({
      store,
      remote,
      branch: 'main',
      expectedRemoteHead: first.commit_id
    });
    assert.equal(pushedAgain.head, second.commit_id);
    assert.ok(pushedAgain.reused_objects > 0);
    assert.equal(await remote.readRef('main'), second.commit_id);

    const remoteCommit = JSON.parse((await remote.getObject(second.commit_id)).toString('utf8'));
    assert.equal(remoteCommit.type, 'commit');
  } finally {
    await rm(localRoot, { recursive: true, force: true });
    await rm(remoteRoot, { recursive: true, force: true });
  }
});

test('remote refuses object bytes whose digest does not match their claimed identity', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lineage-corrupt-'));
  try {
    const remote = new LocalLineageRemote(root);
    await remote.init();
    await assert.rejects(
      () => remote.putObject('0'.repeat(64), Buffer.from('not that hash')),
      /digest mismatch/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
