import { createHash } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { BEAST_SCHEMA } from './manifest.mjs';

export const FOOTBALL_SCHEMA = 'evercraft.beast-mode.football.v1';
export const FOOTBALL_MAGIC = Buffer.from('ECFBALL1', 'ascii');

function clean(value) {
  return String(value ?? '').trim();
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object' && !Buffer.isBuffer(value) && !(value instanceof Uint8Array)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function jsonBytes(value) {
  return Buffer.from(JSON.stringify(stable(value)), 'utf8');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function asBuffer(value, label = 'bytes') {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (value instanceof ArrayBuffer) return Buffer.from(new Uint8Array(value));
  throw new Error(`${label}_must_be_binary`);
}

function recordsMap(records) {
  if (records instanceof Map) {
    return new Map([...records.entries()].map(([key, value]) => [clean(key), asBuffer(value, `record_${key}`)]));
  }
  if (records && typeof records === 'object') {
    return new Map(Object.entries(records).map(([key, value]) => [clean(key), asBuffer(value, `record_${key}`)]));
  }
  throw new Error('football_records_required');
}

export function sealFootball(manifest, records, { compressionLevel = 9 } = {}) {
  if (manifest?.schema !== BEAST_SCHEMA) throw new Error('beast_manifest_schema_invalid');
  if (!Array.isArray(manifest.artifacts) || !manifest.artifacts.length) throw new Error('football_manifest_artifacts_required');

  const byId = recordsMap(records);
  const rawParts = [];
  const entries = [];
  let offset = 0;

  for (const artifact of manifest.artifacts) {
    const artifactId = clean(artifact.artifact_id);
    const bytes = byId.get(artifactId);
    if (!bytes) throw new Error(`football_record_missing:${artifactId}`);

    const actualSha = sha256(bytes);
    if (actualSha !== clean(artifact.sha256).toLowerCase()) {
      throw new Error(`football_source_sha256_mismatch:${artifactId}`);
    }
    if (bytes.byteLength !== Number(artifact.byte_count)) {
      throw new Error(`football_source_byte_count_mismatch:${artifactId}`);
    }

    entries.push({
      artifact_id: artifactId,
      filename: clean(artifact.filename),
      mime_type: clean(artifact.mime_type),
      offset,
      byte_count: bytes.byteLength,
      sha256: actualSha
    });
    rawParts.push(bytes);
    offset += bytes.byteLength;
  }

  const rawPayload = Buffer.concat(rawParts);
  const compressedPayload = deflateRawSync(rawPayload, { level: compressionLevel });
  const manifestSha256 = sha256(jsonBytes(manifest));

  const identity = {
    schema: FOOTBALL_SCHEMA,
    cargo_id: clean(manifest.cargo_id),
    manifest_sha256: manifestSha256,
    payload_sha256: sha256(rawPayload),
    compressed_sha256: sha256(compressedPayload),
    unpacked_byte_count: rawPayload.byteLength,
    compressed_byte_count: compressedPayload.byteLength,
    entries: entries.map((entry) => ({
      artifact_id: entry.artifact_id,
      offset: entry.offset,
      byte_count: entry.byte_count,
      sha256: entry.sha256
    }))
  };

  const header = {
    ...identity,
    football_id: `football:${sha256(jsonBytes(identity))}`,
    codec: 'deflate-raw',
    manifest,
    entries
  };

  const headerBytes = Buffer.from(JSON.stringify(header), 'utf8');
  if (headerBytes.byteLength > 0xffffffff) throw new Error('football_header_too_large');

  const headerLength = Buffer.alloc(4);
  headerLength.writeUInt32BE(headerBytes.byteLength, 0);

  return {
    schema: FOOTBALL_SCHEMA,
    football_id: header.football_id,
    cargo_id: clean(manifest.cargo_id),
    buffer: Buffer.concat([FOOTBALL_MAGIC, headerLength, headerBytes, compressedPayload]),
    header
  };
}

export function openFootball(input) {
  const football = asBuffer(input, 'football');
  if (football.byteLength < FOOTBALL_MAGIC.byteLength + 4) throw new Error('football_truncated');
  if (!football.subarray(0, FOOTBALL_MAGIC.byteLength).equals(FOOTBALL_MAGIC)) {
    throw new Error('football_magic_invalid');
  }

  const headerLength = football.readUInt32BE(FOOTBALL_MAGIC.byteLength);
  const headerStart = FOOTBALL_MAGIC.byteLength + 4;
  const headerEnd = headerStart + headerLength;
  if (headerEnd > football.byteLength) throw new Error('football_header_truncated');

  let header;
  try {
    header = JSON.parse(football.subarray(headerStart, headerEnd).toString('utf8'));
  } catch {
    throw new Error('football_header_invalid_json');
  }

  if (header?.schema !== FOOTBALL_SCHEMA) throw new Error('football_schema_invalid');
  if (header?.manifest?.schema !== BEAST_SCHEMA) throw new Error('football_manifest_schema_invalid');
  if (clean(header.codec) !== 'deflate-raw') throw new Error('football_codec_unsupported');
  if (clean(header.cargo_id) !== clean(header.manifest.cargo_id)) throw new Error('football_manifest_cargo_id_mismatch');

  const compressedPayload = football.subarray(headerEnd);
  if (compressedPayload.byteLength !== Number(header.compressed_byte_count)) {
    throw new Error('football_compressed_byte_count_mismatch');
  }
  if (sha256(compressedPayload) !== clean(header.compressed_sha256).toLowerCase()) {
    throw new Error('football_compressed_sha256_mismatch');
  }

  let rawPayload;
  try {
    rawPayload = inflateRawSync(compressedPayload);
  } catch {
    throw new Error('football_payload_decompression_failed');
  }

  if (rawPayload.byteLength !== Number(header.unpacked_byte_count)) {
    throw new Error('football_unpacked_byte_count_mismatch');
  }
  if (sha256(rawPayload) !== clean(header.payload_sha256).toLowerCase()) {
    throw new Error('football_payload_sha256_mismatch');
  }
  if (sha256(jsonBytes(header.manifest)) !== clean(header.manifest_sha256).toLowerCase()) {
    throw new Error('football_manifest_sha256_mismatch');
  }

  const entries = Array.isArray(header.entries) ? header.entries : [];
  if (entries.length !== header.manifest.artifacts.length) {
    throw new Error('football_entry_count_mismatch');
  }

  const artifacts = new Map();
  const seen = new Set();
  let expectedOffset = 0;
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    const artifactId = clean(entry.artifact_id);
    if (!artifactId) throw new Error('football_entry_artifact_id_required');
    if (seen.has(artifactId)) throw new Error(`football_entry_duplicate:${artifactId}`);
    const offset = Number(entry.offset);
    const byteCount = Number(entry.byte_count);
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(byteCount) || byteCount < 0) {
      throw new Error(`football_entry_bounds_invalid:${artifactId}`);
    }
    if (offset !== expectedOffset) throw new Error(`football_entry_non_contiguous:${artifactId}`);
    const end = offset + byteCount;
    if (end > rawPayload.byteLength) throw new Error(`football_entry_truncated:${artifactId}`);

    const bytes = Buffer.from(rawPayload.subarray(offset, end));
    if (sha256(bytes) !== clean(entry.sha256).toLowerCase()) {
      throw new Error(`football_artifact_sha256_mismatch:${artifactId}`);
    }

    const manifestArtifact = header.manifest.artifacts[index];
    if (!manifestArtifact || clean(manifestArtifact.artifact_id) !== artifactId) {
      throw new Error(`football_manifest_artifact_order_mismatch:${artifactId}`);
    }
    if (clean(manifestArtifact.sha256).toLowerCase() !== clean(entry.sha256).toLowerCase()) {
      throw new Error(`football_manifest_artifact_sha256_mismatch:${artifactId}`);
    }
    if (Number(manifestArtifact.byte_count) !== bytes.byteLength) {
      throw new Error(`football_manifest_artifact_byte_count_mismatch:${artifactId}`);
    }

    artifacts.set(artifactId, bytes);
    seen.add(artifactId);
    expectedOffset = end;
  }
  if (expectedOffset !== rawPayload.byteLength) throw new Error('football_payload_coverage_mismatch');

  const identity = {
    schema: FOOTBALL_SCHEMA,
    cargo_id: clean(header.cargo_id),
    manifest_sha256: clean(header.manifest_sha256),
    payload_sha256: clean(header.payload_sha256),
    compressed_sha256: clean(header.compressed_sha256),
    unpacked_byte_count: Number(header.unpacked_byte_count),
    compressed_byte_count: Number(header.compressed_byte_count),
    entries: entries.map((entry) => ({
      artifact_id: clean(entry.artifact_id),
      offset: Number(entry.offset),
      byte_count: Number(entry.byte_count),
      sha256: clean(entry.sha256)
    }))
  };
  const expectedFootballId = `football:${sha256(jsonBytes(identity))}`;
  if (clean(header.football_id) !== expectedFootballId) throw new Error('football_id_mismatch');

  return {
    schema: FOOTBALL_SCHEMA,
    football_id: expectedFootballId,
    cargo_id: clean(header.cargo_id),
    manifest: header.manifest,
    artifacts,
    header
  };
}

