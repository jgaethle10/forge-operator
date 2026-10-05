import test from 'node:test';
import assert from 'node:assert/strict';
import { EvercraftWorldRuntime, type WorldDefinition } from './engine.js';
import { WorldEntityStore } from './entity-store.js';
import { SceneStreamController, type SceneManifest } from './streaming.js';

const world:WorldDefinition={
  schema:'evercraft.world-engine.world.v1',
  id:'streaming-proof-world',
  version:1,
  tickRateHz:60,
  gravity:{x:0,y:0,z:0},
  entities:[
    {
      id:'global-anchor',
      transform:{position:{x:0,y:0,z:0}},
      tags:['global','anchor']
    },
    {
      id:'near-mover',
      transform:{position:{x:0,y:0,z:0}},
      rigidBody:{mass:1,velocity:{x:1,y:0,z:0}},
      collider:{type:'sphere',radius:.25},
      tags:['actor','near']
    },
    {
      id:'shared-mover',
      transform:{position:{x:10,y:0,z:0}},
      rigidBody:{mass:1,velocity:{x:0,y:0,z:1}},
      collider:{type:'sphere',radius:.25},
      tags:['actor','dependency']
    },
    {
      id:'far-mover',
      transform:{position:{x:100,y:0,z:0}},
      rigidBody:{mass:1,velocity:{x:1,y:0,z:0}},
      collider:{type:'sphere',radius:.25},
      tags:['actor','far']
    }
  ]
};

const manifest:SceneManifest={
  schema:'evercraft.world-engine.scene-manifest.v1',
  worldId:world.id,
  chunks:[
    {
      id:'core',
      bounds:{min:{x:-5,y:-5,z:-5},max:{x:5,y:5,z:5}},
      entityIds:['near-mover'],
      preloadRadius:5,
      dependencies:['shared'],
      priority:10
    },
    {
      id:'shared',
      bounds:{min:{x:8,y:-5,z:-5},max:{x:12,y:5,z:5}},
      entityIds:['shared-mover'],
      preloadRadius:0
    },
    {
      id:'far',
      bounds:{min:{x:95,y:-5,z:-5},max:{x:105,y:5,z:5}},
      entityIds:['far-mover'],
      preloadRadius:5
    }
  ]
};

test('entity store queries are canonical regardless of insertion order',()=>{
  const a=new WorldEntityStore(world.entities);
  const b=new WorldEntityStore([...world.entities].reverse());

  assert.deepEqual(a.ids(),b.ids());
  assert.deepEqual(
    a.query({allTags:['actor'],components:['rigidBody','collider']}).map(entity=>entity.id),
    ['far-mover','near-mover','shared-mover']
  );
  assert.deepEqual(a.idsForTag('actor'),['far-mover','near-mover','shared-mover']);
  assert.deepEqual(a.idsForComponent('collider'),['far-mover','near-mover','shared-mover']);
});

test('scene planner loads nearby chunks plus dependencies and keeps globals active',()=>{
  const controller=new SceneStreamController(world,manifest);
  const plan=controller.transition({x:0,y:0,z:0});

  assert.deepEqual(plan.activeAfter,['core','shared']);
  assert.deepEqual(plan.load,['core','shared']);
  assert.deepEqual(plan.unload,[]);
  assert.deepEqual(plan.globalEntityIds,['global-anchor']);
  assert.deepEqual(plan.activeEntityIds,['global-anchor','near-mover','shared-mover']);
});

test('streaming activation freezes distant simulation without discarding state',()=>{
  const controller=new SceneStreamController(world,manifest);
  const runtime=new EvercraftWorldRuntime(world);

  const nearPlan=controller.transition({x:0,y:0,z:0});
  controller.apply(runtime,nearPlan);
  runtime.run(60);

  const nearAfterFirst=runtime.entity('near-mover')!;
  const sharedAfterFirst=runtime.entity('shared-mover')!;
  const farAfterFirst=runtime.entity('far-mover')!;

  assert.ok(nearAfterFirst.transform.position.x>.9);
  assert.ok(sharedAfterFirst.transform.position.z>.9);
  assert.equal(farAfterFirst.transform.position.x,100);

  const farPlan=controller.transition({x:100,y:0,z:0});
  assert.deepEqual(farPlan.load,['far']);
  assert.deepEqual(farPlan.unload,['core','shared']);
  controller.apply(runtime,farPlan);
  runtime.run(60);

  const nearAfterSecond=runtime.entity('near-mover')!;
  const sharedAfterSecond=runtime.entity('shared-mover')!;
  const farAfterSecond=runtime.entity('far-mover')!;

  assert.equal(nearAfterSecond.transform.position.x,nearAfterFirst.transform.position.x);
  assert.equal(sharedAfterSecond.transform.position.z,sharedAfterFirst.transform.position.z);
  assert.ok(farAfterSecond.transform.position.x>100.9);
  assert.deepEqual(runtime.activeEntityIds,['far-mover','global-anchor']);
});

test('stream plans are deterministic from the same state and focus',()=>{
  const first=new SceneStreamController(world,manifest).preview({x:0,y:0,z:0});
  const second=new SceneStreamController(world,manifest).preview({x:0,y:0,z:0});
  assert.equal(first.digest,second.digest);
});

test('manifest rejects ambiguous entity ownership',()=>{
  const invalid:SceneManifest={
    schema:'evercraft.world-engine.scene-manifest.v1',
    worldId:world.id,
    chunks:[
      {
        id:'a',
        bounds:{min:{x:0,y:0,z:0},max:{x:1,y:1,z:1}},
        entityIds:['near-mover'],
        preloadRadius:0
      },
      {
        id:'b',
        bounds:{min:{x:2,y:0,z:0},max:{x:3,y:1,z:1}},
        entityIds:['near-mover'],
        preloadRadius:0
      }
    ]
  };

  assert.throws(
    ()=>new SceneStreamController(world,invalid),
    /scene_stream_entity_multi_chunk/
  );
});
