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
    }) + '\n',
    { mode: 0o600 },
  );

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
  console.log('LIMIT: concurrent stale Yard writer is not exercised in this proof');
} finally {
  server.close();
  fs.rmSync(stateDir, { recursive: true, force: true });
}
