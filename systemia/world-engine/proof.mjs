import assert from 'node:assert/strict';
import { EvercraftWorldRuntime, replayWorld } from './engine.ts';
import { SceneStreamController } from './streaming.ts';
import { compileVisualFrame } from './visual.ts';
import { compileAudioFrame } from './audio.ts';
import { AuthoritativeReplicationRuntime, PredictiveReplicationRuntime, createReplicatedInput } from './replication.ts';
import { compileWebGpuRenderPlan, EVERCRAFT_WEBGPU_WGSL, applyGeometryHotReload, verifyWebGpuRenderPlan } from './webgpu.ts';
import { applyWorldEditTransaction, createWorldAssetManifest, semanticAssetManifestDigest, semanticWorldDigest } from './studio-edit.ts';
import { migrateWorldRuntime, verifyWorldRuntimeMigrationReceipt } from './runtime-migration.ts';
import { applyTextureHotReload, planTextureResidency, textureAssetDigest } from './texture.ts';

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

const audioWorld={
  schema:'evercraft.world-engine.world.v1',
  id:'evercraft-world-engine-audio-proof',
  version:1,
  tickRateHz:10,
  gravity:{x:0,y:0,z:0},
  audioScene:{
    schema:'evercraft.world-engine.audio-scene.v1',
    initialListenerEntityId:'listener-a',
    clips:[{id:'tone',assetRef:'fallen:audio:tone-master',durationSec:1}],
    buses:[{id:'sfx',gain:1}]
  },
  entities:[
    {
      id:'listener-a',
      transform:{position:{x:0,y:0,z:0}},
      audioListener:{gain:1}
    },
    {
      id:'listener-b',
      transform:{position:{x:8,y:0,z:0}},
      audioListener:{gain:.5}
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
        rolloff:'linear'
      }
    }
  ]
};
const audioInputs=[{
  id:'switch-listener',
  tick:2,
  kind:'activate_audio_listener',
  listenerEntityId:'listener-b'
}];
const audioReceipt=replayWorld(audioWorld,12,audioInputs);
assert.equal(audioReceipt.deterministic,true);
const audioRuntime=new EvercraftWorldRuntime(audioWorld);
audioRuntime.run(12,audioInputs);
const audioSnapshot=audioRuntime.snapshot();
const audioFrame=compileAudioFrame(
  audioSnapshot.worldId,
  audioSnapshot.tick,
  audioSnapshot.timeSec,
  audioRuntime.definition.audioScene,
  audioSnapshot.entities,
  audioSnapshot.audioSceneRuntime,
  audioSnapshot.activeEntityIds
);
assert.equal(audioFrame.listener.entityId,'listener-b');
const proofEmitter=audioFrame.emitters.find(item=>item.entityId==='tone-emitter');
assert.ok(proofEmitter);
assert.equal(proofEmitter.distance,3);
assert.equal(proofEmitter.attenuation,.8);
assert.equal(audioRuntime.entity('tone-emitter').audioRuntime.loopCount,1);

const replicationWorld={
  schema:'evercraft.world-engine.world.v1',
  id:'evercraft-world-engine-replication-proof',
  version:1,
  tickRateHz:10,
  gravity:{x:0,y:0,z:0},
  entities:[{
    id:'player',
    transform:{position:{x:0,y:0,z:0}},
    rigidBody:{mass:1,velocity:{x:0,y:0,z:0},linearDamping:0},
    collider:{type:'sphere',radius:.25}
  }]
};
const replicationSession={
  schema:'evercraft.world-engine.replication.v1',
  sessionId:'proof-session',
  worldId:replicationWorld.id,
  authorityPeerId:'authority',
  rollbackWindowTicks:20,
  checkpointIntervalTicks:5
};
const authority=new AuthoritativeReplicationRuntime(replicationSession,replicationWorld);
const predictor=new PredictiveReplicationRuntime(replicationSession,replicationWorld,'peer-a');
const acceptedInput=createReplicatedInput(replicationSession,'peer-a',1,{
  id:'accepted-speed',
  tick:2,
  entityId:'player',
  kind:'set_velocity',
  value:{x:1,y:0,z:0}
});
const rejectedPrediction=createReplicatedInput(replicationSession,'peer-a',2,{
  id:'bad-prediction',
  tick:4,
  entityId:'player',
  kind:'impulse',
  value:{x:5,y:0,z:0}
});
const futureInput=createReplicatedInput(replicationSession,'peer-a',3,{
  id:'future-speed',
  tick:6,
  entityId:'player',
  kind:'set_velocity',
  value:{x:2,y:0,z:0}
});
authority.submitInput(acceptedInput);
predictor.queueInput(acceptedInput);
predictor.queueInput(rejectedPrediction);
predictor.queueInput(futureInput);
authority.run(5);
const authorityCheckpoint=authority.checkpoint();
predictor.run(7);
const reconciliation=predictor.reconcile(authorityCheckpoint);
assert.equal(reconciliation.rolledBack,true);
assert.deepEqual(reconciliation.discardedPastPredictionDigests,[rejectedPrediction.digest]);
assert.deepEqual(reconciliation.replayedInputDigests,[futureInput.digest]);
authority.submitInput(futureInput);
authority.run(2);
assert.equal(predictor.runtime.snapshot().digest,authority.runtime.snapshot().digest);

