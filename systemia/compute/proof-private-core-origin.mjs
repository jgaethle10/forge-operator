import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { startEvercraftComputeNode } from './runtime-node.mjs';

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', ...opts }).trim();

async function j(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json();
  return { status: response.status, body };
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-compute-core-'));
const node = await startEvercraftComputeNode({ root, nodeId: 'yard-proof-node' });

try {
  const capacity = await j(`${node.endpoint}/v1/capacity`);
  assert.equal(capacity.status, 200);
  assert.equal(capacity.body.protocol, 'evercraft.capacity.v1');
  assert.equal(capacity.body.runtime, 'Evercraft Compute');
  assert.ok(capacity.body.supported_workloads.includes('systemia.private-core-origin.v1'));

  const lease = await j(`${node.endpoint}/v1/leases`, {
    method: 'POST',
    body: JSON.stringify({ workload_class: 'systemia.private-core-origin.v1' }),
  });
  assert.equal(lease.status, 201);

  const repoPath = path.join(root, 'git', 'systemia-core.git');
  const job = await j(`${node.endpoint}/v1/jobs`, {
    method: 'POST',
    body: JSON.stringify({
      lease_id: lease.body.lease_id,
      token: lease.body.token,
      workload_class: 'systemia.private-core-origin.v1',
      input: { target_path: repoPath },
    }),
  });
  assert.equal(job.status, 200);
  assert.equal(job.body.ok, true);
  assert.equal(job.body.result.bare, true);
  assert.equal(job.body.result.default_branch, 'main');

  assert.equal(run('git', ['--git-dir', repoPath, 'rev-parse', '--is-bare-repository']), 'true');
  assert.equal(run('git', ['--git-dir', repoPath, 'config', '--get', 'receive.denyDeletes']), 'true');

  const escaped = await j(`${node.endpoint}/v1/jobs`, {
    method: 'POST',
    body: JSON.stringify({
      lease_id: lease.body.lease_id,
      token: lease.body.token,
      workload_class: 'systemia.private-core-origin.v1',
      input: { target_path: path.resolve(root, '..', 'forbidden-systemia-core.git') },
    }),
  });
  assert.equal(escaped.status, 403);
  assert.equal(escaped.body.error, 'target_outside_admitted_root');

  const unsupported = await j(`${node.endpoint}/v1/leases`, {
    method: 'POST',
    body: JSON.stringify({ workload_class: 'arbitrary.shell.v1' }),
  });
  assert.equal(unsupported.status, 422);
  assert.equal(unsupported.body.error, 'unsupported_workload');

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.systemia.core-on-compute-proof.v1',
    runtime: 'Evercraft Compute',
    capacity_protocol: capacity.body.protocol,
    workload: 'systemia.private-core-origin.v1',
    private_origin_created: true,
    lease_receipt: lease.body.receipt.receipt_hash,
    workload_receipt: job.body.receipt.receipt_hash,
    arbitrary_shell_rejected: true,
    path_escape_rejected: true,
  }, null, 2));
} finally {
  await node.close();
  fs.rmSync(root, { recursive: true, force: true });
}
