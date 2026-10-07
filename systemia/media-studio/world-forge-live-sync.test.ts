import assert from 'node:assert/strict';
import test from 'node:test';

import { applyWorldForgeOperations } from './world-forge.js';
import { createWorldForgeStarterProject } from './world-forge-http.js';
import { compileWorldForgeToWorldEngine } from './world-forge-world-engine.js';
import { EvercraftWorldRuntime } from '../world-engine/engine.js';
import {
  applyWorldForgeLiveSyncToRuntime,
  compileWorldForgeLiveSync,
  verifyWorldForgeLiveRuntimeSyncReceipt,
  verifyWorldForgeLiveSyncReceipt,
} from './world-forge-live-sync.js';

test('World Forge transform edit becomes one World Engine set_transform operation',()=>{
  const before=createWorldForgeStarterProject();
  const mutation=applyWorldForgeOperations({
    project:before,
    expectedVersion:before.version,
    operations:[{
      type:'set_transform',
      nodeId:'hero-core',
      transform:{position:{x:1.25,y:0,z:1}},
    }],
  });
  assert.equal(mutation.status,'completed');

  const sync=compileWorldForgeLiveSync({
    syncId:'transform-only',
    beforeProject:before,
    afterProject:mutation.project,
    actor:{kind:'human',id:'studio-operator'},
  });

  assert.equal(sync.transaction.operations.length,1);
  assert.equal(sync.transaction.operations[0].kind,'set_transform');
  assert.deepEqual(sync.receipt.operationKinds,{set_transform:1});
  assert.deepEqual(sync.receipt.changedMaterialIds,[]);
  assert.deepEqual(sync.receipt.changedAssetIds,[]);
  assert.equal(sync.receipt.boundaries.geometryCacheMutationRequired,false);
  assert.equal(verifyWorldForgeLiveSyncReceipt(sync.receipt),true);
});

test('World Forge geometry edit yields entity update plus geometry asset cache delta',()=>{
  const before=createWorldForgeStarterProject();
  const hero=before.nodes.find(node=>node.id==='hero-core');
  assert.equal(hero?.geometry?.kind,'primitive');

  const mutation=applyWorldForgeOperations({
    project:before,
    expectedVersion:before.version,
    operations:[{
      type:'set_geometry',
      nodeId:'hero-core',
      geometry:{
        kind:'editable_mesh',
        mesh:{
          vertices:[
            {x:-.5,y:-.5,z:-.5},
            {x:.5,y:-.5,z:-.5},
            {x:.5,y:.5,z:-.5},
            {x:-.5,y:.5,z:-.5},
            {x:-.5,y:-.5,z:.75},
            {x:.5,y:-.5,z:.75},
            {x:.5,y:.5,z:.75},
            {x:-.5,y:.5,z:.75},
          ],
          faces:[
            [0,3,2,1],
            [4,5,6,7],
            [0,1,5,4],
            [1,2,6,5],
            [2,3,7,6],
            [3,0,4,7],
          ],
        },
      },
    }],
  });
  assert.equal(mutation.status,'completed');

  const sync=compileWorldForgeLiveSync({
    syncId:'geometry-change',
    beforeProject:before,
    afterProject:mutation.project,
    actor:{kind:'agent',id:'saban-modeler'},
  });

  assert.ok(sync.transaction.operations.some(operation=>operation.kind==='upsert_entity'));
  assert.ok(sync.transaction.operations.some(operation=>operation.kind==='upsert_asset'));
  assert.equal(
    sync.transaction.operations.some(operation=>operation.kind==='remove_asset'),
    false,
  );
  assert.equal(sync.geometryDelta.added.length,1);
  assert.equal(sync.geometryDelta.removed.length,0);
  assert.equal(sync.geometryDelta.changed.length,0);
  assert.equal(sync.receipt.boundaries.geometryCacheMutationRequired,true);
  assert.equal(sync.geometryDelta.targetAssets.length,2);
  assert.ok(
    sync.geometryDelta.targetAssets.some(
      geometry=>geometry.id===sync.before.geometries[0].id,
    ),
    'shared cube geometry must remain because other starter nodes still reference it',
  );
});

