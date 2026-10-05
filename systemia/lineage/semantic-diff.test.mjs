import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LineageStore } from './core.mjs';
import { semanticDiff, semanticSummary } from './semantic-diff.mjs';

const human = { type: 'human', id: 'semantic-test' };

test('JSON semantic diff reports changed property paths', () => {
  const result = semanticSummary({
    path: 'brief.json',
    kind: 'dataset',
    before: '{"status":"draft","evidence":{"count":2}}',
    after: '{"status":"ready","evidence":{"count":3}}'
  });
  assert.equal(result.adapter, 'json');
  assert.equal(result.parseable, true);
  assert.ok(result.changed_paths.some((x) => x.path === 'status'));
  assert.ok(result.changed_paths.some((x) => x.path === 'evidence.count'));
});

test('world semantic diff reports scene-graph count changes', () => {
  const result = semanticSummary({
    path: 'studio.gltf',
    kind: 'world_asset',
    before: '{"nodes":[{"name":"Lobby"}],"cameras":[]}',
    after: '{"nodes":[{"name":"Lobby"},{"name":"Proof Room"}],"cameras":[{"name":"Hero"}]}'
  });
  assert.equal(result.adapter, 'world');
  assert.equal(result.counts.nodes.delta, 1);
  assert.equal(result.counts.cameras.delta, 1);
  assert.deepEqual(result.named_changes.nodes.added, ['Proof Room']);
});

test('CSV semantic diff reports schema and row deltas', () => {
  const result = semanticSummary({
    path: 'sessions.csv',
    kind: 'dataset',
    before: 'id,kwh\n1,12\n',
    after: 'id,kwh,source\n1,12,observed\n2,8,observed\n'
  });
  assert.equal(result.adapter, 'csv');
  assert.deepEqual(result.added_columns, ['source']);
  assert.equal(result.row_delta, 1);
});

test('semanticDiff enriches native Lineage changes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'evercraft-lineage-semantic-'));
  const store = new LineageStore(root);
  try {
    await store.init();
    await writeFile(join(root, 'world.gltf'), '{"nodes":[{"name":"Lobby"}]}\n');
    const first = await store.commit({ message: 'world one', actor: human });
    await writeFile(join(root, 'world.gltf'), '{"nodes":[{"name":"Lobby"},{"name":"Lab"}]}\n');
    const second = await store.commit({ message: 'world two', actor: human });
    const diff = await semanticDiff(store, first.commit_id, second.commit_id);
    assert.equal(diff.changes.length, 1);
    assert.equal(diff.changes[0].semantic.adapter, 'world');
    assert.equal(diff.changes[0].semantic.counts.nodes.delta, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
