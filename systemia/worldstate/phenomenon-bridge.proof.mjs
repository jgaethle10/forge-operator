import assert from 'node:assert/strict';
import { phenomenonPacketFromObservation } from './phenomenon-bridge.mjs';

const modeled = phenomenonPacketFromObservation({
  observation_id: 'ctxobs:puget-currents-proof',
  source_system: 'noaa-sscofs',
  source_family: 'NOAA Salish Sea operational forecast',
  observed_at: '2026-09-26T17:00:00Z',
  region_keys: ['puget-sound'],
  domains: ['ocean', 'water'],
  kind: 'surface_currents',
  evidence_state: 'modeled',
  reliability: 0.9,
  summary: 'Surface-current model for Puget Sound',
  provenance_refs: ['noaa:sscofs:2026-09-26T17'],
  correlation_keys: ['puget-sound::ocean::surface_currents'],
  facts: {
    phenomenon: {
      kind: 'flow',
      title: 'A Week of Currents',
      subtitle: 'Puget Sound surface movement',
      sourceLabel: 'NOAA Salish Sea and Columbia River Operational Forecast System',
      durationSec: 18,
      aspectRatio: '9:16',
      time: {
        startIso: '2026-09-21T00:00:00Z',
        endIso: '2026-09-28T00:00:00Z',
        label: 'MODEL HOUR'
      },
      geography: {
        bounds: { north: 48.5, south: 46.9, west: -123.5, east: -121.8 },
        labels: [{ label: 'Seattle', lat: 47.61, lon: -122.33 }],
      },
      encoding: {
        motionLabel: 'surface-current direction',
        color: { label: 'water temperature', min: 51, max: 61, unit: '°F' },
        brightness: { label: 'current speed', min: 0, max: 5, unit: 'kt' }
      },
      streamlines: [{
        id: 'narrows',
        points: [
          { lat: 47.45, lon: -122.65, colorValue: 57, magnitude: 2.1 },
          { lat: 47.34, lon: -122.58, colorValue: 58, magnitude: 4.8 },
          { lat: 47.20, lon: -122.53, colorValue: 59, magnitude: 3.3 }
        ]
      }],
      callout: 'A narrow passage accelerates the exchange between basins.'
    }
  }
});

assert.equal(modeled.phenomenon_evidence_state, 'modeled');
assert.equal(modeled.input.field.evidenceState, 'modeled');
assert.deepEqual(modeled.input.field.sourceRefs, ['noaa:sscofs:2026-09-26T17']);
assert.equal(modeled.publication_authority, false);
assert.equal(modeled.input.field.streamlines[0].sourceRefs[0], 'noaa:sscofs:2026-09-26T17');

const observed = phenomenonPacketFromObservation({
  source_system: 'field-node',
  source_family: 'Evercraft field observation',
  observed_at: '2026-09-30T18:00:00Z',
  region_keys: ['yakima'],
  domains: ['weather'],
  kind: 'wind',
  evidence_state: 'observed',
  provenance_refs: ['sensor:wind:001'],
  facts: {
    phenomenon: {
      kind: 'flow',
      title: 'Wind across the valley',
      geography: { bounds: { north: 47, south: 46, west: -121, east: -119 } },
      encoding: { motionLabel: 'wind direction' },
      streamlines: [{
        id: 'wind-1',
        points: [{ lat: 46.5, lon: -120.7 }, { lat: 46.6, lon: -120.3 }]
      }]
    }
  }
});
assert.equal(observed.input.field.evidenceState, 'observed');

assert.throws(() => phenomenonPacketFromObservation({
  source_system: 'source',
  observed_at: '2026-09-30T18:00:00Z',
  region_keys: ['global'],
  domains: ['general'],
  kind: 'observation',
  evidence_state: 'reported',
  provenance_refs: ['source:1'],
  facts: {}
}), /explicit facts\.phenomenon contract/);

console.log(JSON.stringify({
  ok: true,
  schema: 'evercraft.worldstate.fallen-phenomenon-proof.v1',
  modeled_preserved: modeled.input.field.evidenceState === 'modeled',
  observed_preserved: observed.input.field.evidenceState === 'observed',
  provenance_bound: modeled.input.field.sourceRefs.length === 1,
  publication_authority: modeled.publication_authority,
}, null, 2));
