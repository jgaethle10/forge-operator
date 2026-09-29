import assert from 'node:assert/strict';
import {
  loadSentinelRegionProfileRegistry,
  listSentinelRegionProfiles,
  getSentinelRegionProfile,
  resolveSentinelRegionConfig
} from './region-profile.mjs';

const registry = loadSentinelRegionProfileRegistry();
assert.equal(registry.schema, 'systemia.sentinel.region-profile-registry.v1');
assert.ok(registry.profiles.length >= 1);

const listed = listSentinelRegionProfiles();
assert.ok(listed.some((row) => row.profile_id === 'yakima-basin-wa'));

const yakima = getSentinelRegionProfile('yakima-basin-wa');
assert.equal(yakima.sources.nws_area, 'WA');
assert.deepEqual(yakima.sources.nwps_gauges, []);
assert.deepEqual(yakima.sources.usgs_water_locations, [
  'USGS-12484500',
  'USGS-12498700',
  'USGS-12500450',
  'USGS-12510500'
]);
assert.equal(yakima.provenance.length, 4);
assert.equal(yakima.verified_at, '2026-09-29');

const resolved = resolveSentinelRegionConfig({
  profileId: 'yakima-basin-wa',
  usgsWaterLocationIds: ['USGS-12500450', 'USGS-99999999']
});
assert.equal(resolved.profile.profile_id, 'yakima-basin-wa');
assert.equal(resolved.nws_area, 'WA');
assert.equal(resolved.usgs_water_locations.filter((id) => id === 'USGS-12500450').length, 1);
assert.ok(resolved.usgs_water_locations.includes('USGS-99999999'));

const overridden = resolveSentinelRegionConfig({
  profileId: 'yakima-basin-wa',
  nwsArea: 'OR'
});
assert.equal(overridden.nws_area, 'OR');

await assert.rejects(
  async () => getSentinelRegionProfile('not-a-real-profile'),
  /Unknown Sentinel region profile/
);

console.log('SYSTEMIA SENTINEL REGION PROFILE PASS');
