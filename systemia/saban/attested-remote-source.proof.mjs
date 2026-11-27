#!/usr/bin/env node
// Isolated synthetic Yard + broker + outbound NodeSeed + Saban source gate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { startNodeSeed } from '../compute/node-seed.mjs';
import { startOutboundNodeAgent } from '../network/outbound-node-agent.mjs';
import { YardOperator } from '../yard/operator.mjs';
import { collectAttestedRemoteSource } from './attested-remote-source.mjs';

const sha = buffer => 'sha256:' +
  createHash('sha256').update(buffer).digest('hex');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'saban-attested-source-proof-'));
const sourceHome = path.join(root, 'operator-home');
const brokerComputeRoot = path.join(root, 'broker-compute');
const sourceComputeRoot = path.join(root, 'source-compute');
const yardRoot = path.join(root, 'yard-state');
const brokerStateRoot = path.join(brokerComputeRoot, 'services', 'broker');
const brokerId = 'saban-attested-source-broker';
const sourceNodeId = 'saban-signed-source-node';
const brokerToken = 'proof-broker-only-' + 'a'.repeat(24);
const sourceToken = 'proof-source-only-' + 'b'.repeat(24);
const original = Buffer.from('Evercraft signed source proof 🦃\nA UTF-8 file with multiple pages.\n');
fs.mkdirSync(sourceHome, { recursive: true });
fs.writeFileSync(path.join(sourceHome, 'source.csv'), original);
fs.mkdirSync(path.join(sourceHome, '.ssh'), {recursive: true});
fs.writeFileSync(path.join(sourceHome, '.ssh', 'id_ed25519'), 'NEVER_EXPORT_PRIVATE_KEYS');

let brokerSeed;
let sourceSeed;
let agent;
const yard = new YardOperator({ stateDir: yardRoot });

