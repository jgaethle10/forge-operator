import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyLedger, ingestBatch } from './ingest.mjs';
import sourceRegistry from './source-registry.json' with { type: 'json' };
import { buildEconomicPressureHouseholdView, normalizeEconomicPressureSignal } from './economic-pressure-bridge.mjs';

const now = new Date('2026-10-14T23:30:00Z');
const septemberCpi = {
  metric: 'us-cpi-all-items-yoy', geography: 'us', value: 3.7, unit: 'percent',
  observed_period: '2026-09', release_at: '2026-10-14T12:30:00Z',
  evidence_state: 'public',
  source_url: 'https://www.bls.gov/news.release/archives/cpi_10142026.htm',
};
const yakimaUnemployment = {
  metric: 'yakima-unemployment-rate', geography: 'yakima-wa', value: 5.5,
  unit: 'percent', observed_period: '2026-08',
  evidence_state: 'public',
  source_url: 'https://esd.wa.gov/jobs-and-training/labor-market-information/reports-and-research/labor-market-county-profiles/yakima-county-profile',
};

test('dated national CPI and local Yakima labor evidence stay distinct', () => {
  const view = buildEconomicPressureHouseholdView({
    signals: [septemberCpi, yakimaUnemployment],
    ledger: emptyLedger(), sourceRegistry, now,
  });
  assert.equal(view.measured_economic_context.length, 2);
  assert.equal(view.measured_economic_context[0].geography, 'us');
  assert.equal(view.measured_economic_context[1].geography, 'yakima-wa');
  assert.equal(view.measured_economic_context[0].monetary_impact_cents, null);
  assert.equal(view.measured_economic_context[0].measurement_state, 'reviewed_official_snapshot_not_live');
  assert.equal(view.measured_economic_context[1].source_date_precision, 'month_only_updated_september_2026');
  assert.equal(view.measured_economic_context[1].release_at, null);
  assert.equal(view.household_opportunities.status, 'degraded');
  assert.deepEqual(view.household_opportunities.opportunities, []);
  assert.equal(view.boundaries.no_live_collector_implied, true);
});

test('no invented Yakima CPI, modeled observation or nonofficial source accepted', () => {
  assert.throws(() => normalizeEconomicPressureSignal({ ...septemberCpi, geography: 'yakima-wa' }, now), /geography mismatch/);
  assert.throws(() => normalizeEconomicPressureSignal({ ...septemberCpi, evidence_state: 'modeled' }, now), /only measured/);
  assert.throws(() => normalizeEconomicPressureSignal({ ...septemberCpi, source_url: 'https://bls.gov.evil.example/something' }, now), /allowed official/);
  assert.throws(() => normalizeEconomicPressureSignal({ ...septemberCpi, value: Number.POSITIVE_INFINITY }, now), /finite/);
  assert.throws(() => normalizeEconomicPressureSignal({ ...septemberCpi, value: 9.5 }, now), /does not match reviewed/);
  assert.throws(() => normalizeEconomicPressureSignal({ ...septemberCpi, observed_period: '2026-08' }, now), /not been independently reviewed/);
  assert.throws(() => normalizeEconomicPressureSignal({ ...septemberCpi, source_url: 'https://www.bls.gov/about.htm' }, now), /does not match reviewed/);
  assert.throws(() => normalizeEconomicPressureSignal({ ...yakimaUnemployment, release_at: '2026-09-30T20:00:00Z' }, now), /not verified for this local source/);
});

test('no unreleased or conflicting measurement promoted as fact', () => {
  assert.throws(() => normalizeEconomicPressureSignal(septemberCpi, new Date('2026-10-13T20:00:00Z')), /not published yet/);
  assert.throws(() => normalizeEconomicPressureSignal({ ...septemberCpi, release_at: '2026-10-15T12:30:00Z' }, now), /official release timestamp mismatch/);
  assert.throws(() => buildEconomicPressureHouseholdView({
    signals: [septemberCpi, { ...septemberCpi }],
    ledger: emptyLedger(), sourceRegistry, now,
  }), /duplicate metric and period/);
});

test('national inflation does not modify locally ranked opportunities or imply savings', () => {
  const fresh = {
    id: 'community-event', title: 'Free public community event', category: 'event',
    observed_at: '2026-10-14T22:30:00Z', source_url: 'https://www.yvl.org/events/',
    evidence_state: 'public', eligibility: 'unknown', gross_savings_cents: 0,
  };
  const { ledger } = ingestBatch(emptyLedger(), [fresh], { now });
  const base = { ledger, sourceRegistry, now };
  const first = buildEconomicPressureHouseholdView({ ...base, signals: [septemberCpi] });
  const second = buildEconomicPressureHouseholdView({ ...base, signals: [{ ...septemberCpi, metric: 'us-cpi-gasoline-mom', value: 9.1 }] });
  assert.deepEqual(first.household_opportunities, second.household_opportunities);
  assert.equal(first.household_opportunities.opportunities[0].requires_eligibility_check, true);
  assert.equal(first.boundaries.economic_signals_do_not_buy_organic_rank, true);
});

test('read-only Yakima proof emits five reviewed signals without invented household value', async () => {
  const { buildReviewProof } = await import('./economic-pressure-proof.mjs');
  const output = buildReviewProof(new Date('2026-10-22T01:00:00Z'));
  assert.equal(output.measured_economic_context.length, 7);
  assert.equal(output.household_opportunities.status, 'degraded');
  assert.equal(output.household_opportunities.opportunities.length, 3);
  for (const referral of output.household_opportunities.opportunities) {
    assert.equal(referral.category, 'benefit');
    assert.equal(referral.net_value_cents, 0);
    assert.equal(referral.requires_eligibility_check, true);
    assert.equal(referral.evidence_label, 'public');
    assert.ok(referral.source_url.startsWith('https://'));
  }
  assert.equal(output.household_opportunities.headline.money_kept_cents, 0);
  assert.equal(output.household_opportunities.headline.money_earned_cents, 0);
  assert.equal(output.boundaries.no_live_collector_implied, true);
  const state = output.measured_economic_context.filter(item => item.geography === 'wa-state');
  assert.equal(state.length, 2);
  assert.equal(state.find(item => item.metric === 'wa-unemployment-rate').value, 4.8);
  assert.equal(state.find(item => item.metric === 'wa-nonfarm-payroll-change').value, -15400);
});

test('reviewed assistance expires and cannot be presented as a current opportunity', async () => {
  const { buildReviewProof } = await import('./economic-pressure-proof.mjs');
  const old = buildReviewProof(new Date('2026-10-21T23:00:00Z'));
  assert.equal(old.household_opportunities.opportunities.length, 0, 'future-dated seed cannot appear');
  const expired = buildReviewProof(new Date('2026-10-29T00:00:01Z'));
  assert.equal(expired.household_opportunities.opportunities.length, 0, 'expired review seed must disappear');
  assert.equal(expired.household_opportunities.status, 'degraded');
  assert.equal(expired.household_opportunities.headline.money_kept_cents, 0);
});
