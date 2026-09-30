import assert from 'node:assert/strict';
import test from 'node:test';
import { compilePhenomenonCanvas, validatePhenomenon, type PhenomenonInput } from './phenomenon-renderer.js';

const input: PhenomenonInput = {
  id: 'puget-flow-proof',
  title: 'A Week of Currents',
  subtitle: 'Surface movement through a constrained inland sea',
  durationSec: 20,
  aspectRatio: '9:16',
  time: {
    startIso: '2026-09-21T00:00:00Z',
    endIso: '2026-09-28T00:00:00Z',
    label: 'MODEL HOUR',
  },
  geography: {
    bounds: { north: 48.4, south: 46.9, west: -123.4, east: -121.9 },
    outlines: [{
      id: 'shore-proof',
      points: [{ lat: 48.2, lon: -123.0 }, { lat: 47.6, lon: -122.6 }, { lat: 47.1, lon: -122.8 }],
    }],
    labels: [
      { label: 'Seattle', lat: 47.61, lon: -122.33 },
      { label: 'Tacoma', lat: 47.25, lon: -122.44 },
    ],
  },
  encoding: {
    motionLabel: 'surface-current direction',
    color: { label: 'water temperature', min: 51, max: 61, unit: '°F' },
    brightness: { label: 'current speed', min: 0, max: 5, unit: 'kt' },
  },
  field: {
    kind: 'flow',
    evidenceState: 'modeled',
    sourceRefs: ['noaa:sscofs:proof'],
    streamlines: [
      {
        id: 'narrows',
        sourceRefs: ['noaa:sscofs:proof'],
        speed: 1.2,
        points: [
          { lat: 47.45, lon: -122.65, colorValue: 57, magnitude: 2.1 },
          { lat: 47.34, lon: -122.58, colorValue: 58, magnitude: 4.8 },
          { lat: 47.20, lon: -122.53, colorValue: 59, magnitude: 3.3 },
        ],
      },
    ],
  },
  source: {
    label: 'NOAA operational forecast model',
    refs: ['noaa:sscofs:proof'],
  },
  callout: 'A narrow passage accelerates the exchange between basins.',
};

test('phenomenon canvas turns one sourced physical process into an exact-frame cinematic surface', () => {
  const validation = validatePhenomenon(input);
  assert.equal(validation.status, 'accepted');

  const bundle = compilePhenomenonCanvas(input);
  assert.equal(bundle.receipt.status, 'accepted');
  assert.equal(bundle.receipt.stream_count, 1);
  assert.equal(bundle.receipt.sample_count, 3);
  assert.equal(bundle.receipt.publication_authority, false);
  assert.match(bundle.html, /__evercraftRenderAt/);
  assert.match(bundle.html, /__evercraftRenderFrame/);
  assert.match(bundle.html, /BRIGHTNESS =/);
  assert.match(bundle.html, /NOAA operational forecast model/);
  assert.doesNotMatch(bundle.html, /<script[^>]+src=/);
});

test('phenomenon canvas fails closed when encoded values or provenance are missing', () => {
  const missingMagnitude: PhenomenonInput = structuredClone(input);
  delete missingMagnitude.field.streamlines[0].points[0].magnitude;
  assert.equal(validatePhenomenon(missingMagnitude).status, 'rejected');

  const outsideSource: PhenomenonInput = structuredClone(input);
  outsideSource.field.sourceRefs = ['unknown:model'];
  const result = validatePhenomenon(outsideSource);
  assert.equal(result.status, 'rejected');
  assert.ok(result.errors.some((error) => error.startsWith('field_source_ref_outside_source:')));
});