try {
  brokerSeed = await startNodeSeed({
    root: brokerComputeRoot, nodeId: 'saban-source-broker-host',
    host: '127.0.0.1', port: 0, advertiseHost: '127.0.0.1',
    allocatorToken: brokerToken, announce: false,
  });
  sourceSeed = await startNodeSeed({
    root: sourceComputeRoot, nodeId: sourceNodeId,
    host: '127.0.0.1', port: 0, advertiseHost: '127.0.0.1',
    allocatorToken: sourceToken, announce: false,
    remoteOperatorRoots: {home: sourceHome},
    remoteOperatorStateDir: path.join(root, 'operator-state'),
  });

  const broker = await yard.deployRelease({
    deploymentId: brokerId,
    releaseRef: 'a'.repeat(40),
    workloadClass: 'systemia.remote-capacity-broker.v1',
    capacityEndpoint: brokerSeed.endpoint,
    allocatorToken: brokerToken,
    input: {
      state_root: brokerStateRoot,
      authorized_devices: { [sourceSeed.device_fingerprint]: sourceNodeId },
      poll_wait_ms: 25,
      command_timeout_ms: 15000,
      capacity_fresh_ms: 3000,
    },
    rollbackTarget: 'proof:no-live-deployment',
    leaseTtlMs: 120000,
  });
  assert.equal(broker.state, 'ready');
  const route = await yard.verifyPublicRoute(brokerId, {
    origin: broker.result.local_url, allowLoopbackProof: true,
  });
  assert.equal(route.scope, 'loopback_proof');
  assert.equal(route.verified, false);

  agent = await startOutboundNodeAgent({
    brokerUrl: broker.result.local_url,
    localCapacityEndpoint: sourceSeed.endpoint,
    localAllocatorToken: sourceToken,
    pollBackoffMs: 25,
  });
  assert.equal(agent.device_fingerprint, sourceSeed.device_fingerprint);
  assert.equal(agent.status().public_ingress, false);

  const common = {
    yard, brokerDeploymentId: brokerId, nodeId: sourceNodeId,
    missionId: 'synthetic-attested-source-001',
    sourceId: 'nodeseed-read-only-source-001',
    rootKey: 'home',
    relativePath: 'source.csv',
    expectedSha256: sha(original),
    expectedBytes: original.length,
    pageBytes: 7,
    timeoutMs: 15000,
    allowLoopbackProof: true,
  };
  const good = await collectAttestedRemoteSource(common);
  assert.equal(good.status, 'attested_source_bytes_verified',
    JSON.stringify(good));
  assert.equal(good.broker_session_attestation_verified, true);
  assert.equal(good.remote_node_identity_attested, true);
  assert.equal(good.device_fingerprint, sourceSeed.device_fingerprint);
  assert.equal(good.source_bytes_verified, true);
  assert.equal(good.source_observation_receipt.observed_sha256, sha(original));
  assert.ok(good.pages_verified > 3);
  assert.ok(good.control_grant_receipt_hash);
  assert.equal(good.field_verified, false);
  assert.equal(good.physical_hardware_verified, false);
  assert.equal(good.objective_semantics_verified, false);
  assert.equal(good.runtime_dispatched, false);
  assert.equal(good.runtime_mutated, false);
  const safe = JSON.stringify(good);
  for(const secret of [sourceToken, brokerToken, 'NEVER_EXPORT_PRIVATE_KEYS',
    original.toString('base64'), 'Evercraft signed source proof']) {
    assert.equal(safe.includes(secret), false, 'receipt exposed source or secret');
  }

  const wrongHash = await collectAttestedRemoteSource({
    ...common, expectedSha256: sha('wrong coordinator expectation'),
  });
  assert.equal(wrongHash.status, 'hold');
  assert.equal(wrongHash.source_bytes_verified, false);
  assert.equal(wrongHash.reason, 'source_observation_page_identity_binding_mismatch');
  // The file's whole-file hash is checked against predeclared expectation
  // before any worker completion can be accepted.

  const forbidden = await collectAttestedRemoteSource({
    ...common, relativePath: '.ssh/id_ed25519',
    expectedSha256: sha('NEVER_EXPORT_PRIVATE_KEYS'),
    expectedBytes: Buffer.byteLength('NEVER_EXPORT_PRIVATE_KEYS'),
  });
  assert.equal(forbidden.status, 'hold');
  assert.equal(forbidden.reason, 'remote_source_collection_failed');
  assert.equal(forbidden.source_bytes_verified, false);

  const noProofOverride = await collectAttestedRemoteSource({
    ...common, allowLoopbackProof: false,
  });
  assert.equal(noProofOverride.status, 'hold');
  assert.equal(noProofOverride.source_bytes_verified, false);

  const wrongNode = await collectAttestedRemoteSource({
    ...common, nodeId: 'some-other-unregistered-node',
  });
  assert.equal(wrongNode.reason, 'eligible_attested_remote_session_required');

  const bogusInventoryYard = {
    listRemoteCapacityNodes: async id => {
      const inventory = await yard.listRemoteCapacityNodes(id);
      inventory.nodes[0].device_fingerprint = 'sha256:'+'f'.repeat(64);
      inventory.nodes[0].capacity.device_fingerprint = inventory.nodes[0].device_fingerprint;
      return inventory;
    },
    remoteCapacityGrant: (...args) => yard.remoteCapacityGrant(...args),
  };
  const mismatch = await collectAttestedRemoteSource({
    ...common, yard: bogusInventoryYard,
  });
  assert.equal(mismatch.reason, 'yard_grant_identity_mismatch');
  assert.equal(mismatch.remote_node_identity_attested, false);

  // A valid signed registration is not a license to trust unsigned alteration
  // of a fresh challenge response.
  const spoofed = await collectAttestedRemoteSource({
    ...common,
    fetchImpl: async (url, options) => {
      const response = await fetch(url, options);
      if (!url.endsWith('/v1/attest')) return response;
      const body = await response.json();
      body.attestation.statement.runtime = 'tampered runtime';
      return new Response(JSON.stringify(body), {
        status: response.status,
        headers: {'content-type':'application/json'},
      });
    },
  });
  assert.equal(spoofed.reason, 'signed_device_attestation_mismatch');
  assert.equal(spoofed.remote_node_identity_attested, false);

  // A source mutation requires a new predeclaration, not optimistic reuse.
  fs.writeFileSync(path.join(sourceHome, 'source.csv'), Buffer.concat([
    original, Buffer.from('mutation after declaration'),
  ]));
  const mutated = await collectAttestedRemoteSource(common);
  assert.equal(mutated.status, 'hold');
  assert.equal(mutated.source_bytes_verified, false);

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.saban.attested-remote-source-proof.v1',
    proof_environment: 'synthetic_local_only',
    real_yard_broker_and_outbound_nodeseed: true,
    signed_fresh_challenge_verified: true,
    broker_control_grant_bound: true,
    byte_exact_paged_source_verified: true,
    corrupted_declaration_held: true,
    protected_secret_path_denied: true,
    loopback_override_required: true,
    wrong_device_bound_held: true,
    altered_signed_attestation_held: true,
    changed_file_held: true,
    source_and_secret_bytes_absent_from_receipt: true,
    field_certification_claimed: false,
    physical_device_verified: false,
    runtime_mutated: false,
  }, null, 2));
} finally {
  try { await agent?.close(); } catch {}
  try { await brokerSeed?.close(); } catch {}
  try { await sourceSeed?.close(); } catch {}
  fs.rmSync(root, {recursive: true, force: true});
}