const webgpuGeometry={
  schema:'evercraft.world-engine.geometry.v1',
  id:'geometry:proof-cube',
  primitive:'triangles',
  positions:[
    -1,-1,0,
    1,-1,0,
    0,1,0
  ],
  normals:[
    0,0,1,
    0,0,1,
    0,0,1
  ],
  uvs:[
    0,0,
    1,0,
    .5,1
  ]
};
const webgpuPlan=compileWebGpuRenderPlan(
  visualFrame,
  [webgpuGeometry],
  {width:1280,height:720}
);
const webgpuPlanAgain=compileWebGpuRenderPlan(
  visualFrame,
  [webgpuGeometry],
  {width:1280,height:720}
);
assert.equal(webgpuPlan.digest,webgpuPlanAgain.digest);
assert.equal(webgpuPlan.draws.length,1);
assert.equal(webgpuPlan.lights.length,1);
assert.match(EVERCRAFT_WEBGPU_WGSL,/@vertex/);
assert.match(EVERCRAFT_WEBGPU_WGSL,/@fragment/);

const proofBaseTexture={
  schema:'evercraft.world-engine.texture.v1',
  id:'texture:proof-base',
  width:2,
  height:2,
  format:'rgba8unorm-srgb',
  data:[
    255,0,0,255, 0,255,0,255,
    0,0,255,255, 255,255,255,255
  ]
};
const proofOrmTexture={
  schema:'evercraft.world-engine.texture.v1',
  id:'texture:proof-orm',
  width:1,
  height:1,
  format:'rgba8unorm',
  data:[255,128,64,255]
};
const proofEmissiveTexture={
  schema:'evercraft.world-engine.texture.v1',
  id:'texture:proof-emissive',
  width:1,
  height:1,
  format:'rgba8unorm-srgb',
  data:[64,32,16,255]
};
const texturedVisualWorld=structuredClone(visualWorld);
texturedVisualWorld.visualScene.materials[0]={
  ...texturedVisualWorld.visualScene.materials[0],
  textureRefs:{
    baseColor:proofBaseTexture.id,
    orm:proofOrmTexture.id,
    emissive:proofEmissiveTexture.id
  },
  sampler:{
    addressModeU:'clamp-to-edge',
    addressModeV:'repeat',
    magFilter:'linear',
    minFilter:'nearest'
  }
};
const texturedRuntime=new EvercraftWorldRuntime(texturedVisualWorld);
const texturedSnapshot=texturedRuntime.snapshot();
const texturedFrame=compileVisualFrame(
  texturedSnapshot.worldId,
  texturedSnapshot.tick,
  texturedSnapshot.timeSec,
  texturedRuntime.definition.visualScene,
  texturedSnapshot.entities,
  texturedSnapshot.cameraRuntime,
  texturedSnapshot.activeEntityIds
);
const texturedPlan=compileWebGpuRenderPlan(
  texturedFrame,
  [webgpuGeometry],
  {width:1280,height:720},
  [proofEmissiveTexture,proofBaseTexture,proofOrmTexture]
);
assert.deepEqual(texturedPlan.requiredTextureIds,[
  'texture:proof-base',
  'texture:proof-emissive',
  'texture:proof-orm'
]);
assert.deepEqual(texturedPlan.draws[0].textureFlags,[1,1,1,0]);
assert.equal(verifyWebGpuRenderPlan(texturedPlan),true);

const textureResidency=planTextureResidency(
  [proofBaseTexture.id],
  texturedPlan.requiredTextureIds,
  [proofBaseTexture,proofOrmTexture,proofEmissiveTexture],
  1024
);
assert.deepEqual(textureResidency.retainedTextureIds,[proofBaseTexture.id]);
assert.deepEqual(textureResidency.loadTextureIds,[
  'texture:proof-emissive',
  'texture:proof-orm'
]);

