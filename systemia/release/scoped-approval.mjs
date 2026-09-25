import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const SCOPED_APPROVAL_SCHEMA = 'systemia.release.scoped-approval.v1';

function gitText(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function changedFiles(base, head) {
  return gitText(['diff', '--name-only', base, head]).split('\n').filter(Boolean);
}

export function approvalPathForManifest(manifestPath, version) {
  const key = path.basename(manifestPath, '.json');
  return path.posix.join('systemia/release/approvals/mcp-registry', `${key}-${version}.json`);
}

export function verifyScopedMcpApproval({ base, head = 'HEAD', manifestPath } = {}) {
  if (!base) throw new Error('base is required');
  if (!manifestPath || !/^mcp-registry\/[^/]+\.json$/.test(manifestPath)) {
    throw new Error('manifestPath must be one mcp-registry/*.json file');
  }

  const files = changedFiles(base, head);
  const changedManifests = files.filter((file) => /^mcp-registry\/[^/]+\.json$/.test(file));
  if (changedManifests.length !== 1 || changedManifests[0] !== manifestPath) {
    return {
      ok: false,
      reason: 'approval_requires_exactly_one_changed_mcp_manifest',
      changed_manifests: changedManifests,
    };
  }

  if (!fs.existsSync(manifestPath)) return { ok: false, reason: 'manifest_missing' };
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const version = String(manifest.version || '').trim();
  if (!version) return { ok: false, reason: 'manifest_version_missing' };

  const approvalPath = approvalPathForManifest(manifestPath, version);
  if (!files.includes(approvalPath)) {
    return { ok: false, reason: 'approval_not_changed_in_same_release', approval_path: approvalPath };
  }
  if (!fs.existsSync(approvalPath)) {
    return { ok: false, reason: 'approval_file_missing', approval_path: approvalPath };
  }

  const approval = JSON.parse(fs.readFileSync(approvalPath, 'utf8'));
  const valid =
    approval.schema === SCOPED_APPROVAL_SCHEMA &&
    approval.target === 'official_mcp_registry' &&
    approval.manifest === manifestPath &&
    String(approval.version || '') === version &&
    approval.approved === true &&
    approval.single_release === true &&
    typeof approval.approval_ref === 'string' &&
    approval.approval_ref.trim().length > 0;

  if (!valid) {
    return { ok: false, reason: 'approval_contract_invalid', approval_path: approvalPath };
  }

  return {
    ok: true,
    reason: 'scoped_operator_approval',
    approval_path: approvalPath,
    approval_ref: approval.approval_ref,
    manifest: manifestPath,
    version,
  };
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : '';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const base = arg('--base');
  const head = arg('--head') || 'HEAD';
  const manifestPath = arg('--manifest');
  const result = verifyScopedMcpApproval({ base, head, manifestPath });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exitCode = result.ok ? 0 : 1;
}
