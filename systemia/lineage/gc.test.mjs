import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LineageStore } from './core.mjs';
import {
  planGarbageCollection,
  purgeQuarantine,
  quarantineGarbage,
  restoreQuarantine,
} from './gc.mjs';
import { LargeObjectStore } from './large-object.mjs';
import { ReleaseRegistry } from './release-pointer.mjs';

test('GC plan preserves reachable history and identifies orphan objects', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lineage-gc-plan-'));
  try {
    const store = new LineageStore(root);
    await store.init();
    await writeFile(join(root, 'live.txt'), 'live\n');
    const live = await store.commit({ message: 'live' });

    const orphan = await store.putObject('receipt', {
      schema: 'test.orphan.v1',
      orphan: true,
    });

    const plan = await planGarbageCollection(store, {
      graceMs: 0,
      nowMs: Date.now() + 1000,
    });

    assert.ok(plan.reachable.objects >= 3);
    assert.ok(plan.candidates.objects.some((row) => row.id === orphan));
    assert.ok(!plan.candidates.objects.some((row) => row.id === live.commit_id));
    assert.ok(plan.reclaimable.total_bytes > 0);
    assert.equal(plan.destructive, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('named releases keep historical commits reachable after branch head moves', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lineage-gc-release-root-'));
  try {
    const store = new LineageStore(root);
    await store.init();

    await writeFile(join(root, 'artifact.txt'), 'v1\n');
    const first = await store.commit({ message: 'first' });

    const releases = new ReleaseRegistry(store);
    await releases.record({
      name: 'preview-1',
      channel: 'preview',
      commitish: first.commit_id,
      state: 'candidate',
    });

    await writeFile(join(root, 'artifact.txt'), 'v2\n');
    await store.commit({ message: 'second' });

    const plan = await planGarbageCollection(store, {
      graceMs: 0,
      nowMs: Date.now() + 1000,
    });

    assert.ok(!plan.candidates.objects.some((row) => row.id === first.commit_id));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('quarantine refuses a stale plan when a candidate becomes newly reachable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lineage-gc-stale-'));
  try {
    const store = new LineageStore(root);
    await store.init();
    await writeFile(join(root, 'live.txt'), 'live\n');
    await store.commit({ message: 'live' });

    const orphanTree = await store.putObject('tree', { entries: [] });
    const orphanCommit = await store.putObject('commit', {
      tree_id: orphanTree,
      parents: [],
      message: 'orphan future',
      actor: { type: 'agent', id: 'speculative' },
      rationale: null,
      created_at: new Date().toISOString(),
      provenance: { sources: [], evidence: [], rights: [] },
      authority: { mutation: false, publish: false, payment: false },
      transactions: [],
      metadata: {},
    });

    const plan = await planGarbageCollection(store, {
      graceMs: 0,
      nowMs: Date.now() + 1000,
    });
    assert.ok(plan.candidates.objects.some((row) => row.id === orphanCommit));

    await store.createBranch('rescued', orphanCommit);

    await assert.rejects(
      () => quarantineGarbage(store, plan, {
        retentionMs: 1000,
        nowMs: plan.now_ms + 1,
      }),
      (error) => error.code === 'LINEAGE_GC_STALE_PLAN'
    );

    assert.equal(await store.resolveRef('rescued'), orphanCommit);
    assert.equal((await store.readObject(orphanCommit)).type, 'commit');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('large-object garbage is quarantined reversibly before retention-gated purge', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lineage-gc-large-'));
  try {
    const store = new LineageStore(root);
    await store.init();
    await writeFile(join(root, 'live.txt'), 'live\n');
    await store.commit({ message: 'live' });

    const large = new LargeObjectStore(store.dir);
    const orphan = await large.putBuffer(
      Buffer.concat([
        Buffer.alloc(100_000, 'A'),
        Buffer.alloc(100_000, 'B'),
        Buffer.alloc(100_000, 'C'),
      ]),
      {
        logicalName: 'orphan-master.mov',
        mediaType: 'video/quicktime',
        chunking: {
          minChunkBytes: 16 * 1024,
          averageChunkBytes: 32 * 1024,
          maxChunkBytes: 64 * 1024,
        },
      }
    );

    const nowMs = Date.now() + 1000;
    const plan = await planGarbageCollection(store, {
      graceMs: 0,
      nowMs,
    });

    assert.ok(plan.candidates.manifests.some((row) => row.id === orphan.manifest_id));
    assert.ok(plan.candidates.chunks.length > 0);

    const quarantined = await quarantineGarbage(store, plan, {
      retentionMs: 10_000,
      nowMs: nowMs + 1,
    });
    assert.ok(quarantined.moved.manifests.length > 0);
    assert.ok(quarantined.moved.chunks.length > 0);
    assert.equal(await large.hasManifest(orphan.manifest_id), false);

    await assert.rejects(
      () => purgeQuarantine(store, quarantined.run_id, {
        nowMs: nowMs + 5000,
      }),
      (error) => error.code === 'LINEAGE_GC_RETENTION_ACTIVE'
    );

    const restored = await restoreQuarantine(store, quarantined.run_id);
    assert.ok(restored.restored.manifests > 0);
    assert.ok(restored.restored.chunks > 0);
    assert.equal(await large.hasManifest(orphan.manifest_id), true);

    const secondPlan = await planGarbageCollection(store, {
      graceMs: 0,
      nowMs: nowMs + 20_000,
    });
    const secondQuarantine = await quarantineGarbage(store, secondPlan, {
      retentionMs: 1000,
      nowMs: nowMs + 20_001,
    });
    const purged = await purgeQuarantine(store, secondQuarantine.run_id, {
      nowMs: nowMs + 22_000,
    });
    assert.ok(purged.purged.chunks > 0);
    assert.ok(purged.purged.bytes > 0);
    assert.equal(purged.reversible, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


test('audit receipts do not pin rolled-back commits forever', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lineage-gc-rollback-'));
  try {
    const store = new LineageStore(root);
    await store.init();

    await writeFile(join(root, 'artifact.txt'), 'v1\n');
    const first = await store.commit({ message: 'first' });

    await writeFile(join(root, 'artifact.txt'), 'v2\n');
    const second = await store.commit({ message: 'second' });

    await store.rollback(first.commit_id);

    const plan = await planGarbageCollection(store, {
      graceMs: 0,
      nowMs: Date.now() + 1000,
    });

    assert.ok(
      plan.candidates.objects.some((row) => row.id === second.commit_id),
      'rolled-back descendant should be collectible after grace'
    );
    assert.ok(
      !plan.candidates.objects.some((row) => row.id === first.commit_id),
      'current branch head must remain reachable'
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('transaction receipts retain standalone transaction detail objects', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lineage-gc-transaction-'));
  try {
    const store = new LineageStore(root);
    await store.init();

    const transaction = await store.recordTransaction({
      kind: 'world.scene.camera.move',
      actor: { type: 'agent', id: 'studio-agent' },
      inputs: [],
      outputs: [],
      rationale: 'bounded camera move',
      authority: { mutation: true, publish: false, payment: false },
    });

    const plan = await planGarbageCollection(store, {
      graceMs: 0,
      nowMs: Date.now() + 1000,
    });

    assert.ok(
      !plan.candidates.objects.some(
        (row) => row.id === transaction.transaction_id
      ),
      'transaction operation receipt should retain the transaction detail object'
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('active GC lock blocks branch and release root mutations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lineage-gc-lock-'));
  try {
    const store = new LineageStore(root);
    await store.init();
    await writeFile(join(root, 'artifact.txt'), 'v1\n');
    await store.commit({ message: 'live' });

    await writeFile(
      join(store.dir, 'gc.lock'),
      JSON.stringify({ schema: 'evercraft.lineage.gc-lock.v1' }) + '\n'
    );

    await assert.rejects(
      () => store.createBranch('blocked-by-gc'),
      (error) => error.code === 'LINEAGE_GC_LOCKED'
    );

    const releases = new ReleaseRegistry(store);
    await assert.rejects(
      () => releases.record({
        name: 'blocked-release',
        channel: 'preview',
        state: 'candidate',
      }),
      (error) => error.code === 'LINEAGE_GC_LOCKED'
    );

    await rm(join(store.dir, 'gc.lock'), { force: true });
    const branch = await store.createBranch('after-gc');
    assert.equal(branch.branch, 'after-gc');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


test('partial quarantine failure restores every object already moved', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lineage-gc-partial-rollback-'));
  try {
    const store = new LineageStore(root);
    await store.init();
    await writeFile(join(root, 'live.txt'), 'live\n');
    await store.commit({ message: 'live' });

    const orphanA = await store.putObject('receipt', {
      schema: 'test.orphan-a.v1',
      value: 'a',
    });
    const orphanB = await store.putObject('receipt', {
      schema: 'test.orphan-b.v1',
      value: 'b',
    });

    const nowMs = Date.now() + 1000;
    const plan = await planGarbageCollection(store, {
      graceMs: 0,
      nowMs,
    });
    const orphanRows = plan.candidates.objects
      .filter((row) => row.id === orphanA || row.id === orphanB)
      .sort((a, b) => a.id.localeCompare(b.id));
    assert.equal(orphanRows.length, 2);

    const runId =
      new Date(nowMs + 1).toISOString().replace(/[:.]/g, '-') +
      '-' +
      plan.plan_id.slice(0, 12);
    const runDir = join(store.dir, 'quarantine', runId);
    const sabotaged = orphanRows[1];
    const relativeSource = sabotaged.path
      .slice(store.dir.length + 1)
      .split('\\').join('/');
    const blockedTarget = join(
      runDir,
      'objects',
      ...relativeSource.split('/')
    );

    await mkdir(blockedTarget, { recursive: true });
    await writeFile(join(blockedTarget, 'blocker'), 'block');

    await assert.rejects(
      () => quarantineGarbage(store, plan, {
        retentionMs: 1000,
        nowMs: nowMs + 1,
      })
    );

    assert.equal((await store.readObject(orphanA)).type, 'receipt');
    assert.equal((await store.readObject(orphanB)).type, 'receipt');

    await assert.rejects(
      () => readFile(join(runDir, 'quarantine.json'), 'utf8'),
      (error) => error?.code === 'ENOENT'
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
