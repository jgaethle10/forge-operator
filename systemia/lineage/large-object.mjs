import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const SCHEMA = 'evercraft.lineage.large-object.v1';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function gearValue(byte) {
  let x = (byte + 1) * 0x45d9f3b;
  x = ((x >>> 16) ^ x) * 0x45d9f3b;
  x = ((x >>> 16) ^ x) * 0x45d9f3b;
  return ((x >>> 16) ^ x) >>> 0;
}

function nearestPowerOfTwo(value) {
  let n = 1;
  while (n < value) n <<= 1;
  return n;
}

function normalizeChunking({
  minChunkBytes = 64 * 1024,
  averageChunkBytes = 256 * 1024,
  maxChunkBytes = 1024 * 1024,
} = {}) {
  const min = Number(minChunkBytes);
  const average = Number(averageChunkBytes);
  const max = Number(maxChunkBytes);
  if (
    !Number.isInteger(min) ||
    !Number.isInteger(average) ||
    !Number.isInteger(max) ||
    min <= 0 ||
    average < min ||
    max < average
  ) {
    throw new Error('Invalid chunk-size bounds');
  }
  return {
    minChunkBytes: min,
    averageChunkBytes: average,
    maxChunkBytes: max,
    mask: nearestPowerOfTwo(average) - 1,
  };
}

export function contentDefinedChunks(buffer, options = {}) {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);
  const {
    minChunkBytes,
    maxChunkBytes,
    mask,
  } = normalizeChunking(options);

  if (!buffer.length) return [Buffer.alloc(0)];

  const out = [];
  let start = 0;
  let hash = 0;

  for (let i = 0; i < buffer.length; i += 1) {
    hash = (((hash << 1) >>> 0) + gearValue(buffer[i])) >>> 0;
    const size = i - start + 1;
    const boundary =
      size >= minChunkBytes &&
      ((hash & mask) === 0 || size >= maxChunkBytes);
    if (!boundary) continue;

    out.push(buffer.subarray(start, i + 1));
    start = i + 1;
    hash = 0;
  }

  if (start < buffer.length) out.push(buffer.subarray(start));
  return out;
}

async function writeAll(fileHandle, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const { bytesWritten } = await fileHandle.write(
      bytes,
      offset,
      bytes.length - offset,
      null
    );
    if (!bytesWritten) throw new Error('lineage_large_object_write_stalled');
    offset += bytesWritten;
  }
}

export class LargeObjectStore {
  constructor(lineageDir) {
    this.lineageDir = resolve(lineageDir);
    this.chunkDir = join(this.lineageDir, 'chunks');
    this.manifestDir = join(this.lineageDir, 'large-objects');
  }

  async init() {
    await Promise.all([
      mkdir(this.chunkDir, { recursive: true }),
      mkdir(this.manifestDir, { recursive: true }),
    ]);
  }

  chunkPath(id) {
    return join(this.chunkDir, id.slice(0, 2), id.slice(2));
  }

  manifestPath(id) {
    return join(this.manifestDir, id.slice(0, 2), `${id.slice(2)}.json`);
  }

  async hasChunk(id) {
    try {
      const path = this.chunkPath(id);
      const s = await stat(path);
      if (!s.isFile()) return false;
      const bytes = await readFile(path);
      return sha256(bytes) === id;
    } catch {
      return false;
    }
  }

  async getChunk(id) {
    const bytes = await readFile(this.chunkPath(id));
    const actual = sha256(bytes);
    if (actual !== id) {
      throw new Error(`Chunk digest mismatch: expected ${id}, got ${actual}`);
    }
    return bytes;
  }

  async putChunk(bytes) {
    if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
    const id = sha256(bytes);
    const path = this.chunkPath(id);
    await mkdir(dirname(path), { recursive: true });
    const reused = await this.hasChunk(id);
    if (!reused) await writeFile(path, bytes);
    return { id, bytes: bytes.length, reused };
  }

  async hasManifest(id) {
    try {
      await this.readManifest(id);
      return true;
    } catch {
      return false;
    }
  }

