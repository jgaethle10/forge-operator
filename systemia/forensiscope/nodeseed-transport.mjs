import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateAuthorizedMediaSource, hashFile } from './authorized-source.mjs';

const derivativePromises = new Map();
const sourcePromises = new Map();

function safeId(value) {
  return String(value || 'media')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'media';
}

function runFfmpeg(args) {
  const result = spawnSync('ffmpeg', args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.status !== 0) {
    const reason =
      result.error?.message ||
      String(result.stderr || result.stdout || '').trim() ||
      'ffmpeg failed';
    throw new Error(`ForensiScope shard transport failed: ${reason.slice(-1200)}`);
  }
}

async function validatedSource(raw, rootDir) {
  const sourcePath = path.resolve(String(raw?.source?.path || ''));
  const key = `${sourcePath}:${raw?.source?.sha256 || ''}`;
  if (!sourcePromises.has(key)) {
    sourcePromises.set(
      key,
      Promise.resolve(
        validateAuthorizedMediaSource(raw, { rootDir })
      )
    );
  }
  return sourcePromises.get(key);
}

async function prepareDerivative(raw, rootDir) {
  const source = await validatedSource(raw, rootDir);
  const originalStart = Number(raw.start_seconds || 0);
  const duration = Number(raw.duration_seconds || 0);
  if (!Number.isFinite(originalStart) || originalStart < 0) {
    throw new Error('ForensiScope transport requires a valid shard start.');
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('ForensiScope transport requires a positive shard duration.');
  }

  const sourceHashBefore = source.sha256;
  const key = [
    sourceHashBefore,
    originalStart.toFixed(3),
    duration.toFixed(3)
  ].join(':');

  if (!derivativePromises.has(key)) {
    derivativePromises.set(key, (async () => {
      const hashPrefix = sourceHashBefore.replace(/^sha256:/, '').slice(0, 16);
      const parent = safeId(raw.parent_key || raw.job_id || 'media');
      const shardIndex = Number(raw.shard_index || 0);
      const dir = path.resolve(
        rootDir,
        'artifacts/forensiscope-transport',
        hashPrefix,
        parent
      );
      fs.mkdirSync(dir, { recursive: true });

      const target = path.join(
        dir,
        `shard-${String(shardIndex).padStart(5, '0')}.mkv`
      );

      if (!fs.existsSync(target) || fs.statSync(target).size === 0) {
        runFfmpeg([
          '-v', 'error',
          '-ss', String(originalStart),
          '-t', String(duration),
          '-i', source.path,
          '-map', '0:v:0?',
          '-map', '0:a:0?',
          '-c:v', 'ffv1',
          '-level', '3',
          '-c:a', 'pcm_s16le',
          '-y',
          target
        ]);
      }

      const sourceHashAfter = hashFile(source.path);
      if (sourceHashAfter !== sourceHashBefore) {
        throw new Error('Original media changed while preparing a ForensiScope shard.');
      }

      return {
        path: target,
        sha256: hashFile(target),
        size_bytes: fs.statSync(target).size,
        original_sha256: sourceHashBefore,
        original_start_seconds: originalStart,
        duration_seconds: duration,
        derivative_codec: 'ffv1+pcm_s16le',
        derivative_lossless: true
      };
    })());
  }

  return derivativePromises.get(key);
}

export async function prepareRemoteAssignment({
  node,
  assignment,
  leaseOptions,
  stageFileOnNode,
  rootDir
}) {
  const raw = assignment?.item?.raw || {};
  const derivative = await prepareDerivative(raw, rootDir);
  const staged = await stageFileOnNode(
    node,
    derivative.path,
    leaseOptions,
    {
      expectedHash: derivative.sha256,
      extension: '.mkv'
    }
  );

  const prepared = structuredClone(assignment);
  prepared.item.raw.source = {
    ...prepared.item.raw.source,
    path: null,
    sha256: staged.blob_sha256,
    blob_sha256: staged.blob_sha256,
    original_sha256: derivative.original_sha256,
    derivative_kind: 'authorized_time_shard',
    derivative_lossless: true,
    original_path_redacted: true
  };
  prepared.item.raw.timeline_offset_seconds = derivative.original_start_seconds;
  prepared.item.raw.transport_original_start_seconds = derivative.original_start_seconds;
  prepared.item.raw.transport_original_duration_seconds = derivative.duration_seconds;
  prepared.item.raw.start_seconds = 0;
  prepared.item.raw.end_seconds = derivative.duration_seconds;
  prepared.item.raw.duration_seconds = derivative.duration_seconds;
  prepared.item.raw.transport = {
    schema: 'evercraft.forensiscope.shard-transport.v1',
    mode: 'lease_scoped_content_addressed_shard',
    derivative_sha256: staged.blob_sha256,
    original_sha256: derivative.original_sha256,
    derivative_lossless: derivative.derivative_lossless,
    derivative_codec: derivative.derivative_codec
  };

  return prepared;
}
