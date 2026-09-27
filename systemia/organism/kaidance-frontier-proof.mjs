#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildFrontierReport } from './frontier-watch.mjs';
import { runScienceHazardWatch, SOURCES } from './science-hazard-watch.mjs';

const frontier = buildFrontierReport({ rootDir: process.cwd(), now: new Date('2026-09-27T14:45:00Z') });
assert.ok(frontier.report.asset_count >= 20);
assert.equal(frontier.report.silent_drop_count, 0);
for (const key of ['medical-research', 'earthquake-intelligence', 'volcano-intelligence', 'evermaps']) {
  assert.ok(frontier.report.obligations.some((x) => x.asset_key === key), `missing ${key}`);
}
assert.equal(frontier.snapshot.counts.admitted, frontier.report.obligation_count);

const mockFetch = async (url) => {
  const href = String(url);
  if (href === SOURCES.earthquakes) {
    return {
      ok: true,
      json: async () => ({ features: [
        { id: 'q1', properties: { mag: 4.7, place: 'Proof Ridge', time: 10, url: 'https://example.invalid/q1' } }
      ] })
    };
  }
  if (href === SOURCES.volcanoes) {
    return {
      ok: true,
      json: async () => ([{ volcanoName: 'Proof Volcano', colorCode: 'YELLOW', alertLevel: 'ADVISORY' }])
    };
  }
  if (href.startsWith(SOURCES.pubmedSearch)) {
    return {
      ok: true,
      json: async () => ({ esearchresult: { count: '2', idlist: ['100', '101'] } })
    };
  }
  if (href.startsWith(SOURCES.pubmedSummary)) {
    return {
      ok: true,
      json: async () => ({ result: {
        uids: ['100', '101'],
        '100': { title: 'Proof paper A', source: 'Journal A', pubdate: '2026', authors: [{ name: 'A' }] },
        '101': { title: 'Proof paper B', source: 'Journal B', pubdate: '2026', authors: [{ name: 'B' }] }
      } })
    };
  }
  throw new Error(`unexpected_url:${href}`);
};

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaidance-frontier-proof-'));
const watched = await runScienceHazardWatch({
  fetcher: mockFetch,
  now: new Date('2026-09-27T14:45:00Z'),
  outDir
});
assert.equal(watched.report.lanes.earthquakes.count, 1);
assert.equal(watched.report.lanes.earthquakes.significant_count, 1);
assert.equal(watched.report.lanes.volcanoes.elevated_count, 1);
assert.equal(watched.report.lanes.medical_research.total_recent_matches, 2);
assert.equal(watched.report.lanes.medical_research.documents.length, 2);
assert.equal(watched.snapshot.counts.held, 0);

console.log(JSON.stringify({
  schema: 'evercraft.kaidance.frontier-proof.v1',
  status: 'pass',
  assets: frontier.report.asset_count,
  strategic_lanes: frontier.report.strategic_lane_count,
  watched_sources: watched.snapshot.counts.scanned
}));
