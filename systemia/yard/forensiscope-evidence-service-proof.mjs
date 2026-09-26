import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startNodeSeed } from '../compute/node-seed.mjs';
import { YardOperator } from './operator.mjs';
import { evaluateForensiScopePublicCutover } from '../forensiscope/public-cutover.mjs';
import { canaryForensiScopePublicMcp } from '../forensiscope/public-mcp-canary.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forensiscope-yard-proof-'));
const computeRoot = path.join(root, 'compute');
const stateRoot = path.join(computeRoot, 'services', 'forensiscope-evidence');
const yardState = path.join(root, 'yard');
const allocatorToken = 'forensiscope-yard-proof-allocator';
const releaseRef = '8e66fff27bf4004c8ee62194f08bb3483f1e1ece';

process.env.FORENSISCOPE_EVIDENCE_ACCESS_KEY =
  'forensiscope-yard-proof-access-key-2026-09-25-immutable';

fs.mkdirSync(stateRoot, { recursive: true, mode: 0o700 });

const seed = await startNodeSeed({
  root: computeRoot,
  nodeId: 'forensiscope-yard-proof-node',
  host: '127.0.0.1',
  port: 0,
  advertiseHost: '127.0.0.1',
  allocatorToken,
  announce: false
});
const yard = new YardOperator({ stateDir: yardState });