  async putManifest(manifest, { expectedId = null } = {}) {
    await this.init();
    if (!manifest || manifest.schema !== SCHEMA) {
      throw new Error('Unsupported large-object manifest schema');
    }
    if (!Array.isArray(manifest.chunks)) {
      throw new Error('Large-object manifest chunks are required');
    }
    for (const chunk of manifest.chunks) {
      if (!/^[a-f0-9]{64}$/.test(String(chunk?.id || ''))) {
        throw new Error('Large-object manifest contains invalid chunk id');
      }
      if (!Number.isInteger(Number(chunk?.bytes)) || Number(chunk.bytes) < 0) {
        throw new Error('Large-object manifest contains invalid chunk size');
      }
    }

    const encoded = Buffer.from(JSON.stringify(manifest));
    const id = sha256(encoded);
    if (expectedId && id !== expectedId) {
      const error = new Error(
        `Large-object manifest digest mismatch: expected ${expectedId}, got ${id}`
      );
      error.code = 'LARGE_OBJECT_MANIFEST_DIGEST_MISMATCH';
      throw error;
    }

    const path = this.manifestPath(id);
    await mkdir(dirname(path), { recursive: true });
    const reused = await this.hasManifest(id);
    if (!reused) {
      await writeFile(path, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    }
    return {
      id,
      reused,
      bytes: manifest.bytes,
      chunk_count: manifest.chunks.length,
    };
  }

  async putBuffer(buffer, {
    mediaType = 'application/octet-stream',
    logicalName = null,
    chunking = {},
  } = {}) {
    await this.init();
    if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);

    const normalized = normalizeChunking(chunking);
    const chunks = [];
    let reusedChunks = 0;

    for (const bytes of contentDefinedChunks(buffer, normalized)) {
      const chunk = await this.putChunk(bytes);
      if (chunk.reused) reusedChunks += 1;
      chunks.push({ id: chunk.id, bytes: chunk.bytes });
    }

    const manifest = {
      schema: SCHEMA,
      logical_name: logicalName,
      media_type: mediaType,
      bytes: buffer.length,
      content_sha256: sha256(buffer),
      chunking: {
        algorithm: 'evercraft-gear-v1',
        min_chunk_bytes: normalized.minChunkBytes,
        average_chunk_bytes: normalized.averageChunkBytes,
        max_chunk_bytes: normalized.maxChunkBytes,
      },
      chunks,
    };
    const storedManifest = await this.putManifest(manifest);

    return {
      manifest_id: storedManifest.id,
      content_sha256: manifest.content_sha256,
      bytes: buffer.length,
      chunk_count: chunks.length,
      reused_chunks: reusedChunks,
      unique_chunk_bytes: chunks.reduce((sum, chunk) => sum + chunk.bytes, 0),
      ingest_mode: 'buffer',
    };
  }

  async putFile(filePath, {
    mediaType = 'application/octet-stream',
    logicalName = null,
    chunking = {},
  } = {}) {
    await this.init();

    const source = resolve(filePath);
    const sourceStat = await stat(source);
    if (!sourceStat.isFile()) {
      throw new Error(`Large-object source is not a file: ${source}`);
    }

    const normalized = normalizeChunking(chunking);
    const fullHash = createHash('sha256');
    const chunks = [];
    let reusedChunks = 0;
    let totalBytes = 0;
    let rollingHash = 0;
    let pendingParts = [];
    let pendingBytes = 0;

    const flushChunk = async (tail = null) => {
      let bytes;
      if (tail?.length) {
        bytes = pendingParts.length
          ? Buffer.concat([...pendingParts, Buffer.from(tail)], pendingBytes + tail.length)
          : Buffer.from(tail);
      } else {
        bytes = pendingParts.length
          ? Buffer.concat(pendingParts, pendingBytes)
          : Buffer.alloc(0);
      }
      const stored = await this.putChunk(bytes);
      if (stored.reused) reusedChunks += 1;
      chunks.push({ id: stored.id, bytes: stored.bytes });
      pendingParts = [];
      pendingBytes = 0;
      rollingHash = 0;
    };

    for await (const raw of createReadStream(source, {
      highWaterMark: Math.min(normalized.maxChunkBytes, 1024 * 1024),
    })) {
      const data = Buffer.from(raw);
      fullHash.update(data);
      totalBytes += data.length;

      let segmentStart = 0;
      for (let i = 0; i < data.length; i += 1) {
        rollingHash =
          (((rollingHash << 1) >>> 0) + gearValue(data[i])) >>> 0;

        const currentChunkBytes =
          pendingBytes + (i - segmentStart + 1);
        const boundary =
          currentChunkBytes >= normalized.minChunkBytes &&
          (
            (rollingHash & normalized.mask) === 0 ||
            currentChunkBytes >= normalized.maxChunkBytes
          );

        if (!boundary) continue;

        await flushChunk(data.subarray(segmentStart, i + 1));
        segmentStart = i + 1;
      }

      if (segmentStart < data.length) {
        const remainder = Buffer.from(data.subarray(segmentStart));
        pendingParts.push(remainder);
        pendingBytes += remainder.length;
      }
    }

    if (pendingBytes > 0 || totalBytes === 0) {
      await flushChunk();
    }

    const sourceAfter = await stat(source);
    if (
      totalBytes !== sourceStat.size ||
      sourceAfter.size !== sourceStat.size ||
      sourceAfter.mtimeMs !== sourceStat.mtimeMs
    ) {
      throw new Error(
        `Large-object source changed during ingest: expected stable ${sourceStat.size}-byte source`
      );
    }

    const manifest = {
      schema: SCHEMA,
      logical_name: logicalName,
      media_type: mediaType,
      bytes: totalBytes,
      content_sha256: fullHash.digest('hex'),
      chunking: {
        algorithm: 'evercraft-gear-v1',
        min_chunk_bytes: normalized.minChunkBytes,
        average_chunk_bytes: normalized.averageChunkBytes,
        max_chunk_bytes: normalized.maxChunkBytes,
      },
      chunks,
    };
    const storedManifest = await this.putManifest(manifest);

    return {
      manifest_id: storedManifest.id,
      content_sha256: manifest.content_sha256,
      bytes: totalBytes,
      chunk_count: chunks.length,
      reused_chunks: reusedChunks,
      unique_chunk_bytes: chunks.reduce((sum, chunk) => sum + chunk.bytes, 0),
      ingest_mode: 'stream',
    };
  }

