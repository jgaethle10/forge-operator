import test from 'node:test';
import assert from 'node:assert/strict';
import {updateMotionMemory,evaluateMovingHazards,reactiveCommandMotionWatch} from './controller-rc05-motion-watch.mjs';

const base={estimate:{x:4,z:1.5,heading:0},velocity:{x:.4,z:.05},
  bounds:{xmin:-.7,xmax:10.8,ymin:-2.8,ymax:2.8},
  delaySeconds:.4,braking:.5,robotRadius:.22,uncertainty:.045,
  scanAgeSec:0,goal:{x:10,z:0},maxSpeed:.82,scan:[],state:{preferredTurn:0}};
const track={x:4.9,z:.9,vx:0,vz:.3,radius:.44,observedSpeed:.3};
test('anonymous moving obstacle can be tracked using dated noisy-geometry snapshots',()=>{
  let memory=[],latest=[];
  for(let tick=1;tick<=8;tick++){
    const z=.7+.025*tick;
    const a=updateMotionMemory({history:memory,scan:[{range:Math.hypot(.9,z-1.5)-.44,
      bearing:Math.atan2(z-1.5,.9),radius:.44}],estimate:base.estimate,tick});
    memory=a.history;latest=a.tracks;
  }
  assert.ok(latest.length>=1);
  assert.ok(latest.some(t=>t.vz>.15&&t.vz<.4));
  assert.ok(latest.every(t=>t.anonymous&&!('id' in t)));
});
test('moving crossing produces warning for ordinary forward command',()=>{
  const r=evaluateMovingHazards({...base,requested:{x:.43,z:.15},tracks:[track]});
  assert.equal(r.hazard,true);
  assert.ok(r.nearest.predictedTimeSec>0);
});
test('moving obstacle well away is not an automatic hold',()=>{
  const r=evaluateMovingHazards({...base,requested:{x:.3,z:0},
    tracks:[{...track,x:8,z:-2}]});
  assert.equal(r.hazard,false);
});
test('no observed motion tracks does not invent certainty',()=>{
  const r=evaluateMovingHazards({...base,requested:{x:.3,z:0},tracks:[]});
  assert.equal(r.trackedObjects,0);
  assert.equal(r.minPredictedGapMeters,null);
  assert.equal(r.certifiedSafe,false);
});
test('stale sensors preserve original fail-closed hold',()=>{
  const v=reactiveCommandMotionWatch({...base,scanAgeSec:4,tracks:[track]});
  assert.equal(v.reason,'stale_sensor_hold');
  assert.deepEqual(v.velocity,{x:0,z:0});
});
test('tracker rejects malformed returns and impossible parameters',()=>{
  assert.throws(()=>updateMotionMemory({scan:[{range:-1,bearing:0,radius:.4}],estimate:base.estimate,tick:2}),/rc05d_scan_invalid/);
  assert.throws(()=>evaluateMovingHazards({...base,requested:{x:1,z:0},delaySeconds:-1,tracks:[]}),/rc05d_watch_invalid/);
});
