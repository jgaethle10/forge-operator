import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const runtimePath = fileURLToPath(new URL('../compute/runtime-node.mjs', import.meta.url));

test('Evercraft Compute declares Lineage as a bounded bridged resident workload', async () => {
  const source = await readFile(runtimePath, 'utf8');

  for (const literal of [
    "startLineageRemoteRuntime",
    "'systemia.lineage-remote.v1'",
    "entry?.workload_class === 'systemia.lineage-remote.v1'",
    "lineage_remote_state_outside_admitted_root",
    "path.join(allowedRoot, '.evercraft', 'lineage-remotes', remoteKey)",
    "protocol: 'evercraft.lineage.remote.v1'",
    "authority_material_exposed: false",
  ]) {
    assert.ok(source.includes(literal), `missing Compute/Lineage contract literal: ${literal}`);
  }
});

test('Lineage bridge does not inherit the generic resident HTTP surface', async () => {
  const source = await readFile(runtimePath, 'utf8');
  const policyStart = source.indexOf('function bridgeRouteAllowed');
  const policyEnd = source.indexOf('function assertLoopbackBridgeOrigin', policyStart);
  assert.ok(policyStart >= 0 && policyEnd > policyStart, 'bridge route policy must be inspectable');

  const policy = source.slice(policyStart, policyEnd);
  for (const literal of [
    "entry?.workload_class === 'systemia.lineage-remote.v1'",
    "['/health', '/v1/refs'].includes(requestPath)",
    "ref\\/(?:read|cas)",
    "object\\/(?:has|get|put)",
    "return false;",
  ]) {
    assert.ok(policy.includes(literal), `missing bounded Lineage bridge rule: ${literal}`);
  }
});
