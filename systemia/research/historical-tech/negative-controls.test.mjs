import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateBenchSession} from './bench-evaluator.mjs';
function trial(id, condition, orientationDegrees, outputVolts, outputAmps) {
  return {trialId:id, condition, distanceMm:20, orientationDegrees,
    inputVolts:5, inputAmps:0.5, outputVolts, outputAmps, durationSeconds:30,
    inputUncertaintyWatts:0.10, outputUncertaintyWatts:0.05};
}
function session() {
  return {sessionId:'SYNTHETIC-NEGATIVE-CONTROL-TEST',dataKind:'synthetic',
    inputMeasurement:'dc_source_voltage_and_current',
    outputMeasurement:'dc_loaded_voltage_and_current',
    trials:[
      trial('A1','aligned',0,5,0.15),trial('A2','aligned',0,5,0.15),
      trial('A3','aligned',0,5,0.15),trial('M1','misaligned',90,5,0.03),
      trial('Z1','receiver_absent',0,0,0)
    ]};
}
test('complete synthetic design still passes minimum control checks',()=>{
  const r=evaluateBenchSession(session());
  assert.equal(r.experimentalDesignComplete,true);
  assert.equal(r.dataKind,'synthetic');
});
test('receiver-absent output above uncertainty is flagged as control failure',()=>{
  const s=session();
  s.trials[4].outputVolts=5;
  s.trials[4].outputAmps=0.05;
  const r=evaluateBenchSession(s);
  assert.equal(r.experimentalDesignComplete,false);
  assert.ok(r.limitations.some(x=>x.includes('Receiver-absent control reports')));
});
test('receiver-absent tiny reading within uncertainty does not falsely fail control',()=>{
  const s=session();
  s.trials[4].outputVolts=5;
  s.trials[4].outputAmps=0.005;
  const r=evaluateBenchSession(s);
  assert.equal(r.experimentalDesignComplete,true);
});
test('misalignment control at identical angle is rejected',()=>{
  const s=session();
  s.trials[3].orientationDegrees=0;
  const r=evaluateBenchSession(s);
  assert.equal(r.experimentalDesignComplete,false);
  assert.ok(r.limitations.some(x=>x.includes('geometrically distinct')));
});
test('misalignment control at unmatched separation is not a valid comparison',()=>{
  const s=session();
  s.trials[3].distanceMm=40;
  const r=evaluateBenchSession(s);
  assert.equal(r.experimentalDesignComplete,false);
  assert.ok(r.limitations.some(x=>x.includes('matching separation')));
});
