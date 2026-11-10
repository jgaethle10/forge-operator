import {
  assertNoSecretValues,
  buildEvacuationPlan,
  reconcilePortfolioPlans
} from './contract.mjs';

function roleFinding(role, plan) {
  const f = plan.features;
  const readiness = plan.readiness;
  const map = {
    source_archaeologist: {
      focus: 'source inventory',
      findings: [
        `entities=${f.entity_count}`,
        `functions=${f.function_count}`,
        `connectors=${f.connector_count}`
      ]
    },
    schema_mapper: {
      focus: 'schema and data',
      findings: f.structured_data
        ? ['canonical_data_required', 'snapshot_and_delta_sync_required']
        : ['no_structured_data_detected']
    },
    runtime_mapper: {
      focus: 'runtime',
      findings: f.server_functions
        ? ['yard_runtime_required', 'function_parity_required']
        : ['static_or_client_only_runtime_possible']
    },
    integration_mapper: {
      focus: 'integrations',
      findings: [
        ...(f.external_connectors ? ['connector_reauthorization_required'] : []),
        ...(f.webhook_ingress ? ['webhook_repoint_required'] : []),
        ...(f.public_machine_access ? ['fabric_discovery_repoint_required'] : [])
      ]
    },
    auth_security_guard: {
      focus: 'identity and secrets',
      findings: [
        ...(f.auth ? ['identity_boundary_required'] : []),
        ...(f.secrets_required ? ['secrets_must_be_rekeyed_not_copied'] : [])
      ]
    },
    data_integrity_guard: {
      focus: 'data integrity',
      findings: f.structured_data
        ? ['row_count_checksum_sampling_required', 'lost_write_prevention_required']
        : ['no_entity_snapshot_required']
    },
    parity_test_designer: {
      focus: 'behavior parity',
      findings: ['critical_journey_contract_required', 'api_contract_replay_required']
    },
    cutover_guard: {
      focus: 'cutover',
      findings: readiness.blocked_gates
    },
    rollback_guard: {
      focus: 'rollback',
      findings: ['rollback_must_be_proven_before_traffic_shift']
    },
    observability_guard: {
      focus: 'post-cutover health',
      findings: ['health_latency_dependency_and_error_receipts_required']
    }
  };
  return map[role] || { focus: 'general', findings: readiness.blocked_gates };
}

export async function runAssignment({ assignment }) {
  const raw = assignment?.item?.raw || {};
  const plan = buildEvacuationPlan(raw);
  assertNoSecretValues(plan);
  const review = roleFinding(assignment.role, plan);

  return {
    schema: 'evercraft.saban.base44-evac-finding.v1',
    status: 'completed',
    agent_id: assignment.agent_id,
    role: assignment.role,
    candidate: {
      name: plan.source.name,
      source_record_fingerprint: plan.source.fingerprint,
      source_identifiers_redacted: plan.source.identifiers_redacted
    },
    focus: review.focus,
    findings: review.findings,
    plan,
    boundary: {
      source_mutation_allowed: false,
      source_decommission_allowed: false,
      secret_values_allowed_in_receipts: false,
      traffic_cutover_allowed_by_this_adapter: false
    }
  };
}

export async function reconcile({ results }) {
  const rows = (results || []).filter(Boolean);
  const byFingerprint = new Map();
  const roleCoverage = {};
  const findings = {};

  for (const row of rows) {
    const fingerprint = row.candidate?.source_record_fingerprint;
    if (!fingerprint) continue;
    if (!byFingerprint.has(fingerprint)) byFingerprint.set(fingerprint, row.plan);
    if (!roleCoverage[fingerprint]) roleCoverage[fingerprint] = new Set();
    roleCoverage[fingerprint].add(row.role);
    if (!findings[fingerprint]) findings[fingerprint] = new Set();
    for (const finding of row.findings || []) findings[fingerprint].add(finding);
  }

  const plans = [...byFingerprint.values()];
  const portfolio = reconcilePortfolioPlans(plans);
  assertNoSecretValues({ portfolio, plans });

  return {
    schema: 'evercraft.saban.base44-evac-reconciliation.v1',
    status: 'reconciled',
    portfolio,
    apps: plans.map((plan) => ({
      name: plan.source.name,
      source_record_fingerprint: plan.source.fingerprint,
      readiness: plan.readiness,
      complexity_score: plan.complexity_score,
      destination_targets: plan.destination_targets.map((row) => row.key),
      role_coverage: [...(roleCoverage[plan.source.fingerprint] || [])].sort(),
      findings: [...(findings[plan.source.fingerprint] || [])].sort()
    })),
    source_mutations_applied: 0,
    source_decommissions_applied: 0,
    secret_values_emitted: false
  };
}
