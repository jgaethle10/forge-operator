import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  CANARY_PATH, parseLiveReadbackArgs,
  pinnedCanaryExpectation, verifyExistingYardState, runLiveSourceReadback,
} from './live-source-readback.mjs';

import { collectAttestedRemoteSource } from './attested-remote-source.mjs';

const devicePin = 'sha256:' + 'a'.repeat(64);
const repo = fileURLToPath(new URL('../../', import.meta.url));
const gitCommit = execFileSync('git', [
  '-C', repo, 'rev-parse', 'HEAD',
], { encoding: 'utf8' }).trim();
const sha = value => 'sha256:' +
  createHash('sha256').update(value).digest('hex');

test('argument contract requires exact ids, pinned commit and no arbitrary path or token', () => {
  const args = parseLiveReadbackArgs([
    '--repo', repo,
    '--yard-state', '/private/yard',
    '--broker-deployment', 'broker-001',
    '--node-id', 'penguin-node-001',
    '--device-fingerprint', devicePin,
    '--git-commit', gitCommit,
  ]);
  assert.equal(args.pageBytes, 262144);
  assert.equal(args.expectedDeviceFingerprint, devicePin);
  assert.throws(() => parseLiveReadbackArgs([
    '--repo', repo, '--yard-state', '/private/yard',
    '--broker-deployment', 'broker-001', '--node-id', 'node-001',
    '--git-commit', gitCommit,
  ]), /independent_device_fingerprint_required/);
  assert.equal(args.brokerDeploymentId, 'broker-001');
  assert.equal(parseLiveReadbackArgs(['--help']).help, true);
  assert.throws(() => parseLiveReadbackArgs([]), /required_arguments_missing/);
  assert.throws(() => parseLiveReadbackArgs([
    '--repo', repo, '--repo', repo,
  ]), /argument_invalid_or_duplicated/);
  assert.throws(() => parseLiveReadbackArgs([
    '--remote-path', '.ssh/id_ed25519',
  ]), /argument_invalid_or_duplicated/);
  assert.throws(() => parseLiveReadbackArgs([
    '--token', 'secret',
  ]), /argument_invalid_or_duplicated/);
  assert.throws(() => parseLiveReadbackArgs([
    '--repo', repo,
    '--yard-state', '/private/yard',
    '--broker-deployment', 'broker-001',
    '--node-id', 'node-001',
    '--git-commit', 'main',
  ]), /pinned_git_commit_required/);
});

test('coordinator predeclares exact Git-blob digest without contacting remote node', () => {
  const expected = pinnedCanaryExpectation({ repo, gitCommit });
  const source = execFileSync('git', [
    '-C', repo, 'show', gitCommit + ':' + CANARY_PATH,
  ]);
  assert.equal(expected.source_path, CANARY_PATH);
  assert.equal(expected.root_key, 'evercraft');
  assert.equal(expected.sha256, sha(source));
  assert.equal(expected.bytes, source.length);
  assert.equal(expected.source_pinned_to_local_git_object, true);
  assert.equal(expected.expectation_origin_attested, false);
  assert.throws(() => pinnedCanaryExpectation({
    repo, gitCommit, pageBytes: 1,
  }), /page_budget_insufficient/);
  assert.throws(() => pinnedCanaryExpectation({
    repo, gitCommit: 'b'.repeat(40),
  }), /Command failed|Command timed out|bad object|not a valid object|fatal/i);
});

test('private Yard state must already exist, cannot be bootstrapped by a readback', t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'readback-yard-preflight-'));
  t.after(() => fs.rmSync(tmp, { recursive:true, force:true }));
  assert.throws(() => verifyExistingYardState(tmp), /existing_yard_authority_required/);
  assert.deepEqual(fs.readdirSync(tmp), []);
  for (const name of [
    '.lease-secrets', '.checkpoints', '.field-enrollments',
    '.field-attestations', '.remote-device-authorizations',
  ]) fs.mkdirSync(path.join(tmp, name), {mode:0o700});
  assert.equal(verifyExistingYardState(tmp), tmp);
  fs.chmodSync(path.join(tmp, '.lease-secrets'), 0o750);
  assert.throws(() => verifyExistingYardState(tmp), /yard_private_authority_mode_required/);
  fs.chmodSync(path.join(tmp, '.lease-secrets'), 0o700);
  const linked = path.join(path.dirname(tmp), path.basename(tmp) + '-alias');
  fs.symlinkSync(tmp, linked);
  t.after(() => fs.rmSync(linked, {force:true}));
  assert.throws(() => verifyExistingYardState(linked), /canonical_directory_required/);
});

