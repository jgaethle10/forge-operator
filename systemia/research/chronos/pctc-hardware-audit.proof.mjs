import assert from 'node:assert/strict';
import {
  HUANG_2026,
  auditPublishedSuccessProbabilities,
  binomialStandardError,
  calibrationSummary,
  finiteShotSuccessSweep,
} from './pctc-hardware-audit.mjs';

function approx(actual, expected, tolerance = 1e-12) {
  return Math.abs(actual - expected) <= tolerance;
}

assert.equal(
  HUANG_2026.experimental_design.quantinuum.shots_per_tomography_measurement,
  4000,
);
assert.equal(
  HUANG_2026.experimental_design.ibm.shots_per_tomography_measurement,
  40000,
);

const sigmaQ = binomialStandardError(0.25, 4000);
const sigmaIbmUq = binomialStandardError(0.25, 40000);
const sigmaIbmUc = binomialStandardError(0.5, 40000);

assert.ok(approx(sigmaQ, Math.sqrt(0.1875 / 4000)));
assert.ok(approx(sigmaIbmUq, Math.sqrt(0.1875 / 40000)));
assert.ok(approx(sigmaIbmUc, 0.0025));

const audit = auditPublishedSuccessProbabilities();

// H1-1 Uq P values should all be statistically compatible with 0.25
// under a simple finite-shot-only check.
assert.equal(
  audit.quantinuum_Uq.states_outside_95pct_shot_only_envelope.length,
  0,
);

// IBM Torino Uq shows several deviations too large to attribute to 40k-shot
// binomial fluctuation alone, consistent with hardware/systematic effects.
assert.ok(
  audit.ibm_Uq.states_outside_95pct_shot_only_envelope.length >= 4,
);
assert.ok(audit.ibm_Uq.max_abs_success_z > 5);

// IBM Torino Uc is dramatically shifted from its ideal P=0.5 baseline.
assert.equal(
  audit.ibm_Uc.states_outside_95pct_shot_only_envelope.length,
  6,
);
assert.ok(audit.ibm_Uc.max_abs_success_z > 20);

assert.ok(
  Math.abs(audit.quantinuum_Uq.mean_fidelity - 0.985) < 5e-4,
);
assert.ok(
  Math.abs(audit.ibm_Uq.mean_fidelity - 0.8453) < 5e-5,
);
assert.ok(
  Math.abs(audit.ibm_Uc.mean_fidelity - 0.6381) < 5e-5,
);

const qSweep = finiteShotSuccessSweep({
  probability: 0.25,
  shots: 4000,
  trials: 2000,
  seed: 0x4348524f,
});
assert.ok(qSweep.empirical_2_5pct > 0.23);
assert.ok(qSweep.empirical_97_5pct < 0.27);
assert.ok(qSweep.median > 0.245 && qSweep.median < 0.255);

const iSweep = finiteShotSuccessSweep({
  probability: 0.25,
  shots: 40000,
  trials: 1000,
  seed: 0x4e4f532d,
});
assert.ok(iSweep.empirical_2_5pct > 0.24);
assert.ok(iSweep.empirical_97_5pct < 0.26);

const calibration = calibrationSummary();
assert.ok(
  approx(calibration.quantinuum_H1_1.readout_error, 2.5e-3),
);
assert.ok(
  approx(calibration.ibm_torino.average_two_qubit_cz_error, 1.62e-3),
);
assert.ok(
  calibration.ibm_torino.mean_readout_error_used_qubits > 0.017 &&
    calibration.ibm_torino.mean_readout_error_used_qubits < 0.018,
);

console.log(
  JSON.stringify(
    {
      ok: true,
      mission: 'CHRONOS-001',
      milestone: 'T1 hardware sampling audit',
      analytic_shot_sigma: {
        quantinuum_Uq_4000: sigmaQ,
        ibm_Uq_40000: sigmaIbmUq,
        ibm_Uc_40000: sigmaIbmUc,
      },
      published_success_probability_audit: audit,
      finite_shot_envelopes: {
        quantinuum_4000_at_p025: qSweep,
        ibm_40000_at_p025: iSweep,
      },
      calibration,
      conclusion:
        'Quantinuum Uq success-probability deviations are compatible with finite-shot variation under this simple audit. Several IBM Uq deviations and all IBM Uc deviations are too large for shot noise alone, so later modeling must include hardware/compilation/readout/decoherence systematics. None of these deviations is evidence of physical retrocausality.',
    },
    null,
    2,
  ),
);
