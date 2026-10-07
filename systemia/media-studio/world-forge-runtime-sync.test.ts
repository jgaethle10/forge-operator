import assert from 'node:assert/strict';
import test from 'node:test';

import { createWorldForgeStarterProject } from './world-forge-http.js';
import { createWorldForgeChangeSet } from './world-forge-changeset.js';
import { makeNodeEditableOperation } from './world-forge-mesh.js';
import { compileWorldForgeToWorldEngine } from './world-forge-world-engine.js';
import {
  syncWorldForgeChangeSetToRuntime,
  verifyWorldForgeRuntimeSyncReceipt,
} from './world-forge-runtime-sync.js';

test('transform ChangeSet becomes one World Engine transform edit without asset churn',()=>{
  const project=createWorldForgeStarterProject();
  const initial=compileWorldForgeToWorldEngine({project});
  const changeSet=createWorldForgeChangeSet({
    project,
    id:'move-hero-live',
    title:'Move hero live',
    author:{kind:'agent',id:'saban-layout'},
    operations:[{
      type:'set_transform',
      nodeId:'hero-core',
      transform:{position:{x:1.25,y:0,z:1}},
    }],
  });

  const synced=syncWorldForgeChangeSetToRuntime({
    project,
    changeSet,
    runtimeWorld:initial.world,
    runtimeAssets:initial.assets,
  });

  assert.equal(synced.nextProject.version,project.version+1);
  assert.equal(synced.runtime.world.version,initial.world.version+1);
  assert.equal(synced.transaction.operations.length,1);
  assert.equal(synced.transaction.operations[0].kind,'set_transform');
  assert.equal(synced.runtime.assets.digest,initial.assets.digest);
  assert.equal(synced.receipt.semanticWorldVerified,true);
  assert.equal(synced.receipt.semanticAssetsVerified,true);
  assert.equal(synced.receipt.boundaries.runtimeMutationUsesWorldEngineEditContract,true);
  assert.equal(verifyWorldForgeRuntimeSyncReceipt(synced.receipt),true);
});

test('geometry ChangeSet adds materialized runtime geometry and updates the entity atomically',()=>{
  const project=createWorldForgeStarterProject();
  const initial=compileWorldForgeToWorldEngine({project});
  const changeSet=createWorldForgeChangeSet({
    project,
    id:'editable-hero-live',
    title:'Convert hero geometry',
    author:{kind:'human',id:'studio-operator'},
    operations:[makeNodeEditableOperation({
      project,
      nodeId:'hero-core',
    })],
  });

  const synced=syncWorldForgeChangeSetToRuntime({
    project,
    changeSet,
    runtimeWorld:initial.world,
    runtimeAssets:initial.assets,
  });

  const kinds=synced.transaction.operations.map(operation=>operation.kind);
  assert.ok(kinds.includes('upsert_asset'));
  assert.ok(kinds.includes('upsert_entity'));
  assert.ok(synced.runtime.assets.assets.length>initial.assets.assets.length);
  assert.equal(
    synced.runtime.receipt.changedEntityIds.length,
    1,
  );
  assert.ok(synced.runtime.receipt.changedAssetIds.length>=1);
});

test('runtime sync fails closed when runtime state drifted from the Forge base',()=>{
  const project=createWorldForgeStarterProject();
  const initial=compileWorldForgeToWorldEngine({project});
  const drifted=structuredClone(initial.world);
  const heroMap=initial.receipt.nodeEntityMap.find(item=>item.nodeId==='hero-core');
  assert.ok(heroMap);
  const hero=drifted.entities.find(entity=>entity.id===heroMap!.entityId);
  assert.ok(hero);
  hero!.transform.position.x=99;

  const changeSet=createWorldForgeChangeSet({
    project,
    id:'move-after-drift',
    title:'Move after drift',
    author:{kind:'agent',id:'saban-layout'},
    operations:[{
      type:'set_transform',
      nodeId:'hero-core',
      transform:{position:{x:2,y:0,z:1}},
    }],
  });

  assert.throws(
    ()=>syncWorldForgeChangeSetToRuntime({
      project,
      changeSet,
      runtimeWorld:drifted,
      runtimeAssets:initial.assets,
    }),
    /world_forge_runtime_sync_runtime_world_semantic_mismatch/,
  );
});

test('runtime sync receipt detects tampering',()=>{
  const project=createWorldForgeStarterProject();
  const initial=compileWorldForgeToWorldEngine({project});
  const changeSet=createWorldForgeChangeSet({
    project,
    id:'hide-plinth-live',
    title:'Hide plinth live',
    author:{kind:'system',id:'studio-sync-test'},
    operations:[{
      type:'set_visibility',
      nodeId:'plinth-left',
      visible:false,
    }],
  });

  const synced=syncWorldForgeChangeSetToRuntime({
    project,
    changeSet,
    runtimeWorld:initial.world,
    runtimeAssets:initial.assets,
  });
  const tampered=structuredClone(synced.receipt);
  tampered.operationCount+=1;
  assert.equal(verifyWorldForgeRuntimeSyncReceipt(tampered),false);
});
