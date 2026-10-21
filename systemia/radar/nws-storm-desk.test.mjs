import assert from 'node:assert/strict';
import test from 'node:test';
import { parseStormAlert, parseStormAlerts, collectNwsStormAlerts } from './nws-storm-desk.mjs';
import { createOfficialCollectors } from './collectors.mjs';
import { emptyRadarState, ingestRadarObservation } from './core.mjs';

const now = '2026-10-14T01:00:00Z';
const base = (overrides = {}) => ({
  id: 'https://api.weather.gov/alerts/urn:oid:2.49.0.1.840.0.test-id',
  properties: {
    event: 'Severe Thunderstorm Warning', status: 'Actual',
    sent: '2026-10-14T00:49:00Z',
    expires: '2026-10-14T01:30:00Z',
    areaDesc: 'Jackson; Clay, Missouri',
    messageType: 'Alert', severity: 'Severe',
    certainty: 'Likely', urgency: 'Immediate',
    ...overrides
  }
});

test('NWS destructive-wind warning is forecast risk, not confirmed impact', () => {
  const x = parseStormAlert(base(), { now });
  assert.ok(x);
  assert.equal(x.facts.forecast, true);
  assert.equal(x.facts.impact_confirmed, false);
  assert.match(x.summary, /not confirmed damage/);
  assert.equal(x.evidence_state, 'verified');
  assert.equal(x.kind, 'storm_warning');
  assert.equal(x.facts.official_alert_id, base().id);
});

test('rejects expired, cancellation, test status, future or old alert issuances', () => {
  assert.equal(parseStormAlert(base({ expires: '2026-10-14T00:59:59Z' }), { now }), null);
  assert.equal(parseStormAlert(base({ messageType: 'Cancel' }), { now }), null);
  assert.equal(parseStormAlert(base({ status: 'Test' }), { now }), null);
  assert.equal(parseStormAlert(base({ sent: '2026-10-14T01:20:00Z' }), { now }), null);
  assert.equal(parseStormAlert(base({ sent: '2026-10-13T17:00:00Z' }), { now }), null);
});

test('rejects non-storm events and untrusted provenance', () => {
  assert.equal(parseStormAlert(base({ event: 'Heat Advisory' }), { now }), null);
  assert.equal(parseStormAlert({ ...base(), id: 'https://example.org/alert' }, { now }), null);
});

test('deduplicates, prioritizes severe warnings and caps national intake', () => {
  const x = parseStormAlerts({ features: [
    base({ event: 'Flood Watch' }),
    base({ event: 'Flood Watch' }),
    { ...base({ event: 'Tornado Warning' }), id: 'https://api.weather.gov/alerts/tornado' }
  ] }, { now, max_items: 1 });
  assert.equal(x.length, 1);
  assert.equal(x[0].facts.event, 'Tornado Warning');
});

test('single official source fetch and honest failure handling', async () => {
  const response = await collectNwsStormAlerts({
    now,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ features: [base()] }) })
  });
  assert.equal(response.observations.length, 1);
  assert.equal(response.collector, 'nws-storm-desk');
  await assert.rejects(() => collectNwsStormAlerts({ now, fetchImpl: async () => ({ ok: false, status: 503 }) }), /503/);
});

test('storm feed is opt-in and never replaces existing official collectors', () => {
  const defaultSet = createOfficialCollectors({ stormAlertsEnabled: false });
  const enabled = createOfficialCollectors({ stormAlertsEnabled: true });
  assert.deepEqual(defaultSet.map((x) => x.id), ['usgs-earthquakes', 'noaa-space-weather']);
  assert.deepEqual(enabled.map((x) => x.id), ['usgs-earthquakes', 'noaa-space-weather', 'nws-storm-desk']);
});

test('Systemia Radar classifies official warnings as PENDING, never observed damage', () => {
  const warning = parseStormAlert(base(), { now });
  const result = ingestRadarObservation(emptyRadarState(), warning, { now });
  assert.equal(result.decision.signal.truth_state, 'PENDING');
  assert.equal(result.decision.publication_authority, false);
});

test('national editorial cap reserves room for another state during concentrated outbreaks', () => {
  const features = Array.from({ length: 8 }, (_, i) => ({
    ...base({ geocode: { UGC: ['KSC' + String(100 + i)] } }),
    id: 'https://api.weather.gov/alerts/kansas-' + i
  }));
  features.push({
    ...base({
      event: 'Flood Watch',
      geocode: { UGC: ['MAZ013'] },
      areaDesc: 'Boston, Massachusetts'
    }),
    id: 'https://api.weather.gov/alerts/massachusetts'
  });
  const selected = parseStormAlerts({ features }, { now, max_items: 2 });
  assert.equal(selected.length, 2);
  assert.deepEqual(selected.map((row) => row.facts.states[0]), ['KS', 'MA']);
  assert.equal(selected[1].facts.forecast, true);
});

test('NWS wrong-schema HTTP 200 does not masquerade as an all-clear', async () => {
  await assert.rejects(
    () => collectNwsStormAlerts({ now, fetchImpl: async () => ({
      ok: true, status: 200, json: async () => ({ error: 'upstream gateway' })
    }) }),
    /missing GeoJSON features/
  );
});

test('national desk includes inland winter storms and low-end flood advisories without inventing impact', () => {
  for (const event of ['Blizzard Warning', 'Winter Storm Watch', 'Ice Storm Warning', 'Snow Squall Warning', 'Lake Effect Snow Warning', 'Flood Advisory', 'Coastal Flood Advisory']) {
    const row = parseStormAlert(base({ event }), { now });
    assert.ok(row, event + ' should be captured');
    assert.equal(row.facts.forecast, true);
    assert.equal(row.facts.impact_confirmed, false);
  }
});
