import assert from 'node:assert/strict';
import test from 'node:test';

import { createWorldForgeStarterProject } from './world-forge-http.js';
import { createWorldForgeChangeSet } from './world-forge-changeset.js';
import { makeNodeEditableOperation } from './world-forge-mesh.js';
import { compileWorldForgeToWorldEngine } from './world-forge-world-engine.js';
import {
  syncWorldForgeChangeSetWithLiveRuntime,
  verifyWorldForgeLiveRuntimeMigrationReceipt,
} from './world-forge-runtime-migration.js';
import { EvercraftWorldRuntime } from '../world-engine/engine.js';

function liveStarter(){
  const project=createWorldForgeStarterProject();
  const bridge=compileWorldForgeToWorldEngine({project});
  const runtime=new EvercraftWorldRuntime(bridge.world);
  const heroId=bridge.receipt.nodeEntityMap.find(
    item=>item.nodeId==='hero-core',
  )?.entityId;
  if(!heroId) throw new Error('test_hero_mapping_missing');

  const snapshot=runtime.step([{
    id:'teleport-hero',
    tick:1,
    entityId:heroId,
    kind:'teleport',
    value:{x:5,y:3,z:2},
  }]);

  return {project,bridge,snapshot,heroId};
}

test('visual-only Forge edit preserves compatible live runtime transform',()=>{
  const {project,bridge,snapshot,heroId}=liveStarter();
  const changeSet=createWorldForgeChangeSet({
    project,
    id:'hide-hero-live',
    title:'Hide hero while running',
    author:{kind:'human',id:'studio-operator'},
    operations:[{
      type:'set_visibility',
      nodeId:'hero-core',
      visible:false,
    }],
  });

  const result=syncWorldForgeChangeSetWithLiveRuntime({
    project,
    changeSet,
    runtimeWorld:bridge.world,
    runtimeAssets:bridge.assets,
    runtimeSnapshot:snapshot,
  });

  const hero=result.snapshot.entities.find(entity=>entity.id===heroId);
  assert.ok(hero);
  assert.deepEqual(hero!.transform.position,{x:5,y:3,z:2});
  assert.equal(result.snapshot.tick,snapshot.tick);
  assert.equal(result.snapshot.timeSec,snapshot.timeSec);

  const note=result.migrationReceipt.entityNotes.find(
    item=>item.entityId===heroId,
  );
  assert.ok(note);
  assert.ok(note!.preserved.includes('transform'));
  assert.equal(result.receipt.boundaries.worldEngineOwnsMigrationPolicy,true);
  assert.equal(verifyWorldForgeLiveRuntimeMigrationReceipt(result.receipt),true);
});

test('authored Forge transform change wins over live runtime transform',()=>{
  const {project,bridge,snapshot,heroId}=liveStarter();
  const changeSet=createWorldForgeChangeSet({
    project,
    id:'author-hero-position',
    title:'Author hero position',
    author:{kind:'agent',id:'saban-layout'},
    operations:[{
      type:'set_transform',
      nodeId:'hero-core',
      transform:{position:{x:2,y:0,z:1}},
    }],
  });

  const result=syncWorldForgeChangeSetWithLiveRuntime({
    project,
    changeSet,
    runtimeWorld:bridge.world,
    runtimeAssets:bridge.assets,
    runtimeSnapshot:snapshot,
  });

  const hero=result.snapshot.entities.find(entity=>entity.id===heroId);
  assert.ok(hero);
  // Forge Z-up {2,0,1} -> World Engine Y-up {2,1,0}.
  assert.deepEqual(hero!.transform.position,{x:2,y:1,z:0});

  const note=result.migrationReceipt.entityNotes.find(
    item=>item.entityId===heroId,
  );
  assert.ok(note);
  assert.ok(note!.reset.includes('transform'));
});

test('geometry authoring preserves live transform when authored transform contract is unchanged',()=>{
  const {project,bridge,snapshot,heroId}=liveStarter();
  const changeSet=createWorldForgeChangeSet({
    project,
    id:'editable-hero-running',
    title:'Make running hero editable',
    author:{kind:'human',id:'studio-operator'},
    operations:[makeNodeEditableOperation({
      project,
      nodeId:'hero-core',
    })],
  });

  const result=syncWorldForgeChangeSetWithLiveRuntime({
    project,
    changeSet,
    runtimeWorld:bridge.world,
    runtimeAssets:bridge.assets,
    runtimeSnapshot:snapshot,
  });

  const hero=result.snapshot.entities.find(entity=>entity.id===heroId);
  assert.ok(hero);
  assert.deepEqual(hero!.transform.position,{x:5,y:3,z:2});

  const note=result.migrationReceipt.entityNotes.find(
    item=>item.entityId===heroId,
  );
  assert.ok(note);
  assert.ok(note!.preserved.includes('transform'));
  assert.ok(result.sync.receipt.geometryHotReloadIds.length>=1);
  assert.equal(result.sync.receipt.semanticWorldVerified,true);
  assert.equal(result.sync.receipt.semanticAssetsVerified,true);
});

test('new Forge entities are reconciled into the live snapshot and activated by default',()=>{
  const {project,bridge,snapshot}=liveStarter();
  const node={
    id:'runtime-prop',
    name:'Runtime Prop',
    kind:'mesh' as const,
    transform:{
      position:{x:1,y:2,z:1},
      rotationDeg:{x:0,y:0,z:0},
      scale:{x:1,y:1,z:1},
    },
    geometry:{kind:'primitive' as const,primitive:'cube' as const},
    materialIds:['material-graphite'],
    visible:true,
  };
  const changeSet=createWorldForgeChangeSet({
    project,
    id:'add-runtime-prop',
    title:'Add runtime prop',
    author:{kind:'agent',id:'saban-props'},
    operations:[{type:'add_node',node}],
  });

  const result=syncWorldForgeChangeSetWithLiveRuntime({
    project,
    changeSet,
    runtimeWorld:bridge.world,
    runtimeAssets:bridge.assets,
    runtimeSnapshot:snapshot,
  });

  const entityId=result.sync.bridgeReceiptAfter.nodeEntityMap.find(
    item=>item.nodeId==='runtime-prop',
  )?.entityId;
  assert.ok(entityId);
  assert.ok(result.snapshot.entities.some(entity=>entity.id===entityId));
  assert.ok(result.snapshot.activeEntityIds.includes(entityId!));
  assert.ok(result.migrationReceipt.addedEntityIds.includes(entityId!));
});

test('live migration fails closed on a tampered source snapshot',()=>{
  const {project,bridge,snapshot}=liveStarter();
  const tampered=structuredClone(snapshot);
  tampered.tick+=1;

  const changeSet=createWorldForgeChangeSet({
    project,
    id:'tampered-source',
    title:'Tampered source',
    author:{kind:'system',id:'migration-test'},
    operations:[{
      type:'set_visibility',
      nodeId:'hero-core',
      visible:false,
    }],
  });

  assert.throws(
    ()=>syncWorldForgeChangeSetWithLiveRuntime({
      project,
      changeSet,
      runtimeWorld:bridge.world,
      runtimeAssets:bridge.assets,
      runtimeSnapshot:tampered,
    }),
    /world_forge_live_migration_snapshot_digest_invalid/,
  );
});
