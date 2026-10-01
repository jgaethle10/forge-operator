import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, webcrypto } from 'node:crypto';
import { admitHostBoundaryCapability } from './host-boundary-admission.mjs';
import { pairChromeOsHostBoundaryObserver } from './chromeos-host-boundary-bridge.mjs';
import { EvercraftRemoteOperator } from './remote-operator.mjs';

const sha = (value) => 'sha256:' + createHash('sha256')
  .update(typeof value === 'string' ? value : JSON.stringify(value))
  .digest('hex');

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
    routerMapReceiptFile: path.join(root, 'router-map.json'),
  });

  const status = operator.status();
  assert.equal(status.ok, true);
  assert.deepEqual(status.roots, ['home']);
  assert.equal(status.execution.root_privilege, false);
  assert.equal(status.execution.ambient_secret_environment_forwarded, false);
  assert.equal(status.network_observation.read_only, true);
  assert.equal(status.chromeos_host_boundary.read, true);
  assert.equal(status.chromeos_host_boundary.capabilities, true);
  assert.equal(status.chromeos_host_boundary.field_certification, true);
  assert.equal(status.chromeos_host_boundary.mutation, false);

  const hostCertification = operator.hostBoundaryCertification();
  assert.equal(
    hostCertification.schema,
    'evercraft.chromeos-host-boundary-field-certification.v1',
  );
  assert.equal(hostCertification.state, 'host_observation_unavailable');
  assert.equal(hostCertification.ready_for_external_canary, false);
  assert.equal(hostCertification.mutation_authority, false);

  const hostCapabilities = operator.hostBoundaryCapabilities();
  assert.equal(hostCapabilities.ok, true);
  assert.equal(hostCapabilities.capability_count >= 1, true);
  const chromeCapability = hostCapabilities.capabilities.find(
    (capability) =>
      capability.capability_id === 'chromeos.crostini.port-forwarding.read.v1'
  );
  assert.ok(chromeCapability);
  assert.equal(chromeCapability.mutation_authority, false);
  assert.equal(chromeCapability.arbitrary_desktop_control, false);
  assert.equal(chromeCapability.generic_dispatch_available, false);

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

  await assert.rejects(
    operator.hostCapabilityCheck({
      capability_id: 'chromeos.crostini.port-forwarding.read.v1',
      wait_ms: 0,
    }),
    /host_boundary_capability_field_gate_required/,
  );

  const observerKeyPair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const exportedObserverPublicKey = await webcrypto.subtle.exportKey(
    'jwk',
    observerKeyPair.publicKey,
  );
  const pairedObserver = pairChromeOsHostBoundaryObserver({
    observer_install_id: 'cros_operator_proof',
    public_key_jwk: {
      kty: 'EC',
      crv: 'P-256',
      x: exportedObserverPublicKey.x,
      y: exportedObserverPublicKey.y,
      ext: true,
      key_ops: ['verify'],
    },
  }, {
    stateRoot: path.join(root, 'host-boundary'),
  });

  const certificationBody = {
    schema: 'evercraft.chromeos-host-boundary-field-certification.v1',
    capability_id: 'chromeos.crostini.port-forwarding.read.v1',
    observed_at: new Date().toISOString(),
    state: 'host_setting_and_lan_ready',
    host_observation: {
      observer_install_id: 'cros_operator_proof',
      observer_key_fingerprint: pairedObserver.observer_key_fingerprint,
      observer_signature_verified: true,
      pairing_active: true,
      pairing_matches_observation: true,
    },
    ready_for_external_canary: true,
    external_public_route_verified: false,
    mutation_authority: false,
    raw_accessibility_tree_persisted: false,
  };
  admitHostBoundaryCapability({
    stateRoot: path.join(root, 'host-boundary'),
    capabilityId: certificationBody.capability_id,
    certification: {
      ...certificationBody,
      receipt_hash: sha(certificationBody),
    },
  });

  const admittedCapabilities = operator.hostBoundaryCapabilities();
  const admittedChrome = admittedCapabilities.capabilities.find(
    (capability) => capability.capability_id === certificationBody.capability_id,
  );
  assert.equal(admittedChrome.local_admission.admitted, true);
  assert.equal(admittedChrome.generic_dispatch_available, true);

  const genericHostCheck = await operator.hostCapabilityCheck({
    capability_id: certificationBody.capability_id,
    wait_ms: 0,
  });
  assert.equal(
    genericHostCheck.schema,
    'evercraft.host-boundary-capability-check-result.v1',
  );
  assert.equal(genericHostCheck.pending, true);
  assert.equal(genericHostCheck.mutation_authority, false);

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
    generic_typed_host_capability_dispatch_field_gated: true,
    node_local_field_admission_unlocks_generic_dispatch: true,
    receipt_backed_field_certification_available: true,
  }));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
