import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LineageStore } from './core.mjs';
import {
  compileLineageGlob,
  loadLineageIgnorePolicy,
  sensitivePathReason,
} from './ignore.mjs';

async function setup(prefix = 'lineage-ignore-') {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const store = new LineageStore(root);
  await store.init();
  return { root, store };
}

test('lineage ignore patterns exclude junk and ordered negation can reinclude a descendant', async () => {
  const { root, store } = await setup();
  try {
    await mkdir(join(root, 'dist'), { recursive: true });
    await writeFile(
      join(root, '.lineageignore'),
      [
        'dist/**',
        '!dist/keep.json',
        '*.log',
        '!keep.log',
        '.env',
        '',
      ].join('\n')
    );
    await writeFile(join(root, 'dist', 'drop.json'), '{"drop":true}\n');
    await writeFile(join(root, 'dist', 'keep.json'), '{"keep":true}\n');
    await writeFile(join(root, 'debug.log'), 'debug\n');
    await writeFile(join(root, 'keep.log'), 'keep\n');
    await writeFile(join(root, '.env'), 'SECRET=not-history\n');
    await writeFile(join(root, 'normal.txt'), 'normal\n');

    const snapshot = await store.snapshotWorkspace();
    const paths = snapshot.entries.map((entry) => entry.path);

    assert.deepEqual(paths, [
      '.lineageignore',
      'dist/keep.json',
      'keep.log',
      'normal.txt',
    ]);
    assert.equal(snapshot.snapshot_policy.ignore_file_present, true);
    assert.deepEqual(snapshot.snapshot_policy.sensitive_overrides, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('unignored sensitive paths fail closed before their bytes enter history', async () => {
  const { root, store } = await setup();
  try {
    await writeFile(join(root, 'normal.txt'), 'normal\n');
    await writeFile(join(root, '.env'), 'SUPER_SECRET=1\n');

    await assert.rejects(
      () => store.commit({ message: 'must block env' }),
      (error) =>
        error.code === 'LINEAGE_SENSITIVE_PATH_BLOCKED' &&
        error.path === '.env' &&
        error.reason === 'credential_filename'
    );

    assert.equal(await store.resolveRef('main'), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('ignoring a sensitive path omits it without weakening the sensitive-path guard', async () => {
  const { root, store } = await setup();
  try {
    await writeFile(join(root, '.lineageignore'), '.env\nprivate.key\n');
    await writeFile(join(root, '.env'), 'SECRET=ignored\n');
    await writeFile(join(root, 'private.key'), 'PRIVATE-KEY-MATERIAL\n');
    await writeFile(join(root, 'safe.txt'), 'safe\n');

    const committed = await store.commit({ message: 'safe snapshot' });
    const tree = await store.getTree(committed.commit_id);
    assert.deepEqual(
      tree.entries.map((entry) => entry.path),
      ['.lineageignore', 'safe.txt']
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('explicit sensitive-path allow is auditable in the tree entry and snapshot policy', async () => {
  const { root, store } = await setup();
  try {
    await writeFile(join(root, 'fixture.key'), 'test-fixture-only\n');

    const committed = await store.commit({
      message: 'explicit sensitive fixture',
      snapshot: {
        allowSensitivePaths: ['fixture.key'],
      },
    });

    const tree = await store.getTree(committed.commit_id);
    const entry = tree.entries.find((row) => row.path === 'fixture.key');
    assert(entry);
    assert.deepEqual(entry.sensitive_path_override, {
      explicit: true,
      reason: 'private_key_material',
    });

    const treeObject = await store.readObject(tree.tree_id);
    assert.deepEqual(
      treeObject.payload.snapshot_policy.allow_sensitive_paths,
      ['fixture.key']
    );
    assert.deepEqual(
      treeObject.payload.snapshot_policy.sensitive_overrides,
      [{ path: 'fixture.key', reason: 'private_key_material' }]
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('hard Lineage boundaries cannot be negated by .lineageignore', async () => {
  const { root, store } = await setup();
  try {
    await mkdir(join(root, '.git'), { recursive: true });
    await mkdir(join(root, 'node_modules', 'pkg'), { recursive: true });
    await writeFile(
      join(root, '.lineageignore'),
      '!/.git/config\n!node_modules/pkg/index.js\n'
    );
    await writeFile(join(root, '.git', 'config'), 'do-not-track\n');
    await writeFile(join(root, 'node_modules', 'pkg', 'index.js'), 'nope\n');
    await writeFile(join(root, 'tracked.txt'), 'yes\n');

    const snapshot = await store.snapshotWorkspace({
      excludes: new Set(),
    });
    assert.deepEqual(
      snapshot.entries.map((entry) => entry.path),
      ['.lineageignore', 'tracked.txt']
    );
    assert.deepEqual(
      snapshot.snapshot_policy.hard_excludes,
      ['.git', '.lineage', 'node_modules']
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('ignore policy config path cannot escape the workspace', async () => {
  const { root } = await setup();
  try {
    await assert.rejects(
      () => loadLineageIgnorePolicy(root, { ignoreFile: '../outside.ignore' }),
      /must stay inside the Lineage workspace/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('glob and sensitive-path primitives expose the intended owned policy semantics', () => {
  const rootRule = compileLineageGlob('/build/**');
  assert.equal(rootRule.matches('build/a.js'), true);
  assert.equal(rootRule.matches('nested/build/a.js'), false);

  const basenameRule = compileLineageGlob('*.log');
  assert.equal(basenameRule.matches('nested/debug.log'), true);
  assert.equal(basenameRule.matches('nested/debug.txt'), false);

  const recursiveRule = compileLineageGlob('**/secret.txt');
  assert.equal(recursiveRule.matches('secret.txt'), true);
  assert.equal(recursiveRule.matches('a/b/secret.txt'), true);

  assert.equal(sensitivePathReason('.env.example'), null);
  assert.equal(sensitivePathReason('.env.production'), 'environment_credentials');
  assert.equal(sensitivePathReason('certs/signing.pem'), 'private_key_material');
});


test('caller exclusion cannot hide the Lineage policy file itself', async () => {
  const { root, store } = await setup();
  try {
    await writeFile(join(root, '.lineageignore'), '*.tmp\n');
    await writeFile(join(root, 'tracked.txt'), 'tracked\n');

    const snapshot = await store.snapshotWorkspace({
      excludes: new Set(['.lineage', '.git', 'node_modules', '.lineageignore']),
    });

    assert.ok(
      snapshot.entries.some((entry) => entry.path === '.lineageignore')
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('ignore policy file cannot be hidden inside a hard Lineage boundary', async () => {
  const { root, store } = await setup();
  try {
    await mkdir(join(root, '.git'), { recursive: true });
    await writeFile(join(root, '.git', 'lineage.ignore'), '*.tmp\n');

    await assert.rejects(
      () => store.snapshotWorkspace({
        ignoreFile: '.git/lineage.ignore',
      }),
      (error) => error.code === 'LINEAGE_IGNORE_FILE_IN_HARD_EXCLUDE'
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
