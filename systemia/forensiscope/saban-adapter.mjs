import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateAuthorizedMediaSource, hashFile } from './authorized-source.mjs';
import { transcribePreparedAudio } from './transcription-engine.mjs';
import { buildEvidenceGraph } from './evidence-graph.mjs';
import { attachSemanticIndex } from './semantic-index.mjs';

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
  const offset = Number(raw.timeline_offset_seconds ?? 0);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    !Number.isFinite(offset)
  ) {
    throw new Error('ForensiScope shard requires valid timing metadata.');
  }
  return {
    start,
    duration,
    end: start + duration,
    offset,
    absolute_start: offset + start,
    absolute_end: offset + start + duration
  };
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
      timestamp_seconds: Number(frame.best_effort_timestamp_time) + bounds.offset,
      pict_type: frame.pict_type || null
    }))
    .filter((frame) => Number.isFinite(frame.timestamp_seconds));
}

function sceneBoundaries(sourcePath, bounds, threshold = 0.25) {
  const result = spawnSync('ffmpeg', [
    '-hide_banner',
    '-loglevel', 'info',
    '-ss', String(bounds.start),
    '-t', String(bounds.duration),
    '-i', sourcePath,
    '-map', '0:v:0',
    '-vf', `select='gt(scene,${threshold})',showinfo`,
    '-an',
    '-f', 'null',
    '-'
  ], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  });

  if (result.status !== 0) {
    throw new Error(
      `scene-boundary detection failed: ${String(result.stderr || result.stdout || '').trim().slice(-800)}`
    );
  }

  const boundaries = [];
  const seen = new Set();
  const pattern = /pts_time:([0-9]+(?:\.[0-9]+)?)/g;
  const log = String(result.stderr || '');
  for (const match of log.matchAll(pattern)) {
    const local = Number(match[1]);
    if (!Number.isFinite(local)) continue;
    const timestamp = Number((bounds.offset + bounds.start + local).toFixed(3));
    const key = Math.round(timestamp * 20);
    if (seen.has(key)) continue;
    seen.add(key);
    boundaries.push({
      timestamp_seconds: timestamp,
      detector: 'ffmpeg_scene_score',
      threshold
    });
    if (boundaries.length >= 500) break;
  }
  return boundaries;
}

function perceptualFrameSignatures(sourcePath, bounds, sampleSeconds = 2) {
  const result = spawnSync('ffmpeg', [
    '-v', 'error',
    '-ss', String(bounds.start),
    '-t', String(bounds.duration),
    '-i', sourcePath,
    '-map', '0:v:0',
    '-vf', `fps=1/${sampleSeconds},scale=9:8:flags=area,format=rgb24`,
    '-f', 'rawvideo',
    '-pix_fmt', 'rgb24',
    'pipe:1'
  ], {
    encoding: null,
    maxBuffer: 64 * 1024 * 1024
  });

  if (result.status !== 0) {
    throw new Error(
      `perceptual frame hashing failed: ${String(result.stderr || '').trim().slice(-500)}`
    );
  }

  const bytes = Buffer.isBuffer(result.stdout)
    ? result.stdout
    : Buffer.from(result.stdout || []);
  const frameBytes = 9 * 8 * 3;
  const signatures = [];

  for (let offset = 0; offset + frameBytes <= bytes.length; offset += frameBytes) {
    const frame = bytes.subarray(offset, offset + frameBytes);
    let hash = 0n;
    let bit = 0n;
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;

    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 9; x += 1) {
        const pixel = (y * 9 + x) * 3;
        rSum += frame[pixel];
        gSum += frame[pixel + 1];
        bSum += frame[pixel + 2];
      }

      for (let x = 0; x < 8; x += 1) {
        const left = (y * 9 + x) * 3;
        const right = (y * 9 + x + 1) * 3;
        const leftLuma =
          frame[left] * 299 +
          frame[left + 1] * 587 +
          frame[left + 2] * 114;
        const rightLuma =
          frame[right] * 299 +
          frame[right + 1] * 587 +
          frame[right + 2] * 114;
        if (leftLuma > rightLuma) hash |= 1n << bit;
        bit += 1n;
      }
    }

    const pixels = 9 * 8;
    signatures.push({
      sample_index: signatures.length,
      timestamp_seconds:
        bounds.offset + bounds.start + signatures.length * sampleSeconds,
      dhash64: hash.toString(16).padStart(16, '0'),
      mean_rgb: [
        Math.round(rSum / pixels),
        Math.round(gSum / pixels),
        Math.round(bSum / pixels)
      ]
    });
  }

  return signatures;
}

