function clean(value) { return String(value ?? '').trim(); }

export const REQUIRED_RUNTIME_CANARIES = Object.freeze([
  'legacy_rivet_queryable_through_aliev',
  'fresh_foundry_observation_queryable_through_aliev',
  'aliev_package_consumed_by_rivet_report',
  'sites_1_7_destination_readback_verified',
  'w_chestnut_generation_ready',
  'owner_team_authenticated_path',
  'paid_customer_authenticated_path'
]);

export function evaluateRuntimeCertification(receipts = []) {
  const rows = Array.isArray(receipts) ? receipts : [];
  const byCanary = new Map(rows.map((row) => [clean(row?.canary), row]));

  const checks = REQUIRED_RUNTIME_CANARIES.map((canary) => {
    const receipt = byCanary.get(canary);
    const evidenceRefs = Array.isArray(receipt?.evidence_refs)
      ? receipt.evidence_refs.map(clean).filter(Boolean)
      : [];
    const passed = receipt?.status === 'pass'
      && receipt?.authenticated === true
      && receipt?.source_backed === true
      && evidenceRefs.length > 0;

    return {
      canary,
      passed,
      status: clean(receipt?.status) || 'missing',
      authenticated: receipt?.authenticated === true,
      source_backed: receipt?.source_backed === true,
      evidence_refs: evidenceRefs
    };
  });

  const failed = checks.filter((row) => !row.passed);
  return {
    schema: 'evercraft.aliev-rivet.runtime-certification.v1',
    certified: failed.length === 0,
    generation_state_ready_verified: checks.find((row) => row.canary === 'w_chestnut_generation_ready')?.passed === true,
    owner_team_verified: checks.find((row) => row.canary === 'owner_team_authenticated_path')?.passed === true,
    paid_customer_verified: checks.find((row) => row.canary === 'paid_customer_authenticated_path')?.passed === true,
    checks,
    blockers: failed.map((row) => row.canary)
  };
}

export function assertRuntimeCertified(receipts) {
  const result = evaluateRuntimeCertification(receipts);
  if (!result.certified) {
    throw new Error(`runtime_not_certified:${result.blockers.join(',')}`);
  }
  return result;
}
