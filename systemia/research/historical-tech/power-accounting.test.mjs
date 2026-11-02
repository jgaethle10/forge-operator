import test from 'node:test';
import assert from 'node:assert/strict';
import { assessPowerBudget } from './power-accounting.mjs';

test('hypothetical example: 10 W total input, 4 W loaded output for 60 seconds', () => {
  const v = assessPowerBudget({ inputWatts: 10, outputWatts: 4, durationSeconds: 60 });
  assert.equal(v.inputEnergyJoules, 600);
  assert.equal(v.deliveredEnergyJoules, 240);
  assert.equal(v.fractionDelivered, 0.4);
  assert.equal(v.classification, 'no_reported_energy_gain');
});

test('apparent >100% reading requires independent investigation, not a discovery claim', () => {
  const v = assessPowerBudget({ inputWatts: 8, outputWatts: 9, durationSeconds: 5 });
  assert.equal(v.classification, 'anomalous_reading_requires_independent_verification');
});

test('ambiguous uncertainties are not called a demonstrated anomaly', () => {
  const v = assessPowerBudget({ inputWatts: 8, outputWatts: 9, durationSeconds: 5,
    inputUncertaintyWatts: 1, outputUncertaintyWatts: 1 });
  assert.equal(v.classification, 'measurement_uncertainty_or_missing_input_must_be_checked');
});

test('rejects invalid and undefined power sources', () => {
  assert.throws(() => assessPowerBudget({ inputWatts: 0, outputWatts: 2, durationSeconds: 10 }), RangeError);
  assert.throws(() => assessPowerBudget({ inputWatts: 2, outputWatts: -1, durationSeconds: 10 }), RangeError);
  assert.throws(() => assessPowerBudget({ inputWatts: 2, outputWatts: 1, durationSeconds: 10,
    inputUncertaintyWatts: 2 }), RangeError);
});
