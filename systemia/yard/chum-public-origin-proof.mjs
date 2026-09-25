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
  await assert.rejects(
    yard.activateCrawlPressure('chum-public-origin-proof', { root }),
    /verified public HTTPS route is required/
  );

  const originalFetch = globalThis.fetch;
  let indexNowPayload = null;
  globalThis.fetch = async (input, init = {}) => {
    const raw = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    if (raw.startsWith('https://public-origin.example.test')) {
      const target = new URL(raw);
      return originalFetch(deployment.result.local_url + target.pathname + target.search, init);
    }
    if (raw === 'https://api.indexnow.org/indexnow') {
      indexNowPayload = JSON.parse(String(init.body || '{}'));
      return new Response('', { status: 200 });
    }
    return originalFetch(input, init);
  };

  let activation;
  try {
    activation = await yard.verifyAndActivatePublicRoute('chum-public-origin-proof', {
      origin: 'https://public-origin.example.test',
      root,
      maxBroadcastUrls: 100
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(activation.public_route.verified, true);
  assert.equal(activation.public_route.scope, 'public_https');
  assert.equal(activation.runtime_origin.verified, true);
  assert.equal(activation.runtime_origin.origin, 'https://public-origin.example.test');
  assert.equal(activation.crawl.broadcast.status, 'accepted');
  assert.equal(activation.crawl.broadcast.submitted, 1);
  assert.equal(activation.activation.submitted, 1);
  assert.deepEqual(indexNowPayload.urlList, ['https://public-origin.example.test/chum/']);

  const exportedOrigin = JSON.parse(fs.readFileSync(
    path.join(publicRoot, '.well-known', 'evercraft-runtime-origin.json'),
    'utf8'
  ));
  assert.equal(exportedOrigin.verified, true);
  assert.equal(exportedOrigin.origin, 'https://public-origin.example.test');
  assert.equal(yard.getLiveUrl('chum-public-origin-proof'), 'https://public-origin.example.test');

  const stop = await yard.stopDeployment('chum-public-origin-proof', { reason: 'proof_complete' });
  assert.equal(stop.ok, true);

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.yard.chum-public-origin-proof.v1',
    evercraft_compute_used: true,
    public_root_bounded: true,
    initial_local_health_verified: true,
    public_route_fails_closed_until_https_verified: true,
    verified_route_activates_crawl_pressure: true,
    runtime_origin_receipt_written: true,
    indexnow_broadcast_proved: true,
    deployment_receipt: deployment.receipt.receipt_hash,
    local_route_receipt: localProof.receipt_hash,
    public_route_receipt: activation.public_route.receipt_hash,
    crawl_activation_receipt: activation.activation.receipt_hash
  }, null, 2));
} finally {
  await node.close();
  fs.rmSync(root, { recursive: true, force: true });
}
