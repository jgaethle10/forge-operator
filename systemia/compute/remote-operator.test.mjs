import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
    hostBoundaryStateRoot: path.join(root, 'host-boundary'),
  });

  const status = operator.status();
  assert.equal(status.ok, true);
  assert.deepEqual(status.roots, ['home']);
  assert.equal(status.execution.root_privilege, false);
  assert.equal(status.execution.ambient_secret_environment_forwarded, false);
  assert.equal(status.network_observation.read_only, true);
  assert.equal(status.chromeos_host_boundary.read, true);
  assert.equal(status.chromeos_host_boundary.capabilities, true);
  assert.equal(status.chromeos_host_boundary.mutation, false);

  const hostCapabilities = operator.hostBoundaryCapabilities();
  assert.equal(hostCapabilities.ok, true);
  assert.equal(hostCapabilities.capability_count >= 1, true);
  assert.equal(
    hostCapabilities.capabilities.some(
      (capability) =>
        capability.capability_id === 'chromeos.crostini.port-forwarding.read.v1' &&
        capability.mutation_authority === false &&
        capability.arbitrary_desktop_control === false
    ),
    true,
  );

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

  const hostCheck = await operator.hostBoundaryCheck({ wait_ms: 0 });
  assert.equal(hostCheck.ok, true);
  assert.equal(hostCheck.pending, true);
  assert.equal(hostCheck.fulfilled, false);
  assert.match(hostCheck.request_id, /^hostcheck_/);
  assert.equal(hostCheck.mutation_supported, false);

  const genericHostCheck = await operator.hostCapabilityCheck({
    capability_id: 'chromeos.crostini.port-forwarding.read.v1',
    wait_ms: 0,
  });
  assert.equal(
    genericHostCheck.schema,
    'evercraft.host-boundary-capability-check-result.v1',
  );
  assert.equal(
    genericHostCheck.capability_id,
    'chromeos.crostini.port-forwarding.read.v1',
  );
  assert.equal(genericHostCheck.adapter, 'chromeos_crostini_port_forwarding');
  assert.equal(genericHostCheck.mutation_authority, false);
  assert.equal(genericHostCheck.arbitrary_desktop_control, false);

  const listed = operator.list({ root_key: 'home', path: '.' });
  assert.ok(listed.entries.some((entry) => entry.name === 'hello.txt'));

  const read = operator.read({ root_key: 'home', path: 'hello.txt' });
  assert.equal(read.content, 'hello evercraft\n');
  assert.throws(
    () => operator.read({ root_key: 'home', path: '.ssh/id_ed25519' }),
    /operator_sensitive_path_denied/
  );

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
    chromeos_host_boundary_companion_declared_read_only: true,
    on_demand_host_check_request_available: true,
    typed_host_capability_registry_available: true,
    generic_typed_host_capability_dispatch_available: true,
  }));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
