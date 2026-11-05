import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFlyoverScene} from './flyover.mjs';

test('flyover fixture is original, evidence-safe and renderer-neutral',()=>{
  const fixture=buildFlyoverScene();
  assert.equal(fixture.schema,'evercraft.visual-engine.flyover.v1');
  assert.equal(fixture.provenance.origin,'evercraft-original-procedural');
  assert.equal(fixture.provenance.realWorldEvidence,false);
  assert.equal(fixture.world.schema,'evercraft.world-engine.world.v1');
  assert.equal(fixture.world.visualScene.schema,'evercraft.world-engine.visual-scene.v1');
  assert.deepEqual(fixture.renderTarget,{width:1280,height:720,aspect:'16:9'});
  assert.ok(fixture.world.entities.length>=10);
  assert.ok(fixture.geometries.length>=8);
});
test('every mesh has finite positions and valid indexed or triangle geometry',()=>{
  const fixture=buildFlyoverScene();
  const ids=new Set();
  for(const geom of fixture.geometries){
    assert.equal(geom.schema,'evercraft.world-engine.geometry.v1');
    assert.equal(geom.primitive,'triangles');
    assert.ok(!ids.has(geom.id),'duplicate geometry ID: '+geom.id);
    ids.add(geom.id);
    assert.equal(geom.positions.length%3,0);
    assert.ok(geom.positions.length>=9);
    assert.equal(geom.normals.length,geom.positions.length);
    assert.equal(geom.uvs.length,geom.positions.length/3*2);
    assert.ok(geom.positions.every(Number.isFinite));
    assert.ok(geom.normals.every(Number.isFinite));
    if(geom.indices){
      assert.equal(geom.indices.length%3,0);
      assert.ok(geom.indices.length>=3);
      assert.ok(geom.indices.every(i=>Number.isInteger(i)&&i>=0&&i<geom.positions.length/3));
    }else assert.equal(geom.positions.length%9,0);
  }
  for(const e of fixture.world.entities){
    if(e.renderable) assert.ok(ids.has(e.renderable.geometryRef),e.id);
  }
});
test('camera tracks aircraft over time without changing canonical geometry',()=>{
  const first=buildFlyoverScene(0);
  const repeat=buildFlyoverScene(0);
  const later=buildFlyoverScene(4);
  assert.deepEqual(first,repeat);
  assert.deepEqual(first.geometries,later.geometries);
  const body=e=>e.world.entities.find(x=>x.id==='flyover:fuselage');
  const camera=e=>e.world.entities.find(x=>x.id==='flyover:camera');
  assert.notEqual(body(first).transform.position.z,body(later).transform.position.z);
  assert.notEqual(camera(first).transform.position.z,camera(later).transform.position.z);
  assert.deepEqual(first.world.visualScene.materials,later.world.visualScene.materials);
});
test('invalid time fails closed and callers cannot mutate the asset template',()=>{
  assert.throws(()=>buildFlyoverScene(-1),/flyover_time_invalid/);
  assert.throws(()=>buildFlyoverScene(Infinity),/flyover_time_invalid/);
  assert.throws(()=>buildFlyoverScene(NaN),/flyover_time_invalid/);
  assert.throws(()=>buildFlyoverScene(61),/flyover_time_invalid/);
  const fixture=buildFlyoverScene(2);
  fixture.geometries[0].positions[0]=99999;
  assert.notEqual(buildFlyoverScene(2).geometries[0].positions[0],99999);
});