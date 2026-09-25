import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: 'pipe', encoding: 'utf8', ...opts }).trim();
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'systemia-private-origin-'));
const origin = path.join(root, 'systemia-core.git');
const work = path.join(root, 'work');
const clone = path.join(root, 'clone');

const out = run('node', ['systemia/core/bootstrap/private-origin.mjs', '--path', origin]);
const receipt = JSON.parse(out);
assert.equal(receipt.schema, 'evercraft.systemia.private-origin-bootstrap-receipt.v1');
assert.equal(receipt.bare, true);
assert.equal(receipt.default_branch, 'main');
assert.equal(receipt.deny_non_fast_forwards, true);
assert.equal(receipt.deny_deletes, true);
assert.equal(receipt.receive_fsck, true);
assert.equal(receipt.transfer_fsck, true);

fs.mkdirSync(work);
run('git', ['init', '-b', 'main'], { cwd: work });
run('git', ['config', 'user.email', 'systemia-proof@evercraft.invalid'], { cwd: work });
run('git', ['config', 'user.name', 'Systemia Proof'], { cwd: work });
fs.writeFileSync(path.join(work, 'README.md'), '# private core fixture\n');
run('git', ['add', 'README.md'], { cwd: work });
run('git', ['commit', '-m', 'seed private core fixture'], { cwd: work });
run('git', ['remote', 'add', 'origin', origin], { cwd: work });
run('git', ['push', '-u', 'origin', 'main'], { cwd: work });

run('git', ['clone', origin, clone]);
assert.equal(fs.readFileSync(path.join(clone, 'README.md'), 'utf8'), '# private core fixture\n');

const refs = run('git', ['--git-dir', origin, 'for-each-ref', '--format=%(refname)', 'refs/heads']);
assert.equal(refs, 'refs/heads/main');

console.log(JSON.stringify({
  ok: true,
  schema: 'evercraft.systemia.private-origin-proof.v1',
  receipt,
  push_verified: true,
  clone_verified: true,
  main_ref_verified: true,
}, null, 2));

fs.rmSync(root, { recursive: true, force: true });
