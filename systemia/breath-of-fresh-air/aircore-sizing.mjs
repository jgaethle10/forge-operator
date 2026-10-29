#!/usr/bin/env node
/**
 * Breath of Fresh Air / AirCore V0.1
 * Preliminary recirculating PARTICLE filtration sizing only.
 * Not measured CADR, not safety-certified, not an outdoor ventilation design.
 * Run: node systemia/breath-of-fresh-air/aircore-sizing.mjs [JSON overrides]
 */
const defaults = Object.freeze({
  room_area_sqft: 200,
  ceiling_ft: 8,
  target_equivalent_ach: 5,
  assumed_single_pass_particle_capture: 0.90,
  assumed_bypass_fraction: 0.05,
  intake_grille_open_fraction: 0.55,
  maximum_intake_face_velocity_fpm: 250,
  filter_frontal_area_sqin: 192,
  intake_grille_count: 2,
  intake_each_width_in: 10,
  intake_each_height_in: 9,
});
function finitePositive(n, name) {
  if (!Number.isFinite(n) || n <= 0) throw new Error(name + " must be >0");
  return n;
}
export function sizeAirCore(input = {}) {
  const p = { ...defaults, ...input };
  for (const k of ['room_area_sqft','ceiling_ft','target_equivalent_ach',
    'maximum_intake_face_velocity_fpm','filter_frontal_area_sqin',
    'intake_grille_count','intake_each_width_in','intake_each_height_in']) {
    finitePositive(p[k], k);
  }
  for (const k of ['assumed_single_pass_particle_capture','intake_grille_open_fraction']) {
    if (!(p[k] > 0 && p[k] <= 1)) throw new Error(k + " must be in (0,1]");
  }
  if (!(p.assumed_bypass_fraction >= 0 && p.assumed_bypass_fraction < 1)) {
    throw new Error('assumed_bypass_fraction must be in [0,1)');
  }
  const volume = p.room_area_sqft * p.ceiling_ft;
  const targetCadr = volume * p.target_equivalent_ach / 60;
  const assumedCapture = p.assumed_single_pass_particle_capture * (1-p.assumed_bypass_fraction);
  const estimatedOperatingFlow = targetCadr / assumedCapture;
  const minimumNetIntakeAreaSqin =
    estimatedOperatingFlow / p.maximum_intake_face_velocity_fpm * 144;
  const minimumGrossIntakeAreaSqin = minimumNetIntakeAreaSqin / p.intake_grille_open_fraction;
  const providedGrossIntakeAreaSqin =
    p.intake_grille_count*p.intake_each_width_in*p.intake_each_height_in;
  const providedNetIntakeAreaSqin = providedGrossIntakeAreaSqin*p.intake_grille_open_fraction;
  const estimatedIntakeVelocityFpm = estimatedOperatingFlow/(providedNetIntakeAreaSqin/144);
  const estimatedFilterVelocityFpm = estimatedOperatingFlow/(p.filter_frontal_area_sqin/144);
  return {
    schema: 'evercraft.bofa.aircore-sizing.v0.1',
    validation_state: 'DESIGN_ONLY_NOT_BENCH_TESTED',
    definition: 'recirculating particulate filtration; no outdoor air exchange',
    assumptions: p,
    calculations: {
      room_volume_cuft: volume,
      particle_cadr_target_cfm: targetCadr,
      assumed_effective_capture_fraction: assumedCapture,
      required_operating_airflow_cfm_at_measured_system_pressure: estimatedOperatingFlow,
      minimum_net_intake_area_sqin: minimumNetIntakeAreaSqin,
      minimum_gross_intake_area_sqin: minimumGrossIntakeAreaSqin,
      proposed_gross_intake_area_sqin: providedGrossIntakeAreaSqin,
      proposed_net_intake_area_sqin: providedNetIntakeAreaSqin,
      estimated_intake_face_velocity_fpm: estimatedIntakeVelocityFpm,
      estimated_filter_frontal_velocity_fpm: estimatedFilterVelocityFpm,
      intake_geometry_under_assumed_velocity_ceiling: estimatedIntakeVelocityFpm <= p.maximum_intake_face_velocity_fpm,
    },
    holds: [
      'Select blower only from its operating-point fan curve at measured system pressure',
      'Capture fraction and leakage are hypotheses until tested',
      'Filter pressure drop, dirty-filter flow, thermal, and acoustic tests pending',
      'Do not market the estimated output as measured or certified CADR',
      'No electrical or furniture product compliance evaluation completed',
    ]
  };
}
const calledAsProgram = process.argv[1] && import.meta.url.endsWith('/'+process.argv[1].replace(/\\/g,'/').split('/').pop());
if (calledAsProgram) {
  try { console.log(JSON.stringify(sizeAirCore(process.argv[2] ? JSON.parse(process.argv[2]) : {}), null, 2)); }
  catch (e) { console.error('AIRCORE_HOLD:', e.message); process.exitCode=1; }
}
