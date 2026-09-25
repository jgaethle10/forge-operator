import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startEvercraftComputeNode } from '../compute/runtime-node.mjs';
import { YardOperator } from './operator.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yard-chum-public-origin-'));
const computeRoot = path.join(root, 'compute');
const publicRoot = path.join(computeRoot, 'release', 'public');
const stateDir = path.join(root, 'yard');
fs.mkdirSync(path.join(publicRoot, 'chum'), { recursive: true });
fs.writeFileSync(path.join(publicRoot, 'chum', 'index.html'), '<h1>CHUM public origin proof</h1>\n');
fs.writeFileSync(path.join(publicRoot, 'sitemap.xml'), [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  '  <url><loc>/chum/</loc></url>',
  '</urlset>',
  ''
].join('\n'));
fs.writeFileSync(path.join(publicRoot, 'robots.txt'), 'User-agent: *\nAllow: /\n');
fs.writeFileSync(path.join(publicRoot, 'chum', 'crawl-state.json'), JSON.stringify({
  schema: 'evercraft.chum.crawl-state.v1',
  url_count: 1,
  entries: {}
}) + '\n');

const node = await startEvercraftComputeNode({ root: computeRoot, nodeId: 'chum-origin-proof-node' });
const yard = new YardOperator({ stateDir });

try {
  const releaseRef = '58d17315961483c0ab86be94b181d070eb6ea45e';
  const deployment = await yard.deployRelease({
    deploymentId: 'chum-public-origin-proof',
    releaseRef,
    workloadClass: 'systemia.chum-public-origin.v1',
    capacityEndpoint: node.endpoint,
    input: { public_root: publicRoot, host: '127.0.0.1', port: 0 },
    rollbackTarget: 'proof:previous-chum-origin',
    leaseTtlMs: 120_000
  });

  assert.equal(deployment.state, 'ready');
  assert.equal(deployment.receipt.health_verification, 'healthy');
  assert.equal(deployment.receipt.route_verification, 'local_origin_health_verified_public_route_unbound');
  assert.equal(deployment.result.read_only_public_origin, true);
  assert.ok(deployment.result.local_url);
  assert.ok(deployment.result.instance_id);
  assert.equal(yard.getLiveUrl('chum-public-origin-proof'), null);

  const beforePublicRoute = await yard.verifyRoute('chum-public-origin-proof');
  assert.equal(beforePublicRoute.ok, false);
  assert.equal(beforePublicRoute.state, 'public_route_unbound');
  assert.equal(beforePublicRoute.local_health_ok, true);

  await assert.rejects(
    yard.verifyPublicRoute('chum-public-origin-proof', { origin: deployment.result.local_url }),
    /loopback is not a public route/
  );

  const localProof = await yard.verifyPublicRoute('chum-public-origin-proof', {
    origin: deployment.result.local_url,
    allowLoopbackProof: true
  });
  assert.equal(localProof.schema, 'evercraft.yard.public-route-receipt.v1');
  assert.equal(localProof.scope, 'loopback_proof');
  assert.equal(localProof.verified, false);
  assert.equal(localProof.deployment_receipt_hash, deployment.receipt.receipt_hash);

  assert.throws(
    () => yard.runtimeOriginReceipt('chum-public-origin-proof'),
    /verified public HTTPS route is required/
  );

  const stop = await yard.stopDeployment('chum-public-origin-proof', { reason: 'proof_complete' });
  assert.equal(stop.ok, true);

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.yard.chum-public-origin-proof.v1',
    evercraft_compute_used: true,
    public_root_bounded: true,
    initial_local_health_verified: true,
    public_route_fails_closed_until_https_verified: true,
    deployment_receipt: deployment.receipt.receipt_hash,
    local_route_receipt: localProof.receipt_hash
  }, null, 2));
} finally {
  await node.close();
  fs.rmSync(root, { recursive: true, force: true });
}
