import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LineageStore } from './core.mjs';
import { createDirectHttpLineageRemote } from './http-remote.mjs';
import { fetchCommitGraph, pushCommitGraph } from './remote-protocol.mjs';
import { startLineageRemoteRuntime } from './yard-remote-runtime.mjs';

test('HTTP remote is drop-in compatible with Lineage push and fetch', async () => {
  const sourceRoot = await mkdtemp(join(tmpdir(), 'lineage-http-source-'));
  const targetRoot = await mkdtemp(join(tmpdir(), 'lineage-http-target-'));
  const remoteRoot = await mkdtemp(join(tmpdir(), 'lineage-http-remote-'));
  const runtime = await startLineageRemoteRuntime({ stateDir: remoteRoot });
  try {
    const source = new LineageStore(sourceRoot);
    const target = new LineageStore(targetRoot);
    await source.init();
    await target.init();

    await writeFile(join(sourceRoot, 'world.json'), '{"state":"canonical"}\n');
    const committed = await source.commit({
      message: 'canonical world',
      actor: { type: 'agent', id: 'fallen-director' },
    });

    const remote = createDirectHttpLineageRemote(runtime.service_url);
    const pushed = await pushCommitGraph({
      store: source,
      remote,
      branch: 'main',
      expectedRemoteHead: null,
    });

    assert.equal(pushed.head, committed.commit_id);
    assert.ok(pushed.transferred_objects >= 3);

    const fetched = await fetchCommitGraph({
      store: target,
      remote,
      remoteBranch: 'main',
      localBranch: 'main',
    });

    assert.equal(fetched.state, 'fast_forwarded');
    assert.equal(await target.resolveRef('main'), committed.commit_id);
    assert.deepEqual(
      (await target.getTree('main')).entries.map((entry) => entry.path),
      ['world.json']
    );
  } finally {
    await runtime.close();
    await rm(sourceRoot, { recursive: true, force: true });
    await rm(targetRoot, { recursive: true, force: true });
    await rm(remoteRoot, { recursive: true, force: true });
  }
});

test('HTTP remote propagates stale ref semantics without flattening them', async () => {
  const remoteRoot = await mkdtemp(join(tmpdir(), 'lineage-http-stale-'));
  const runtime = await startLineageRemoteRuntime({ stateDir: remoteRoot });
  try {
    const remote = createDirectHttpLineageRemote(runtime.service_url);
    await remote.init();
    const first = '1'.repeat(64);
    const second = '2'.repeat(64);
    await remote.compareAndSwapRef('main', null, first);
    await assert.rejects(
      () => remote.compareAndSwapRef('main', null, second),
      (error) =>
        error.code === 'STALE_REF' &&
        error.current === first &&
        error.expected === null
    );
  } finally {
    await runtime.close();
    await rm(remoteRoot, { recursive: true, force: true });
  }
});
