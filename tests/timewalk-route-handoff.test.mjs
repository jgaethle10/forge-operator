import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateWalkTopology,makeTimewalkSceneHandoff} from '../public/worlds/timewalk/walk-topology.mjs';
const load=name=>JSON.parse(readFileSync(
  new URL('../public/worlds/timewalk/yakima-1960/'+name,import.meta.url),'utf8'
));
const evidence=load('evidence.v1.json');
const architecture=load('larson-periods.v1.json');
const route=load('walk-topology.v1.json');
const copy=()=>structuredClone(route);

test('city-issued tour anchors route stops 27 Larson and 10 Capitol',()=>{
  assert.equal(validateWalkTopology(route,evidence),route);
  assert.equal(route.routeNodes[0].tourStop,27);
  assert.equal(route.routeNodes.at(-1).tourStop,10);
  assert.equal(route.routeSegments.length,3);
  assert.equal(route.historical1960CrossingsVerified,false);
});
test('canonical Worlds handoff uses only sourced evidence, not a second renderer',()=>{
  const handoff=makeTimewalkSceneHandoff(evidence,route,architecture);
  assert.equal(handoff.schema,'evercraft.timewalk.scene-handoff.v1');
  assert.equal(handoff.targetRuntime,'evercraft-worlds');
  assert.equal(handoff.architecturalCues[0].appearance,'original_corner_shopfront_configuration');
  assert.equal(handoff.architecturalCues[0].classification,'retrospectively_inferred');
  assert.equal(handoff.sceneYear,1960);
  assert.equal(handoff.geometry,null);
  assert.equal(handoff.physics,null);
  assert.equal(handoff.renderer,null);
  assert.equal(handoff.walkingPaths,null);
  assert.equal(handoff.productionWorldReady,false);
  assert.equal(handoff.navigationAuthorized,false);
  assert.equal(handoff.historicalEvidence.places.length,3);
});
test('no nonexistent historic sidewalk coordinates, distances or crossing evidence',()=>{
  const plan=makeTimewalkSceneHandoff(evidence,route,architecture);
  assert.ok(plan.orderedWaypoints.every(n=>n.position===null&&n.worldPosition===null));
  assert.ok(plan.segments.every(e=>e.distanceMeters===null&&e.historical1960CrossingVerified===false));
  for(const invalid of [
    r=>{r.routeSegments[0].distanceMeters=5;},
    r=>{r.routeNodes[0].position={x:1,y:0,z:0};},
    r=>{r.historical1960CrossingsVerified=true;},
    r=>{r.geometry=[1,2,3];},
    r=>{r.realWorldNavigationAuthorized=true;}
  ]){
    const r=copy();invalid(r);
    assert.throws(()=>validateWalkTopology(r,evidence),/timewalk_walk_topology_/);
  }
});
test('rejects mismatched city, missing historical place references and source',()=>{
  let r=copy();r.location.city='Seattle';assert.throws(()=>validateWalkTopology(r,evidence),/wrong_city/);
  r=copy();r.routeNodes[0].placeId='seattle-building';assert.throws(()=>validateWalkTopology(r,evidence),/bad_node/);
  r=copy();r.sources[0].sourceId='missing';assert.throws(()=>validateWalkTopology(r,evidence),/missing_source_links/);
});
test('route must remain contiguous and explicitly non-executable',()=>{
  let r=copy();r.routeSegments[1].from='larson-building';
  assert.throws(()=>validateWalkTopology(r,evidence),/broken_walk_sequence/);
  r=copy();r.authoringCue.integrationStatus='production_walking_navigation';
  assert.throws(()=>validateWalkTopology(r,evidence),/route_not_engine_neutral/);
  r=copy();r.sceneYear=1961;
  assert.throws(()=>validateWalkTopology(r,evidence),/invalid_scene_year/);
});
