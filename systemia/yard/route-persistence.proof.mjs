import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { YardOperator } from './operator.mjs';

// Read/write only an isolated temporary Yard state directory.
// No credentials, real broker, capacity grants, or jobs are used.
const deploymentId = 'route-persistence-proof';
const receiptHash = 'a'.repeat(64);
const instanceId = 'remote_broker_route_persistence_proof';
const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-yard-route-proof-'));
let healthMatches = true;

const server = http.createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  if (req.method === 'POST' && req.url === '/v1/leases/lease-proof/renew') {
    res.writeHead(200).end(JSON.stringify({
      expires_at: '2030-01-01T00:00:00.000Z',
      receipt: { receipt_hash: 'renewal-proof' },
    }));
    return;
  }
  if (req.method !== 'GET' || req.url !== '/v1/remote/health') {
    res.writeHead(404).end(JSON.stringify({ error: 'not_found' }));
    return;
  }
  res.writeHead(200).end(JSON.stringify({
    ok: true,
    service: 'remote-capacity-broker',
    runtime: 'Evercraft Compute',
    instance_id: healthMatches ? instanceId : 'untrusted_broker',
    deployment_receipt_bound: true,
    deployment_receipt_ref: receiptHash,
    secure_envelope_schema: 'evercraft.secure-envelope.v1',
  }));
});

try {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;

  fs.writeFileSync(
    path.join(stateDir, deploymentId + '.json'),
    JSON.stringify({
      deployment_id: deploymentId,
      state: 'ready',
      receipt: {
        workload_class: 'systemia.remote-capacity-broker.v1',
        receipt_hash: receiptHash,
      },
      result: { instance_id: instanceId, service_id: 'broker-proof-service' },
      lease: { lease_id: 'lease-proof', expires_at: '2029-01-01T00:00:00.000Z' },
    }) + '\n',
    { mode: 0o600 },
  );
  fs.mkdirSync(path.join(stateDir, '.lease-secrets'), { mode: 0o700 });
  fs.writeFileSync(
    path.join(stateDir, '.lease-secrets', deploymentId + '.json'),
    JSON.stringify({
      capacity_endpoint: origin,
      lease_id: 'lease-proof',
      token: 'test-only-local-fixture',
    }),
    { mode: 0o600 },
  );

  // Reproduce the incident: another Yard instance caches deployment state
  // before the broker route gets verified and persisted.
  const staleYard = new YardOperator({ stateDir });
  assert.equal(staleYard.deploymentStatus(deploymentId)?.public_route, undefined);

  const yardA = new YardOperator({ stateDir });
  const route = await yardA.verifyPublicRoute(deploymentId, {
    origin,
    allowLoopbackProof: true,
  });
  assert.equal(route.scope, 'loopback_proof');
  assert.equal(route.verified, false);
  assert.equal(route.origin, origin);
  assert.equal(route.verification, 'instance_and_deployment_receipt_match');

  const yardB = new YardOperator({ stateDir });
  const reloaded = yardB.deploymentStatus(deploymentId);
  assert.equal(reloaded.public_route?.receipt_hash, route.receipt_hash,
    'verified route must survive construction of a new YardOperator');
  assert.equal(reloaded.public_route?.scope, 'loopback_proof');

  // The old implementation overwrote the file with staleYard's cached record
  // here, silently deleting public_route during an ordinary lease renewal.
  const renewed = await staleYard.renewDeploymentLease(deploymentId);
  assert.equal(renewed.ok, true);
  const afterRenewal = new YardOperator({ stateDir }).deploymentStatus(deploymentId);
  assert.equal(afterRenewal.lease.expires_at, '2030-01-01T00:00:00.000Z');
  assert.equal(afterRenewal.public_route?.receipt_hash, route.receipt_hash,
    'a stale lease keeper must not erase the verified route for the same deployment');
  assert.equal(afterRenewal.public_route?.scope, 'loopback_proof');
  console.log('PASS: stale Yard lease renewal preserves newer verified route');

  healthMatches = false;
  await assert.rejects(
    yardB.verifyPublicRoute(deploymentId, {
      origin,
      allowLoopbackProof: true,
    }),
    /public route health does not match this deployment receipt and instance/,
  );
  const yardC = new YardOperator({ stateDir });
  assert.equal(
    yardC.deploymentStatus(deploymentId)?.public_route?.receipt_hash,
    route.receipt_hash,
    'invalid broker identity must not replace the previously verified route',
  );

  console.log('PASS: loopback route verified, persisted, and reloaded by fresh Yard');
  console.log('PASS: mismatched broker identity rejected without replacing route');
  console.log('LIMIT: simultaneous cross-process writes still require locking');
} finally {
  server.close();
  fs.rmSync(stateDir, { recursive: true, force: true });
}
