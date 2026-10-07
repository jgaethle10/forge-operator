import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LineageStore, lineage } from './core.mjs';
import { verifyLineageIntegrity } from './fsck.mjs';
import { LargeObjectStore } from './large-object.mjs';

const chunking = {
  minChunkBytes: 16 * 1024,
  averageChunkBytes: 32 * 1024,
  maxChunkBytes: 64 * 1024,
};

async function healthyStore() {
  const root = await mkdtemp(join(tmpdir(), 'lineage-fsck-'));
  const store = new LineageStore(root);
  await store.init();
  await writeFile(join(root, 'brief.json'), '{"state":"verified"}\n');
  await writeFile(join(root, 'master.mov'), Buffer.concat([
    Buffer.alloc(120_000, 'A'),
    Buffer.from('FSCK-MASTER'),
    Buffer.alloc(120_000, 'B'),
  ]));
  const commit = await store.commit({
    message: 'healthy state',
    snapshot: {
      largeObjectThresholdBytes: 64 * 1024,
      largeObjectChunking: chunking,
    },
  });
  return { root, store, commit };
}

test('fsck verifies refs, object graph, operation receipts, manifests and chunks', async () => {
  const { root, store } = await healthyStore();
  try {
    const result = await verifyLineageIntegrity(store);
    assert.equal(result.ok, true);
    assert.equal(result.errors.length, 0);
    assert.ok(result.objects.reachable >= 4);
    assert.equal(result.large_objects.manifests_reachable, 1);
    assert.ok(result.large_objects.chunks_reachable > 0);
    assert.equal(result.verification.large_content_digest, true);
    assert.equal(result.mutation_performed, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('local object tampering is detected from content-addressed identity', async () => {
  const { root, store } = await healthyStore();
  try {
    const orphan = await store.putObject('blob', {
      encoding: 'base64',
      size: 3,
      content_sha256: lineage.sha256(Buffer.from('abc')),
      data: Buffer.from('abc').toString('base64'),
    });

    await writeFile(
      store.objectPath(orphan),
      JSON.stringify({
        schema: 'evercraft.lineage.v1',
        type: 'blob',
        payload: {
          encoding: 'base64',
          size: 4,
          content_sha256: '1'.repeat(64),
          data: Buffer.from('evil').toString('base64'),
        },
      }) + '\n'
    );

    await assert.rejects(
      () => store.readObject(orphan),
      (error) => error.code === 'LINEAGE_OBJECT_DIGEST_MISMATCH'
    );

    const result = await verifyLineageIntegrity(store);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(
      (row) =>
        row.code === 'object_invalid' &&
        row.object_id === orphan &&
        row.error_code === 'LINEAGE_OBJECT_DIGEST_MISMATCH'
    ));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('reachable large-object chunk corruption fails fsck closed', async () => {
  const { root, store, commit } = await healthyStore();
  try {
    const tree = await store.getTree(commit.commit_id);
    const entry = tree.entries.find((row) => row.storage === 'large_object');
    assert(entry?.manifest_id);

    const large = new LargeObjectStore(store.dir);
    const manifest = await large.readManifest(entry.manifest_id);
    const chunk = manifest.chunks[0];
    await writeFile(large.chunkPath(chunk.id), Buffer.from('corrupt'));

    const result = await verifyLineageIntegrity(store);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(
      (row) => row.code === 'chunk_invalid' && row.chunk_id === chunk.id
    ));
    assert.ok(result.errors.some(
      (row) =>
        row.code === 'reachable_chunk_missing_or_invalid' &&
        row.manifest_id === entry.manifest_id
    ));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('broken branch ref is an integrity error', async () => {
  const { root, store } = await healthyStore();
  try {
    const missing = 'f'.repeat(64);
    await writeFile(join(store.dir, 'refs', 'heads', 'broken'), missing + '\n');

    const result = await verifyLineageIntegrity(store, {
      verifyLargeContent: false,
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(
      (row) =>
        row.code === 'ref_missing_target' &&
        row.ref === 'broken' &&
        row.target === missing
    ));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('dangling immutable storage is reported but never silently deleted', async () => {
  const { root, store } = await healthyStore();
  try {
    const orphanObject = await store.putObject('blob', {
      encoding: 'base64',
      size: 6,
      content_sha256: lineage.sha256(Buffer.from('orphan')),
      data: Buffer.from('orphan').toString('base64'),
    });

    const large = new LargeObjectStore(store.dir);
    const orphanLarge = await large.putBuffer(Buffer.concat([
      Buffer.alloc(90_000, 'D'),
      Buffer.from('ORPHAN-LARGE'),
      Buffer.alloc(90_000, 'E'),
    ]), {
      logicalName: 'orphan.bin',
      chunking,
    });

    const result = await verifyLineageIntegrity(store);
    assert.equal(result.ok, true);
    assert.ok(result.objects.dangling.includes(orphanObject));
    assert.ok(
      result.large_objects.dangling_manifests.includes(orphanLarge.manifest_id)
    );
    assert.ok(result.large_objects.dangling_chunks.length > 0);
    assert.equal(result.mutation_performed, false);

    await assert.doesNotReject(() => store.readObject(orphanObject));
    assert.equal(await large.hasManifest(orphanLarge.manifest_id), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


test('fsck rejects an internally dishonest blob even when its outer object id is valid', async () => {
  const { root, store } = await healthyStore();
  try {
    const dishonest = await store.putObject('blob', {
      encoding: 'base64',
      size: 7,
      content_sha256: '0'.repeat(64),
      data: Buffer.from('honesty').toString('base64'),
    });

    await assert.doesNotReject(() => store.readObject(dishonest));
    const result = await verifyLineageIntegrity(store, {
      verifyLargeContent: false,
    });

    assert.equal(result.ok, false);
    assert.ok(result.errors.some(
      (row) =>
        row.code === 'blob_content_digest_mismatch' &&
        row.object_id === dishonest
    ));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
