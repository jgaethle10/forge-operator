import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhotoObservation } from '../systemia/earth-pulse/photo-observation.mjs';
import { buildRepeatPhotoReviewQueue } from '../systemia/earth-pulse/repeat-review.mjs';
import { buildWaterwayContextPackets } from '../systemia/earth-pulse/waterway-context.mjs';

// Synthetic fixtures only: neither a field observation nor an agency finding.
const received_at = '2026-11-15T20:00:00Z';
function photo(letter, time) {
  return normalizePhotoObservation({
    category: 'waterway', site_id: 'yakima-site-001',
    media: {sha256: letter.repeat(64), mime_type: 'image/jpeg'},
    location: {latitude: 46.6021, longitude: -120.5059},
    received_at, observed_at: time
  });
}
const first = photo('a', '2026-11-13T12:00:00Z');
const second = photo('b', '2026-11-14T12:00:00Z');
const site = {
  id: 'yakima-site-001', category: 'waterway',
  region_cell: first.region_cell, review_enabled: true,
  // This is a made-up matching identifier for synthetic unit tests, NOT
  // an assertion that this station is physically located near the photos.
  usgs_station_id: 'USGS-12345678'
};
const pairs = buildRepeatPhotoReviewQueue({sites: [site], observations: [first, second]});

const source = (kind, extra = {}) => ({
  domain: 'hydrology', source_family: 'usgs-water-data-api',
  kind: kind === '00060' ? 'stream_discharge' : 'gage_height',
  metric_metadata: {
    monitoring_location_id: 'USGS-12345678', parameter_code: kind,
    unit_of_measure: kind === '00060' ? 'ft3/s' : 'ft',
    approval_status: 'provisional'
  },
  metric_value: 122,
  created_at: '2026-11-14T12:30:00Z',
  provenance_ref: 'https://api.waterdata.usgs.gov/ogcapi/v0/collections/latest-continuous/items/example?f=json',
  ...extra
});

const build = (options = {}) => buildWaterwayContextPackets({
  pairs, sites: [site], asOf: received_at,
  usgsObservations: [source('00060')],
  ...options
});

test('links only operator-configured USGS context and does not assert hazard', () => {
  const packets = build();
  assert.equal(packets.length, 1);
  const p = packets[0];
  assert.equal(p.station_link_state, 'operator_configured_not_spatially_validated');
  assert.equal(p.water_quality, 'not_assessed');
  assert.equal(p.environmental_hazard, 'not_assessed');
  assert.equal(p.observation_change, 'undetermined');
  assert.equal(p.alert_eligible, false);
  assert.equal(p.publication_state, 'not_authorized');
  assert.equal(p.measurements.stream_discharge.value, 122);
  assert.equal(p.measurements.stream_discharge.unit, 'ft3/s');
  assert.equal(p.measurements.stream_discharge.source_quality, 'source_not_approved');
  assert.equal(p.measurements.gage_height.value, null);
});

test('does not silently turn missing station or readings into zero', () => {
  const packets = build({sites: [{...site, usgs_station_id: undefined}], usgsObservations: []});
  assert.equal(packets[0].measurements.stream_discharge.state, 'no_station_configured');
  assert.equal(packets[0].measurements.stream_discharge.value, null);
});

test('rejects mismatched station and source provenance lookalikes', () => {
  const packets = build({usgsObservations: [
    source('00060', {metric_metadata: {...source('00060').metric_metadata, monitoring_location_id: 'USGS-99999999'}}),
    source('00060', {provenance_ref: 'https://api.waterdata.usgs.gov.evil.example/hijack'}),
    source('00060', {source_family: 'social-media'}),
    source('00060', {metric_value: '0'})
  ]});
  assert.equal(packets[0].measurements.stream_discharge.value, null);
});

test('filters out-of-window and future measurements', () => {
  const packets = build({usgsObservations: [
    source('00060', {created_at: '2026-11-10T12:00:00Z'}),
    source('00060', {created_at: '2026-11-16T12:00:00Z'})
  ]});
  assert.equal(packets[0].measurements.stream_discharge.state, 'no_matching_record_in_supplied_window');
});

test('preserves official source approval separately from photo review', () => {
  const packets = build({usgsObservations: [source('00060', {
    metric_metadata: {...source('00060').metric_metadata, approval_status: 'approved'}
  })]});
  assert.equal(packets[0].measurements.stream_discharge.source_quality, 'source_approved');
  assert.equal(packets[0].review_state, 'research_review_required');
});

test('rejects malformed registered station or changed evidence gates', () => {
  assert.throws(() => build({sites: [{...site, usgs_station_id: '../../secrets'}]}));
  assert.throws(() => build({pairs: [{...pairs[0], alert_eligible: true}]}));
  assert.throws(() => build({maxOffsetHours: 999}));
});

test('does not join site from wrong region or an unregistered field site', () => {
  assert.deepEqual(build({sites: [{...site, region_cell: 'g10:0:0'}]}), []);
  assert.deepEqual(build({sites: []}), []);
});

test('does not expose source coordinates or contributor identity', () => {
  const json = JSON.stringify(build());
  assert.equal(json.includes('46.6021'), false);
  assert.equal(json.includes('-120.5059'), false);
});
