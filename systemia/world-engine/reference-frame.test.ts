import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWorldEngineReferenceFramePackage,
  WORLD_ENGINE_REFERENCE_GEOMETRY
} from './reference-frame.js';

test('reference frame package is deterministic and binds world through GPU plan',()=>{
  const first=buildWorldEngineReferenceFramePackage();
  const second=buildWorldEngineReferenceFramePackage();

  assert.equal(first.digest,second.digest);
  assert.equal(first.planDigest,second.planDigest);
  assert.equal(first.visualFrameDigest,second.visualFrameDigest);
  assert.equal(first.plan.sourceVisualFrameDigest,first.visualFrameDigest);
  assert.equal(first.plan.worldId,first.worldId);
  assert.equal(first.plan.width,64);
  assert.equal(first.plan.height,64);
  assert.equal(first.plan.draws.length,1);
  assert.equal(first.plan.draws[0].entityId,'reference-triangle');
  assert.equal(first.plan.draws[0].geometryId,WORLD_ENGINE_REFERENCE_GEOMETRY.id);
  assert.equal(first.plan.draws[0].materialId,'reference-unlit');
  assert.equal(first.plan.draws[0].materialModel,1);
  assert.equal(first.plan.draws[0].pipelineKey,'1:opaque:double');
  assert.deepEqual(first.expected.center.rgba,[64,128,191,255]);
  assert.deepEqual(first.expected.background.rgba,[5,8,13,255]);
  assert.match(first.shaderDigest,/^[a-f0-9]{64}$/);
  assert.match(first.digest,/^[a-f0-9]{64}$/);
});

test('reference geometry deliberately covers center while leaving a background corner',()=>{
  const positions=WORLD_ENGINE_REFERENCE_GEOMETRY.positions;
  assert.deepEqual(positions,[-2,-2,0,2,-2,0,0,2,0]);
});
