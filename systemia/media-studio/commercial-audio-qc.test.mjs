import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { inspectCommercialAudio } from './commercial-audio-qc.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fallen-commercial-qc-'));
function media(name, volume, mute = false) {
  const file = path.join(dir, name + '.mp4');
  const args = ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=24',
    '-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=48000',
    '-t', '1.5', '-c:v', 'mpeg4', '-c:a', 'aac', '-af', mute ? 'volume=0' : 'volume=' + volume, file];
  const r = spawnSync('ffmpeg', args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return file;
}

test('independently measures exported audio and binds receipt to exact file bytes', () => {
  const file = media('medium', 1);
  const receipt = inspectCommercialAudio({ filePath: file, policy: { minIntegratedLufs: -40 } });
  assert.equal(receipt.status, 'accepted');
  assert.match(receipt.masterSha256, /^[0-9a-f]{64}$/);
  assert.ok(Number.isFinite(receipt.measurements.integratedLufs));
  assert.ok(Number.isFinite(receipt.measurements.truePeakDbtp));
  assert.equal(receipt.boundaries.clientAndPublicationAuthorityGranted, false);
  assert.ok(receipt.evidenceRefs.includes('sha256:' + receipt.masterSha256));
});

test('quiet mix is rejected instead of quietly passing technical master QC', () => {
  const receipt = inspectCommercialAudio({ filePath: media('quiet', 0.01) });
  assert.equal(receipt.status, 'rejected');
  assert.ok(receipt.reasons.includes('audio_too_quiet'));
});

test('overdriven mix rejects measured true peak', () => {
  const receipt = inspectCommercialAudio({ filePath: media('hot', 12) });
  assert.equal(receipt.status, 'rejected');
  assert.ok(receipt.reasons.includes('audio_true_peak_excessive'));
});

test('digital silence cannot masquerade as an audio program', () => {
  const receipt = inspectCommercialAudio({ filePath: media('mute', 1, true) });
  assert.equal(receipt.status, 'rejected');
  assert.ok(receipt.reasons.includes('audio_integrated_loudness_unmeasurable'));
});

test('digest drift fails before measurement', () => {
  const file = media('digest', 1);
  assert.throws(() => inspectCommercialAudio({ filePath: file, expectedSha256: '0'.repeat(64) }), /commercial_audio_digest_mismatch/);
});
