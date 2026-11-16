import test from 'node:test';
import assert from 'node:assert/strict';
import {SCENIC_PROFILE,landscapeHeight,makeLandscapeGeometry,makeGrassPatches,makeGrassTuftGeometry} from '../public/worlds/scenic-landscape.mjs';
test('terrain remains below walkable workshop and creates a distant hill silhouette',()=>{
 for(const [x,z] of [[0,0],[17,17],[-17,0],[0,17]])assert.ok(landscapeHeight(x,z)<.01);
 const distant=[landscapeHeight(45,0),landscapeHeight(-45,30),landscapeHeight(10,50)];
 assert.ok(distant.some(y=>y>.15));
 assert.ok(distant.every(Number.isFinite));
});
test('terrain geometry is bounded and carries normalized upward-facing normals',()=>{
 const terrain=makeLandscapeGeometry({extent:62,segments:24});
 assert.equal(terrain.triangleCount,24*24*2);
 assert.equal(terrain.positions.length,terrain.triangleCount*9);
 assert.equal(terrain.normals.length,terrain.positions.length);
 for(let i=0;i<terrain.normals.length;i+=3){
  const n=terrain.normals.slice(i,i+3);
  assert.ok(n.every(Number.isFinite));assert.ok(n[1]>0);
  assert.ok(Math.abs(Math.hypot(...n)-1)<.00001);
 }
 assert.throws(()=>makeLandscapeGeometry({segments:500}),/bounds/);
});
test('deterministic instanced grass stays outside workshop and pond',()=>{
 const a=makeGrassPatches(),b=makeGrassPatches();assert.deepEqual(a,b);
 assert.equal(a.length,SCENIC_PROFILE.grassCount);
 for(const p of a){
  assert.ok(Math.abs(p.x)<18.2&&Math.abs(p.z)<18.2);
  assert.ok(!(p.x>-7.8&&p.x<.9&&p.z>-8.6&&p.z<.2));
  assert.ok(((p.x-7)/4.5)**2+((p.z+5)/3.8)**2>=1);
  assert.ok(/^#[0-9a-f]{6}$/.test(p.color));
 }
 assert.throws(()=>makeGrassPatches({count:2000}),/limits/);
});
test('instanced grass silhouette contains finite triangles and normals',()=>{
 const tuft=makeGrassTuftGeometry();
 assert.equal(tuft.bladeCount,3);assert.equal(tuft.positions.length,27);
 assert.equal(tuft.normals.length,27);assert.ok(tuft.positions.every(Number.isFinite));
});
