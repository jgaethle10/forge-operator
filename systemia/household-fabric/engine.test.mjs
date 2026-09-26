import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTodayBrief, rankOpportunities } from './engine.mjs';

const now = new Date('2026-09-26T16:00:00-07:00');

test('rejects stale fuel and ranks by net household value', () => {
  const rows = rankOpportunities([
    {
      id: 'cheap-far',
      title: 'Cheap fuel far away',
      category: 'fuel',
      source_url: 'https://example.com/far',
      observed_at: '2026-09-26T15:30:00-07:00',
      evidence_state: 'observed',
      confidence: 1,
      gross_savings_cents: 800,
      distance_miles: 20,
    },
    {
      id: 'useful-close',
      title: 'Useful fuel nearby',
      category: 'fuel',
      source_url: 'https://example.com/close',
      observed_at: '2026-09-26T15:40:00-07:00',
      evidence_state: 'observed',
      confidence: 1,
      gross_savings_cents: 500,
      distance_miles: 2,
    },
    {
      id: 'stale',
      title: 'Old fuel price',
      category: 'fuel',
      source_url: 'https://example.com/stale',
      observed_at: '2026-09-26T06:00:00-07:00',
      evidence_state: 'observed',
      confidence: 1,
      gross_savings_cents: 1000,
      distance_miles: 1,
    },
  ], { now, mileage_cost_cents: 25 });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'useful-close');
  assert.equal(rows[0].value.net_value_cents, 450);
});

test('holiday mode can prioritize practical holiday pressure relief without changing net value', () => {
  const brief = buildTodayBrief([
    {
      id: 'winter-coat',
      title: 'Winter coat discount',
      category: 'retail',
      source_url: 'https://example.com/coat',
      observed_at: '2026-09-26T15:30:00-07:00',
      evidence_state: 'public',
      confidence: 1,
      gross_savings_cents: 1200,
      distance_miles: 1,
      holiday_tags: ['winter-clothing'],
    },
    {
      id: 'generic',
      title: 'Generic household discount',
      category: 'retail',
      source_url: 'https://example.com/generic',
      observed_at: '2026-09-26T15:30:00-07:00',
      evidence_state: 'public',
      confidence: 1,
      gross_savings_cents: 1400,
      distance_miles: 1,
    },
  ], { now, mode: 'holiday_pressure', geography: 'Yakima, WA', mileage_cost_cents: 25 });

  assert.equal(brief.opportunities[0].id, 'winter-coat');
  assert.equal(brief.opportunities[0].value.net_value_cents, 1175);
  assert.equal(brief.guardrails.sponsorship_affects_rank, false);
  assert.equal(brief.guardrails.poverty_score_used, false);
});

test('sponsored flag never adds ranking value', () => {
  const rows = rankOpportunities([
    {
      id: 'sponsored',
      title: 'Sponsored deal',
      category: 'grocery',
      source_url: 'https://example.com/a',
      observed_at: '2026-09-26T15:30:00-07:00',
      evidence_state: 'public',
      confidence: 1,
      gross_savings_cents: 500,
      distance_miles: 1,
      sponsored: true,
      sponsor_label: 'Paid placement',
    },
    {
      id: 'organic',
      title: 'Better organic deal',
      category: 'grocery',
      source_url: 'https://example.com/b',
      observed_at: '2026-09-26T15:30:00-07:00',
      evidence_state: 'public',
      confidence: 1,
      gross_savings_cents: 600,
      distance_miles: 1,
    },
  ], { now, mileage_cost_cents: 25 });

  assert.equal(rows[0].id, 'organic');
});
