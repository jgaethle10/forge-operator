import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBenchSession } from './bench-evaluator.mjs';

function trial(trialId, condition, outputAmps = 0.15) {
  return {trialId, condition, distanceMm: 20, orientationDegrees: condition === 'misaligned' ? 90 : 0,
    inputVolts: 5, inputAmps: 0.5, outputVolts: condition === 'receiver_absent' ? 0 : 5,
    outputAmps: condition === 'receiver_absent' ? 0 : outputAmps,
    durationSeconds: 30, inputUncertaintyWatts: 0.1, outputUncertaintyWatts: 0.05};
}
function session() {
  return { sessionId:'HYPOTHETICAL-01', dataKind: 'synthetic', inputMeasurement:'dc_source_voltage_and_current',
    outputMeasurement:'dc_loaded_voltage_and_current',
    trials:[trial('A1','aligned'), trial('A2','aligned'), trial('A3','aligned'),
      trial('M1','misaligned',0.03), trial('Z1','receiver_absent')]};
}

test('synthetic control-complete example is descriptive, not certified', () => {
  const v = evaluateBenchSession(session());
  assert.equal(v.totalTrials, 5);
  assert.equal(v.experimentalDesignComplete, true);
  assert.equal(v.alignedMeanEfficiency, 0.3);
  assert.equal(v.dataKind, 'synthetic');
  assert.match(v.publicationGate, /synthetic sessions cannot establish/);
});

test('missing control is flagged rather than invented', () => {
  const s = session(); s.trials = s.trials.filter(t => t.condition !== 'receiver_absent');
  assert.equal(evaluateBenchSession(s).experimentalDesignComplete, false);
  assert.ok(evaluateBenchSession(s).limitations.some(x=>x.includes('receiver-absent')));
});

test('reject AC inputs which cannot be accurately estimated by DC V * I', () => {
  const s = session(); s.inputMeasurement='ac_rms_voltage_and_current';
  assert.throws(()=>evaluateBenchSession(s), /Only DC/);
});

test('reject apparent measured provenance without evidence or review', () => {
  const s = session(); s.dataKind='measured';
  assert.throws(()=>evaluateBenchSession(s), /operator/);
  s.operator='A'; s.instrumentTraceability='calibrated meter reference';
  assert.throws(()=>evaluateBenchSession(s), /safety review/);
  s.safetyReviewRecorded=true;
  assert.throws(()=>evaluateBenchSession(s), /rawMeasurementRef/);
});

test('reject duplicate IDs, invalid geometry and missing uncertainties', () => {
  const s = session(); s.trials[1].trialId='A1';
  assert.throws(()=>evaluateBenchSession(s), /Duplicate/);
  const z = session(); z.trials[0].orientationDegrees=220;
  assert.throws(()=>evaluateBenchSession(z), /orientationDegrees/);
  const x = session(); delete x.trials[0].inputUncertaintyWatts;
  assert.throws(()=>evaluateBenchSession(x), /finite/);
});

test('all readings flagged >100 percent are not asserted as new physics', () => {
  const s = session(); s.trials[0].outputAmps=0.8;
  const r = evaluateBenchSession(s);
  assert.equal(r.experimentalDesignComplete,false);
  assert.ok(r.limitations.some(x => x.includes('anomalous')));
});
