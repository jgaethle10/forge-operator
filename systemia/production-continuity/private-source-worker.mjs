import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const ID = /^[a-z0-9][a-z0-9._-]{2,79}$/;
const SAFE_SOURCE = /^[a-zA-Z0-9_. -]{1,180}$/;
export const AUDIT_RESULT = 'evercraft.production.artifact-result.v1';

/** No paths or manuscript contents leave the private node. */
function safeSource(name) {
  if (typeof name !== 'string' || !SAFE_SOURCE.test(name) || name === '.' || name === '..') {
    throw new Error('Invalid private source filename');
  }
  return name;
}
async function readRegular(file, maxBytes = 50_000_000) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > maxBytes) {
    throw new Error('Unsafe or empty private source');
  }
  return { stat, body: await fs.readFile(file) };
}
function digest(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }

/**
 * A REAL local specialist task: inspect a private source manifest and actual
 * bounded source files. This creates a proof-bearing inventory artifact, NOT
 * a completed manuscript, rights check, creative revision, or report release.
 *
 * Each job must originate from the authenticated private queue.
 */
export async function runPrivateSourceAudit(job, { privateDir } = {}) {
  const id = job?.work?.key;
  if (!ID.test(id || '') || job?.work?.private_only !== true ||
      job?.state !== 'leased' || job?.item?.release_authorized !== false ||
      typeof job?.work?.kind !== 'string' || job.work.kind.length > 120) {
    throw new Error('Untrusted or unauthorized private production lease');
  }
  const root = await fs.realpath(privateDir);
  const sourceRoot = path.join(root, 'sources');
  const manifestRoot = path.join(root, 'manifests');
  const artifactRoot = path.join(root, 'artifacts');
  const manifestFile = path.join(manifestRoot, id + '.json');
  let manifest;
  try {
    const input = await readRegular(manifestFile, 1_000_000);
    manifest = JSON.parse(input.body.toString('utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error('Private source manifest missing');
    throw error;
  }
  if (manifest?.schema !== 'evercraft.production.source-input.v1' ||
      manifest.project_id !== id || !Array.isArray(manifest.source_files) ||
      manifest.source_files.length > 20 || manifest.source_files.some(x => typeof x !== 'string')) {
    throw new Error('Invalid project source manifest');
  }
  await fs.mkdir(artifactRoot, { recursive: true, mode: 0o700 });
  const rows = [];
  for (const name of manifest.source_files) {
    safeSource(name);
    const target = path.join(sourceRoot, name);
    let body, stat;
    try { ({ body, stat } = await readRegular(target)); }
    catch (error) {
      rows.push({ source_id: digest(Buffer.from(name)).slice(0, 16),
        verified: false, reason: 'file_missing_or_unsafe' });
      continue;
    }
    const prefix = body.subarray(0, 12).toString('utf8');
    rows.push({
      source_id: digest(Buffer.from(name)).slice(0, 16), verified: true,
      sha256: digest(body), bytes: stat.size,
      detected_format: prefix.startsWith('%PDF-') ? 'pdf'
        : prefix.startsWith('PK') ? 'archive_or_office' : 'other',
      // No source contents, private original paths, or plot details included.
    });
  }
  const verified_count = rows.filter(r => r.verified).length;
  const output = {
    schema: 'evercraft.production.private-source-audit.v1',
    project_id: id, action_kind: job.work.kind,
    audit_class: 'source_provenance_only',
    source_count: rows.length, verified_count,
    blocked_count: rows.length - verified_count,
    status: verified_count === 0 ? 'BLOCKED_SOURCE_REQUIRED'
      : verified_count < rows.length ? 'PARTIAL_SOURCE_EVIDENCE' : 'SOURCE_EVIDENCE_VERIFIED',
    sources: rows, canon_modified: false, publication_performed: false,
    does_not_certify_editorial_or_factual_quality: true
  };
  const serialized = JSON.stringify(output, null, 2) + '\n';
  // Unique filenames make restarted attempts immutable instead of overwriting
  // earlier receipts. All source payloads stay private and untransmitted.
  const name = id + '-' + crypto.randomBytes(8).toString('hex') + '.json';
  const relative = name;
  const filename = path.join(artifactRoot, relative);
  const handle = await fs.open(filename, 'wx', 0o600);
  try { await handle.writeFile(serialized); await handle.sync(); }
  finally { await handle.close(); }
  return {
    schema: AUDIT_RESULT, project_id: id,
    action_kind: job.work.kind, artifact_relpath: relative,
    artifact_sha256: digest(Buffer.from(serialized)),
    artifact_kind: 'private_source_inventory',
    work_outcome: output.status, publication_performed: false,
    canon_modified: false, release_claimed: false
  };
}
