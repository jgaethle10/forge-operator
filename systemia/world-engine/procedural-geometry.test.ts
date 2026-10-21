import test from 'node:test';
import assert from 'node:assert/strict';
import {makeTorusGeometry} from './procedural-geometry.js';
import {geometryAssetDigest,validateGeometryAsset} from './webgpu.js';

test('deterministic true triangle torus surface has correct normals, UVs and GPU-valid geometry',()=>{
  const spec={id:'owned:rotor-industrial',majorRadius:2,tubeRadius:.25,radialSegments:24,tubularSegments:8};
  const a=makeTorusGeometry(spec),b=makeTorusGeometry(spec);
  assert.equal(validateGeometryAsset(a),true);
  assert.deepEqual(a,b);
  assert.equal(geometryAssetDigest(a),geometryAssetDigest(b));
  assert.equal(a.positions.length,24*8*6*3);
  assert.equal(a.normals.length,a.positions.length);
  assert.equal(a.uvs.length,24*8*6*2);
  assert.ok(Math.abs(a.positions[0]-2.25)<1e-9);
  assert.ok(Math.abs(a.normals[0]-1)<1e-9);
  for(let i=0;i<a.normals.length;i+=3){
    const size=Math.hypot(...a.normals.slice(i,i+3));
    assert.ok(Math.abs(size-1)<1e-9);
  }
  assert.ok(a.uvs.every(x=>Number.isFinite(x)&&x>=0&&x<=1));
});
test('torus radius and segment limits reject degenerate or excessive workloads',()=>{
  const valid={id:'owned:ring',majorRadius:2,tubeRadius:.2};
  for(const bad of [
    {id:'../unsafe'}, {majorRadius:0}, {majorRadius:NaN},
    {tubeRadius:0}, {tubeRadius:2.1}, {tubeRadius:Infinity},
    {radialSegments:7}, {radialSegments:129}, {radialSegments:3.5},
    {tubularSegments:3}, {tubularSegments:33}, {radialSegments:128,tubularSegments:33}
  ])assert.throws(()=>makeTorusGeometry({...valid,...bad}),/world_procedural_/);
});
test('different geometric dimensions change actual vertices and geometry receipt',()=>{
  const a=makeTorusGeometry({id:'owned:ring',majorRadius:2,tubeRadius:.2});
  const b=makeTorusGeometry({id:'owned:ring',majorRadius:2,tubeRadius:.35});
  assert.notEqual(geometryAssetDigest(a),geometryAssetDigest(b));
  assert.notDeepEqual(a.positions,b.positions);
});
