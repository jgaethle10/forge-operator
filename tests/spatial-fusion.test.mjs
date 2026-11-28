import test from 'node:test';
import assert from 'node:assert/strict';
import {fuseSpatialViews} from '../public/worlds/perception-lab/spatial-fusion.mjs';
const identity=[[1,0,0],[0,1,0],[0,0,1]];
const view=(id,t,points)=>({id,schema:'evercraft.spatial-perception.posed-points.v1',depthKind:'metric_camera_z',coordinateFrame:'camera_x_right_y_up_z_forward',evidenceKind:'synthetic',georegistered:false,poseVerified:false,persistenceAuthorized:false,sourceSha256:null,pose:{rotation:identity,translationM:t},points});
const a=view('a',[0,0,0],[[.025,.025,2.025],[.525,.025,2.025]]);
const b=view('b',[1,0,0],[[-.975,.025,2.025],[-.475,.025,2.025]]);
test('translated cameras fuse overlapping samples into common local voxels',()=>{
 const r=fuseSpatialViews([a,b]);assert.equal(r.inputCount,4);assert.equal(r.pointCount,2);assert.equal(r.multiViewVoxelCount,2);
 assert.ok(r.points.every(p=>p.supportViews===2&&p.samples===2));assert.equal(r.geometryReconstructed,false);assert.equal(r.metricAccuracyVerified,false);
 assert.equal(r.persistenceAuthorized,false);assert.equal(r.collisionAuthority,false);
});
test('proper rotations transform camera points, reflections are rejected',()=>{
 const rotated={...b,pose:{rotation:[[0,-1,0],[1,0,0],[0,0,1]],translationM:[0,0,0]},points:[[.025,-.025,2.025]]};
 assert.equal(fuseSpatialViews([a,rotated]).multiViewVoxelCount,1);
 assert.throws(()=>fuseSpatialViews([a,{...b,pose:{rotation:[[1,0,0],[0,1,0],[0,0,-1]],translationM:[0,0,0]}}]),/reflected_pose/);
});
test('missing or invalid geometry, relative depth and forged authority fail closed',()=>{
 for(const [bad,reason] of [[{...b,id:'a'},/view_id/],[{...b,depthKind:'relative'},/input_contract/],[{...b,poseVerified:true},/authority/],[{...b,points:[[0,0,-1]]},/invalid_point/],[{...b,sourceSha256:'fake'},/source_digest/],[{...b,pose:{rotation:[[2,0,0],[0,1,0],[0,0,1]],translationM:[0,0,0]}},/nonrigid_pose/]])assert.throws(()=>fuseSpatialViews([a,bad]),reason);
 assert.throws(()=>fuseSpatialViews([a,b],{maxPoints:3}),/point_budget/);
});
test('equal per-view weighting and stable ordering; no source mutation',()=>{
 const crowded={...a,points:Array(20).fill([.01,.025,2.025])};
 const other=view('b',[0,0,0],[[.04,.025,2.025]]);
 const before=JSON.stringify([crowded,other]);const r=fuseSpatialViews([crowded,other]);
 assert.equal(r.pointCount,1);assert.ok(Math.abs(r.points[0].positionM[0]-.025)<1e-10);
 assert.deepEqual(r,fuseSpatialViews([other,crowded]));assert.equal(JSON.stringify([crowded,other]),before);
});
test('separate observed regions remain separate and are not invented',()=>{
 const other=view('b',[0,0,0],[[5.025,.025,2.025]]);
 const r=fuseSpatialViews([a,other]);assert.equal(r.pointCount,3);assert.equal(r.multiViewVoxelCount,0);
 assert.ok(r.points.every(p=>p.supportViews===1));
});
