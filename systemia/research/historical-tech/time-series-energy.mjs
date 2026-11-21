/**
 * HIST-TECH-001 | synchronized time-series DC energy ledger.
 *
 * Numerically integrates instantaneous power P(t) = V(t) I(t) using the
 * trapezoidal rule. It does NOT measure power, authenticate instruments,
 * estimate bandwidth/aliasing, establish uncertainty coverage, or approve a
 * scientific claim. Synthetic examples are never physical observations.
 */
const MAX_SAMPLES = 10000;
const MAX_SOURCES = 32;

function finite(value, name, allowZero = true) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (!allowZero && value === 0)) {
    throw new RangeError(name + ' must be finite and ' + (allowZero ? 'nonnegative' : 'positive'));
  }
  return value;
}
function nonEmpty(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(name + ' must be nonempty text');
  return value;
}
function validateSeries(channel, label, maxGapSeconds, referenceTimes, measured = false) {
  if (!channel || typeof channel !== 'object' || Array.isArray(channel)) throw new TypeError(label + ' must be an object');
  const id = nonEmpty(channel.id, label + '.id');
  const s = channel.samples;
  if (!Array.isArray(s) || s.length < 3 || s.length > MAX_SAMPLES) throw new RangeError(label + ' requires 3..10000 samples');
  const times = [];
  const powers = [];
  const bounds = [];
  for (let i = 0; i < s.length; i++) {
    const point = s[i];
    if (!point || typeof point !== 'object') throw new TypeError(label + '.samples[' + i + '] must be an object');
    const t = finite(point.tSeconds, label + '.tSeconds');
    const voltage = finite(point.voltageVolts, label + '.voltageVolts');
    const current = finite(point.currentAmps, label + '.currentAmps');
    const bound = finite(point.absolutePowerBoundWatts, label + '.absolutePowerBoundWatts');
    if (measured && bound === 0) throw new RangeError(label + ' measured sample cannot claim zero power uncertainty');
    if (i === 0 && t !== 0) throw new RangeError(label + ' must begin at t=0');
    if (i > 0) {
      const gap = t - times[i-1];
      if (!(gap > 0) || gap > maxGapSeconds) throw new RangeError(label + ' contains nonincreasing timestamps or excessive sampling gap');
    }
    if (referenceTimes && (i >= referenceTimes.length || t !== referenceTimes[i])) {
      throw new Error('All input/output channels must have exactly synchronized timestamps');
    }
    times.push(t);
    powers.push(voltage * current);
    bounds.push(bound);
    if (!Number.isFinite(powers[i])) throw new RangeError(label + ' V*I overflowed');
  }
  if (referenceTimes && s.length !== referenceTimes.length) throw new Error('All channels require the same sample count');
  let energy = 0, boundEnergy = 0;
  for (let i = 1; i < s.length; i++) {
    const duration = times[i] - times[i-1];
    energy += 0.5 * (powers[i-1] + powers[i]) * duration;
    boundEnergy += 0.5 * (bounds[i-1] + bounds[i]) * duration;
  }
  if (!Number.isFinite(energy) || !Number.isFinite(boundEnergy)) {
    throw new RangeError(label + ' energy overflowed');
  }
  return {id, energyJoules:energy, absoluteEnergyBoundJoules:boundEnergy, times};
}

export function analyzeTimeSeriesEnergy(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new TypeError('Expected a record');
  const {dataKind, inputSources, loadedOutput} = record;
  if (!['synthetic','measured'].includes(dataKind)) throw new Error('dataKind must be synthetic or measured');
  if (record.timebase !== 'synchronized_steady_dc_samples') {
    throw new Error('Only simultaneously sampled, slowly varying DC channels are supported, not AC/RF or unsynchronized instruments');
  }
  if (record.sourceInventoryAttested !== true || record.synchronizedSamplingAttested !== true) {
    throw new Error('Source inventory and timebase synchronization must be explicitly attested');
  }
  nonEmpty(record.sourceInventoryNote,'sourceInventoryNote');
  if (dataKind === 'measured') {
    nonEmpty(record.rawSourceReference,'rawSourceReference');
    nonEmpty(record.operator,'operator');
  }
  const maxGap = finite(record.maxGapSeconds,'maxGapSeconds',false);
  if (!Array.isArray(inputSources) || inputSources.length < 1 || inputSources.length > MAX_SOURCES) {
    throw new RangeError('Must enumerate 1..32 DC input energy sources');
  }
  const first = validateSeries(inputSources[0], 'inputSources[0]', maxGap, undefined, dataKind === 'measured');
  const sourceResults = [first];
  const ids = new Set([first.id]);
  for (let index=1; index<inputSources.length; index++) {
    const source = validateSeries(inputSources[index], 'inputSources['+index+']',maxGap,first.times,dataKind === 'measured');
    if (ids.has(source.id)) throw new Error('Duplicate input source ID: '+source.id);
    ids.add(source.id);
    sourceResults.push(source);
  }
  const load = validateSeries(loadedOutput, 'loadedOutput', maxGap, first.times, dataKind === 'measured');
  if (ids.has(load.id)) throw new Error('Loaded-output ID overlaps an input source');
  const inputEnergy = sourceResults.reduce((total,item)=>total+item.energyJoules,0);
  const inputBound = sourceResults.reduce((total,item)=>total+item.absoluteEnergyBoundJoules,0);
  const lowerInput = inputEnergy-inputBound;
  const outputEnergy = load.energyJoules;
  const outputBound = load.absoluteEnergyBoundJoules;
  if (!(lowerInput > 0) || !Number.isFinite(inputEnergy) || !Number.isFinite(inputBound)) {
    throw new RangeError('Total input uncertainty leaves no positive energy lower bound');
  }
  const efficiency = outputEnergy/inputEnergy;
  const low = Math.max(0,outputEnergy-outputBound)/(inputEnergy+inputBound);
  const high = (outputEnergy+outputBound)/lowerInput;
  if (![efficiency,low,high].every(Number.isFinite)) throw new RangeError('Invalid derived energy ratio');
  const classification = low>1 ? 'apparent_anomaly_requires_independent_investigation'
    : efficiency>1 ? 'apparent_gain_within_declared_bounds'
    : 'no_reported_energy_gain';
  return {
    dataKind,
    evidenceStatus:dataKind==='synthetic'?'synthetic_fixture_only':'self_declared_measurement_not_authenticated',
    algorithm:'trapezoidal_integral_of_synchronized_samplewise_DC_voltage_times_current',
    durationSeconds:first.times.at(-1),
    sampleCount:first.times.length,
    enumeratedInputSourceCount:sourceResults.length,
    perInputSource:sourceResults.map(({id,energyJoules,absoluteEnergyBoundJoules})=>({id,energyJoules,absoluteEnergyBoundJoules})),
    totalInputEnergyJoules:inputEnergy,
    loadedOutputEnergyJoules:outputEnergy,
    inputAbsoluteEnergyBoundJoules:inputBound,
    outputAbsoluteEnergyBoundJoules:outputBound,
    apparentEnergyRatio:efficiency,
    apparentEnergyRatioBound:[low,high],
    classification,
    independentlyVerifiedInputInventory:false,
    independentlyVerifiedTimebase:false,
    independentlyVerifiedCalibration:false,
    publicationAllowed:false,
    scientificClaimAuthorized:false,
    limitations:'Assumes samplewise simultaneous DC V and I, piecewise-linear power between samples, and truthful source inventory. Trapezoidal integration cannot resolve missed transients, AC/RF ripple, timing skew, meter bandwidth, or stored energy. Absolute bounds are not GUM standard uncertainties or confidence intervals.'
  };
}
