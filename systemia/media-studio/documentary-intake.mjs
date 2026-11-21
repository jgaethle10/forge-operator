#!/usr/bin/env node
// Documentary source admission. No execution, payment, client approval, or publication authority.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateAuthorizedMediaSource } from '../forensiscope/authorized-source.mjs';

export const DOCUMENTARY_INTAKE_SCHEMA = 'evercraft.fallen.documentary-intake.v1';
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const present = value => typeof value === 'string' && Boolean(value.trim());
const validDate = value => present(value) && !Number.isNaN(Date.parse(value));
const sorted = value => Array.isArray(value) ? value.map(sorted) :
  value && typeof value === 'object' ? Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sorted(v)])
  ) : value;
const SHA = /^sha256:[a-f0-9]{64}$/i;
const scope = ['documentary_edit', 'private_client_preview'];
const kinds = ['original_camera', 'licensed_archive'];
const claimKinds = ['public_record', 'firsthand_account', 'unverified_claim', 'opinion'];

function videoProbe(filename) {
  const processResult = spawnSync('ffprobe',
    ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', filename],
    { encoding: 'utf8', maxBuffer: 2097152, timeout: 20000 });
  if (processResult.error || processResult.status !== 0) throw new Error('video_probe_failed');
  const info = JSON.parse(processResult.stdout);
  const stream = (info.streams || []).find(s => s.codec_type === 'video');
  const duration = Number(info.format?.duration);
  if (!stream || !Number.isFinite(duration) || duration <= 0) throw new Error('video_probe_failed');
  return { durationSec: duration, width: stream.width, height: stream.height, codec: stream.codec_name };
}

