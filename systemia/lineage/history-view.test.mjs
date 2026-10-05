import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LineageStore } from './core.mjs';
import { buildHistoryGraph, renderHistoryHtml, writeHistoryBundle } from './history-view.mjs';

test('history graph preserves multi-parent ancestry and actor authority', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lineage-history-'));
  try {
    const store = new LineageStore(root);
    await store.init();
    await writeFile(join(root, 'base.txt'), 'base\n');
    const base = await store.commit({
      message: 'base',
      actor: { type: 'human', id: 'operator' },
      authority: { mutation: true, publish: false, payment: false }
    });
    await store.createBranch('agent-work', base.commit_id);

    await writeFile(join(root, 'main.txt'), 'main\n');
    const main = await store.commit({
      message: 'main',
      actor: { type: 'human', id: 'operator' }
    });

    await store.switchBranch('agent-work');
    await store.restore(base.commit_id, root);
    await writeFile(join(root, 'agent.txt'), 'agent\n');
    const agent = await store.commit({
      message: 'agent work',
      actor: { type: 'agent', id: 'saban-worker-7' },
      authority: { mutation: true, publish: false, payment: false }
    });

    await store.switchBranch('main');
    const merged = await store.merge('agent-work', {
      message: 'reconcile',
      actor: { type: 'agent', id: 'systemia-reconciler' }
    });

    const graph = await buildHistoryGraph(store, { ref: 'main' });
    const mergeNode = graph.nodes.find((node) => node.id === merged.commit_id);
    assert.deepEqual(mergeNode.parents, [main.commit_id, agent.commit_id]);
    assert.ok(graph.edges.some((edge) => edge.from === main.commit_id && edge.to === merged.commit_id));
    assert.ok(graph.edges.some((edge) => edge.from === agent.commit_id && edge.to === merged.commit_id));
    assert.equal(mergeNode.actor.id, 'systemia-reconciler');
    assert.equal(mergeNode.authority.publish, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('history HTML is self-contained and exposes authority boundaries', () => {
  const graph = {
    schema: 'evercraft.lineage.history-graph.v1',
    ref: 'main',
    head: 'a'.repeat(64),
    authority_note: 'No downstream authority.',
    nodes: [{
      id: 'a'.repeat(64),
      short_id: 'a'.repeat(12),
      parents: [],
      message: 'world checkpoint',
      actor: { type: 'agent', id: 'fallen-director' },
      created_at: '2026-10-02T00:00:00.000Z',
      authority: { mutation: true, publish: false, payment: false },
      transaction_count: 2,
      change_summary: { added: 3, modified: 0, deleted: 0 }
    }],
    edges: [],
    truncated: false
  };
  const html = renderHistoryHtml(graph);
  assert.match(html, /Evercraft <b>Lineage<\/b>/);
  assert.match(html, /fallen-director/);
  assert.match(html, /publish=/);
  assert.doesNotMatch(html, /https:\/\//);
});

test('history bundle writes deterministic JSON and a browsable owned surface', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lineage-history-bundle-'));
  const out = await mkdtemp(join(tmpdir(), 'lineage-history-output-'));
  try {
    const store = new LineageStore(root);
    await store.init();
    await writeFile(join(root, 'research.json'), '{"evidence":"observed"}\n');
    const committed = await store.commit({ message: 'research checkpoint' });
    const result = await writeHistoryBundle(store, { outDir: out, ref: 'main' });
    assert.equal(result.head, committed.commit_id);
    assert.equal(result.commits, 1);
    const graph = JSON.parse(await readFile(join(out, 'graph.json'), 'utf8'));
    assert.equal(graph.head, committed.commit_id);
    const html = await readFile(join(out, 'index.html'), 'utf8');
    assert.match(html, /research checkpoint/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(out, { recursive: true, force: true });
  }
});
