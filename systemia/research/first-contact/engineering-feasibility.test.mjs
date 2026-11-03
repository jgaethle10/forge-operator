import test from 'node:test';
import assert from 'node:assert/strict';
import {wavelengthFromFrequency,fixedWingElectroaerodynamicEnvelope} from './engineering-feasibility.mjs';
const opts={massKilograms:2.5,liftToDragRatio:10,speedMetersPerSecond:5,thrustPerKilowattNewtons:5,electricalEnergyWattHours:40,powerSystemEfficiency:0.85};
test('1 THz free-space wavelength ≈299.8 micrometers',()=>{
  assert.ok(Math.abs(wavelengthFromFrequency({frequencyTerahertz:1}).freeSpaceWavelengthMicrometers-299.792458)<1e-6);
});
test('higher THz frequency shortens free-space wavelength',()=>{
  assert.equal(wavelengthFromFrequency({frequencyTerahertz:2}).freeSpaceWavelengthMeters,wavelengthFromFrequency({frequencyTerahertz:1}).freeSpaceWavelengthMeters/2);
});
test('mass, L/D imply level-flight thrust',()=>{
  assert.ok(Math.abs(fixedWingElectroaerodynamicEnvelope(opts).dragAndRequiredThrustNewtons-2.4516625)<1e-8);
});
test('fixed thrust-per-power scenario predicts converter-inclusive battery power',()=>{
  const s=fixedWingElectroaerodynamicEnvelope(opts);
  assert.ok(Math.abs(s.thrustElectricalInputWatts-490.3325)<1e-5);
  assert.ok(Math.abs(s.requiredBatteryPowerWatts-490.3325/.85)<1e-5);
});
test('battery-limited duration scales proportionally with usable energy',()=>{
  const low=fixedWingElectroaerodynamicEnvelope(opts);
  const high=fixedWingElectroaerodynamicEnvelope({...opts,electricalEnergyWattHours:80});
  assert.equal(high.idealBatteryLimitedEnduranceSeconds,2*low.idealBatteryLimitedEnduranceSeconds);
});
test('zero usable energy yields zero endurance and distance',()=>{
  const s=fixedWingElectroaerodynamicEnvelope({...opts,electricalEnergyWattHours:0});
  assert.equal(s.idealBatteryLimitedEnduranceSeconds,0);
  assert.equal(s.idealStillAirDistanceMeters,0);
});
test('rejects impossible efficiency and inconsistent energy budget',()=>{
  assert.throws(()=>fixedWingElectroaerodynamicEnvelope({...opts,powerSystemEfficiency:1.01}),RangeError);
  assert.throws(()=>fixedWingElectroaerodynamicEnvelope({...opts,thrustPerKilowattNewtons:1000}),RangeError);
  assert.throws(()=>fixedWingElectroaerodynamicEnvelope({...opts,massKilograms:0}),RangeError);
  assert.throws(()=>wavelengthFromFrequency({frequencyTerahertz:-1}),RangeError);
});
