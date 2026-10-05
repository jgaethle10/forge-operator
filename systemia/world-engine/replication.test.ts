import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EvercraftWorldRuntime,
  verifyWorldSnapshot,
  type WorldDefinition
} from './engine.js';
import {
  AuthoritativeReplicationRuntime,
  PredictiveReplicationRuntime,
  createReplicatedInput,
  verifyAuthoritativeCheckpoint,
  verifyReplicatedInput,
  type ReplicationSessionDefinition
} from './replication.js';

function world():WorldDefinition{
  return {
    schema:'evercraft.world-engine.world.v1',
    id:'replication-proof-world',
    version:1,
    tickRateHz:10,
    gravity:{x:0,y:0,z:0},
    entities:[
      {
        id:'player',
        transform:{position:{x:0,y:0,z:0}},
        rigidBody:{mass:1,velocity:{x:0,y:0,z:0},linearDamping:0},
        collider:{type:'sphere',radius:.25},
        properties:{owner:'peer-a'}
      }
    ]
  };
}

function session(window=20):ReplicationSessionDefinition{
  return {
    schema:'evercraft.world-engine.replication.v1',
    sessionId:'session-proof',
    worldId:'replication-proof-world',
    authorityPeerId:'authority',
    rollbackWindowTicks:window,
    checkpointIntervalTicks:5
  };
}

test('engine restores a digest-verified checkpoint exactly',()=>{
  const runtime=new EvercraftWorldRuntime(world());
  runtime.run(4,[{
    id:'move',
    tick:2,
    entityId:'player',
    kind:'set_velocity',
    value:{x:2,y:0,z:0}
  }]);
  const checkpoint=runtime.snapshot();
  assert.equal(verifyWorldSnapshot(checkpoint),true);

  runtime.run(3);
  assert.notEqual(runtime.snapshot().digest,checkpoint.digest);

  const restored=runtime.restoreSnapshot(checkpoint);
  assert.equal(restored.digest,checkpoint.digest);
  assert.equal(runtime.tick,4);
  assert.equal(runtime.entity('player')!.transform.position.x,checkpoint.entities[0].transform.position.x);
});

test('snapshot restoration fails closed on tampering',()=>{
  const runtime=new EvercraftWorldRuntime(world());
  runtime.run(2);
  const checkpoint=runtime.snapshot();
  const tampered=structuredClone(checkpoint);
  tampered.entities[0].transform.position.x=999;

  assert.equal(verifyWorldSnapshot(tampered),false);
  assert.throws(
    ()=>runtime.restoreSnapshot(tampered),
    /world_snapshot_digest_invalid/
  );
});

test('replicated input envelope detects payload tampering',()=>{
  const packet=createReplicatedInput(session(),'peer-a',1,{
    id:'move',
    tick:2,
    entityId:'player',
    kind:'set_velocity',
    value:{x:1,y:0,z:0}
  });
  assert.equal(verifyReplicatedInput(packet),true);

  const tampered=structuredClone(packet);
  (tampered.input as any).value.x=9;
  assert.equal(verifyReplicatedInput(tampered),false);
});

test('matching prediction accepts authoritative checkpoint without rollback',()=>{
  const config=session();
  const authority=new AuthoritativeReplicationRuntime(config,world());
  const client=new PredictiveReplicationRuntime(config,world(),'peer-a');

  const packet=createReplicatedInput(config,'peer-a',1,{
    id:'move',
    tick:2,
    entityId:'player',
    kind:'set_velocity',
    value:{x:1,y:0,z:0}
  });
  authority.submitInput(packet);
  client.queueInput(packet);

  authority.run(5);
  client.run(5);
  const checkpoint=authority.checkpoint();

  assert.equal(verifyAuthoritativeCheckpoint(checkpoint),true);
  const receipt=client.reconcile(checkpoint);

  assert.equal(receipt.rolledBack,false);
  assert.equal(receipt.predictedDigestAtCheckpoint,checkpoint.snapshot.digest);
  assert.equal(client.runtime.snapshot().digest,authority.runtime.snapshot().digest);
});

