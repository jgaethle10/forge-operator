import test from 'node:test';
import assert from 'node:assert/strict';
import {sizeAirCore} from './aircore-sizing.mjs';

test('reference 200 square foot room reaches approximately five equivalent ACH', () => {
 const r=sizeAirCore();
 const c=r.calculations;
 assert.equal(r.validation_state,'DESIGN_ONLY_NOT_BENCH_TESTED');
 assert.ok(Math.abs(c.particle_cadr_target_cfm-133.3333333)<1e-4);
 assert.ok(c.required_operating_airflow_cfm_at_measured_system_pressure>155);
 assert.ok(c.required_operating_airflow_cfm_at_measured_system_pressure<157);
 assert.ok(c.intake_geometry_under_assumed_velocity_ceiling);
 assert.ok(c.proposed_gross_intake_area_sqin>=c.minimum_gross_intake_area_sqin);
});

test('room-volume scaling changes target CADR, no claim of certified rating', () => {
 const a=sizeAirCore({room_area_sqft:100});
 const b=sizeAirCore({room_area_sqft:200});
 assert.equal(a.calculations.particle_cadr_target_cfm*2,b.calculations.particle_cadr_target_cfm);
 assert.match(a.validation_state,/DESIGN_ONLY/);
});

test('leakage worsens required flow even with unchanged CADR target', () => {
 const tight=sizeAirCore({assumed_bypass_fraction:0.01});
 const leaky=sizeAirCore({assumed_bypass_fraction:0.20});
 assert.ok(leaky.calculations.required_operating_airflow_cfm_at_measured_system_pressure >
 tight.calculations.required_operating_airflow_cfm_at_measured_system_pressure);
});

test('unrealistic performance and grille configurations are rejected', () => {
 for (const p of [
  {assumed_single_pass_particle_capture:0},
  {assumed_single_pass_particle_capture:1.1},
  {assumed_bypass_fraction:1},
  {assumed_bypass_fraction:-0.1},
  {intake_grille_open_fraction:0},
  {filter_frontal_area_sqin:-1},
  {intake_grille_count:0}
 ]) assert.throws(()=>sizeAirCore(p));
});

test('grille constriction is surfaced as failure instead of hidden', () => {
 const r=sizeAirCore({intake_grille_count:1,intake_each_width_in:7,intake_each_height_in:6});
 assert.equal(r.calculations.intake_geometry_under_assumed_velocity_ceiling,false);
});
