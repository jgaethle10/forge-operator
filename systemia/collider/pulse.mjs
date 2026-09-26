const SAFE_PULSE_HOLD_CATEGORIES = new Set([
  'remote_device_trust',
]);

function sanitizeSafeHolds(value) {
  if (!Array.isArray(value)) return [];
  const totals = new Map();
  for (const row of value) {
    const category = String(row?.category || '').trim().toLowerCase();
    if (!SAFE_PULSE_HOLD_CATEGORIES.has(category)) continue;
    const rawCount = Number(row?.count);
    if (!Number.isFinite(rawCount) || rawCount <= 0) continue;
    const count = Math.min(9999, Math.floor(rawCount));
    totals.set(category, (totals.get(category) || 0) + count);
  }
  return [...totals.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

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
        receipt: String(fieldAttestation.receipt || ''),
        verified_at: String(fieldAttestation.verified_at || ''),
      }
    : {
        state: 'not_verified',
        receipt: null,
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
    safe_holds: sanitizeSafeHolds(health.safe_holds),
    deployment_receipt: health.deployment_receipt || null,
    compute_node_id: deployment?.receipt?.capacity_node_id || null,
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
