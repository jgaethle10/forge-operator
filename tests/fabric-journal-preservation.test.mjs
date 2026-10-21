import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { classifyFabricCheckoutDirt } from '../scripts/classify-fabric-checkout-dirt.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const updater = fs.readFileSync(
  path.join(root, 'scripts/update-fabric-owned-edge.sh'),
  'utf8'
);

test('updater protects dirty Journal before Git promotion', () => {
  const status = updater.indexOf('status --porcelain --untracked-files=all');
  const guard = updater.indexOf('Journal contains uncheckpointed changes');
  const fetch = updater.indexOf('fetch --prune');

  assert.ok(status >= 0 && guard > status);
  assert.ok(fetch > guard);
  assert.ok(!updater.includes('restore --staged --worktree -- public/journal'));
  assert.ok(!updater.includes('clean -fdx -- public/journal'));
});

test('tracked and untracked Journal evidence survives classification', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-journal-'));

  try {
    const journal = path.join(dir, 'public/journal');
    fs.mkdirSync(path.join(journal, 'receipts'), { recursive: true });

    const tracked = path.join(journal, 'index.json');
    const untracked = path.join(journal, 'receipts/pending.json');

    fs.writeFileSync(tracked, 'original\n');
    execFileSync('git', ['init', '-q', dir]);
    execFileSync('git', ['-C', dir, 'add', 'public/journal/index.json']);
    execFileSync('git', [
      '-C', dir, '-c', 'user.name=Evercraft',
      '-c', 'user.email=test@localhost',
      'commit', '-qm', 'fixture'
    ]);

    fs.writeFileSync(tracked, 'protected change\n');
    fs.writeFileSync(untracked, 'unpublished receipt\n');

    const before = [fs.readFileSync(tracked), fs.readFileSync(untracked)];

    const status = execFileSync('git', [
      '-C', dir, 'status', '--porcelain', '--untracked-files=all'
    ], { encoding: 'utf8' });

    const result = classifyFabricCheckoutDirt(status);
    assert.equal(result.journal_dirty, true);
    assert.equal(result.blocking_lines.length, 0);

    assert.deepEqual(fs.readFileSync(tracked), before[0]);
    assert.deepEqual(fs.readFileSync(untracked), before[1]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
