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

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'household-public-origin-proof-'));
const computeRoot = path.join(root, 'compute');
const yardState = path.join(root, 'yard');
const allocatorToken = 'household-public-origin-proof-authority';

const browserResult = {
  ok: true,
  engine: 'evercraft-owned-browser-worker-v1',
  final_url: 'https://www.yvl.org/events/',
  text_sha256: 'public-origin-text-proof',
  evidence_receipt_sha256: 'public-origin-browser-receipt',
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
  nodeId: 'household-public-origin-node',
  allocatorToken,
});
const yard = new YardOperator({ stateDir: yardState });

try {
  const resident = await yard.deployRelease({
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
    rollbackTarget: 'proof:household-resident-previous',
    leaseTtlMs: 120000,
  });
  assert.equal(resident.state, 'ready');
  assert.equal(resident.receipt.health_verification, 'healthy');

  const origin = await yard.deploySiblingRelease({
    sourceDeploymentId: 'household-fabric-yakima',
    deploymentId: 'household-fabric-public-origin',
    releaseRef: 'd'.repeat(40),
    workloadClass: 'systemia.household-fabric-public-origin.v1',
    input: {
      source_url: resident.result.local_url,
    },
    rollbackTarget: 'proof:household-public-origin-previous',
    leaseTtlMs: 120000,
  });

  assert.equal(origin.state, 'ready');
  assert.equal(origin.receipt.health_verification, 'healthy');
  assert.equal(origin.receipt.route_verification, 'local_household_public_origin_health_verified_public_route_unbound');
  assert.equal(origin.receipt.capacity_node_id, resident.receipt.capacity_node_id);
  assert.equal(origin.result.public_route_required, true);
  assert.equal(origin.result.source_loopback_only, true);
  assert.equal(origin.result.source_authority_exposed, false);
  assert.equal(origin.result.allocator_authority_exposed, false);
  assert.equal(origin.result.credential_material_exposed, false);
  assert.equal(JSON.stringify(origin.result).includes(allocatorToken), false);
  assert.equal(JSON.stringify(origin.result).includes(resident.result.local_url), false);

  const route = await yard.verifyPublicRoute('household-fabric-public-origin', {
    origin: origin.result.local_url,
    allowLoopbackProof: true,
  });
  assert.equal(route.verification, 'instance_and_deployment_receipt_match');
  assert.equal(route.deployment_receipt_hash, origin.receipt.receipt_hash);
  assert.ok(route.receipt_hash);

  let publicToday = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await fetch(origin.result.local_url + '/api/household-fabric/yakima/today');
    if (response.status === 200) {
      publicToday = await response.json();
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(publicToday, 'projected Today should become available');
  assert.equal(publicToday.ok, true);
  assert.equal(publicToday.schema, 'evercraft.household-fabric.public-today.v1');
  assert.equal(publicToday.opportunities.length, 1);
  assert.equal(publicToday.opportunities[0].title, 'Yakima Central: Family Storytime');
  assert.equal('categories' in publicToday.coverage, false);
  assert.equal('ledger' in publicToday, false);
  assert.equal('receipts' in publicToday, false);
  assert.equal(publicToday.guardrails.poverty_score_used, false);
  assert.equal(publicToday.guardrails.sponsorship_affects_rank, false);

  const healthResponse = await fetch(origin.result.local_url + '/health');
  assert.equal(healthResponse.status, 200);
  const health = await healthResponse.json();
  assert.equal(health.deployment_receipt_bound, true);
  assert.equal(health.deployment_receipt_ref, origin.receipt.receipt_hash);
  assert.equal(health.read_only, true);
  assert.equal(health.public_projection, true);
  assert.equal(health.source_loopback_only, true);
  assert.equal(health.source_authority_exposed, false);
  assert.equal(health.allocator_authority_exposed, false);
  assert.equal(health.credential_material_exposed, false);

  const denied = await fetch(origin.result.local_url + '/api/household-fabric/yakima/today', {
    method: 'POST',
  });
  assert.equal(denied.status, 405);
  const deniedBody = await denied.json();
  assert.equal(deniedBody.error, 'read_only_public_origin');

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.household-fabric.public-origin-proof.v1',
    private_resident: true,
    public_origin_sibling_same_node: true,
    deployment_receipt_bound: true,
    public_projection_verified: true,
    internal_coverage_detail_exposed: false,
    allocator_authority_exposed: false,
    credential_material_exposed: false,
    read_only: true,
    public_edge_route_contract_ready: true,
  }, null, 2));
} finally {
  try { await node.close(); } catch {}
  await new Promise(resolve => browserServer.close(() => resolve()));
  fs.rmSync(root, { recursive: true, force: true });
}
