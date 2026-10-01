export const HUANG_2026 = Object.freeze({
  citation: {
    authors:
      'Yi-Te Huang, Hsiang-Wei Huang, Jhen-Dong Lin, Adam Miranowicz, Neill Lambert, Guang-Yin Chen, Franco Nori, Yueh-Nan Chen',
    title:
      'Experimental simulation of postselected closed timelike curves for decoding scrambled quantum information',
    journal: 'Physical Review Research',
    volume: 8,
    article: '023084',
    year: 2026,
    doi: '10.1103/tm83-sxpm',
    published: '2026-04-29',
  },
  experimental_design: {
    quantinuum: {
      processor: 'H1-1',
      shots_per_tomography_measurement: 4000,
      calibration_date: '2024-04-10',
      calibration: {
        relaxation_time_s: 60,
        decoherence_time_s_approx: 4,
        readout_error: 2.5e-3,
        single_qubit_gate_error: 2.1e-5,
        two_qubit_gate_error: 8.8e-4,
      },
    },
    ibm: {
      processor: 'ibm_torino',
      shots_per_tomography_measurement: 40000,
      calibration_date: '2024-09-26',
      calibration: {
        average_two_qubit_cz_error: 1.62e-3,
        used_qubits: [
          {
            system: 'H',
            qubit: 87,
            relaxation_us: 293.88,
            decoherence_us: 256.22,
            readout_error: 6.30e-3,
            rz_error: 0,
            sqrt_x_error: 1.44e-4,
          },
          {
            system: 'H',
            qubit: 88,
            relaxation_us: 280.95,
            decoherence_us: 403.23,
            readout_error: 2.54e-2,
            rz_error: 0,
            sqrt_x_error: 1.49e-4,
          },
          {
            system: 'E',
            qubit: 94,
            relaxation_us: 274.41,
            decoherence_us: 272.24,
            readout_error: 1.07e-2,
            rz_error: 0,
            sqrt_x_error: 1.52e-4,
          },
          {
            system: "E'",
            qubit: 107,
            relaxation_us: 88.68,
            decoherence_us: 105.80,
            readout_error: 2.86e-2,
            rz_error: 0,
            sqrt_x_error: 5.16e-4,
          },
        ],
      },
    },
  },
  ideal: {
    Uq: {
      success_probability: 0.25,
      fidelity: {
        'x-': 1,
        'x+': 1,
        'y-': 1,
        'y+': 1,
        'z-': 1,
        'z+': 1,
      },
    },
    Uc: {
      success_probability: 0.5,
      fidelity: {
        'x-': 0.5,
        'x+': 0.5,
        'y-': 0.5,
        'y+': 0.5,
        'z-': 1,
        'z+': 1,
      },
    },
  },
  table_I: {
    quantinuum_Uq: {
      'x-': { fidelity: 0.976, success_probability: 0.258 },
      'x+': { fidelity: 0.986, success_probability: 0.249 },
      'y-': { fidelity: 0.990, success_probability: 0.243 },
      'y+': { fidelity: 0.988, success_probability: 0.256 },
      'z-': { fidelity: 0.983, success_probability: 0.253 },
      'z+': { fidelity: 0.987, success_probability: 0.252 },
    },
    ibm_Uq: {
      'x-': { fidelity: 0.8320, success_probability: 0.2519 },
      'x+': { fidelity: 0.8219, success_probability: 0.2619 },
      'y-': { fidelity: 0.8681, success_probability: 0.2592 },
      'y+': { fidelity: 0.8506, success_probability: 0.2578 },
      'z-': { fidelity: 0.8479, success_probability: 0.2566 },
      'z+': { fidelity: 0.8512, success_probability: 0.2564 },
    },
    ibm_Uc: {
      'x-': { fidelity: 0.5021, success_probability: 0.4430 },
      'x+': { fidelity: 0.5014, success_probability: 0.4440 },
      'y-': { fidelity: 0.4949, success_probability: 0.4454 },
      'y+': { fidelity: 0.5082, success_probability: 0.4406 },
      'z-': { fidelity: 0.9092, success_probability: 0.4405 },
      'z+': { fidelity: 0.9130, success_probability: 0.4461 },
    },
  },
  provenance: {
    shot_counts: 'main text p. 6 / PDF lines 484-489',
    table_I: 'main text Table I, p. 6',
    quantinuum_calibration: 'Appendix C, Table II, p. 8',
    ibm_calibration: 'Appendix C, Table III, p. 9',
    causal_boundary:
      'The authors explicitly state that the protocol does not realize physical time travel and is a controlled quantum simulation of PCTC logical structure.',
  },
});

export function binomialStandardError(probability, shots) {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new RangeError('probability must be in [0,1]');
  }
  if (!Number.isInteger(shots) || shots <= 0) {
    throw new RangeError('shots must be a positive integer');
  }
  return Math.sqrt((probability * (1 - probability)) / shots);
}

