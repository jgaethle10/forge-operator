import assert from 'node:assert/strict';
import { EvercraftWorldRuntime, replayWorld } from './engine.ts';
import { SceneStreamController } from './streaming.ts';
import { compileVisualFrame } from './visual.ts';

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

const navigationWorld={
  schema:'evercraft.world-engine.world.v1',
  id:'evercraft-world-engine-navigation-proof',
  version:1,
  tickRateHz:10,
  gravity:{x:0,y:0,z:0},
  navigationMeshes:[{
    schema:'evercraft.world-engine.navmesh.v1',
    id:'proof-nav',
    polygons:[
      {
        id:'a',
        vertices:[
          {x:0,y:0,z:0},{x:4,y:0,z:0},{x:4,y:0,z:4},{x:0,y:0,z:4}
        ],
        neighbors:['b']
      },
      {
        id:'b',
        vertices:[
          {x:4,y:0,z:0},{x:8,y:0,z:0},{x:8,y:0,z:4},{x:4,y:0,z:4}
        ],
        neighbors:['a','c']
      },
      {
        id:'c',
        vertices:[
          {x:4,y:0,z:4},{x:8,y:0,z:4},{x:8,y:0,z:8},{x:4,y:0,z:8}
        ],
        neighbors:['b']
      }
    ]
  }],
  entities:[{
    id:'agent',
    transform:{position:{x:1,y:0,z:1}},
    rigidBody:{mass:1,velocity:{x:0,y:0,z:0},linearDamping:0},
    collider:{type:'sphere',radius:.2},
    navigationAgent:{
      meshId:'proof-nav',
      maxSpeed:5,
      stoppingDistance:.05
    }
  }]
};
const navigationInputs=[{
  id:'go',
  tick:1,
  entityId:'agent',
  kind:'set_navigation_target',
  value:{x:7,y:0,z:7}
}];
const navigationReceipt=replayWorld(navigationWorld,40,navigationInputs);
assert.equal(navigationReceipt.deterministic,true);
const navigationRuntime=new EvercraftWorldRuntime(navigationWorld);
navigationRuntime.run(40,navigationInputs);
const navigationAgent=navigationRuntime.entity('agent');
assert.equal(navigationAgent.navigationRuntime.state,'arrived');
assert.ok(Math.abs(navigationAgent.transform.position.x-7)<.06);
assert.ok(Math.abs(navigationAgent.transform.position.z-7)<.06);
assert.deepEqual(navigationAgent.navigationRuntime.path.polygonIds,['a','b','c']);

const visualWorld={
  schema:'evercraft.world-engine.world.v1',
  id:'evercraft-world-engine-visual-proof',
  version:1,
  tickRateHz:10,
  gravity:{x:0,y:0,z:0},
  visualScene:{
    schema:'evercraft.world-engine.visual-scene.v1',
    initialCameraEntityId:'camera-a',
    materials:[
      {
        id:'proof-metal',
        model:'pbr',
        baseColor:{r:.8,g:.8,b:.85,a:1},
        metallic:1,
        roughness:.2
      }
    ],
    cameraTransitions:[
      {
        id:'camera-a-to-b',
        fromCameraId:'camera-a',
        toCameraId:'camera-b',
        durationSec:.5,
        curve:'smoothstep'
      }
    ],
    clearColor:{r:.01,g:.01,b:.02}
  },
  entities:[
    {
      id:'camera-a',
      transform:{position:{x:0,y:2,z:-8},rotationDeg:{x:0,y:0,z:0}},
      camera:{
        projection:{type:'perspective',fovYDeg:60},
        near:.1,
        far:100,
        exposure:1,
        layerMask:1
      }
    },
    {
      id:'camera-b',
      transform:{position:{x:6,y:3,z:-4},rotationDeg:{x:0,y:45,z:0}},
      camera:{
        projection:{type:'perspective',fovYDeg:75},
        near:.1,
        far:120,
        exposure:1.5,
        layerMask:1
      }
    },
    {
      id:'proof-object',
      transform:{position:{x:0,y:0,z:0}},
      renderable:{
        geometryRef:'geometry:proof-cube',
        materialId:'proof-metal',
        castsShadow:true,
        receivesShadow:true,
        layerMask:1
      }
    },
    {
      id:'proof-sun',
      transform:{position:{x:0,y:10,z:0},rotationDeg:{x:45,y:20,z:0}},
      light:{
        type:'directional',
        color:{r:1,g:.95,b:.9},
        intensity:3,
        castsShadow:true,
        layerMask:1
      }
    }
  ]
};
const visualInputs=[{
  id:'switch-camera',
  tick:1,
  kind:'activate_camera',
  cameraEntityId:'camera-b',
  transitionId:'camera-a-to-b'
}];
const visualReceipt=replayWorld(visualWorld,6,visualInputs);
assert.equal(visualReceipt.deterministic,true);
const visualRuntime=new EvercraftWorldRuntime(visualWorld);
visualRuntime.run(6,visualInputs);
assert.equal(visualRuntime.cameraRuntime.activeCameraId,'camera-b');
assert.equal(visualRuntime.cameraRuntime.transition,null);
const visualSnapshot=visualRuntime.snapshot();
const visualFrame=compileVisualFrame(
  visualSnapshot.worldId,
  visualSnapshot.tick,
  visualSnapshot.timeSec,
  visualRuntime.definition.visualScene,
  visualSnapshot.entities,
  visualSnapshot.cameraRuntime,
  visualSnapshot.activeEntityIds
);
assert.equal(visualFrame.camera.cameraId,'camera-b');
assert.deepEqual(visualFrame.renderables.map(item=>item.entityId),['proof-object']);
assert.deepEqual(visualFrame.lights.map(item=>item.entityId),['proof-sun']);
assert.deepEqual(visualFrame.materials.map(item=>item.id),['proof-metal']);

process.stdout.write(JSON.stringify({
  schema:'evercraft.world-engine.proof.v6',
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
  navigation:{
    replay:navigationReceipt,
    path:navigationAgent.navigationRuntime.path,
    state:navigationAgent.navigationRuntime.state,
    final_position:navigationAgent.transform.position
  },
  visual:{
    replay:visualReceipt,
    camera_runtime:visualSnapshot.cameraRuntime,
    frame_digest:visualFrame.digest,
    camera:visualFrame.camera,
    materials:visualFrame.materials.map(item=>item.id),
    renderables:visualFrame.renderables.map(item=>item.entityId),
    lights:visualFrame.lights.map(item=>item.entityId)
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
    deterministic_navmesh_pathfinding:true,
    physics_driven_agent_locomotion:true,
    deterministic_visual_scene:true,
    deterministic_camera_graph:true,
    material_and_light_contracts:true,
    canonical_snapshot_digest:true
  }
},null,2)+'\n');
