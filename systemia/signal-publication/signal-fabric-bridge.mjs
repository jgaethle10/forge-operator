import { route } from '../signal-fabric/router.mjs';

export function buildSignalFabricCandidates(watch) {
  if (!watch || watch.schema !== 'evercraft.signal.official-source-watch.v1') {
    throw new TypeError('A verified Signal source-watch receipt is required');
  }
  const base = {
    company: 'Evercraft',
    product: 'signal',
    source: 'official-source-watch',
    component: watch.incident_id,
    created_at: watch.checked_at
  };
  const candidates = [];
  if (watch.source_coverage !== 'fresh') {
    candidates.push(route({
      ...base,
      kind: 'source_coverage_gap',
      status: 'degraded',
      evidence_state: 'source_health_receipt_only',
      impact: 'monitoring_blind_spot',
      human_action_required: false,
      summary: 'Official incident source coverage degraded. Do not infer the absence or presence of hazards.'
    }));
  }
  if (watch.review_required) {
    candidates.push(route({
      ...base,
      kind: 'incident_source_review_candidate',
      status: 'needs_review',
      evidence_state: 'official_source_change_not_hazard_confirmation',
      impact: 'editorial_review',
      human_action_required: true,
      summary: 'Official incident source assertion or release-link changed; requires editorial source verification.'
    }));
  }
  return candidates.map(item => ({
    ...item,
    public_warning_authorized: false,
    sent: false,
    note: 'Candidate record only; no notification service was invoked.'
  }));
}
