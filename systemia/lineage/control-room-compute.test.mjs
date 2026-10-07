import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LineageStore } from './core.mjs';
import { startEvercraftComputeNode } from '../compute/runtime-node.mjs';

async function requestJson(url, {
  method = 'GET',
  token = '',
  body = undefined,
} = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const parsed = await response.json().catch(() => ({}));
  return { response, body: parsed };
}

function bridgeBody(result) {
  return JSON.parse(
    Buffer.from(String(result.body_base64 || ''), 'base64').toString('utf8')
  );
}

test('Evercraft Compute hosts Lineage Control Room as lease-bound read-only service', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lineage-control-compute-'));
  const workspace = join(root, 'workspace');
  const allocatorToken = 'allocator-control-room-secret';
  let compute = null;

  try {
    const store = new LineageStore(workspace);
    await store.init();
    await writeFile(join(workspace, 'canon.json'), '{"state":"owned"}\n');
    const committed = await store.commit({
      message: 'control room compute proof',
      actor: { type: 'agent', id: 'systemia-proof' },
      authority: { mutation: true, publish: false, payment: false },
    });

    compute = await startEvercraftComputeNode({
      nodeId: 'lineage-control-room-node',
      root,
      host: '127.0.0.1',
      port: 0,
      allocatorToken,
      leaseTtlMs: 60_000,
    });

    const lease = await requestJson(compute.endpoint + '/v1/leases', {
      method: 'POST',
      token: allocatorToken,
      body: {
        workload_class: 'systemia.lineage-control-room.v1',
        requested_ttl_ms: 60_000,
      },
    });
    assert.equal(lease.response.status, 201);
    assert.equal(
      lease.body.workload_class,
      'systemia.lineage-control-room.v1'
    );

    const started = await requestJson(compute.endpoint + '/v1/jobs', {
      method: 'POST',
      body: {
        lease_id: lease.body.lease_id,
        token: lease.body.token,
        workload_class: 'systemia.lineage-control-room.v1',
        input: { workspace_root: workspace },
      },
    });
    assert.equal(started.response.status, 200);
    assert.equal(
      started.body.result.protocol,
      'evercraft.lineage.control-room.v1'
    );
    assert.equal(started.body.result.mode, 'read_only');
    assert.equal(started.body.result.mutation_authority, false);
    assert.equal(started.body.result.publication_authority, false);
    assert.equal(started.body.result.deployment_authority, false);
    assert.equal(started.body.result.payment_authority, false);
    assert.equal(started.body.result.private_data_authority, false);
    assert.equal(started.body.result.authority_material_exposed, false);

    const serviceId = started.body.result.service_id;

    const health = await requestJson(
      compute.endpoint + `/v1/services/${serviceId}/health`
    );
    assert.equal(health.response.status, 200);
    assert.equal(health.body.ok, true);
    assert.equal(health.body.mode, 'read_only');
    assert.equal(health.body.mutation_authority, false);

    const snapshotBridge = await requestJson(
      compute.endpoint + `/v1/services/${serviceId}/http-bridge`,
      {
        method: 'POST',
        token: allocatorToken,
        body: {
          method: 'GET',
          path: '/v1/snapshot?ref=main&limit=25',
          headers: { accept: 'application/json' },
          body_base64: '',
        },
      }
    );
    assert.equal(snapshotBridge.response.status, 200);
    assert.equal(snapshotBridge.body.ok, true);
    assert.equal(snapshotBridge.body.status, 200);
    const snapshot = bridgeBody(snapshotBridge.body);
    assert.equal(snapshot.mode, 'read_only');
    assert.equal(snapshot.head, committed.commit_id);
    assert.equal(snapshot.capabilities.mutation, false);

    const htmlBridge = await requestJson(
      compute.endpoint + `/v1/services/${serviceId}/http-bridge`,
      {
        method: 'POST',
        token: allocatorToken,
        body: {
          method: 'GET',
          path: '/',
          headers: { accept: 'text/html' },
          body_base64: '',
        },
      }
    );
    assert.equal(htmlBridge.response.status, 200);
    assert.equal(htmlBridge.body.status, 200);
    const html = Buffer.from(
      htmlBridge.body.body_base64,
      'base64'
    ).toString('utf8');
    assert.match(html, /Lineage<\/b> Control Room/);
    assert.match(html, /READ ONLY/);

    const blockedMutation = await requestJson(
      compute.endpoint + `/v1/services/${serviceId}/http-bridge`,
      {
        method: 'POST',
        token: allocatorToken,
        body: {
          method: 'POST',
          path: '/v1/snapshot',
          headers: { 'content-type': 'application/json' },
          body_base64: Buffer.from('{}').toString('base64'),
        },
      }
    );
    assert.equal(blockedMutation.response.status, 422);
    assert.match(
      String(blockedMutation.body.error || ''),
      /bridge_route_not_allowed/
    );

    const release = await requestJson(
      compute.endpoint + `/v1/leases/${lease.body.lease_id}/release`,
      {
        method: 'POST',
        body: { token: lease.body.token },
      }
    );
    assert.equal(release.response.status, 200);

    const stopped = await requestJson(
      compute.endpoint + `/v1/services/${serviceId}/health`
    );
    assert.equal(stopped.response.status, 404);
    assert.equal(stopped.body.error, 'service_not_found');
  } finally {
    if (compute) await compute.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('Compute rejects Control Room workspaces outside its admitted root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lineage-control-root-'));
  const outside = await mkdtemp(join(tmpdir(), 'lineage-control-outside-'));
  const allocatorToken = 'allocator-control-room-secret';
  let compute = null;

  try {
    const outsideStore = new LineageStore(outside);
    await outsideStore.init();

    compute = await startEvercraftComputeNode({
      nodeId: 'lineage-control-room-node',
      root,
      host: '127.0.0.1',
      port: 0,
      allocatorToken,
    });

    const lease = await requestJson(compute.endpoint + '/v1/leases', {
      method: 'POST',
      token: allocatorToken,
      body: { workload_class: 'systemia.lineage-control-room.v1' },
    });
    assert.equal(lease.response.status, 201);

    const started = await requestJson(compute.endpoint + '/v1/jobs', {
      method: 'POST',
      body: {
        lease_id: lease.body.lease_id,
        token: lease.body.token,
        workload_class: 'systemia.lineage-control-room.v1',
        input: { workspace_root: outside },
      },
    });
    assert.equal(started.response.status, 403);
    assert.equal(
      started.body.error,
      'lineage_control_room_workspace_outside_admitted_root'
    );
  } finally {
    if (compute) await compute.close();
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('Compute rejects uninitialized admitted workspace for Control Room', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lineage-control-uninitialized-'));
  const workspace = join(root, 'workspace');
  const allocatorToken = 'allocator-control-room-secret';
  let compute = null;

  try {
    await writeFile(join(root, 'placeholder.txt'), 'root\n');
    compute = await startEvercraftComputeNode({
      nodeId: 'lineage-control-room-node',
      root,
      host: '127.0.0.1',
      port: 0,
      allocatorToken,
    });

    const lease = await requestJson(compute.endpoint + '/v1/leases', {
      method: 'POST',
      token: allocatorToken,
      body: { workload_class: 'systemia.lineage-control-room.v1' },
    });
    assert.equal(lease.response.status, 201);

    const started = await requestJson(compute.endpoint + '/v1/jobs', {
      method: 'POST',
      body: {
        lease_id: lease.body.lease_id,
        token: lease.body.token,
        workload_class: 'systemia.lineage-control-room.v1',
        input: { workspace_root: workspace },
      },
    });
    assert.equal(started.response.status, 422);
    assert.equal(
      started.body.error,
      'lineage_control_room_workspace_not_initialized'
    );
  } finally {
    if (compute) await compute.close();
    await rm(root, { recursive: true, force: true });
  }
});
