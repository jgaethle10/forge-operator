import { DEMO_SCENARIOS, runDemoScenario } from './demo.mjs';

const ROLES = Object.freeze([
  'identity_guard',
  'consent_guard',
  'provider_gate_guard',
  'audit_guard',
]);

const allowedIds = new Set(DEMO_SCENARIOS.map(({ id }) => id));
const isFailure = id => id !== 'authorized';
const expectedCalls = id => id === 'authorized' || id === 'provider_offline' ? 1 : 0;
const assert = (condition, reason) => {
  if (!condition) throw new Error('account_sentinel_saban_gate_failed:' + reason);
};
const fingerprint = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export async function runAssignment({ assignment }) {
  const id = assignment?.item?.raw?.id;
  const role = assignment?.role;
  assert(ROLES.includes(role), 'unregistered_assurance_role');
  assert(allowedIds.has(id), 'unknown_security_scenario');
  const out = await runDemoScenario(id);
  const result = out.result || {};
  const expectedAllow = !isFailure(id);
  // Hard assertions, not just status strings. Any mismatch throws and Saban
  // scheduler must retry/dead-letter instead of silently reporting success.
  assert(out.environment === 'SIMULATION_ONLY', 'simulation_boundary_missing');
  assert(result.allowed === expectedAllow, 'unexpected_policy_decision');
  assert(out.provider_reads === expectedCalls(id), 'provider_contact_boundary_violated');
  assert(out.audit_valid === true, 'broken_evidence_chain');
  assert(expectedAllow ? result.data?.simulated === true : result.data === null,
    'synthetic_data_boundary_violated');
  assert(expectedAllow ? result.receipt?.hash?.length === 64 : true,
    'authorized_receipt_missing');
  if (id === 'audit_offline') assert(out.audit_events.length === 0, 'audit_outage_not_fail_closed');
  if (id === 'authorized') {
    assert(out.audit_events.map(x => x.event?.kind).join('|') === 'preauthorized|read_completed',
      'allow_path_evidence_missing');
  }
  if (id === 'provider_offline') {
    assert(out.audit_events.some(x => x.event?.kind === 'read_failed'),
      'provider_failure_not_reconciled');
  }
  if (!['audit_offline'].includes(id)) {
    assert(out.audit_events.length >= 1, 'decision_receipt_missing');
    assert(out.audit_events.every(x => fingerprint(x.hash)), 'audit_digest_invalid');
  }
  // This synthetic assurance report never returns account balance or session proof.
  return {
    schema: 'evercraft.account-sentinel.saban-assurance.v1',
    status: 'completed',
    passed: true,
    role, scenario_id: id, agent_id: assignment.agent_id,
    decision: result.allowed ? 'allow_read_only' : 'deny',
    denial_reason: result.allowed ? null : result.reason,
    provider_reads: out.provider_reads,
    evidence_count: out.audit_events.length,
    last_evidence_hash: out.audit_events.at(-1)?.hash || null,
    hash_chain_valid: out.audit_valid,
    synthetic_only: true, external_bank_contacted: false,
    financial_write_executed: false, secrets_observed: false,
  };
}

export async function reconcile({ results, plan }) {
  const expectedIds = [...allowedIds].sort();
  const expectedCount = expectedIds.length * ROLES.length;
  assert(plan?.software_id === 'account-sentinel', 'wrong_saban_software');
  assert(plan?.logical_agents === expectedCount, 'insufficient_logical_agent_coverage');
  assert(plan?.physical_workers >= 1 && plan.physical_workers <= 4,
    'physical_worker_budget_exceeded');
  assert(Array.isArray(results) && results.length === expectedCount,
    'missing_or_duplicate_assignment_results');
  const byPair = new Map();
  for (const result of results) {
    assert(result?.schema === 'evercraft.account-sentinel.saban-assurance.v1',
      'unverifiable_result_schema');
    assert(result.status === 'completed' && result.passed === true,
      'worker_failed_assurance');
    assert(result.synthetic_only === true && result.external_bank_contacted === false &&
      result.financial_write_executed === false && result.secrets_observed === false,
      'execution_boundary_claim_failed');
    assert(allowedIds.has(result.scenario_id) && ROLES.includes(result.role),
      'unregistered_result');
    const pair = result.scenario_id + ':' + result.role;
    assert(!byPair.has(pair), 'duplicate_role_scenario');
    byPair.set(pair, result);
    assert(result.provider_reads === expectedCalls(result.scenario_id),
      'reconciliation_provider_call_mismatch');
    assert(result.decision === (result.scenario_id === 'authorized' ? 'allow_read_only' : 'deny'),
      'reconciliation_outcome_mismatch');
    assert(result.hash_chain_valid === true, 'reconciliation_evidence_failed');
  }
  for (const id of expectedIds) for (const role of ROLES) {
    assert(byPair.has(id + ':' + role), 'coverage_gap:' + id + ':' + role);
  }
  return {
    schema: 'evercraft.account-sentinel.saban-reconciliation.v1',
    status: 'reconciled', synthetic_only: true,
    scenario_count: expectedIds.length, required_roles: ROLES,
    expected_assignments: expectedCount, verified_assignments: byPair.size,
    denied_scenarios: expectedIds.filter(isFailure).length,
    live_bank_connections: 0, transaction_authorizations: 0,
    all_provider_boundaries_verified: true,
  };
}
