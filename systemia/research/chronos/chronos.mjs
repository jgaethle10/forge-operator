const C = 299_792_458;
const G = 6.67430e-11;
const HBAR = 1.054571817e-34;
const JOULES_PER_TWH = 3.6e15;

function requirePositive(name, value) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a finite positive number`);
  }
}

export const constants = Object.freeze({
  c_m_s: C,
  G_m3_kg_s2: G,
  hbar_J_s: HBAR,
  joules_per_TWh: JOULES_PER_TWH,
});

export function relativisticDisplacement(earthToTravelerRatio) {
  requirePositive('earthToTravelerRatio', earthToTravelerRatio);
  if (earthToTravelerRatio < 1) {
    throw new RangeError('earthToTravelerRatio must be >= 1');
  }

  const gamma = earthToTravelerRatio;
  const beta = Math.sqrt(1 - 1 / (gamma * gamma));
  const velocityMS = beta * C;
  const kineticEnergyPerKgJ = (gamma - 1) * C * C;

  return {
    gamma,
    beta,
    velocity_m_s: velocityMS,
    velocity_fraction_c: beta,
    kinetic_energy_per_kg_J: kineticEnergyPerKgJ,
    kinetic_energy_per_kg_TWh: kineticEnergyPerKgJ / JOULES_PER_TWH,
    evidence_class: 'theoretically_derived',
    caveat:
      'Ideal inertial special-relativistic bookkeeping only. This excludes propulsion efficiency, propellant, acceleration/deceleration, shielding, thermal management, structure, and rocket-equation costs.',
  };
}

/**
 * Local orthonormal-frame energy density for the Morris-Thorne metric:
 *   epsilon(r) = (c^4 / 8 pi G) b'(r) / r^2
 *
 * bPrimeAtThroat is dimensionless because b(r) and r both have dimensions of length.
 * Negative values correspond to negative local energy density in this model.
 */
export function morrisThorneThroatEnergyDensity({
  throatRadiusM,
  bPrimeAtThroat = -1,
}) {
  requirePositive('throatRadiusM', throatRadiusM);
  if (!Number.isFinite(bPrimeAtThroat)) {
    throw new TypeError('bPrimeAtThroat must be finite');
  }

  const energyDensityJm3 =
    (C ** 4 / (8 * Math.PI * G)) *
    (bPrimeAtThroat / (throatRadiusM ** 2));

  return {
    throat_radius_m: throatRadiusM,
    b_prime_at_throat: bPrimeAtThroat,
    energy_density_J_m3: energyDensityJm3,
    magnitude_J_m3: Math.abs(energyDensityJm3),
    evidence_class: 'model_derived',
    caveat:
      'This is a local stress-energy requirement for a chosen Morris-Thorne geometry, not a total exotic-matter budget and not proof that the geometry is physically realizable.',
  };
}

/**
 * Ideal parallel-plate Casimir vacuum-energy density:
 *   epsilon = - pi^2 hbar c / (720 a^4)
 *
 * This is a flat-space ideal-conductor benchmark, not a claim that a Casimir
 * apparatus can support a wormhole.
 */
export function casimirParallelPlateEnergyDensity(separationM) {
  requirePositive('separationM', separationM);

  const energyDensityJm3 =
    -(Math.PI ** 2 * HBAR * C) / (720 * separationM ** 4);

  return {
    separation_m: separationM,
    energy_density_J_m3: energyDensityJm3,
    magnitude_J_m3: Math.abs(energyDensityJm3),
    evidence_class: 'theoretically_derived_benchmark',
    caveat:
      'Idealized infinite perfectly conducting plates in flat spacetime. Boundary material, finite-size, nonideal conductivity, and curved-spacetime effects are excluded.',
  };
}

export function equivalentIdealCasimirSeparation(energyDensityMagnitudeJm3) {
  requirePositive('energyDensityMagnitudeJm3', energyDensityMagnitudeJm3);
  return (
    (Math.PI ** 2 * HBAR * C) /
    (720 * energyDensityMagnitudeJm3)
  ) ** 0.25;
}

function mutualInformation(rows) {
  const total = rows.reduce((sum, row) => sum + row.weight, 0);
  requirePositive('total probability weight', total);

  const px = new Map();
  const py = new Map();
  const pxy = new Map();

  for (const row of rows) {
    if (!Number.isFinite(row.weight) || row.weight < 0) {
      throw new TypeError('row weights must be finite and nonnegative');
    }
    const p = row.weight / total;
    px.set(row.x, (px.get(row.x) || 0) + p);
    py.set(row.y, (py.get(row.y) || 0) + p);
    const key = JSON.stringify([row.x, row.y]);
    pxy.set(key, (pxy.get(key) || 0) + p);
  }

  let bits = 0;
  for (const [key, p] of pxy.entries()) {
    if (p === 0) continue;
    const [x, y] = JSON.parse(key);
    bits += p * Math.log2(p / (px.get(x) * py.get(y)));
  }

  return bits;
}

/**
 * Exact four-outcome toy model showing why postselection can mimic a
 * future-to-past correlation without supplying an operational backwards
 * signaling channel.
 *
 * X and Y are independent fair bits. Postselecting only trials with X === Y
 * produces one bit of conditional mutual information while the full dataset
 * retains I(X;Y)=0.
 */
export function postselectionCausalityToyModel() {
  const rows = [
    { x: 0, y: 0, selected: true, weight: 0.25 },
    { x: 0, y: 1, selected: false, weight: 0.25 },
    { x: 1, y: 0, selected: false, weight: 0.25 },
    { x: 1, y: 1, selected: true, weight: 0.25 },
  ];

  const selected = rows.filter((row) => row.selected);
  const successProbability = selected.reduce((sum, row) => sum + row.weight, 0);

  return {
    unconditional_mutual_information_bits: mutualInformation(rows),
    postselected_mutual_information_bits: mutualInformation(selected),
    postselection_success_probability: successProbability,
    operational_interpretation:
      'A correlation that exists only after later trial selection is not, by itself, usable information available in the earlier unconditioned record.',
    evidence_class: 'mathematical_control',
  };
}

export function negativeEnergyGap({
  throatRadiusM = 1,
  bPrimeAtThroat = -1,
  casimirSeparationM = 1e-9,
} = {}) {
  const wormhole = morrisThorneThroatEnergyDensity({
    throatRadiusM,
    bPrimeAtThroat,
  });
  const casimir = casimirParallelPlateEnergyDensity(casimirSeparationM);
  const ratio = wormhole.magnitude_J_m3 / casimir.magnitude_J_m3;

  return {
    wormhole,
    casimir,
    magnitude_ratio: ratio,
    log10_gap: Math.log10(ratio),
    equivalent_ideal_casimir_separation_m:
      equivalentIdealCasimirSeparation(wormhole.magnitude_J_m3),
    evidence_class: 'model_comparison',
    caveat:
      'Magnitude matching is not engineering equivalence. The Casimir stress tensor, spatial support, boundary apparatus, quantum inequalities, and backreaction all matter.',
  };
}
