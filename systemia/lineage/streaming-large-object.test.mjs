import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LineageStore } from './core.mjs';
import { LargeObjectStore } from './large-object.mjs';

const chunking = {
  minChunkBytes: 16 * 1024,
  averageChunkBytes: 32 * 1024,
  maxChunkBytes: 64 * 1024,
};

test('streamed file ingest produces the same manifest identity as buffered ingest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lineage-stream-ingest-'));
  try {
    const file = join(root, 'master.mov');
    const bytes = Buffer.concat([
      Buffer.alloc(190_000, 'A'),
      Buffer.from('STREAM-CUT-17'),
      Buffer.alloc(210_000, 'B'),
      Buffer.alloc(170_000, 'C'),
    ]);
    await writeFile(file, bytes);

    const buffered = new LargeObjectStore(join(root, 'buffered'));
    const streamed = new LargeObjectStore(join(root, 'streamed'));
    await buffered.init();
    await streamed.init();

    const fromBuffer = await buffered.putBuffer(bytes, {
      logicalName: 'master.mov',
      mediaType: 'video/quicktime',
      chunking,
    });
    const fromFile = await streamed.putFile(file, {
      logicalName: 'master.mov',
      mediaType: 'video/quicktime',
      chunking,
    });

    assert.equal(fromFile.ingest_mode, 'stream');
    assert.equal(fromFile.content_sha256, fromBuffer.content_sha256);
    assert.equal(fromFile.manifest_id, fromBuffer.manifest_id);
    assert.equal(fromFile.chunk_count, fromBuffer.chunk_count);
    assert.deepEqual(
      (await streamed.readManifest(fromFile.manifest_id)).chunks,
      (await buffered.readManifest(fromBuffer.manifest_id)).chunks
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('streamed verification and file materialization preserve exact bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lineage-stream-verify-'));
  try {
    const source = join(root, 'source.glb');
    const target = join(root, 'restored', 'source.glb');
    const bytes = Buffer.concat([
      Buffer.alloc(150_000, 'X'),
      Buffer.from('WORLD-NODE-001'),
      Buffer.alloc(150_000, 'Y'),
      Buffer.alloc(150_000, 'Z'),
    ]);
    await writeFile(source, bytes);

    const store = new LargeObjectStore(join(root, '.lineage'));
    const stored = await store.putFile(source, {
      logicalName: 'source.glb',
      mediaType: 'model/gltf-binary',
      chunking,
    });

    const verified = await store.verify(stored.manifest_id);
    assert.equal(verified.verification_mode, 'stream');
    assert.equal(verified.content_sha256, stored.content_sha256);
    assert.equal(verified.bytes, bytes.length);

    const restored = await store.writeToFile(stored.manifest_id, target);
    assert.equal(restored.materialization_mode, 'stream');
    assert.equal(restored.content_sha256, stored.content_sha256);
    assert.deepEqual(await readFile(target), bytes);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('failed streamed restore does not publish a partial target file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lineage-stream-atomic-'));
  try {
    const source = join(root, 'source.mov');
    const target = join(root, 'published.mov');
    const bytes = Buffer.concat([
      Buffer.alloc(120_000, 'P'),
      Buffer.alloc(120_000, 'Q'),
      Buffer.alloc(120_000, 'R'),
    ]);
    await writeFile(source, bytes);

    const store = new LargeObjectStore(join(root, '.lineage'));
    const stored = await store.putFile(source, {
      logicalName: 'source.mov',
      mediaType: 'video/quicktime',
      chunking,
    });
    const manifest = await store.readManifest(stored.manifest_id);
    await writeFile(store.chunkPath(manifest.chunks[0].id), Buffer.from('corrupt'));

    await assert.rejects(
      () => store.writeToFile(stored.manifest_id, target),
      /Chunk digest mismatch/
    );
    await assert.rejects(() => stat(target), (error) => error?.code === 'ENOENT');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Lineage core never calls buffered large-object ingest or materialize during large commit/restore', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lineage-stream-core-'));
  const restoreRoot = await mkdtemp(join(tmpdir(), 'lineage-stream-core-restore-'));
  const originalPutBuffer = LargeObjectStore.prototype.putBuffer;
  const originalMaterialize = LargeObjectStore.prototype.materialize;

  try {
    const bytes = Buffer.concat([
      Buffer.alloc(180_000, 'L'),
      Buffer.from('CANONICAL-SHOT'),
      Buffer.alloc(180_000, 'M'),
    ]);
    await writeFile(join(root, 'master.mov'), bytes);

    LargeObjectStore.prototype.putBuffer = async () => {
      throw new Error('buffered_large_ingest_forbidden');
    };

    const store = new LineageStore(root);
    await store.init();
    const committed = await store.commit({
      message: 'stream-only master',
      snapshot: {
        largeObjectThresholdBytes: 64 * 1024,
        largeObjectChunking: chunking,
      },
    });

    const tree = await store.getTree(committed.commit_id);
    assert.equal(tree.entries[0].storage, 'large_object');

    LargeObjectStore.prototype.materialize = async () => {
      throw new Error('buffered_large_materialize_forbidden');
    };

    await store.restore(committed.commit_id, restoreRoot);
    assert.deepEqual(await readFile(join(restoreRoot, 'master.mov')), bytes);
  } finally {
    LargeObjectStore.prototype.putBuffer = originalPutBuffer;
    LargeObjectStore.prototype.materialize = originalMaterialize;
    await rm(root, { recursive: true, force: true });
    await rm(restoreRoot, { recursive: true, force: true });
  }
});

test('streaming ingest preserves the canonical empty-file chunk contract', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lineage-stream-empty-'));
  try {
    const file = join(root, 'empty.bin');
    await writeFile(file, Buffer.alloc(0));
    const store = new LargeObjectStore(join(root, '.lineage'));
    const stored = await store.putFile(file, {
      logicalName: 'empty.bin',
      chunking,
    });
    const manifest = await store.readManifest(stored.manifest_id);
    assert.equal(manifest.bytes, 0);
    assert.equal(manifest.chunks.length, 1);
    assert.equal(manifest.chunks[0].bytes, 0);
    assert.deepEqual(await store.materialize(stored.manifest_id), Buffer.alloc(0));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
