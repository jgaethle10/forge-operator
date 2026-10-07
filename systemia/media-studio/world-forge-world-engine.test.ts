import assert from 'node:assert/strict';
import test from 'node:test';

import { createWorldForgeStarterProject } from './world-forge-http.js';
import {
  compileWorldForgeToWorldEngine,
  verifyWorldForgeWorldEngineBridgeReceipt,
  worldForgeEulerToWorldEngine,
  worldForgeVectorToWorldEngine,
} from './world-forge-world-engine.js';

test('World Forge Z-up coordinates map deterministically into World Engine Y-up',()=>{
  assert.deepEqual(
    worldForgeVectorToWorldEngine({x:2,y:3,z:4}),
    {x:2,y:4,z:-3},
  );
  assert.deepEqual(
    worldForgeVectorToWorldEngine({x:2,y:3,z:4},.5),
    {x:1,y:2,z:-1.5},
  );

  const rotation=worldForgeEulerToWorldEngine({x:0,y:0,z:90});
  assert.ok(Math.abs(rotation.x)<1e-8);
  assert.ok(Math.abs(rotation.y-90)<1e-8);
  assert.ok(Math.abs(rotation.z)<1e-8);
});

test('starter World Forge scene compiles into validated World Engine runtime + geometry assets',()=>{
  const project=createWorldForgeStarterProject();
  const bridge=compileWorldForgeToWorldEngine({project});

  assert.equal(bridge.schema,'evercraft.fallen.world-forge-world-engine-bridge.v1');
  assert.equal(bridge.world.schema,'evercraft.world-engine.world.v1');
  assert.equal(bridge.world.version,project.version);
  assert.equal(bridge.receipt.runtimeReady,true);
  assert.equal(bridge.receipt.webGpuReady,true);
  assert.equal(bridge.receipt.visualParity,'approximate');
  assert.ok(bridge.receipt.warnings.some(item=>item.startsWith('area_light_approximated_as_point:')));
  assert.ok(bridge.receipt.warnings.some(item=>item.startsWith('modifier_stack_not_baked:hero-core')));

  const heroMap=bridge.receipt.nodeEntityMap.find(item=>item.nodeId==='hero-core');
  assert.ok(heroMap);
  const hero=bridge.world.entities.find(entity=>entity.id===heroMap!.entityId);
  assert.ok(hero);
  assert.deepEqual(hero!.transform.position,{x:0,y:1,z:0});
  assert.ok(hero!.renderable);

  const cameraMap=bridge.receipt.nodeEntityMap.find(item=>item.nodeId==='camera-main');
  assert.ok(cameraMap);
  const camera=bridge.world.entities.find(entity=>entity.id===cameraMap!.entityId);
  assert.ok(camera?.camera);
  assert.deepEqual(camera!.transform.position,{x:7,y:6.2,z:9});
  assert.equal(bridge.world.visualScene?.initialCameraEntityId,camera!.id);

  assert.equal(bridge.geometries.length,1);
  assert.equal(bridge.geometries[0].primitive,'triangles');
  assert.equal(bridge.geometries[0].positions.length,108);
  assert.equal(bridge.geometries[0].normals.length,108);
  assert.equal(bridge.assets.assets.length,1);
  assert.equal(bridge.assets.assets[0].kind,'geometry');
  assert.match(bridge.assets.assets[0].sha256,/^[a-f0-9]{64}$/);

  assert.equal(verifyWorldForgeWorldEngineBridgeReceipt(bridge.receipt),true);
});

test('World Forge bridge receipt detects tampering',()=>{
  const project=createWorldForgeStarterProject();
  const bridge=compileWorldForgeToWorldEngine({project});
  const tampered=structuredClone(bridge.receipt);
  tampered.worldVersion+=1;
  assert.equal(verifyWorldForgeWorldEngineBridgeReceipt(tampered),false);
});

test('World Forge bridge refuses parented hierarchy until flattening is explicit',()=>{
  const project=createWorldForgeStarterProject();
  const hero=project.nodes.find(node=>node.id==='hero-core');
  assert.ok(hero);
  hero!.parentId='plinth-left';

  assert.throws(
    ()=>compileWorldForgeToWorldEngine({project}),
    /world_forge_world_engine_parent_hierarchy_requires_flatten/,
  );
});

