import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { assessRecordedAudioCustody, approvalBytes, CUSTODY_SCHEMA, REVIEW_SCHEMA } from './recorded-audio-custody.mjs';

function simpleWav() {
  const wav = Buffer.alloc(44 + 16);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVE', 8);
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22); wav.writeUInt32LE(48000, 24); wav.writeUInt32LE(96000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
  wav.writeUInt32LE(16, 40);
  return wav;
}
function caseFile() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'fallen-foley-gate-'));
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
  const bytes = simpleWav();
  writeFileSync(path.join(dir, 'switch.wav'), bytes);
  const asset = {
    assetId: 'scene01-switch', relativePath: 'switch.wav', sha256: createHash('sha256').update(bytes).digest('hex'),
    licenseId: 'CC0-1.0', sourceUrl: 'https://example.org/recorded-switch',
    licenseEvidenceUrl: 'https://example.org/recorded-switch/license', attribution: '',
    review: { schema: REVIEW_SCHEMA, decision: 'approved', reviewedBy: 'authorized-editor',
      reviewedAt: '2026-10-14T12:00:00Z', signature: '' },
  };
  function signIt(a = asset) { a.review.signature = sign(null, approvalBytes(a), privateKey).toString('base64'); return a; }
  signIt();
  const manifest = { schema: CUSTODY_SCHEMA, assets: [asset] };
  const assess = () => assessRecordedAudioCustody({ manifest, assetsDir: dir, reviewerPublicKey: publicPem });
  return { dir, asset, manifest, assess, publicPem, privateKey, signIt, bytes };
}
function withCase(fn) { const c = caseFile(); try { fn(c); } finally { rmSync(c.dir, { recursive: true, force: true }); } }
const blocked = (r, reason) => { assert.equal(r.status, 'rejected'); assert.equal(r.publicationAuthorized, false); assert.ok(r.reasons.includes(reason), JSON.stringify(r)); };

test('accepts hash-matching WAV with valid local reviewer signature, never publishes', () => withCase(c => {
  const r = c.assess(); assert.equal(r.status, 'accepted_for_ingest_review');
  assert.equal(r.assets[0].byteLength, c.bytes.length); assert.equal(r.publicationAuthorized, false);
}));
test('rejects audio byte modification after review', () => withCase(c => {
  writeFileSync(path.join(c.dir, 'switch.wav'), Buffer.concat([c.bytes, Buffer.from([1])]));
  blocked(c.assess(), 'audio_sha256_mismatch');
}));
test('rejects forged approval not signed by pinned reviewer key', () => withCase(c => {
  const wrongKey = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' });
  blocked(assessRecordedAudioCustody({ manifest: c.manifest, assetsDir: c.dir, reviewerPublicKey: wrongKey }), 'signed_review_missing_or_invalid');
}));
test('rejects license changes after signature', () => withCase(c => {
  c.asset.licenseId = 'CC-BY-4.0'; c.asset.attribution = 'Person';
  blocked(c.assess(), 'signed_review_missing_or_invalid');
}));
test('rejects unknown license even when a reviewer signed it', () => withCase(c => {
  c.asset.licenseId = 'unknown'; c.signIt(); blocked(c.assess(), 'license_unknown_or_disallowed');
}));
test('requires attribution for CC-BY-4.0', () => withCase(c => {
  c.asset.licenseId = 'CC-BY-4.0'; c.signIt(); blocked(c.assess(), 'attribution_required');
}));
test('rejects unsafe URL even if signed', () => withCase(c => {
  c.asset.sourceUrl = 'http://example.org'; c.signIt(); blocked(c.assess(), 'source_or_license_evidence_url_invalid');
}));
test('rejects file path traversal even when signed', () => withCase(c => {
  c.asset.relativePath = '../switch.wav'; c.signIt(); blocked(c.assess(), 'path_not_safe');
}));
test('rejects symlinked audio outside media root', () => withCase(c => {
  const outside = mkdtempSync(path.join(os.tmpdir(), 'outside-foley-'));
  try { writeFileSync(path.join(outside, 'foreign.wav'), c.bytes);
    symlinkSync(path.join(outside, 'foreign.wav'), path.join(c.dir, 'alias.wav'));
    c.asset.relativePath = 'alias.wav'; c.signIt(); blocked(c.assess(), 'path_outside_assets_root');
  } finally { rmSync(outside, { recursive: true, force: true }); }
}));
test('rejects extension spoof with bogus audio bytes', () => withCase(c => {
  const bytes = Buffer.alloc(60, 99);
  writeFileSync(path.join(c.dir, 'switch.wav'), bytes);
  c.asset.sha256 = createHash('sha256').update(bytes).digest('hex'); c.signIt();
  blocked(c.assess(), 'audio_header_invalid');
}));
test('rejects missing trusted reviewer key', () => withCase(c => {
  blocked(assessRecordedAudioCustody({ manifest: c.manifest, assetsDir: c.dir, reviewerPublicKey: 'not a key' }), 'trusted_ed25519_reviewer_key_required');
}));
test('rejects duplicate asset IDs and bad manifest schema', () => withCase(c => {
  c.manifest.assets.push(structuredClone(c.asset)); blocked(c.assess(), 'asset_id_invalid_or_duplicate');
  c.manifest.schema = 'invalid'; blocked(c.assess(), 'manifest_schema_or_size_invalid');
}));
test('rejects unsigned self-claimed approval', () => withCase(c => {
  c.asset.review.signature = ''; blocked(c.assess(), 'signed_review_missing_or_invalid');
}));
test('accepts CC-BY only when attribution and metadata were signed', () => withCase(c => {
  c.asset.licenseId = 'CC-BY-4.0'; c.asset.attribution = 'Author ©; source example.org'; c.signIt();
  assert.equal(c.assess().status, 'accepted_for_ingest_review');
}));
