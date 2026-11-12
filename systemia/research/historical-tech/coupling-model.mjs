/**
 * HIST-TECH-001. Ideal coaxial circular-filament mutual inductance.
 * Quasistatic free-space model, not a resonant circuit, real winding, or device efficiency.
 * Formula: reduced Neumann line-integral from NIST DLMF 19.34.1, SI units.
 * https://dlmf.nist.gov/19.34
 */
const MU0 = 4 * Math.PI * 1e-7; // Standard engineering approximation, H/m.
const MIN_CLEARANCE_MM = 0.5; // No wire radius is specified; exclude close/overlapping filaments.

function positiveFinite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number`);
  }
  return value;
}
function nonnegativeFinite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a nonnegative finite number`);
  }
  return value;
}
function turnCount(value, name) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 1000) {
    throw new RangeError(`${name} must be an integer between 1 and 1000`);
  }
  return value;
}
function singleLoopMutual(a, b, h, subdivisions) {
  const step = 2 * Math.PI / subdivisions;
  let weighted = 0;
  for (let i = 0; i <= subdivisions; i++) {
    const angle = i * step;
    const cos = Math.cos(angle);
    const separationSquared = (a - b) ** 2 + h ** 2 + 2 * a * b * (1 - cos);
    const value = cos / Math.sqrt(separationSquared);
    const weight = i === 0 || i === subdivisions ? 1 : (i % 2 === 0 ? 2 : 4);
    weighted += weight * value;
  }
  // M = (mu0/2) a b integral_0^2pi [cos(theta)/r(theta)] dtheta.
  return 0.5 * MU0 * a * b * weighted * step / 3;
}

export function coaxialMutualInductance({
  transmitterRadiusMm, receiverRadiusMm, separationMm,
  transmitterTurns = 1, receiverTurns = 1
}) {
  const a = positiveFinite(transmitterRadiusMm, 'transmitterRadiusMm') / 1000;
  const b = positiveFinite(receiverRadiusMm, 'receiverRadiusMm') / 1000;
  const h = nonnegativeFinite(separationMm, 'separationMm') / 1000;
  const nt = turnCount(transmitterTurns, 'transmitterTurns');
  const nr = turnCount(receiverTurns, 'receiverTurns');
  if (Math.hypot(a - b, h) < MIN_CLEARANCE_MM / 1000) {
    throw new RangeError('Filaments touch or are too close for this zero-wire-thickness model');
  }
  if (h > 20 * Math.max(a, b)) {
    throw new RangeError('Separation too large for the cancellation-resistant range of this quadrature');
  }
  const coarse = singleLoopMutual(a, b, h, 2048);
  const fine = singleLoopMutual(a, b, h, 4096);
  if (fine <= 0 || !Number.isFinite(fine) || Math.abs(fine - coarse) > 1e-4 * fine) {
    throw new Error('Numerical precision gate failed; use an independently validated field solver');
  }
  return {
    mutualInductanceHenries: fine * nt * nr,
    mutualInductanceMicrohenries: fine * nt * nr * 1e6,
    model: 'ideal_coaxial_thin_circular_filaments_quasistatic_free_space',
    assumptions: 'Same axial center, parallel loops, negligible wire thickness, identical radius for each turn, and no ferrites, shielding, tuning or losses; NOT predicted device efficiency.'
  };
}

/** For same radii, turns, source drive, frequency, and fixed weakly coupled load,
 * square of ideal mutual-inductance ratio is an illustrative pickup-power proxy.
 * In realistic resonant, regulated, or strongly coupled circuits, the ratio is not reliable.
 */
export function relativePickupProxy(configuration, baselineSeparationMm, comparisonSeparationMm) {
  const baseline = coaxialMutualInductance({...configuration, separationMm: baselineSeparationMm}).mutualInductanceHenries;
  const comparison = coaxialMutualInductance({...configuration, separationMm: comparisonSeparationMm}).mutualInductanceHenries;
  return {
    relativeMutualInductance: comparison / baseline,
    relativeWeakCouplingPowerProxy: (comparison / baseline) ** 2,
    isEfficiencyPrediction: false,
    qualification: 'Illustrative weak-coupling M-squared proxy only; not input-output efficiency or transferred watts.'
  };
}
