#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}
function has(name) { return process.argv.includes(name); }
function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: 'pipe', encoding: 'utf8', ...opts }).trim();
}

export function bootstrapPrivateOrigin({ target, allowExisting = false } = {}) {
  if (!target) throw new Error('target is required');
  const resolved = path.resolve(target);
  if (!path.isAbsolute(resolved)) throw new Error('target path must be absolute');

  const exists = fs.existsSync(resolved);
  if (exists && !allowExisting) {
    throw new Error('target already exists; allowExisting is required for an intentional idempotent check');
  }
  if (!exists) {
    fs.mkdirSync(path.dirname(resolved), { recursive: true, mode: 0o750 });
    run('git', ['init', '--bare', resolved]);
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
    run('git', ['--git-dir', resolved, 'config', key, value]);
  }

  const currentHead = run('git', ['--git-dir', resolved, 'symbolic-ref', 'HEAD']).replace('refs/heads/', '');
  if (currentHead !== 'main') {
    run('git', ['--git-dir', resolved, 'symbolic-ref', 'HEAD', 'refs/heads/main']);
  }

  return {
    schema: 'evercraft.systemia.private-origin-bootstrap-receipt.v1',
    path: resolved,
    bare: run('git', ['--git-dir', resolved, 'rev-parse', '--is-bare-repository']) === 'true',
    default_branch: 'main',
    deny_non_fast_forwards: run('git', ['--git-dir', resolved, 'config', '--get', 'receive.denyNonFastForwards']) === 'true',
    deny_deletes: run('git', ['--git-dir', resolved, 'config', '--get', 'receive.denyDeletes']) === 'true',
    receive_fsck: run('git', ['--git-dir', resolved, 'config', '--get', 'receive.fsckObjects']) === 'true',
    transfer_fsck: run('git', ['--git-dir', resolved, 'config', '--get', 'transfer.fsckObjects']) === 'true',
  };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  try {
    const target = arg('--path');
    if (!target) {
      console.error('usage: private-origin.mjs --path /absolute/path/to/repo.git [--allow-existing]');
      process.exit(2);
    }
    const receipt = bootstrapPrivateOrigin({ target, allowExisting: has('--allow-existing') });
    console.log(JSON.stringify(receipt, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(3);
  }
}
