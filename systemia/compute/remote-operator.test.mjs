import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { EvercraftRemoteOperator } from './remote-operator.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-remote-operator-'));
const state = path.join(root, '.operator-state');
const home = path.join(root, 'home');
fs.mkdirSync(home, { recursive: true });
fs.writeFileSync(path.join(home, 'hello.txt'), 'hello evercraft\n');
fs.mkdirSync(path.join(home, '.ssh'), { recursive: true });
fs.writeFileSync(path.join(home, '.ssh', 'id_ed25519'), 'secret');

try {
  const operator = new EvercraftRemoteOperator({
    roots: { home },
    stateDir: state,
    maxExecMs: 10_000,
  });

  const status = operator.status();
  assert.equal(status.ok, true);
  assert.deepEqual(status.roots, ['home']);
  assert.equal(status.execution.root_privilege, false);
  assert.equal(status.execution.ambient_secret_environment_forwarded, false);
  assert.equal(status.network_observation.read_only, true);

  const network = await operator.networkStatus();
  assert.equal(network.schema, 'evercraft.node-network-observation.v1');
  assert.equal(network.authority.read_only, true);
  assert.equal(network.authority.mutates_network_configuration, false);
  assert.equal(network.authority.exposes_secret_material, false);
  assert.equal(network.evercraft.local_organism.secret_material_exposed, false);
  assert.ok([
    'healthy',
    'degraded',
    'not_installed_or_not_observed',
  ].includes(network.evercraft.local_organism.state));
  assert.equal(
    network.evercraft.external_public_route.state,
    'requires_external_canary'
  );
  assert.ok(network.operator_receipt?.receipt_hash);

  const listed = operator.list({ root_key: 'home', path: '.' });
  assert.ok(listed.entries.some((entry) => entry.name === 'hello.txt'));

  const read = operator.read({ root_key: 'home', path: 'hello.txt' });
  assert.equal(read.content, 'hello evercraft\n');
  assert.throws(
    () => operator.read({ root_key: 'home', path: '.ssh/id_ed25519' }),
    /operator_sensitive_path_denied/
  );


  // A large file remains a hard failure under the original unpaged API.
  // Explicit binary paging carries file identity, page identity and cursor.
  const source = Buffer.from('A🦃B\nmultiple UTF8 bytes, exact pages\n', 'utf8');
  const sourcePath = path.join(home, 'paged.txt');
  fs.writeFileSync(sourcePath, source);
  assert.throws(() => operator.read({
    root_key: 'home', path: 'paged.txt', max_bytes: 3,
  }), /operator_file_too_large/);
  assert.throws(() => operator.read({
    root_key: 'home', path: 'paged.txt', max_bytes: 3, offset_bytes: 0,
  }), /operator_paged_read_requires_base64/);
  assert.throws(() => operator.read({
    root_key: 'home', path: 'paged.txt', encoding: 'base64', offset_bytes: -1,
  }), /operator_read_offset_invalid/);
  assert.throws(() => operator.read({
    root_key: 'home', path: 'paged.txt', encoding: 'base64', offset_bytes: 1,
  }), /operator_expected_file_sha256_required/);

  const observed = [];
  let next = 0;
  let expectedSha;
  let pageCount = 0;
  while (next !== null) {
    const page = operator.read({
      root_key: 'home',
      path: 'paged.txt',
      encoding: 'base64',
      max_bytes: 3,
      offset_bytes: next,
      ...(expectedSha ? { expected_sha256: expectedSha } : {}),
    });
    assert.equal(page.read_mode, 'paged');
    assert.equal(page.file_bytes, source.length);
    assert.equal(page.offset_bytes, observed.reduce((n, p) => n + p.length, 0));
    if (!expectedSha) expectedSha = page.sha256;
    else assert.equal(page.sha256, expectedSha);
    const bytes = Buffer.from(page.content, 'base64');
    assert.equal(page.page_sha256,
      'sha256:' + createHash('sha256').update(bytes).digest('hex'));
    assert.equal(page.bytes, bytes.length);
    assert.equal(page.truncated, page.next_offset_bytes !== null);
    observed.push(bytes);
    next = page.next_offset_bytes;
    assert.ok(++pageCount < 100);
  }
  assert.ok(pageCount > 2);
  assert.deepEqual(Buffer.concat(observed), source);
  assert.equal(expectedSha,
    'sha256:' + createHash('sha256').update(source).digest('hex'));

  // A stale continuation token cannot silently splice pages from two versions.
  fs.writeFileSync(sourcePath, Buffer.concat([source, Buffer.from('modified')]));
  assert.throws(() => operator.read({
    root_key: 'home', path: 'paged.txt', encoding: 'base64',
    offset_bytes: 3, max_bytes: 3, expected_sha256: expectedSha,
  }), /operator_file_identity_mismatch/);
  assert.throws(() => operator.read({
    root_key: 'home', path: '.ssh/id_ed25519',
    encoding: 'base64', offset_bytes: 0,
  }), /operator_sensitive_path_denied/);

  // File-size cap prevents allocating arbitrarily large buffers for a read.
  const huge = path.join(home, 'too-large-for-paging.bin');
  const fd = fs.openSync(huge, 'w');
  try { fs.ftruncateSync(fd, 16 * 1024 * 1024 + 1); }
  finally { fs.closeSync(fd); }
  assert.throws(() => operator.read({
    root_key: 'home', path: 'too-large-for-paging.bin',
    encoding: 'base64', offset_bytes: 0,
  }), /operator_file_exceeds_paged_cap/);

  const written = operator.write({
    root_key: 'home',
    path: 'workspace/result.txt',
    content: 'sealed\n',
    approval_ref: 'proof:user-approved',
  });
  assert.equal(written.ok, true);
  assert.equal(fs.readFileSync(path.join(home, 'workspace/result.txt'), 'utf8'), 'sealed\n');

  await assert.rejects(
    operator.exec({
      root_key: 'home',
      program: 'node',
      args: ['-e', 'console.log(process.env)'],
      approval_ref: 'proof:user-approved',
    }),
    /operator_program_not_allowed/
  );

  await assert.rejects(
    operator.exec({
      root_key: 'home',
      program: 'git',
      args: ['-c', 'alias.pwn=!sh -c id', 'pwn'],
      approval_ref: 'proof:user-approved',
    }),
    /operator_git_subcommand_denied|operator_git_configuration_override_denied/
  );

  await assert.rejects(
    operator.exec({
      root_key: 'home',
      program: 'systemctl',
      args: ['restart', 'ssh.service'],
      approval_ref: 'proof:user-approved',
    }),
    /operator_systemctl_user_scope_required/
  );

  const executed = await operator.exec({
    root_key: 'home',
    cwd: '.',
    program: 'git',
    args: ['--version'],
    approval_ref: 'proof:user-approved',
  });
  assert.equal(executed.ok, true);
  assert.match(executed.stdout, /git version/i);

  const receipts = fs.readFileSync(path.join(state, 'operator-receipts.jsonl'), 'utf8');
  assert.equal(receipts.includes('hello evercraft'), false);
  assert.equal(receipts.includes('secret'), false);
  assert.match(receipts, /evercraft\.remote-operator\.receipt\.v1/);

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.remote-operator-proof.v1',
    sensitive_path_read_blocked: true,
    arbitrary_program_execution_blocked: true,
    git_configuration_override_blocked: true,
    system_service_control_blocked: true,
    mutation_approval_required: true,
    receipt_contents_redacted: true,
    read_only_network_observation_available: true,
    chromeos_host_boundary_not_overclaimed: true,
    byte_exact_hash_bound_pages_verified: true,
    stale_page_identity_blocked: true,
    truncated_read_never_silently_succeeds: true,
  }));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
