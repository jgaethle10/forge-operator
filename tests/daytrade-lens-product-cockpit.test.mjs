import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PRACTICE_LIMITS, assessScenario, localDay, normalizeStoredEntries,
  practiceGate, journalSummary, exportJournal,
} from '../public/daytrade-lens/model.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const example = {
  id: 'plan_example_20261115', day: '2026-11-15', createdAt: '2026-11-15T15:00:00Z',
  symbol: 'AAPL', setup: 'Trend continuation',
  thesis: 'Illustrative hypothetical scenario, not market data',
  lesson: '', notional: 10, entry: 100, stop: 99.5, target: 101.5,
  status: 'planned', result: null, pnl: 0,
};

test('virtual $10 practice example estimates stress and meets 1.5:1 threshold', () => {
  const x = assessScenario({ notional: 10, entry: 100, stop: 99.5, target: 101.5 });
  assert.equal(x.eligible, true);
  assert.equal(x.risk, 0.065);
  assert.equal(x.reward, 0.135);
  assert.equal(x.rewardRisk, 2.077);
  assert.equal(x.estimatedQuantity, 0.1);
});
test('risk check is conservative and rejects oversize or adverse shape', () => {
  assert.equal(PRACTICE_LIMITS.virtual_notional_usd, 20);
  for (const x of [
    { notional: 21, entry: 100, stop: 99.5, target: 101.5 },
    { notional: 10, entry: 100, stop: 90, target: 101.5 },
    { notional: 10, entry: 100, stop: 99.5, target: 100.1 },
    { notional: 10, entry: 100, stop: 101, target: 102 },
    { notional: 10, entry: 100, stop: 99, target: 98 },
    { notional: 10, entry: 'bad', stop: 99, target: 102 },
    { notional: '', entry: 100, stop: 99, target: 102 },
  ]) assert.equal(assessScenario(x).eligible, false);
});
test('locally saved plans are canonicalized and unsupported data is ignored', () => {
  const bad = { ...example, id: '<script>alert(1)</script>' };
  const records = normalizeStoredEntries([{ ...example, thesis: '<img src=x onerror=alert(1)>' }, bad, null, {}]);
  assert.equal(records.length, 1);
  assert.equal(records[0].symbol, 'AAPL');
  assert.equal(records[0].status, 'planned');
});
test('only one unreviewed plan at a time, maximum two practice ideas daily', () => {
  assert.equal(practiceGate([], '2026-11-15').allowed, true);
  assert.equal(practiceGate([example], '2026-11-15').allowed, false);
  const reviewed = { ...example, status: 'reviewed', result: 'skipped', pnl: 0 };
  assert.equal(practiceGate([reviewed], '2026-11-15').allowed, true);
  const two = [{ ...reviewed }, { ...reviewed, id: 'plan_example_20261115_b' }];
  assert.equal(practiceGate(two, '2026-11-15').allowed, false);
  assert.equal(practiceGate([example], '2026-11-16').allowed, true);
});
test('self-reported loss stop holds additional local practice', () => {
  const loss = { ...example, status: 'reviewed', result: 'simulated', pnl: -0.2 };
  assert.equal(practiceGate([loss], '2026-11-15').allowed, false);
  assert.equal(practiceGate([{ ...loss, pnl: -0.1 }], '2026-11-15').allowed, true);
});
test('journal never treats self-reported outcomes as broker fills', () => {
  const reviewed = { ...example, status: 'reviewed', result: 'simulated', pnl: 0.12 };
  const summary = journalSummary([reviewed]);
  assert.equal(summary.totalPlans, 1);
  assert.equal(summary.simulatedOutcomes, 1);
  assert.equal(summary.selfReportedNet, 0.12);
  const exported = exportJournal([reviewed]);
  assert.equal(exported.mode, 'LOCAL_SELF_REPORTED_NO_BROKER');
  assert.equal(exported.broker_verified_fills, 0);
  assert.equal(exported.real_money_execution, false);
  assert.equal(exported.entries.length, 1);
});
test('invalid review records do not unlock the next practice attempt', () => {
  const malformedReview = { ...example, status: 'reviewed', result: 'filled' };
  assert.equal(normalizeStoredEntries([malformedReview]).length, 0);
});
test('local calendar date is deterministic for the supplied date', () => {
  const date = new Date(2026, 10, 15, 11, 30);
  assert.equal(localDay(date), '2026-11-15');
});
test('public source is self-contained and has no live trading, payment or market-fetch paths', () => {
  const html = read('public/daytrade-lens/index.html');
  const js = read('public/daytrade-lens/app.mjs');
  const model = read('public/daytrade-lens/model.mjs');
  const css = read('public/daytrade-lens/style.css');
  for (const item of ['id="plan-form"', 'id="journal-list"', 'id="view-team"', 'id="view-evidence"', 'LOCAL PRACTICE']) {
    assert.ok(html.includes(item), item);
  }
  assert.ok(css.includes('@media(max-width:620px)'));
  assert.ok(js.includes('textContent'));
  assert.ok(js.includes('localStorage'));
  assert.ok(js.includes('exportJournal'));
  for (const source of [js, model]) {
    assert.doesNotMatch(source, /api\.alpaca\.markets|paper-api\.alpaca\.markets|\/v2\/orders/);
    assert.doesNotMatch(source, /\b(fetch|XMLHttpRequest|WebSocket)\s*\(/);
    assert.doesNotMatch(source, /innerHTML\s*=/);
  }
  assert.ok(html.includes('No market feed, broker connection, executed orders or AI agents'));
  assert.ok(html.includes('No paid access is sold by this preview'));
});