export function assessDocumentaryIntake(input, { rootDir = process.cwd(), additionalRoots = [] } = {}) {
  const reasons = [];
  const check = (condition, label) => { if (!condition) reasons.push(label); };
  check(input?.schema === DOCUMENTARY_INTAKE_SCHEMA, 'schema_invalid');
  check(present(input?.projectId), 'project_id_missing');
  check(Number.isFinite(input?.targetDurationSec) && input.targetDurationSec >= 45 &&
    input.targetDurationSec <= 90, 'pilot_duration_invalid');
  const sources = Array.isArray(input?.sources) ? input.sources : [];
  check(sources.length > 0 && sources.length <= 100, 'no_source_media');
  const ids = sources.map(s => s?.id);
  check(ids.every(present) && new Set(ids).size === ids.length, 'source_ids_not_unique');
  const sourceReceipts = [];
  for (const [index, raw] of sources.slice(0, 100).entries()) {
    const s = raw || {};
    const id = present(s.id) ? s.id : 'index_' + index;
    const permission = s.permission || {};
    const auth = s.authorization || {};
    check(kinds.includes(s.kind), 'source_kind_invalid:' + id);
    check(SHA.test(s.source?.sha256 || ''), 'source_hash_missing:' + id);
    check(present(permission.evidenceRef), 'rights_evidence_missing:' + id);
    check(Array.isArray(permission.permittedUses) && scope.every(k => permission.permittedUses.includes(k)),
      'rights_scope_missing:' + id);
    check(present(auth.authorized_by), 'authorization_identity_missing:' + id);
    check(validDate(auth.confirmed_at), 'authorization_date_missing:' + id);
    check(auth.scope === 'documentary_postproduction', 'authorization_scope_invalid:' + id);
    check(s.privacyReview?.status === 'cleared' && present(s.privacyReview?.evidenceRef),
      'privacy_review_missing:' + id);
    const provenance = s.provenance || {};
    check(present(provenance.recordRef) &&
      (provenance.captureDateState === 'unknown' ||
      (provenance.captureDateState === 'known' && validDate(provenance.capturedAt))),
      'provenance_missing:' + id);
    try {
      if (!SHA.test(s.source?.sha256 || '')) throw new Error('hash_invalid');
      const admitted = validateAuthorizedMediaSource({ source: s.source, authorization: auth },
        { rootDir, additionalRoots, requireExisting: true, rejectSymlinkSource: true });
      if (!['.mp4', '.mov', '.mkv', '.webm', '.m4v', '.avi'].includes(admitted.extension)) {
        throw new Error('video_extension_invalid');
      }
      const probe = videoProbe(admitted.path);
      sourceReceipts.push({ sourceId: id, sha256: admitted.sha256, bytes: admitted.size_bytes,
        ...probe, rightsEvidenceRef: permission.evidenceRef || null,
        provenanceRef: provenance.recordRef || null });
    } catch (error) {
      // No private paths or personal data in diagnostic text.
      const message = String(error?.message || error);
      const label = /outside admitted media roots/.test(message) ? 'source_outside_admitted_roots' :
        /symlinks/.test(message) ? 'source_symlink_rejected' :
        /hash/.test(message) ? 'source_hash_mismatch_or_missing' :
        /authorization/.test(message) ? 'source_authorization_missing' :
        /does not exist/.test(message) ? 'source_file_missing' :
        /video|ffprobe/.test(message) ? 'source_video_probe_failed' : 'source_not_admitted';
      reasons.push(label + ':' + id);
    }
  }
  const idSet = new Set(ids.filter(present));
  const claims = Array.isArray(input?.claims) ? input.claims : [];
  const claimIds = claims.map(c => c?.id);
  check(claimIds.every(present) && new Set(claimIds).size === claimIds.length, 'claims_not_unique');
  for (const [index, raw] of claims.entries()) {
    const c = raw || {};
    const id = present(c.id) ? c.id : 'index_' + index;
    check(claimKinds.includes(c.kind), 'claim_kind_invalid:' + id);
    check(present(c.text), 'claim_text_missing:' + id);
    check(Array.isArray(c.sourceIds) && c.sourceIds.length > 0 &&
      c.sourceIds.every(s => idSet.has(s)), 'claim_source_missing:' + id);
    if (c.kind === 'public_record') check(present(c.evidenceRef), 'public_record_reference_missing:' + id);
    else check(present(c.onScreenAttribution), 'claim_attribution_missing:' + id);
  }
  const uniqueReasons = [...new Set(reasons)];
  const receipt = {
    schema: 'evercraft.fallen.documentary-intake-receipt.v1',
    projectId: present(input?.projectId) ? input.projectId : null,
    status: uniqueReasons.length ? 'blocked' : 'ready_for_private_edit',
    reasons: uniqueReasons, sourceReceipts, claimCount: claims.length,
    manifestDigest: digest(JSON.stringify(sorted(input))),
    boundaries: {
      consentAndRightsDeclarationsRequireIndependentHumanAuthentication: true,
      factsRequireEditorialReview: true, privatePreviewOnly: true,
      clientApprovalGranted: false, paymentAuthorityGranted: false,
      publicationAuthorityGranted: false
    }
  };
  return { ...receipt, receiptDigest: digest(JSON.stringify(sorted(receipt))) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [manifestPath, receiptPath, mediaRoot] = process.argv.slice(2);
  if (!manifestPath || !receiptPath || !mediaRoot) {
    console.error('Usage: node documentary-intake.mjs <private-manifest> <private-receipt> <admitted-media-root>');
    process.exitCode = 1;
  } else {
    try {
      const input = JSON.parse(fs.readFileSync(path.resolve(manifestPath), 'utf8'));
      const result = assessDocumentaryIntake(input, { additionalRoots: [mediaRoot] });
      const output = path.resolve(receiptPath);
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
      console.log('Documentary intake: ' + result.status + ', source count: ' + result.sourceReceipts.length);
      if (result.status !== 'ready_for_private_edit') process.exitCode = 2;
    } catch {
      console.error('Unable to read private manifest or write private receipt.');
      process.exitCode = 1;
    }
  }
}
