/**
 * Fallen recorded audio custody gate (offline, read only).
 * Recorded-media SHA-256 plus an Ed25519 approval from a locally pinned reviewer key.
 * An authentic approval is an attestation from its signer, NOT independent verification
 * of copyright ownership or permission, and NOT publication approval.
 */
import { createHash, createPublicKey, verify } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export const CUSTODY_SCHEMA = 'evercraft.fallen.recorded-audio-custody.v1';
export const REVIEW_SCHEMA = 'evercraft.fallen.recorded-audio-review.v1';
const ALLOWED_LICENSES = new Set(['CC0-1.0', 'CC-BY-4.0', 'LicenseRef-Evercraft-Owned']);
const MAX_AUDIO_BYTES = 250 * 1024 * 1024;
const SHA256 = /^[0-9a-f]{64}$/;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/;

function sha(buffer) { return createHash('sha256').update(buffer).digest('hex'); }

/** Same canonical bytes a reviewer explicitly signs. No secret is stored in Drive. */
export function approvalPayload(asset) {
  const r = asset.review || {};
  return {
    domain: 'evercraft.fallen.recorded-audio-review.v1:approval',
    assetId: asset.assetId,
    sha256: asset.sha256,
    licenseId: asset.licenseId,
    sourceUrl: asset.sourceUrl,
    licenseEvidenceUrl: asset.licenseEvidenceUrl,
    attribution: asset.attribution || '',
    decision: r.decision,
    reviewedBy: r.reviewedBy,
    reviewedAt: r.reviewedAt,
  };
}
export function approvalBytes(asset) { return Buffer.from(JSON.stringify(approvalPayload(asset)), 'utf8'); }
function problem(value) { return { status: 'rejected', reason: value }; }

function safeAudioPath(root, userPath) {
  if (typeof userPath !== 'string' || !userPath || userPath.includes('\\') || userPath.includes('\0') ||
    isAbsolute(userPath) || /^[a-z]:/i.test(userPath) || userPath.split('/').some(p => p === '..' || p === '.' || p === '')) {
    throw new Error('path_not_safe');
  }
  if (!/\.(wav|flac|ogg)$/i.test(userPath)) throw new Error('audio_extension_not_supported');
  const absolute = resolve(root, userPath);
  const rootReal = realpathSync(root);
  const actual = realpathSync(absolute);
  if (!actual.startsWith(rootReal + sep)) throw new Error('path_outside_assets_root');
  if (!lstatSync(absolute).isFile() || lstatSync(absolute).isSymbolicLink()) throw new Error('not_regular_file');
  return actual;
}
function hasAudioHeader(bytes, relativePath) {
  if (/\.wav$/i.test(relativePath)) return bytes.length >= 44 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE';
  if (/\.flac$/i.test(relativePath)) return bytes.length >= 8 && bytes.toString('ascii', 0, 4) === 'fLaC';
  return bytes.length >= 8 && bytes.toString('ascii', 0, 4) === 'OggS';
}
function httpsUrl(s) { try { const u = new URL(s); return u.protocol === 'https:' && Boolean(u.hostname) && !u.username && !u.password; } catch { return false; } }

