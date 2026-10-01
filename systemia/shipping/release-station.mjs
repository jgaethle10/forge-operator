import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { preflightPackage } from './package-preflight.mjs';

const CHANNEL_PROFILES = Object.freeze({
  email: {
    max_total_bytes:25 * 1024 * 1024,
    max_artifacts:10,
    external_send:true,
    sent_copy_verification:true
  },
  customer_handoff: {
    max_total_bytes:100 * 1024 * 1024,
    max_artifacts:25,
    external_send:true,
    sent_copy_verification:true
  },
  chat_attachment: {
    max_total_bytes:100 * 1024 * 1024,
    max_artifacts:25,
    external_send:false,
    sent_copy_verification:false
  },
  public_records: {
    max_total_bytes:100 * 1024 * 1024,
    max_artifacts:50,
    external_send:true,
    sent_copy_verification:true
  },
  internal_review: {
    max_total_bytes:250 * 1024 * 1024,
    max_artifacts:100,
    external_send:false,
    sent_copy_verification:false
  }
});

function clean(value) {
  return String(value ?? '').trim();
}

function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
}

function digest(value) {
  return 'sha256:' + crypto.createHash('sha256').update(stable(value)).digest('hex');
}

function fileDigest(file) {
  return 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function safeKey(value, fallback = 'release') {
  return clean(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || fallback;
}

function artifactSourcePath(artifact = {}) {
  const value = clean(artifact.path || artifact.source_path);
  if (!value) throw new Error('artifact_source_path_required');
  const resolved = path.resolve(value);
  if (!fs.existsSync(resolved)) throw new Error('artifact_source_missing:' + resolved);
  if (!fs.statSync(resolved).isFile()) throw new Error('artifact_source_not_file:' + resolved);
  return resolved;
}

function writeAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive:true });
  const temp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(temp, value);
  fs.renameSync(temp, file);
}

export function channelProfile(channel = 'customer_handoff') {
  const key = clean(channel).toLowerCase();
  const profile = CHANNEL_PROFILES[key];
  if (!profile) throw new Error('unknown_shipping_channel:' + key);
  return { key, ...profile };
}

export function buildReleasePlan({
  release_key,
  channel = 'customer_handoff',
  audience = 'external_recipient',
  recipient_ref = null,
  artifacts = [],
  source_refs = [],
  authorization_ref = null,
  confidentiality = 'recipient_only',
  release_note = '',
  now = new Date()
} = {}) {
  if (!clean(release_key)) throw new Error('release_key_required');
  const profile = channelProfile(channel);
  if (artifacts.length > profile.max_artifacts) throw new Error('channel_artifact_limit_exceeded');
  if (profile.external_send && !clean(recipient_ref)) throw new Error('recipient_ref_required');
  if (profile.external_send && !clean(authorization_ref)) throw new Error('external_send_authorization_required');

  const package_manifest = preflightPackage({
    artifacts,
    max_total_bytes:profile.max_total_bytes
  });

  const core = {
    schema:'evercraft.shipping.release-plan.v2',
    release_key:clean(release_key),
    channel:profile.key,
    audience:clean(audience) || 'external_recipient',
    recipient_ref:clean(recipient_ref) || null,
    confidentiality:clean(confidentiality) || 'recipient_only',
    authorization_ref:clean(authorization_ref) || null,
    release_note:clean(release_note) || null,
    source_refs:[...new Set((source_refs || []).map(clean).filter(Boolean))],
    package_manifest,
    channel_contract:{
      max_total_bytes:profile.max_total_bytes,
      max_artifacts:profile.max_artifacts,
      external_send:profile.external_send,
      sent_copy_verification:profile.sent_copy_verification
    },
    prepared_at:new Date(now).toISOString()
  };

  return {
    ...core,
    release_fingerprint:digest(core),
    ready:package_manifest.pass === true,
    reasons:package_manifest.pass ? [] : [...package_manifest.reasons]
  };
}

