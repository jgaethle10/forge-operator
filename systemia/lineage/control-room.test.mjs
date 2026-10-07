import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LineageStore } from './core.mjs';
import { ReleaseRegistry } from './release-pointer.mjs';
import {
  buildLineageControlRoomSnapshot,
  inspectLineageCommit,
  renderLineageControlRoomHtml,
  startLineageControlRoom,
} from './control-room.mjs';

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'lineage-control-room-'));
  const store = new LineageStore(root);
  await store.init();

  await writeFile(join(root, 'world.json'), '{"state":"base"}\n');
  const first = await store.commit({
    message: 'world baseline',
    actor: { type: 'human', id: 'operator' },
    authority: { mutation: true, publish: false, payment: false },
  });

  await store.createBranch('agent/camera', first.commit_id);
  await store.switchBranch('agent/camera');
  await writeFile(join(root, 'world.json'), '{"state":"camera-pass"}\n');
  const second = await store.commit({
    message: 'camera pass',
    actor: { type: 'agent', id: 'fallen-director' },
    rationale: 'Test a new camera path without publication authority.',
    authority: { mutation: true, publish: false, payment: false },
  });

  const releases = new ReleaseRegistry(store);
  await releases.record({
    name: 'camera-preview',
    channel: 'preview',
    commitish: second.commit_id,
    state: 'candidate',
    actor: { type: 'human', id: 'operator' },
  });

  return { root, store, first, second };
}

test('Control Room snapshot exposes history structure without file contents', async () => {
  const { root, store, second } = await setup();
  try {
    const snapshot = await buildLineageControlRoomSnapshot(store, {
      ref: 'agent/camera',
      limit: 50,
    });

    assert.equal(snapshot.mode, 'read_only');
    assert.equal(snapshot.current_branch, 'agent/camera');
    assert.equal(snapshot.head, second.commit_id);
    assert.equal(snapshot.capabilities.mutation, false);
    assert.equal(snapshot.capabilities.publication, false);
    assert.ok(snapshot.branches.some((row) => row.name === 'main'));
    assert.ok(snapshot.branches.some((row) => row.name === 'agent/camera'));
    assert.ok(
      snapshot.releases.some(
        (row) =>
          row.name === 'camera-preview' &&
          row.channel === 'preview' &&
          row.state === 'candidate'
      )
    );
    assert.equal(snapshot.storage.destructive, false);
    assert.equal(snapshot.graph.nodes[0].actor.id, 'fallen-director');

    const serialized = JSON.stringify(snapshot);
    assert.doesNotMatch(serialized, /camera-pass/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('commit inspector exposes metadata and paths but not blob payload bytes', async () => {
  const { root, store, second } = await setup();
  try {
    const commit = await inspectLineageCommit(store, second.commit_id);
    assert.equal(commit.id, second.commit_id);
    assert.equal(commit.actor.id, 'fallen-director');
    assert.equal(commit.entries.length, 1);
    assert.equal(commit.entries[0].path, 'world.json');
    assert.match(commit.entries[0].content_sha256, /^[a-f0-9]{64}$/);

    const serialized = JSON.stringify(commit);
    assert.doesNotMatch(serialized, /camera-pass/);
    assert.doesNotMatch(serialized, /\"data\":/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Control Room runtime is loopback-only and rejects mutation methods', async () => {
  const { root, store, first, second } = await setup();
  const runtime = await startLineageControlRoom({ store });
  try {
    const health = await fetch(runtime.service_url + '/health');
    const healthBody = await health.json();
    assert.equal(health.status, 200);
    assert.equal(healthBody.mode, 'read_only');
    assert.equal(healthBody.mutation_authority, false);
    assert.equal(healthBody.payment_authority, false);

    const snapshot = await fetch(
      runtime.service_url + '/v1/snapshot?ref=agent%2Fcamera&limit=25'
    );
    const snapshotBody = await snapshot.json();
    assert.equal(snapshot.status, 200);
    assert.equal(snapshotBody.head, second.commit_id);

    const diff = await fetch(
      runtime.service_url +
        '/v1/diff?from=' +
        encodeURIComponent(first.commit_id) +
        '&to=' +
        encodeURIComponent(second.commit_id)
    );
    const diffBody = await diff.json();
    assert.equal(diff.status, 200);
    assert.equal(diffBody.changes.length, 1);
    assert.equal(diffBody.changes[0].path, 'world.json');

    const mutation = await fetch(runtime.service_url + '/v1/snapshot', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const mutationBody = await mutation.json();
    assert.equal(mutation.status, 405);
    assert.equal(mutationBody.error, 'lineage_control_room_read_only');
  } finally {
    await runtime.close();
    await rm(root, { recursive: true, force: true });
  }

  await assert.rejects(
    () => startLineageControlRoom({ store, host: '0.0.0.0' }),
    (error) => error.code === 'LINEAGE_CONTROL_ROOM_LOOPBACK_REQUIRED'
  );
});

test('Control Room HTML is self-contained and visibly read-only', () => {
  const html = renderLineageControlRoomHtml();
  assert.match(html, /Evercraft <b>Lineage<\/b> Control Room/);
  assert.match(html, /READ ONLY/);
  assert.match(html, /Branches/);
  assert.match(html, /Releases/);
  assert.match(html, /Storage/);
  assert.match(html, /\/v1\/diff/);
  assert.doesNotMatch(html, /https:\/\//);
  assert.doesNotMatch(html, /<form/i);
});
