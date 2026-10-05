import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
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

export function contentDefinedChunks(buffer, {
  minChunkBytes = 64 * 1024,
  averageChunkBytes = 256 * 1024,
  maxChunkBytes = 1024 * 1024
} = {}) {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);
  if (minChunkBytes <= 0 || averageChunkBytes < minChunkBytes || maxChunkBytes < averageChunkBytes) {
    throw new Error('Invalid chunk-size bounds');
  }
  if (!buffer.length) return [Buffer.alloc(0)];

  const mask = nearestPowerOfTwo(averageChunkBytes) - 1;
  const out = [];
  let start = 0;
  let hash = 0;

  for (let i = 0; i < buffer.length; i += 1) {
    hash = (((hash << 1) >>> 0) + gearValue(buffer[i])) >>> 0;
    const size = i - start + 1;
    const boundary = size >= minChunkBytes && ((hash & mask) === 0 || size >= maxChunkBytes);
    if (!boundary) continue;
    out.push(buffer.subarray(start, i + 1));
    start = i + 1;
    hash = 0;
  }

  if (start < buffer.length) out.push(buffer.subarray(start));
  return out;
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
      mkdir(this.manifestDir, { recursive: true })
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
      const s = await stat(this.chunkPath(id));
      return s.isFile();
    } catch {
      return false;
    }
  }

  async putChunk(bytes) {
    if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
    const id = sha256(bytes);
    const path = this.chunkPath(id);
    await mkdir(dirname(path), { recursive: true });
    let reused = false;
    if (await this.hasChunk(id)) {
      reused = true;
    } else {
      await writeFile(path, bytes);
    }
    return { id, bytes: bytes.length, reused };
  }

  async putBuffer(buffer, {
    mediaType = 'application/octet-stream',
    logicalName = null,
    chunking = {}
  } = {}) {
    await this.init();
    if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);

    const chunks = [];
    let reusedChunks = 0;
    for (const bytes of contentDefinedChunks(buffer, chunking)) {
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
        min_chunk_bytes: chunking.minChunkBytes ?? 64 * 1024,
        average_chunk_bytes: chunking.averageChunkBytes ?? 256 * 1024,
        max_chunk_bytes: chunking.maxChunkBytes ?? 1024 * 1024
      },
      chunks
    };
    const encoded = Buffer.from(JSON.stringify(manifest));
    const manifestId = sha256(encoded);
    const path = this.manifestPath(manifestId);
    await mkdir(dirname(path), { recursive: true });
    try { await readFile(path); }
    catch { await writeFile(path, JSON.stringify(manifest, null, 2) + '\n', 'utf8'); }

    return {
      manifest_id: manifestId,
      content_sha256: manifest.content_sha256,
      bytes: buffer.length,
      chunk_count: chunks.length,
      reused_chunks: reusedChunks,
      unique_chunk_bytes: chunks.reduce((sum, chunk) => sum + chunk.bytes, 0)
    };
  }

  async readManifest(id) {
    const manifest = JSON.parse(await readFile(this.manifestPath(id), 'utf8'));
    if (manifest.schema !== SCHEMA) throw new Error(`Unsupported large-object schema for ${id}`);
    return manifest;
  }

  async verify(id) {
    const manifest = await this.readManifest(id);
    const buffers = [];
    for (const chunk of manifest.chunks) {
      const bytes = await readFile(this.chunkPath(chunk.id));
      const actual = sha256(bytes);
      if (actual !== chunk.id) {
        throw new Error(`Chunk digest mismatch: expected ${chunk.id}, got ${actual}`);
      }
      if (bytes.length !== chunk.bytes) {
        throw new Error(`Chunk size mismatch for ${chunk.id}`);
      }
      buffers.push(bytes);
    }
    const materialized = Buffer.concat(buffers);
    const actualContent = sha256(materialized);
    if (actualContent !== manifest.content_sha256) {
      throw new Error(`Large-object digest mismatch: expected ${manifest.content_sha256}, got ${actualContent}`);
    }
    if (materialized.length !== manifest.bytes) {
      throw new Error(`Large-object size mismatch for ${id}`);
    }
    return {
      ok: true,
      manifest_id: id,
      content_sha256: actualContent,
      bytes: materialized.length,
      chunk_count: manifest.chunks.length
    };
  }

  async materialize(id) {
    await this.verify(id);
    const manifest = await this.readManifest(id);
    const chunks = await Promise.all(manifest.chunks.map((chunk) => readFile(this.chunkPath(chunk.id))));
    return Buffer.concat(chunks);
  }
}

export const largeObject = { schema: SCHEMA, sha256 };
