import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRESETS, ACTIONS, newRun, eventForDay,
  previewAction, advanceDay, summarizeRun
} from '../public/remote-ops/engine.mjs';

test('presets are fictional, bounded, with distinct economics', () => {
  assert.deepEqual(Object.keys(PRESETS).sort(), ['cafe', 'gym', 'service']);
  assert.equal(ACTIONS.length, 6);
  assert.ok(PRESETS.gym.subtitle.includes('not membership billing'));
  assert.throws(() => newRun('unknown'), RangeError);
});

test('the same run and decisions produce the exact same replay', () => {
  const replay = () => {
    let s = newRun('service');
    for (const decision of ['promote', 'raise', 'quality', 'hire', 'hold']) {
      s = advanceDay(s, decision);
    }
    return s;
  };
  assert.deepEqual(replay(), replay());
});

test('preview is pure and matches the posted day receipt', () => {
  const before = newRun('gym');
  const frozen = structuredClone(before);
  const forecast = previewAction(before, 'promote');
  assert.deepEqual(before, frozen);
  assert.equal(forecast.profit, forecast.revenue - forecast.expenses);
  const after = advanceDay(before, 'promote');
  assert.deepEqual(after.history[0], forecast);
  assert.equal(after.cash, before.cash + forecast.profit);
  assert.equal(after.totalRevenue, forecast.revenue);
  assert.equal(after.totalExpenses, forecast.expenses);
});

test('pricing, hiring and quality have explainable different tradeoffs', () => {
  const base = newRun('service');
  const hold = previewAction(base, 'hold');
  const higher = previewAction(base, 'raise');
  const lower = previewAction(base, 'lower');
  const hire = previewAction(base, 'hire');
  const quality = previewAction(base, 'quality');
  assert.ok(higher.price > hold.price);
  assert.ok(higher.demand < hold.demand);
  assert.ok(lower.price < hold.price);
  assert.ok(lower.demand > hold.demand);
  assert.equal(hire.staff, base.staff + 1);
  assert.ok(hire.capacity > hold.capacity);
  assert.equal(hire.costs.actionCost, 300);
  assert.equal(quality.costs.actionCost, 450);
  assert.ok(quality.brand > base.brand);
});

test('stress test: cash exhaustion ends the run, with no further decisions', () => {
  const base = { ...newRun('cafe'), cash: 50 };
  const after = advanceDay(base, 'quality');
  assert.equal(after.finished, true);
  assert.equal(after.ending, 'cash_exhausted');
  assert.throws(() => previewAction(after, 'hold'), RangeError);
});

test('max staffing and invalid inputs are constrained', () => {
  assert.throws(() => previewAction(newRun('gym'), 'pay_me'), RangeError);
  const maxed = { ...newRun('gym'), staff: 6 };
  assert.throws(() => previewAction(maxed, 'hire'), RangeError);
  assert.equal(eventForDay(newRun('gym')).title, eventForDay(newRun('gym')).title);
});

test('30 days finish deterministically; receipts reconcile with summary', () => {
  let s = newRun('service');
  for (let index = 0; index < 30 && !s.finished; index += 1) {
    s = advanceDay(s, 'hold');
  }
  assert.equal(s.history.length, 30);
  assert.equal(s.finished, true);
  assert.equal(s.ending, 'completed_30_days');
  const summary = summarizeRun(s);
  const countedRevenue = Math.round(s.history.reduce((sum, r) => sum + r.revenue, 0) * 100) / 100;
  const countedExpenses = Math.round(s.history.reduce((sum, r) => sum + r.expenses, 0) * 100) / 100;
  assert.equal(summary.totalRevenue, countedRevenue);
  assert.equal(summary.totalExpenses, countedExpenses);
  assert.equal(summary.endingCash, summary.startingCash + summary.modeledProfit);
  assert.match(summary.disclaimer, /not market evidence/i);
  assert.throws(() => advanceDay(s, 'hold'), RangeError);
});

test('engine has no external business mutation or network dependencies', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../public/remote-ops/engine.mjs', import.meta.url), 'utf8');
  for (const forbidden of ['fetch(', 'XMLHttpRequest', 'localStorage', 'document.', 'navigator.', 'payment', 'stripe.com', 'base44.']) {
    assert.ok(!source.includes(forbidden), 'Engine must not contain ' + forbidden);
  }
});
