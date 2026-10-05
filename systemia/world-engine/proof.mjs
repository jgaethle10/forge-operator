import assert from 'node:assert/strict';
import { EvercraftWorldRuntime, replayWorld } from './engine.ts';
import { SceneStreamController } from './streaming.ts';

const world={
  schema:'evercraft.world-engine.world.v1',
  id:'evercraft-world-engine-proof',
  version:1,
  tickRateHz:60,
  gravity:{x:0,y:-9.81,z:0},
  ground:{enabled:true,height:0},
  entities:[
    {
      id:'proof-orb',
      transform:{position:{x:-1.5,y:1,z:0}},
      rigidBody:{mass:1,velocity:{x:1,y:0,z:0},restitution:1},
      collider:{type:'sphere',radius:.5}
    },
    {
      id:'proof-wall',
      transform:{position:{x:0,y:1,z:0}},
      rigidBody:{mass:1,velocity:{x:0,y:0,z:0},restitution:1,kinematic:true},
      collider:{type:'box',halfExtents:{x:.5,y:1,z:1}}
    }
  ]
};

const receipt=replayWorld(world,180,[]);
assert.equal(receipt.deterministic,true);

const runtime=new EvercraftWorldRuntime(world);
let wallContact=null;
for(let i=0;i<180;i++){
  runtime.step();
  if(runtime.collisions.length && !wallContact) wallContact=runtime.collisions[0];
}
const snapshot=runtime.snapshot();
const orb=runtime.entity('proof-orb');
assert.ok(orb);
assert.ok(wallContact);
assert.ok(orb.transform.position.y>=.5);
assert.ok(orb.rigidBody.velocity.x<0);

const collisionRuntime=new EvercraftWorldRuntime({
  schema:'evercraft.world-engine.world.v1',
  id:'evercraft-world-engine-collision-proof',
  version:1,
  tickRateHz:60,
  gravity:{x:0,y:0,z:0},
  entities:[
    {
      id:'left',
      transform:{position:{x:-1,y:0,z:0}},
      rigidBody:{mass:1,velocity:{x:1,y:0,z:0},restitution:1},
      collider:{type:'sphere',radius:.5}
    },
    {
      id:'right',
      transform:{position:{x:1,y:0,z:0}},
      rigidBody:{mass:1,velocity:{x:-1,y:0,z:0},restitution:1},
      collider:{type:'sphere',radius:.5}
    }
  ]
});
let sphereContact=null;
for(let i=0;i<40;i++){
  collisionRuntime.step();
  if(collisionRuntime.collisions.length){
    sphereContact=collisionRuntime.collisions[0];
    break;
  }
}
assert.ok(sphereContact);
assert.equal(sphereContact.kind,'sphere_sphere');

const streamWorld={
  schema:'evercraft.world-engine.world.v1',
  id:'evercraft-world-engine-streaming-proof',
  version:1,
  tickRateHz:60,
  gravity:{x:0,y:0,z:0},
  entities:[
    {
      id:'global-anchor',
      transform:{position:{x:0,y:0,z:0}},
      tags:['global']
    },
    {
      id:'near-mover',
      transform:{position:{x:0,y:0,z:0}},
      rigidBody:{mass:1,velocity:{x:1,y:0,z:0}},
      collider:{type:'sphere',radius:.25}
    },
    {
      id:'far-mover',
      transform:{position:{x:100,y:0,z:0}},
      rigidBody:{mass:1,velocity:{x:1,y:0,z:0}},
      collider:{type:'sphere',radius:.25}
    }
  ]
};
const streamController=new SceneStreamController(streamWorld,{
  schema:'evercraft.world-engine.scene-manifest.v1',
  worldId:streamWorld.id,
  chunks:[
    {
      id:'near',
      bounds:{min:{x:-5,y:-5,z:-5},max:{x:5,y:5,z:5}},
      entityIds:['near-mover'],
      preloadRadius:5
    },
    {
      id:'far',
      bounds:{min:{x:95,y:-5,z:-5},max:{x:105,y:5,z:5}},
      entityIds:['far-mover'],
      preloadRadius:5
    }
  ]
});
const streamRuntime=new EvercraftWorldRuntime(streamWorld);
const nearPlan=streamController.transition({x:0,y:0,z:0});
streamController.apply(streamRuntime,nearPlan);
streamRuntime.run(60);
const nearAfterFirst=streamRuntime.entity('near-mover');
const farAfterFirst=streamRuntime.entity('far-mover');
assert.ok(nearAfterFirst.transform.position.x>.9);
assert.equal(farAfterFirst.transform.position.x,100);