test('without an existing Yard authority the live readback is a content-free HOLD', async t => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'readback-no-authority-'));
  t.after(() => fs.rmSync(state, {recursive:true,force:true}));
  const receipt = await runLiveSourceReadback({
    repo, yardState: state,
    brokerDeploymentId: 'broker-001',
    nodeId: 'node-001',
    expectedDeviceFingerprint: devicePin,
    gitCommit,
    pageBytes: 262144,
  });
  assert.equal(receipt.status, 'hold');
  assert.equal(receipt.reason, 'local_preflight_or_authority_unavailable');
  assert.equal(receipt.local_git_object_pinned, true);
  assert.equal(receipt.source_bytes_verified, false);
  assert.equal(receipt.remote_node_identity_attested, false);
  assert.equal(receipt.live_running_process_verified, false);
  assert.equal(receipt.live_workload_or_deployment_mutated, false);
  assert.equal(receipt.node_and_broker_metadata_receipts_may_append, true);
  assert.equal(receipt.source_content_returned, false);
  assert.equal(receipt.credentials_returned, false);
  assert.equal(receipt.readback, null);
  assert.equal(fs.readdirSync(state).length, 0);
});

test('CLI invalid inputs exit HOLD and never print a private path or token', () => {
  const script = fileURLToPath(new URL('./live-source-readback.mjs', import.meta.url));
  const secret = 'SENSITIVE_TOKEN_DO_NOT_PRINT_0123456789';
  const result = spawnSync(process.execPath, [
    script, '--repo', secret,
  ], { encoding:'utf8', timeout:5000 });
  assert.equal(result.status, 3);
  const receipt = JSON.parse(result.stdout.trim());
  assert.equal(receipt.status, 'hold');
  assert.equal(receipt.source_content_returned, false);
  assert.equal(receipt.credentials_returned, false);
  assert.equal(result.stdout.includes(secret), false);
  assert.equal(result.stderr.includes(secret), false);
  const help = spawnSync(process.execPath, [script, '--help'],
    {encoding:'utf8',timeout:5000});
  assert.equal(help.status, 0);
  assert.match(help.stdout, /No loopback proof override/);
});


test('independent coordinator device pin rejects substituted Yard inventory before grant or HTTP', async () => {
  const otherPin = 'sha256:' + 'b'.repeat(64);
  let grants = 0, network = 0, inventoryReads = 0;
  const yard = {
    async listRemoteCapacityNodes() {
      inventoryReads++;
      return {schema:'evercraft.yard.remote-capacity-nodes.v1',
        broker_deployment_id:'broker-001',
        nodes:[{node_id:'node-001', connected:true, device_fingerprint:otherPin,
          secure_envelope_schema:'evercraft.secure-envelope.v1',
          capacity:{authorized:true, session_attestation_verified:true,
            attestation_supported:true, device_fingerprint:otherPin}}]};
    },
    async remoteCapacityGrant() { grants++; throw new Error('must not grant'); },
  };
  const input = {yard, brokerDeploymentId:'broker-001', nodeId:'node-001',
    missionId:'mission-001', sourceId:'source-001', relativePath:CANARY_PATH,
    expectedSha256:sha('canary'), expectedBytes:6,
    expectedDeviceFingerprint:devicePin,
    fetchImpl:async()=>{network++; throw new Error('must not fetch');}};
  const mismatch = await collectAttestedRemoteSource(input);
  assert.equal(mismatch.status, 'hold');
  assert.equal(mismatch.reason, 'coordinator_device_pin_mismatch');
  assert.equal(mismatch.coordinator_device_pin_matched, false);
  assert.equal(mismatch.remote_node_identity_attested, false);
  assert.equal(grants, 0);
  assert.equal(network, 0);
  assert.equal(inventoryReads, 1);
  const invalid = await collectAttestedRemoteSource({...input, expectedDeviceFingerprint:'bad'});
  assert.equal(invalid.reason, 'coordinator_device_pin_invalid');
  assert.equal(inventoryReads, 1);
  const missing = await runLiveSourceReadback({repo, gitCommit});
  assert.equal(missing.reason, 'independent_device_fingerprint_required');
  assert.equal(missing.local_git_object_pinned, false);
});
