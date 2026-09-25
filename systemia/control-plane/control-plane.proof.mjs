#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  admitMission,
  assertControlPlane,
  machineInventory,
} from './control-plane.mjs';

const inventory = machineInventory(process.cwd());
assert.equal(inventory.schema, 'evercraft.systemia.machine-inventory.v1');
assert.equal(inventory.summary.source_missing, 0, JSON.stringify(inventory.components.filter((row) => row.state !== 'source_present'), null, 2));
assert.ok(inventory.summary.admitted_public_products >= 50);

const plan = admitMission({
  rootDir: process.cwd(),
  now: new Date('2026-09-25T19:30:00Z'),
  request: {
    mission_key: 'evercraft-one-machine-proof',
    objective: 'Operate Evercraft as one receipt-backed machine.',
    success_condition: 'Every task is Systemia-admitted, bounded, routed, and evidence-aware.',
    direct_specialist_dispatch: true,
    tasks: [
      {
        work_key: 'discover-demand',
        title: 'Refresh machine-readable discovery surfaces',
        work_type: 'discovery',
        product_key: 'aliev',
        software_id: 'chum',
        parallel: true,
        logical_agents: 10000
      },
      {
        work_key: 'analyze-media',
        title: 'Process long media through bounded shards',
        work_type: 'video',
        product_key: 'forensiscope',
        software_id: 'media-pipeline',
        parallel: true,
        dependency_keys: ['discover-demand']
      },
      {
        work_key: 'deliver-artifact',
        title: 'Move a verified artifact to its authorized destination',
        work_type: 'artifact_delivery',
        software_id: 'beast-mode',
        parallel: true,
        dependency_keys: ['analyze-media']
      },
      {
        work_key: 'deploy-release',
        title: 'Deploy a release after the human gate',
        work_type: 'deploy',
        impact: 'destructive_release',
        dependency_keys: ['deliver-artifact']
      }
    ]
  }
});

assertControlPlane(plan);
assert.equal(plan.receipt.authority, 'systemia-organism');
assert.equal(plan.receipt.direct_specialist_dispatch_requested, true);
assert.equal(plan.receipt.direct_specialist_dispatch_granted, false);
assert.equal(plan.dispatch.length, 4);

const discovery = plan.dispatch.find((row) => row.work_key === 'discover-demand');
assert.equal(discovery.specialist_component, 'chum');
assert.equal(discovery.execution_component, 'saban');
assert.equal(discovery.scale_admitted, true);
assert.equal(discovery.mission_authority, 'systemia-organism');
assert.equal(discovery.target_product_key, 'aliev');
assert.equal(discovery.target_product_admitted, true);

const media = plan.dispatch.find((row) => row.work_key === 'analyze-media');
assert.equal(media.execution_component, 'saban');
assert.equal(media.software_id, 'media-pipeline');
assert.equal(media.target_product_key, 'forensiscope');
assert.equal(media.target_product_admitted, true);

const artifact = plan.dispatch.find((row) => row.work_key === 'deliver-artifact');
assert.equal(artifact.execution_component, 'saban');
assert.equal(artifact.software_id, 'beast-mode');

const deploy = plan.dispatch.find((row) => row.work_key === 'deploy-release');
assert.equal(deploy.specialist_component, 'yard-operator');
assert.equal(deploy.hold, 'human_gate_unresolved');
assert.equal(plan.goal_snapshot.status, 'ready');
assert.ok(plan.goal.blockers.includes('Human gate unresolved for deploy-release.'));

const unsupported = admitMission({
  rootDir: process.cwd(),
  request: {
    objective: 'Refuse imaginary scale authority.',
    tasks: [
      {
        work_key: 'unknown-swarm',
        work_type: 'analyze',
        software_id: 'software-that-does-not-exist',
        parallel: true
      }
    ]
  }
});
assert.equal(unsupported.receipt.admitted, false);
assert.equal(unsupported.dispatch[0].hold, 'saban_contract_missing');
assert.equal(unsupported.dispatch[0].mission_authority, 'systemia-organism');

console.log(JSON.stringify({
  ok: true,
  schema: 'evercraft.systemia.control-plane-proof.v1',
  machine_components: inventory.summary.total,
  source_present: inventory.summary.source_present,
  admitted_tasks: plan.dispatch.length,
  scaled_tasks: plan.dispatch.filter((row) => row.scale_admitted).length,
  human_holds: plan.receipt.human_holds.length,
  admitted_public_products: inventory.summary.admitted_public_products,
  unsupported_scale_fail_closed: unsupported.receipt.admitted === false,
  systemia_authority_preserved: true
}, null, 2));
