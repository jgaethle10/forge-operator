import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyLedger, ingestBatch } from './ingest.mjs';
import { buildHouseholdToday } from './surface.mjs';
import sourceRegistry from './source-registry.json' with { type: 'json' };
import yakimaSources from './yakima-sources.json' with { type: 'json' };

const now = new Date('2026-09-27T16:00:00-07:00');

test('verified source manifest never implies collector execution', () => {
  assert.ok(yakimaSources.sources.length >= 5);
  for (const source of yakimaSources.sources) {
    assert.equal(source.source_state, 'verified_public_source');
    assert.notEqual(source.collector_state, 'live');
  }
});

test('Today surface exposes degraded coverage rather than inventing missing local data', () => {
  const { ledger } = ingestBatch(emptyLedger(), [
    {
      id: 'event-1',
      title: 'Free family event',
      category: 'event',
      source_url: 'https://www.yvl.org/events/',
      source_name: 'Yakima Valley Libraries Events',
      observed_at: '2026-09-27T15:00:00-07:00',
      evidence_state: 'public',
      confidence: 1,
      eligibility: 'verified',
      holiday_tags: ['free-family-event'],
    },
  ], { now });

  const surface = buildHouseholdToday(ledger, sourceRegistry, { now, geography: 'yakima-wa', mode: 'holiday_pressure' });
  assert.equal(surface.status, 'degraded');
  assert.ok(surface.coverage.degraded_categories.includes('fuel'));
  assert.equal(surface.opportunities.length, 1);
  assert.match(surface.message, /not filled with guesses/i);
});
