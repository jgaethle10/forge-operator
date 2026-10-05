import test from 'node:test';
import assert from 'node:assert/strict';
import { EvercraftWorldRuntime, type WorldDefinition } from './engine.js';
import { broadPhasePairs } from './spatial.js';

function collisionWorld(entities:WorldDefinition['entities']):WorldDefinition{
  return {
    schema:'evercraft.world-engine.world.v1',
    id:'collision-proof',
    version:1,
    tickRateHz:60,
    gravity:{x:0,y:0,z:0},
    entities
  };
}

function runUntilCollision(runtime:EvercraftWorldRuntime,maxTicks:number){
  for(let tick=0;tick<maxTicks;tick++){
    runtime.step();
    if(runtime.collisions.length) return runtime.collisions;
  }
  return [];
}

test('dynamic spheres collide and exchange velocity with elastic restitution',()=>{
  const world=collisionWorld([
    {
      id:'alpha',
      transform:{position:{x:-1,y:0,z:0}},
      rigidBody:{mass:1,velocity:{x:1,y:0,z:0},restitution:1},
      collider:{type:'sphere',radius:.5}
    },
    {
      id:'beta',
      transform:{position:{x:1,y:0,z:0}},
      rigidBody:{mass:1,velocity:{x:-1,y:0,z:0},restitution:1},
      collider:{type:'sphere',radius:.5}
    }
  ]);

  const runtime=new EvercraftWorldRuntime(world);
  const contacts=runUntilCollision(runtime,40);
  const alpha=runtime.entity('alpha');
  const beta=runtime.entity('beta');

  assert.ok(alpha && beta);
  assert.equal(contacts.length,1);
  assert.equal(contacts[0].kind,'sphere_sphere');
  assert.ok(alpha.rigidBody!.velocity.x<0);
  assert.ok(beta.rigidBody!.velocity.x>0);
});

test('dynamic sphere rebounds from a static box',()=>{
  const world=collisionWorld([
    {
      id:'ball',
      transform:{position:{x:-1.5,y:0,z:0}},
      rigidBody:{mass:1,velocity:{x:1,y:0,z:0},restitution:1},
      collider:{type:'sphere',radius:.5}
    },
    {
      id:'wall',
      transform:{position:{x:0,y:0,z:0}},
      rigidBody:{mass:1,velocity:{x:0,y:0,z:0},restitution:1,kinematic:true},
      collider:{type:'box',halfExtents:{x:.5,y:2,z:2}}
    }
  ]);

  const runtime=new EvercraftWorldRuntime(world);
  const contacts=runUntilCollision(runtime,50);
  const ball=runtime.entity('ball');

  assert.ok(ball);
  assert.equal(contacts.length,1);
  assert.equal(contacts[0].kind,'sphere_box');
  assert.ok(ball.rigidBody!.velocity.x<0);
  assert.ok(ball.transform.position.x<=-1);
});

test('broad phase emits each candidate pair once in canonical id order',()=>{
  const world=collisionWorld([
    {
      id:'zeta',
      transform:{position:{x:0,y:0,z:0}},
      collider:{type:'sphere',radius:1}
    },
    {
      id:'alpha',
      transform:{position:{x:.5,y:0,z:0}},
      collider:{type:'sphere',radius:1}
    },
    {
      id:'far',
      transform:{position:{x:100,y:0,z:0}},
      collider:{type:'sphere',radius:1}
    }
  ]);
  const runtime=new EvercraftWorldRuntime(world);
  const entities=['zeta','alpha','far'].map(id=>runtime.entity(id)!);
  const pairs=broadPhasePairs(entities);

  assert.deepEqual(pairs.map(([a,b])=>[a.id,b.id]),[['alpha','zeta']]);
});

test('collision simulation remains deterministic across repeated replay',()=>{
  const world=collisionWorld([
    {
      id:'left',
      transform:{position:{x:-2,y:0,z:0}},
      rigidBody:{mass:1,velocity:{x:2,y:0,z:0},restitution:.4},
      collider:{type:'box',halfExtents:{x:.5,y:.5,z:.5}}
    },
    {
      id:'right',
      transform:{position:{x:2,y:0,z:0}},
      rigidBody:{mass:2,velocity:{x:-1,y:0,z:0},restitution:.4},
      collider:{type:'box',halfExtents:{x:.5,y:.5,z:.5}}
    }
  ]);

  const first=new EvercraftWorldRuntime(world).run(120);
  const second=new EvercraftWorldRuntime(world).run(120);
  assert.equal(first.digest,second.digest);
});
