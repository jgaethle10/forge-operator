import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const runtimePath = fileURLToPath(new URL('../compute/runtime-node.mjs', import.meta.url));

test('Evercraft Compute declares Lineage as a bounded bridged resident workload', async () => {
  const source = await readFile(runtimePath, 'utf8');

  assert.match(source, /startLineageRemoteRuntime/);
  assert.match(source, /'systemia\.lineage-remote\.v1'/);
  assert.match(source, /entry\?\.workload_class === 'systemia\.lineage-remote\.v1'/);
  assert.match(source, /\/v1\/(?:ref/);
  assert.match(source, /lineage_remote_state_outside_admitted_root/);
  assert.match(source, /\.evercraft', 'lineage-remotes'/);
  assert.match(source, /protocol: 'evercraft\.lineage\.remote\.v1'/);
  assert.match(source, /authority_material_exposed: false/);
});

test('Lineage bridge does not inherit the generic resident HTTP surface', async () => {
  const source = await readFile(runtimePath, 'utf8');

  const policyStart = source.indexOf('function bridgeRouteAllowed');
  const policyEnd = source.indexOf('function assertLoopbackBridgeOrigin', policyStart);
  const policy = source.slice(policyStart, policyEnd);

  assert.match(policy, /workload_class === 'systemia\.lineage-remote\.v1'/);
  assert.match(policy, /'\/health', '\/v1\/refs'/);
  assert.match(policy, /ref\\\/(?:read\|cas)/);
  assert.match(policy, /object\\\/(?:has\|get\|put)/);
  assert.match(policy, /return false;/);
});
