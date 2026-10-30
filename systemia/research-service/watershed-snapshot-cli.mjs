#!/usr/bin/env node
// Operator-only, non-publishing Yakima Watershed Intelligence snapshot entry point.
// --profile prints source configuration. --live fetches current public sensor observations.
import { readFileSync } from 'node:fs';
import { collectYakimaWatershed } from './watershed-intelligence.mjs';

const profile = JSON.parse(readFileSync(new URL('./watershed-yakima-profile.json', import.meta.url), 'utf8'));
const snowStationIds = profile.snow_stations.map(row => row.triplet);
const riverLocationIds = profile.river_location_ids;
const mode = process.argv.slice(2);
if (mode.length !== 1 || !['--profile','--live'].includes(mode[0])) {
  process.stderr.write('Usage: node systemia/research-service/watershed-snapshot-cli.mjs --profile|--live\n');
  process.exitCode = 2;
} else if (mode[0] === '--profile') {
  process.stdout.write(JSON.stringify({
    profile_id: profile.profile_id,
    live_collection: false,
    snow_stations: profile.snow_stations,
    river_location_ids: riverLocationIds,
    reservoir: profile.reservoir_source,
    publication_authorized: false
  }, null, 2) + '\n');
} else {
  try {
    const snapshot = await collectYakimaWatershed({
      asOf: new Date().toISOString(),
      snowStationIds,
      riverLocationIds,
      fetchImpl: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(20000) })
    });
    // Public sensor observations only. No raw GPS geometry, private data, or customer publication.
    process.stdout.write(JSON.stringify({
      profile_id: profile.profile_id,
      live_collection: true,
      ...snapshot
    }, null, 2) + '\n');
    if (snapshot.failures.length) process.exitCode = 1;
  } catch (error) {
    process.stderr.write('Watershed collection failed: ' + String(error?.message || error).slice(0, 180) + '\n');
    process.exitCode = 1;
  }
}