export function successProbabilityAudit({
  observed,
  ideal,
  shots,
}) {
  const sigma = binomialStandardError(ideal, shots);
  const delta = observed - ideal;
  return {
    observed,
    ideal,
    shots,
    delta,
    absolute_delta: Math.abs(delta),
    shot_noise_sigma: sigma,
    z_from_ideal_under_binomial_only: delta / sigma,
    outside_95pct_shot_only_envelope: Math.abs(delta) > 1.96 * sigma,
    interpretation:
      'This z-score tests only finite-shot fluctuation around the ideal success probability. It does not model gate, readout, decoherence, compilation, drift, or tomography systematics.',
  };
}

function summarizeGroup(rows, idealP, shots) {
  const entries = Object.entries(rows).map(([state, record]) => ({
    state,
    fidelity: record.fidelity,
    success: successProbabilityAudit({
      observed: record.success_probability,
      ideal: idealP,
      shots,
    }),
  }));

  const meanObservedP =
    entries.reduce((sum, entry) => sum + entry.success.observed, 0) /
    entries.length;
  const meanFidelity =
    entries.reduce((sum, entry) => sum + entry.fidelity, 0) /
    entries.length;

  return {
    entries,
    mean_observed_success_probability: meanObservedP,
    mean_fidelity: meanFidelity,
    max_abs_success_z: Math.max(
      ...entries.map((entry) =>
        Math.abs(entry.success.z_from_ideal_under_binomial_only),
      ),
    ),
    states_outside_95pct_shot_only_envelope: entries
      .filter((entry) => entry.success.outside_95pct_shot_only_envelope)
      .map((entry) => entry.state),
  };
}

export function auditPublishedSuccessProbabilities() {
  const qShots =
    HUANG_2026.experimental_design.quantinuum.shots_per_tomography_measurement;
  const iShots =
    HUANG_2026.experimental_design.ibm.shots_per_tomography_measurement;

  return {
    quantinuum_Uq: summarizeGroup(
      HUANG_2026.table_I.quantinuum_Uq,
      HUANG_2026.ideal.Uq.success_probability,
      qShots,
    ),
    ibm_Uq: summarizeGroup(
      HUANG_2026.table_I.ibm_Uq,
      HUANG_2026.ideal.Uq.success_probability,
      iShots,
    ),
    ibm_Uc: summarizeGroup(
      HUANG_2026.table_I.ibm_Uc,
      HUANG_2026.ideal.Uc.success_probability,
      iShots,
    ),
    evidence_class: 'published_experiment_reanalysis',
    causal_boundary:
      'Agreement or disagreement with ideal postselection statistics is not a test of physical retrocausality. It is a hardware/sampling audit of the published simulation.',
  };
}

function xorshift32(seed) {
  let state = seed >>> 0;
  if (state === 0) state = 0x6d2b79f5;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

export function sampleBinomial({ probability, shots, seed = 1 }) {
  const random = xorshift32(seed);
  let successes = 0;
  for (let i = 0; i < shots; i += 1) {
    if (random() < probability) successes += 1;
  }
  return {
    successes,
    shots,
    estimate: successes / shots,
    probability,
    seed,
  };
}

export function finiteShotSuccessSweep({
  probability,
  shots,
  trials = 1000,
  seed = 1,
}) {
  if (!Number.isInteger(trials) || trials <= 0) {
    throw new RangeError('trials must be a positive integer');
  }

  const estimates = [];
  for (let i = 0; i < trials; i += 1) {
    estimates.push(
      sampleBinomial({
        probability,
        shots,
        seed: (seed + i * 0x9e3779b9) >>> 0,
      }).estimate,
    );
  }
  estimates.sort((a, b) => a - b);

  const at = (q) =>
    estimates[Math.min(estimates.length - 1, Math.floor(q * estimates.length))];

  return {
    probability,
    shots,
    trials,
    seed,
    median: at(0.5),
    empirical_2_5pct: at(0.025),
    empirical_97_5pct: at(0.975),
    analytic_sigma: binomialStandardError(probability, shots),
    evidence_class: 'monte_carlo_sampling_model',
  };
}

export function calibrationSummary() {
  const ibm =
    HUANG_2026.experimental_design.ibm.calibration.used_qubits;
  const mean = (field) =>
    ibm.reduce((sum, row) => sum + row[field], 0) / ibm.length;

  return {
    quantinuum_H1_1:
      HUANG_2026.experimental_design.quantinuum.calibration,
    ibm_torino: {
      mean_readout_error_used_qubits: mean('readout_error'),
      mean_sqrt_x_error_used_qubits: mean('sqrt_x_error'),
      average_two_qubit_cz_error:
        HUANG_2026.experimental_design.ibm.calibration
          .average_two_qubit_cz_error,
      used_qubits: ibm,
    },
    interpretation:
      'Calibration values are historical snapshots reported by the paper. They are inputs for later hardware-noise modeling, not sufficient by themselves to reproduce the full processor error channel.',
  };
}