test('World Forge material edit compiles to minimal material upsert',()=>{
  const before=createWorldForgeStarterProject();
  const after=structuredClone(before);
  after.version+=1;
  after.updatedAt=new Date(Date.parse(before.updatedAt)+1000).toISOString();
  const material=after.materials.find(item=>item.id==='material-ice');
  assert.ok(material);
  material!.roughness=.18;

  const sync=compileWorldForgeLiveSync({
    syncId:'material-change',
    beforeProject:before,
    afterProject:after,
    actor:{kind:'human',id:'lookdev'},
  });

  assert.equal(sync.transaction.operations.length,1);
  assert.equal(sync.transaction.operations[0].kind,'upsert_material');
  assert.deepEqual(sync.receipt.operationKinds,{upsert_material:1});
  assert.deepEqual(sync.receipt.changedEntityIds,[]);
  assert.equal(sync.receipt.boundaries.geometryCacheMutationRequired,false);
});

test('World Forge live sync refuses top-level camera activation changes that need full compile',()=>{
  const before=createWorldForgeStarterProject();
  const after=structuredClone(before);
  after.nodes.push({
    id:'camera-alt',
    name:'Alt Camera',
    kind:'camera',
    transform:{
      position:{x:3,y:-5,z:3},
      rotationDeg:{x:70,y:0,z:30},
      scale:{x:1,y:1,z:1},
    },
    camera:{
      projection:'perspective',
      focalLengthMm:50,
      sensorWidthMm:36,
      lookAt:{x:0,y:0,z:1},
      near:.05,
      far:200,
    },
    visible:true,
  });
  after.activeCameraNodeId='camera-alt';
  after.version+=1;
  after.updatedAt=new Date(Date.parse(before.updatedAt)+1000).toISOString();

  assert.throws(
    ()=>compileWorldForgeLiveSync({
      syncId:'camera-switch',
      beforeProject:before,
      afterProject:after,
      actor:{kind:'human',id:'director'},
    }),
    /world_forge_live_sync_top_level_contract_change_requires_full_recompile/,
  );
});

test('World Forge live sync refuses project identity changes and non-advanced versions',()=>{
  const before=createWorldForgeStarterProject();
  const same=structuredClone(before);
  assert.throws(
    ()=>compileWorldForgeLiveSync({
      syncId:'same-version',
      beforeProject:before,
      afterProject:same,
      actor:{kind:'system',id:'test'},
    }),
    /world_forge_live_sync_version_not_advanced/,
  );

  const other=structuredClone(before);
  other.id='different-project';
  other.version+=1;
  assert.throws(
    ()=>compileWorldForgeLiveSync({
      syncId:'different-project',
      beforeProject:before,
      afterProject:other,
      actor:{kind:'system',id:'test'},
    }),
    /world_forge_live_sync_project_id_mismatch/,
  );
});

test('World Forge live sync receipt detects tampering',()=>{
  const before=createWorldForgeStarterProject();
  const mutation=applyWorldForgeOperations({
    project:before,
    expectedVersion:before.version,
    operations:[{
      type:'set_visibility',
      nodeId:'plinth-left',
      visible:false,
    }],
  });
  assert.equal(mutation.status,'completed');

  const sync=compileWorldForgeLiveSync({
    syncId:'tamper-proof',
    beforeProject:before,
    afterProject:mutation.project,
    actor:{kind:'system',id:'test'},
  });
  const tampered=structuredClone(sync.receipt);
  tampered.operationCount+=1;
  assert.equal(verifyWorldForgeLiveSyncReceipt(tampered),false);
});


test('World Forge live runtime sync preserves running tick and migrates to edited definition',()=>{
  const before=createWorldForgeStarterProject();
  const beforeBridge=compileWorldForgeToWorldEngine({project:before});
  const runtime=new EvercraftWorldRuntime(beforeBridge.world);
  const running=runtime.run(7);
  assert.equal(running.tick,7);

  const mutation=applyWorldForgeOperations({
    project:before,
    expectedVersion:before.version,
    operations:[{
      type:'set_transform',
      nodeId:'hero-core',
      transform:{position:{x:1.5,y:0,z:1}},
    }],
  });
  assert.equal(mutation.status,'completed');

  const result=applyWorldForgeLiveSyncToRuntime({
    syncId:'running-transform',
    beforeProject:before,
    afterProject:mutation.project,
    actor:{kind:'human',id:'studio-operator'},
    previousSnapshot:running,
    currentGeometries:beforeBridge.geometries,
  });

  assert.equal(result.snapshot.tick,7);
  assert.equal(result.snapshot.worldVersion,mutation.project.version);
  assert.equal(
    result.snapshot.definitionDigest,
    result.sync.applied.receipt.afterWorldDigest,
  );
  const heroMap=result.sync.target.receipt.nodeEntityMap.find(item=>item.nodeId==='hero-core');
  assert.ok(heroMap);
  const hero=result.snapshot.entities.find(entity=>entity.id===heroMap!.entityId);
  assert.ok(hero);
  assert.deepEqual(hero!.transform.position,{x:1.5,y:1,z:0});
  assert.equal(result.migrationReceipt.tick,7);
  assert.equal(result.geometryHotReloadReceipts.length,0);
  assert.equal(result.receipt.runtimeStateMigrated,true);
  assert.equal(result.receipt.geometryStateVerified,true);
  assert.equal(verifyWorldForgeLiveRuntimeSyncReceipt(result.receipt),true);
});

