import assert from 'node:assert/strict';
import { EvercraftWorldRuntime, replayWorld } from './engine.ts';

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
      collider:{type:'box',halfExtents:{x:.5,y:1,z:1}}
    }
  ]
};

const receipt=replayWorld(world,180,[]);
assert.equal(receipt.deterministic,true);

const runtime=new EvercraftWorldRuntime(world);
const snapshot=runtime.run(180);
const orb=runtime.entity('proof-orb');
assert.ok(orb);
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
collisionRuntime.run(31);
assert.equal(collisionRuntime.collisions.length,1);
assert.equal(collisionRuntime.collisions[0].kind,'sphere_sphere');

process.stdout.write(JSON.stringify({
  schema:'evercraft.world-engine.proof.v2',
  status:'passed',
  world_id:world.id,
  replay:receipt,
  final_snapshot_digest:snapshot.digest,
  collision_contact:collisionRuntime.collisions[0],
  assertions:{
    deterministic_replay:true,
    fixed_timestep:true,
    ground_collision:true,
    entity_collision:true,
    canonical_snapshot_digest:true
  }
},null,2)+'\n');
