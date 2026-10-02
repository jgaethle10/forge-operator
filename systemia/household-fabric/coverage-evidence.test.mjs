import assert from 'node:assert/strict';
import test from 'node:test';
import { auditCoverage, emptyLedger } from './ingest.mjs';
import sourceRegistry from './source-registry.json' with { type: 'json' };

test('coverage can be healthy from fresh evidence even when no recommendation exists', () => {
  const now = new Date('2026-09-29T18:00:00Z');
  const coverage = auditCoverage(emptyLedger(), sourceRegistry, {
    now,
    geography: 'yakima-wa',
    coverage_items: [
      {
        id: 'fuel-observation-a',
        category: 'fuel',
        observed_at: '2026-09-29T17:30:00Z',
        source_name: 'Station A',
      },
      {
        id: 'fuel-observation-b',
        category: 'fuel',
        observed_at: '2026-09-29T17:35:00Z',
        source_name: 'Station B',
      },
    ],
  });

  assert.equal(coverage.categories.fuel.healthy, true);
  assert.equal(coverage.categories.fuel.fresh_observations, 2);
  assert.equal(coverage.categories.fuel.distinct_sources, 2);
  assert.equal(coverage.categories.grocery.healthy, false);
});
