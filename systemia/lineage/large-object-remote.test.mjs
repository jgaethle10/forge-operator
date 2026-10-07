import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDirectHttpLineageRemote } from './http-remote.mjs';
import { LargeObjectStore } from './large-object.mjs';
import { fetchLargeObject, pushLargeObject } from './large-object-remote.mjs';
import { startLineageRemoteRuntime } from './yard-remote-runtime.mjs';

const chunking = {
  minChunkBytes: 16 * 1024,
  averageChunkBytes: 32 * 1024,
  maxChunkBytes: 64 * 1024,
};

test('large masters replicate by missing chunks and materialize byte-identically', async () => {
  const sourceRoot = await mkdtemp(join(tmpdir(), 'lineage-large-source-'));
  const targetRoot = await mkdtemp(join(tmpdir(), 'lineage-large-target-'));
  const remoteRoot = await mkdtemp(join(tmpdir(), 'lineage-large-remote-'));
  const runtime = await startLineageRemoteRuntime({ stateDir: remoteRoot });
  try {
    const source = new LargeObjectStore(sourceRoot);
    const target = new LargeObjectStore(targetRoot);
    await source.init();
    await target.init();

    const firstBytes = Buffer.concat([
      Buffer.alloc(180_000, 'A'),
      Buffer.alloc(180_000, 'B'),
      Buffer.alloc(180_000, 'C'),
    ]);
    const secondBytes = Buffer.concat([
      Buffer.alloc(180_000, 'A'),
      Buffer.from('CUT-INSERT-17'),
      Buffer.alloc(180_000, 'B'),
      Buffer.alloc(180_000, 'C'),
    ]);

    const first = await source.putBuffer(firstBytes, {
      logicalName: 'studio-master-v1.mov',
      mediaType: 'video/quicktime',
      chunking,
    });
    const second = await source.putBuffer(secondBytes, {
      logicalName: 'studio-master-v2.mov',
      mediaType: 'video/quicktime',
      chunking,
    });

    const remote = createDirectHttpLineageRemote(runtime.service_url);
    const firstPush = await pushLargeObject({
      store: source,
      remote,
      manifestId: first.manifest_id,
      concurrency: 4,
    });
    assert.ok(firstPush.transferred_chunks > 0);
    assert.ok(firstPush.transferred_chunks <= firstPush.chunks);
    assert.equal(firstPush.transferred_chunks + firstPush.reused_chunks, firstPush.chunks);

    const secondPush = await pushLargeObject({
      store: source,
      remote,
      manifestId: second.manifest_id,
      concurrency: 4,
    });
    assert.ok(secondPush.reused_chunks > 0, 'edited master should reuse unchanged remote chunks');
    assert.ok(
      secondPush.transferred_chunks < secondPush.chunks,
      'edited master should transfer fewer chunks than total'
    );

    const fetched = await fetchLargeObject({
      store: target,
      remote,
      manifestId: second.manifest_id,
      concurrency: 4,
    });
    assert.equal(fetched.transferred_chunks, secondPush.chunks);
    assert.deepEqual(await target.materialize(second.manifest_id), secondBytes);

    const secondFetch = await fetchLargeObject({
      store: target,
      remote,
      manifestId: second.manifest_id,
      concurrency: 4,
    });
    assert.equal(secondFetch.transferred_chunks, 0);
    assert.equal(secondFetch.reused_chunks, secondPush.chunks);
  } finally {
    await runtime.close();
    await rm(sourceRoot, { recursive: true, force: true });
    await rm(targetRoot, { recursive: true, force: true });
    await rm(remoteRoot, { recursive: true, force: true });
  }
});

test('corrupt remote chunks are not treated as reusable and are repaired on push', async () => {
  const sourceRoot = await mkdtemp(join(tmpdir(), 'lineage-large-repair-source-'));
  const remoteRoot = await mkdtemp(join(tmpdir(), 'lineage-large-repair-remote-'));
  const runtime = await startLineageRemoteRuntime({ stateDir: remoteRoot });
  try {
    const source = new LargeObjectStore(sourceRoot);
    await source.init();
    const bytes = Buffer.concat([
      Buffer.alloc(90_000, 'X'),
      Buffer.alloc(90_000, 'Y'),
    ]);
    const stored = await source.putBuffer(bytes, {
      logicalName: 'world-cache.bin',
      chunking,
    });
    const manifest = await source.readManifest(stored.manifest_id);
    const remote = createDirectHttpLineageRemote(runtime.service_url);

    await pushLargeObject({ store: source, remote, manifestId: stored.manifest_id });
    const victim = manifest.chunks[0];
    await writeFile(runtime.large_object_store.chunkPath(victim.id), Buffer.from('corrupt'));

    assert.equal(await remote.hasChunk(victim.id), false);

    const repaired = await pushLargeObject({
      store: source,
      remote,
      manifestId: stored.manifest_id,
    });
    assert.ok(repaired.transferred_chunks >= 1);
    assert.equal(await remote.hasChunk(victim.id), true);
    assert.deepEqual(await runtime.large_object_store.materialize(stored.manifest_id), bytes);
  } finally {
    await runtime.close();
    await rm(sourceRoot, { recursive: true, force: true });
    await rm(remoteRoot, { recursive: true, force: true });
  }
});
