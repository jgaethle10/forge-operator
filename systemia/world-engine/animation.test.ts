import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EvercraftWorldRuntime,
  replayWorld,
  type WorldDefinition
} from './engine.js';
import {
  initializeAnimationRuntime,
  sampleAnimationPose,
  validateAnimationComponent,
  type SkeletalAnimationComponent
} from './animation.js';
import { compileRenderFrame } from './bridges.js';
import { WorldEntityStore } from './entity-store.js';

const animation:SkeletalAnimationComponent={
  schema:'evercraft.world-engine.animation.v1',
  rig:{
    id:'hero-rig',
    bones:[
      {
        id:'root',
        bind:{
          translation:{x:0,y:0,z:0},
          rotationDeg:{x:0,y:0,z:0},
          scale:{x:1,y:1,z:1}
        }
      },
      {
        id:'arm',
        parentId:'root',
        bind:{
          translation:{x:0,y:1,z:0},
          rotationDeg:{x:0,y:350,z:0},
          scale:{x:1,y:1,z:1}
        }
      }
    ]
  },
  clips:[
    {
      id:'idle',
      durationSec:1,
      loop:true,
      tracks:[
        {
          boneId:'arm',
          rotationDeg:[
            {timeSec:0,value:{x:0,y:350,z:0}},
            {timeSec:1,value:{x:0,y:10,z:0}}
          ]
        }
      ]
    },
    {
      id:'run',
      durationSec:.4,
      loop:true,
      tracks:[
        {
          boneId:'root',
          translation:[
            {timeSec:0,value:{x:0,y:0,z:0}},
            {timeSec:.4,value:{x:.4,y:0,z:0}}
          ]
        },
        {
          boneId:'arm',
          rotationDeg:[
            {timeSec:0,value:{x:0,y:20,z:0}},
            {timeSec:.2,value:{x:0,y:-20,z:0}},
            {timeSec:.4,value:{x:0,y:20,z:0}}
          ]
        }
      ],
      events:[
        {id:'footstep-a',name:'footstep',timeSec:.2,payload:{foot:'left'}},
        {id:'footstep-b',name:'footstep',timeSec:.4,payload:{foot:'right'}}
      ]
    }
  ],
  states:[
    {id:'idle',clipId:'idle'},
    {id:'run',clipId:'run',speed:1}
  ],
  initialState:'idle',
  transitions:[
    {
      id:'idle-to-run',
      from:'idle',
      to:'run',
      priority:10,
      blendSec:.2,
      conditions:[{parameter:'moving',operator:'truthy'}]
    },
    {
      id:'run-to-idle',
      from:'run',
      to:'idle',
      priority:10,
      blendSec:.1,
      conditions:[{parameter:'moving',operator:'falsy'}]
    }
  ],
  parameters:{moving:false}
};

function animatedWorld():WorldDefinition{
  return {
    schema:'evercraft.world-engine.world.v1',
    id:'animation-proof-world',
    version:1,
    tickRateHz:10,
    gravity:{x:0,y:0,z:0},
    entities:[
      {
        id:'hero',
        transform:{position:{x:0,y:0,z:0}},
        animation,
        tags:['character','animated']
      }
    ]
  };
}

test('animation component validates and initializes canonical pose',()=>{
  assert.equal(validateAnimationComponent(animation),true);
  const runtime=initializeAnimationRuntime(animation);
  assert.equal(runtime.stateId,'idle');
  assert.equal(runtime.stateTimeSec,0);
  assert.deepEqual(runtime.pose.map(pose=>pose.boneId),['arm','root']);
});

test('rotation sampling follows shortest angular path',()=>{
  const pose=sampleAnimationPose(animation,'idle',.5);
  const arm=pose.find(item=>item.boneId==='arm');
  assert.ok(arm);
  assert.ok(Math.abs(arm.rotationDeg.y-360)<1e-9);
});

test('state transitions occur on exact input ticks with deterministic blend and events',()=>{
  const runtime=new EvercraftWorldRuntime(animatedWorld());
  runtime.step([
    {
      id:'move-on',
      tick:1,
      entityId:'hero',
      kind:'set_animation_parameter',
      key:'moving',
      value:true
    }
  ]);

  const afterOne=runtime.entity('hero')!;
  assert.equal(afterOne.animationRuntime!.stateId,'run');
  assert.equal(afterOne.animationRuntime!.transition?.id,'idle-to-run');
  assert.ok(Math.abs(afterOne.animationRuntime!.transition!.elapsedSec-.1)<1e-9);

  runtime.step();
  const afterTwo=runtime.entity('hero')!;
  assert.equal(afterTwo.animationRuntime!.transition,null);
  assert.equal(afterTwo.animationRuntime!.events.length,1);
  assert.equal(afterTwo.animationRuntime!.events[0].name,'footstep');
  assert.equal(afterTwo.animationRuntime!.events[0].markerId,'footstep-a');
});

test('animation freezes while entity is inactive and resumes from preserved state',()=>{
  const runtime=new EvercraftWorldRuntime(animatedWorld());
  runtime.step([
    {
      id:'move-on',
      tick:1,
      entityId:'hero',
      kind:'set_animation_parameter',
      key:'moving',
      value:true
    }
  ]);
  runtime.step();
  const beforeFreeze=runtime.entity('hero')!.animationRuntime!.stateTimeSec;

  runtime.setActiveEntityIds([]);
  runtime.run(10);
  const frozen=runtime.entity('hero')!.animationRuntime!.stateTimeSec;
  assert.equal(frozen,beforeFreeze);

  runtime.setActiveEntityIds(['hero']);
  runtime.step();
  const resumed=runtime.entity('hero')!.animationRuntime!.stateTimeSec;
  assert.ok(resumed>frozen);
});

test('animation inputs replay deterministically',()=>{
  const world=animatedWorld();
  const inputs=[
    {
      id:'move-on',
      tick:2,
      entityId:'hero',
      kind:'set_animation_parameter' as const,
      key:'moving',
      value:true
    },
    {
      id:'move-off',
      tick:8,
      entityId:'hero',
      kind:'set_animation_parameter' as const,
      key:'moving',
      value:false
    }
  ];
  const receipt=replayWorld(world,15,inputs);
  assert.equal(receipt.deterministic,true);
});

test('render frame exposes sampled skeletal pose without owning animation state',()=>{
  const runtime=new EvercraftWorldRuntime(animatedWorld());
  runtime.step();
  const frame=compileRenderFrame(runtime.snapshot(),'hero-camera');
  const hero=frame.entities.find(entity=>entity.id==='hero');
  assert.ok(hero?.animation);
  assert.equal(hero!.animation!.stateId,'idle');
  assert.deepEqual(hero!.animation!.pose.map(pose=>pose.boneId),['arm','root']);
});

test('entity store indexes animation as a first-class component',()=>{
  const store=new WorldEntityStore(animatedWorld().entities);
  assert.deepEqual(store.idsForComponent('animation'),['hero']);
  assert.deepEqual(
    store.query({components:['animation']}).map(entity=>entity.id),
    ['hero']
  );
});

test('rig cycles are rejected fail-closed',()=>{
  const invalid=structuredClone(animation);
  invalid.rig.bones[0].parentId='arm';
  assert.throws(
    ()=>validateAnimationComponent(invalid),
    /animation_rig_cycle/
  );
});
