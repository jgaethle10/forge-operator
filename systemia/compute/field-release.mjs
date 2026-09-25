#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const FIELD_RELEASE_FILES = [
  'systemia/compute/node-seed.mjs',
  'systemia/compute/runtime-node.mjs',
  'systemia/compute/capacity-beacon.mjs',
  'systemia/compute/device-identity.mjs',
  'systemia/compute/field-preflight.mjs',
  'systemia/compute/field-certify.mjs',
  'systemia/compute/field-offline-check.mjs',
  'systemia/compute/field-release.mjs',
  'systemia/compute/install-node-seed.sh',
  'systemia/collider/kernel.mjs',
  'systemia/collider/runtime.mjs',
  'systemia/core/bootstrap/private-origin.mjs',
];

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function fileHash(file) {
  return `sha256:${sha256(fs.readFileSync(file))}`;
}

function payloadDigest(sourceCommit, files) {
  return `sha256:${sha256(JSON.stringify({
    source_commit: sourceCommit,
    files: Object.fromEntries(
      Object.entries(files).sort(([a], [b]) => a.localeCompare(b))
    ),
  }))}`;
}

export function buildFieldRelease({
  root,
  sourceCommit,
  generatedAt = new Date(),
} = {}) {
  const base = path.resolve(root || '.');
  const commit = String(sourceCommit || '').trim();
  if (!/^[a-f0-9]{40}$/i.test(commit)) {
    throw new Error('sourceCommit must be an immutable 40-character Git commit SHA');
  }

  const files = {};
  for (const relative of FIELD_RELEASE_FILES) {
    const absolute = path.join(base, relative);
    if (!fs.existsSync(absolute)) {
      throw new Error(`field release payload missing: ${relative}`);
    }
    files[relative] = fileHash(absolute);
  }

  const manifest = {
    schema: 'evercraft.node001.field-release.v1',
    source_repository: 'jgaethle10/forge-operator',
    source_commit: commit,
    files,
    payload_digest: payloadDigest(commit, files),
    generated_at: generatedAt.toISOString(),
  };
  return manifest;
}

export function verifyFieldRelease({
  root,
  manifest,
} = {}) {
  const base = path.resolve(root || '.');
  const value = typeof manifest === 'string'
    ? JSON.parse(fs.readFileSync(path.resolve(manifest), 'utf8'))
    : manifest;

  if (!value || value.schema !== 'evercraft.node001.field-release.v1') {
    return { ok: false, reason: 'field_release_schema_invalid' };
  }
  if (!/^[a-f0-9]{40}$/i.test(String(value.source_commit || ''))) {
    return { ok: false, reason: 'field_release_commit_invalid' };
  }

  const expectedPaths = [...FIELD_RELEASE_FILES].sort();
  const manifestPaths = Object.keys(value.files || {}).sort();
  if (JSON.stringify(expectedPaths) !== JSON.stringify(manifestPaths)) {
    return { ok: false, reason: 'field_release_file_set_mismatch' };
  }

  for (const relative of expectedPaths) {
    const absolute = path.join(base, relative);
    if (!fs.existsSync(absolute)) {
      return { ok: false, reason: 'field_release_file_missing', path: relative };
    }
    const actual = fileHash(absolute);
    if (actual !== value.files[relative]) {
      return {
        ok: false,
        reason: 'field_release_file_hash_mismatch',
        path: relative,
      };
    }
  }

  const digest = payloadDigest(value.source_commit, value.files);
  if (digest !== value.payload_digest) {
    return { ok: false, reason: 'field_release_payload_digest_mismatch' };
  }

  return {
    ok: true,
    source_commit: value.source_commit,
    payload_digest: value.payload_digest,
    source_repository: value.source_repository,
  };
}

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const command = process.argv[2];
  try {
    if (command === 'build') {
      const root = path.resolve(arg('--root', '.'));
      const sourceCommit = arg('--source-commit', '');
      const out = path.resolve(arg('--out', path.join(root, 'FIELD_RELEASE.json')));
      const manifest = buildFieldRelease({ root, sourceCommit });
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o644 });
      console.log(JSON.stringify(manifest, null, 2));
    } else if (command === 'verify') {
      const result = verifyFieldRelease({
        root: path.resolve(arg('--root', '.')),
        manifest: path.resolve(arg('--manifest', 'FIELD_RELEASE.json')),
      });
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.ok ? 0 : 4);
    } else {
      console.error('usage: field-release.mjs <build|verify> --root <dir> [--source-commit <sha>] [--out <manifest>] [--manifest <manifest>]');
      process.exit(2);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(3);
  }
}
