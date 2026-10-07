import assert from 'node:assert/strict';
import test from 'node:test';

import { createWorldForgeStarterProject } from './world-forge-http.js';
import {
  initializeWorldForgeRuntimeSession,
  stepWorldForgeRuntimeSession,
  verifyWorldForgeRuntimeStepReceipt,
} from './world-forge-runtime-session.js';

test('World Forge runtime session initializes from canonical World Engine bridge state',()=>{
  const project=createWorldForgeStarterProject();
  const session=initializeWorldForgeRuntimeSession({project});

  assert.equal(session.snapshot.tick,0);
  assert.equal(session.snapshot.timeSec,0);
  assert.equal(session.snapshot.worldVersion,project.version);
  assert.equal(session.overlay.length,project.nodes.length);

  const hero=session.overlay.find(row=>row.nodeId==='hero-core');
  assert.ok(hero);
  assert.deepEqual(hero!.transform.position,{x:0,y:0,z:1});
  assert.deepEqual(hero!.transform.scale,{x:1,y:1,z:1});
});

test('World Forge runtime session advances exact deterministic ticks',()=>{
  const project=createWorldForgeStarterProject();
  const session=initializeWorldForgeRuntimeSession({project});
  const stepped=stepWorldForgeRuntimeSession({
    project,
    runtimeWorld:session.bridge.world,
    snapshot:session.snapshot,
    ticks:6,
  });

  assert.equal(stepped.snapshot.tick,6);
  assert.equal(stepped.receipt.tickBefore,0);
  assert.equal(stepped.receipt.tickAfter,6);
  assert.equal(stepped.receipt.ticksAdvanced,6);
  assert.equal(stepped.receipt.deterministic,true);
  assert.equal(stepped.overlay.length,session.overlay.length);
  assert.equal(verifyWorldForgeRuntimeStepReceipt(stepped.receipt),true);
});

test('runtime input is projected back into World Forge Z-up viewport coordinates',()=>{
  const project=createWorldForgeStarterProject();
  const session=initializeWorldForgeRuntimeSession({project});
  const heroEntityId=session.bridge.receipt.nodeEntityMap.find(
    row=>row.nodeId==='hero-core',
  )?.entityId;
  assert.ok(heroEntityId);

  const stepped=stepWorldForgeRuntimeSession({
    project,
    runtimeWorld:session.bridge.world,
    snapshot:session.snapshot,
    ticks:1,
    inputs:[{
      id:'teleport-runtime-hero',
      tick:1,
      entityId:heroEntityId!,
      kind:'teleport',
      value:{x:4,y:2,z:-3},
    }],
  });

  const hero=stepped.overlay.find(row=>row.nodeId==='hero-core');
  assert.ok(hero);
  // Engine Y-up {4,2,-3} -> Forge Z-up {4,3,2}.
  assert.deepEqual(hero!.transform.position,{x:4,y:3,z:2});
  assert.equal(stepped.receipt.inputCount,1);
});

test('runtime session supports zero-tick projection without mutating time',()=>{
  const project=createWorldForgeStarterProject();
  const session=initializeWorldForgeRuntimeSession({project});
  const projected=stepWorldForgeRuntimeSession({
    project,
    runtimeWorld:session.bridge.world,
    snapshot:session.snapshot,
    ticks:0,
  });

  assert.equal(projected.snapshot.digest,session.snapshot.digest);
  assert.equal(projected.snapshot.tick,0);
  assert.equal(projected.receipt.ticksAdvanced,0);
});

test('runtime session fails closed on snapshot tampering',()=>{
  const project=createWorldForgeStarterProject();
  const session=initializeWorldForgeRuntimeSession({project});
  const tampered=structuredClone(session.snapshot);
  tampered.tick=99;

  assert.throws(
    ()=>stepWorldForgeRuntimeSession({
      project,
      runtimeWorld:session.bridge.world,
      snapshot:tampered,
      ticks:1,
    }),
    /world_forge_runtime_session_snapshot_digest_invalid/,
  );
});

test('runtime session refuses a definition that drifted from the current Forge project',()=>{
  const project=createWorldForgeStarterProject();
  const session=initializeWorldForgeRuntimeSession({project});
  const drifted=structuredClone(session.bridge.world);
  const hero=drifted.entities.find(entity=>
    entity.properties?.worldForgeNodeId==='hero-core'
  );
  assert.ok(hero);
  hero!.name='Runtime-only drift';

  assert.throws(
    ()=>stepWorldForgeRuntimeSession({
      project,
      runtimeWorld:drifted,
      snapshot:session.snapshot,
      ticks:1,
    }),
    /world_forge_runtime_session_world_semantic_mismatch/,
  );
});

test('runtime step receipt detects tampering',()=>{
  const project=createWorldForgeStarterProject();
  const session=initializeWorldForgeRuntimeSession({project});
  const stepped=stepWorldForgeRuntimeSession({
    project,
    runtimeWorld:session.bridge.world,
    snapshot:session.snapshot,
    ticks:1,
  });

  const tampered=structuredClone(stepped.receipt);
  tampered.tickAfter+=1;
  assert.equal(verifyWorldForgeRuntimeStepReceipt(tampered),false);
});