function hammingHex(a, b) {
  let value = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let count = 0;
  while (value) {
    value &= value - 1n;
    count += 1;
  }
  return count;
}

function colorDistance(a = [], b = []) {
  return [0, 1, 2].reduce(
    (sum, index) => sum + Math.abs(Number(a[index] || 0) - Number(b[index] || 0)),
    0
  );
}

function nearDuplicatePairs(signatures, {
  maxHamming = 6,
  maxColorDistance = 42,
  maxPairs = 500
} = {}) {
  const buckets = new Map();
  const pairs = [];
  const seen = new Set();

  for (const signature of signatures) {
    const bands = Array.from(
      { length: 8 },
      (_, index) => signature.dhash64.slice(index * 2, index * 2 + 2)
    );

    const candidates = new Set();
    for (const band of bands) {
      for (const prior of buckets.get(band) || []) candidates.add(prior);
    }

    for (const prior of candidates) {
      const priorKey = [
        prior.shard_index ?? 'x',
        prior.sample_index,
        prior.timestamp_seconds
      ].join(':');
      const signatureKey = [
        signature.shard_index ?? 'x',
        signature.sample_index,
        signature.timestamp_seconds
      ].join(':');
      const pairKey = [priorKey, signatureKey].sort().join('|');
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      const hamming = hammingHex(prior.dhash64, signature.dhash64);
      const color = colorDistance(prior.mean_rgb, signature.mean_rgb);
      if (hamming <= maxHamming && color <= maxColorDistance) {
        pairs.push({
          first_timestamp_seconds: prior.timestamp_seconds,
          second_timestamp_seconds: signature.timestamp_seconds,
          hamming_distance: hamming,
          color_distance: color,
          first_shard_index: prior.shard_index ?? null,
          second_shard_index: signature.shard_index ?? null
        });
        if (pairs.length >= maxPairs) return pairs;
      }
    }

    for (const band of bands) {
      if (!buckets.has(band)) buckets.set(band, []);
      buckets.get(band).push(signature);
    }
  }

  return pairs;
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
      timestamp_seconds: bounds.offset + bounds.start + hashes.length * sampleSeconds,
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

function transcribeShard(sourcePath, bounds, outFile) {
  const audio = extractAudio(sourcePath, bounds, outFile);
  if (audio.state !== 'prepared_for_transcription') {
    return {
      state: 'audio_unavailable',
      engine_id: null,
      reason: audio.reason || audio.state,
      segments: [],
      audio_state: audio.state
    };
  }

  const transcript = transcribePreparedAudio({
    audioPath: audio.path,
    bounds
  });

  return {
    ...transcript,
    audio_state: audio.state,
    audio_sha256: audio.sha256,
    audio_size_bytes: audio.size_bytes
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
      start_seconds: bounds.absolute_start,
      end_seconds: bounds.absolute_end,
      duration_seconds: bounds.duration
    },
    source: {
      sha256: source.sha256,
      original_sha256: assignment.item?.raw?.source?.original_sha256 || source.sha256,
      derivative_kind: assignment.item?.raw?.source?.derivative_kind || null,
      derivative_lossless: assignment.item?.raw?.source?.derivative_lossless ?? null,
      size_bytes: source.size_bytes,
      extension: source.extension
    }
  };
}

