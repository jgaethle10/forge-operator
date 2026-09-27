import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { probeTranscriptionEngine, transcribePreparedAudio } from './transcription-engine.mjs';

const DEFAULT_CHUNK_SECONDS = 300;
const DEFAULT_OVERLAP_SECONDS = 2;
const MAX_CAPTURE_BYTES = 8 * 1024 * 1024;

function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function run(command, args, { maxBuffer = MAX_CAPTURE_BYTES } = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
    error: result.error?.message || null
  };
}

function requireExecutable(name) {
  const result = run(name, ['-version'], { maxBuffer: 1024 * 1024 });
  if (!result.ok) {
    throw new Error(`${name} is required: ${result.error || result.stderr.trim().slice(-500) || 'not available'}`);
  }
}

function durationSeconds(filePath) {
  const result = run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath
  ]);
  if (!result.ok) {
    throw new Error(`ffprobe failed for ${filePath}: ${result.stderr.trim().slice(-700)}`);
  }
  const duration = finite(result.stdout.trim(), null);
  if (duration === null || duration <= 0) {
    throw new Error(`Could not determine positive media duration for ${filePath}.`);
  }
  return duration;
}

function sha256File(filePath) {
  const fd = fs.openSync(filePath, 'r');
  const hash = crypto.createHash('sha256');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function planMediaChunks(duration, {
  chunkSeconds = DEFAULT_CHUNK_SECONDS,
  overlapSeconds = DEFAULT_OVERLAP_SECONDS
} = {}) {
  const total = finite(duration, null);
  const chunk = finite(chunkSeconds, null);
  const overlap = finite(overlapSeconds, null);

  if (total === null || total <= 0) throw new Error('duration must be positive.');
  if (chunk === null || chunk <= 0) throw new Error('chunkSeconds must be positive.');
  if (overlap === null || overlap < 0 || overlap >= chunk) {
    throw new Error('overlapSeconds must be >= 0 and smaller than chunkSeconds.');
  }

  const planned = [];
  const step = chunk - overlap;
  let start = 0;
  let index = 0;

  while (start < total - 0.001) {
    const durationSeconds = Math.min(chunk, total - start);
    planned.push({
      index,
      start_seconds: Number(start.toFixed(3)),
      duration_seconds: Number(durationSeconds.toFixed(3)),
      end_seconds: Number((start + durationSeconds).toFixed(3))
    });
    if (start + durationSeconds >= total - 0.001) break;
    start += step;
    index += 1;
  }

  return planned;
}

export function reconcileOverlapSegments(segments, overlapSeconds = DEFAULT_OVERLAP_SECONDS) {
  const ordered = [...segments].sort((a, b) =>
    Number(a.meeting_start_seconds ?? a.start_seconds ?? 0) -
      Number(b.meeting_start_seconds ?? b.start_seconds ?? 0)
  );
  const accepted = [];
  const recentByText = new Map();
  const tolerance = Math.max(1.5, Number(overlapSeconds || 0) + 0.75);

  for (const segment of ordered) {
    const textKey = normalizeText(segment.text);
    const start = Number(segment.meeting_start_seconds ?? segment.start_seconds ?? 0);
    if (!textKey) continue;

    const prior = recentByText.get(textKey);
    if (prior && Math.abs(start - prior.start) <= tolerance) continue;

    accepted.push(segment);
    recentByText.set(textKey, { start });
  }

  return accepted;
}

function extractChunkAudio(sourcePath, chunk, outPath) {
  const result = run('ffmpeg', [
    '-v', 'error',
    '-ss', String(chunk.start_seconds),
    '-t', String(chunk.duration_seconds),
    '-i', sourcePath,
    '-map', '0:a:0?',
    '-ac', '1',
    '-ar', '16000',
    '-c:a', 'pcm_s16le',
    '-y',
    outPath
  ], { maxBuffer: 16 * 1024 * 1024 });

  if (!result.ok) {
    throw new Error(`ffmpeg audio extraction failed: ${result.stderr.trim().slice(-700)}`);
  }
  if (!fs.existsSync(outPath) || fs.statSync(outPath).size === 0) {
    throw new Error('No usable audio stream was extracted.');
  }
}

function sourceReceipt(filePath, duration, meetingOffset) {
  const stat = fs.statSync(filePath);
  return {
    source_file: path.basename(filePath),
    source_path: path.resolve(filePath),
    source_sha256: sha256File(filePath),
    size_bytes: stat.size,
    duration_seconds: duration,
    meeting_offset_seconds: meetingOffset
  };
}

export function parseBatchArgs(args) {
  const files = [];
  const options = {
    out: null,
    chunkSeconds: DEFAULT_CHUNK_SECONDS,
    overlapSeconds: DEFAULT_OVERLAP_SECONDS,
    keepAudio: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--out') {
      options.out = args[++index] || null;
    } else if (arg === '--chunk-seconds') {
      options.chunkSeconds = finite(args[++index], DEFAULT_CHUNK_SECONDS);
    } else if (arg === '--overlap-seconds') {
      options.overlapSeconds = finite(args[++index], DEFAULT_OVERLAP_SECONDS);
    } else if (arg === '--keep-audio') {
      options.keepAudio = true;
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      files.push(arg);
    }
  }

  if (!files.length) {
    throw new Error('Provide one or more media files.');
  }
  return { files, options };
}

