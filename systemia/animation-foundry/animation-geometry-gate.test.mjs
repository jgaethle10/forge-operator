import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditAnimationGeometry} from './animation-geometry-gate.mjs';

function fixture(){
  const track=(boneId,x,y)=>({boneId,translation:[
    {timeSec:0,value:{x,y,z:0}},
    {timeSec:1,value:{x,y,z:0}}
  ]});
  return {
    schema:'evercraft.world-engine.animation.v1',
    rig:{id:'qa-proof',bones:[]},
    clips:[{
      id:'acting',durationSec:1,loop:false,
      tracks:[
        track('shoulder',421,370),
        track('elbow',500,430),
        track('wrist',600,430),
        track('head',313,248)
      ],
      events:[{id:'snap',name:'audio_visual_sync',timeSec:.5}]
    }],
    states:[{id:'acting',clipId:'acting'}],initialState:'acting',transitions:[]
  };
}
const opts={expectedUpperArm:Math.hypot(79,60),expectedForearm:100};
test('accepts stable, proportional frame-sampled rig',()=>{
  assert.equal(auditAnimationGeometry(fixture(),opts).status,'pass');
});
test('rejects oversized hands',()=>{
  assert.ok(auditAnimationGeometry(fixture(),{...opts,handHeight:300}).failures.includes('hand_oversized'));
});
test('rejects a missing synchronization event',()=>{
  const a=fixture();a.clips[0].events=[];
  assert.ok(auditAnimationGeometry(a,opts).failures.includes('required_event_missing:snap'));
});
test('rejects elbow teleport / bone length discontinuity',()=>{
  const a=fixture();a.clips[0].tracks[1].translation.splice(1,0,{timeSec:.5,value:{x:800,y:430,z:0}});
  const failures=auditAnimationGeometry(a,opts).failures;
  assert.ok(failures.includes('elbow_pop'));
  assert.ok(failures.includes('bone_length_drift'));
});
