import assert from 'node:assert/strict';
import {
  relativisticDisplacement,
  morrisThorneThroatEnergyDensity,
  casimirParallelPlateEnergyDensity,
  equivalentIdealCasimirSeparation,
  postselectionCausalityToyModel,
  negativeEnergyGap,
} from './chronos.mjs';

function nearlyEqual(actual, expected, relativeTolerance = 1e-9) {
  const scale = Math.max(1, Math.abs(expected));
  return Math.abs(actual - expected) <= relativeTolerance * scale;
}

const r2 = relativisticDisplacement(2);
const r10 = relativisticDisplacement(10);
const r100 = relativisticDisplacement(100);

assert.ok(nearlyEqual(r2.velocity_fraction_c, Math.sqrt(3) / 2, 1e-12));
assert.ok(nearlyEqual(r10.velocity_fraction_c, Math.sqrt(0.99), 1e-12));
assert.ok(nearlyEqual(r100.velocity_fraction_c, Math.sqrt(0.9999), 1e-12));

assert.ok(r2.kinetic_energy_per_kg_J > 8.9e16 && r2.kinetic_energy_per_kg_J < 9.1e16);
assert.ok(r10.kinetic_energy_per_kg_J > 8.0e17 && r10.kinetic_energy_per_kg_J < 8.2e17);
assert.ok(r100.kinetic_energy_per_kg_J > 8.8e18 && r100.kinetic_energy_per_kg_J < 9.0e18);

const throat = morrisThorneThroatEnergyDensity({
  throatRadiusM: 1,
  bPrimeAtThroat: -1,
});
assert.ok(throat.energy_density_J_m3 < 0);
assert.ok(throat.magnitude_J_m3 > 4.7e42 && throat.magnitude_J_m3 < 4.9e42);

const casimir1nm = casimirParallelPlateEnergyDensity(1e-9);
assert.ok(casimir1nm.energy_density_J_m3 < 0);
assert.ok(casimir1nm.magnitude_J_m3 > 4.2e8 && casimir1nm.magnitude_J_m3 < 4.5e8);

const equivalent = equivalentIdealCasimirSeparation(throat.magnitude_J_m3);
assert.ok(equivalent > 3.0e-18 && equivalent < 3.2e-18);

const gap = negativeEnergyGap({
  throatRadiusM: 1,
  bPrimeAtThroat: -1,
  casimirSeparationM: 1e-9,
});
assert.ok(gap.magnitude_ratio > 1e33);
assert.ok(gap.magnitude_ratio < 2e34);
assert.ok(gap.log10_gap > 33 && gap.log10_gap < 35);

const postselection = postselectionCausalityToyModel();
assert.ok(Math.abs(postselection.unconditional_mutual_information_bits) < 1e-12);
assert.ok(nearlyEqual(postselection.postselected_mutual_information_bits, 1, 1e-12));
assert.ok(nearlyEqual(postselection.postselection_success_probability, 0.5, 1e-12));

console.log(JSON.stringify({
  ok: true,
  mission: 'CHRONOS-001',
  relativity: {
    ratio_2: r2,
    ratio_10: r10,
    ratio_100: r100,
  },
  negative_energy_gap_1m_throat_vs_1nm_casimir: {
    wormhole_energy_density_J_m3: gap.wormhole.energy_density_J_m3,
    casimir_energy_density_J_m3: gap.casimir.energy_density_J_m3,
    magnitude_ratio: gap.magnitude_ratio,
    log10_gap: gap.log10_gap,
    equivalent_ideal_casimir_separation_m: gap.equivalent_ideal_casimir_separation_m,
  },
  postselection_control: postselection,
}, null, 2));
