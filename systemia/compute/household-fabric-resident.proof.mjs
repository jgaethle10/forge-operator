import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { startEvercraftComputeNode } from './runtime-node.mjs';
import { YardOperator } from '../yard/operator.mjs';

function send(res, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': body.length,
  });
  res.end(body);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'household-compute-proof-'));
const computeRoot = path.join(root, 'compute');
const yardState = path.join(root, 'yard');
const allocatorToken = 'household-proof-allocator-token';
const browserResult = {
  ok: true,
  engine: 'evercraft-owned-browser-worker-v1',
  final_url: 'https://www.yvl.org/events/',
  text_sha256: 'compute-household-text-proof',
  evidence_receipt_sha256: 'compute-household-browser-receipt',
  finished_at: new Date().toISOString(),
  snapshot: {
    headings: [
      { level: 'h1', text: 'Events' },
      { level: 'h5', text: 'Yakima Central: Family Storytime' },
      { level: 'h6', text: 'Thursday December 24, 2026 | 7:00 pm' },
    ],
  },
};

const browserServer = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/v1/browser/render') {
    return send(res, 200, { ok: true, result: browserResult });
  }
  return send(res, 404, { ok: false, error: 'not_found' });
});
await new Promise((resolve, reject) => {
  browserServer.once('error', reject);
  browserServer.listen(0, '127.0.0.1', resolve);
});
const browserAddress = browserServer.address();
const browserUrl = 'http://127.0.0.1:' + browserAddress.port;

const node = await startEvercraftComputeNode({
  root: computeRoot,
  nodeId: 'household-fabric-proof-node',
  allocatorToken,
});
const yard = new YardOperator({ stateDir: yardState });

try {
  const capacity = await fetch(node.endpoint + '/v1/capacity').then(r => r.json());
  assert.equal(capacity.supported_workloads.includes('systemia.household-fabric-yakima.v1'), true);

  const deployed = await yard.deployRelease({
    deploymentId: 'household-fabric-yakima',
    releaseRef: 'c'.repeat(40),
    workloadClass: 'systemia.household-fabric-yakima.v1',
    capacityEndpoint: node.endpoint,
    allocatorToken,
    input: {
      state_root: path.join(computeRoot, 'household-fabric-yakima'),
      browser_edge_url: browserUrl,
      kroger_zip_code: '98902',
      cadence_seconds: 300,
    },
    rollbackTarget: 'proof:household-fabric-previous',
    leaseTtlMs: 120000,
  });

  assert.equal(deployed.state, 'ready');
  assert.equal(deployed.receipt.health_verification, 'healthy');
  assert.equal(deployed.receipt.route_verification, 'private_household_fabric_health_verified');
  assert.equal(deployed.result.credential_refs_are_opaque, true);
  assert.equal(deployed.result.raw_provider_secrets_in_input, false);
  assert.equal(deployed.result.public_route_required, false);

  async function bridge(pathname) {
    const response = await fetch(node.endpoint + deployed.result.bridge_path, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + allocatorToken,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ method: 'GET', path: pathname }),
    });
    const envelope = await response.json();
    return {
      status: response.status,
      envelope,
      body: envelope.body_base64
        ? JSON.parse(Buffer.from(envelope.body_base64, 'base64').toString('utf8'))
        : null,
    };
  }

  let today = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const candidate = await bridge('/today');
    if (candidate.status === 200 && candidate.envelope.status === 200) {
      today = candidate.body;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(today, 'resident Today artifact should become available');
  assert.equal(today.ok, true);
  assert.equal(today.opportunities.length, 1);
  assert.equal(today.opportunities[0].title, 'Yakima Central: Family Storytime');

  const health = await bridge('/health');
  assert.equal(health.status, 200);
  assert.equal(health.envelope.status, 200);
  assert.equal(health.body.service, 'household-fabric-yakima');
  assert.equal(health.body.secret_material_exposed, false);
  assert.equal(health.body.raw_provider_secrets_required, false);
  assert.equal(health.body.today_available, true);

  const denied = await fetch(node.endpoint + deployed.result.bridge_path, {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + allocatorToken,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ method: 'POST', path: '/today' }),
  });
  assert.equal(denied.status, 422);
  const deniedBody = await denied.json();
  assert.equal(deniedBody.error, 'resident_service_bridge_route_not_allowed');

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.household-fabric.resident-compute-proof.v1',
    runtime: 'Evercraft Compute',
    yard_deployment_ready: true,
    resident_health_verified: true,
    authenticated_read_bridge: true,
    today_reopened: true,
    raw_provider_secrets_in_input: false,
    public_route_required: false,
  }, null, 2));
} finally {
  try { await node.close(); } catch {}
  await new Promise(resolve => browserServer.close(() => resolve()));
  fs.rmSync(root, { recursive: true, force: true });
}
