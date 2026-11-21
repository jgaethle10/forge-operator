import test from 'node:test';
import assert from 'node:assert/strict';
import { coaxialMutualInductance, relativePickupProxy } from './coupling-model.mjs';

const config = { transmitterRadiusMm: 25, receiverRadiusMm: 15,
  transmitterTurns: 2, receiverTurns: 3 };

function close(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(Math.abs(actual), Math.abs(expected), 1e-30), `${actual} != ${expected}`);
}

test('coaxial geometry is reciprocal when exchanging radii and turns', () => {
  const a = coaxialMutualInductance({...config, separationMm: 20});
  const b = coaxialMutualInductance({transmitterRadiusMm: config.receiverRadiusMm,
    receiverRadiusMm: config.transmitterRadiusMm, transmitterTurns: config.receiverTurns,
    receiverTurns: config.transmitterTurns, separationMm: 20});
  close(a.mutualInductanceHenries, b.mutualInductanceHenries);
});

test('more separation reduces ideal coupling', () => {
  const near = coaxialMutualInductance({...config, separationMm: 10}).mutualInductanceHenries;
  const far = coaxialMutualInductance({...config, separationMm: 50}).mutualInductanceHenries;
  assert.ok(near > far && far > 0);
});

test('turns multiply mutual inductance, not efficiency', () => {
  const one = coaxialMutualInductance({transmitterRadiusMm: 25, receiverRadiusMm: 15, separationMm: 30});
  const six = coaxialMutualInductance({...config, separationMm: 30});
  close(six.mutualInductanceHenries, 6 * one.mutualInductanceHenries);
  assert.match(six.assumptions, /NOT predicted device efficiency/);
});

test('far-field value agrees with leading magnetic-dipole asymptote', () => {
  const a = 0.01, b = 0.006, h = 0.2, mu0 = 4 * Math.PI * 1e-7;
  const expected = mu0 * Math.PI * a ** 2 * b ** 2 / (2 * h ** 3);
  const actual = coaxialMutualInductance({transmitterRadiusMm: a * 1000,
    receiverRadiusMm: b * 1000, separationMm: h * 1000}).mutualInductanceHenries;
  assert.ok(Math.abs(actual / expected - 1) < 0.02, `far-field discrepancy ${actual / expected}`);
});

test('M-squared weak-coupling proxy cannot be called device efficiency', () => {
  const v = relativePickupProxy(config, 20, 40);
  assert.equal(v.isEfficiencyPrediction, false);
  assert.ok(v.relativeWeakCouplingPowerProxy < 1 && v.relativeWeakCouplingPowerProxy > 0);
  const same = relativePickupProxy(config, 20, 20);
  close(same.relativeWeakCouplingPowerProxy, 1);
});

test('reject coincident filaments, invalid geometry, and unrealistic model range', () => {
  assert.throws(() => coaxialMutualInductance({transmitterRadiusMm: 20,
    receiverRadiusMm: 20, separationMm: 0}), /too close/);
  assert.throws(() => coaxialMutualInductance({transmitterRadiusMm: -1,
    receiverRadiusMm: 10, separationMm: 20}), RangeError);
  assert.throws(() => coaxialMutualInductance({transmitterRadiusMm: 10,
    receiverRadiusMm: 10, separationMm: 1000}), RangeError);
  assert.throws(() => coaxialMutualInductance({transmitterRadiusMm: 10,
    receiverRadiusMm: 5, separationMm: 20, receiverTurns: 1.5}), RangeError);
});
