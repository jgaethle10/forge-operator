import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { assessDocumentaryIntake, DOCUMENTARY_INTAKE_SCHEMA } from './documentary-intake.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fallen-documentary-'));
const source = path.join(root, 'synthetic-test-only.mp4');
const made = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i',
  'testsrc2=size=320x180:rate=24', '-t', '1', '-c:v', 'libx264',
  '-pix_fmt', 'yuv420p', source], { encoding: 'utf8', timeout: 20000 });
if (made.status !== 0) throw new Error('Synthetic fixture failed: ' + made.stderr);
const sha = 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');

function sample() {
  return {
    schema: DOCUMENTARY_INTAKE_SCHEMA, projectId: 'fixture-doc-001', targetDurationSec: 60,
    sources: [{
      id: 'cam-a', kind: 'original_camera', source: { path: source, sha256: sha },
      authorization: { confirmed: true, scope: 'documentary_postproduction',
        authorized_by: 'fixture-rights-holder', confirmed_at: '2026-10-01T00:00:00Z' },
      permission: { permittedUses: ['documentary_edit', 'private_client_preview'],
        evidenceRef: 'private:release-fixture' },
      privacyReview: { status: 'cleared', evidenceRef: 'private:review-fixture' },
      provenance: { captureDateState: 'unknown', recordRef: 'private:camera-fixture' }
    }],
    claims: [{
      id: 'c1', kind: 'unverified_claim', text: 'Example statement only',
      sourceIds: ['cam-a'], onScreenAttribution: 'Unverified statement in test fixture'
    }]
  };
}
const check = input => assessDocumentaryIntake(input, { additionalRoots: [root] });

test('encoded specimen passes private intake but does not authorize release', () => {
  const receipt = check(sample());
  assert.equal(receipt.status, 'ready_for_private_edit');
  assert.equal(receipt.sourceReceipts.length, 1);
  assert.equal(receipt.sourceReceipts[0].sha256, sha);
  assert.equal(receipt.boundaries.clientApprovalGranted, false);
  assert.equal(receipt.boundaries.publicationAuthorityGranted, false);
  assert.equal(receipt.boundaries.factsRequireEditorialReview, true);
});

test('altered footage hash blocks intake', () => {
  const input = sample();
  input.sources[0].source.sha256 = 'sha256:' + '0'.repeat(64);
  const receipt = check(input);
  assert.equal(receipt.status, 'blocked');
  assert.ok(receipt.reasons.includes('source_hash_mismatch_or_missing:cam-a'));
});

test('missing rights, privacy or consent is blocked', () => {
  const input = sample();
  input.sources[0].permission.evidenceRef = '';
  input.sources[0].permission.permittedUses = ['documentary_edit'];
  input.sources[0].privacyReview.status = 'pending';
  input.sources[0].authorization.confirmed = false;
  const reasons = check(input).reasons;
  for (const key of ['rights_evidence_missing:cam-a', 'rights_scope_missing:cam-a',
    'privacy_review_missing:cam-a', 'source_authorization_missing:cam-a'])
    assert.ok(reasons.includes(key));
});

test('unsupported or unattributed claims block intake', () => {
  const input = sample();
  input.claims[0].onScreenAttribution = '';
  input.claims.push({ id: 'public-fact', kind: 'public_record',
    text: 'Example', sourceIds: ['missing-id'] });
  const reasons = check(input).reasons;
  for (const key of ['claim_attribution_missing:c1', 'claim_source_missing:public-fact',
    'public_record_reference_missing:public-fact']) assert.ok(reasons.includes(key));
});

test('outside media roots and symlink sources cannot enter the edit', () => {
  const input = sample();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'fallen-outside-'));
  const unauthorized = path.join(outside, 'outside.mp4');
  fs.copyFileSync(source, unauthorized);
  input.sources[0].source.path = unauthorized;
  assert.ok(check(input).reasons.includes('source_outside_admitted_roots:cam-a'));
  const link = path.join(root, 'linked.mp4');
  fs.symlinkSync(source, link);
  input.sources[0].source.path = link;
  assert.ok(check(input).reasons.includes('source_symlink_rejected:cam-a'));
});

test('duplicate IDs and missing source files cannot produce a ready receipt', () => {
  const input = sample();
  input.sources.push(structuredClone(input.sources[0]));
  assert.ok(check(input).reasons.includes('source_ids_not_unique'));
  input.sources = [];
  assert.ok(check(input).reasons.includes('no_source_media'));
});
