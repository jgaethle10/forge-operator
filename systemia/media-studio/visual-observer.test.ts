import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  objectiveEditabilityReceipt,
  prepareVisualObservationPacket,
  validateVisualObservationReceipts,
} from './visual-observer.js';
import type { ShotCandidate } from './shot-tournament.js';

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr}`);
  }
}

function sha256(filePath: string) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(filePath))
    .digest('hex');
}

test('visual observer produces deterministic frame evidence and objective editability receipt', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fallen-observer-test-'));
  const video = path.join(root, 'candidate.mp4');

  run('ffmpeg', [
    '-y',
    '-v', 'error',
    '-f', 'lavfi',
    '-i', 'testsrc2=size=640x360:rate=24',
    '-t', '2',
    '-pix_fmt', 'yuv420p',
    video,
  ]);

  const candidate: ShotCandidate = {
    id: 'candidate-proof',
    shotId: 'shot-proof',
    artifactPath: video,
    artifactDigest: `sha256:${sha256(video)}`,
    kind: 'video',
    durationSec: 2,
    aspectRatio: '16:9',
    sourceState: 'generated_visualization',
    provenance: 'complete',
    syntheticLabelPresent: true,
    subjectIds: ['proof-subject'],
    observations: [],
  };

  const packet = prepareVisualObservationPacket({
    candidate,
    outputDir: path.join(root, 'observations'),
    sampleCount: 4,
  });

  assert.equal(packet.frames.length, 4);
  assert.equal(packet.objective.width, 640);
  assert.equal(packet.objective.height, 360);
  assert.ok((packet.objective.motionActivity ?? 0) > 0);
  assert.equal(packet.frames.every((frame) => fs.existsSync(frame.path)), true);
  assert.equal(packet.frames.every((frame) => frame.sha256.length === 64), true);

  const receipt = objectiveEditabilityReceipt(packet);
  assert.equal(receipt.score, 1);
  assert.equal(receipt.verifierState, 'verified');

  const validation = validateVisualObservationReceipts(packet, [receipt]);
  assert.equal(validation.status, 'accepted');
});

test('observation validation rejects receipts that cite evidence outside the packet', () => {
  const packet = {
    schema: 'evercraft.fallen.visual-observation-packet.v1' as const,
    candidateId: 'candidate-x',
    shotId: 'shot-x',
    artifactPath: './candidate.mp4',
    artifactDigest: 'abc123',
    kind: 'video' as const,
    durationSec: 2,
    aspectRatio: '16:9' as const,
    subjectIds: [],
    requestedMetrics: ['beauty' as const],
    frames: [
      {
        index: 0,
        timestampSec: 0.5,
        path: './frame.jpg',
        sha256: 'frame123',
      },
    ],
    objective: {},
  };

  const validation = validateVisualObservationReceipts(packet, [
    {
      schema: 'evercraft.fallen.visual-observation.v1',
      candidateId: 'candidate-x',
      metric: 'beauty',
      verifierId: 'beauty-verifier',
      verifierState: 'verified',
      score: 0.9,
      threshold: 0.8,
      evidenceRefs: ['some-other-frame'],
    },
  ]);

  assert.equal(validation.status, 'rejected');
  assert.match(validation.errors.join(' '), /evidence_not_from_packet/);
});
