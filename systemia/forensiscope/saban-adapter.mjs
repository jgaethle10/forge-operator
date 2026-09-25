import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateAuthorizedMediaSource, hashFile } from './authorized-source.mjs';

function safeId(value) {
  return String(value || 'item')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

function run(command, args, { maxBuffer = 16 * 1024 * 1024 } = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || '')
  };
}

function requireMediaTools() {
  const ffmpeg = run('ffmpeg', ['-version'], { maxBuffer: 1024 * 1024 });
  const ffprobe = run('ffprobe', ['-version'], { maxBuffer: 1024 * 1024 });
  if (!ffmpeg.ok || !ffprobe.ok) {
    throw new Error('ForensiScope private executor requires ffmpeg and ffprobe.');
  }
}

function shardBounds(raw = {}) {
  const start = Number(raw.start_seconds ?? 0);
  const end = Number(raw.end_seconds ?? raw.duration_seconds ?? 0);
  const duration = Number(raw.duration_seconds ?? Math.max(0, end - start));
  if (!Number.isFinite(start) || !Number.isFinite(duration) || duration <= 0) {
    throw new Error('ForensiScope shard requires valid start_seconds and duration_seconds.');
  }
  return { start, duration, end: start + duration };
}

function artifactDir(rootDir, raw) {
  const parent = safeId(raw.parent_key || raw.job_id || 'media');
  const shard = Number(raw.shard_index ?? 0);
  const dir = path.resolve(
    rootDir,
    'artifacts/forensiscope',
    parent,
    `shard-${String(shard).padStart(5, '0')}`
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function probeShard(sourcePath, bounds) {
  const result = run('ffprobe', [
    '-v', 'error',
    '-read_intervals', `${bounds.start}%+${bounds.duration}`,
    '-show_entries', 'format=duration:stream=index,codec_type,codec_name,duration,width,height,sample_rate,channels',
    '-of', 'json',
    sourcePath
  ]);
  if (!result.ok) throw new Error(`ffprobe failed: ${result.stderr.trim().slice(-500)}`);
  return JSON.parse(result.stdout || '{}');
}

function keyframeTimeline(sourcePath, bounds) {
  const result = run('ffprobe', [
    '-v', 'error',
    '-read_intervals', `${bounds.start}%+${bounds.duration}`,
    '-select_streams', 'v:0',
    '-show_frames',
    '-show_entries', 'frame=best_effort_timestamp_time,key_frame,pict_type',
    '-of', 'json',
    sourcePath
  ]);
  if (!result.ok) throw new Error(`timeline ffprobe failed: ${result.stderr.trim().slice(-500)}`);
  const frames = JSON.parse(result.stdout || '{}').frames || [];
  return frames
    .filter((frame) => Number(frame.key_frame) === 1)
    .slice(0, 500)
    .map((frame) => ({
      timestamp_seconds: Number(frame.best_effort_timestamp_time),
      pict_type: frame.pict_type || null
    }))
    .filter((frame) => Number.isFinite(frame.timestamp_seconds));
}

function frameHashes(sourcePath, bounds, sampleSeconds = 2) {
  const result = run('ffmpeg', [
    '-v', 'error',
    '-ss', String(bounds.start),
    '-t', String(bounds.duration),
    '-i', sourcePath,
    '-map', '0:v:0',
    '-vf', `fps=1/${sampleSeconds}`,
    '-f', 'framemd5',
    'pipe:1'
  ]);
  if (!result.ok) throw new Error(`frame hashing failed: ${result.stderr.trim().slice(-500)}`);

  const hashes = [];
  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(',').map((value) => value.trim());
    const digest = parts[parts.length - 1];
    if (!/^[a-f0-9]{32,128}$/i.test(digest || '')) continue;
    hashes.push({
      sample_index: hashes.length,
      timestamp_seconds: bounds.start + hashes.length * sampleSeconds,
      hash: digest.toLowerCase()
    });
  }
  return hashes;
}

function extractAudio(sourcePath, bounds, outFile) {
  const result = run('ffmpeg', [
    '-v', 'error',
    '-ss', String(bounds.start),
    '-t', String(bounds.duration),
    '-i', sourcePath,
    '-map', '0:a:0?',
    '-ac', '1',
    '-ar', '16000',
    '-c:a', 'pcm_s16le',
    '-y',
    outFile
  ]);
  if (!result.ok) {
    return {
      state: 'not_extracted',
      reason: result.stderr.trim().slice(-500) || 'audio extraction failed'
    };
  }
  if (!fs.existsSync(outFile) || fs.statSync(outFile).size === 0) {
    return {
      state: 'no_audio_stream',
      reason: 'No audio stream was available in this shard.'
    };
  }
  return {
    state: 'prepared_for_transcription',
    path: outFile,
    sha256: hashFile(outFile),
    size_bytes: fs.statSync(outFile).size,
    transcript_state: 'transcription_engine_not_bound'
  };
}

function baseReceipt(assignment, source, bounds) {
  return {
    schema: 'evercraft.forensiscope.shard-result.v1',
    status: 'completed',
    agent_id: assignment.agent_id,
    role: assignment.role,
    work: assignment.work,
    shard: {
      parent_key: assignment.item?.raw?.parent_key || null,
      shard_index: Number(assignment.item?.raw?.shard_index ?? 0),
      start_seconds: bounds.start,
      end_seconds: bounds.end,
      duration_seconds: bounds.duration
    },
    source: {
      sha256: source.sha256,
      size_bytes: source.size_bytes,
      extension: source.extension
    }
  };
}

export async function runAssignment({ assignment, rootDir }) {
  requireMediaTools();
  const raw = assignment.item?.raw || {};
  const source = validateAuthorizedMediaSource(raw, { rootDir });
  const bounds = shardBounds(raw);
  const receipt = baseReceipt(assignment, source, bounds);
  const outDir = artifactDir(rootDir, raw);

  switch (assignment.role) {
    case 'media_probe_worker':
      return {
        ...receipt,
        data: {
          probe: probeShard(source.path, bounds)
        }
      };

    case 'timeline_worker':
      return {
        ...receipt,
        data: {
          keyframes: keyframeTimeline(source.path, bounds)
        }
      };

    case 'frame_hash_worker':
      return {
        ...receipt,
        data: {
          sample_interval_seconds: 2,
          frame_hashes: frameHashes(source.path, bounds, 2)
        }
      };

    case 'audio_extract_worker': {
      const audioPath = path.join(outDir, 'audio-16khz-mono.wav');
      return {
        ...receipt,
        data: {
          audio: extractAudio(source.path, bounds, audioPath)
        }
      };
    }

    case 'provenance_guard': {
      const observed = hashFile(source.path);
      return {
        ...receipt,
        data: {
          source_hash_before: source.sha256,
          source_hash_after: observed,
          source_unchanged: observed === source.sha256,
          source_write_performed: false
        }
      };
    }

    default:
      return {
        ...receipt,
        status: 'not_executed',
        data: {
          reason: `Unsupported ForensiScope role: ${assignment.role}`
        }
      };
  }
}

function dedupeTimeline(entries) {
  const seen = new Set();
  return [...entries]
    .sort((a, b) => a.timestamp_seconds - b.timestamp_seconds)
    .filter((entry) => {
      const key = Math.round(entry.timestamp_seconds * 20);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export async function reconcile({ results, contract }) {
  const frameOccurrences = new Map();
  const timeline = [];
  const audio = [];
  const provenance = [];
  const workerStatuses = {};

  for (const result of results || []) {
    const role = result?.role || 'unknown';
    workerStatuses[role] = (workerStatuses[role] || 0) + 1;

    for (const frame of result?.data?.frame_hashes || []) {
      if (!frameOccurrences.has(frame.hash)) frameOccurrences.set(frame.hash, []);
      frameOccurrences.get(frame.hash).push({
        timestamp_seconds: frame.timestamp_seconds,
        shard_index: result.shard?.shard_index ?? null
      });
    }

    for (const frame of result?.data?.keyframes || []) timeline.push(frame);
    if (result?.data?.audio) {
      audio.push({
        shard_index: result.shard?.shard_index ?? null,
        ...result.data.audio
      });
    }
    if (result?.role === 'provenance_guard') provenance.push(result.data);
  }

  const overlap = Number(contract?.partitioner?.overlap_seconds || 0);
  const duplicates = [];
  for (const [hash, occurrences] of frameOccurrences.entries()) {
    if (occurrences.length < 2) continue;
    const sorted = [...occurrences].sort((a, b) => a.timestamp_seconds - b.timestamp_seconds);
    const span = sorted[sorted.length - 1].timestamp_seconds - sorted[0].timestamp_seconds;
    duplicates.push({
      hash,
      occurrences: sorted,
      classification: span > Math.max(2, overlap + 1) ? 'repeated_content' : 'boundary_overlap'
    });
  }

  const provenanceOk = provenance.every((entry) => entry?.source_unchanged === true);
  const repeatedContent = duplicates.filter((entry) => entry.classification === 'repeated_content');

  return {
    schema: 'evercraft.forensiscope.reconciliation.v1',
    status: provenanceOk ? 'reconciled' : 'reconciliation_failed',
    source_integrity_preserved: provenanceOk,
    worker_statuses: workerStatuses,
    timeline: dedupeTimeline(timeline),
    duplicate_review: {
      duplicate_hash_groups: duplicates.length,
      repeated_content_groups: repeatedContent.length,
      groups: duplicates.slice(0, 200)
    },
    audio_assets: audio,
    transcription: {
      state: audio.some((entry) => entry.state === 'prepared_for_transcription')
        ? 'audio_prepared_engine_not_bound'
        : 'not_available'
    }
  };
}
