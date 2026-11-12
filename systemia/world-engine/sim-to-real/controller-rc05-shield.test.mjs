import test from 'node:test';
import assert from 'node:assert/strict';
import {observedDetourRisk,reactiveCommandShielded} from './controller-rc05-shield.mjs';
const args={estimate:{x:1,z:0,heading:0},goal:{x:10,z:0},
  bounds:{xmin:-.7,xmax:10.8,ymin:-2.8,ymax:2.8},scan:[],scanAgeSec:0,
  velocity:{x:0,z:0},uncertainty:.05,delaySeconds:.4,braking:.5,maxSpeed:.82,robotRadius:.22,state:{preferredTurn:0}};
test('shield rejects forward hazard from anonymous reading',()=>{
  const risk=observedDetourRisk({...args,scan:[{range:.28,radius:.35,bearing:0}],candidate:{x:.35,z:0}});
  assert.equal(risk.safe,false);
  assert.equal(risk.reason,'shield_observed_hazard_hold');
});
test('shield checks momentum even when candidate turns away',()=>{
  const risk=observedDetourRisk({...args,scan:[{range:.2,radius:.4,bearing:0}],
    velocity:{x:.7,z:0},candidate:{x:0,z:.2}});
  assert.equal(risk.safe,false);
  assert.equal(risk.direction,'current');
});
test('shield rejects projected geofence violations',()=>{
  const risk=observedDetourRisk({...args,estimate:{x:10.3,z:0,heading:0},
    candidate:{x:.4,z:0}});
  assert.equal(risk.safe,false);
  assert.equal(risk.reason,'shield_geofence_hold');
});
test('shield allows clear synthetic observation but never asserts physical safety',()=>{
  const risk=observedDetourRisk({...args,candidate:{x:.25,z:0}});
  assert.equal(risk.safe,true);
  assert.equal(risk.reason,'shield_permitted');
});
test('stale scans, bad location and geofence preserve original fail-closed holds',()=>{
  for(const [changes,expected] of [
    [{scanAgeSec:2},'stale_sensor_hold'],
    [{uncertainty:.4},'localization_uncertain_hold'],
    [{estimate:{x:-.68,z:0,heading:0}},'geofence_uncertain_hold']]){
    const decision=reactiveCommandShielded({...args,...changes});
    assert.equal(decision.reason,expected);
    assert.deepEqual(decision.velocity,{x:0,z:0});
  }
});
test('malformed observations fail closed',()=>{
  assert.throws(()=>observedDetourRisk({...args,candidate:{x:.2,z:0},
    scan:[{range:NaN,radius:.5,bearing:0}]}),/rc05b_invalid_sensor_reading/);
});