export async function runAssignment({ assignment, rootDir, executionContext = {} }) {
  requireMediaTools();
  const raw = assignment.item?.raw || {};
  const source = validateAuthorizedMediaSource(raw, {
    rootDir,
    additionalRoots: executionContext.media_roots || []
  });
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

    case 'scene_boundary_worker':
      return {
        ...receipt,
        data: {
          scene_boundaries: sceneBoundaries(source.path, bounds)
        }
      };

    case 'frame_hash_worker':
      return {
        ...receipt,
        data: {
          sample_interval_seconds: 2,
          frame_hashes: frameHashes(source.path, bounds, 2),
          perceptual_signatures: perceptualFrameSignatures(source.path, bounds, 2)
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

    case 'transcription_worker': {
      const audioPath = path.join(outDir, 'transcription-input.wav');
      return {
        ...receipt,
        data: {
          transcription: transcribeShard(source.path, bounds, audioPath)
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
          original_source_sha256: raw.source?.original_sha256 || source.sha256,
          source_unchanged: observed === source.sha256,
          source_write_performed: false,
          derivative_kind: raw.source?.derivative_kind || null,
          derivative_lossless: raw.source?.derivative_lossless ?? null
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

function normalizeTranscriptText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mergeTranscriptSegments(entries, overlapSeconds = 0) {
  const merged = [];
  const recentByText = new Map();
  const timestampTolerance = Math.min(
    1.5,
    Math.max(0.5, Number(overlapSeconds || 0) * 0.25)
  );

  for (const segment of [...entries].sort((a, b) =>
    a.start_seconds - b.start_seconds || a.end_seconds - b.end_seconds
  )) {
    const key = normalizeTranscriptText(segment.text);
    if (!key) continue;

    const recent = recentByText.get(key) || [];
    const duplicate = recent.find((existing) => {
      if (existing.shard_index === segment.shard_index) return false;
      const startDelta = Math.abs(existing.start_seconds - segment.start_seconds);
      const endDelta = Math.abs(existing.end_seconds - segment.end_seconds);
      return startDelta <= timestampTolerance && endDelta <= Math.max(1, timestampTolerance);
    });

    if (duplicate) {
      if (
        Number.isFinite(segment.confidence) &&
        (!Number.isFinite(duplicate.confidence) || segment.confidence > duplicate.confidence)
      ) {
        duplicate.confidence = segment.confidence;
      }
      continue;
    }

    const accepted = { ...segment };
    merged.push(accepted);
    const nextRecent = [...recent, accepted]
      .filter((existing) =>
        segment.start_seconds - existing.end_seconds <= Math.max(2, Number(overlapSeconds || 0) + 1)
      )
      .slice(-8);
    recentByText.set(key, nextRecent);
  }

  return merged;
}

export async function reconcile({ results, contract }) {
  const frameOccurrences = new Map();
  const perceptualSignatures = [];
  const timeline = [];
  const sceneBoundaryEntries = [];
  const audio = [];
  const transcriptionShards = [];
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

    for (const signature of result?.data?.perceptual_signatures || []) {
      perceptualSignatures.push({
        ...signature,
        shard_index: result.shard?.shard_index ?? null
      });
    }

    for (const frame of result?.data?.keyframes || []) timeline.push(frame);
    for (const boundary of result?.data?.scene_boundaries || []) {
      sceneBoundaryEntries.push({
        ...boundary,
        shard_index: result.shard?.shard_index ?? null
      });
    }
    if (result?.data?.audio) {
      audio.push({
        shard_index: result.shard?.shard_index ?? null,
        ...result.data.audio
      });
    }
    if (result?.data?.transcription) {
      transcriptionShards.push({
        shard_index: result.shard?.shard_index ?? null,
        start_seconds: result.shard?.start_seconds ?? null,
        end_seconds: result.shard?.end_seconds ?? null,
        ...result.data.transcription
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

  const perceptualPairs = nearDuplicatePairs(
    perceptualSignatures.sort((a, b) => a.timestamp_seconds - b.timestamp_seconds)
  );
  const nearRepeatedPairs = perceptualPairs.filter(
    (pair) =>
      Math.abs(pair.second_timestamp_seconds - pair.first_timestamp_seconds) >
      Math.max(2, overlap + 1)
  );

  const reconciledSceneBoundaries = [];
  const seenSceneBoundaries = new Set();
  for (const boundary of sceneBoundaryEntries.sort(
    (a, b) => a.timestamp_seconds - b.timestamp_seconds
  )) {
    const key = Math.round(Number(boundary.timestamp_seconds) * 10);
    if (seenSceneBoundaries.has(key)) continue;
    seenSceneBoundaries.add(key);
    reconciledSceneBoundaries.push(boundary);
  }

  const originalHashes = new Set(
    provenance
      .map((entry) => entry?.original_source_sha256)
      .filter(Boolean)
  );
  const provenanceOk =
    provenance.every((entry) => entry?.source_unchanged === true) &&
    originalHashes.size <= 1;
  const repeatedContent = duplicates.filter((entry) => entry.classification === 'repeated_content');
  const transcriptSegments = mergeTranscriptSegments(
    transcriptionShards.flatMap((entry) =>
      (entry.segments || []).map((segment) => ({
        ...segment,
        shard_index: entry.shard_index,
        engine_id: entry.engine_id || segment.engine_id || null
      }))
    ),
    overlap
  );
  const engineIds = [...new Set(
    transcriptionShards.map((entry) => entry.engine_id).filter(Boolean)
  )].sort();
  const transcribedShards = transcriptionShards.filter((entry) => entry.state === 'transcribed').length;
  const transcriptErrors = transcriptionShards.filter((entry) =>
    ['engine_error', 'invalid_engine_output', 'engine_configuration_error'].includes(entry.state)
  ).length;
  const engineUnavailable = transcriptionShards.some((entry) =>
    ['engine_not_configured', 'engine_configuration_error'].includes(entry.state)
  );
  const transcriptionState = transcriptSegments.length
    ? (transcriptErrors ? 'partial' : 'transcribed')
    : (engineUnavailable ? 'engine_not_configured' : 'not_available');
  const reconciledTimeline = dedupeTimeline(timeline);
  const transcription = {
    state: transcriptionState,
    engine_ids: engineIds,
    shard_count: transcriptionShards.length,
    transcribed_shards: transcribedShards,
    error_shards: transcriptErrors,
    segment_count: transcriptSegments.length,
    segments: transcriptSegments,
    text: transcriptSegments.map((entry) => entry.text).join(' ')
  };
  const originalSourceSha256 = originalHashes.size === 1 ? [...originalHashes][0] : null;
  const baseEvidenceGraph = originalSourceSha256
    ? buildEvidenceGraph({
        sourceSha256: originalSourceSha256,
        transcript: transcription,
        timeline: reconciledTimeline,
        sceneBoundaries: reconciledSceneBoundaries,
        perceptualSignatures,
        exactDuplicateGroups: repeatedContent,
        nearDuplicatePairs: nearRepeatedPairs
      })
    : null;
  const evidenceGraph = baseEvidenceGraph
    ? attachSemanticIndex(baseEvidenceGraph)
    : null;

  return {
    schema: 'evercraft.forensiscope.reconciliation.v1',
    status: provenanceOk ? 'reconciled' : 'reconciliation_failed',
    source_integrity_preserved: provenanceOk,
    original_source_sha256: originalSourceSha256,
    derivative_integrity_checks: provenance.length,
    worker_statuses: workerStatuses,
    timeline: reconciledTimeline,
    scene_boundaries: reconciledSceneBoundaries,
    duplicate_review: {
      duplicate_hash_groups: duplicates.length,
      repeated_content_groups: repeatedContent.length,
      perceptual_signature_count: perceptualSignatures.length,
      near_duplicate_pairs: perceptualPairs.length,
      near_repeated_pairs: nearRepeatedPairs.length,
      exact_groups: duplicates.slice(0, 200),
      perceptual_pairs: nearRepeatedPairs.slice(0, 200)
    },
    audio_assets: audio,
    transcription,
    evidence_graph: evidenceGraph
  };
}
