import test from 'node:test';
import assert from 'node:assert/strict';
import { rivetSnapshotToFaieObservations } from './rivet-bridge.mjs';

test('RIVET bridge reuses neutral site evidence without importing EV-specific conclusions', () => {
  const result = rivetSnapshotToFaieObservations({
    response_profile: 'rivet_report_snapshot_v1',
    retrieved_at: '2026-10-06T17:00:00.000Z',
    state: 'WA',
    postal_code: '98901',
    evidence_state: 'reported',
    utility_rate_candidates: [{ utility: 'Example Utility' }],
    utility_service_area_candidates: [{ utility: 'Example Utility' }],
    freight_context: [{ corridor: 'I-82' }],
    traffic: [{ aadt: 42000 }],
    parcel_planning: [{ county: 'Yakima' }],
    incentives: [{ program: 'Example Program' }],
    chargers: [{ station: 'excluded' }],
    nearby_observed_usage: [{ sessions: 999 }],
    local_ev_stock: { vehicles: 999 },
    source_record_ids: ['https://example.gov/source']
  }, {
    regionKeys: ['yakima-wa']
  });

  assert.equal(result.observation_count, 4);
  assert.deepEqual(
    new Set(result.observations.map((row) => row.kind)),
    new Set([
      'site_utility_context',
      'site_transport_logistics_context',
      'site_parcel_planning_context',
      'site_incentive_policy_context'
    ])
  );
  assert.ok(result.observations.every((row) => row.metadata.ev_specific_fields_excluded === true));
  assert.ok(result.observations.every((row) => row.decision_authority !== true));
  assert.ok(result.exclusions.includes('charging-session utilization'));
  assert.equal(JSON.stringify(result).includes('999'), false);
});
