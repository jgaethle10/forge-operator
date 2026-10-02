import test from 'node:test';
import assert from 'node:assert/strict';
import { EvercraftWorldRuntime, replayWorld, type WorldDefinition } from './engine.js';
import { projectWorldstateIntoWorld, worldFromFallenStudio } from './bridges.js';

const demo:WorldDefinition={
  schema:'evercraft.world-engine.world.v1',
  id:'proof-world',
  version:1,
  tickRateHz:60,
  gravity:{x:0,y:-9.81,z:0},
  ground:{enabled:true,height:0},
  entities:[
    {
      id:'ember',
      transform:{position:{x:0,y:4,z:0}},
      rigidBody:{
        mass:1,
        velocity:{x:1,y:0,z:0},
        restitution:0,
        linearDamping:0
      },
      collider:{type:'sphere',radius:.5},
      tags:['character']
    }
  ]
};

test('replay is deterministic for the same world and input ledger',()=>{
  const inputs=[
    {id:'impulse-1',tick:10,entityId:'ember',kind:'impulse' as const,value:{x:0,y:2,z:0}}
  ];
  const receipt=replayWorld(demo,240,inputs);
  assert.equal(receipt.deterministic,true);
  assert.equal(receipt.finalTick,240);
});

test('dynamic entities collide with the canonical ground plane',()=>{
  const runtime=new EvercraftWorldRuntime(demo);
  runtime.run(240);
  const ember=runtime.entity('ember');
  assert.ok(ember);
  assert.ok(Math.abs(ember!.transform.position.y-.5)<1e-9);
  assert.equal(ember!.rigidBody!.velocity.y,0);
});

test('input events are ordered and reproducible',()=>{
  const inputs=[
    {id:'b',tick:1,entityId:'ember',kind:'set_velocity' as const,value:{x:3,y:0,z:0}},
    {id:'a',tick:1,entityId:'ember',kind:'set_velocity' as const,value:{x:2,y:0,z:0}}
  ];
  const a=new EvercraftWorldRuntime(demo).run(1,inputs);
  const b=new EvercraftWorldRuntime(demo).run(1,[...inputs].reverse());
  assert.equal(a.digest,b.digest);
});

test('Fallen studio worlds compile into traversable world-engine entities',()=>{
  const world=worldFromFallenStudio({
    schema:'evercraft.fallen.studio-world.v1',
    id:'evercraft-hq-v1',
    version:1,
    rooms:[
      {id:'lobby',label:'Lobby',setPlateAssetId:'plate-lobby',displaySlots:[],cameraAnchors:[]},
      {id:'global_ops',label:'Global Ops',setPlateAssetId:'plate-ops',displaySlots:[],cameraAnchors:[]}
    ],
    transitions:[
      {from:'lobby',to:'global_ops',style:'dolly_through_portal',durationSec:1.2}
    ]
  });
  assert.equal(world.entities.length,3);
  assert.ok(world.entities.some(entity=>entity.id==='portal:lobby:global_ops'));
});

test('Worldstate evidence can be projected without gaining decision authority',()=>{
  const projected=projectWorldstateIntoWorld(demo,{
    schema:'evercraft.worldstate.snapshot.v1',
    id:'yakima-proof',
    observations:[{
      id:'river-1',
      label:'River gauge',
      evidence_state:'observed',
      source_refs:['source:official:gauge'],
      lat:46.60,
      lon:-120.50
    }]
  },{lat:46.60,lon:-120.50});

  const marker=projected.entities.find(entity=>entity.id==='worldstate:river-1');
  assert.ok(marker);
  assert.equal(marker!.properties!.evidence_state,'observed');
  assert.equal((projected.metadata!.worldstate_projection as any).decision_authority,false);
});
