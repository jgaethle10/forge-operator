import assert from 'node:assert/strict';
import test from 'node:test';

import { applyWorldForgeOperations } from './world-forge.js';
import { createWorldForgeStarterProject } from './world-forge-http.js';
import {
  WorldForgePlaySession,
  WorldForgePlaySessionRegistry,
  verifyWorldForgePlayStepReceipt,
} from './world-forge-play-session.js';

test('World Forge Play Mode starts at deterministic tick zero and steps inputs',()=>{
  const project=createWorldForgeStarterProject();
  const session=new WorldForgePlaySession({
    sessionId:'play-basic',
    project,
  });

  const start=session.summary();
  assert.equal(start.tick,0);
  assert.equal(start.projectVersion,project.version);
  assert.equal(start.runtimeReady,true);
  assert.equal(start.boundaries.ephemeralSession,true);
  assert.equal(start.boundaries.publicationAuthorityGranted,false);

  const heroEntityId='wfnode:hero-core';
  const stepped=session.step({
    ticks:3,
    inputs:[{
      id:'mark-hero',
      tick:2,
      entityId:heroEntityId,
      kind:'set_property',
      key:'runtimeMarker',
      value:'alive',
    }],
  });

  assert.equal(stepped.snapshot.tick,3);
  assert.equal(stepped.receipt.fromTick,0);
  assert.equal(stepped.receipt.toTick,3);
  assert.equal(stepped.receipt.inputCount,1);
  assert.equal(verifyWorldForgePlayStepReceipt(stepped.receipt),true);

  const hero=stepped.snapshot.entities.find(entity=>entity.id===heroEntityId);
  assert.equal(hero?.properties?.runtimeMarker,'alive');
});

test('Play Mode live-syncs an authored revision into the running session and continues tick lineage',()=>{
  const before=createWorldForgeStarterProject();
  const session=new WorldForgePlaySession({
    sessionId:'play-live-sync',
    project:before,
  });

  const first=session.step({ticks:5});
  assert.equal(first.snapshot.tick,5);

  const mutation=applyWorldForgeOperations({
    project:before,
    expectedVersion:before.version,
    operations:[{
      type:'set_transform',
      nodeId:'hero-core',
      transform:{position:{x:2,y:0,z:1}},
    }],
  });
  assert.equal(mutation.status,'completed');

  const synced=session.syncProject({
    afterProject:mutation.project,
    actor:{kind:'human',id:'world-forge-editor'},
    reason:'Move hero during Play Mode',
  });

  assert.equal(synced.session.tick,5);
  assert.equal(synced.session.projectVersion,mutation.project.version);
  assert.equal(synced.runtimeSync.snapshot.tick,5);
  assert.equal(synced.runtimeSync.receipt.runtimeStateMigrated,true);

  const hero=synced.runtimeSync.snapshot.entities.find(
    entity=>entity.id==='wfnode:hero-core'
  );
  assert.deepEqual(hero?.transform.position,{x:2,y:1,z:0});

  const continued=session.step({ticks:4});
  assert.equal(continued.snapshot.tick,9);
  assert.equal(session.summary().tick,9);
});

test('Play Mode preserves compatible runtime properties across unrelated authored edits',()=>{
  const before=createWorldForgeStarterProject();
  const session=new WorldForgePlaySession({
    sessionId:'play-preserve-runtime',
    project:before,
  });

  const marked=session.step({
    ticks:2,
    inputs:[{
      id:'runtime-note',
      tick:1,
      entityId:'wfnode:hero-core',
      kind:'set_property',
      key:'runtimeOnly',
      value:42,
    }],
  });
  assert.equal(marked.snapshot.entities.find(
    entity=>entity.id==='wfnode:hero-core'
  )?.properties?.runtimeOnly,42);

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

  const synced=session.syncProject({
    afterProject:mutation.project,
    actor:{kind:'agent',id:'saban-layout'},
  });

  const hero=synced.runtimeSync.snapshot.entities.find(
    entity=>entity.id==='wfnode:hero-core'
  );
  assert.equal(hero?.properties?.runtimeOnly,42);
  assert.equal(synced.runtimeSync.migrationReceipt.tick,2);
});

test('Play Mode rejects input events outside the requested tick window',()=>{
  const project=createWorldForgeStarterProject();
  const session=new WorldForgePlaySession({
    sessionId:'play-input-window',
    project,
  });

  assert.throws(
    ()=>session.step({
      ticks:2,
      inputs:[{
        id:'too-late',
        tick:4,
        entityId:'wfnode:hero-core',
        kind:'set_property',
        key:'x',
        value:1,
      }],
    }),
    /world_forge_play_input_tick_out_of_window/,
  );

  assert.equal(session.summary().tick,0);
});

test('Play Mode registry enforces identity, capacity and stop semantics',()=>{
  const project=createWorldForgeStarterProject();
  const registry=new WorldForgePlaySessionRegistry(2,60_000);

  registry.start({sessionId:'one',project});
  registry.start({sessionId:'two',project});
  assert.equal(registry.list().length,2);

  assert.throws(
    ()=>registry.start({sessionId:'three',project}),
    /world_forge_play_session_capacity_reached/,
  );
  assert.throws(
    ()=>registry.start({sessionId:'one',project}),
    /world_forge_play_session_exists:one/,
  );

  assert.equal(registry.stop('one'),'one');
  assert.equal(registry.list().length,1);
  assert.throws(
    ()=>registry.get('one'),
    /world_forge_play_session_missing:one/,
  );
});


test('Play Mode projects runtime transforms into Forge space without mutating authored state',()=>{
  const project=createWorldForgeStarterProject();
  const authoredHero=structuredClone(
    project.nodes.find(node=>node.id==='hero-core')!.transform,
  );
  const session=new WorldForgePlaySession({
    sessionId:'play-runtime-projection',
    project,
  });

  const startProjection=session.runtimeProjection();
  const startHero=startProjection.nodeTransforms.find(item=>item.nodeId==='hero-core');
  assert.ok(startHero);
  assert.deepEqual(startHero!.transform.position,authoredHero.position);
  assert.equal(startProjection.canonicalAuthoringMutation,false);

  session.step({
    ticks:1,
    inputs:[{
      id:'teleport-runtime-hero',
      tick:1,
      entityId:'wfnode:hero-core',
      kind:'teleport',
      value:{x:4,y:2,z:-3},
    }],
  });

  const projection=session.runtimeProjection();
  const runtimeHero=projection.nodeTransforms.find(item=>item.nodeId==='hero-core');
  assert.ok(runtimeHero);
  assert.deepEqual(runtimeHero!.transform.position,{x:4,y:3,z:2});
  assert.equal(projection.tick,1);

  const authoredAfter=session.project.nodes.find(node=>node.id==='hero-core');
  assert.deepEqual(authoredAfter?.transform,authoredHero);
});
