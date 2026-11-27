#!/usr/bin/env node
/**
 * One-shot, read-only live NodeSeed source canary. No scheduler or deployment.
 * Requires a *pre-existing* private Yard deployment and Git-pinned public code.
 * It deliberately reads exactly one public-source canary, never arbitrary paths.
 * A successful result proves a signed session + matching source bytes, not the
 * physical host, installed runtime process, field enrollment or objective truth.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { YardOperator } from '../yard/operator.mjs';
import { collectAttestedRemoteSource } from './attested-remote-source.mjs';

export const CANARY_PATH = 'systemia/saban/attested-remote-source.mjs';
const MAX_CANARY_BYTES = 1024 * 1024;
const MAX_PAGES = 128;
const DEFAULT_PAGE_BYTES = 262144;
const GIT_REF = /^[a-f0-9]{40}$/i;
const DEVICE_PIN = /^sha256:[a-f0-9]{64}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{3,127}$/;
const FIELDS = Object.freeze({
  '--repo': 'repo',
  '--yard-state': 'yardState',
  '--broker-deployment': 'brokerDeploymentId',
  '--node-id': 'nodeId',
  '--device-fingerprint': 'expectedDeviceFingerprint',
  '--git-commit': 'gitCommit',
  '--page-bytes': 'pageBytes',
});

const sha = bytes => 'sha256:' +
  createHash('sha256').update(bytes).digest('hex');

export function parseLiveReadbackArgs(argv = []) {
  if (argv.length === 1 && argv[0] === '--help') return { help: true };
  if (argv.length < 2 || argv.length % 2 !== 0) {
    throw new Error('required_arguments_missing');
  }
  const result = Object.create(null);
  for (let i = 0; i < argv.length; i += 2) {
    const key = FIELDS[argv[i]];
    if (!key || Object.hasOwn(result, key) ||
        typeof argv[i + 1] !== 'string' || argv[i + 1].startsWith('--')) {
      throw new Error('argument_invalid_or_duplicated');
    }
    result[key] = argv[i + 1];
  }
  for (const required of ['repo', 'yardState', 'brokerDeploymentId', 'nodeId', 'gitCommit']) {
    if (!result[required]) throw new Error('required_arguments_missing');
  }
  if (!SAFE_ID.test(result.brokerDeploymentId) || !SAFE_ID.test(result.nodeId)) {
    throw new Error('broker_or_node_id_invalid');
  }
  if (!GIT_REF.test(result.gitCommit)) throw new Error('pinned_git_commit_required');
  if (!DEVICE_PIN.test(String(result.expectedDeviceFingerprint || ''))) {
    throw new Error('independent_device_fingerprint_required');
  }
  const pageBytes = result.pageBytes === undefined
    ? DEFAULT_PAGE_BYTES : Number(result.pageBytes);
  if (!Number.isSafeInteger(pageBytes) || pageBytes < 1 || pageBytes > 1024 * 1024) {
    throw new Error('page_limit_invalid');
  }
  return { ...result, pageBytes };
}

function canonicalOwnedDirectory(input, label) {
  if (typeof input !== 'string' || !path.isAbsolute(input)) {
    throw new Error(label + '_absolute_path_required');
  }
  const normalized = path.resolve(input);
  const real = fs.realpathSync(normalized);
  const stat = fs.lstatSync(normalized);
  if (real !== normalized || !stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(label + '_canonical_directory_required');
  }
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) {
    throw new Error(label + '_owner_mismatch');
  }
  if (stat.mode & 0o022) {
    throw new Error(label + '_writable_by_nonowner');
  }
  return normalized;
}

export function pinnedCanaryExpectation({ repo, gitCommit, pageBytes = DEFAULT_PAGE_BYTES }) {
  if (!GIT_REF.test(String(gitCommit || ''))) {
    throw new Error('pinned_git_commit_required');
  }
  if (!Number.isSafeInteger(pageBytes) || pageBytes < 1 || pageBytes > 1024 * 1024) {
    throw new Error('page_limit_invalid');
  }
  const root = canonicalOwnedDirectory(repo, 'repo');

  // A Git-pinned coordinator expectation is established before asking the
  // remote node to read. No git fetch/pull/checkout/mutation is performed.
  const tree = execFileSync('git', [
    '-C', root, 'ls-tree', '-z', gitCommit, '--', CANARY_PATH,
  ], { encoding: 'utf8', timeout: 5000, maxBuffer: 1024 });
  const entry = /^(100644|100755) blob [a-f0-9]{40}\t([^\0]+)\0$/.exec(tree);
  if (!entry || entry[2] !== CANARY_PATH) {
    throw new Error('pinned_public_canary_blob_missing');
  }
  const bytes = execFileSync('git', [
    '-C', root, 'show', gitCommit + ':' + CANARY_PATH,
  ], { timeout: 5000, maxBuffer: MAX_CANARY_BYTES + 4096 });
  if (bytes.length > MAX_CANARY_BYTES) throw new Error('pinned_canary_too_large');
  if (bytes.length > MAX_PAGES * pageBytes) throw new Error('page_budget_insufficient');
  return {
    source_path: CANARY_PATH,
    root_key: 'evercraft',
    git_commit: gitCommit.toLowerCase(),
    sha256: sha(bytes),
    bytes: bytes.length,
    page_bytes: pageBytes,
    expectation_origin_attested: false,
    source_pinned_to_local_git_object: true,
  };
}

export function verifyExistingYardState(yardState) {
  const state = canonicalOwnedDirectory(yardState, 'yard_state');
  // YardOperator initializes these subdirectories in its constructor. Require
  // that they already exist so a probe cannot silently bootstrap a new Yard.
  for (const name of [
    '.lease-secrets', '.checkpoints', '.field-enrollments',
    '.field-attestations', '.remote-device-authorizations',
  ]) {
    const dir = path.join(state, name);
    if (!fs.existsSync(dir) || fs.lstatSync(dir).isSymbolicLink() ||
        !fs.lstatSync(dir).isDirectory()) {
      throw new Error('existing_yard_authority_required');
    }
    const real = fs.realpathSync(dir);
    if (real !== dir || (fs.statSync(dir).mode & 0o022)) {
      throw new Error('yard_authority_directory_unsafe');
    }
  }
  const secretDir = fs.statSync(path.join(state, '.lease-secrets'));
  if (typeof process.getuid === 'function' && secretDir.uid !== process.getuid()) {
    throw new Error('yard_authority_owner_mismatch');
  }
  if (secretDir.mode & 0o077) throw new Error('yard_private_authority_mode_required');
  return state;
}

export async function runLiveSourceReadback(input) {
  const base = {
    schema: 'evercraft.saban.live-source-readback.v1',
    status: 'hold',
    reason: null,
    node_id: input?.nodeId ?? null,
    broker_deployment_id: input?.brokerDeploymentId ?? null,
    canary_path: CANARY_PATH,
    pinned_git_commit: input?.gitCommit ?? null,
    local_git_object_pinned: false,
    coordinator_device_pin_matched: false,
    source_bytes_verified: false,
    remote_node_identity_attested: false,
    physical_hardware_verified: false,
    field_verified: false,
    live_running_process_verified: false,
    live_workload_or_deployment_mutated: false,
    node_and_broker_metadata_receipts_may_append: true,
    new_scheduler_created: false,
    source_content_returned: false,
    credentials_returned: false,
    readback: null,
  };
  if (!DEVICE_PIN.test(String(input?.expectedDeviceFingerprint || ''))) {
    base.reason = 'independent_device_fingerprint_required';
    return base;
  }
  try {
    const pin = pinnedCanaryExpectation(input);
    base.local_git_object_pinned = true;
    const state = verifyExistingYardState(input.yardState);
    // Construct only after the read-only preflight. These paths already exist,
    // so the normal constructor's mkdir calls are no-ops.
    const yard = new YardOperator({ stateDir: state });
    const result = await collectAttestedRemoteSource({
      yard,
      brokerDeploymentId: input.brokerDeploymentId,
      nodeId: input.nodeId,
      expectedDeviceFingerprint: input.expectedDeviceFingerprint,
      missionId: 'saban-live-readback-001',
      sourceId: 'saban-public-source-canary-001',
      rootKey: pin.root_key,
      relativePath: pin.source_path,
      expectedSha256: pin.sha256,
      expectedBytes: pin.bytes,
      pageBytes: pin.page_bytes,
      allowLoopbackProof: false,
    });
    base.remote_node_identity_attested = result.remote_node_identity_attested === true;
    base.coordinator_device_pin_matched = result.coordinator_device_pin_matched === true;
    base.source_bytes_verified = result.source_bytes_verified === true;
    base.readback = {
      status: result.status,
      reason: result.reason,
      device_fingerprint: result.device_fingerprint,
      control_grant_receipt_hash: result.control_grant_receipt_hash,
      pages_verified: result.pages_verified,
      expected_sha256: pin.sha256,
      expected_bytes: pin.bytes,
      observed_sha256: result.source_observation_receipt?.observed_sha256 ?? null,
      observed_bytes: result.source_observation_receipt?.observed_bytes ?? null,
      public_https_broker_route_verified: result.secure_envelope_broker_route === true,
    };
    if (result.status === 'attested_source_bytes_verified' &&
        result.remote_node_identity_attested === true &&
        result.coordinator_device_pin_matched === true &&
        result.secure_envelope_broker_route === true &&
        result.source_bytes_verified === true) {
      base.status = 'signed_live_session_canary_matched';
    } else {
      base.reason = result.reason || 'source_or_attestation_not_verified';
    }
  } catch {
    // Never echo subprocess paths, git stderr, local secrets or remote errors.
    base.reason = 'local_preflight_or_authority_unavailable';
  }
  return base;
}

const isMain = process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const help = [
    'Read-only Saban live canary. No shell execution on the remote node.',
    'Required: --repo ABSOLUTE_REPO --yard-state ABSOLUTE_PRIVATE_YARD_STATE',
    '  --broker-deployment ID --node-id ID --git-commit PINNED_40_CHAR_SHA',
    '  --device-fingerprint INDEPENDENTLY_ADMITTED_SHA256_FINGERPRINT',
    'Optional: --page-bytes NUMBER (1..1048576, default 262144)',
    'Canary: ' + CANARY_PATH + ' under the admitted evercraft root.',
    'No loopback proof override; requires the existing Yard verified HTTPS route.',
  ].join('\n');
  try {
    const args = parseLiveReadbackArgs(process.argv.slice(2));
    if (args.help) {
      process.stdout.write(help + '\n');
    } else {
      const result = await runLiveSourceReadback(args);
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      if (result.status !== 'signed_live_session_canary_matched') process.exitCode = 3;
    }
  } catch {
    process.stdout.write(JSON.stringify({
      schema: 'evercraft.saban.live-source-readback.v1',
      status: 'hold',
      reason: 'invalid_or_missing_arguments',
      source_content_returned: false,
      credentials_returned: false,
    }) + '\n');
    process.exitCode = 3;
  }
}
