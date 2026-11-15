import test from 'node:test';
import assert from 'node:assert/strict';
import { CORRIDOR, SCENARIOS, EVIDENCE_STATE, simulateRoute, compareScenarios } from '../../public/apps/route-twin/route-core.mjs';

test('corridor is schematic and no source claims live authority', () => {
  assert.match(CORRIDOR.notice,/Not surveyed/);
  assert.equal(EVIDENCE_STATE.tier, 'synthetic');
  assert.equal(EVIDENCE_STATE.restrictions, 'not_checked');
  assert.equal(EVIDENCE_STATE.weather, 'not_connected');
});
test('baseline returns coherent illustrative travel and no operational approval', () => {
  const r=simulateRoute({departureHour:8});
  assert.equal(r.legs.length,4);
  assert.equal(r.blocked,false);
  assert.ok(r.travelHours>0);
  assert.equal(r.authority,'rehearsal_only_not_dispatch_approval');
  assert.ok(r.requires.some(x=>x.includes('commercial-vehicle')));
});
test('hypothetical closure is a hard stop with no misleading ETA', () => {
  const r=simulateRoute({scenario:'closure'});
  assert.equal(r.blocked,true);
  assert.equal(r.travelHours,null);
  assert.equal(r.arrivalAt,null);
  assert.equal(r.legs[1].status,'blocked');
  assert.equal(r.legs[2].status,'unassessed');
});
test('snow is time-window-dependent and labels its origin', () => {
  const morning=simulateRoute({scenario:'snow',departureHour:8});
  const evening=simulateRoute({scenario:'snow',departureHour:15});
  assert.equal(morning.highRiskCount,0);
  assert.ok(evening.highRiskCount>=1);
  assert.ok(evening.travelHours>morning.travelHours);
  assert.equal(evening.legs[1].dataClass,'hypothetical');
});
test('wind extends travel time without inventing live measurements', () => {
  const base=simulateRoute({scenario:'baseline'});
  const wind=simulateRoute({scenario:'wind'});
  assert.ok(wind.travelHours>base.travelHours);
  assert.equal(wind.evidence.timestamp,null);
});
test('invalid inputs fail closed', () => {
  assert.throws(()=>simulateRoute({scenario:'mystery'}),RangeError);
  assert.throws(()=>simulateRoute({departureHour:-5}),RangeError);
  assert.throws(()=>simulateRoute({truck:{heightFt:50}}),RangeError);
  assert.throws(()=>simulateRoute({truck:{grossWeightLb:500000}}),RangeError);
});
test('all scenarios preserve the same route and comparison never dispatches', () => {
  const r=compareScenarios({departureHour:14});
  assert.equal(r.length,Object.keys(SCENARIOS).length);
  assert.ok(r.every(v=>v.corridorId===CORRIDOR.id && v.authority==='rehearsal_only_not_dispatch_approval'));
});