export function splitFootball(input, maxPartBytes = 8 * 1024 * 1024) {
  const football = asBuffer(input, 'football');
  const size = Number(maxPartBytes);
  if (!Number.isSafeInteger(size) || size < 1024) throw new Error('football_part_size_invalid');
  const total = Math.ceil(football.byteLength / size);
  const footballSha256 = sha256(football);

  return Array.from({ length: total }, (_, index) => {
    const start = index * size;
    const bytes = Buffer.from(football.subarray(start, Math.min(football.byteLength, start + size)));
    return {
      schema: 'evercraft.beast-mode.football-part.v1',
      sequence: index,
      total,
      football_sha256: footballSha256,
      part_sha256: sha256(bytes),
      bytes
    };
  });
}

export function joinFootball(parts) {
  const rows = [...(parts || [])].sort((a, b) => Number(a.sequence) - Number(b.sequence));
  if (!rows.length) throw new Error('football_parts_required');
  const total = Number(rows[0].total);
  const footballSha256 = clean(rows[0].football_sha256).toLowerCase();
  if (!Number.isSafeInteger(total) || total !== rows.length) throw new Error('football_parts_incomplete');

  rows.forEach((part, index) => {
    if (Number(part.sequence) !== index || Number(part.total) !== total) throw new Error('football_part_sequence_invalid');
    if (clean(part.football_sha256).toLowerCase() !== footballSha256) throw new Error('football_part_set_mismatch');
    const bytes = asBuffer(part.bytes, `football_part_${index}`);
    if (sha256(bytes) !== clean(part.part_sha256).toLowerCase()) throw new Error(`football_part_sha256_mismatch:${index}`);
  });

  const football = Buffer.concat(rows.map((part) => asBuffer(part.bytes)));
  if (sha256(football) !== footballSha256) throw new Error('football_joined_sha256_mismatch');
  return football;
}
