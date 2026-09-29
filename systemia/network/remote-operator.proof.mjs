import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startNodeSeed } from '../compute/node-seed.mjs';
import { startOutboundCapacityBroker } from './outbound-capacity-broker.mjs';
import { startOutboundNodeAgent } from './outbound-node-agent.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-remote-operator-e2e-'));
const computeRoot = path.join(root, 'compute');
const operatorHome = path.join(root, 'operator-home');
const operatorState = path.join(root, 'operator-state');
const brokerState = path.join(root, 'broker');
fs.mkdirSync(operatorHome, { recursive: true });
fs.writeFileSync(path.join(operatorHome, 'hello.txt'), 'hello from node\n');
fs.mkdirSync(path.join(operatorHome, '.ssh'), { recursive: true });
fs.writeFileSync(path.join(operatorHome, '.ssh', 'id_ed25519'), 'do-not-return');

const allocatorToken = 'local-allocator-proof-' + 'a'.repeat(32);
let seed;
let broker;
let agent;

async function request(url, { method = 'GET', token = '', body } = {}) {
  const headers = {};
  if (token) headers.authorization = 'Bearer ' + token;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
}

try {
  seed = await startNodeSeed({
    root: computeRoot,
    nodeId: 'remote-operator-proof-node',
    host: '127.0.0.1',
    port: 0,
    advertiseHost: '127.0.0.1',
    allocatorToken,
    placementLabels: ['private', 'outbound-only', 'personal-compute'],
    remoteOperatorRoots: { home: operatorHome },
    remoteOperatorStateDir: operatorState,
    announce: false,
  });

  broker = await startOutboundCapacityBroker({
    host: '127.0.0.1',
    port: 0,
    stateDir: brokerState,
    authorizedDevices: {
      [seed.device_fingerprint]: seed.node_id,
    },
    commandTimeoutMs: 20_000,
    pollWaitMs: 25,
  });

  agent = await startOutboundNodeAgent({
    brokerUrl: broker.endpoint,
    localCapacityEndpoint: seed.endpoint,
    localAllocatorToken: allocatorToken,
    pollBackoffMs: 25,
  });

  const grant = broker.controlGrant(seed.node_id);
  assert.ok(grant);
  assert.equal(grant.node_id, seed.node_id);
  assert.ok(grant.allocator_token);

  const denied = await request(grant.capacity_endpoint + '/v1/operator/status');
  assert.equal(denied.status, 401);

  const status = await request(grant.capacity_endpoint + '/v1/operator/status', {
    token: grant.allocator_token,
  });
  assert.equal(status.status, 200);
  assert.equal(status.body.ok, true);
  assert.deepEqual(status.body.roots, ['home']);
  assert.equal(status.body.execution.interactive_tty, false);

  const read = await request(grant.capacity_endpoint + '/v1/operator/fs/read', {
    method: 'POST',
    token: grant.allocator_token,
    body: { root_key: 'home', path: 'hello.txt' },
  });
  assert.equal(read.status, 200);
  assert.equal(read.body.content, 'hello from node\n');

  const sensitive = await request(grant.capacity_endpoint + '/v1/operator/fs/read', {
    method: 'POST',
    token: grant.allocator_token,
    body: { root_key: 'home', path: '.ssh/id_ed25519' },
  });
  assert.equal(sensitive.status, 422);
  assert.equal(sensitive.body.error, 'operator_sensitive_path_denied');

  const writeDenied = await request(grant.capacity_endpoint + '/v1/operator/fs/write', {
    method: 'POST',
    token: grant.allocator_token,
    body: { root_key: 'home', path: 'result.txt', content: 'blocked' },
  });
  assert.equal(writeDenied.status, 422);
  assert.equal(writeDenied.body.error, 'operator_write_approval_required');

  const write = await request(grant.capacity_endpoint + '/v1/operator/fs/write', {
    method: 'POST',
    token: grant.allocator_token,
    body: {
      root_key: 'home',
      path: 'result.txt',
      content: 'written through Evercraft Remote Operator\n',
      approval_ref: 'proof:owner-approved',
    },
  });
  assert.equal(write.status, 200);
  assert.equal(
    fs.readFileSync(path.join(operatorHome, 'result.txt'), 'utf8'),
    'written through Evercraft Remote Operator\n'
  );

  const exec = await request(grant.capacity_endpoint + '/v1/operator/exec', {
    method: 'POST',
    token: grant.allocator_token,
    body: {
      root_key: 'home',
      cwd: '.',
      program: 'git',
      args: ['--version'],
      timeout_ms: 10_000,
      approval_ref: 'proof:owner-approved',
    },
  });
  assert.equal(exec.status, 200);
  assert.equal(exec.body.ok, true);
  assert.match(exec.body.stdout, /git version/i);

  const receipts = fs.readFileSync(
    path.join(operatorState, 'operator-receipts.jsonl'),
    'utf8'
  );
  assert.equal(receipts.includes('hello from node'), false);
  assert.equal(receipts.includes('do-not-return'), false);
  assert.equal(receipts.includes('written through Evercraft'), false);

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.remote-operator.e2e-proof.v1',
    transport: 'outbound-only',
    public_ingress: false,
    exact_device_authorization: true,
    control_grant_required: true,
    encrypted_command_envelope: 'evercraft.secure-envelope.v1',
    sensitive_path_read_blocked: true,
    mutation_approval_required: true,
    remote_filesystem_verified: true,
    remote_execution_verified: true,
    plaintext_operation_payloads_persisted_in_receipts: false,
  }, null, 2));
} finally {
  if (agent) await agent.close();
  if (broker) await broker.close();
  if (seed) await seed.close();
  fs.rmSync(root, { recursive: true, force: true });
}
