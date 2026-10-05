import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EvercraftWorldRuntime,
  replayWorld,
  type WorldDefinition
} from './engine.js';
import {
  compileAudioFrame,
  validateAudioScene
} from './audio.js';
import { compileRenderFrame } from './bridges.js';
import { WorldEntityStore } from './entity-store.js';

function audioWorld():WorldDefinition{
  return {
    schema:'evercraft.world-engine.world.v1',
    id:'audio-proof-world',
    version:1,
    tickRateHz:10,
    gravity:{x:0,y:0,z:0},
    audioScene:{
      schema:'evercraft.world-engine.audio-scene.v1',
      initialListenerEntityId:'listener-a',
      clips:[
        {id:'tone',assetRef:'fallen:audio:tone-master',durationSec:1},
        {id:'voice',assetRef:'fallen:audio:voice-master',durationSec:2}
      ],
      buses:[
        {id:'sfx',gain:1},
        {id:'voice',gain:.8}
      ]
    },
    entities:[
      {
        id:'listener-a',
        transform:{position:{x:0,y:0,z:0}},
        audioListener:{gain:1},
        tags:['audio-listener']
      },
      {
        id:'listener-b',
        transform:{position:{x:8,y:0,z:0}},
        audioListener:{gain:.5},
        tags:['audio-listener']
      },
      {
        id:'tone-emitter',
        transform:{position:{x:5,y:0,z:0}},
        audioEmitter:{
          clipId:'tone',
          busId:'sfx',
          gain:1,
          autoplay:true,
          loop:true,
          spatialMode:'3d',
          minDistance:1,
          maxDistance:11,
          rolloff:'linear',
          rolloffFactor:1
        },
        tags:['audio-emitter']
      },
      {
        id:'voice-emitter',
        transform:{position:{x:100,y:0,z:0}},
        audioEmitter:{
          clipId:'voice',
          busId:'voice',
          gain:.5,
          autoplay:false,
          loop:false,
          spatialMode:'2d'
        },
        tags:['audio-emitter']
      }
    ]
  };
}

test('audio scene validates clips, buses, listeners and emitter bindings',()=>{
  const world=audioWorld();
  assert.equal(validateAudioScene(world.audioScene!,world.entities),true);

  const badClip=audioWorld();
  badClip.entities.find(entity=>entity.id==='tone-emitter')!.audioEmitter!.clipId='missing';
  assert.throws(
    ()=>new EvercraftWorldRuntime(badClip),
    /audio_emitter_clip_unknown/
  );

  const badListener=audioWorld();
  badListener.audioScene!.initialListenerEntityId='missing';
  assert.throws(
    ()=>new EvercraftWorldRuntime(badListener),
    /audio_initial_listener_missing/
  );
});

test('autoplay, looping and audio events advance deterministically',()=>{
  const runtime=new EvercraftWorldRuntime(audioWorld());
  assert.equal(runtime.entity('tone-emitter')!.audioRuntime!.state,'playing');

  runtime.run(9);
  const beforeLoop=runtime.entity('tone-emitter')!;
  assert.ok(Math.abs(beforeLoop.audioRuntime!.playheadSec-.9)<1e-9);
  assert.equal(beforeLoop.audioRuntime!.loopCount,0);

  runtime.step();
  const afterLoop=runtime.entity('tone-emitter')!;
  assert.equal(afterLoop.audioRuntime!.loopCount,1);
  assert.equal(afterLoop.audioRuntime!.playheadSec,0);
  assert.equal(afterLoop.audioRuntime!.events[0].type,'looped');
});

test('tick-bound play pause seek and stop controls are canonical world inputs',()=>{
  const runtime=new EvercraftWorldRuntime(audioWorld());

  runtime.step([{
    id:'voice-play',
    tick:1,
    entityId:'voice-emitter',
    kind:'play_audio'
  }]);
  assert.equal(runtime.entity('voice-emitter')!.audioRuntime!.state,'playing');

  runtime.step([{
    id:'voice-seek',
    tick:2,
    entityId:'voice-emitter',
    kind:'seek_audio',
    value:1.25
  }]);
  const sought=runtime.entity('voice-emitter')!;
  assert.ok(Math.abs(sought.audioRuntime!.playheadSec-1.35)<1e-9);
  assert.equal(sought.audioRuntime!.events[0].type,'seeked');

  runtime.step([{
    id:'voice-pause',
    tick:3,
    entityId:'voice-emitter',
    kind:'pause_audio'
  }]);
  const paused=runtime.entity('voice-emitter')!;
  assert.equal(paused.audioRuntime!.state,'paused');
  const pausedAt=paused.audioRuntime!.playheadSec;

  runtime.step();
  assert.equal(runtime.entity('voice-emitter')!.audioRuntime!.playheadSec,pausedAt);

  runtime.step([{
    id:'voice-stop',
    tick:5,
    entityId:'voice-emitter',
    kind:'stop_audio'
  }]);
  const stopped=runtime.entity('voice-emitter')!;
  assert.equal(stopped.audioRuntime!.state,'stopped');
  assert.equal(stopped.audioRuntime!.playheadSec,0);
});

