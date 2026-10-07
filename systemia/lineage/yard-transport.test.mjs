import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LineageStore } from './core.mjs';
import { LargeObjectStore } from './large-object.mjs';
import { fetchLargeObject, pushLargeObject } from './large-object-remote.mjs';
import { pushCommitGraph } from './remote-protocol.mjs';
import { openYardLineageRemote } from './yard-transport.mjs';
import { startLineageRemoteRuntime } from './yard-remote-runtime.mjs';

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function send(res, status, body) {
  const bytes = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': bytes.length,
  });
  res.end(bytes);
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

test('Yard Lineage session uses short-lived authority and carries normal graph push', async () => {
  const sourceRoot = await mkdtemp(join(tmpdir(), 'lineage-yard-source-'));
  const remoteRoot = await mkdtemp(join(tmpdir(), 'lineage-yard-state-'));
  const fetchedLargeRoot = await mkdtemp(join(tmpdir(), 'lineage-yard-large-fetch-'));
  const allocatorToken = 'allocator-secret';
  const leaseToken = 'lease-secret';
  const relayToken = 'relay-secret';
  const nodeId = 'yard-node-7';
  const fingerprint = 'sha256:' + 'a'.repeat(64);

  let runtime = null;
  let serviceId = null;
  let leaseReleased = false;
  let relayReleased = false;

  const capacityServer = http.createServer(async (req, res) => {
    const body = await readJson(req);
    if (req.method === 'POST' && req.url === '/v1/leases') {
      if (req.headers.authorization !== `Bearer ${allocatorToken}`) {
        return send(res, 401, { error: 'allocator_auth_required' });
      }
      assert.equal(body.workload_class, 'systemia.lineage-remote.v1');
      return send(res, 201, {
        lease_id: 'lease-1',
        token: leaseToken,
        workload_class: body.workload_class,
        expires_at: new Date(Date.now() + 300_000).toISOString(),
      });
    }

    if (req.method === 'POST' && req.url === '/v1/jobs') {
      if (body.lease_id !== 'lease-1' || body.token !== leaseToken) {
        return send(res, 401, { error: 'invalid_lease' });
      }
      runtime = await startLineageRemoteRuntime({ stateDir: remoteRoot });
      serviceId = 'svc-lineage-1';
      return send(res, 200, {
        ok: true,
        result: {
          schema: 'evercraft.compute.resident-service.v1',
          service_id: serviceId,
          workload_class: 'systemia.lineage-remote.v1',
          protocol: 'evercraft.lineage.remote.v1',
          remote_key: body.input?.remote_key || null,
        },
        receipt: { receipt_hash: 'compute-service-receipt' },
      });
    }

    if (req.method === 'POST' && req.url === '/v1/leases/lease-1/release') {
      if (body.token !== leaseToken) return send(res, 401, { error: 'invalid_lease' });
      leaseReleased = true;
      if (runtime) {
        await runtime.close();
        runtime = null;
      }
      return send(res, 200, { ok: true, receipt: { receipt_hash: 'lease-release-receipt' } });
    }

    return send(res, 404, { error: 'not_found' });
  });
  const capacityEndpoint = await listen(capacityServer);

  const relayServer = http.createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${relayToken}`) {
      return send(res, 401, { error: 'relay_auth_required' });
    }
    if (!runtime || !serviceId) return send(res, 503, { error: 'service_unavailable' });

    const envelope = await readJson(req);
    const raw = Buffer.from(String(envelope.body_base64 || ''), 'base64');
    const response = await fetch(runtime.service_url + String(envelope.path || '/'), {
      method: String(envelope.method || 'GET'),
      headers: envelope.headers || {},
      body: ['GET', 'HEAD'].includes(String(envelope.method || 'GET').toUpperCase())
        ? undefined
        : raw,
    });
    const responseBytes = Buffer.from(await response.arrayBuffer());
    return send(res, 200, {
      ok: true,
      status: response.status,
      headers: { 'content-type': response.headers.get('content-type') || 'application/json' },
      body_base64: responseBytes.toString('base64'),
      receipt: { receipt_hash: 'relay-http-receipt' },
    });
  });
  const relayUrl = await listen(relayServer);

  let grantCalls = 0;
  const yard = {
    async listRemoteCapacityNodes() {
      return {
        schema: 'evercraft.yard.remote-capacity-nodes.v1',
        compute_management_receipt_hash: 'inventory-receipt',
        nodes: [{
          node_id: nodeId,
          device_fingerprint: fingerprint,
          connected: true,
          capacity: {
            authorized: true,
            session_attestation_verified: true,
            zero_cost: true,
            device_fingerprint: fingerprint,
            supported_workloads: ['systemia.lineage-remote.v1'],
          },
        }],
      };
    },
    async remoteCapacityGrant() {
      grantCalls += 1;
      return {
        schema: 'evercraft.yard.remote-capacity-grant.v1',
        node_id: nodeId,
        device_fingerprint: fingerprint,
        capacity_endpoint: capacityEndpoint,
        allocator_token: allocatorToken,
        control_grant_receipt_hash: 'control-grant-receipt',
        public_route_receipt_hash: 'public-route-receipt',
      };
    },
    async createRemoteServiceRelay(_deployment, input) {
      assert.equal(input.nodeId, nodeId);
      assert.equal(input.serviceId, serviceId);
      return {
        schema: 'evercraft.yard.remote-service-relay.v1',
        relay_id: 'relay-1',
        relay_url: relayUrl,
        relay_token: relayToken,
        expires_at: new Date(Date.now() + 300_000).toISOString(),
        compute_management_receipt_hash: 'relay-create-receipt',
      };
    },
    async releaseRemoteServiceRelay(_deployment, relayId) {
      assert.equal(relayId, 'relay-1');
      relayReleased = true;
      return { released: true };
    },
  };

  try {
    const session = await openYardLineageRemote({
      yard,
      brokerDeploymentId: 'broker-1',
      nodeId,
      remoteKey: 'studio-canon',
    });

    assert.equal(grantCalls, 1);
    assert.equal(session.authority_material_persisted, false);
    assert.equal(session.allocator_token_persisted, false);
    assert.equal(session.lease_token_persisted, false);
    assert.equal(session.relay_token_persisted, false);
    assert.equal(session.health.protocol, 'evercraft.lineage.remote.v1');

    const source = new LineageStore(sourceRoot);
    await source.init();
    await writeFile(join(sourceRoot, 'canon.json'), '{"world":"alive"}\n');
    const commit = await source.commit({
      message: 'yard sync',
      actor: { type: 'agent', id: 'systemia-yard-sync' },
    });

    const pushed = await pushCommitGraph({
      store: source,
      remote: session.remote,
      branch: 'main',
      expectedRemoteHead: null,
    });
    assert.equal(pushed.head, commit.commit_id);
    assert.equal(await session.remote.readRef('main'), commit.commit_id);

    const sourceLarge = new LargeObjectStore(source.dir);
    const fetchedLarge = new LargeObjectStore(fetchedLargeRoot);
    await Promise.all([sourceLarge.init(), fetchedLarge.init()]);

    const v1 = Buffer.concat([
      Buffer.alloc(180_000, 'A'),
      Buffer.alloc(180_000, 'B'),
      Buffer.alloc(180_000, 'C'),
    ]);
    const v2 = Buffer.concat([
      Buffer.alloc(180_000, 'A'),
      Buffer.from('SHOT-17-CAMERA-CUT'),
      Buffer.alloc(180_000, 'B'),
      Buffer.alloc(180_000, 'C'),
    ]);
    const chunking = {
      minChunkBytes: 16 * 1024,
      averageChunkBytes: 32 * 1024,
      maxChunkBytes: 64 * 1024,
    };

    const master1 = await sourceLarge.putBuffer(v1, {
      logicalName: 'fallen-master-v1.mov',
      mediaType: 'video/quicktime',
      chunking,
    });
    const master2 = await sourceLarge.putBuffer(v2, {
      logicalName: 'fallen-master-v2.mov',
      mediaType: 'video/quicktime',
      chunking,
    });

    const firstMasterPush = await pushLargeObject({
      store: sourceLarge,
      remote: session.remote,
      manifestId: master1.manifest_id,
      concurrency: 4,
    });
    assert.ok(firstMasterPush.transferred_chunks > 0);
    assert.ok(firstMasterPush.transferred_chunks <= firstMasterPush.chunks);
    assert.equal(
      firstMasterPush.transferred_chunks + firstMasterPush.reused_chunks,
      firstMasterPush.chunks
    );

    const secondMasterPush = await pushLargeObject({
      store: sourceLarge,
      remote: session.remote,
      manifestId: master2.manifest_id,
      concurrency: 4,
    });
    assert.ok(secondMasterPush.reused_chunks > 0);
    assert.ok(secondMasterPush.transferred_chunks < secondMasterPush.chunks);

    const fetchedMaster = await fetchLargeObject({
      store: fetchedLarge,
      remote: session.remote,
      manifestId: master2.manifest_id,
      concurrency: 4,
    });
    assert.equal(fetchedMaster.content_sha256, master2.content_sha256);
    assert.deepEqual(await fetchedLarge.materialize(master2.manifest_id), v2);

    const closed = await session.close();
    assert.equal(closed.allocator_token_retained, false);
    assert.equal(closed.lease_token_retained, false);
    assert.equal(closed.relay_token_retained, false);
    assert.equal(relayReleased, true);
    assert.equal(leaseReleased, true);

    await assert.rejects(
      () => session.remote.init(),
      /lineage_yard_relay_authority_revoked/
    );
  } finally {
    if (runtime) await runtime.close();
    await new Promise((resolve) => capacityServer.close(resolve));
    await new Promise((resolve) => relayServer.close(resolve));
    await rm(sourceRoot, { recursive: true, force: true });
    await rm(remoteRoot, { recursive: true, force: true });
    await rm(fetchedLargeRoot, { recursive: true, force: true });
  }
});

test('Yard Lineage transport rejects unverified capacity before requesting authority', async () => {
  let grantCalls = 0;
  const yard = {
    async listRemoteCapacityNodes() {
      return {
        nodes: [{
          node_id: 'bad-node',
          device_fingerprint: 'sha256:' + 'b'.repeat(64),
          connected: true,
          capacity: {
            authorized: true,
            session_attestation_verified: false,
            zero_cost: true,
            device_fingerprint: 'sha256:' + 'b'.repeat(64),
            supported_workloads: ['systemia.lineage-remote.v1'],
          },
        }],
      };
    },
    async remoteCapacityGrant() {
      grantCalls += 1;
      throw new Error('must not be called');
    },
    async createRemoteServiceRelay() {},
    async releaseRemoteServiceRelay() {},
  };

  await assert.rejects(
    () => openYardLineageRemote({
      yard,
      brokerDeploymentId: 'broker-1',
      nodeId: 'bad-node',
    }),
    (error) => error.message === 'lineage_yard_node_not_eligible' && error.node.attested === false
  );
  assert.equal(grantCalls, 0);
});
