// HIST-TECH-001. Power bookkeeping only; no claim of new energy or a live measurement.
function required(value, name, allowZero = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new RangeError(name + ' must be a finite ' + (allowZero ? 'nonnegative' : 'positive') + ' number');
  }
}

/** A steady-state energy estimate in joules using measured *total* input and loaded output.
 * Uncertainty is an absolute watt bound for each measurement, NOT a statistical confidence interval.
 */
export function assessPowerBudget({ inputWatts, outputWatts, durationSeconds,
  inputUncertaintyWatts = 0, outputUncertaintyWatts = 0 }) {
  required(inputWatts, 'inputWatts');
  required(outputWatts, 'outputWatts', true);
  required(durationSeconds, 'durationSeconds');
  required(inputUncertaintyWatts, 'inputUncertaintyWatts', true);
  required(outputUncertaintyWatts, 'outputUncertaintyWatts', true);
  const inputLowerWatts = inputWatts - inputUncertaintyWatts;
  if (inputLowerWatts <= 0) throw new RangeError('Input uncertainty leaves no positive lower bound');
  const lowRatio = Math.max(0, outputWatts - outputUncertaintyWatts) / (inputWatts + inputUncertaintyWatts);
  const highRatio = (outputWatts + outputUncertaintyWatts) / inputLowerWatts;
  const ratio = outputWatts / inputWatts;
  return {
    inputEnergyJoules: inputWatts * durationSeconds,
    deliveredEnergyJoules: outputWatts * durationSeconds,
    fractionDelivered: ratio,
    fractionDeliveredRange: [lowRatio, highRatio],
    classification: lowRatio > 1 ? 'anomalous_reading_requires_independent_verification'
      : ratio > 1 ? 'measurement_uncertainty_or_missing_input_must_be_checked'
      : 'no_reported_energy_gain',
    qualification: 'Power bookkeeping, not proof of anomalous energy. Missing sources, instrument errors, and losses must be checked.'
  };
}