test('audio frame computes deterministic listener-relative attenuation and gain',()=>{
  const world=audioWorld();
  const runtime=new EvercraftWorldRuntime(world);
  const snapshot=runtime.snapshot();

  const frame=compileAudioFrame(
    snapshot.worldId,
    snapshot.tick,
    snapshot.timeSec,
    world.audioScene!,
    snapshot.entities,
    snapshot.audioSceneRuntime!,
    snapshot.activeEntityIds
  );

  const tone=frame.emitters.find(item=>item.entityId==='tone-emitter')!;
  const voice=frame.emitters.find(item=>item.entityId==='voice-emitter')!;

  assert.equal(frame.listener.entityId,'listener-a');
  assert.equal(tone.distance,5);
  assert.equal(tone.attenuation,.6);
  assert.equal(tone.effectiveGain,.6);
  assert.deepEqual(tone.relativePosition,{x:5,y:0,z:0});

  assert.equal(voice.spatialMode,'2d');
  assert.equal(voice.attenuation,1);
  assert.equal(voice.effectiveGain,.4);
});

test('listener switches are tick-bound and alter deterministic spatial mix state',()=>{
  const world=audioWorld();
  const runtime=new EvercraftWorldRuntime(world);

  runtime.step([{
    id:'listener-switch',
    tick:1,
    kind:'activate_audio_listener',
    listenerEntityId:'listener-b'
  }]);

  assert.equal(runtime.audioSceneRuntime!.activeListenerEntityId,'listener-b');

  const snapshot=runtime.snapshot();
  const frame=compileAudioFrame(
    snapshot.worldId,
    snapshot.tick,
    snapshot.timeSec,
    world.audioScene!,
    snapshot.entities,
    snapshot.audioSceneRuntime!,
    snapshot.activeEntityIds
  );
  const tone=frame.emitters.find(item=>item.entityId==='tone-emitter')!;
  assert.equal(tone.distance,3);
  assert.equal(tone.attenuation,.8);
  assert.equal(tone.effectiveGain,.4);
});

test('streamed-out emitters freeze playback state and resume exactly',()=>{
  const runtime=new EvercraftWorldRuntime(audioWorld());
  runtime.run(3);
  const before=runtime.entity('tone-emitter')!.audioRuntime!.playheadSec;

  runtime.setActiveEntityIds(['listener-a','listener-b','voice-emitter']);
  runtime.run(5);
  const frozen=runtime.entity('tone-emitter')!.audioRuntime!.playheadSec;
  assert.equal(frozen,before);

  runtime.setActiveEntityIds(['listener-a','listener-b','tone-emitter','voice-emitter']);
  runtime.step();
  const resumed=runtime.entity('tone-emitter')!.audioRuntime!.playheadSec;
  assert.ok(resumed>frozen);
});

test('audio control and listener inputs replay to identical snapshots',()=>{
  const inputs=[
    {
      id:'voice-play',
      tick:2,
      entityId:'voice-emitter',
      kind:'play_audio' as const
    },
    {
      id:'listener-switch',
      tick:4,
      kind:'activate_audio_listener' as const,
      listenerEntityId:'listener-b'
    },
    {
      id:'voice-seek',
      tick:5,
      entityId:'voice-emitter',
      kind:'seek_audio' as const,
      value:.75
    }
  ];
  const receipt=replayWorld(audioWorld(),12,inputs);
  assert.equal(receipt.deterministic,true);
});

test('provider-neutral render frame embeds audio subframe',()=>{
  const world=audioWorld();
  const runtime=new EvercraftWorldRuntime(world);
  const frame=compileRenderFrame(runtime.snapshot(),'legacy-camera',world);

  assert.ok(frame.audio);
  assert.equal(frame.audio!.listener.entityId,'listener-a');
  assert.deepEqual(
    frame.audio!.emitters.map(item=>item.entityId),
    ['tone-emitter','voice-emitter']
  );
});

test('ECS indexes audio components as first-class world state',()=>{
  const store=new WorldEntityStore(audioWorld().entities);
  assert.deepEqual(store.idsForComponent('audioListener'),['listener-a','listener-b']);
  assert.deepEqual(store.idsForComponent('audioEmitter'),['tone-emitter','voice-emitter']);
});

test('audio components require audio-scene authority',()=>{
  const world=audioWorld();
  delete world.audioScene;
  assert.throws(
    ()=>new EvercraftWorldRuntime(world),
    /world_audio_scene_required/
  );
});