export function materializeReleasePackage({
  plan,
  artifacts = [],
  output_root = 'state/shipping/releases',
  overwrite = false
} = {}) {
  if (!plan?.ready || plan?.package_manifest?.pass !== true) throw new Error('release_plan_not_ready');
  if (artifacts.length !== plan.package_manifest.artifacts.length) throw new Error('artifact_count_mismatch');

  const releaseDir = path.resolve(output_root, safeKey(plan.release_key));
  if (fs.existsSync(releaseDir) && !overwrite) throw new Error('release_directory_exists');
  if (fs.existsSync(releaseDir) && overwrite) fs.rmSync(releaseDir, { recursive:true, force:true });
  fs.mkdirSync(releaseDir, { recursive:true });

  const copied = [];
  for (let index = 0; index < artifacts.length; index += 1) {
    const artifact = artifacts[index];
    const expected = plan.package_manifest.artifacts[index];
    const source = artifactSourcePath(artifact);
    const destination = path.join(releaseDir, expected.client_filename);
    fs.copyFileSync(source, destination);

    const observedDigest = fileDigest(destination);
    const observedSize = fs.statSync(destination).size;
    if (observedDigest !== expected.sha256) throw new Error('materialized_digest_mismatch:' + expected.client_filename);
    if (observedSize !== expected.size_bytes) throw new Error('materialized_size_mismatch:' + expected.client_filename);

    copied.push({
      client_filename:expected.client_filename,
      relative_path:expected.client_filename,
      size_bytes:observedSize,
      sha256:observedDigest
    });
  }

  const manifest = {
    schema:'evercraft.shipping.materialized-release.v2',
    release_key:plan.release_key,
    release_fingerprint:plan.release_fingerprint,
    channel:plan.channel,
    audience:plan.audience,
    recipient_ref:plan.recipient_ref,
    confidentiality:plan.confidentiality,
    source_refs:plan.source_refs,
    package_digest:plan.package_manifest.package_digest,
    artifacts:copied,
    materialized_at:new Date().toISOString(),
    truth_boundary:{
      materialization_proves_exact_packaged_bytes:true,
      external_delivery_not_inferred:true,
      recipient_open_not_inferred:true,
      customer_acceptance_not_inferred:true
    }
  };
  manifest.materialization_digest = digest(manifest);

  writeAtomic(
    path.join(releaseDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  );

  const readme = [
    'EVERCRAFT SHIPPING RELEASE',
    '',
    'Release: ' + plan.release_key,
    'Channel: ' + plan.channel,
    'Artifacts: ' + copied.length,
    'Package digest: ' + plan.package_manifest.package_digest,
    'Materialization digest: ' + manifest.materialization_digest,
    '',
    'Client files:',
    ...copied.map((row) => '- ' + row.client_filename),
    '',
    'This directory proves package composition only. External delivery and recipient acceptance are separate states.'
  ].join('\n') + '\n';
  writeAtomic(path.join(releaseDir, 'RELEASE.txt'), readme);

  return {
    release_dir:releaseDir,
    manifest_path:path.join(releaseDir, 'manifest.json'),
    release_note_path:path.join(releaseDir, 'RELEASE.txt'),
    manifest
  };
}

export function verifyMaterializedRelease({
  release_dir
} = {}) {
  const dir = path.resolve(clean(release_dir));
  if (!clean(release_dir) || !fs.existsSync(dir)) throw new Error('release_directory_missing');
  const manifestFile = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestFile)) throw new Error('release_manifest_missing');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const reasons = [];

  for (const artifact of manifest.artifacts || []) {
    const file = path.join(dir, artifact.relative_path || artifact.client_filename);
    if (!fs.existsSync(file)) {
      reasons.push(artifact.client_filename + ':missing');
      continue;
    }
    const size = fs.statSync(file).size;
    const sha = fileDigest(file);
    if (size !== artifact.size_bytes) reasons.push(artifact.client_filename + ':size_mismatch');
    if (sha !== artifact.sha256) reasons.push(artifact.client_filename + ':digest_mismatch');
  }

  const actualClientFiles = fs.readdirSync(dir)
    .filter((name) => !['manifest.json','RELEASE.txt'].includes(name))
    .sort();
  const expectedClientFiles = (manifest.artifacts || []).map((row) => row.client_filename).sort();
  if (
    actualClientFiles.length !== expectedClientFiles.length ||
    actualClientFiles.some((name, index) => name !== expectedClientFiles[index])
  ) reasons.push('release_directory_contains_unexpected_or_missing_files');

  return {
    schema:'evercraft.shipping.materialized-release-verification.v2',
    release_key:manifest.release_key || null,
    package_digest:manifest.package_digest || null,
    materialization_digest:manifest.materialization_digest || null,
    verified:reasons.length === 0,
    reasons,
    artifact_count:(manifest.artifacts || []).length,
    release_dir:dir
  };
}
