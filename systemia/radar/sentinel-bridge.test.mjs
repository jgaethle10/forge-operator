import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  readSentinelRadarBridge,
  sentinelSnapshotToRadarObservations
} from './sentinel-bridge.mjs';

function snapshot(overrides = {}) {
  return {
    schema: 'systemia.sentinel.resident-cycle.v1',
    cycle_count: 42,
    observed_at: '2026-10-02T06:10:00.000Z',
    coverage: {
      healthy: true,
      required_source_coverage_ratio: 1,
      blind_spots: []
    },
    event_graph: {
      nodes: [{
        node_id: 'sentinel-000001',
        incident_id: 'sentinel-000001',
        region_key: 'Yakima County, WA',
        region_groups: ['coarse-grid:yakima'],
        first_seen_at: '2026-10-02T06:08:00.000Z',
        last_seen_at: '2026-10-02T06:10:00.000Z',
        level: 'elevated',
        confidence: 0.78,
        domains: ['weather', 'hydrology'],
        independent_source_groups: ['noaa-nws', 'usgs'],
        verified_observations: 1,
        confirmed_hazard: false,
        provenance_refs: [
          'https://api.weather.gov/alerts/example',
          'https://api.waterdata.usgs.gov/example'
        ]
      }],
      edges: [],
      clusters: [{
        cluster_id: 'regional-event-0001',
        incident_ids: ['sentinel-000001'],
        domains: ['weather', 'hydrology'],
        independent_source_groups: ['noaa-nws', 'usgs'],
        pattern: 'cross_domain_pattern',
        attribution: 'unresolved'
      }]
    },
    operator_pictures: [{
      schema: 'systemia.sentinel.operator-picture.v1',
      incident_id: 'sentinel-000001',
      region_key: 'Yakima County, WA',
      first_seen_at: '2026-10-02T06:08:00.000Z',
      last_seen_at: '2026-10-02T06:10:00.000Z',
      level: 'elevated',
      confidence: 0.78,
      attribution: 'unresolved',
      independent_source_families: 2,
      independent_source_groups: ['noaa-nws', 'usgs'],
      raw_source_families: 2,
      domains: ['weather', 'hydrology'],
      source_families: ['nws-active-alerts', 'usgs-water'],
      verified_observations: 1,
      confirmed_hazard: false
    }],
    signals: [],
    ...overrides
  };
}

test('Sentinel bridge preserves derived status and unresolved attribution', () => {
  const batch = sentinelSnapshotToRadarObservations(snapshot());
  assert.equal(batch.observations.length, 1);
  const observation = batch.observations[0];
  assert.equal(observation.evidence_state, 'modeled');
  assert.equal(observation.source_system, 'systemia-sentinel');
  assert.equal(observation.facts.attribution, 'unresolved');
  assert.equal(observation.facts.causal_state, 'unresolved');
  assert.deepEqual(observation.facts.independent_upstream_groups, ['noaa-nws', 'usgs']);
  assert.ok(observation.provenance_refs.includes('https://api.weather.gov/alerts/example'));
  assert.ok(observation.correlation_keys.includes('sentinel:cluster:regional-event-0001'));
});

test('watch-only Sentinel pictures stay below the default Radar bridge threshold', () => {
  const low = snapshot();
  low.operator_pictures[0].level = 'watch';
  low.event_graph.nodes[0].level = 'watch';
  const batch = sentinelSnapshotToRadarObservations(low);
  assert.equal(batch.observations.length, 0);
});

test('bridge treats missing local Sentinel state as not configured, not as normal conditions', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-sentinel-missing-'));
  try {
    const receipt = readSentinelRadarBridge({
      stateDir: root,
      now: '2026-10-02T06:11:00.000Z'
    });
    assert.equal(receipt.status, 'not_configured');
    assert.equal(receipt.observation_count, 0);
    assert.match(receipt.note, /not present/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('bridge fails visibly when the Sentinel snapshot is stale', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-sentinel-stale-'));
  try {
    fs.writeFileSync(path.join(root, 'latest.json'), JSON.stringify(snapshot(), null, 2));
    const receipt = readSentinelRadarBridge({
      stateDir: root,
      now: '2026-10-02T06:20:00.000Z',
      maxAgeSeconds: 180
    });
    assert.equal(receipt.status, 'failed');
    assert.equal(receipt.error, 'sentinel_snapshot_stale');
    assert.ok(receipt.age_seconds > 180);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('bridge reads a fresh Sentinel resident snapshot into Radar observations', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-sentinel-fresh-'));
  try {
    fs.writeFileSync(path.join(root, 'latest.json'), JSON.stringify(snapshot(), null, 2));
    const receipt = readSentinelRadarBridge({
      stateDir: root,
      now: '2026-10-02T06:11:00.000Z',
      maxAgeSeconds: 180
    });
    assert.equal(receipt.status, 'pass');
    assert.equal(receipt.observation_count, 1);
    assert.equal(receipt.coverage.healthy, true);
    assert.equal(receipt.batch.observations[0].facts.event_graph_patterns[0], 'cross_domain_pattern');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
