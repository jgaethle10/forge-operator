import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateStereoDepth,fuseDetections,worldsProjection,
  mappingDraft,forensiScopeTimeline} from '../public/worlds/spatial-perception.mjs';

function fixture(disparity=4) {
  const width=64,height=32;
  const left=new Uint8Array(width*height),right=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)
    left[y*width+x]=(x*71+y*37+(x*y*17)%251)%256;
  for(let y=0;y<height;y++)for(let x=0;x<width-disparity;x++)
    right[y*width+x]=left[y*width+x+disparity];
  return {left,right,width,height,fxPx:120,baselineM:0.12,
    minDisparity:1,maxDisparity:8,stride:2,minTexture:5};
}
const box={x:22,y:8,width:30,height:20};
function observations(depth) {
  return fuseDetections(depth,{frameId:'synthetic-001',timestampMs:100,
    detector:'synthetic-fixture',detections:[{label:'synthetic bus',confidence:0.92,box}]});
}
test('synthetic known disparity yields measured 3.6 meters',()=>{
  const depth=estimateStereoDepth(fixture());
  assert.ok(depth.sampleCount>100);
  const matches=depth.points.filter(p=>p.disparityPx===4);
  assert.ok(matches.length>100);
  assert.equal(matches[0].depthM,3.6);
  assert.equal(depth.depthStatus,'estimated_not_verified');
});
test('blank imagery cannot manufacture distance',()=>{
  const p=fixture();p.left.fill(120);p.right.fill(120);
  const depth=estimateStereoDepth(p);
  assert.equal(depth.sampleCount,0);
  const [o]=observations(depth);
  assert.equal(o.depthEstimateM,null);
  assert.equal(o.cameraPositionM,null);
});
test('invalid inputs fail closed',()=>{
  const p=fixture();
  assert.throws(()=>estimateStereoDepth({...p,baselineM:0}),/invalid_baseline/);
  assert.throws(()=>estimateStereoDepth({...p,maxDisparity:80}),/disparity_exceeds_frame/);
  assert.throws(()=>estimateStereoDepth({...p,right:new Uint8Array(2)}),/invalid_right_pixels/);
});
test('external detections get camera-relative depth but not map coordinates',()=>{
  const [o]=observations(estimateStereoDepth(fixture()));
  assert.equal(o.label,'synthetic bus');
  assert.ok(o.depthEstimateM>0);
  assert.equal(o.cameraPositionM.z,o.depthEstimateM);
  assert.equal(o.georegistered,false);
  assert.equal(o.safetyCriticalApproved,false);
});
test('no fabricated confidence when disparity samples are missing',()=>{
  const p=fixture();p.left.fill(42);p.right.fill(42);
  const [o]=observations(estimateStereoDepth(p));
  assert.equal(o.depthStatus,'unknown');
  assert.equal(o.matchConfidence,null);
});
test('Worlds projection is noncolliding and nonauthoritative',()=>{
  const scene=worldsProjection(observations(estimateStereoDepth(fixture())));
  assert.equal(scene.schema,'evercraft.world-engine.world.v1');
  assert.equal(scene.entities.length,1);
  assert.equal(scene.entities[0].collider,undefined);
  assert.equal(scene.metadata.productionAuthoritative,false);
  assert.equal(scene.metadata.persistenceAuthorized,false);
});
test('ForensiScope and EverMaps preserve review and no-severity flags',()=>{
  const obs=observations(estimateStereoDepth(fixture()));
  assert.equal(forensiScopeTimeline(obs)[0].reviewStatus,'requires_human_review');
  const map=mappingDraft(obs)[0];
  assert.equal(map.geometry,null);
  assert.equal(map.severity,null);
  assert.equal(map.urgency,'not_assessed');
});
test('invalid detections cannot escape image bounds',()=>{
  const depth=estimateStereoDepth(fixture());
  assert.throws(()=>fuseDetections(depth,{frameId:'bad',
    detections:[{label:'vehicle',confidence:0.8,
      box:{x:-1,y:3,width:10,height:10}}]}),/box_out_of_bounds/);
});