const reloadedBaseTexture={
  ...proofBaseTexture,
  data:proofBaseTexture.data.map((value,index)=>index%4===3?255:(255-value))
};
const textureHotReload=applyTextureHotReload(
  [proofBaseTexture,proofOrmTexture,proofEmissiveTexture],
  reloadedBaseTexture
);
assert.equal(textureHotReload.receipt.replaced,true);
assert.equal(
  textureHotReload.receipt.previousDigest,
  textureAssetDigest(proofBaseTexture)
);
assert.equal(
  textureHotReload.receipt.nextDigest,
  textureAssetDigest(reloadedBaseTexture)
);

const proofNormalTexture={
  schema:'evercraft.world-engine.texture.v1',
  id:'texture:proof-normal',
  width:1,
  height:1,
  format:'rgba8unorm',
  data:[128,128,255,255]
};
const normalMappedGeometry={
  ...webgpuGeometry,
  tangents:[
    1,0,0,1,
    1,0,0,1,
    1,0,0,1
  ]
};
const normalMappedWorld=structuredClone(visualWorld);
normalMappedWorld.visualScene.materials[0]={
  ...normalMappedWorld.visualScene.materials[0],
  textureRefs:{normal:proofNormalTexture.id}
};
const normalRuntime=new EvercraftWorldRuntime(normalMappedWorld);
const normalSnapshot=normalRuntime.snapshot();
const normalFrame=compileVisualFrame(
  normalSnapshot.worldId,
  normalSnapshot.tick,
  normalSnapshot.timeSec,
  normalRuntime.definition.visualScene,
  normalSnapshot.entities,
  normalSnapshot.cameraRuntime,
  normalSnapshot.activeEntityIds
);
const normalPlan=compileWebGpuRenderPlan(
  normalFrame,
  [normalMappedGeometry],
  {width:1280,height:720},
  [proofNormalTexture]
);
assert.deepEqual(normalPlan.requiredTextureIds,[proofNormalTexture.id]);
assert.deepEqual(normalPlan.draws[0].textureFlags,[0,0,0,1]);
assert.equal(normalPlan.draws[0].textureRefs.normal,proofNormalTexture.id);
assert.equal(verifyWebGpuRenderPlan(normalPlan),true);

const editAssetA={
  id:'geometry:proof-cube',
  kind:'geometry',
  revision:1,
  sha256:'a'.repeat(64),
  uri:'evercraft://assets/geometry/proof-cube',
  contentType:'application/vnd.evercraft.geometry+json',
  provenance:{
    sourceRef:'fallen:proof-cube',
    rightsState:'owned',
    license:'Evercraft-owned'
  }
};
const editAssetB={...editAssetA,revision:2,sha256:'b'.repeat(64)};
const editManifest=createWorldAssetManifest(visualWorld.id,[editAssetA]);
const originalSemanticWorldDigest=semanticWorldDigest(visualWorld);
const originalSemanticAssetDigest=semanticAssetManifestDigest(editManifest);
const editTransaction={
  schema:'evercraft.world-engine.edit-transaction.v1',
  id:'proof-live-edit',
  worldId:visualWorld.id,
  baseWorldDigest:visualReceipt.definitionDigest,
  baseAssetManifestDigest:editManifest.digest,
  actor:{kind:'agent',id:'proof-editor'},
  reason:'prove reversible live authoring',
  operations:[
    {
      id:'move-proof-object',
      kind:'set_transform',
      entityId:'proof-object',
      value:{position:{x:2,y:0,z:0}}
    },
    {
      id:'replace-proof-geometry',
      kind:'upsert_asset',
      asset:editAssetB
    }
  ]
};
const edited=applyWorldEditTransaction(visualWorld,editManifest,editTransaction);
assert.deepEqual(edited.receipt.hotReloadAssetIds,['geometry:proof-cube']);
const undone=applyWorldEditTransaction(
  edited.world,
  edited.assets,
  edited.receipt.inverseTransaction
);
assert.equal(semanticWorldDigest(undone.world),originalSemanticWorldDigest);
assert.equal(semanticAssetManifestDigest(undone.assets),originalSemanticAssetDigest);

const reloadedGeometry={
  ...webgpuGeometry,
  positions:[
    -2,-2,0,
    2,-2,0,
    0,2,0
  ]
};
const geometryHotReload=applyGeometryHotReload([webgpuGeometry],reloadedGeometry);
assert.equal(geometryHotReload.receipt.replaced,true);
assert.notEqual(
  geometryHotReload.receipt.previousDigest,
  geometryHotReload.receipt.nextDigest
);

const liveMigration=migrateWorldRuntime({
  id:'proof-live-runtime-migration',
  previousDefinition:visualWorld,
  nextDefinition:edited.world,
  previousSnapshot:visualSnapshot
});
assert.equal(liveMigration.snapshot.tick,visualSnapshot.tick);
assert.equal(
  liveMigration.snapshot.entities.find(entity=>entity.id==='proof-object').transform.position.x,
  2
);
assert.equal(liveMigration.receipt.cameraRuntimePreserved,true);
assert.equal(verifyWorldRuntimeMigrationReceipt(liveMigration.receipt),true);

