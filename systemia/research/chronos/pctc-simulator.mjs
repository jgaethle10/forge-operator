const SQRT2 = Math.sqrt(2);

function z(re = 0, im = 0) {
  return { re, im };
}

function add(a, b) {
  return z(a.re + b.re, a.im + b.im);
}

function mul(a, b) {
  return z(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
}

function scale(a, k) {
  return z(a.re * k, a.im * k);
}

function conj(a) {
  return z(a.re, -a.im);
}

function abs2(a) {
  return a.re * a.re + a.im * a.im;
}

function toComplex(value) {
  if (typeof value === 'number') return z(value, 0);
  return value;
}

function zeroState(length) {
  return Array.from({ length }, () => z());
}

function bitsFromIndex(index, width) {
  return Array.from({ length: width }, (_, q) => (index >> (width - 1 - q)) & 1);
}

function indexFromBits(bits) {
  return bits.reduce((value, bit) => (value << 1) | bit, 0);
}

function localIndexFromBits(bits, qubits) {
  return qubits.reduce((value, qubit) => (value << 1) | bits[qubit], 0);
}

export function dagger(matrix) {
  return matrix[0].map((_, col) =>
    matrix.map((row) => conj(toComplex(row[col]))),
  );
}

export function isUnitary(matrix, tolerance = 1e-10) {
  const n = matrix.length;
  const d = dagger(matrix);

  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      let sum = z();
      for (let k = 0; k < n; k += 1) {
        sum = add(sum, mul(toComplex(d[r][k]), toComplex(matrix[k][c])));
      }
      const expected = r === c ? 1 : 0;
      if (Math.hypot(sum.re - expected, sum.im) > tolerance) return false;
    }
  }

  return true;
}

function applyThreeQubitUnitary(state, matrix, qubits = [0, 1, 2]) {
  if (state.length !== 16) {
    throw new RangeError('CHRONOS PCTC simulator currently expects a four-qubit state');
  }
  if (matrix.length !== 8 || matrix.some((row) => row.length !== 8)) {
    throw new RangeError('three-qubit unitary must be 8x8');
  }

  const output = zeroState(16);

  for (let outIndex = 0; outIndex < 16; outIndex += 1) {
    const outBits = bitsFromIndex(outIndex, 4);
    const localOut = localIndexFromBits(outBits, qubits);
    let amplitude = z();

    for (let localIn = 0; localIn < 8; localIn += 1) {
      const inBits = [...outBits];
      const localBits = bitsFromIndex(localIn, 3);
      for (let i = 0; i < 3; i += 1) {
        inBits[qubits[i]] = localBits[i];
      }

      const inIndex = indexFromBits(inBits);
      amplitude = add(
        amplitude,
        mul(toComplex(matrix[localOut][localIn]), state[inIndex]),
      );
    }

    output[outIndex] = amplitude;
  }

  return output;
}

const PHI_PLUS = [
  z(1 / SQRT2),
  z(),
  z(),
  z(1 / SQRT2),
];

function initialStateForHBasis(hBasis) {
  if (!Number.isInteger(hBasis) || hBasis < 0 || hBasis > 3) {
    throw new RangeError('H basis must be an integer from 0 through 3');
  }

  const state = zeroState(16);
  const hBits = bitsFromIndex(hBasis, 2);

  for (const e of [0, 1]) {
    const bits = [hBits[0], hBits[1], e, e];
    state[indexFromBits(bits)] = z(1 / SQRT2);
  }

  return state;
}

function projectQ0(state, ket) {
  const rest = zeroState(8);

  for (let restIndex = 0; restIndex < 8; restIndex += 1) {
    const restBits = bitsFromIndex(restIndex, 3);
    let amplitude = z();

    for (const q0 of [0, 1]) {
      const fullIndex = indexFromBits([q0, ...restBits]);
      amplitude = add(amplitude, mul(conj(ket[q0]), state[fullIndex]));
    }

    rest[restIndex] = amplitude;
  }

  return rest;
}

