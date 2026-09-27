import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type {
  ObservationMetric,
  ShotCandidate,
  VisualObservationReceipt,
} from './shot-tournament.js';

export interface ObservationFrame {
  index: number;
  timestampSec: number;
  path: string;
  sha256: string;
}

export interface VisualObservationPacket {
  schema: 'evercraft.fallen.visual-observation-packet.v1';
  candidateId: string;
  shotId: string;
  artifactPath: string;
  artifactDigest: string;
  kind: ShotCandidate['kind'];
  durationSec?: number;
  aspectRatio: ShotCandidate['aspectRatio'];
  subjectIds: string[];
  requestedMetrics: ObservationMetric[];
  frames: ObservationFrame[];
  objective: {
    width?: number;
    height?: number;
    durationSec?: number;
    fps?: number;
    frameCount?: number;
    motionActivity?: number;
  };
}

type Probe = {
  streams?: Array<{
    codec_type?: string;
    width?: number;
    height?: number;
    duration?: string;
    avg_frame_rate?: string;
    nb_frames?: string;
  }>;
  format?: { duration?: string };
};

function run(command: string, args: string[], encoding: BufferEncoding | null = 'utf8') {
  const result = spawnSync(command, args, {
    encoding,
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} failed: ${String(result.stderr || '').trim().slice(-1000)}`,
    );
  }
  return result;
}

function digestFile(filePath: string) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function parseRate(value?: string) {
  if (!value) return undefined;
  const [a, b] = value.split('/').map(Number);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return undefined;
  return a / b;
}

function probe(filePath: string): Probe {
  const result = run('ffprobe', [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath,
  ]);
  return JSON.parse(String(result.stdout || '{}')) as Probe;
}

function sampleTimes(durationSec: number, count: number) {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return [0];
  const safeCount = Math.max(1, Math.min(12, Math.floor(count)));
  if (safeCount === 1) return [Math.max(0, durationSec / 2)];
  const start = Math.min(0.2, durationSec * 0.05);
  const end = Math.max(start, durationSec - Math.min(0.2, durationSec * 0.05));
  const span = Math.max(0, end - start);
  return Array.from({ length: safeCount }, (_, index) =>
    Number((start + span * (index / (safeCount - 1))).toFixed(3)),
  );
}

function extractFrame(inputPath: string, timestampSec: number, outputPath: string) {
  run('ffmpeg', [
    '-y',
    '-v', 'error',
    '-ss', String(timestampSec),
    '-i', inputPath,
    '-frames:v', '1',
    '-vf', 'scale=960:-2:flags=lanczos',
    outputPath,
  ]);
}

function motionActivity(inputPath: string, durationSec: number) {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return undefined;
  const result = run(
    'ffmpeg',
    [
      '-v', 'error',
      '-i', inputPath,
      '-vf', 'fps=2,scale=32:18:flags=area,format=gray',
      '-f', 'rawvideo',
      '-pix_fmt', 'gray',
      'pipe:1',
    ],
    null,
  );
  const bytes = Buffer.isBuffer(result.stdout)
    ? result.stdout
    : Buffer.from(result.stdout || []);
  const frameBytes = 32 * 18;
  const frames = Math.floor(bytes.length / frameBytes);
  if (frames < 2) return 0;

  let total = 0;
  let comparisons = 0;
  for (let frame = 1; frame < frames; frame += 1) {
    const a = bytes.subarray((frame - 1) * frameBytes, frame * frameBytes);
    const b = bytes.subarray(frame * frameBytes, (frame + 1) * frameBytes);
    let diff = 0;
    for (let index = 0; index < frameBytes; index += 1) {
      diff += Math.abs(a[index] - b[index]);
    }
    total += diff / (frameBytes * 255);
    comparisons += 1;
  }
  return Number((total / comparisons).toFixed(4));
}

export function prepareVisualObservationPacket(input: {
  candidate: ShotCandidate;
  outputDir?: string;
  sampleCount?: number;
  requestedMetrics?: ObservationMetric[];
}): VisualObservationPacket {
  const candidate = input.candidate;
  if (!fs.existsSync(candidate.artifactPath)) {
    throw new Error(`Candidate artifact does not exist: ${candidate.artifactPath}`);
  }

  const actualDigest = digestFile(candidate.artifactPath);
  const expected = candidate.artifactDigest.replace(/^sha256:/, '');
  if (expected && actualDigest !== expected) {
    throw new Error(
      `Candidate digest mismatch for ${candidate.id}: expected ${expected}, observed ${actualDigest}`,
    );
  }

  const observed = probe(candidate.artifactPath);
  const visual = observed.streams?.find((stream) => stream.codec_type === 'video');
  const observedDuration = Number(
    visual?.duration ?? observed.format?.duration ?? candidate.durationSec ?? 0,
  );
  const durationSec =
    Number.isFinite(observedDuration) && observedDuration > 0
      ? observedDuration
      : candidate.durationSec;

  const root = path.resolve(
    input.outputDir ??
      fs.mkdtempSync(path.join(os.tmpdir(), 'fallen-observer-')),
    candidate.id,
  );
  fs.mkdirSync(root, { recursive: true });

  const times =
    candidate.kind === 'image'
      ? [0]
      : sampleTimes(durationSec ?? 0, input.sampleCount ?? 8);

  const frames: ObservationFrame[] = times.map((timestampSec, index) => {
    const framePath = path.join(
      root,
      `frame-${String(index + 1).padStart(3, '0')}.jpg`,
    );

    if (candidate.kind === 'image') {
      run('ffmpeg', [
        '-y',
        '-v', 'error',
        '-i', candidate.artifactPath,
        '-frames:v', '1',
        '-vf', 'scale=960:-2:flags=lanczos',
        framePath,
      ]);
    } else {
      extractFrame(candidate.artifactPath, timestampSec, framePath);
    }

    return {
      index,
      timestampSec,
      path: framePath,
      sha256: digestFile(framePath),
    };
  });

  return {
    schema: 'evercraft.fallen.visual-observation-packet.v1',
    candidateId: candidate.id,
    shotId: candidate.shotId,
    artifactPath: candidate.artifactPath,
    artifactDigest: actualDigest,
    kind: candidate.kind,
    durationSec,
    aspectRatio: candidate.aspectRatio,
    subjectIds: candidate.subjectIds,
    requestedMetrics:
      input.requestedMetrics ?? [
        'subject_coverage',
        'composition',
        'motion_quality',
        'continuity',
        'brand_fidelity',
        'beauty',
        'editability',
      ],
    frames,
    objective: {
      width: visual?.width,
      height: visual?.height,
      durationSec,
      fps: parseRate(visual?.avg_frame_rate),
      frameCount: visual?.nb_frames ? Number(visual.nb_frames) : undefined,
      motionActivity:
        candidate.kind === 'video' && durationSec
          ? motionActivity(candidate.artifactPath, durationSec)
          : undefined,
    },
  };
}

export function objectiveEditabilityReceipt(
  packet: VisualObservationPacket,
  verifierId = 'fallen-local-media-inspector-v1',
): VisualObservationReceipt {
  const findings: string[] = [];
  const width = Number(packet.objective.width ?? 0);
  const height = Number(packet.objective.height ?? 0);
  const duration = Number(packet.objective.durationSec ?? 0);

  if (packet.kind === 'video' && duration <= 0) findings.push('duration_invalid');
  if (width <= 0 || height <= 0) findings.push('dimensions_invalid');
  if (!packet.frames.length) findings.push('observation_frames_missing');

  const ratio =
    width > 0 && height > 0
      ? width / height
      : null;
  const expected =
    packet.aspectRatio === '16:9'
      ? 16 / 9
      : packet.aspectRatio === '9:16'
        ? 9 / 16
        : 1;
  if (ratio !== null && Math.abs(ratio - expected) > 0.08) {
    findings.push('aspect_ratio_mismatch');
  }

  return {
    schema: 'evercraft.fallen.visual-observation.v1',
    candidateId: packet.candidateId,
    metric: 'editability',
    verifierId,
    verifierState: 'verified',
    score: findings.length ? 0 : 1,
    threshold: 1,
    evidenceRefs: [
      packet.artifactDigest,
      ...packet.frames.map((frame) => `frame-sha256:${frame.sha256}`),
    ],
    findings,
  };
}

export function validateVisualObservationReceipts(
  packet: VisualObservationPacket,
  receipts: VisualObservationReceipt[],
) {
  const allowedEvidence = new Set([
    packet.artifactDigest,
    `sha256:${packet.artifactDigest}`,
    ...packet.frames.flatMap((frame) => [
      frame.sha256,
      `frame-sha256:${frame.sha256}`,
    ]),
  ]);

  const errors: string[] = [];
  for (const receipt of receipts) {
    if (receipt.candidateId !== packet.candidateId) {
      errors.push(`candidate_mismatch:${receipt.metric}`);
    }
    if (receipt.verifierState !== 'verified') {
      errors.push(`unverified_verifier:${receipt.metric}`);
    }
    if (!Number.isFinite(receipt.score) || receipt.score < 0 || receipt.score > 1) {
      errors.push(`score_invalid:${receipt.metric}`);
    }
    if (
      !Number.isFinite(receipt.threshold) ||
      receipt.threshold < 0 ||
      receipt.threshold > 1
    ) {
      errors.push(`threshold_invalid:${receipt.metric}`);
    }
    if (!receipt.evidenceRefs.length) {
      errors.push(`evidence_missing:${receipt.metric}`);
    } else if (!receipt.evidenceRefs.some((ref) => allowedEvidence.has(ref))) {
      errors.push(`evidence_not_from_packet:${receipt.metric}`);
    }
  }

  return {
    schema: 'evercraft.fallen.visual-observation-validation.v1' as const,
    status: errors.length ? ('rejected' as const) : ('accepted' as const),
    candidateId: packet.candidateId,
    receiptCount: receipts.length,
    errors,
  };
}
