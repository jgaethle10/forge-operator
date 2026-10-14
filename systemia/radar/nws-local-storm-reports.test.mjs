import assert from 'node:assert/strict';
import test from 'node:test';
import { parseStormReportOffices, parseNwsLocalStormReport, collectNwsLocalStormReports } from './nws-local-storm-reports.mjs';
import { createOfficialCollectors } from './collectors.mjs';
import { emptyRadarState, ingestRadarObservation } from './core.mjs';

const now = '2026-10-14T18:00:00Z';
const report = (extras = {}) => ({
  id: 'c6e0b19b-805f-4252-ae72-8b866597122e',
  issuanceTime: '2026-10-14T06:00:00Z',
  productText: 'PRELIMINARY LOCAL STORM REPORT\nNational Weather Service Kansas City/Pleasant Hill\nReports of thunderstorm wind damage have been received and are preliminary.',
  ...extras
});

test('forecast offices are validated, deduped, and capped to four', () => {
  assert.deepEqual(parseStormReportOffices('EAX,BOX,eax,!!!,MOB,SEW,PQR'), ['EAX','BOX','MOB','SEW']);
});

test('preliminary product is attributed to office and always marked reported', () => {
  const row = parseNwsLocalStormReport(report(), { office: 'EAX', now });
  assert.equal(row.evidence_state, 'reported');
  assert.equal(row.facts.preliminary, true);
  assert.equal(row.facts.impact_confirmed, false);
  assert.equal(row.facts.forecast, false);
  assert.equal(row.facts.durable_record, true);
  assert.equal(row.observed_at, report().issuanceTime.replace('Z', '.000Z'));
  assert.match(row.provenance_refs[0], /^https:\/\/api\.weather\.gov\/products\/c6e0/);
  assert.ok(!row.summary.includes('confirmed'));
});

test('local storm reports are held when malformed, stale, future, or from invalid offices', () => {
  assert.equal(parseNwsLocalStormReport(report({ productText: '  ' }), { office: 'EAX', now }), null);
  assert.equal(parseNwsLocalStormReport(report(), { office: '../EAX', now }), null);
  assert.equal(parseNwsLocalStormReport(report({ issuanceTime: '2026-10-11T12:00:00Z' }), { office: 'EAX', now }), null);
  assert.equal(parseNwsLocalStormReport(report({ issuanceTime: '2026-10-15T00:00:00Z' }), { office: 'EAX', now }), null);
});

test('fetches selected office LSR and retains preliminary as editorial evidence', async () => {
  const calls = [];
  const result = await collectNwsLocalStormReports({
    now, offices: ['EAX'],
    fetchImpl: async (url) => {
      calls.push(String(url));
      return { ok: true, status: 200, json: async () => report() };
    }
  });
  assert.deepEqual(calls, ['https://api.weather.gov/products/types/LSR/locations/EAX/latest']);
  assert.equal(result.observations.length, 1);
  const ingested = ingestRadarObservation(emptyRadarState(), result.observations[0], { now });
  assert.equal(ingested.decision.signal.truth_state, 'REPORTED');
  assert.equal(ingested.decision.publication_authority, false);
});

test('partial office outages fail loudly rather than silently claiming national coverage', async () => {
  await assert.rejects(
    () => collectNwsLocalStormReports({
      now, offices: 'EAX,BOX',
      fetchImpl: async (url) => ({
        ok: !String(url).includes('/BOX/'), status: 503,
        json: async () => report()
      })
    }),
    /BOX: HTTP 503/
  );
});

test('reports source stays opt-in, with bounded offices and no invented publication authority', () => {
  assert.deepEqual(createOfficialCollectors({ stormAlertsEnabled:false, stormReportOffices:'' }).map((x)=>x.id), ['usgs-earthquakes','noaa-space-weather']);
  assert.deepEqual(createOfficialCollectors({ stormAlertsEnabled:true, stormReportOffices:'EAX,BOX' }).map((x)=>x.id), ['usgs-earthquakes','noaa-space-weather','nws-storm-desk','nws-local-storm-reports']);
});
