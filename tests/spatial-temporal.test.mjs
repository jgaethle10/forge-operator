import test from 'node:test';
import assert from 'node:assert/strict';
import {associateSpatialFrames,temporalReviewPacket,forensiScopeTemporalEvents,everMapsTemporalDrafts,worldsTemporalPreview} from '../public/worlds/spatial-temporal.mjs';
const make=(frameId,timestampMs,items,width=160,height=100)=>({
  frameId,timestampMs,width,height,
  observations:items.map(({id,label='vehicle',x,y=20,w=28,h=15,z=3.6,confidence=.9},i)=>({
    schema:'evercraft.spatial-perception.observation.v0',
    id:id??(frameId+':'+i),frameId,timestampMs,
    label,box:{x,y,width:w,height:h},detectorConfidence:confidence,
    depthEstimateM:z,sourceSha256:null,
    cameraPositionM:z===null?null:{x:0,y:0,z},
    georegistered:false,safetyCriticalApproved:false
  }))
});
const car=(x,rest={})=>({x,label:'car',...rest});
const bus=(x,rest={})=>({x,label:'bus',...rest});
test('one object survives consistent inter-frame image association',()=>{
  const result=associateSpatialFrames([
    make('f0',0,[car(10)]),
    make('f1',100,[car(12)]),
    make('f2',200,[car(15)])
  ]);
  assert.equal(result.tracks.length,1);
  assert.equal(result.tracks[0].observationCount,3);
  assert.equal(result.frames[0].events[0].trackId,result.frames[2].events[0].trackId);
  assert.equal(result.frames[1].events[0].association,'image_association_only');
  assert.equal(result.frames[1].events[0].physicalSpeedMps,null);
  assert.equal(result.metadata.metricMotionValid,false);
});
test('different labels never silently become one identity',()=>{
 const r=associateSpatialFrames([make('a',0,[car(20)]),make('b',100,[bus(21)])]);
 assert.equal(r.tracks.length,2);
});
test('large time gap creates a new identity instead of pretending continuous visibility',()=>{
 const r=associateSpatialFrames([make('a',0,[car(20)]),make('b',3000,[car(21)])]);
 assert.equal(r.tracks.length,2);
});
test('severe depth or image shift does not get silently associated',()=>{
 const r=associateSpatialFrames([
  make('a',0,[car(20)]),
  make('b',100,[car(21,{z:15})]),
  make('c',200,[car(130)])
 ]);
 assert.equal(r.tracks.length,3);
});
test('two visually indistinguishable candidates are treated as ambiguous',()=>{
 const r=associateSpatialFrames([
  make('a',0,[car(10),car(12)]),
  make('b',100,[car(11)])
 ]);
 assert.equal(r.tracks.length,3);
 assert.equal(r.frames[1].events[0].association,'new_track_ambiguous');
 assert.equal(r.frames[1].events[0].ambiguous,true);
});
test('occlusion within bounded gap can reconnect with provisional status',()=>{
 const r=associateSpatialFrames([
  make('a',0,[car(30)]),
  make('b',100,[]),
  make('c',200,[car(31)])
 ]);
 assert.equal(r.tracks.length,1);
 assert.equal(r.tracks[0].observationCount,2);
 assert.equal(r.tracks[0].identityStatus,'provisional_image_association');
});
test('all malformed evidence and time reversal fail closed',()=>{
 assert.throws(()=>associateSpatialFrames([make('a',100,[]),make('b',99,[])]),/nonmonotonic_timestamp/);
 assert.throws(()=>associateSpatialFrames([make('a',0,[]),make('a',100,[])]),/duplicate_frame_id/);
 const bad=make('a',0,[car(20)]);
 bad.observations.push({...bad.observations[0]});
 assert.throws(()=>associateSpatialFrames([bad]),/duplicate_observation/);
 const b=make('b',0,[car(200)]);
 assert.throws(()=>associateSpatialFrames([b]),/invalid_box/);
 const c=make('c',0,[car(20)]);
 c.observations[0].georegistered=true;
 assert.throws(()=>associateSpatialFrames([c]),/authority_escalation_forbidden/);
});
test('review packet contains no invented provenance, GPS, speed or verified identity',()=>{
 const r=associateSpatialFrames([make('f0',0,[car(10)]),make('f1',50,[car(13)])]);
 const packet=temporalReviewPacket(r);
 assert.equal(packet.events.length,2);
 assert.equal(packet.reviewStatus,'unreviewed');
 assert.equal(packet.chainOfCustodyVerified,false);
 assert.equal(packet.sourceMediaVerified,false);
 assert.equal(packet.physicalSpeedMps,null);
 assert.equal(packet.georegistered,false);
 assert.equal(packet.authoritativeWorldScene,false);
 assert.equal(packet.tracks[0].identityStatus,'provisional_image_association');
 assert.ok(!JSON.stringify(packet).includes('imagePixels'));
});
test('repeatable frame sequence yields repeatable tracks and no mutation',()=>{
 const frames=[make('a',0,[car(10),bus(110)]),make('b',100,[bus(109),car(12)])];
 const snapshot=JSON.stringify(frames);
 const a=associateSpatialFrames(frames),b=associateSpatialFrames(frames);
 assert.deepEqual(a,b);
 assert.equal(JSON.stringify(frames),snapshot);
});
test('empty frame sequence produces bounded empty review packet',()=>{
 const r=associateSpatialFrames([]);
 assert.equal(r.tracks.length,0);
 assert.equal(r.frames.length,0);
 assert.equal(temporalReviewPacket(r).events.length,0);
});

test('three consumers preserve non-authoritative, unlocated, review-required status',()=>{
 const timeline=associateSpatialFrames([make('sample',0,[car(20)])]);
 const world=worldsTemporalPreview(timeline,'sample');
 const events=forensiScopeTemporalEvents(timeline),maps=everMapsTemporalDrafts(timeline);
 assert.equal(world.schema,'evercraft.world-engine.world.v1');
 assert.equal(world.entities.length,1);
 assert.equal(world.entities[0].collider,undefined);
 assert.equal(world.metadata.productionAuthoritative,false);
 assert.equal(world.metadata.persistenceAuthorized,false);
 assert.equal(world.metadata.worldReconstructionComplete,false);
 assert.equal(events[0].reviewStatus,'requires_human_review');
 assert.equal(events[0].identityVerified,false);
 assert.equal(maps[0].geometry,null);
 assert.equal(maps[0].severity,null);
 assert.equal(maps[0].urgency,'not_assessed');
});
test('timestamp and camera coordinate contradictions fail closed',()=>{
 const a=make('a',100,[car(30)]);a.observations[0].timestampMs=99;
 assert.throws(()=>associateSpatialFrames([a]),/observation_frame_mismatch/);
 const b=make('b',100,[car(30)]);b.observations[0].cameraPositionM.z=100;
 assert.throws(()=>associateSpatialFrames([b]),/inconsistent_camera_depth/);
});
test('adapters reject non-temporal data and unknown frames',()=>{
 const timeline=associateSpatialFrames([make('a',0,[car(30)])]);
 assert.throws(()=>forensiScopeTemporalEvents({}),/invalid_timeline/);
 assert.throws(()=>everMapsTemporalDrafts({}),/invalid_timeline/);
 assert.throws(()=>worldsTemporalPreview(timeline,'not-found'),/frame_not_found/);
});
