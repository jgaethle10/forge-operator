import test from 'node:test';
import assert from 'node:assert/strict';
import { EvercraftWorldRuntime, sealWorldSnapshot, type WorldDefinition } from './engine.js';
import {
  migrateWorldRuntime,
  verifyWorldRuntimeMigrationReceipt
} from './runtime-migration.js';

function baseWorld():WorldDefinition{
  return {
    schema:'evercraft.world-engine.world.v1',
    id:'migration-proof-world',
    version:1,
    tickRateHz:10,
    gravity:{x:0,y:0,z:0},
    visualScene:{
      schema:'evercraft.world-engine.visual-scene.v1',
      initialCameraEntityId:'camera',
      materials:[{
        id:'hero-material',
        model:'pbr',
        baseColor:{r:.8,g:.8,b:.8,a:1},
        metallic:0,
        roughness:.8
      }]
    },
    audioScene:{
      schema:'evercraft.world-engine.audio-scene.v1',
      initialListenerEntityId:'listener',
      clips:[{
        id:'tone',
        assetRef:'fallen:audio:tone',
        durationSec:4
      }],
      buses:[{id:'sfx',gain:1}]
    },
    entities:[
      {
        id:'camera',
        transform:{position:{x:0,y:2,z:6}},
        camera:{
          projection:{type:'perspective',fovYDeg:60},
          near:.1,
          far:100
        }
      },
      {
        id:'hero',
        transform:{position:{x:0,y:0,z:0}},
        rigidBody:{
          mass:1,
          velocity:{x:1,y:0,z:0},
          acceleration:{x:0,y:0,z:0},
          linearDamping:0
        },
        collider:{type:'sphere',radius:.5},
        renderable:{
          geometryRef:'geometry:hero',
          materialId:'hero-material'
        },
        properties:{mode:'runtime'}
      },
      {
        id:'listener',
        transform:{position:{x:0,y:0,z:0}},
        audioListener:{gain:1}
      },
      {
        id:'speaker',
        transform:{position:{x:2,y:0,z:0}},
        audioEmitter:{
          clipId:'tone',
          busId:'sfx',
          gain:1,
          autoplay:true,
          loop:true,
          spatialMode:'3d',
          minDistance:1,
          maxDistance:10
        }
      }
    ]
  };
}

function sourceSnapshot(world=baseWorld()){
  const runtime=new EvercraftWorldRuntime(world);
  runtime.run(5);
  return {runtime,snapshot:runtime.snapshot()};
}

test('compatible live revision preserves in-flight state and activates new entities',()=>{
  const previous=baseWorld();
  const {snapshot}=sourceSnapshot(previous);
  const previousHero=snapshot.entities.find(entity=>entity.id==='hero')!;
  const previousSpeaker=snapshot.entities.find(entity=>entity.id==='speaker')!;

  const next=structuredClone(previous);
  next.version=2;
  next.visualScene!.materials[0].baseColor={r:.2,g:.4,b:.9,a:1};
  next.entities.push({
    id:'new-prop',
    transform:{position:{x:4,y:0,z:0}},
    properties:{createdBy:'studio'}
  });

  const migrated=migrateWorldRuntime({
    id:'migration-compatible',
    previousDefinition:previous,
    nextDefinition:next,
    previousSnapshot:snapshot
  });

  const hero=migrated.snapshot.entities.find(entity=>entity.id==='hero')!;
  const speaker=migrated.snapshot.entities.find(entity=>entity.id==='speaker')!;
  assert.deepEqual(hero.transform,previousHero.transform);
  assert.deepEqual(hero.rigidBody!.velocity,previousHero.rigidBody!.velocity);
  assert.deepEqual(speaker.audioRuntime,previousSpeaker.audioRuntime);
  assert.equal(migrated.snapshot.tick,5);
  assert.equal(migrated.snapshot.worldVersion,2);
  assert.equal(migrated.snapshot.activeEntityIds.includes('new-prop'),true);
  assert.deepEqual(migrated.receipt.addedEntityIds,['new-prop']);
  assert.equal(migrated.receipt.cameraRuntimePreserved,true);
  assert.equal(migrated.receipt.audioSceneRuntimePreserved,true);
  assert.equal(migrated.receipt.collisionsReset,true);
  assert.equal(verifyWorldRuntimeMigrationReceipt(migrated.receipt),true);
});

