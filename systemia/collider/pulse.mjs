export function buildKaidancePulse({
  health,
  deployment = null,
  continuity = null,
  fieldAttestation = null,
} = {}) {
  if (!health || health.runtime_schema !== 'evercraft.kaidance.runtime-health.v1') {
    throw new Error('valid KAIDANCE runtime health is required');
  }

  const field = fieldAttestation && fieldAttestation.verified === true
    ? {
        state: 'verified',
        receipt: String(fieldAttestation.receipt_hash || fieldAttestation.receipt || ''),
        enrollment_receipt: fieldAttestation.enrollment_receipt || null,
        verified_at: String(fieldAttestation.verified_at || ''),
      }
    : {
        state: 'not_verified',
        receipt: null,
        enrollment_receipt: null,
        verified_at: null,
      };

  return {
    schema: 'evercraft.kaidance.pulse.v1',
    state: health.state,
    resident: Boolean(health.resident),
    cycle_number: Number(health.cycle_number || 0),
    last_cycle_key: health.last_cycle_key || null,
    last_completed_cycle: health.last_completed_cycle || null,
    cycle_age_seconds: health.cycle_age_seconds,
    heartbeat_target_seconds: Number(health.heartbeat_target_seconds || 0),
    coverage_receipt_valid: Boolean(health.coverage_receipt_valid),
    last_coverage_receipt_key: health.last_coverage_receipt_key || null,
    admitted_count: Number(health.admitted_count || 0),
    held_count: Number(health.held_count || 0),
    deployment_receipt: health.deployment_receipt || null,
    compute_node_id: deployment?.receipt?.capacity_node_id || null,
    runtime_release_ref:
      fieldAttestation?.runtime_release_ref ||
      deployment?.receipt?.capacity_runtime_release_ref ||
      null,
    runtime_payload_digest:
      fieldAttestation?.runtime_payload_digest ||
      deployment?.receipt?.capacity_runtime_payload_digest ||
      null,
    continuity: continuity ? {
      action: continuity.action || null,
      receipt_hash: continuity.receipt_hash || null,
      observed_at: continuity.observed_at || null,
    } : null,
    field_attestation: field,
    observed_at: health.observed_at,
  };
}

export function assertPulsePrivacy(pulse) {
  const raw = JSON.stringify(pulse);
  const forbidden = [
    'evidence_refs',
    'snapshot_path',
    'state_root',
    'capacity_endpoint',
    'allocator_token',
    'lease_id',
    'token',
    'mission_snapshot',
  ];
  for (const term of forbidden) {
    if (raw.includes(term)) throw new Error(`KAIDANCE pulse leaks forbidden field: ${term}`);
  }
  return true;
}