function prepareQ0(ket, rest) {
  const state = zeroState(16);

  for (const q0 of [0, 1]) {
    for (let restIndex = 0; restIndex < 8; restIndex += 1) {
      const index = (q0 << 3) | restIndex;
      state[index] = mul(ket[q0], rest[restIndex]);
    }
  }

  return state;
}

function projectBellQ2Q3(state) {
  const rest = zeroState(4);

  for (let restIndex = 0; restIndex < 4; restIndex += 1) {
    const [q0, q1] = bitsFromIndex(restIndex, 2);
    let amplitude = z();

    for (let bellIndex = 0; bellIndex < 4; bellIndex += 1) {
      const [q2, q3] = bitsFromIndex(bellIndex, 2);
      const fullIndex = indexFromBits([q0, q1, q2, q3]);
      amplitude = add(
        amplitude,
        mul(conj(PHI_PLUS[bellIndex]), state[fullIndex]),
      );
    }

    rest[restIndex] = amplitude;
  }

  return rest;
}

function normSquared(state) {
  return state.reduce((sum, amplitude) => sum + abs2(amplitude), 0);
}

function normalized(ket) {
  const norm = Math.sqrt(normSquared(ket));
  if (!(norm > 0)) throw new RangeError('state must have nonzero norm');
  return ket.map((value) => scale(value, 1 / norm));
}

function blochVector(ket) {
  const psi = normalized(ket);
  const a = psi[0];
  const b = psi[1];
  const overlap = mul(conj(a), b);

  return {
    x: 2 * overlap.re,
    y: 2 * overlap.im,
    z: abs2(a) - abs2(b),
  };
}

function pureStateFidelityFromBloch(targetKet, measuredBloch) {
  const target = blochVector(targetKet);
  const dot =
    target.x * measuredBloch.x +
    target.y * measuredBloch.y +
    target.z * measuredBloch.z;
  return (1 + dot) / 2;
}

const TOMOGRAPHY_EIGENSTATES = Object.freeze({
  x: {
    plus: [z(1 / SQRT2), z(1 / SQRT2)],
    minus: [z(1 / SQRT2), z(-1 / SQRT2)],
  },
  y: {
    plus: [z(1 / SQRT2), z(0, 1 / SQRT2)],
    minus: [z(1 / SQRT2), z(0, -1 / SQRT2)],
  },
  z: {
    plus: [z(1), z(0)],
    minus: [z(0), z(1)],
  },
});

export const PAPER_STATES = Object.freeze({
  'x-': [z(1 / SQRT2), z(-1 / SQRT2)],
  'x+': [z(1 / SQRT2), z(1 / SQRT2)],
  'y-': [z(1 / SQRT2), z(0, -1 / SQRT2)],
  'y+': [z(1 / SQRT2), z(0, 1 / SQRT2)],
  'z-': [z(0), z(1)],
  'z+': [z(1), z(0)],
});

const UQ_REAL = [
  [1, 1, 1, -1, 1, -1, -1, -1],
  [1, -1, 1, 1, 1, 1, -1, 1],
  [1, 1, -1, 1, 1, -1, 1, 1],
  [-1, 1, 1, 1, -1, -1, -1, 1],
  [1, 1, 1, -1, -1, 1, 1, 1],
  [-1, 1, -1, -1, 1, 1, -1, 1],
  [-1, -1, 1, -1, 1, -1, 1, 1],
  [-1, 1, 1, 1, 1, 1, 1, -1],
];

export const UQ = Object.freeze(
  UQ_REAL.map((row) =>
    Object.freeze(row.map((value) => z(value / (2 * SQRT2)))),
  ),
);

export const UC = Object.freeze(
  [1, 1, 1, -1, 1, -1, -1, -1].map((diagonal, r) =>
    Object.freeze(
      Array.from({ length: 8 }, (_, c) => z(r === c ? diagonal : 0)),
    ),
  ),
);