test('client rolls back bad prediction and replays legitimate future input',()=>{
  const config=session();
  const authority=new AuthoritativeReplicationRuntime(config,world());
  const client=new PredictiveReplicationRuntime(config,world(),'peer-a');

  const accepted=createReplicatedInput(config,'peer-a',1,{
    id:'move',
    tick:2,
    entityId:'player',
    kind:'set_velocity',
    value:{x:1,y:0,z:0}
  });
  const clientOnlyBadPrediction=createReplicatedInput(config,'peer-a',2,{
    id:'bad-impulse',
    tick:4,
    entityId:'player',
    kind:'impulse',
    value:{x:5,y:0,z:0}
  });
  const futureAccepted=createReplicatedInput(config,'peer-a',3,{
    id:'future-speed',
    tick:6,
    entityId:'player',
    kind:'set_velocity',
    value:{x:2,y:0,z:0}
  });

  authority.submitInput(accepted);
  client.queueInput(accepted);
  client.queueInput(clientOnlyBadPrediction);
  client.queueInput(futureAccepted);

  authority.run(5);
  const checkpoint=authority.checkpoint();

  client.run(7);
  const diverged=client.runtime.snapshot();
  assert.notEqual(diverged.digest,checkpoint.snapshot.digest);

  const receipt=client.reconcile(checkpoint);
  assert.equal(receipt.rolledBack,true);
  assert.equal(receipt.checkpointTick,5);
  assert.equal(receipt.localTickBefore,7);
  assert.equal(receipt.localTickAfter,7);
  assert.equal(receipt.replayedTicks,2);
  assert.deepEqual(receipt.replayedInputDigests,[futureAccepted.digest]);
  assert.deepEqual(receipt.discardedPastPredictionDigests,[clientOnlyBadPrediction.digest]);

  authority.submitInput(futureAccepted);
  authority.run(2);

  assert.equal(client.runtime.snapshot().digest,authority.runtime.snapshot().digest);
  assert.ok(Math.abs(client.runtime.entity('player')!.transform.position.x-authority.runtime.entity('player')!.transform.position.x)<1e-12);
});

test('authority input submission is idempotent but sequence conflicts fail closed',()=>{
  const config=session();
  const authority=new AuthoritativeReplicationRuntime(config,world());
  const packet=createReplicatedInput(config,'peer-a',7,{
    id:'move',
    tick:2,
    entityId:'player',
    kind:'set_velocity',
    value:{x:1,y:0,z:0}
  });

  assert.equal(authority.submitInput(packet).accepted,true);
  assert.equal(authority.submitInput(packet).duplicate,true);

  const conflict=createReplicatedInput(config,'peer-a',7,{
    id:'move-other',
    tick:2,
    entityId:'player',
    kind:'set_velocity',
    value:{x:3,y:0,z:0}
  });
  assert.throws(
    ()=>authority.submitInput(conflict),
    /replication_input_sequence_conflict/
  );
});

test('authority rejects late inputs instead of silently rewriting history',()=>{
  const config=session();
  const authority=new AuthoritativeReplicationRuntime(config,world());
  authority.run(3);

  const late=createReplicatedInput(config,'peer-a',1,{
    id:'late',
    tick:2,
    entityId:'player',
    kind:'impulse',
    value:{x:1,y:0,z:0}
  });
  assert.throws(
    ()=>authority.submitInput(late),
    /replication_authority_late_input_rejected/
  );
});

test('checkpoints outside rollback memory fail closed',()=>{
  const config=session(5);
  const authority=new AuthoritativeReplicationRuntime(config,world());
  const client=new PredictiveReplicationRuntime(config,world(),'peer-a');

  authority.run(2);
  const oldCheckpoint=authority.checkpoint();
  client.run(10);

  assert.throws(
    ()=>client.reconcile(oldCheckpoint),
    /replication_checkpoint_outside_rollback_window/
  );
});

test('checkpoint packet tampering is rejected before reconciliation',()=>{
  const config=session();
  const authority=new AuthoritativeReplicationRuntime(config,world());
  const client=new PredictiveReplicationRuntime(config,world(),'peer-a');
  authority.run(2);
  const checkpoint=authority.checkpoint();
  const tampered=structuredClone(checkpoint);
  tampered.snapshot.entities[0].transform.position.x=42;

  assert.equal(verifyAuthoritativeCheckpoint(tampered),false);
  assert.throws(
    ()=>client.reconcile(tampered),
    /replication_checkpoint_digest_invalid/
  );
});