export function processMeetingBatch({
  files,
  outPath = null,
  chunkSeconds = DEFAULT_CHUNK_SECONDS,
  overlapSeconds = DEFAULT_OVERLAP_SECONDS,
  keepAudio = false,
  env = process.env
}) {
  requireExecutable('ffmpeg');
  requireExecutable('ffprobe');

  const engine = probeTranscriptionEngine({ env });
  if (engine.state !== 'configured' || engine.probe_state === 'unavailable') {
    throw new Error(
      `ForensiScope transcription engine is not ready: ${engine.probe_reason || engine.reason || engine.state}`
    );
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forensiscope-batch-'));
  const sources = [];
  const rawSegments = [];
  const chunkReceipts = [];
  let meetingOffset = 0;

  try {
    files.forEach((inputPath, sourceIndex) => {
      const sourcePath = path.resolve(inputPath);
      if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
        throw new Error(`Media file not found: ${sourcePath}`);
      }

      const duration = durationSeconds(sourcePath);
      const source = sourceReceipt(sourcePath, duration, meetingOffset);
      const chunks = planMediaChunks(duration, { chunkSeconds, overlapSeconds });
      sources.push({ ...source, chunk_count: chunks.length });

      for (const chunk of chunks) {
        const audioPath = path.join(
          tempRoot,
          `source-${String(sourceIndex).padStart(3, '0')}-chunk-${String(chunk.index).padStart(4, '0')}.wav`
        );
        extractChunkAudio(sourcePath, chunk, audioPath);

        const transcript = transcribePreparedAudio({
          audioPath,
          bounds: {
            start: chunk.start_seconds,
            duration: chunk.duration_seconds,
            end: chunk.end_seconds,
            offset: 0
          },
          env
        });

        chunkReceipts.push({
          source_index: sourceIndex,
          source_file: source.source_file,
          chunk_index: chunk.index,
          start_seconds: chunk.start_seconds,
          end_seconds: chunk.end_seconds,
          audio_sha256: sha256File(audioPath),
          audio_size_bytes: fs.statSync(audioPath).size,
          transcription_state: transcript.state,
          engine_id: transcript.engine_id || null,
          segment_count: transcript.segment_count ?? transcript.segments?.length ?? 0,
          ...(transcript.reason ? { reason: transcript.reason } : {})
        });

        if (transcript.state !== 'transcribed') {
          throw new Error(
            `Transcription failed for ${source.source_file} chunk ${chunk.index}: ${transcript.reason || transcript.state}`
          );
        }

        for (const segment of transcript.segments || []) {
          rawSegments.push({
            source_index: sourceIndex,
            source_file: source.source_file,
            source_sha256: source.source_sha256,
            source_start_seconds: segment.start_seconds,
            source_end_seconds: segment.end_seconds,
            meeting_start_seconds: meetingOffset + segment.start_seconds,
            meeting_end_seconds: meetingOffset + segment.end_seconds,
            text: segment.text,
            confidence: segment.confidence ?? null,
            speaker: segment.speaker ?? null,
            engine_id: transcript.engine_id || null,
            chunk_index: chunk.index
          });
        }
      }

      meetingOffset += duration;
    });

    const segments = reconcileOverlapSegments(rawSegments, overlapSeconds);
    const record = {
      schema: 'evercraft.forensiscope.meeting-transcript.v1',
      status: 'completed',
      generated_at: new Date().toISOString(),
      engine: {
        state: engine.state,
        engine_id: engine.engine_id || null,
        probe_state: engine.probe_state || null
      },
      source_count: sources.length,
      total_duration_seconds: Number(meetingOffset.toFixed(3)),
      chunk_seconds: chunkSeconds,
      overlap_seconds: overlapSeconds,
      sources,
      chunks: chunkReceipts,
      segment_count: segments.length,
      segments,
      transcript_text: segments.map((segment) => segment.text).join(' ').trim()
    };

    if (outPath) {
      const resolved = path.resolve(outPath);
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, `${JSON.stringify(record, null, 2)}\n`);
    }

    if (keepAudio) {
      record.audio_workdir = tempRoot;
    }
    return record;
  } finally {
    if (!keepAudio) fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function main() {
  const { files, options } = parseBatchArgs(process.argv.slice(2));
  const result = processMeetingBatch({
    files,
    outPath: options.out,
    chunkSeconds: options.chunkSeconds,
    overlapSeconds: options.overlapSeconds,
    keepAudio: options.keepAudio
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
