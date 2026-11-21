/**
 * THERMAL-INTELLIGENCE-001: offline calorimetry intake.
 * User data remain unverified. No sensors, hardware, or runtime mutation.
 */
export function evaluateMeasurementBatch(p) {
  const bounded = (v, label, min = 0, max = Infinity) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max)
      throw new RangeError(`${label} must be finite in [${min}, ${max}]`);
    return v;
  };
  if (!p || typeof p !== 'object' || !['synthetic', 'user_supplied_unverified'].includes(p.dataStatus))
    throw new TypeError('Explicit synthetic or user_supplied_unverified dataStatus required');
  if (!Array.isArray(p.hours) || p.hours.length < 1 || p.hours.length > 8784)
    throw new RangeError('Supply between 1 and 8784 hourly observations');
  for (const key of ['wallMeter', 'flowMeter', 'hotInletSensor', 'hotOutletSensor']) {
    if (!p.instrumentEvidence || !['documented_unverified', 'unknown'].includes(p.instrumentEvidence[key]))
      throw new TypeError('Instrument calibration evidence must be documented_unverified or unknown: ' + key);
  }
  const approachC = bounded(p.approachDeltaC, 'approachDeltaC', 0, 30);
  const capex = bounded(p.capexUSD, 'capexUSD');
  const annualOpex = bounded(p.annualOpexUSD, 'annualOpexUSD');
  const assetYears = bounded(p.projectLifeYears, 'projectLifeYears', 0.01, 100);
  const sums = {
    computeKWh: 0, calculatedRecoveredHeatKWh: 0, usefulHeatKWh: 0,
    rejectedHeatKWh: 0, avoidedHeatingElectricKWh: 0,
    heatValueUSD: 0, incrementalElectricKWh: 0, incrementalElectricUSD: 0,
    incrementalRevenueUSD: 0, claimedCoolingOffsetUSD: 0, allocatedCostsUSD: 0,
    netUSD: 0,
  };
  const observations = [];
  const hourMs = 3600000;
  let prev = null;
  for (const [i, h] of p.hours.entries()) {
    if (!h || typeof h !== 'object') throw new TypeError(`hours[${i}] must be an object`);
    const stamp = h.timestamp;
    const ms = Date.parse(stamp);
    if (typeof stamp !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:00:00Z$/.test(stamp) ||
        !Number.isFinite(ms) || new Date(ms).toISOString().replace('.000Z', 'Z') !== stamp)
      throw new TypeError(`hours[${i}] requires exact UTC whole-hour timestamp`);
    if (prev !== null && ms !== prev + hourMs)
      throw new RangeError('Missing, repeated, or out-of-order hours');
    prev = ms;

    const wall = bounded(h.wallElectricKWh, `hours[${i}].wallElectricKWh`);
    const flow = bounded(h.flowKgPerSecond, `hours[${i}].flowKgPerSecond`, 0, 100);
    const heatCapacity = bounded(h.fluidCpKJPerKgC, `hours[${i}].fluidCpKJPerKgC`, 0.1, 10);
    const inlet = bounded(h.hotInletC, `hours[${i}].hotInletC`, -50, 150);
    const outlet = bounded(h.hotOutletC, `hours[${i}].hotOutletC`, -50, 150);
    const required = bounded(h.sinkRequiredC, `hours[${i}].sinkRequiredC`, -50, 150);
    const demand = bounded(h.heatDemandKWhThermal, `hours[${i}].heatDemandKWhThermal`);
    const cop = bounded(h.comparatorCOP, `hours[${i}].comparatorCOP`, 1, 15);
    const tariff = bounded(h.electricityUSDPerKWh, `hours[${i}].electricityUSDPerKWh`, 0, 20);
    const fraction = bounded(h.incrementalComputeFraction, `hours[${i}].incrementalComputeFraction`, 0, 1);
    const aux = bounded(h.auxElectricKWh, `hours[${i}].auxElectricKWh`);
    const revenue = bounded(h.incrementalRevenueUSD, `hours[${i}].incrementalRevenueUSD`);
    const cooling = bounded(h.claimedCoolingOffsetUSD, `hours[${i}].claimedCoolingOffsetUSD`);

    // kg/s * kJ/(kg*K) * K = kW; one hourly interval produces kWh.
    // Cp must match the actual fluid, temperature and concentration.
    const deltaC = inlet - outlet;
    const rawHeat = flow * heatCapacity * Math.max(0, deltaC);
    const flags = [];
    if (deltaC < 0) flags.push('REVERSED_HOT_LOOP_TEMPERATURE');
    if (rawHeat > wall * 1.05 + 0.01) flags.push('ENERGY_BALANCE_REVIEW');
    // Conservative: even the hot-side exit temperature must exceed destination threshold.
    const temperatureCompatible = outlet >= required + approachC;
    if (!temperatureCompatible) flags.push('TEMPERATURE_INCOMPATIBLE');
    if (demand === 0) flags.push('NO_COINCIDENT_DEMAND');
    const disqualified = flags.includes('REVERSED_HOT_LOOP_TEMPERATURE') ||
      flags.includes('ENERGY_BALANCE_REVIEW') || !temperatureCompatible;
    const useful = disqualified ? 0 : Math.min(rawHeat, demand);
    const rejected = Math.max(0, rawHeat - useful);
    const avoidedElectric = useful / cop;
    const heatValue = avoidedElectric * tariff;
    const additionalElectric = wall * fraction + aux;
    const additionalCost = additionalElectric * tariff;
    const fixedCosts = annualOpex / 8760 + capex / (assetYears * 8760);
    const net = heatValue + revenue + cooling - additionalCost - fixedCosts;
    const additions = {
      computeKWh: wall, calculatedRecoveredHeatKWh: rawHeat,
      usefulHeatKWh: useful, rejectedHeatKWh: rejected,
      avoidedHeatingElectricKWh: avoidedElectric, heatValueUSD: heatValue,
      incrementalElectricKWh: additionalElectric, incrementalElectricUSD: additionalCost,
      incrementalRevenueUSD: revenue, claimedCoolingOffsetUSD: cooling,
      allocatedCostsUSD: fixedCosts, netUSD: net,
    };
    for (const [key, val] of Object.entries(additions)) sums[key] += val;
    observations.push({
      timestamp: stamp, temperatureCompatible, deltaC,
      calculatedRecoveredHeatKWh: rawHeat, usefulHeatKWh: useful,
      rejectedHeatKWh: rejected, flags,
    });
  }

  const unknownCalibration = Object.entries(p.instrumentEvidence)
    .filter(([key, value]) => ['wallMeter','flowMeter','hotInletSensor','hotOutletSensor'].includes(key) && value === 'unknown')
    .map(([key]) => key);
  const reviewFlags = observations.flatMap((item) =>
    item.flags.filter((v) => v === 'ENERGY_BALANCE_REVIEW' || v === 'REVERSED_HOT_LOOP_TEMPERATURE'));
  return {
    evidenceClass: p.dataStatus === 'synthetic' ? 'SYNTHETIC_CALORIMETRY' : 'USER_SUPPLIED_NOT_INDEPENDENTLY_VERIFIED',
    independentlyVerified: false,
    fieldDeploymentApproved: false,
    observationCount: observations.length,
    total: sums,
    unknownCalibration,
    reviewFlags,
    screen: reviewFlags.length || unknownCalibration.length ? 'DATA_REVIEW_REQUIRED' :
      sums.netUSD > 0 ? 'POSITIVE_UNVERIFIED_SCREEN' : 'NONPOSITIVE_UNVERIFIED_SCREEN',
    observations,
    warnings: [
      'Inputs and claimed calibration statuses have not been independently verified.',
      'Single-hour inlet/outlet and flow averages approximate energy transfer; real heat metering must address fluid properties, transients, uncertainty and time alignment.',
      'Positive economics do not prove savings or justify a project. Include actual seasonality, demand charges and quotes.',
      'No polling, workload increases, cooling-control changes or field deployment authorized.',
    ],
  };
}
