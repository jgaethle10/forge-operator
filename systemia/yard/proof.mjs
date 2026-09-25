import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startEvercraftComputeNode } from '../compute/runtime-node.mjs';
import { YardOperator } from './operator.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yard-operator-proof-'));
const computeRoot = path.join(root, 'compute');
const stateDir = path.join(root, 'yard-state');
fs.mkdirSync(computeRoot, { recursive: true });

const node = await startEvercraftComputeNode({
  root: computeRoot,
  nodeId: 'yard-compute-proof',
});
const yard = new YardOperator({ stateDir });

try {
  await assert.rejects(
    yard.deployRelease({
      deploymentId: 'mutable-ref',
      releaseRef: 'main',
      workloadClass: 'systemia.private-core-origin.v1',
      capacityEndpoint: node.endpoint,
      input: { target_path: path.join(computeRoot, 'git', 'bad.git') },
      rollbackTarget: 'legacy-checkpoint:fixture',
    }),
    /immutable/
  );

  const releaseRef = 'aaad3c54d6f6af90f95cb27e968b4f4df048efb1';
  const deployment = await yard.deployRelease({
    deploymentId: 'systemia-core-origin-proof',
    releaseRef,
    workloadClass: 'systemia.private-core-origin.v1',
    capacityEndpoint: node.endpoint,
    input: { target_path: path.join(computeRoot, 'git', 'systemia-core.git') },
    rollbackTarget: 'legacy-checkpoint:fixture',
  });

  assert.equal(deployment.state, 'ready');
  assert.equal(deployment.receipt.schema, 'evercraft.yard.deployment-receipt.v1');
  assert.equal(deployment.receipt.runtime_fabric, 'Evercraft Compute');
  assert.equal(deployment.receipt.capacity_protocol, 'evercraft.capacity.v1');
  assert.equal(deployment.receipt.release_ref, releaseRef);
  assert.equal(deployment.receipt.route_verification, 'private_origin_not_publicly_routed');
  assert.equal(yard.getLiveUrl('systemia-core-origin-proof'), null);

  const verified = yard.verifyDeployment('systemia-core-origin-proof');
  assert.equal(verified.ok, true);
  assert.equal(verified.state, 'verified');

  const restored = new YardOperator({ stateDir });
  assert.equal(restored.deploymentStatus('systemia-core-origin-proof').state, 'ready');

  const rollback = await restored.rollbackRelease('systemia-core-origin-proof', {
    reason: 'proof_only',
  });
  assert.equal(rollback.schema, 'evercraft.yard.rollback-receipt.v1');
  assert.equal(rollback.state, 'handoff_required');

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.yard.operator-proof.v1',
    operations: [
      'deploy_release',
      'deployment_status',
      'verify_deployment',
      'get_live_url',
      'rollback_release',
    ],
    immutable_release_enforced: true,
    evercraft_compute_used: true,
    named_cloud_required: false,
    deployment_receipt: deployment.receipt.receipt_hash,
    rollback_receipt: rollback.receipt_hash,
  }, null, 2));
} finally {
  await node.close();
  fs.rmSync(root, { recursive: true, force: true });
}