  async readManifest(id) {
    const manifest = JSON.parse(await readFile(this.manifestPath(id), 'utf8'));
    if (manifest.schema !== SCHEMA) {
      throw new Error(`Unsupported large-object schema for ${id}`);
    }
    const actual = sha256(Buffer.from(JSON.stringify(manifest)));
    if (actual !== id) {
      throw new Error(
        `Large-object manifest digest mismatch: expected ${id}, got ${actual}`
      );
    }
    return manifest;
  }

  async verify(id) {
    const manifest = await this.readManifest(id);
    const fullHash = createHash('sha256');
    let totalBytes = 0;

    for (const chunk of manifest.chunks) {
      const bytes = await this.getChunk(chunk.id);
      if (bytes.length !== Number(chunk.bytes)) {
        throw new Error(`Chunk size mismatch for ${chunk.id}`);
      }
      fullHash.update(bytes);
      totalBytes += bytes.length;
    }

    const actualContent = fullHash.digest('hex');
    if (actualContent !== manifest.content_sha256) {
      throw new Error(
        `Large-object digest mismatch: expected ${manifest.content_sha256}, got ${actualContent}`
      );
    }
    if (totalBytes !== Number(manifest.bytes)) {
      throw new Error(`Large-object size mismatch for ${id}`);
    }

    return {
      ok: true,
      manifest_id: id,
      content_sha256: actualContent,
      bytes: totalBytes,
      chunk_count: manifest.chunks.length,
      verification_mode: 'stream',
    };
  }

  async writeToFile(id, targetPath) {
    const manifest = await this.readManifest(id);
    const target = resolve(targetPath);
    const temp = `${target}.lineage-${process.pid}-${Date.now()}.tmp`;
    await mkdir(dirname(target), { recursive: true });

    const fullHash = createHash('sha256');
    let totalBytes = 0;
    let handle = null;

    try {
      handle = await open(temp, 'w');

      for (const chunk of manifest.chunks) {
        const bytes = await this.getChunk(chunk.id);
        if (bytes.length !== Number(chunk.bytes)) {
          throw new Error(`Chunk size mismatch for ${chunk.id}`);
        }
        await writeAll(handle, bytes);
        fullHash.update(bytes);
        totalBytes += bytes.length;
      }

      await handle.sync();
      await handle.close();
      handle = null;

      const actualContent = fullHash.digest('hex');
      if (actualContent !== manifest.content_sha256) {
        throw new Error(
          `Large-object digest mismatch: expected ${manifest.content_sha256}, got ${actualContent}`
        );
      }
      if (totalBytes !== Number(manifest.bytes)) {
        throw new Error(`Large-object size mismatch for ${id}`);
      }

      await rename(temp, target);

      return {
        ok: true,
        manifest_id: id,
        content_sha256: actualContent,
        bytes: totalBytes,
        chunk_count: manifest.chunks.length,
        target,
        materialization_mode: 'stream',
      };
    } catch (error) {
      if (handle) {
        try { await handle.close(); } catch {}
      }
      await rm(temp, { force: true });
      throw error;
    }
  }

  async materialize(id) {
    const verified = await this.verify(id);
    const manifest = await this.readManifest(id);
    const chunks = [];
    for (const chunk of manifest.chunks) {
      chunks.push(await this.getChunk(chunk.id));
    }
    const bytes = Buffer.concat(chunks, verified.bytes);
    return bytes;
  }
}

export const largeObject = {
  schema: SCHEMA,
  sha256,
  normalizeChunking,
};
