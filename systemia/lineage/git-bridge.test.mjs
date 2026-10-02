import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LineageStore } from './core.mjs';
import { exportLineageSnapshotToGit, importGitHistory } from './git-bridge.mjs';

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return String(result.stdout || '').trim();
}

async function makeGitRepo() {
  const root = await mkdtemp(join(tmpdir(), 'lineage-git-source-'));
  git(root, ['init']);
  git(root, ['config', 'user.name', 'Lineage Test']);
  git(root, ['config', 'user.email', 'lineage-test@example.invalid']);

  await writeFile(join(root, 'hello.txt'), 'one\n');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'first']);

  await writeFile(join(root, 'hello.txt'), 'two\n');
  await writeFile(join(root, 'data.json'), '{"state":"verified"}\n');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'second']);

  return root;
}

test('imports Git history while preserving Git commit provenance', async () => {
  const gitRoot = await makeGitRepo();
  const lineageRoot = await mkdtemp(join(tmpdir(), 'lineage-git-import-'));
  try {
    const store = new LineageStore(lineageRoot);
    await store.init();
    const receipt = await importGitHistory(store, {
      repository: gitRoot,
      ref: 'HEAD',
      branch: 'git/main'
    });

    assert.equal(receipt.imported_commits, 2);
    assert.equal(await store.resolveRef('git/main'), receipt.lineage_head);
    const log = await store.log('git/main', 5);
    assert.equal(log.length, 2);
    assert.equal(log[0].message, 'second');
    assert.match(log[0].metadata.git.commit_sha, /^[a-f0-9]{40}$/);
    assert.equal(log[0].metadata.git.author_email, 'lineage-test@example.invalid');

    const tree = await store.getTree('git/main');
    assert.deepEqual(tree.entries.map((x) => x.path), ['data.json', 'hello.txt']);
  } finally {
    await rm(gitRoot, { recursive: true, force: true });
    await rm(lineageRoot, { recursive: true, force: true });
  }
});

test('exports exact Lineage artifact bytes to Git and declares metadata loss', async () => {
  const lineageRoot = await mkdtemp(join(tmpdir(), 'lineage-git-export-source-'));
  const gitRoot = await mkdtemp(join(tmpdir(), 'lineage-git-export-target-'));
  try {
    const store = new LineageStore(lineageRoot);
    await store.init();
    await writeFile(join(lineageRoot, 'world.gltf'), '{"nodes":[{"name":"Lobby"}]}\n');
    await writeFile(join(lineageRoot, 'notes.md'), '# Canon\n');
    const committed = await store.commit({
      message: 'canonical world',
      actor: { type: 'agent', id: 'fallen-director' },
      provenance: { sources: ['evidence:1'], evidence: ['receipt:1'], rights: [] }
    });

    const exported = await exportLineageSnapshotToGit(store, {
      commitish: committed.commit_id,
      repository: gitRoot,
      branch: 'main'
    });

    assert.equal(exported.lineage_commit, committed.commit_id);
    assert.equal(exported.lossless_artifact_bytes, true);
    assert.ok(exported.lossy_lineage_fields.includes('provenance'));
    assert.equal(git(gitRoot, ['show', `${exported.git_commit_sha}:world.gltf`]), '{"nodes":[{"name":"Lobby"}]}');
    assert.equal(git(gitRoot, ['show', `${exported.git_commit_sha}:notes.md`]), '# Canon');
    const message = git(gitRoot, ['show', '-s', '--format=%B', exported.git_commit_sha]);
    assert.match(message, new RegExp(`Evercraft-Lineage-Commit: ${committed.commit_id}`));
    assert.match(message, /Evercraft-Lineage-Export-Lossy:/);
  } finally {
    await rm(lineageRoot, { recursive: true, force: true });
    await rm(gitRoot, { recursive: true, force: true });
  }
});

test('Git export uses compare-and-swap semantics for its target branch', async () => {
  const lineageRoot = await mkdtemp(join(tmpdir(), 'lineage-git-export-cas-source-'));
  const gitRoot = await mkdtemp(join(tmpdir(), 'lineage-git-export-cas-target-'));
  try {
    const store = new LineageStore(lineageRoot);
    await store.init();
    await writeFile(join(lineageRoot, 'a.txt'), 'one\n');
    const first = await store.commit({ message: 'one' });
    const exported = await exportLineageSnapshotToGit(store, {
      commitish: first.commit_id,
      repository: gitRoot,
      branch: 'main'
    });

    await writeFile(join(lineageRoot, 'a.txt'), 'two\n');
    const second = await store.commit({ message: 'two' });

    await assert.rejects(
      () => exportLineageSnapshotToGit(store, {
        commitish: second.commit_id,
        repository: gitRoot,
        branch: 'main',
        expectedGitHead: '0'.repeat(40)
      }),
      (error) => error.code === 'STALE_GIT_REF' && error.current === exported.git_commit_sha
    );

    const updated = await exportLineageSnapshotToGit(store, {
      commitish: second.commit_id,
      repository: gitRoot,
      branch: 'main',
      expectedGitHead: exported.git_commit_sha
    });
    assert.notEqual(updated.git_commit_sha, exported.git_commit_sha);
    assert.equal(git(gitRoot, ['rev-parse', 'refs/heads/main']), updated.git_commit_sha);
  } finally {
    await rm(lineageRoot, { recursive: true, force: true });
    await rm(gitRoot, { recursive: true, force: true });
  }
});
