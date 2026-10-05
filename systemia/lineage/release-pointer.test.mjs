import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { LineageStore } from './core.mjs';
import { ReleaseRegistry } from './release-pointer.mjs';

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'lineage-release-'));
  const store = new LineageStore(root);
  await store.init();
  await writeFile(join(root, 'artifact.txt'), 'v1\n');
  const commit = await store.commit({ message: 'release candidate' });
  return { root, store, commit, releases: new ReleaseRegistry(store) };
}

test('candidate release binds an exact immutable commit and artifact digest', async () => {
  const { root, store, commit, releases } = await setup();
  try {
    const recorded = await releases.record({
      name: 'studio-preview',
      channel: 'preview',
      commitish: commit.commit_id,
      state: 'candidate',
      artifacts: [{ name: 'artifact.txt', sha256: hash('v1\n'), bytes: 3 }]
    });
    assert.equal(recorded.commit_id, commit.commit_id);
    assert.equal(recorded.state, 'candidate');

    await writeFile(join(root, 'artifact.txt'), 'v2\n');
    await store.commit({ message: 'later work' });

    const pointer = await releases.readPointer({ name: 'studio-preview', channel: 'preview' });
    assert.equal(pointer.commit_id, commit.commit_id, 'release pointer must not drift with workspace HEAD');
    assert.equal(pointer.artifacts[0].sha256, hash('v1\n'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('released state requires downstream authority evidence', async () => {
  const { root, commit, releases } = await setup();
  try {
    await assert.rejects(
      () => releases.record({
        name: 'production',
        commitish: commit.commit_id,
        state: 'released'
      }),
      /requires at least one downstream authority receipt/
    );

    const recorded = await releases.record({
      name: 'production',
      commitish: commit.commit_id,
      state: 'released',
      authorityReceiptRefs: ['release-policy:approved:123']
    });
    assert.deepEqual(recorded.authority_receipt_refs, ['release-policy:approved:123']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('release pointer compare-and-swap rejects stale writers', async () => {
  const { root, store, commit, releases } = await setup();
  try {
    const first = await releases.record({
      name: 'film',
      channel: 'production',
      commitish: commit.commit_id,
      state: 'verified'
    });

    await writeFile(join(root, 'artifact.txt'), 'v2\n');
    const secondCommit = await store.commit({ message: 'second candidate' });

    await assert.rejects(
      () => releases.record({
        name: 'film',
        channel: 'production',
        commitish: secondCommit.commit_id,
        state: 'verified',
        expectedReleaseId: null
      }),
      (error) => error.code === 'STALE_RELEASE_POINTER' && error.current === first.release_id
    );

    const updated = await releases.record({
      name: 'film',
      channel: 'production',
      commitish: secondCommit.commit_id,
      state: 'verified',
      expectedReleaseId: first.release_id
    });
    assert.equal(updated.previous_release_id, first.release_id);
    assert.equal((await releases.readPointer({ name: 'film', channel: 'production' })).commit_id, secondCommit.commit_id);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
