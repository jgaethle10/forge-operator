import { Buffer } from 'node:buffer';
import { largeObject } from './large-object.mjs';

function boundedConcurrency(value) {
  const n = Number(value ?? 4);
  if (!Number.isInteger(n) || n < 1 || n > 16) {
    throw new Error('large_object_replication_concurrency_must_be_1_to_16');
  }
  return n;
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function runner() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length || 1) }, () => runner())
  );
  return results;
}

function verifyManifestId(manifestId, manifest) {
  const actual = largeObject.sha256(Buffer.from(JSON.stringify(manifest)));
  if (actual !== manifestId) {
    const error = new Error(
      `Remote large-object manifest digest mismatch: expected ${manifestId}, got ${actual}`
    );
    error.code = 'LARGE_OBJECT_MANIFEST_DIGEST_MISMATCH';
    throw error;
  }
  return actual;
}

async function requireLargeRemote(remote) {
  if (!remote || typeof remote.init !== 'function') {
    throw new Error('large_object_remote_required');
  }
  const health = await remote.init();
  if (health?.large_object_transport !== true) {
    throw new Error('large_object_remote_transport_not_supported');
  }
  for (const method of [
    'hasChunk',
    'putChunk',
    'getChunk',
    'hasLargeManifest',
    'putLargeManifest',
    'getLargeManifest',
  ]) {
    if (typeof remote[method] !== 'function') {
      throw new Error(`large_object_remote_missing_method:${method}`);
    }
  }
  return health;
}

export async function pushLargeObject({
  store,
  remote,
  manifestId,
  concurrency = 4,
} = {}) {
  if (!store || typeof store.readManifest !== 'function') {
    throw new Error('large_object_store_required');
  }
  if (!manifestId) throw new Error('large_object_manifest_id_required');

  const health = await requireLargeRemote(remote);
  const manifest = await store.readManifest(manifestId);
  verifyManifestId(manifestId, manifest);
  const limit = boundedConcurrency(concurrency);

  const chunkResults = await mapLimit(manifest.chunks, limit, async (chunk) => {
    const present = await remote.hasChunk(chunk.id);
    if (present) {
      return {
        id: chunk.id,
        bytes: chunk.bytes,
        transferred: false,
        reused: true,
      };
    }

    const bytes = await store.getChunk(chunk.id);
    if (bytes.length !== Number(chunk.bytes)) {
      throw new Error(`Large-object chunk size mismatch before push: ${chunk.id}`);
    }
    const pushed = await remote.putChunk(chunk.id, bytes);
    if (pushed.id !== chunk.id) {
      throw new Error(`Remote returned wrong chunk identity: expected ${chunk.id}, got ${pushed.id}`);
    }
    return {
      id: chunk.id,
      bytes: bytes.length,
      transferred: true,
      reused: pushed.reused === true,
    };
  });

  const manifestPresent = await remote.hasLargeManifest(manifestId);
  if (!manifestPresent) {
    const result = await remote.putLargeManifest(manifestId, manifest);
    if (result.id !== manifestId) {
      throw new Error('Remote returned wrong large-object manifest identity');
    }
  }

  const transferred = chunkResults.filter((row) => row.transferred);
  const reused = chunkResults.filter((row) => !row.transferred);

  return {
    schema: 'evercraft.lineage.large-object-push.v1',
    manifest_id: manifestId,
    content_sha256: manifest.content_sha256,
    bytes: manifest.bytes,
    chunks: manifest.chunks.length,
    transferred_chunks: transferred.length,
    transferred_bytes: transferred.reduce((sum, row) => sum + row.bytes, 0),
    reused_chunks: reused.length,
    manifest_transferred: !manifestPresent,
    remote_protocol: health.protocol,
    authority: {
      storage_only: true,
      publication: false,
      deployment: false,
      payment: false,
    },
  };
}

export async function fetchLargeObject({
  store,
  remote,
  manifestId,
  concurrency = 4,
} = {}) {
  if (!store || typeof store.putChunk !== 'function' || typeof store.putManifest !== 'function') {
    throw new Error('large_object_store_required');
  }
  if (!manifestId) throw new Error('large_object_manifest_id_required');

  const health = await requireLargeRemote(remote);
  const manifest = await remote.getLargeManifest(manifestId);
  verifyManifestId(manifestId, manifest);
  const limit = boundedConcurrency(concurrency);
  await store.init();

  const chunkResults = await mapLimit(manifest.chunks, limit, async (chunk) => {
    if (await store.hasChunk(chunk.id)) {
      const local = await store.getChunk(chunk.id);
      if (local.length === Number(chunk.bytes)) {
        return {
          id: chunk.id,
          bytes: local.length,
          transferred: false,
          reused: true,
        };
      }
    }

    const bytes = await remote.getChunk(chunk.id);
    const actual = largeObject.sha256(bytes);
    if (actual !== chunk.id) {
      throw new Error(
        `Remote chunk digest mismatch: expected ${chunk.id}, got ${actual}`
      );
    }
    if (bytes.length !== Number(chunk.bytes)) {
      throw new Error(`Remote chunk size mismatch: ${chunk.id}`);
    }

    const stored = await store.putChunk(bytes);
    if (stored.id !== chunk.id) {
      throw new Error('Local store returned wrong chunk identity');
    }
    return {
      id: chunk.id,
      bytes: bytes.length,
      transferred: true,
      reused: false,
    };
  });

  await store.putManifest(manifest, { expectedId: manifestId });
  const verified = await store.verify(manifestId);

  const transferred = chunkResults.filter((row) => row.transferred);
  const reused = chunkResults.filter((row) => !row.transferred);

  return {
    schema: 'evercraft.lineage.large-object-fetch.v1',
    manifest_id: manifestId,
    content_sha256: verified.content_sha256,
    bytes: verified.bytes,
    chunks: verified.chunk_count,
    transferred_chunks: transferred.length,
    transferred_bytes: transferred.reduce((sum, row) => sum + row.bytes, 0),
    reused_chunks: reused.length,
    remote_protocol: health.protocol,
    authority: {
      storage_only: true,
      publication: false,
      deployment: false,
      payment: false,
    },
  };
}
