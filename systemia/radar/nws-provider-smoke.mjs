// Read-only live-provider acceptance probe. Does not create a public release.
import { collectNwsStormAlerts } from './nws-storm-desk.mjs';
import { collectNwsLocalStormReports } from './nws-local-storm-reports.mjs';

const now = new Date().toISOString();
const receipts = [];
async function check(source, operation) {
  try {
    const result = await operation();
    const row = {
      source,
      state: 'pass',
      checked_at: now,
      observation_count: result.observations.length,
      source_url: result.source_url,
      publication_authority: false
    };
    receipts.push(row);
    return row;
  } catch (error) {
    receipts.push({
      source,
      state: 'failed',
      checked_at: now,
      error: String(error?.message || error).slice(0,240),
      publication_authority: false
    });
    process.exitCode = 1;
    return null;
  }
}

await check('nws-active-national', () => collectNwsStormAlerts({ now, max_items: 25 }));
await check('nws-lsr-EAX', () => collectNwsLocalStormReports({ now, offices: 'EAX' }));
console.log(JSON.stringify({
  schema: 'evercraft.radar.nws-provider-smoke.v1',
  scope: 'read_only_provider_contract',
  ran_at: now,
  receipts,
  live_national_coverage_proven: false,
  systemia_ingest_proven: false,
  public_release_performed: false
}, null, 2));
