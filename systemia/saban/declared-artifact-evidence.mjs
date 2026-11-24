#!/usr/bin/env node
// Shadow-only, read-only evaluator for deterministic delegated-agent artifacts.
// Neither a worker's success message nor a process exit code is objective proof.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const SCHEMA = 'evercraft.saban.declared-artifact-evidence.v1';
const HASH = /^sha256:[a-f0-9]{64}$/;
const MAX_BYTES = 1024 * 1024;

const sha256 = data => 'sha256:' + createHash('sha256').update(data).digest('hex');

function localArtifact(root, relativePath) {
  if (typeof root !== 'string' || !root.trim()) throw new Error('root_required');
  if (typeof relativePath !== 'string' || !relativePath.trim() ||
      path.isAbsolute(relativePath) || relativePath.includes('\\') ||
      relativePath.includes('\0')) throw new Error('relative_path_required');
  const parts = relativePath.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) {
    throw new Error('relative_path_invalid');
  }
  const rootPath = path.resolve(root);
  const rootStat = fs.lstatSync(rootPath);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('unsafe_root');
  let cursor = rootPath;
  for (let i = 0; i < parts.length; i++) {
    cursor = path.join(cursor, parts[i]);
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink() || (i < parts.length - 1 && !stat.isDirectory())) {
      throw new Error('unsafe_artifact_path');
    }
  }
  return cursor;
}

export function evaluateDeclaredArtifact({
  root, relativePath, expectedSha256, expectedBytes, maxBytes = MAX_BYTES,
  workerReport = null, agentId = null, idempotencyKey = null,
} = {}) {
  // The caller must supply an independently established expectation before
  // dispatch, from a trusted coordinator or deterministic objective test.
  // This module cannot itself attest WHEN or WHO established that expectation.
  const receipt = {
    schema: SCHEMA,
    status: 'hold',
    reason: null,
    agent_id: agentId == null ? null : String(agentId),
    idempotency_key: idempotencyKey == null ? null : String(idempotencyKey),
    artifact_relative_path: typeof relativePath === 'string' ? relativePath : null,
    expected_sha256: expectedSha256 ?? null,
    observed_sha256: null,
    expected_bytes: expectedBytes ?? null,
    observed_bytes: null,
    worker_claimed_complete: workerReport?.status === 'completed' || workerReport?.verified === true,
    evidence_source: 'coordinator_local_file_read',
    independent_runtime_attestation: false,
    objective_semantics_verified: false,
    runtime_dispatched: false,
  };
  try {
    if (!HASH.test(String(expectedSha256 || ''))) throw new Error('expected_sha256_required');
    if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 0) throw new Error('expected_bytes_required');
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_BYTES ||
        expectedBytes > maxBytes) throw new Error('artifact_size_limit');
    const filename = localArtifact(root, relativePath);
    const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    let bytes;
    try {
      const stat = fs.fstatSync(fd);
      if (!stat.isFile() || stat.nlink !== 1 || stat.size > maxBytes) {
        throw new Error('unsafe_artifact_file');
      }
      bytes = fs.readFileSync(fd);
      if (bytes.length !== stat.size) throw new Error('artifact_changed_during_read');
    } finally { fs.closeSync(fd); }
    receipt.observed_bytes = bytes.length;
    receipt.observed_sha256 = sha256(bytes);
    if (bytes.length !== expectedBytes || receipt.observed_sha256 !== expectedSha256) {
      throw new Error('declared_artifact_mismatch');
    }
    receipt.status = 'declared_artifact_match';
  } catch (error) {
    receipt.reason = error?.code === 'ENOENT' ? 'artifact_missing' :
      String(error?.message || 'artifact_check_failed');
  }
  return receipt;
}

// Operator-local shadow canary only. No agent spawning, network calls, shell,
// privilege escalation, writes, or promotion of worker-reported success.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const arg = flag => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  const result = evaluateDeclaredArtifact({
    root: arg('--root'), relativePath: arg('--artifact'),
    expectedSha256: arg('--sha256'), expectedBytes: Number(arg('--bytes')),
    agentId: arg('--agent'), idempotencyKey: arg('--key'),
  });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (result.status !== 'declared_artifact_match') process.exitCode = 3;
}
