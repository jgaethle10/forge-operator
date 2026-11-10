import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from './model.mjs';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} !== ${expected}`);

test('illustrative 600W 12h system, marginal NEW compute', () => {
  const r = evaluate();
  near(r.itElectricityKWhPerDay, 7.2);
  near(r.capturedHeatKWhPerDay, 5.4);
  near(r.usefulHeatKWhPerDay, 4.32);
  near(r.heatingValueUSDPerDay, 0.5184);
  near(r.addedElectricityCostUSDPerDay, 0.8856);
  near(r.netUSDPerDay, -0.3672);
});
test('preexisting computing treats electricity as sunk baseline, not new expense', () => {
  const r = evaluate({ incrementalComputeFraction: 0 });
  near(r.addedElectricityKWhPerDay, 0.18);
  near(r.netUSDPerDay, 0.4968);
});
test('heat-pump baseline reduces value of recovered low-grade heat', () => {
  const r = evaluate({ baselineHeatingCOP: 3 });
  near(r.avoidedHeatingElectricityKWhPerDay, 1.44);
  near(r.netUSDPerDay, -0.7128);
});
test('no compatible demand means no heat credit', () => {
  const r = evaluate({ heatDemandKWhPerDay: 0 });
  near(r.usefulHeatKWhPerDay, 0);
  near(r.heatingValueUSDPerDay, 0);
});
test('heat demand caps claim even if capture exceeds demand', () => {
  const r = evaluate({ heatDemandKWhPerDay: 1 });
  near(r.usefulHeatKWhPerDay, 1);
  assert.ok(r.usefulHeatKWhPerDay <= r.itElectricityKWhPerDay);
});
test('capex and yearly operating cost are counted', () => {
  const base = evaluate();
  const withCosts = evaluate({ capexUSD: 365, projectLifeYears: 1, annualOpexUSD: 365 });
  near(withCosts.netUSDPerDay, base.netUSDPerDay - 2);
});
test('invalid efficiency, hours, COP and negatives fail closed', () => {
  for (const input of [
    { captureEfficiency: 1.2 },
    { deliveryEfficiency: -0.1 },
    { utilization: Number.NaN },
    { hoursPerDay: 25 },
    { baselineHeatingCOP: 0.8 },
    { heatDemandKWhPerDay: -1 },
    { incrementalComputeFraction: 2 },
  ]) assert.throws(() => evaluate(input), RangeError);
});
