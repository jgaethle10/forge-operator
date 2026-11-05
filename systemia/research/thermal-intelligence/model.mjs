/**
 * THERMAL-INTELLIGENCE-001: desk-only energy and marginal economics model.
 * All values are supplied assumptions, not measurements or projections.
 * No hardware controls, network access, mining, or live workload dispatch.
 */
export function evaluate(input = {}) {
  const a = {
    powerWatts: 600,
    hoursPerDay: 12,
    utilization: 1,
    captureEfficiency: 0.75,
    deliveryEfficiency: 0.80,
    heatDemandKWhPerDay: 5,
    baselineHeatingCOP: 1,
    electricityUSDPerKWh: 0.12,
    incrementalComputeFraction: 1,
    parasiticKWhPerDay: 0.18,
    incrementalComputeRevenueUSDPerDay: 0,
    verifiedAvoidedCoolingUSDPerDay: 0,
    capexUSD: 0,
    projectLifeYears: 5,
    annualOpexUSD: 0,
    ...input,
  };
  const nonnegative = [
    'powerWatts', 'hoursPerDay', 'heatDemandKWhPerDay',
    'electricityUSDPerKWh', 'parasiticKWhPerDay',
    'incrementalComputeRevenueUSDPerDay', 'verifiedAvoidedCoolingUSDPerDay',
    'capexUSD', 'annualOpexUSD',
  ];
  for (const key of nonnegative) {
    if (!Number.isFinite(a[key]) || a[key] < 0) throw new RangeError(`${key} must be a finite nonnegative number`);
  }
  for (const key of ['utilization', 'captureEfficiency', 'deliveryEfficiency', 'incrementalComputeFraction']) {
    if (!Number.isFinite(a[key]) || a[key] < 0 || a[key] > 1) throw new RangeError(`${key} must be between 0 and 1`);
  }
  if (a.hoursPerDay > 24) throw new RangeError('hoursPerDay cannot exceed 24');
  if (!Number.isFinite(a.baselineHeatingCOP) || a.baselineHeatingCOP < 1) throw new RangeError('baselineHeatingCOP must be >= 1');
  if (!Number.isFinite(a.projectLifeYears) || a.projectLifeYears <= 0) throw new RangeError('projectLifeYears must be > 0');

  const itElectricityKWhPerDay = a.powerWatts / 1000 * a.hoursPerDay * a.utilization;
  const capturedHeatKWhPerDay = itElectricityKWhPerDay * a.captureEfficiency;
  const deliveredHeatKWhPerDay = capturedHeatKWhPerDay * a.deliveryEfficiency;
  const usefulHeatKWhPerDay = Math.min(deliveredHeatKWhPerDay, a.heatDemandKWhPerDay);
  const avoidedHeatingElectricityKWhPerDay = usefulHeatKWhPerDay / a.baselineHeatingCOP;
  const heatingValueUSDPerDay = avoidedHeatingElectricityKWhPerDay * a.electricityUSDPerKWh;
  const addedElectricityKWhPerDay = itElectricityKWhPerDay * a.incrementalComputeFraction + a.parasiticKWhPerDay;
  const addedElectricityCostUSDPerDay = addedElectricityKWhPerDay * a.electricityUSDPerKWh;
  const capexDailyUSD = a.capexUSD / (a.projectLifeYears * 365);
  const opexDailyUSD = a.annualOpexUSD / 365;
  const netUSDPerDay = heatingValueUSDPerDay + a.incrementalComputeRevenueUSDPerDay
    + a.verifiedAvoidedCoolingUSDPerDay - addedElectricityCostUSDPerDay - capexDailyUSD - opexDailyUSD;

  return {
    evidenceClass: 'illustrative_assumptions_only',
    inputs: a,
    itElectricityKWhPerDay,
    capturedHeatKWhPerDay,
    deliveredHeatKWhPerDay,
    usefulHeatKWhPerDay,
    avoidedHeatingElectricityKWhPerDay,
    heatingValueUSDPerDay,
    addedElectricityKWhPerDay,
    addedElectricityCostUSDPerDay,
    capexDailyUSD,
    opexDailyUSD,
    netUSDPerDay,
    annualizedNetUSD: netUSDPerDay * 365,
    warnings: [
      'Heat demand, temperature compatibility, cooling offset and all performance inputs require site measurement.',
      'Use incremental compute costs and revenue relative to the same no-project baseline; never double count existing workloads.',
      'No water heater modifications or live computer thermal changes are authorized by this model.',
    ],
  };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  process.stdout.write(JSON.stringify(evaluate(), null, 2) + '\n');
}