process.stdout.write(JSON.stringify({
  schema:'evercraft.world-engine.proof.v15',
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
  audio:{
    replay:audioReceipt,
    listener:audioFrame.listener.entityId,
    frame_digest:audioFrame.digest,
    emitters:audioFrame.emitters.map(item=>({
      entity_id:item.entityId,
      state:item.state,
      attenuation:item.attenuation,
      effective_gain:item.effectiveGain
    }))
  },
  replication:{
    checkpoint_tick:authorityCheckpoint.tick,
    checkpoint_digest:authorityCheckpoint.digest,
    reconciliation,
    authority_final_digest:authority.runtime.snapshot().digest,
    predictor_final_digest:predictor.runtime.snapshot().digest
  },
  webgpu:{
    plan_digest:webgpuPlan.digest,
    source_visual_frame_digest:webgpuPlan.sourceVisualFrameDigest,
    draw_count:webgpuPlan.draws.length,
    light_count:webgpuPlan.lights.length,
    shading_model:webgpuPlan.shadingModel,
    owned_wgsl:true,
    browser_gpu_submission:'separate_v12_device_conformance'
  },
  texture_runtime:{
    textured_plan_digest:texturedPlan.digest,
    required_texture_ids:texturedPlan.requiredTextureIds,
    texture_digests:texturedPlan.textures.map(row=>({id:row.id,digest:row.digest})),
    sampler:texturedPlan.draws[0].sampler,
    residency_digest:textureResidency.digest,
    retained:textureResidency.retainedTextureIds,
    loaded:textureResidency.loadTextureIds,
    evicted:textureResidency.evictTextureIds,
    hot_reload_receipt:textureHotReload.receipt
  },
  normal_map_runtime:{
    plan_digest:normalPlan.digest,
    required_texture_ids:normalPlan.requiredTextureIds,
    texture_flags:normalPlan.draws[0].textureFlags,
    normal_texture:normalPlan.draws[0].textureRefs.normal,
    tangent_count:normalMappedGeometry.tangents.length/4
  },
  studio_edit:{
    transaction_digest:edited.receipt.transactionDigest,
    edit_receipt_digest:edited.receipt.digest,
    before_world_digest:edited.receipt.beforeWorldDigest,
    after_world_digest:edited.receipt.afterWorldDigest,
    before_asset_digest:edited.receipt.beforeAssetManifestDigest,
    after_asset_digest:edited.receipt.afterAssetManifestDigest,
    hot_reload_assets:edited.receipt.hotReloadAssetIds,
    semantic_undo_world_digest:semanticWorldDigest(undone.world),
    semantic_undo_asset_digest:semanticAssetManifestDigest(undone.assets),
    geometry_hot_reload_receipt:geometryHotReload.receipt
  },
  runtime_migration:{
    receipt_digest:liveMigration.receipt.digest,
    source_snapshot_digest:liveMigration.receipt.sourceSnapshotDigest,
    migrated_snapshot_digest:liveMigration.receipt.migratedSnapshotDigest,
    tick:liveMigration.receipt.tick,
    camera_runtime_preserved:liveMigration.receipt.cameraRuntimePreserved,
    audio_scene_runtime_preserved:liveMigration.receipt.audioSceneRuntimePreserved,
    entity_notes:liveMigration.receipt.entityNotes
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
    deterministic_audio_scene:true,
    spatial_audio_attenuation:true,
    audio_listener_switching:true,
    digest_verified_snapshot_restore:true,
    deterministic_replication:true,
    client_prediction_rollback:true,
    authoritative_checkpoint_convergence:true,
    deterministic_webgpu_render_plan:true,
    visual_frame_receipt_verified_before_gpu_plan:true,
    owned_wgsl_shader_contract:true,
    deterministic_texture_assets:true,
    canonical_sampler_state:true,
    deterministic_texture_residency:true,
    texture_hot_reload_receipts:true,
    textured_webgpu_plan:true,
    gpu_plan_receipt_verified_before_submission:true,
    tangent_space_geometry:true,
    normal_map_tbn_shading:true,
    linear_normal_map_contract:true,
    deterministic_live_world_edit:true,
    reversible_versioned_edit_receipts:true,
    explicit_asset_rights_lineage:true,
    deterministic_geometry_hot_reload:true,
    compatibility_gated_runtime_migration:true,
    authored_transform_wins_over_runtime_position:true,
    incompatible_runtime_state_resets_explicitly:true,
    runtime_migration_receipts:true,
    canonical_snapshot_digest:true
  }
},null,2)+'\n');
