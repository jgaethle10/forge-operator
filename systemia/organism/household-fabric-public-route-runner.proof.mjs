import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { startEvercraftComputeNode } from '../compute/runtime-node.mjs';
import { YardOperator } from '../yard/operator.mjs';
import { YardPublicRouteBroker } from '../yard/public-route-broker.mjs';
import {
  reconcileHouseholdFabricPublicRoute,
  validateHouseholdFabricTodayCanary,
} from './household-fabric-public-route-runner.mjs';

function send(res, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': body.length,
  });
  res.end(body);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'household-public-route-proof-'));
const computeRoot = path.join(root, 'compute');
const yardState = path.join(root, 'yard');
const allocatorToken = 'household-public-route-proof-authority';

const browserResult = {
  ok: true,
  engine: 'evercraft-owned-browser-worker-v1',
  final_url: 'https://www.yvl.org/events/',
  text_sha256: 'public-route-text-proof',
  evidence_receipt_sha256: 'public-route-browser-receipt',
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
  nodeId: 'household-route-node',
  allocatorToken,
});
const yard = new YardOperator({ stateDir: yardState });

let finalResult = null;
try {
  const edge = await yard.deployRelease({
    deploymentId: 'evercraft-public-edge',
    releaseRef: 'a'.repeat(40),
    workloadClass: 'systemia.public-edge.v1',
    capacityEndpoint: node.endpoint,
    allocatorToken,
    input: {
      mode: 'proof_loopback',
      control_host: '127.0.0.1',
      control_port: 0,
      public_host: '127.0.0.1',
      public_port: 0,
      allow_private_upstream: false,
    },
    rollbackTarget: 'proof:household-edge-previous',
    leaseTtlMs: 120000,
  });
  assert.equal(edge.state, 'ready');

  const resident = await yard.deployRelease({
    deploymentId: 'household-fabric-yakima',
    releaseRef: 'b'.repeat(40),
    workloadClass: 'systemia.household-fabric-yakima.v1',
    capacityEndpoint: node.endpoint,
    allocatorToken,
    input: {
      state_root: path.join(computeRoot, 'household-fabric-yakima'),
      browser_edge_url: browserUrl,
      kroger_zip_code: '98902',
      cadence_seconds: 300,
    },
    rollbackTarget: 'proof:household-resident-previous',
    leaseTtlMs: 120000,
  });
  assert.equal(resident.state, 'ready');
  assert.equal(resident.receipt.capacity_node_id, edge.receipt.capacity_node_id);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await reconcileHouseholdFabricPublicRoute({
      yard,
      releaseRef: 'c'.repeat(40),
      allowLoopbackProof: true,
      requestedHostname: 'household-proof',
      routeTtlMs: 120000,
      maxTodayAgeMs: 15 * 60 * 1000,
    });
    if (result.ok) {
      finalResult = result;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  assert.ok(finalResult, 'public route should eventually pass fresh Today canary');
  assert.equal(finalResult.ok, true);
  assert.equal(finalResult.route_scope, 'loopback_proof');
  assert.equal(finalResult.route_verified, false);
  assert.equal(finalResult.promotable, false);
  assert.equal(finalResult.canary.ok, true);
  assert.equal(finalResult.canary.generated_at !== null, true);
  assert.equal(finalResult.authority.allocator_authority_exposed, false);
  assert.equal(finalResult.authority.credential_material_exposed, false);
  assert.equal(finalResult.authority.provider_secret_exposed, false);

  const origin = yard.deploymentStatus('household-fabric-public-origin');
  assert.equal(origin.state, 'ready');
  assert.equal(origin.receipt.capacity_node_id, edge.receipt.capacity_node_id);
  assert.equal(origin.receipt.capacity_node_id, resident.receipt.capacity_node_id);
  assert.equal(origin.public_route.scope, 'loopback_proof');
  assert.equal(origin.public_route.verified, false);

  const publicResponse = await fetch(
    finalResult.origin + '/api/household-fabric/yakima/today'
  );
  assert.equal(publicResponse.status, 200);
  const publicToday = await publicResponse.json();
  assert.equal(publicToday.schema, 'evercraft.household-fabric.public-today.v1');
  assert.equal('categories' in publicToday.coverage, false);
  assert.equal('ledger' in publicToday, false);
  assert.equal(publicToday.guardrails.poverty_score_used, false);
  assert.equal(publicToday.guardrails.sponsorship_affects_rank, false);

  const stale = structuredClone(publicToday);
  stale.generated_at = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const staleCanary = validateHouseholdFabricTodayCanary(stale, {
    now: new Date(),
    maxAgeMs: 15 * 60 * 1000,
  });
  assert.equal(staleCanary.ok, false);

  const overexposed = structuredClone(publicToday);
  overexposed.coverage.categories = { fuel: { internal: true } };
  const exposureCanary = validateHouseholdFabricTodayCanary(overexposed);
  assert.equal(exposureCanary.ok, false);

  const broker = new YardPublicRouteBroker({
    yard,
    providerClient: yard.publicRouteProviderClient('evercraft-public-edge'),
    allowLoopbackProof: true,
  });
  const released = await broker.releaseBinding(finalResult.binding, {
    reason: 'proof_complete',
  });
  assert.equal(released.released, true);

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.household-fabric.public-route-proof.v1',
    same_owned_compute_node: true,
    edge_route_bound: true,
    deployment_receipt_verified: true,
    fresh_today_canary: true,
    stale_today_rejected: true,
    internal_coverage_projection_rejected: true,
    loopback_proof_route_verified: false,
    loopback_proof_promotable: false,
    production_requires_public_https: true,
    allocator_authority_exposed: false,
    credential_material_exposed: false,
  }, null, 2));
} finally {
  for (const id of [
    'household-fabric-public-origin',
    'household-fabric-yakima',
    'evercraft-public-edge',
  ]) {
    try { await yard.stopDeployment(id, { reason: 'proof_complete' }); } catch {}
  }
  try { await node.close(); } catch {}
  await new Promise(resolve => browserServer.close(() => resolve()));
  fs.rmSync(root, { recursive: true, force: true });
}
