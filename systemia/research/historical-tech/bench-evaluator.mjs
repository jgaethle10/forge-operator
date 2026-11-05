// HIST-TECH-001: stage-gated, DC-only laboratory data bookkeeping.
// A generated report never certifies the existence, calibration or validity of a measurement.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { assessPowerBudget } from './power-accounting.mjs';

const conditions = new Set(['aligned', 'misaligned', 'receiver_absent']);
function finite(n, label, zeroOK = true) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || (!zeroOK && n === 0)) {
    throw new RangeError(`${label} must be a finite ${zeroOK ? 'nonnegative' : 'positive'} number`);
  }
  return n;
}
function nonEmpty(s, label) {
  if (typeof s !== 'string' || s.trim().length === 0) throw new TypeError(`${label} must be nonempty text`);
  return s;
}
function mean(values) { return values.reduce((sum, x) => sum + x, 0) / values.length; }

export function evaluateBenchSession(session) {
  if (!session || typeof session !== 'object' || Array.isArray(session)) throw new TypeError('Expected session object');
  const kind = session.dataKind;
  if (!['synthetic', 'measured'].includes(kind)) throw new RangeError('dataKind must be synthetic or measured');
  nonEmpty(session.sessionId, 'sessionId');
  if (session.inputMeasurement !== 'dc_source_voltage_and_current' || session.outputMeasurement !== 'dc_loaded_voltage_and_current') {
    throw new Error('Only DC source and loaded DC output readings are supported; no AC/RF waveform energy calculations');
  }
  if (!Array.isArray(session.trials) || session.trials.length === 0) throw new Error('At least one trial is required');
  if (kind === 'measured') {
    nonEmpty(session.operator, 'operator');
    nonEmpty(session.instrumentTraceability, 'instrumentTraceability');
    if (session.safetyReviewRecorded !== true) throw new Error('Measured data require a recorded safety review');
  }
  const usedIds = new Set();
  const rows = session.trials.map((t, index) => {
    if (!t || typeof t !== 'object') throw new TypeError(`trial ${index} must be an object`);
    const id = nonEmpty(t.trialId, 'trialId');
    if (usedIds.has(id)) throw new Error(`Duplicate trialId: ${id}`);
    usedIds.add(id);
    if (!conditions.has(t.condition)) throw new RangeError(`Unknown condition in ${id}`);
    finite(t.distanceMm, `${id}.distanceMm`);
    finite(t.orientationDegrees, `${id}.orientationDegrees`);
    if (t.orientationDegrees > 180) throw new RangeError('orientationDegrees must be 0..180');
    const input = finite(t.inputVolts, `${id}.inputVolts`, false) * finite(t.inputAmps, `${id}.inputAmps`, false);
    const output = finite(t.outputVolts, `${id}.outputVolts`) * finite(t.outputAmps, `${id}.outputAmps`);
    const duration = finite(t.durationSeconds, `${id}.durationSeconds`, false);
    const inUncertainty = finite(t.inputUncertaintyWatts, `${id}.inputUncertaintyWatts`);
    const outUncertainty = finite(t.outputUncertaintyWatts, `${id}.outputUncertaintyWatts`);
    if (kind === 'measured') {
      nonEmpty(t.rawMeasurementRef, `${id}.rawMeasurementRef`);
      if (inUncertainty === 0 || outUncertainty === 0) throw new Error('Measured trials must have nonzero uncertainty bounds');
    }
    const accounting = assessPowerBudget({inputWatts: input, outputWatts: output,
      durationSeconds: duration, inputUncertaintyWatts: inUncertainty,
      outputUncertaintyWatts: outUncertainty});
    return { trialId: id, condition: t.condition, distanceMm: t.distanceMm,
      orientationDegrees: t.orientationDegrees, inputWatts: input,
      outputWatts: output, outputUncertaintyWatts: outUncertainty, efficiency: accounting.fractionDelivered,
      efficiencyRange: accounting.fractionDeliveredRange,
      classification: accounting.classification };
  });
  const aligned = rows.filter(r => r.condition === 'aligned');
  const misaligned = rows.filter(r => r.condition === 'misaligned');
  const absent = rows.filter(r => r.condition === 'receiver_absent');
  const limitations = [];
  if (aligned.length < 3) limitations.push('Fewer than three aligned repeat trials');
  if (!misaligned.length) limitations.push('No misaligned control');
  if (!absent.length) limitations.push('No receiver-absent control');
  if (absent.some(r => r.outputWatts > r.outputUncertaintyWatts)) {
    limitations.push('Receiver-absent control reports loaded output above measurement uncertainty');
  }
  if (misaligned.length && !misaligned.some(m => aligned.some(a =>
    m.distanceMm === a.distanceMm && Math.abs(m.orientationDegrees - a.orientationDegrees) >= 5))) {
    limitations.push('No geometrically distinct misaligned control at a matching separation');
  }
  if (rows.some(r => r.classification !== 'no_reported_energy_gain')) limitations.push('Apparent anomalous readings require independent investigation');
  return {
    sessionId: session.sessionId, dataKind: kind, totalTrials: rows.length,
    accountingScope: 'DC source input to loaded DC output, not AC waveform or RF coupling efficiency',
    records: rows,
    alignedMeanEfficiency: aligned.length ? mean(aligned.map(r => r.efficiency)) : null,
    experimentalDesignComplete: limitations.length === 0,
    limitations,
    publicationGate: 'Requires independent review of source data, measurement completeness, and instruments; synthetic sessions cannot establish experimental performance.'
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node bench-evaluator.mjs <session.json>');
    const session = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    process.stdout.write(`${JSON.stringify(evaluateBenchSession(session), null, 2)}\n`);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exitCode = 1;
  }
}