export function assessRecordedAudioCustody({ manifest, assetsDir, reviewerPublicKey }) {
  const results = [];
  if (!manifest || manifest.schema !== CUSTODY_SCHEMA || !Array.isArray(manifest.assets) || manifest.assets.length === 0 || manifest.assets.length > 200) {
    return { schema: 'evercraft.fallen.audio-custody-report.v1', status: 'rejected', assets: [], reasons: ['manifest_schema_or_size_invalid'], publicationAuthorized: false };
  }
  let publicKey;
  try { publicKey = createPublicKey(reviewerPublicKey); if (publicKey.asymmetricKeyType !== 'ed25519') throw new Error(); }
  catch { return { schema: 'evercraft.fallen.audio-custody-report.v1', status: 'rejected', assets: [], reasons: ['trusted_ed25519_reviewer_key_required'], publicationAuthorized: false }; }
  const ids = new Set();
  for (const asset of manifest.assets) {
    const reasons = [];
    const a = asset || {};
    if (!ID.test(a.assetId || '') || ids.has(a.assetId)) reasons.push('asset_id_invalid_or_duplicate');
    ids.add(a.assetId);
    if (typeof a.sha256 !== 'string' || !SHA256.test(a.sha256)) reasons.push('sha256_invalid');
    if (!ALLOWED_LICENSES.has(a.licenseId)) reasons.push('license_unknown_or_disallowed');
    if (!httpsUrl(a.sourceUrl) || !httpsUrl(a.licenseEvidenceUrl)) reasons.push('source_or_license_evidence_url_invalid');
    if (a.licenseId === 'CC-BY-4.0' && !String(a.attribution || '').trim()) reasons.push('attribution_required');
    if (a.review?.schema !== REVIEW_SCHEMA || a.review?.decision !== 'approved' || !ID.test(a.review?.reviewedBy || '') ||
      !Number.isFinite(Date.parse(a.review?.reviewedAt)) || Date.parse(a.review?.reviewedAt) > Date.now() + 300000) reasons.push('review_record_invalid');
    const sig = a.review?.signature;
    if (typeof sig !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(sig) ||
      !verify(null, approvalBytes(a), publicKey, Buffer.from(sig || '', 'base64'))) reasons.push('signed_review_missing_or_invalid');
    let actualHash = null; let byteLength = null;
    try {
      const file = safeAudioPath(assetsDir, a.relativePath);
      const size = lstatSync(file).size;
      if (size === 0 || size > MAX_AUDIO_BYTES) throw new Error('audio_size_invalid');
      const bytes = readFileSync(file);
      if (!hasAudioHeader(bytes, a.relativePath)) throw new Error('audio_header_invalid');
      byteLength = bytes.length;
      actualHash = sha(bytes);
      if (actualHash !== a.sha256) reasons.push('audio_sha256_mismatch');
    } catch (e) { reasons.push(String(e?.message || 'audio_file_unavailable')); }
    results.push({ assetId: a.assetId || null, status: reasons.length ? 'rejected' : 'accepted_for_ingest_review', reasons, sha256: actualHash, byteLength });
  }
  return {
    schema: 'evercraft.fallen.audio-custody-report.v1',
    status: results.every(r => r.status === 'accepted_for_ingest_review') ? 'accepted_for_ingest_review' : 'rejected',
    assets: results,
    reasons: [...new Set(results.flatMap(r => r.reasons))],
    publicationAuthorized: false,
    limitations: [
      'Signature binds a trusted reviewer assertion; copyright ownership and license authenticity need independent human evidence review.',
      'This is read-only ingest custody, not Saban admission, audio mix QC, payment, hosting or publishing approval.',
    ],
  };
}

/** Read-only CLI: node recorded-audio-custody.mjs --manifest X --assets-dir Y --public-key Z --output Q */
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(new URL(import.meta.url))) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((a, s, i, arr) => {
    if (s.startsWith('--') && i + 1 < arr.length) a.push([s.slice(2), arr[i + 1]]);
    return a;
  }, []));
  if (!args.manifest || !args['assets-dir'] || !args['public-key']) {
    console.error('Usage: node recorded-audio-custody.mjs --manifest X --assets-dir Y --public-key Z [--output RECEIPT]');
    process.exitCode = 2;
  } else {
    try {
      const report = assessRecordedAudioCustody({
        manifest: JSON.parse(readFileSync(args.manifest, 'utf8')),
        assetsDir: args['assets-dir'], reviewerPublicKey: readFileSync(args['public-key'], 'utf8'),
      });
      const serialized = JSON.stringify(report, null, 2) + '\n';
      if (args.output) writeFileSync(args.output, serialized, { flag: 'wx' });
      process.stdout.write(serialized);
      if (report.status !== 'accepted_for_ingest_review') process.exitCode = 1;
    } catch (e) { console.error('audio_custody_error: ' + e.message); process.exitCode = 2; }
  }
}
