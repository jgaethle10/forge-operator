import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startEvercraftComputeNode } from '../compute/runtime-node.mjs';
import { YardOperator } from './operator.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'faie-yard-proof-'));
const computeRoot = path.join(root, 'compute');
const yardState = path.join(root, 'yard');
fs.mkdirSync(computeRoot, { recursive: true });

const node = await startEvercraftComputeNode({
  root: computeRoot,
  nodeId: 'faie-yard-proof-node',
});
const yard = new YardOperator({ stateDir: yardState });

try {
  const deployment = await yard.deployRelease({
    deploymentId: 'faie-yard-proof',
    releaseRef: 'faie-yard-proof-release',
    workloadClass: 'systemia.faie.v1',
    capacityEndpoint: node.endpoint,
    input: {
      official_collectors_enabled: false,
      region_profile: 'yakima-basin-wa',
      internal_token: 'faie-yard-proof-token',
    },
    rollbackTarget: 'sha256:' + 'a'.repeat(64),
    leaseTtlMs: 120000,
  });

  assert.equal(deployment.state, 'ready');
  assert.equal(deployment.receipt.runtime_fabric, 'Evercraft Compute');
  assert.equal(deployment.receipt.workload_class, 'systemia.faie.v1');
  assert.equal(deployment.receipt.health_verification, 'healthy');
  assert.equal(
    deployment.receipt.route_verification,
    'local_faie_health_verified_public_route_unbound'
  );
  assert.equal(deployment.result.public_route_required, true);
  assert.equal(deployment.result.public_health_path, '/health');
  assert.equal(deployment.result.human_ui_path, '/faie/');
  assert.equal(deployment.result.mcp_path, '/mcp/faie');
  assert.ok(deployment.result.local_url);

  const health = await fetch(deployment.result.local_url + '/health').then((r) => r.json());
  assert.equal(health.ok, true);
  assert.equal(health.service, 'faie-yard-runtime');
  assert.equal(health.product, 'FAIE');
  assert.equal(health.runtime, 'Evercraft Compute');
  assert.equal(health.workload_class, 'systemia.faie.v1');
  assert.equal(health.instance_id, deployment.result.instance_id);
  assert.equal(health.deployment_receipt_bound, true);
  assert.equal(health.deployment_receipt_ref, deployment.receipt.receipt_hash);
  assert.equal(health.read_only_public, true);
  assert.equal(health.public_investigations_persisted, false);
  assert.equal(health.base44_required, false);
  assert.equal(health.external_ai_required, false);
  assert.equal(health.decision_authority, false);
  assert.equal(health.publication_authority, false);

  const page = await fetch(deployment.result.local_url + '/faie/');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Evidence for the physical world/);

  const mcpInit = await fetch(deployment.result.local_url + '/mcp/faie', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'yard-proof', version: '1' },
      },
    }),
  }).then((r) => r.json());
  assert.equal(mcpInit.result.serverInfo.name, 'evercraft-faie');

  const mcpTools = await fetch(deployment.result.local_url + '/mcp/faie', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    }),
  }).then((r) => r.json());
  assert.deepEqual(
    mcpTools.result.tools.map((tool) => tool.name),
    [
      'investigate_faie_evidence',
      'get_faie_signal_snapshot',
      'get_faie_health',
    ]
  );
  assert.ok(mcpTools.result.tools.every((tool) => tool.annotations.readOnlyHint === true));
  assert.ok(mcpTools.result.tools.every((tool) => tool.annotations.destructiveHint === false));

  const routeState = await yard.verifyRoute('faie-yard-proof');
  assert.equal(routeState.ok, false);
  assert.equal(routeState.state, 'public_route_unbound');
  assert.equal(routeState.local_health_ok, true);

  const loopbackRoute = await yard.verifyPublicRoute('faie-yard-proof', {
    origin: deployment.result.local_url,
    allowLoopbackProof: true,
  });
  assert.equal(loopbackRoute.scope, 'loopback_proof');
  assert.equal(loopbackRoute.verified, false);
  assert.equal(loopbackRoute.instance_id, deployment.result.instance_id);
  assert.equal(loopbackRoute.service, 'faie-yard-runtime');

  const stopped = await yard.stopDeployment('faie-yard-proof', {
    reason: 'proof_complete',
  });
  assert.equal(stopped.ok, true);

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.faie.yard-proof.v1',
    product: 'FAIE',
    workload_class: 'systemia.faie.v1',
    runtime_fabric: 'Evercraft Compute',
    deployment_surface: 'Yard Operator',
    native_mcp_path: '/mcp/faie',
    human_ui_path: '/faie/',
    deployment_receipt_bound: true,
    public_preview_persists_questions: false,
    base44_required: false,
    public_https_verified: false,
    proof_scope: 'loopback_only',
    deployment_receipt: deployment.receipt.receipt_hash,
    route_receipt: loopbackRoute.receipt_hash,
  }, null, 2));
} finally {
  await node.close();
  fs.rmSync(root, { recursive: true, force: true });
}
