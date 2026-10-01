import assert from 'node:assert/strict';
import test from 'node:test';
import { collectNasaEonet, collectNwsActiveHazards } from './collectors.mjs';

function jsonFetch(payload) {
  return async () => ({
    ok: true,
    async json() { return payload; }
  });
}

test('NWS active hazards become verified Radar observations without turning forecasts into outcomes', async () => {
  const result = await collectNwsActiveHazards({
    now: '2026-09-30T20:00:00.000Z',
    fetchImpl: jsonFetch({
      features: [{
        id: 'https://api.weather.gov/alerts/test-1',
        properties: {
          id: 'test-1',
          event: 'Flash Flood Warning',
          headline: 'Flash flooding is expected in the warned area.',
          areaDesc: 'Example County, Washington',
          sent: '2026-09-30T19:55:00.000Z',
          expires: '2026-09-30T22:00:00.000Z',
          severity: 'Severe',
          certainty: 'Likely',
          urgency: 'Immediate',
          status: 'Actual',
          '@id': 'https://api.weather.gov/alerts/test-1'
        }
      }]
    })
  });

  assert.equal(result.observations.length, 1);
  const observation = result.observations[0];
  assert.equal(observation.source_family, 'noaa-national-weather-service');
  assert.equal(observation.evidence_state, 'verified');
  assert.equal(observation.facts.forecast, true);
  assert.ok(observation.domains.includes('weather'));
  assert.ok(observation.domains.includes('disaster'));
  assert.ok(observation.provenance_refs[0].startsWith('https://api.weather.gov/'));
});

test('NASA EONET opens a global discovery signal but remains reported, not independent corroboration', async () => {
  const result = await collectNasaEonet({
    now: '2026-09-30T20:00:00.000Z',
    fetchImpl: jsonFetch({
      events: [{
        id: 'EONET_1',
        title: 'Example Flood',
        description: 'An open flood event.',
        link: 'https://eonet.gsfc.nasa.gov/api/v3/events/EONET_1',
        closed: null,
        categories: [{ id: 'floods', title: 'Floods' }],
        sources: [{ id: 'ExampleSource', url: 'https://example.org/flood' }],
        geometry: [{
          date: '2026-09-30T19:45:00.000Z',
          type: 'Point',
          coordinates: [-120.5, 46.6]
        }]
      }]
    })
  });

  assert.equal(result.observations.length, 1);
  const observation = result.observations[0];
  assert.equal(observation.source_family, 'nasa-eonet');
  assert.equal(observation.evidence_state, 'reported');
  assert.equal(observation.metadata.intake_role, 'event_discovery_not_independent_corroboration');
  assert.ok(observation.domains.includes('water'));
  assert.ok(observation.domains.includes('disaster'));
  assert.notEqual(observation.region_key, 'global');
  assert.equal(observation.facts.subject_key, 'nasa-eonet:EONET_1');
  assert.ok(observation.provenance_refs.length >= 2);
});
