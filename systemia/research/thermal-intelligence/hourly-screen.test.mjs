import test from 'node:test';
import assert from 'node:assert/strict';
import {screenHourlyProfile} from './hourly-screen.mjs';

const stamp = h => new Date(Date.UTC(2026, 10, 1, h)).toISOString().replace('.000Z', 'Z');
const row = (h, rest = {}) => ({
  timestamp: stamp(h), itElectricityKWh: 0.6, heatDemandKWhThermal: 0.6,
  sourceOutletC: 60, sinkRequiredC: 45, comparatorCOP: 1,
  electricityUSDPerKWh: 0.12, incrementalComputeFraction: 0,
  auxiliaryElectricityKWh: 0.02, incrementalComputeRevenueUSD: 0,
  avoidedCoolingUSD: 0, ...rest,
});
const base = {dataStatus:'synthetic', captureEfficiency:0.75, deliveryEfficiency:0.8,
  approachDeltaC:5, capexUSD:0, projectLifeYears:5, annualOpexUSD:0};
const check = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test('usable heat and incremental net from existing compute', () => {
  const r = screenHourlyProfile({...base, hours:[row(0)]});
  check(r.totals.usableHeatKWh, 0.36);
  check(r.totals.netAfterCapexUSD, 0.0408);
  assert.equal(r.fieldDeploymentApproved, false);
  assert.equal(r.evidenceClass, 'UNVERIFIED_DESK_SCREEN');
});
test('temperature gap prevents direct heat credit', () => {
  const r = screenHourlyProfile({...base, hours:[row(0,{sourceOutletC:49})]});
  check(r.totals.usableHeatKWh, 0);
  check(r.totals.unusableHeatKWh, 0.36);
  assert.equal(r.hourly[0].compatible, false);
});
test('coincident heat demand caps useful heat', () => {
  const r = screenHourlyProfile({...base, hours:[row(0,{heatDemandKWhThermal:0.1})]});
  check(r.totals.usableHeatKWh, 0.1);
  check(r.totals.unusableHeatKWh, 0.26);
});
test('heat pump comparator plus new computing captures incremental energy cost', () => {
  const r = screenHourlyProfile({...base,hours:[row(0,{incrementalComputeFraction:1,comparatorCOP:3})]});
  check(r.totals.avoidedHeatingElectricityKWh, 0.12);
  check(r.totals.netAfterCapexUSD, 0.12*0.12 - 0.62*0.12);
});
test('two hours sum, with a no-demand second hour', () => {
  const r = screenHourlyProfile({...base,hours:[row(0),row(1,{heatDemandKWhThermal:0})]});
  check(r.totals.usableHeatKWh, 0.36);
  check(r.totals.unusableHeatKWh, 0.36);
  assert.equal(r.periods,2);
});
test('cost of recovery includes annual operating and capital cost', () => {
  const r = screenHourlyProfile({...base,capexUSD:8760,projectLifeYears:1,annualOpexUSD:8760,hours:[row(0)]});
  check(r.totals.netAfterCapexUSD, 0.0408-2);
});
test('gross positive cash still does not imply field approval', () => {
  const r = screenHourlyProfile({...base,hours:[row(0,{incrementalComputeRevenueUSD:5})]});
  assert.equal(r.economicScreen,'POSITIVE_SCENARIO_NEEDS_VERIFICATION');
  assert.equal(r.fieldDeploymentApproved,false);
});
test('reject repeated or missing hour', () => {
  assert.throws(()=>screenHourlyProfile({...base,hours:[row(0),row(0)]}),RangeError);
  assert.throws(()=>screenHourlyProfile({...base,hours:[row(0),row(2)]}),RangeError);
});
test('reject malformed timestamps and unverified timezone offsets', () => {
  assert.throws(()=>screenHourlyProfile({...base,hours:[row(0,{timestamp:'2026-11-01T00:00:00-08:00'})]}),TypeError);
  assert.throws(()=>screenHourlyProfile({...base,hours:[row(0,{timestamp:'2026-11-32T00:00:00Z'})]}),TypeError);
});
test('reject invalid COP, fractions and negative electricity', () => {
  assert.throws(()=>screenHourlyProfile({...base,hours:[row(0,{comparatorCOP:0.5})]}),RangeError);
  assert.throws(()=>screenHourlyProfile({...base,hours:[row(0,{itElectricityKWh:-1})]}),RangeError);
  assert.throws(()=>screenHourlyProfile({...base,hours:[row(0)],captureEfficiency:1.1}),RangeError);
});
test('reject absent or false provenance class', () => {
  assert.throws(()=>screenHourlyProfile({...base,dataStatus:'verified',hours:[row(0)]}),TypeError);
  assert.throws(()=>screenHourlyProfile({...base,hours:[]}),RangeError);
});