test('World Forge bridge refuses external geometry without a content digest',()=>{
  const project=createWorldForgeStarterProject();
  project.assets.push({
    id:'external-mesh',
    kind:'mesh',
    uri:'https://example.invalid/mesh.glb',
    evidenceState:'licensed',
    rightsState:'licensed',
    sourceRefs:['test:external-mesh'],
    metadata:{license:'test-license'},
  });
  const hero=project.nodes.find(node=>node.id==='hero-core');
  assert.ok(hero);
  hero!.geometry={kind:'asset',assetId:'external-mesh'};

  assert.throws(
    ()=>compileWorldForgeToWorldEngine({project}),
    /world_forge_world_engine_asset_digest_required:external-mesh/,
  );
});

test('World Forge bridge refuses licensed assets with missing license lineage',()=>{
  const project=createWorldForgeStarterProject();
  project.assets.push({
    id:'licensed-mesh',
    kind:'mesh',
    uri:'https://example.invalid/mesh.glb',
    digest:'a'.repeat(64),
    evidenceState:'licensed',
    rightsState:'licensed',
    sourceRefs:['test:licensed-mesh'],
  });
  const hero=project.nodes.find(node=>node.id==='hero-core');
  assert.ok(hero);
  hero!.geometry={kind:'asset',assetId:'licensed-mesh'};

  assert.throws(
    ()=>compileWorldForgeToWorldEngine({project}),
    /world_forge_world_engine_asset_license_required:licensed-mesh/,
  );
});


test('World Forge physics compiles into World Engine static and dynamic bodies',()=>{
  const project=createWorldForgeStarterProject();
  const floor=project.nodes.find(node=>node.id==='world-floor');
  const hero=project.nodes.find(node=>node.id==='hero-core');
  assert.ok(floor&&hero);

  floor!.physics={
    mode:'static',
    collider:{type:'auto_box'},
  };
  hero!.physics={
    mode:'dynamic',
    massKg:2.5,
    gravityScale:.8,
    linearDamping:.1,
    restitution:.25,
    collider:{type:'auto_box'},
  };

  const bridge=compileWorldForgeToWorldEngine({project});
  const floorEntity=bridge.world.entities.find(entity=>entity.id==='wfnode:world-floor');
  const heroEntity=bridge.world.entities.find(entity=>entity.id==='wfnode:hero-core');

  assert.deepEqual(floorEntity?.collider,{
    type:'box',
    halfExtents:{x:.5,y:.5,z:.5},
  });
  assert.equal(floorEntity?.rigidBody,undefined);

  assert.deepEqual(heroEntity?.collider,{
    type:'box',
    halfExtents:{x:.5,y:.5,z:.5},
  });
  assert.equal(heroEntity?.rigidBody?.mass,2.5);
  assert.equal(heroEntity?.rigidBody?.gravityScale,.8);
  assert.equal(heroEntity?.rigidBody?.linearDamping,.1);
  assert.equal(heroEntity?.rigidBody?.restitution,.25);
  assert.equal(heroEntity?.rigidBody?.kinematic,false);
});

test('World Forge auto collider refuses off-center editable geometry',()=>{
  const project=createWorldForgeStarterProject();
  const hero=project.nodes.find(node=>node.id==='hero-core');
  assert.ok(hero);
  hero!.geometry={
    kind:'editable_mesh',
    mesh:{
      vertices:[
        {x:0,y:0,z:0},
        {x:1,y:0,z:0},
        {x:1,y:1,z:0},
        {x:0,y:1,z:0},
        {x:0,y:0,z:1},
        {x:1,y:0,z:1},
        {x:1,y:1,z:1},
        {x:0,y:1,z:1},
      ],
      faces:[
        [0,3,2,1],[4,5,6,7],[0,1,5,4],
        [1,2,6,5],[2,3,7,6],[3,0,4,7],
      ],
    },
  };
  hero!.physics={
    mode:'dynamic',
    massKg:1,
    collider:{type:'auto_box'},
  };

  assert.throws(
    ()=>compileWorldForgeToWorldEngine({project}),
    /world_forge_world_engine_auto_collider_requires_centered_geometry:hero-core/,
  );
});
