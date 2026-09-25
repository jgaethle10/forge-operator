#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}
function has(name) { return process.argv.includes(name); }
function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: 'pipe', encoding: 'utf8', ...opts }).trim();
}

const target = path.resolve(arg('--path') || '');
if (!arg('--path')) {
  console.error('usage: private-origin.mjs --path /absolute/path/to/repo.git [--allow-existing]');
  process.exit(2);
}
if (!path.isAbsolute(target)) {
  console.error('target path must be absolute');
  process.exit(2);
}

const exists = fs.existsSync(target);
if (exists && !has('--allow-existing')) {
  console.error('target already exists; pass --allow-existing only for an intentional idempotent check');
  process.exit(3);
}
if (!exists) {
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o750 });
  run('git', ['init', '--bare', target]);
}

const config = [
  ['receive.denyNonFastForwards', 'true'],
  ['receive.denyDeletes', 'true'],
  ['receive.fsckObjects', 'true'],
  ['transfer.fsckObjects', 'true'],
  ['fetch.fsckObjects', 'true'],
  ['http.receivepack', 'false'],
  ['daemon.export', 'false'],
];
for (const [key, value] of config) {
  run('git', ['--git-dir', target, 'config', key, value]);
}

const head = run('git', ['--git-dir', target, 'symbolic-ref', 'HEAD']).replace('refs/heads/', '');
if (head !== 'main') run('git', ['--git-dir', target, 'symbolic-ref', 'HEAD', 'refs/heads/main']);

const receipt = {
  schema: 'evercraft.systemia.private-origin-bootstrap-receipt.v1',
  path: target,
  bare: run('git', ['--git-dir', target, 'rev-parse', '--is-bare-repository']) === 'true',
  default_branch: 'main',
  deny_non_fast_forwards: run('git', ['--git-dir', target, 'config', '--get', 'receive.denyNonFastForwards']) === 'true',
  deny_deletes: run('git', ['--git-dir', target, 'config', '--get', 'receive.denyDeletes']) === 'true',
  receive_fsck: run('git', ['--git-dir', target, 'config', '--get', 'receive.fsckObjects']) === 'true',
  transfer_fsck: run('git', ['--git-dir', target, 'config', '--get', 'transfer.fsckObjects']) === 'true',
};
console.log(JSON.stringify(receipt, null, 2));