try {
  const deployment = await yard.deployRelease({
    deploymentId: 'forensiscope-evidence-query-proof',
    releaseRef,
    workloadClass: 'systemia.forensiscope-evidence-query.v1',
    capacityEndpoint: seed.endpoint,
    allocatorToken,
    input: { state_root: stateRoot },
    rollbackTarget: 'proof:forensiscope-evidence-previous',
    leaseTtlMs: 120_000
  });

  assert.equal(deployment.state, 'ready');
  assert.equal(deployment.receipt.health_verification, 'healthy');
  assert.equal(
    deployment.receipt.route_verification,
    'local_forensiscope_health_verified_public_route_unbound'
  );
  assert.equal(deployment.result.public_health_path, '/v1/health');
  assert.equal(deployment.result.public_mcp_path, '/mcp');
  assert.equal(deployment.result.raw_media_intake, false);
  assert.equal(deployment.result.starts_analysis_jobs, false);
  assert.equal(deployment.result.checkout_or_payment, false);

  const health = await fetch(
    deployment.result.local_url + '/v1/health'
  ).then((response) => response.json());
  assert.equal(health.service, 'forensiscope-evidence-query');
  assert.equal(health.instance_id, deployment.result.instance_id);
  assert.equal(health.deployment_receipt_bound, true);
  assert.equal(health.deployment_receipt_ref, deployment.receipt.receipt_hash);
  assert.equal(health.raw_media_intake, false);
  assert.equal(health.starts_analysis_jobs, false);
  assert.equal(health.checkout_or_payment, false);
  assert.equal(health.evidence_access_required, true);
  assert.equal(health.privacy_safe_access_audit_receipts, true);

  const mcpResponse = await fetch(deployment.result.local_url + '/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {}
    })
  });
  assert.equal(mcpResponse.status, 200);
  const mcp = await mcpResponse.json();
  assert.ok(mcp.result.tools.length >= 5);
  for (const tool of mcp.result.tools) {
    if (tool.name === 'forensiscope_compare_evidence') continue;
    assert.ok(tool.inputSchema.required.includes('evidence_ref'));
    assert.ok(tool.inputSchema.required.includes('access_token'));
  }

  const beforeRoute = await yard.verifyRoute('forensiscope-evidence-query-proof');
  assert.equal(beforeRoute.ok, false);
  assert.equal(beforeRoute.state, 'public_route_unbound');
  assert.equal(beforeRoute.local_health_ok, true);

  await assert.rejects(
    yard.verifyPublicRoute('forensiscope-evidence-query-proof', {
      origin: deployment.result.local_url
    }),
    /loopback is not a public route/
  );

  const loopback = await yard.verifyPublicRoute(
    'forensiscope-evidence-query-proof',
    {
      origin: deployment.result.local_url,
      allowLoopbackProof: true
    }
  );
  assert.equal(loopback.scope, 'loopback_proof');
  assert.equal(loopback.verified, false);
  assert.equal(loopback.service, 'forensiscope-evidence-query');

  const loopbackDeployment = yard.deploymentStatus('forensiscope-evidence-query-proof');
  const loopbackCanary = await canaryForensiScopePublicMcp({
    origin: deployment.result.local_url,
    deploymentReceiptHash: deployment.receipt.receipt_hash,
    allowLoopbackProof: true
  });
  assert.equal(loopbackCanary.schema, 'evercraft.forensiscope.public-mcp-canary.v1');
  assert.equal(loopbackCanary.scope, 'loopback_proof');
  assert.equal(loopbackCanary.verified, false);
  assert.equal(loopbackCanary.health_ok, true);
  assert.equal(loopbackCanary.initialize_or_discover_ok, true);
  assert.equal(loopbackCanary.tools_list_ok, true);
  assert.equal(loopbackCanary.scoped_access_declared, true);
  assert.equal(loopbackCanary.scoped_access_enforced, true);
  assert.equal(loopbackCanary.raw_media_tools_exposed, false);
  assert.equal(loopbackCanary.checkout_tools_exposed, false);

  const blockedCutover = evaluateForensiScopePublicCutover({
    deployment: loopbackDeployment,
    canary: loopbackCanary
  });
  assert.equal(blockedCutover.eligible, false);
  assert.equal(blockedCutover.migration_action, 'keep_existing_public_mcp_origin');
  assert.ok(
    blockedCutover.blockers.some((entry) =>
      entry.code === 'public_https_route_not_verified'
    )
  );

  const syntheticOrigin = 'https://forensiscope-proof.example';
  const eligibleDeployment = structuredClone(loopbackDeployment);
  eligibleDeployment.public_route = {
    ...eligibleDeployment.public_route,
    origin: syntheticOrigin,
    scope: 'public_https',
    verified: true,
    service: 'forensiscope-evidence-query',
    deployment_receipt_hash: eligibleDeployment.receipt.receipt_hash,
    instance_id: eligibleDeployment.result.instance_id
  };
  const eligibleCanary = {
    ...loopbackCanary,
    origin: syntheticOrigin,
    scope: 'public_https',
    verified: true,
    deployment_receipt_hash: eligibleDeployment.receipt.receipt_hash,
    initialize_or_discover_ok: true,
    tools_list_ok: true,
    scoped_access_enforced: true,
    raw_media_tools_exposed: false,
    checkout_tools_exposed: false
  };
  const eligibleCutover = evaluateForensiScopePublicCutover({
    deployment: eligibleDeployment,
    canary: eligibleCanary
  });
  assert.equal(eligibleCutover.eligible, true);
  assert.deepEqual(eligibleCutover.blockers, []);
  assert.equal(
    eligibleCutover.migration_action,
    'public_mcp_origin_may_be_updated_with_receipt'
  );

  await yard.stopDeployment('forensiscope-evidence-query-proof', {
    reason: 'proof_complete'
  });

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.forensiscope.yard-deployment-proof.v1',
    runtime: 'Evercraft Compute',
    deployment_surface: 'Systemia Yard Operator',
    deployment_receipt_bound: true,
    local_mcp_tools_list_verified: true,
    scoped_evidence_access_declared: true,
    loopback_mcp_canary_passed: true,
    raw_media_intake: false,
    analysis_admission: false,
    checkout_or_payment: false,
    public_https_verified: false,
    public_cutover_blocked_until_https_and_canary: true,
    cutover_policy_positive_path_proved: true
  }));
} finally {
  try { await seed.close(); } catch {}
  fs.rmSync(root, { recursive: true, force: true });
}
