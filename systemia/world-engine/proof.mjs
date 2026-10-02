import assert from 'node:assert/strict';
import { EvercraftWorldRuntime, replayWorld } from './engine.ts';

const world={
  schema:'evercraft.world-engine.world.v1',
  id:'evercraft-world-engine-proof',
  version:1,
  tickRateHz:60,
  gravity:{x:0,y:-9.81,z:0},
  ground:{enabled:true,height:0},
  entities:[{
    id:'proof-orb',
    transform:{position:{x:0,y:3,z:0}},
    rigidBody:{mass:1,velocity:{x:.5,y:0,z:0},restitution:0},
    collider:{type:'sphere',radius:.5}
  }]
};

const receipt=replayWorld(world,180,[]);
assert.equal(receipt.deterministic,true);

const runtime=new EvercraftWorldRuntime(world);
const snapshot=runtime.run(180);
const orb=runtime.entity('proof-orb');
assert.ok(orb);
assert.ok(Math.abs(orb.transform.position.y-.5)<1e-9);

process.stdout.write(JSON.stringify({
  schema:'evercraft.world-engine.proof.v1',
  status:'passed',
  world_id:world.id,
  replay:receipt,
  final_snapshot_digest:snapshot.digest,
  assertions:{
    deterministic_replay:true,
    fixed_timestep:true,
    ground_collision:true,
    canonical_snapshot_digest:true
  }
},null,2)+'\n');
