import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectFaieOfficialSources,
  faieCollectorConfigFromEnv,
  sentinelObservationToFaie
} from './collectors.mjs';

function sentinelRow(overrides = {}) {
  return {
    observation_id: 'nws-active-alerts:test-alert',
    created_at: '2026-09-30T20:00:00.000Z',
    region_key: 'Yakima County, Washington',
    region_group: 'coarse-grid:1deg:46:-121',
    source_family: 'nws-api',
    independence_group: 'noaa-nws',
    domain: 'emergency_report',
    kind: 'nws_alert:excessive_heat_warning',
    anomaly_score: 0.9,
    reliability: 0.97,
    evidence_state: 'verified',
    hazard_state: 'confirmed_hazard',
    provenance_ref: 'https://api.weather.gov/alerts/test',
    summary: 'Excessive Heat Warning for Yakima County',
    adapter_receipt: { adapter_id: 'nws-active-alerts' },
    ...overrides
  };
}

test('FAIE maps bounded Sentinel observations without upgrading evidence', () => {
  const row = sentinelObservationToFaie(sentinelRow());
  assert.equal(row.evidence_state, 'verified');
  assert.equal(row.source_system, 'systemia_sentinel_official');
  assert.ok(row.domains.includes('agriculture'));
  assert.ok(row.domains.includes('weather'));
  assert.deepEqual(row.provenance_refs, ['https://api.weather.gov/alerts/test']);
  assert.equal(row.facts.independence_group, 'noaa-nws');
});

test('FAIE collector config defaults to NWS but requires explicit water gauge lists', () => {
  const config = faieCollectorConfigFromEnv({});
  assert.equal(config.enabled, true);
  assert.equal(config.nws_enabled, true);
  assert.equal(config.nws_area, null);
  assert.deepEqual(config.usgs_water_sites, []);
  assert.deepEqual(config.nwps_gauges, []);
});

test('FAIE official collector run reuses owned pollers and preserves receipts', async () => {
  const result = await collectFaieOfficialSources({
    checkedAt: '2026-09-30T20:05:00.000Z',
    config: {
      enabled: true,
      nws_enabled: true,
      nws_area: 'WA',
      usgs_water_sites: ['USGS-12484500'],
      usgs_water_parameters: ['00060'],
      nwps_gauges: ['YAKW1']
    },
    fetchImpl: async () => {
      throw new Error('network should not be used by fake pollers');
    },
    pollers: {
      nws: async (options) => {
        assert.equal(options.area, 'WA');
        return {
          receipt: { source_id: 'nws-active-alerts', status: 'ok', item_count: 1 },
          observations: [sentinelRow()]
        };
      },
      usgsWater: async (options) => {
        assert.deepEqual(options.monitoringLocationIds, ['USGS-12484500']);
        return {
          receipt: { source_id: 'usgs-water-latest-continuous', status: 'ok', item_count: 1 },
          observations: [sentinelRow({
            observation_id: 'usgs-water-latest:fixture',
            domain: 'hydrology',
            kind: 'stream_discharge',
            evidence_state: 'observed',
            source_family: 'usgs-water-data-api',
            independence_group: 'usgs',
            provenance_ref: 'https://api.waterdata.usgs.gov/example',
            summary: 'Yakima River stream discharge 2200 ft3/s',
            hazard_state: 'unknown',
            metric_value: 2200
          })]
        };
      },
      nwps: async (options) => {
        assert.deepEqual(options.gaugeIds, ['YAKW1']);
        return {
          receipt: { source_id: 'nwps-river-gauges', status: 'ok', item_count: 1 },
          observations: [sentinelRow({
            observation_id: 'nwps-river-gauge:fixture',
            domain: 'hydrology',
            kind: 'river_forecast',
            evidence_state: 'modeled',
            source_family: 'nwps-api',
            independence_group: 'noaa-nws',
            provenance_ref: 'https://api.water.noaa.gov/nwps/v1/gauges/YAKW1',
            summary: 'Yakima River forecast moderate',
            hazard_state: 'unknown'
          })]
        };
      }
    }
  });

  assert.equal(result.observations.length, 3);
  assert.equal(result.receipts.length, 3);
  assert.equal(result.observations.find((row) => row.kind === 'river_forecast').evidence_state, 'modeled');
  assert.ok(result.observations.find((row) => row.kind === 'stream_discharge').domains.includes('water'));
});

test('FAIE official collectors can be disabled without pretending source health', async () => {
  const result = await collectFaieOfficialSources({
    checkedAt: '2026-09-30T20:10:00.000Z',
    config: { enabled: false }
  });
  assert.equal(result.observations.length, 0);
  assert.equal(result.receipts[0].status, 'disabled');
  assert.equal(result.receipts[0].reason, 'collectors_disabled');
});
