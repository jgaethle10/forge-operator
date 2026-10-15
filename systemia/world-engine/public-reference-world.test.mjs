import test from 'node:test';
import assert from 'node:assert/strict';
import { EvercraftWorldRuntime, verifyWorldSnapshot, worldDefinitionDigest } from './engine.js';
import { mountPublicReferencePoints,publicReferenceFrame } from './public-reference-world.mjs';

const origin={lat:28.6083,lon:-80.6043};
const base=()=>({
  schema:'evercraft.world-engine.world.v1',id:'synthetic-kennedy-test',
  version:1,tickRateHz:60,gravity:{x:0,y:-9.81,z:0},
  ground:{enabled:true,height:0},
  entities:[{id:'ball',name:'synthetic-test-actor',
    transform:{position:{x:0,y:3,z:0}},
    collider:{type:'sphere',radius:.5},
    rigidBody:{mass:1,velocity:{x:1,y:0,z:0},linearDamping:0}}],
});
const fixture=()=>({
  type:'FeatureCollection',
  metadata:{coord_units:'WGS84 decimal degrees; lon,lat',modeled_visuals_excluded:true,not_for:['navigation','civil engineering']},
  features:[
    {type:'Feature',id:'39B',geometry:{type:'Point',coordinates:[-80.620869,28.627306]},
      properties:{name:'Synthetic LC39B point',coordinate_source:'Synthetic test coordinates',source_url:'https://example.org/b',geometry_state:'sourced_point_only',building_or_pad_footprint_state:'not_provided',engineering_approval:'none'}},
    {type:'Feature',id:'39A',geometry:{type:'Point',coordinates:[-80.604133,28.608422]},
      properties:{name:'Synthetic LC39A point',coordinate_source:'Synthetic test coordinates',source_url:'https://example.org/a',geometry_state:'sourced_point_only',building_or_pad_footprint_state:'not_provided',engineering_approval:'none'}},
  ],
});
test('source-marked points mount to the actual WorldDefinition without actor/collider creation',()=>{
  const world=base(),before=structuredClone(world);
  const mounted=mountPublicReferencePoints(world,fixture(),origin);
  assert.deepEqual(world,before);
  assert.equal(mounted.version,2);
  assert.equal(mounted.entities.length,1);
  assert.deepEqual(mounted.entities,before.entities);
  assert.equal(mounted.metadata.public_reference_points.points.length,2);
  assert.deepEqual(mounted.metadata.public_reference_points.points.map(x=>x.id),['reference:39A','reference:39B']);
  assert.notEqual(worldDefinitionDigest(mounted),worldDefinitionDigest(before));
  assert.throws(()=>mountPublicReferencePoints(mounted,fixture(),origin),/already_mounted/);
});
test('reference frame binds to a verified live engine snapshot and is explicitly nonphysical',()=>{
  const world=mountPublicReferencePoints(base(),fixture(),origin);
  const snap=new EvercraftWorldRuntime(world).run(12);
  assert.equal(verifyWorldSnapshot(snap),true);
  const frame=publicReferenceFrame(world,snap);
  assert.equal(frame.worldId,'synthetic-kennedy-test');
  assert.equal(frame.tick,12);
  assert.equal(frame.sourceSnapshotDigest,snap.digest);
  assert.equal(frame.sourceWorldDigest,worldDefinitionDigest(world));
  assert.equal(frame.annotations.length,2);
  assert.deepEqual(frame.annotations[0].wgs84,{lon:-80.604133,lat:28.608422});
  assert.equal(frame.annotations[0].collision,false);
  assert.equal(frame.annotations[0].physical,false);
  assert.equal(frame.decisionAuthority,false);
  assert.ok(snap.entities.every(x=>!x.id.startsWith('reference:')));
});
test('mounting reference metadata never changes the same physics simulation',()=>{
  const baseline=new EvercraftWorldRuntime(base()).run(120);
  const world=mountPublicReferencePoints(base(),fixture(),origin);
  const enhanced=new EvercraftWorldRuntime(world).run(120);
  assert.deepEqual(enhanced.entities.find(x=>x.id==='ball').transform,
    baseline.entities.find(x=>x.id==='ball').transform);
  assert.deepEqual(enhanced.collisions,baseline.collisions);
});
test('tampered snapshot, different world, and stale definitions fail closed',()=>{
  const world=mountPublicReferencePoints(base(),fixture(),origin);
  const snap=new EvercraftWorldRuntime(world).run(4);
  assert.throws(()=>publicReferenceFrame(base(),snap),/overlay_missing/);
  const tampered=structuredClone(snap);tampered.tick=999;
  assert.throws(()=>publicReferenceFrame(world,tampered),/snapshot_integrity_invalid/);
  const stale=structuredClone(world);stale.version=3;
  assert.throws(()=>publicReferenceFrame(stale,snap),/snapshot_world_mismatch/);
  const changed=structuredClone(world);changed.metadata.public_reference_points.points[0].name='Laundered label';
  assert.throws(()=>publicReferenceFrame(changed,snap),/snapshot_world_mismatch/);
});
test('authority escalation inside the overlay is rejected even when world snapshot is freshly signed',()=>{
  const world=mountPublicReferencePoints(base(),fixture(),origin);
  world.metadata.public_reference_points.points[0].authority.engineering=true;
  const snap=new EvercraftWorldRuntime(world).run(1);
  assert.throws(()=>publicReferenceFrame(world,snap),/point_authority_invalid/);
  const another=mountPublicReferencePoints(base(),fixture(),origin);
  another.metadata.public_reference_points.decisionAuthority=true;
  const snap2=new EvercraftWorldRuntime(another).run(1);
  assert.throws(()=>publicReferenceFrame(another,snap2),/overlay_authority_invalid/);
});
