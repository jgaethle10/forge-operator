/** FIRST-CONTACT-001 | desk-only engineering benchmarks; not a UAP reconstruction. */
export const LIGHT_SPEED_METERS_PER_SECOND = 299_792_458;
export const STANDARD_GRAVITY = 9.80665;

function positive(name, value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(name+' must be a finite positive number');
  }
  return value;
}
function nonnegative(name, value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new RangeError(name+' must be a finite nonnegative number');
  }
  return value;
}

/** Free-space wavelength. Material-guided wavelength requires measured dispersion. */
export function wavelengthFromFrequency({frequencyTerahertz}) {
  const frequencyHz = positive('frequencyTerahertz',frequencyTerahertz)*1e12;
  return {
    frequencyTerahertz,
    freeSpaceWavelengthMeters: LIGHT_SPEED_METERS_PER_SECOND/frequencyHz,
    freeSpaceWavelengthMicrometers: LIGHT_SPEED_METERS_PER_SECOND/frequencyHz*1e6,
    limitation: 'Free-space relation only. Waveguide transmission requires measured complex permittivity, boundary conditions, loss and microstructure.'
  };
}

/** Hypothetical fixed-wing steady-flight scenario; not hover, not a device prediction.
 * A fixed assumed thrust-to-electrical-input-power ratio is NOT scale invariant.
 */
export function fixedWingElectroaerodynamicEnvelope({
  massKilograms,
  liftToDragRatio,
  speedMetersPerSecond,
  thrustPerKilowattNewtons,
  electricalEnergyWattHours,
  powerSystemEfficiency=1
}) {
  const mass = positive('massKilograms',massKilograms);
  const glideRatio = positive('liftToDragRatio',liftToDragRatio);
  const speed = positive('speedMetersPerSecond',speedMetersPerSecond);
  const thrustPerKw = positive('thrustPerKilowattNewtons',thrustPerKilowattNewtons);
  const energyWh = nonnegative('electricalEnergyWattHours',electricalEnergyWattHours);
  const efficiency = positive('powerSystemEfficiency',powerSystemEfficiency);
  if(efficiency>1) throw new RangeError('powerSystemEfficiency must not exceed 1');

  const weightNewtons = mass*STANDARD_GRAVITY;
  const dragNewtons = weightNewtons/glideRatio;
  const idealThrustElectricalWatts = dragNewtons/thrustPerKw*1000;
  const batteryElectricalWatts = idealThrustElectricalWatts/efficiency;
  const propulsiveEfficiencyFraction = dragNewtons*speed/idealThrustElectricalWatts;
  if(propulsiveEfficiencyFraction>1+1e-12) {
    throw new RangeError('Assumed thrust-to-power ratio and airspeed imply >100% propulsive efficiency; inconsistent scenario');
  }
  const enduranceSeconds = energyWh*3600/batteryElectricalWatts;
  return {
    scenario: 'hypothetical_constant_thrust_to_power_fixed_wing_cruise',
    weightNewtons,
    steadyLiftNewtons:weightNewtons,
    dragAndRequiredThrustNewtons:dragNewtons,
    thrustElectricalInputWatts:idealThrustElectricalWatts,
    requiredBatteryPowerWatts:batteryElectricalWatts,
    idealPropulsiveEfficiencyFraction:propulsiveEfficiencyFraction,
    idealBatteryLimitedEnduranceSeconds:enduranceSeconds,
    idealStillAirDistanceMeters:enduranceSeconds*speed,
    assumptions: [
      'Steady level fixed-wing flight only; cannot describe hover or vertical acceleration',
      'Input lift-to-drag ratio, speed and thrust per kilowatt assumed constant and achievable simultaneously',
      'Electrical power ratio applies to thruster input, converter efficiency applied separately',
      'No takeoff, landing, gusts, reserve, battery mass variation, temperature, aging or safety margin',
      'Distance is still-air ideal; not a certified range or actual performance prediction'
    ]
  };
}

if (process.argv[1]?.endsWith('/engineering-feasibility.mjs')) {
  console.log(JSON.stringify({
    sourceOfNumbers: 'Illustrative inputs, not measurements of MIT test aircraft or any UAP',
    material: wavelengthFromFrequency({frequencyTerahertz:1}),
    flight: fixedWingElectroaerodynamicEnvelope({
      massKilograms:2.5,liftToDragRatio:10,speedMetersPerSecond:5,
      thrustPerKilowattNewtons:5,electricalEnergyWattHours:40,powerSystemEfficiency:0.85
    })
  },null,2));
}
