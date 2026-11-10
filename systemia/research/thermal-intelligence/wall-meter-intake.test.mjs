import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeWallMeter} from './wall-meter-intake.mjs';

const reading=(h,wh)=>({timestamp:new Date(Date.UTC(2026,10,1,h)).toISOString().replace('.000Z','Z'),cumulativeWh:wh});
const profile=(overrides={})=>({
  dataStatus:'synthetic',reportingBoundary:'whole_compute_system_at_wall',
  sampleUnit:'cumulative_Wh',instrumentEvidence:'documented_unverified',
  expectedMaxWallWatts:1000,
  readings:[reading(0,10000),reading(1,10500),reading(2,11050)],...overrides
});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10);

test('Converts cumulative Wh boundaries to hourly kWh intervals',()=>{
 const r=normalizeWallMeter(profile());
 assert.equal(r.intervalCount,2);
 near(r.totalWallElectricityKWh,1.05);
 near(r.rows[0].wallElectricKWh,.5);
 near(r.rows[1].wallElectricKWh,.55);
 assert.equal(r.rows[0].timestamp,'2026-11-01T00:00:00Z');
 assert.equal(r.rows[0].intervalEndUTC,'2026-11-01T01:00:00Z');
});
test('Never claims independently verified electrical or recovered heat',()=>{
 const r=normalizeWallMeter(profile({dataStatus:'user_supplied_unverified'}));
 assert.equal(r.independentlyVerified,false);
 assert.equal(r.thermalRecoveryVerified,false);
 assert.equal(r.fieldDeploymentApproved,false);
 assert.equal(r.evidenceClass,'USER_SUPPLIED_WALL_METER_UNVERIFIED');
});
test('Unknown calibration forces data review',()=>{
 const r=normalizeWallMeter(profile({instrumentEvidence:'unknown'}));
 assert.equal(r.qualityReviewRequired,true);
 assert.equal(r.meterCalibrationUnknown,true);
});
test('Unusually high power interval flags review, not an energy saving claim',()=>{
 const r=normalizeWallMeter(profile({expectedMaxWallWatts:480}));
 assert.equal(r.qualityReviewRequired,true);
 assert.equal(r.flags.length,1);
 assert.equal(r.flags[0].flag,'POWER_ENVELOPE_REVIEW');
});
test('Zero consumption and no max power bound are valid',()=>{
 const r=normalizeWallMeter(profile({expectedMaxWallWatts:undefined,readings:[reading(0,0),reading(1,0)]}));
 near(r.totalWallElectricityKWh,0);
 assert.equal(r.flags.length,0);
});
test('Rejects counter rollover, reset, gaps and repeated hour',()=>{
 assert.throws(()=>normalizeWallMeter(profile({readings:[reading(0,100),reading(1,50)]})),RangeError);
 assert.throws(()=>normalizeWallMeter(profile({readings:[reading(0,100),reading(2,200)]})),RangeError);
 assert.throws(()=>normalizeWallMeter(profile({readings:[reading(0,100),reading(0,200)]})),RangeError);
});
test('Rejects timezone offsets, nonexistent dates, fractions and negative energy',()=>{
 assert.throws(()=>normalizeWallMeter(profile({readings:[reading(0,100),{timestamp:'2026-11-01T01:00:00-08:00',cumulativeWh:200}]})),TypeError);
 assert.throws(()=>normalizeWallMeter(profile({readings:[reading(0,100),{timestamp:'2026-11-32T01:00:00Z',cumulativeWh:200}]})),TypeError);
 assert.throws(()=>normalizeWallMeter(profile({readings:[reading(0,100),reading(1,-1)]})),RangeError);
 assert.throws(()=>normalizeWallMeter(profile({readings:[reading(0,100),reading(1,Infinity)]})),RangeError);
});
test('Rejects host TDP substituted for wall energy and false verification',()=>{
 assert.throws(()=>normalizeWallMeter(profile({reportingBoundary:'cpu_tdp'})),TypeError);
 assert.throws(()=>normalizeWallMeter(profile({dataStatus:'verified'})),TypeError);
 assert.throws(()=>normalizeWallMeter(profile({sampleUnit:'kWh'})),TypeError);
});
test('Rejects missing meter evidence or invalid limits',()=>{
 assert.throws(()=>normalizeWallMeter(profile({instrumentEvidence:'verified'})),TypeError);
 assert.throws(()=>normalizeWallMeter(profile({expectedMaxWallWatts:-1})),RangeError);
 assert.throws(()=>normalizeWallMeter(profile({readings:[reading(0,100)]})),RangeError);
});