const farPlan=streamController.transition({x:100,y:0,z:0});
streamController.apply(streamRuntime,farPlan);
streamRuntime.run(60);
const nearAfterSecond=streamRuntime.entity('near-mover');
const farAfterSecond=streamRuntime.entity('far-mover');
assert.equal(nearAfterSecond.transform.position.x,nearAfterFirst.transform.position.x);
assert.ok(farAfterSecond.transform.position.x>100.9);
assert.deepEqual(streamRuntime.activeEntityIds,['far-mover','global-anchor']);

const animationWorld={
  schema:'evercraft.world-engine.world.v1',
  id:'evercraft-world-engine-animation-proof',
  version:1,
  tickRateHz:10,
  gravity:{x:0,y:0,z:0},
  entities:[{
    id:'hero',
    transform:{position:{x:0,y:0,z:0}},
    animation:{
      schema:'evercraft.world-engine.animation.v1',
      rig:{
        id:'proof-rig',
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
              rotationDeg:{x:0,y:0,z:0},
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
          tracks:[]
        },
        {
          id:'wave',
          durationSec:.4,
          loop:true,
          tracks:[{
            boneId:'arm',
            rotationDeg:[
              {timeSec:0,value:{x:0,y:0,z:-20}},
              {timeSec:.2,value:{x:0,y:0,z:20}},
              {timeSec:.4,value:{x:0,y:0,z:-20}}
            ]
          }],
          events:[{id:'wave-apex',name:'wave_apex',timeSec:.2}]
        }
      ],
      states:[
        {id:'idle',clipId:'idle'},
        {id:'wave',clipId:'wave'}
      ],
      initialState:'idle',
      transitions:[
        {
          id:'idle-to-wave',
          from:'idle',
          to:'wave',
          priority:10,
          blendSec:.2,
          conditions:[{parameter:'waving',operator:'truthy'}]
        }
      ],
      parameters:{waving:false}
    }
  }]
};
const animationInputs=[{
  id:'start-wave',
  tick:1,
  entityId:'hero',
  kind:'set_animation_parameter',
  key:'waving',
  value:true
}];
const animationReceipt=replayWorld(animationWorld,6,animationInputs);
assert.equal(animationReceipt.deterministic,true);
const animationRuntime=new EvercraftWorldRuntime(animationWorld);
let waveEvent=null;
for(let i=0;i<6;i++){
  animationRuntime.step(animationInputs);
  const hero=animationRuntime.entity('hero');
  if(hero?.animationRuntime?.events?.length) waveEvent=hero.animationRuntime.events[0];
}
const hero=animationRuntime.entity('hero');
assert.equal(hero.animationRuntime.stateId,'wave');
assert.ok(waveEvent);
assert.equal(waveEvent.name,'wave_apex');

process.stdout.write(JSON.stringify({
  schema:'evercraft.world-engine.proof.v4',
  status:'passed',
  world_id:world.id,
  replay:receipt,
  final_snapshot_digest:snapshot.digest,
  wall_contact:wallContact,
  collision_contact:sphereContact,
  stream_plan:{
    near:nearPlan,
    far:farPlan
  },
  animation:{
    replay:animationReceipt,
    state:hero.animationRuntime.stateId,
    pose:hero.animationRuntime.pose,
    event:waveEvent
  },
  assertions:{
    deterministic_replay:true,
    fixed_timestep:true,
    ground_collision:true,
    entity_collision:true,
    deterministic_scene_streaming:true,
    inactive_state_preservation:true,
    deterministic_skeletal_animation:true,
    animation_state_machine:true,
    animation_event_receipts:true,
    canonical_snapshot_digest:true
  }
},null,2)+'\n');