test('authoring transform change wins over runtime position but compatible motion survives',()=>{
  const previous=baseWorld();
  const {snapshot}=sourceSnapshot(previous);
  const previousHero=snapshot.entities.find(entity=>entity.id==='hero')!;

  const next=structuredClone(previous);
  next.version=2;
  next.entities.find(entity=>entity.id==='hero')!.transform={
    position:{x:20,y:0,z:0},
    rotationDeg:{x:0,y:90,z:0},
    scale:{x:1,y:1,z:1}
  };

  const migrated=migrateWorldRuntime({
    id:'migration-transform-edit',
    previousDefinition:previous,
    nextDefinition:next,
    previousSnapshot:snapshot
  });
  const hero=migrated.snapshot.entities.find(entity=>entity.id==='hero')!;
  const note=migrated.receipt.entityNotes.find(row=>row.entityId==='hero')!;

  assert.equal(hero.transform.position.x,20);
  assert.deepEqual(hero.rigidBody!.velocity,previousHero.rigidBody!.velocity);
  assert.equal(note.reset.includes('transform'),true);
  assert.equal(note.preserved.includes('rigidBodyMotion'),true);
});

test('rigid-body structural change resets motion instead of carrying incompatible velocity',()=>{
  const previous=baseWorld();
  const {snapshot}=sourceSnapshot(previous);
  const previousHero=snapshot.entities.find(entity=>entity.id==='hero')!;
  assert.ok(previousHero.transform.position.x>0);

  const next=structuredClone(previous);
  next.version=2;
  const heroDef=next.entities.find(entity=>entity.id==='hero')!;
  heroDef.rigidBody!.mass=5;
  heroDef.rigidBody!.velocity={x:0,y:0,z:0};

  const migrated=migrateWorldRuntime({
    id:'migration-body-change',
    previousDefinition:previous,
    nextDefinition:next,
    previousSnapshot:snapshot
  });
  const hero=migrated.snapshot.entities.find(entity=>entity.id==='hero')!;
  const note=migrated.receipt.entityNotes.find(row=>row.entityId==='hero')!;

  assert.deepEqual(hero.rigidBody!.velocity,{x:0,y:0,z:0});
  assert.equal(note.reset.includes('rigidBodyMotion'),true);
  assert.equal(note.preserved.includes('transform'),true);
});

test('audio playhead resets when the referenced clip contract changes',()=>{
  const previous=baseWorld();
  const {snapshot}=sourceSnapshot(previous);
  const previousSpeaker=snapshot.entities.find(entity=>entity.id==='speaker')!;
  assert.ok(previousSpeaker.audioRuntime!.playheadSec>0);

  const next=structuredClone(previous);
  next.version=2;
  next.audioScene!.clips[0].durationSec=8;

  const migrated=migrateWorldRuntime({
    id:'migration-audio-change',
    previousDefinition:previous,
    nextDefinition:next,
    previousSnapshot:snapshot
  });
  const speaker=migrated.snapshot.entities.find(entity=>entity.id==='speaker')!;
  const note=migrated.receipt.entityNotes.find(row=>row.entityId==='speaker')!;

  assert.equal(speaker.audioRuntime!.playheadSec,0);
  assert.equal(note.reset.includes('audioRuntime'),true);
});