/**
 * Ideal state-vector reproduction of the four-qubit laboratory protocol in
 * Huang et al., Phys. Rev. Research 8, 023084 (2026), DOI 10.1103/tm83-sxpm.
 *
 * Physical wire order follows Fig. 4:
 *   before U†: [H1, H2, E, E']
 *   after U†:  [B,  H1, H2, E']
 *   after reset/preparation: [A, H1, H2, E']
 *   after U:   [H1, H2, E, E']
 *
 * Bob's earlier tomography result is retained as a classical branch. Qubit B
 * is then reset and prepared as Alice's later input state. Final Bell
 * postselection on E,E' reweights the earlier measurement branches.
 */
export function simulatePctcPaperProtocol(unitary, inputKet) {
  if (!isUnitary(unitary)) throw new TypeError('scrambler must be unitary');
  const psi = normalized(inputKet);
  const decode = dagger(unitary);

  const postselectedBloch = {};
  const unconditionalEarlierBloch = {};
  const successProbabilityByAxis = {};

  for (const axis of ['x', 'y', 'z']) {
    let selectedNumerator = 0;
    let selectedDenominator = 0;
    let rawNumerator = 0;
    let rawDenominator = 0;

    const branches = [
      { value: 1, ket: TOMOGRAPHY_EIGENSTATES[axis].plus },
      { value: -1, ket: TOMOGRAPHY_EIGENSTATES[axis].minus },
    ];

    for (let hBasis = 0; hBasis < 4; hBasis += 1) {
      const initial = initialStateForHBasis(hBasis);
      const decoded = applyThreeQubitUnitary(initial, decode);

      for (const branch of branches) {
        const remainder = projectQ0(decoded, branch.ket);
        const earlierWeight = normSquared(remainder) / 4;

        rawDenominator += earlierWeight;
        rawNumerator += branch.value * earlierWeight;

        const afterReset = prepareQ0(psi, remainder);
        const encoded = applyThreeQubitUnitary(afterReset, unitary);
        const bellSelected = projectBellQ2Q3(encoded);
        const jointWeight = normSquared(bellSelected) / 4;

        selectedDenominator += jointWeight;
        selectedNumerator += branch.value * jointWeight;
      }
    }

    postselectedBloch[axis] = selectedNumerator / selectedDenominator;
    unconditionalEarlierBloch[axis] = rawNumerator / rawDenominator;
    successProbabilityByAxis[axis] = selectedDenominator;
  }

  const successValues = Object.values(successProbabilityByAxis);
  const successProbability =
    successValues.reduce((sum, value) => sum + value, 0) /
    successValues.length;

  return {
    success_probability: successProbability,
    success_probability_by_tomography_axis: successProbabilityByAxis,
    postselected_bloch: postselectedBloch,
    unconditional_earlier_bloch: unconditionalEarlierBloch,
    decoding_fidelity: pureStateFidelityFromBloch(psi, postselectedBloch),
    evidence_class: 'experimentally_simulated_ideal_model',
    causal_boundary:
      'The earlier unconditioned record is generated before Alice prepares the later input. The apparent recovery appears only after conditioning earlier branches on the later Bell postselection.',
  };
}

export function runPaperIdealBenchmarks() {
  const result = {
    source: {
      title:
        'Experimental simulation of postselected closed timelike curves for decoding scrambled quantum information',
      citation: 'Phys. Rev. Research 8, 023084 (2026)',
      doi: '10.1103/tm83-sxpm',
      equations: ['Eq. 11 Bell pair', 'Eq. 12 Uq', 'Eq. 13 Uc'],
      figure: 'Fig. 4 four-qubit protocol',
    },
    Uq: {},
    Uc: {},
  };

  for (const [label, ket] of Object.entries(PAPER_STATES)) {
    result.Uq[label] = simulatePctcPaperProtocol(UQ, ket);
    result.Uc[label] = simulatePctcPaperProtocol(UC, ket);
  }

  return result;
}
