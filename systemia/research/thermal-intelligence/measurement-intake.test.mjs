import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateMeasurementBatch} from './measurement-intake.mjs';

const evidence = {wallMeter:'documented_unverified', flowMeter:'documented_unverified',
  hotInletSensor:'documented_unverified', hotOutletSensor:'documented_unverified'};
const hour = (hourIndex = 0, changes = {}) => ({
  timestamp:new Date(Date.UTC(2026,10,1,hourIndex)).toISOString().replace('.000Z','Z'),
  wallElectricKWh:0.6, flowKgPerSecond:0.02, fluidCpKJPerKgC:4.18,
  hotInletC:60,hotOutletC:56,sinkRequiredC:48,heatDemandKWhThermal:0.4,
  comparatorCOP:1,electricityUSDPerKWh:0.12,incrementalComputeFraction:0,
  auxElectricKWh:0.02,incrementalRevenueUSD:0,claimedCoolingOffsetUSD:0,
  ...changes
});
const sample = (changes = {}) => ({
  dataStatus:'synthetic',instrumentEvidence:evidence,approachDeltaC:5,
  capexUSD:0,projectLifeYears:5,annualOpexUSD:0,hours:[hour()],
  ...changes
});
const near = (actual,expected) => assert.ok(Math.abs(actual-expected)<1e-10);

test('calorimetry uses mass flow times specific heat times delta temperature',()=>{
  const r=evaluateMeasurementBatch(sample());
  near(r.total.calculatedRecoveredHeatKWh,0.3344);
  near(r.total.usefulHeatKWh,0.3344);
  near(r.total.netUSD,0.3344*0.12-0.02*0.12);
});
test('provenance never claims independent verification or field approval',()=>{
  const r=evaluateMeasurementBatch(sample({dataStatus:'user_supplied_unverified'}));
  assert.equal(r.independentlyVerified,false);
  assert.equal(r.fieldDeploymentApproved,false);
  assert.equal(r.evidenceClass,'USER_SUPPLIED_NOT_INDEPENDENTLY_VERIFIED');
});
test('unknown calibration requires review even on positive economics',()=>{
  const r=evaluateMeasurementBatch(sample({instrumentEvidence:{...evidence,flowMeter:'unknown'}}));
  assert.equal(r.screen,'DATA_REVIEW_REQUIRED');
  assert.deepEqual(r.unknownCalibration,['flowMeter']);
});
test('flow or heat demand zero produces zero useful heat',()=>{
  near(evaluateMeasurementBatch(sample({hours:[hour(0,{flowKgPerSecond:0})]})).total.usefulHeatKWh,0);
  near(evaluateMeasurementBatch(sample({hours:[hour(0,{heatDemandKWhThermal:0})]})).total.usefulHeatKWh,0);
});
test('a short duration heat demand caps useful heat',()=>{
  const r=evaluateMeasurementBatch(sample({hours:[hour(0,{heatDemandKWhThermal:0.1})]}));
  near(r.total.usefulHeatKWh,0.1);
  near(r.total.rejectedHeatKWh,0.2344);
});
test('hot outlet below required temperature plus approach yields no credit',()=>{
  const r=evaluateMeasurementBatch(sample({hours:[hour(0,{sinkRequiredC:53})]}));
  near(r.total.usefulHeatKWh,0);
  assert.ok(r.observations[0].flags.includes('TEMPERATURE_INCOMPATIBLE'));
});
test('energy balance outlier is not credited, requiring human review',()=>{
  const r=evaluateMeasurementBatch(sample({hours:[hour(0,{flowKgPerSecond:0.1})]}));
  near(r.total.calculatedRecoveredHeatKWh,1.672);
  near(r.total.usefulHeatKWh,0);
  assert.ok(r.reviewFlags.includes('ENERGY_BALANCE_REVIEW'));
  assert.equal(r.screen,'DATA_REVIEW_REQUIRED');
});
test('reverse hot-loop delta never becomes useful heat',()=>{
  const r=evaluateMeasurementBatch(sample({hours:[hour(0,{hotInletC:56,hotOutletC:60})]}));
  near(r.total.usefulHeatKWh,0);
  assert.ok(r.reviewFlags.includes('REVERSED_HOT_LOOP_TEMPERATURE'));
});
test('heat-pump counterfactual and incremental computer energy counted',()=>{
  const r=evaluateMeasurementBatch(sample({hours:[hour(0,{comparatorCOP:3,incrementalComputeFraction:1})]}));
  near(r.total.avoidedHeatingElectricKWh,0.3344/3);
  near(r.total.incrementalElectricKWh,0.62);
  near(r.total.netUSD,0.3344/3*0.12-0.62*0.12);
});
test('capital and operating allocations are additive costs',()=>{
  const r=evaluateMeasurementBatch(sample({capexUSD:8760,projectLifeYears:1,annualOpexUSD:8760}));
  near(r.total.allocatedCostsUSD,2);
});
test('reject missing / repeated / out-of-order time intervals',()=>{
  assert.throws(()=>evaluateMeasurementBatch(sample({hours:[hour(0),hour(2)]})),RangeError);
  assert.throws(()=>evaluateMeasurementBatch(sample({hours:[hour(0),hour(0)]})),RangeError);
  assert.throws(()=>evaluateMeasurementBatch(sample({hours:[hour(2),hour(1)]})),RangeError);
});
test('reject nonsensical values and false verified status',()=>{
  assert.throws(()=>evaluateMeasurementBatch(sample({dataStatus:'verified'})),TypeError);
  assert.throws(()=>evaluateMeasurementBatch(sample({hours:[hour(0,{wallElectricKWh:-1})]})),RangeError);
  assert.throws(()=>evaluateMeasurementBatch(sample({hours:[hour(0,{fluidCpKJPerKgC:0})]})),RangeError);
  assert.throws(()=>evaluateMeasurementBatch(sample({hours:[hour(0,{comparatorCOP:0})]})),RangeError);
  assert.throws(()=>evaluateMeasurementBatch(sample({hours:[hour(0,{flowKgPerSecond:NaN})]})),RangeError);
  assert.throws(()=>evaluateMeasurementBatch(sample({hours:[hour(0,{timestamp:'2026-11-01T00:00:00-08:00'})]})),TypeError);
});
test('all supplied hours aggregate while preserving distinct review flags',()=>{
  const r=evaluateMeasurementBatch(sample({hours:[hour(0),hour(1,{heatDemandKWhThermal:0}),hour(2)]}));
  near(r.total.usefulHeatKWh,0.6688);
  assert.equal(r.observationCount,3);
  assert.ok(r.observations[1].flags.includes('NO_COINCIDENT_DEMAND'));
});
