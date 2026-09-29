#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  admitMission,
  assertControlPlane,
  listRemoteDeviceTrustCandidates,
  machineInventory,
  prepareRemoteDeviceTrustChange,
} from './control-plane.mjs';

const inventory = machineInventory(process.cwd());
assert.equal(inventory.schema, 'evercraft.systemia.machine-inventory.v1');
assert.equal(inventory.summary.source_missing, 0, JSON.stringify(inventory.components.filter((row) => row.state !== 'source_present'), null, 2));
assert.ok(inventory.summary.admitted_public_products >= 50);
for (const key of [
  'evercraft-passport',
  'evercraft-meter',
  'evercraft-interaction-ledger',
  'evercraft-context-fabric',
  'evercraft-intake-fabric',
  'evercraft-execution-gate',
  'direct-door-readiness',
  'evercraft-capability-mesh',
]) {
  const component = inventory.components.find((row) => row.component_key === key);
  assert.ok(component, 'missing control-plane component: ' + key);
  assert.equal(component.state, 'source_present', 'component source missing: ' + key);
}

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
assert.equal(discovery.execution_authority_granted, false);
assert.equal(discovery.route_selection_grants_execution_authority, false);

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
assert.equal(deploy.execution_gate_required, true);
assert.equal(deploy.pre_dispatch_gate, 'evercraft-execution-gate');
assert.equal(deploy.execution_authority_granted, false);
assert.equal(plan.goal_snapshot.status, 'ready');
assert.ok(plan.goal.blockers.includes('Human gate unresolved for deploy-release.'));




const outbound = admitMission({
  rootDir: process.cwd(),
  request: {
    objective: 'Send one authorized customer follow-up without bypassing relationship safety.',
    tasks: [
      {
        work_key: 'customer-follow-up',
        work_type: 'external_message',
        authorization_refs: ['approval:customer-follow-up:001'],
      }
    ]
  }
});
assertControlPlane(outbound);
assert.equal(outbound.dispatch[0].human_gate_required, true);
assert.equal(outbound.dispatch[0].hold, null);
assert.equal(outbound.dispatch[0].relationship_preflight_required, true);
assert.equal(
  outbound.dispatch[0].relationship_preflight_component,
  'evercraft-interaction-ledger'
);
assert.equal(outbound.dispatch[0].execution_gate_required, true);
assert.equal(outbound.dispatch[0].pre_dispatch_gate, 'evercraft-execution-gate');
assert.equal(outbound.dispatch[0].execution_authority_granted, false);

const meteredAnalysis = admitMission({
  rootDir: process.cwd(),
  request: {
    objective: 'Run a metered site analysis with permission-aware context.',
    tasks: [
      {
        work_key: 'metered-analysis',
        work_type: 'analyze',
        product_key: 'aliev',
        metered: true,
        meter_metric: 'site_reports',
      }
    ]
  }
});
assertControlPlane(meteredAnalysis);
assert.equal(meteredAnalysis.dispatch[0].context_component, 'evercraft-context-fabric');
assert.equal(meteredAnalysis.dispatch[0].usage_component, 'evercraft-meter');
assert.equal(meteredAnalysis.dispatch[0].execution_gate_required, true);
assert.equal(meteredAnalysis.dispatch[0].pre_dispatch_gate, 'evercraft-execution-gate');