test('removed entities disappear and inactive residency is preserved for survivors',()=>{
  const previous=baseWorld();
  const runtime=new EvercraftWorldRuntime(previous);
  runtime.setActiveEntityIds(['camera','hero','listener']);
  runtime.run(2);
  const snapshot=runtime.snapshot();

  const next=structuredClone(previous);
  next.version=2;
  next.entities=next.entities.filter(entity=>entity.id!=='speaker');

  const migrated=migrateWorldRuntime({
    id:'migration-remove',
    previousDefinition:previous,
    nextDefinition:next,
    previousSnapshot:snapshot
  });

  assert.equal(migrated.snapshot.entities.some(entity=>entity.id==='speaker'),false);
  assert.deepEqual(migrated.receipt.removedEntityIds,['speaker']);
  assert.deepEqual(migrated.snapshot.activeEntityIds,['camera','hero','listener']);
});

test('new entities can remain inactive when authoring caller requests it',()=>{
  const previous=baseWorld();
  const {snapshot}=sourceSnapshot(previous);
  const next=structuredClone(previous);
  next.version=2;
  next.entities.push({
    id:'new-inactive',
    transform:{position:{x:10,y:0,z:0}}
  });

  const migrated=migrateWorldRuntime({
    id:'migration-new-inactive',
    previousDefinition:previous,
    nextDefinition:next,
    previousSnapshot:snapshot,
    options:{activateNewEntities:false}
  });

  assert.equal(migrated.snapshot.activeEntityIds.includes('new-inactive'),false);
});

test('tick-rate changes fail closed because old tick time cannot be reinterpreted safely',()=>{
  const previous=baseWorld();
  const {snapshot}=sourceSnapshot(previous);
  const next=structuredClone(previous);
  next.version=2;
  next.tickRateHz=60;

  assert.throws(
    ()=>migrateWorldRuntime({
      id:'migration-rate-change',
      previousDefinition:previous,
      nextDefinition:next,
      previousSnapshot:snapshot
    }),
    /runtime_migration_tick_rate_change_unsupported/
  );
});

test('tampered source snapshots fail before any migrated runtime is created',()=>{
  const previous=baseWorld();
  const {snapshot}=sourceSnapshot(previous);
  const tampered=structuredClone(snapshot);
  tampered.entities.find(entity=>entity.id==='hero')!.transform.position.x=999;
  const next=structuredClone(previous);
  next.version=2;

  assert.throws(
    ()=>migrateWorldRuntime({
      id:'migration-tampered',
      previousDefinition:previous,
      nextDefinition:next,
      previousSnapshot:tampered
    }),
    /runtime_migration_source_snapshot_digest_invalid/
  );
});

test('re-sealed but structurally impossible source snapshot is rejected',()=>{
  const previous=baseWorld();
  const {snapshot}=sourceSnapshot(previous);
  const {digest:_ignored,...core}=snapshot;
  const impossible=sealWorldSnapshot({
    ...core,
    timeSec:999
  });
  const next=structuredClone(previous);
  next.version=2;

  assert.throws(
    ()=>migrateWorldRuntime({
      id:'migration-impossible-source',
      previousDefinition:previous,
      nextDefinition:next,
      previousSnapshot:impossible
    }),
    /world_snapshot_time_mismatch/
  );
});

test('migration is deterministic for the same source snapshot and target definition',()=>{
  const previous=baseWorld();
  const {snapshot}=sourceSnapshot(previous);
  const next=structuredClone(previous);
  next.version=2;
  next.entities.find(entity=>entity.id==='hero')!.properties={mode:'edited'};

  const request={
    id:'migration-deterministic',
    previousDefinition:previous,
    nextDefinition:next,
    previousSnapshot:snapshot
  };
  const first=migrateWorldRuntime(request);
  const second=migrateWorldRuntime(request);

  assert.equal(first.snapshot.digest,second.snapshot.digest);
  assert.equal(first.receipt.digest,second.receipt.digest);
  const note=first.receipt.entityNotes.find(row=>row.entityId==='hero')!;
  assert.equal(note.reset.includes('properties'),true);
});
