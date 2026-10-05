import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LineageStore } from './core.mjs';

const human = { type: 'human', id: 'test-user' };

async function tempStore() {
  const root = await mkdtemp(join(tmpdir(), 'evercraft-lineage-'));
  const store = new LineageStore(root);
  await store.init();
  return { root, store };
}

test('commits arbitrary artifacts and produces typed diffs', async () => {
  const { root, store } = await tempStore();
  try {
    await writeFile(join(root, 'hello.txt'), 'one\n');
    const first = await store.commit({ message: 'first', actor: human });
    await writeFile(join(root, 'hello.txt'), 'two\n');
    await writeFile(join(root, 'data.json'), '{"value":2}\n');
    const second = await store.commit({ message: 'second', actor: human });
    const diff = await store.diff(first.commit_id, second.commit_id);
    assert.deepEqual(diff.changes.map((x) => [x.path, x.status]), [['data.json','added'],['hello.txt','modified']]);
    assert.equal(diff.changes[0].after.kind, 'dataset');
    assert.equal(diff.changes[1].after.kind, 'document');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('branches and merges non-conflicting histories without flattening parents', async () => {
  const { root, store } = await tempStore();
  try {
    await writeFile(join(root, 'a.txt'), 'base\n');
    const base = await store.commit({ message: 'base', actor: human });
    await store.createBranch('feature', base.commit_id);

    await writeFile(join(root, 'a.txt'), 'main\n');
    const main = await store.commit({ message: 'main change', actor: human });

    await store.switchBranch('feature');
    await store.restore(base.commit_id, root);
    await writeFile(join(root, 'b.txt'), 'feature\n');
    const feature = await store.commit({ message: 'feature change', actor: human });

    await store.switchBranch('main');
    const preview = await store.mergePreview('feature');
    assert.equal(preview.conflicts.length, 0);
    const merged = await store.merge('feature', { actor: human });
    const object = await store.readObject(merged.commit_id);
    assert.deepEqual(object.payload.parents, [main.commit_id, feature.commit_id]);
    const tree = await store.getTree(merged.commit_id);
    assert.deepEqual(tree.entries.map((x) => x.path), ['a.txt','b.txt']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('detects true merge conflicts instead of guessing', async () => {
  const { root, store } = await tempStore();
  try {
    await writeFile(join(root, 'scene.json'), '{"camera":"wide"}\n');
    const base = await store.commit({ message: 'base', actor: human });
    await store.createBranch('agent-cut', base.commit_id);

    await writeFile(join(root, 'scene.json'), '{"camera":"close"}\n');
    await store.commit({ message: 'human cut', actor: human });

    await store.switchBranch('agent-cut');
    await store.restore(base.commit_id, root);
    await writeFile(join(root, 'scene.json'), '{"camera":"dolly"}\n');
    await store.commit({ message: 'agent cut', actor: { type: 'agent', id: 'fallen-director' } });

    await store.switchBranch('main');
    const preview = await store.mergePreview('agent-cut');
    assert.equal(preview.conflicts.length, 1);
    assert.equal(preview.conflicts[0].path, 'scene.json');
    await assert.rejects(() => store.merge('agent-cut'), /Merge has 1 conflict/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('rollback and agent transactions both emit immutable receipts', async () => {
  const { root, store } = await tempStore();
  try {
    await writeFile(join(root, 'world.gltf'), '{}\n');
    const first = await store.commit({ message: 'world v1', actor: human });
    await writeFile(join(root, 'world.gltf'), '{"nodes":[]}\n');
    const second = await store.commit({ message: 'world v2', actor: { type: 'agent', id: 'studio-agent' } });
    const tx = await store.recordTransaction({
      kind: 'world.scene.camera.move',
      actor: { type: 'agent', id: 'studio-agent' },
      scope: { artifact: 'world.gltf' },
      inputs: [first.commit_id], outputs: [second.commit_id],
      rationale: 'Move camera to canonical lobby anchor',
      reversible_by: { operation: 'rollback', commit_id: first.commit_id },
    });
    assert.match(tx.transaction_id, /^[a-f0-9]{64}$/);
    const rollback = await store.rollback(first.commit_id, { actor: human, rationale: 'QA rejection' });
    assert.equal(await store.resolveRef('HEAD'), first.commit_id);
    assert.match(rollback.receipt_id, /^[a-f0-9]{64}$/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
