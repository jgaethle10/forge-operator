import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Conservative technical and motion proxies, never a synthetic creative score.
// The creative and publication gates remain separate human/evidence-bound steps.
const DEFAULT_POLICY = Object.freeze({
  minShortEdge: 1080, minFps: 23.9, sampleFps: 2,
  sampleWidth: 48, sampleHeight: 48,
  activeFrameDelta: 0.025, shotChangeDelta: 0.12,
  minActiveFraction: 0.30, maxLowChangeRunSec: 4,
  maxInspectSec: 120,
});

function execute(bin, args, binary = false) {
  const result = spawnSync(bin, args, {
    encoding: binary ? null : 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(bin + '_failed:' + (result.error?.message ?? String(result.stderr).slice(-1000)));
  }
  return result.stdout;
}

export function analyzeFrameDeltas(deltas, policy = DEFAULT_POLICY) {
  const active = deltas.filter(value => value >= policy.activeFrameDelta).length;
  const hardCuts = deltas.filter(value => value >= policy.shotChangeDelta).length;
  let current = 0, longest = 0;
  for (const value of deltas) {
    current = value < policy.activeFrameDelta ? current + 1 : 0;
    longest = Math.max(current, longest);
  }
  return {
    samplePairs: deltas.length,
    meanDelta: deltas.length ? +(deltas.reduce((a,b) => a+b, 0) / deltas.length).toFixed(4) : 0,
    activeFraction: deltas.length ? +(active / deltas.length).toFixed(4) : 0,
    longestLowChangeRunSec: +(longest / policy.sampleFps).toFixed(2),
    candidateHardTransitions: hardCuts,
  };
}

export function assessCinematicSignals(measurements, policy = DEFAULT_POLICY) {
  const reasons = [], observations = [];
  if (!(measurements.width > 0 && measurements.height > 0)) reasons.push('video_dimensions_missing');
  else if (Math.min(measurements.width, measurements.height) < policy.minShortEdge) reasons.push('delivery_resolution_below_cinematic_target');
  if (!(measurements.fps >= policy.minFps)) reasons.push('frame_rate_below_target');
  if (!(measurements.durationSec > 0)) reasons.push('duration_invalid');
  if (measurements.inspectCoverage < .99) reasons.push('full_motion_inspection_incomplete');
  if (measurements.samplePairs < 4) reasons.push('motion_evidence_insufficient');
  if (measurements.activeFraction < policy.minActiveFraction) observations.push('low_visual_activity_needs_creative_review');
  if (measurements.longestLowChangeRunSec > policy.maxLowChangeRunSec) observations.push('extended_low_change_hold_needs_creative_review');
  if (measurements.candidateHardTransitions < 3 && measurements.durationSec >= 20) observations.push('few_detectable_scene_transitions_review_pacing');
  return {
    status: reasons.length ? 'rejected' : 'creative_review_required',
    reasons, observations,
    creativeApprovalGranted: false,
    explanation: 'Pixel activity cannot establish story, emotion, brand, rights, truth or cinematography. Human creative review remains required.',
  };
}

function probe(file) {
  const out = JSON.parse(execute('ffprobe', ['-v','error','-show_streams','-show_format','-of','json',file]));
  const video = out.streams?.find(stream => stream.codec_type === 'video');
  if (!video) throw new Error('video_stream_missing');
  const [num,den] = String(video.avg_frame_rate ?? '0/1').split('/').map(Number);
  return {
    width: video.width ?? 0, height: video.height ?? 0,
    fps: den ? num / den : 0,
    durationSec: Number(out.format?.duration ?? video.duration ?? 0),
  };
}

function sampleMotion(file, duration, policy) {
  const bytes = execute('ffmpeg', [
    '-v','error','-t',String(duration),'-i',file,
    '-vf','fps=' + policy.sampleFps + ',scale=' + policy.sampleWidth + ':' + policy.sampleHeight + ':flags=area,format=gray',
    '-pix_fmt','gray','-f','rawvideo','pipe:1',
  ], true);
  const frameBytes = policy.sampleWidth * policy.sampleHeight;
  const frames = Math.floor(bytes.length / frameBytes);
  const deltas = [];
  for (let frame = 1; frame < frames; frame++) {
    let diff = 0;
    const previous = (frame - 1) * frameBytes, current = frame * frameBytes;
    for (let i = 0; i < frameBytes; i++) diff += Math.abs(bytes[current + i] - bytes[previous + i]);
    deltas.push(diff / (frameBytes * 255));
  }
  return analyzeFrameDeltas(deltas, policy);
}

export function auditCinematicMaster(file, overrides = {}) {
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) throw new Error('master_file_missing');
  const policy = { ...DEFAULT_POLICY, ...overrides };
  if (Object.values(policy).some(value => !Number.isFinite(value) || value <= 0)) throw new Error('audit_policy_invalid');
  const metadata = probe(resolved);
  const examinedSec = Math.min(metadata.durationSec, policy.maxInspectSec);
  const motion = sampleMotion(resolved, examinedSec, policy);
  const measurements = {
    ...metadata, ...motion,
    inspectCoverage: metadata.durationSec > 0 ? Math.min(1, examinedSec / metadata.durationSec) : 0,
  };
  const assessment = assessCinematicSignals(measurements, policy);
  return {
    schema: 'evercraft.fallen.cinematic-master-audit.v1',
    path: resolved,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(resolved)).digest('hex'),
    measurements, policy, ...assessment,
    boundaries: {
      technicalAndMotionProxyOnly: true,
      creativeApprovalGranted: false,
      publicationAuthority: false,
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = process.argv[2], output = process.argv[3];
  if (!input) {
    console.error('Usage: node cinematic-master-audit.mjs <video.mp4> [audit.json]');
    process.exitCode = 2;
  } else {
    try {
      const report = auditCinematicMaster(input);
      const json = JSON.stringify(report, null, 2) + '\n';
      if (output) fs.writeFileSync(output, json);
      process.stdout.write(json);
      // Review-required is deliberately nonzero: a technically sound render isn't approved.
      process.exitCode = report.status === 'rejected' ? 2 : 1;
    } catch (error) {
      console.error(error);
      process.exitCode = 3;
    }
  }
}
