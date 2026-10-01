import assert from 'node:assert/strict';
import {
  PAPER_STATES,
  UQ,
  UC,
  isUnitary,
  simulatePctcPaperProtocol,
  runPaperIdealBenchmarks,
} from './pctc-simulator.mjs';

function approx(actual, expected, tolerance = 1e-10) {
  return Math.abs(actual - expected) <= tolerance;
}

function assertZeroBloch(record, label) {
  for (const axis of ['x', 'y', 'z']) {
    assert.ok(
      Math.abs(record[axis]) < 1e-10,
      `${label}: unconditional earlier ${axis} component must be zero`,
    );
  }
}

assert.equal(isUnitary(UQ), true, 'Uq must be unitary');
assert.equal(isUnitary(UC), true, 'Uc must be unitary');

const uqResults = {};
const ucResults = {};

for (const [label, ket] of Object.entries(PAPER_STATES)) {
  const uq = simulatePctcPaperProtocol(UQ, ket);
  const uc = simulatePctcPaperProtocol(UC, ket);

  uqResults[label] = uq;
  ucResults[label] = uc;

  assert.ok(approx(uq.success_probability, 0.25), `${label}: Uq P=0.25`);
  assert.ok(approx(uq.decoding_fidelity, 1), `${label}: Uq F=1`);
  assertZeroBloch(uq.unconditional_earlier_bloch, `${label}/Uq`);

  assert.ok(approx(uc.success_probability, 0.5), `${label}: Uc P=0.5`);
  assertZeroBloch(uc.unconditional_earlier_bloch, `${label}/Uc`);

  const expectedUcFidelity = label.startsWith('z') ? 1 : 0.5;
  assert.ok(
    approx(uc.decoding_fidelity, expectedUcFidelity),
    `${label}: Uc fidelity benchmark`,
  );
}

const average = (records, field) =>
  Object.values(records).reduce((sum, record) => sum + record[field], 0) /
  Object.keys(records).length;

assert.ok(approx(average(uqResults, 'success_probability'), 0.25));
assert.ok(approx(average(uqResults, 'decoding_fidelity'), 1));
assert.ok(approx(average(ucResults, 'success_probability'), 0.5));
assert.ok(approx(average(ucResults, 'decoding_fidelity'), 2 / 3));

const full = runPaperIdealBenchmarks();

console.log(
  JSON.stringify(
    {
      ok: true,
      mission: 'CHRONOS-001',
      milestone: 'T1 PCTC ideal state-vector reproduction',
      reproduced_claims: {
        Uq: {
          success_probability_all_six_states: 0.25,
          ideal_fidelity_all_six_states: 1,
        },
        Uc: {
          success_probability_all_six_states: 0.5,
          ideal_fidelity_x_y_states: 0.5,
          ideal_fidelity_z_states: 1,
          ideal_average_fidelity: 2 / 3,
        },
        causality_control: {
          unconditional_earlier_bloch_vector: [0, 0, 0],
          interpretation:
            'Before future Bell postselection, Bob has a maximally mixed earlier record with no dependence on Alice\'s later input.',
        },
      },
      benchmark: full,
    },
    null,
    2,
  ),
);