const contractDerived = admitMission({
  rootDir: process.cwd(),
  request: {
    objective: 'Generate one RIVET site report using product-contract semantics.',
    tasks: [
      {
        work_key: 'contract-report',
        work_type: 'analyze',
        product_key: 'aliev',
        action_scope: 'report.generate',
      }
    ]
  }
});
assertControlPlane(contractDerived);
const contractDispatch = contractDerived.dispatch[0];
assert.equal(contractDispatch.capability_contract_state, 'complete_declaration');
assert.equal(contractDispatch.contract_action_scope, 'report.generate');
assert.equal(contractDispatch.contract_specialist_slug, 'aliev');
assert.equal(contractDispatch.contract_context_namespace, 'aliev');
assert.equal(contractDispatch.metered, true);
assert.equal(contractDispatch.meter_metric, 'site_reports');
assert.equal(contractDispatch.usage_component, 'evercraft-meter');
assert.equal(contractDispatch.execution_gate_required, true);
assert.equal(contractDispatch.pre_dispatch_gate, 'evercraft-execution-gate');
assert.equal(contractDispatch.hold, null);
assert.equal(contractDispatch.execution_authority_granted, false);
assert.equal(contractDispatch.contract_runtime_verified, false);

const contractBadScope = admitMission({
  rootDir: process.cwd(),
  request: {
    objective: 'Reject an undeclared AliEV action.',
    tasks: [
      {
        work_key: 'bad-contract-scope',
        work_type: 'analyze',
        product_key: 'aliev',
        action_scope: 'payment.refund',
      }
    ]
  }
});
assert.equal(contractBadScope.receipt.admitted, false);
assert.equal(contractBadScope.dispatch[0].hold, 'capability_contract_scope_missing');

const contractMeterMismatch = admitMission({
  rootDir: process.cwd(),
  request: {
    objective: 'Reject caller attempts to replace the contracted Meter metric.',
    tasks: [
      {
        work_key: 'bad-meter',
        work_type: 'analyze',
        product_key: 'aliev',
        action_scope: 'report.generate',
        meter_metric: 'compute_seconds',
      }
    ]
  }
});
assert.equal(contractMeterMismatch.receipt.admitted, false);
assert.equal(contractMeterMismatch.dispatch[0].hold, 'capability_contract_meter_mismatch');

const missingProductContract = admitMission({
  rootDir: process.cwd(),
  request: {
    objective: 'Fail closed on an action-scoped product that has no Capability Mesh contract.',
    tasks: [
      {
        work_key: 'missing-product-contract',
        work_type: 'execute',
        product_key: 'findmypart',
        action_scope: 'parts.search',
      }
    ]
  }
});
assert.equal(missingProductContract.receipt.admitted, false);
assert.equal(
  missingProductContract.dispatch[0].hold,
  'product_contract_missing_for_action'
);
assert.equal(missingProductContract.dispatch[0].execution_authority_granted, false);

const intakePlan = admitMission({
  rootDir: process.cwd(),
  request: {
    objective: 'Review a normalized inbound candidate without treating its content as authority.',
    tasks: [
      {
        work_key: 'review-intake',
        work_type: 'intake',
        intake_candidate_ref: 'candidate:proof:001',
      }
    ]
  }
});
assertControlPlane(intakePlan);
assert.equal(intakePlan.dispatch[0].specialist_component, 'evercraft-intake-fabric');
assert.equal(intakePlan.dispatch[0].intake_component, 'evercraft-intake-fabric');
assert.equal(intakePlan.dispatch[0].inbound_content_grants_execution_authority, false);
assert.equal(intakePlan.dispatch[0].execution_authority_granted, false);

const trustReview = admitMission({
  rootDir: process.cwd(),
  request: {
    objective: 'Review attested pending remote devices without changing trust.',
    tasks: [
      {
        work_key: 'review-pending-device',
        work_type: 'trust_review',
      }
    ]
  }
});
assert.equal(trustReview.dispatch[0].specialist_component, 'yard-operator');
assert.equal(trustReview.dispatch[0].hold, null);
assert.equal(trustReview.dispatch[0].human_gate_required, false);

const trustChange = admitMission({
  rootDir: process.cwd(),
  request: {
    objective: 'Authorize a pending remote device.',
    tasks: [
      {
        work_key: 'authorize-pending-device',
        work_type: 'trust_change',
      }
    ]
  }
});
assert.equal(trustChange.dispatch[0].specialist_component, 'yard-operator');
assert.equal(trustChange.dispatch[0].human_gate_required, true);
assert.equal(trustChange.dispatch[0].hold, 'human_gate_unresolved');
assert.equal(trustChange.receipt.human_holds.length, 1);

