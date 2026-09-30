import assert from 'node:assert/strict';
import test from 'node:test';
import { startAliEvSourceRuntime } from '../systemia/aliev/source-runtime.mjs';

function response(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

function mockFetch(url) {
  const parsed = new URL(url);
  if (parsed.hostname === 'geocoding.geo.census.gov') return Promise.resolve(response({
    result: { addressMatches: [{
      matchedAddress: '6405 W CHESTNUT AVE, YAKIMA, WA, 98908',
      coordinates: { x: -120.5942, y: 46.59655 },
      addressComponents: { state: 'WA', zip: '98908' },
      geographies: { Counties: [{ NAME: 'Yakima County', GEOID: '53077' }] }
    }] }
  }));
  if (parsed.hostname === 'developer.nlr.gov' && parsed.pathname.includes('alt-fuel-stations')) return Promise.resolve(response({
    fuel_stations: [{
      id: 1, station_name: 'Proof Charge', ev_network: 'Proof Network',
      latitude: 46.6, longitude: -120.59, ev_dc_fast_num: 4,
      ev_connector_types: ['J1772COMBO'], street_address: '1 Proof Way',
      city: 'Yakima', state: 'WA', zip: '98908', status_code: 'E'
    }]
  }));
  if (parsed.hostname === 'developer.nlr.gov' && parsed.pathname.includes('transportation-incentives-laws')) return Promise.resolve(response({
    result: [{ id: 7, title: 'Proof EV program', jurisdiction: 'US-WA', url: 'https://example.test/program' }]
  }));
  if (parsed.hostname === 'api.openei.org') return Promise.resolve(response({
    items: [{ label: 'Proof commercial tariff', utility: 'Proof Utility', startdate: '2026-01-01' }]
  }));
  if (parsed.hostname === 'data.wsdot.wa.gov') return Promise.resolve(response({
    features: [{ attributes: { AADT: 22100, RouteName: 'US 12', Year: 2025 }, geometry: { x: -120.59, y: 46.60 } }]
  }));
  if (parsed.hostname === 'gis.ecology.wa.gov') return Promise.resolve(response({
    features: [{ attributes: { UTILITY_NAME: 'Proof Utility' } }]
  }));
  if (parsed.hostname === 'overpass-api.de') return Promise.resolve(response({
    elements: [{ type: 'node', id: 99, lat: 46.597, lon: -120.593, tags: { tourism: 'hotel', name: 'Proof Hotel' } }]
  }));
  throw new Error('unexpected mock URL');
}

test('owned AliEV source emits explicit RIVET snapshot contract', async () => {
  const runtime = await startAliEvSourceRuntime({
    port: 0,
    systemiaMachineKey: 'proof-key',
    afdcApiKey: 'proof-afdc',
    openEiApiKey: 'proof-openei',
    fetchImpl: mockFetch,
    now: () => '2026-09-30T19:40:00.000Z'
  });
  try {
    const health = await fetch(runtime.service_url + '/health').then(r => r.json());
    assert.equal(health.runtime_owner, 'evercraft');
    assert.equal(health.legacy_provider_transport, false);

    const res = await fetch(runtime.service_url + '/v1/site-snapshot', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-systemia-machine-key': 'proof-key' },
      body: JSON.stringify({ address: '6405 W Chestnut Ave, Yakima, WA 98908', mode: 'rivet_report_snapshot' })
    });
    assert.equal(res.status, 200);
    const snapshot = await res.json();
    assert.equal(snapshot.response_profile, 'rivet_report_snapshot_v1');
    assert.equal(snapshot.evidence_state, 'SOURCE_BACKED_OWNED_RUNTIME');
    assert.equal(snapshot.chargers.length, 1);
    assert.equal(snapshot.traffic[0].aadt, 22100);
    assert.equal(snapshot.washington_utility_service_area_candidates.length, 1);
    assert.equal(snapshot.utility_rate_candidates.length, 1);
    assert.equal(snapshot.incentives.length, 1);
    assert.equal(snapshot.dwell_anchors.length, 1);
    assert.equal(snapshot.nearby_observed_usage.length, 0);
    assert.equal(snapshot.coverage_contract.sessions_utilization.state, 'NOT_OBSERVABLE');

    const required = ['geocoding','charging_inventory','traffic','traffic_temporal','utility_service_area','utility_tariff','incentives','parcel_planning','local_ev_stock','observed_sessions','freight','dwell_context','deep_market_evidence','provenance'];
    for (const domain of required) assert.ok(snapshot.source_coverage_manifest.domains[domain]?.state, domain);
    assert.equal(JSON.stringify(snapshot).toLowerCase().includes('base44'), false);
  } finally {
    await runtime.close();
  }
});
