import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const runtimePath = fileURLToPath(
  new URL('../compute/runtime-node.mjs', import.meta.url)
);

test('Compute declares Lineage Control Room as read-only bridged resident workload', async () => {
  const source = await readFile(runtimePath, 'utf8');

  for (const literal of [
    "startLineageControlRoom",
    "new LineageStore(workspaceRoot)",
    "'systemia.lineage-control-room.v1'",
    "protocol: 'evercraft.lineage.control-room.v1'",
    "mode: 'read_only'",
    "public_route_required: false",
    "authority_material_exposed: false",
    "mutation_authority: false",
    "publication_authority: false",
    "deployment_authority: false",
    "payment_authority: false",
    "private_data_authority: false",
    "lineage_control_room_workspace_outside_admitted_root",
    "lineage_control_room_workspace_unreadable",
    "lineage_control_room_workspace_not_initialized",
    "fs.realpathSync(allowedRoot)",
    "fs.realpathSync(requestedWorkspaceRoot)",
  ]) {
    assert.ok(
      source.includes(literal),
      `missing Lineage Control Room Compute contract: ${literal}`
    );
  }
});

test('Compute bridge gives Control Room an exact GET-only route surface', async () => {
  const source = await readFile(runtimePath, 'utf8');
  const start = source.indexOf('function bridgeRouteAllowed');
  const end = source.indexOf('function assertLoopbackBridgeOrigin', start);
  assert.ok(start >= 0 && end > start, 'bridge route policy must be inspectable');

  const policy = source.slice(start, end);
  assert.match(
    policy,
    /workload_class === 'systemia\.lineage-control-room\.v1'/
  );
  assert.match(policy, /method !== 'GET'/);
  assert.match(policy, /requestPath === '\/'/);
  assert.match(policy, /requestPath === '\/health'/);
  assert.match(policy, /snapshot\|commit\|diff\|integrity/);

  for (const forbidden of [
    '/v1/ref/cas',
    '/v1/object/put',
    '/v1/chunk/put',
    '/v1/large/manifest/put',
    'mutation_authority: true',
  ]) {
    assert.equal(
      policy.includes(forbidden),
      false,
      `Control Room bridge must not expose: ${forbidden}`
    );
  }
});

test('Control Room Compute receipt stores workspace hash, never raw workspace path', async () => {
  const source = await readFile(runtimePath, 'utf8');
  const start = source.indexOf(
    "if (workloadClass === 'systemia.lineage-control-room.v1')"
  );
  const end = source.indexOf(
    "if (workloadClass === 'systemia.kaidance-collider.v1')",
    start
  );
  assert.ok(start >= 0 && end > start);

  const block = source.slice(start, end);
  assert.match(block, /workspace_root_hash: sha\(workspaceRoot\)/);
  assert.doesNotMatch(block, /workspace_root: workspaceRoot/);
  assert.match(block, /service_url: null/);
});