const candidateFingerprint = 'sha256:' + 'a'.repeat(64);
const candidateReceipt = 'sha256:' + '1'.repeat(64);
const fakeYard = {
  async listPendingRemoteDevices(id) {
    assert.equal(id, 'broker-proof');
    return {
      schema: 'evercraft.yard.pending-remote-devices.v1',
      broker_deployment_id: id,
      count: 1,
      pending: [
        {
          node_id: 'chromebook-proof',
          device_fingerprint: candidateFingerprint,
          request_receipt_hash: candidateReceipt,
          identity_attested: true,
          authority_granted: false,
        }
      ],
      observed_at: '2026-09-26T02:10:00Z',
    };
  }
};

const candidates = await listRemoteDeviceTrustCandidates({
  yard: fakeYard,
  brokerDeploymentId: 'broker-proof',
});
assert.equal(candidates.authority, 'read_only');
assert.equal(candidates.trust_change_executed, false);
assert.equal(candidates.count, 1);
assert.ok(candidates.candidates[0].candidate_ref.startsWith('candidate:sha256:'));
assert.ok(!JSON.stringify(candidates).includes(candidateFingerprint));

const preparedTrustChange = prepareRemoteDeviceTrustChange({
  brokerDeploymentId: 'broker-proof',
  candidateRef: candidates.candidates[0].candidate_ref,
});
assert.equal(
  preparedTrustChange.schema,
  'evercraft.systemia.remote-device-trust-change-plan.v1'
);
assert.equal(preparedTrustChange.impact, 'trust_boundary');
assert.equal(preparedTrustChange.human_gate_required, true);
assert.equal(preparedTrustChange.explicit_candidate_confirmation_required, true);
assert.equal(preparedTrustChange.explicit_approval_reference_required, true);
assert.equal(preparedTrustChange.executable_by_control_plane, false);
assert.ok(!JSON.stringify(preparedTrustChange).includes(candidateFingerprint));

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
  trust_chain_components_present: [
    'evercraft-passport',
    'evercraft-meter',
    'evercraft-interaction-ledger',
    'evercraft-context-fabric',
    'evercraft-intake-fabric',
    'evercraft-execution-gate',
    'direct-door-readiness',
  ].every((key) => inventory.components.some((row) => row.component_key === key && row.state === 'source_present')),
  external_message_requires_relationship_preflight:
    outbound.dispatch[0].relationship_preflight_required === true,
  external_message_requires_execution_gate:
    outbound.dispatch[0].execution_gate_required === true,
  metered_work_requires_execution_gate:
    meteredAnalysis.dispatch[0].execution_gate_required === true,
  intake_content_grants_no_execution_authority:
    intakePlan.dispatch[0].execution_authority_granted === false,
  product_contract_derives_meter_and_execution_gate:
    contractDispatch.meter_metric === 'site_reports' &&
    contractDispatch.execution_gate_required === true,
  undeclared_contract_scope_fails_closed:
    contractBadScope.dispatch[0].hold === 'capability_contract_scope_missing',
  missing_product_contract_action_fails_closed:
    missingProductContract.dispatch[0].hold === 'product_contract_missing_for_action',
  unsupported_scale_fail_closed: unsupported.receipt.admitted === false,
  trust_review_read_only: candidates.authority === 'read_only',
  trust_change_forced_human_gate: trustChange.dispatch[0].hold === 'human_gate_unresolved',
  trust_change_control_plane_execution_disabled:
    preparedTrustChange.executable_by_control_plane === false,
  raw_device_fingerprint_redacted: !JSON.stringify(candidates).includes(candidateFingerprint),
  systemia_authority_preserved: true
}, null, 2));