test('World Forge live runtime sync reconciles geometry through owned hot reload',()=>{
  const before=createWorldForgeStarterProject();
  const beforeBridge=compileWorldForgeToWorldEngine({project:before});
  const runtime=new EvercraftWorldRuntime(beforeBridge.world);
  const running=runtime.run(3);

  const mutation=applyWorldForgeOperations({
    project:before,
    expectedVersion:before.version,
    operations:[{
      type:'set_geometry',
      nodeId:'hero-core',
      geometry:{
        kind:'editable_mesh',
        mesh:{
          vertices:[
            {x:-.5,y:-.5,z:-.5},{x:.5,y:-.5,z:-.5},
            {x:.5,y:.5,z:-.5},{x:-.5,y:.5,z:-.5},
            {x:-.5,y:-.5,z:1},{x:.5,y:-.5,z:1},
            {x:.5,y:.5,z:1},{x:-.5,y:.5,z:1},
          ],
          faces:[
            [0,3,2,1],[4,5,6,7],[0,1,5,4],
            [1,2,6,5],[2,3,7,6],[3,0,4,7],
          ],
        },
      },
    }],
  });
  assert.equal(mutation.status,'completed');

  const result=applyWorldForgeLiveSyncToRuntime({
    syncId:'running-geometry',
    beforeProject:before,
    afterProject:mutation.project,
    actor:{kind:'agent',id:'saban-modeler'},
    previousSnapshot:running,
    currentGeometries:beforeBridge.geometries,
  });

  assert.equal(result.snapshot.tick,3);
  assert.equal(result.geometryHotReloadReceipts.length,1);
  assert.equal(result.geometryHotReloadReceipts[0].replaced,false);
  assert.equal(result.receipt.geometryRemovedIds.length,0);
  assert.equal(result.geometries.length,2);
  assert.deepEqual(
    result.geometries.map(item=>item.id).sort(),
    result.sync.target.geometries.map(item=>item.id).sort(),
  );
  assert.ok(
    result.geometries.some(item=>item.id===beforeBridge.geometries[0].id),
    'shared starter cube remains resident after hero geometry diverges',
  );
});

test('World Forge live runtime sync rejects stale runtime snapshot and geometry cache',()=>{
  const before=createWorldForgeStarterProject();
  const mutation=applyWorldForgeOperations({
    project:before,
    expectedVersion:before.version,
    operations:[{
      type:'set_visibility',
      nodeId:'plinth-right',
      visible:false,
    }],
  });
  assert.equal(mutation.status,'completed');

  const beforeBridge=compileWorldForgeToWorldEngine({project:before});
  const targetBridge=compileWorldForgeToWorldEngine({project:mutation.project});
  const staleSnapshot=new EvercraftWorldRuntime(targetBridge.world).snapshot();

  assert.throws(
    ()=>applyWorldForgeLiveSyncToRuntime({
      syncId:'stale-runtime',
      beforeProject:before,
      afterProject:mutation.project,
      actor:{kind:'system',id:'test'},
      previousSnapshot:staleSnapshot,
      currentGeometries:beforeBridge.geometries,
    }),
    /world_forge_live_runtime_snapshot_version_mismatch/,
  );

  const correctSnapshot=new EvercraftWorldRuntime(beforeBridge.world).snapshot();
  assert.throws(
    ()=>applyWorldForgeLiveSyncToRuntime({
      syncId:'stale-geometry',
      beforeProject:before,
      afterProject:mutation.project,
      actor:{kind:'system',id:'test'},
      previousSnapshot:correctSnapshot,
      currentGeometries:[],
    }),
    /world_forge_live_runtime_geometry_base_mismatch/,
  );
});

test('World Forge live sync refuses revision gaps rather than collapsing lineage',()=>{
  const before=createWorldForgeStarterProject();
  const after=structuredClone(before);
  after.version+=2;

  assert.throws(
    ()=>compileWorldForgeLiveSync({
      syncId:'revision-gap',
      beforeProject:before,
      afterProject:after,
      actor:{kind:'system',id:'test'},
    }),
    /world_forge_live_sync_revision_gap_requires_full_recompile/,
  );
});
