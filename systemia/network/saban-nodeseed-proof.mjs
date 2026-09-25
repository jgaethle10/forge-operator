import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import dgram from 'node:dgram';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startNodeSeed } from '../compute/node-seed.mjs';

async function freeUdpPort() {
  const socket = dgram.createSocket('udp4');
  await new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.bind(0, '127.0.0.1', resolve);
  });
  const address = socket.address();
  const port = typeof address === 'object' ? address.port : 0;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}

function runSaban(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['systemia/network/saban-network-proof.mjs', ...args], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Saban exited ${code}: ${stderr || stdout}`));
    });
  });
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'saban-nodeseed-discovery-'));
const beaconPort = await freeUdpPort();
const allocatorToken = 'saban-proof-allocator';

const a = await startNodeSeed({
  root: path.join(root, 'node-a'),
  nodeId: 'evercraft-node-a',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken,
  announce: true,
  announceAddress: '127.0.0.1',
  announcePort: beaconPort,
  announceIntervalMs: 100,
});
const b = await startNodeSeed({
  root: path.join(root, 'node-b'),
  nodeId: 'evercraft-node-b',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken,
  announce: true,
  announceAddress: '127.0.0.1',
  announcePort: beaconPort,
  announceIntervalMs: 100,
});

try {
  const out = path.join(root, 'saban-proof-output');
  await runSaban([
    '--agents', '100',
    '--no-local',
    '--discover-capacity',
    '--discovery-bind', '127.0.0.1',
    '--discovery-address', '127.0.0.1',
    '--discovery-port', String(beaconPort),
    '--discovery-timeout-ms', '500',
    '--discovery-no-multicast',
    '--out', out,
  ], {
    EVERCRAFT_ALLOCATOR_TOKEN: allocatorToken,
  });

  const summary = JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8'));
  assert.equal(summary.proof, 'evercraft.saban.network-seed.v4');
  assert.equal(summary.status, 'PASS');
  assert.equal(summary.agent_count, 100);
  assert.equal(summary.discovery_mode, 'beacon');
  assert.equal(summary.identity_verified_count, 2);
  assert.equal(summary.pre_enrollment_required, false);
  assert.equal(summary.authorization_mode, 'dynamic_allocator_lease');
  assert.equal(summary.checkpoint_rebind, true);
  assert.equal(summary.migrated_agent_count, 50);
  assert.ok(summary.capacity_sources.includes('evercraft-node-a'));
  assert.ok(summary.capacity_sources.includes('evercraft-node-b'));
  assert.equal(summary.capacity_sources.length, 2);

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.saban.nodeseed-discovery-proof.v1',
    discovery_mode: summary.discovery_mode,
    capacity_sources: summary.capacity_sources,
    signed_node_identity_verified: true,
    identity_verified_count: summary.identity_verified_count,
    authenticated_allocation: true,
    pre_enrollment_required: false,
    authorization_mode: summary.authorization_mode,
    agent_count: summary.agent_count,
    checkpoint_rebind: summary.checkpoint_rebind,
    migrated_agent_count: summary.migrated_agent_count,
    hard_coded_endpoints_required: false,
    named_cloud_required: false,
  }, null, 2));
} finally {
  await Promise.allSettled([a.close(), b.close()]);
  fs.rmSync(root, { recursive: true, force: true });
}
