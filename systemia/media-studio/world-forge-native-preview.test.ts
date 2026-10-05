import assert from 'node:assert/strict';
import test from 'node:test';

import { createWorldForgeStarterProject } from './world-forge-http.js';
import { renderWorldForgeNativePreview } from './world-forge-native-preview.js';
import { applyWorldForgeOperations } from './world-forge.js';
import { makeNodeEditableOperation, extrudeNodeFaceOperation } from './world-forge-mesh.js';

test('native preview renders deterministic SVG from canonical scene',()=>{
  const project=createWorldForgeStarterProject();
  const a=renderWorldForgeNativePreview({project,renderIntentId:'preview'});
  const b=renderWorldForgeNativePreview({project,renderIntentId:'preview'});

  assert.equal(a.svg,b.svg);
  assert.equal(a.receipt.svgSha256,b.receipt.svgSha256);
  assert.equal(a.receipt.productionGrade,false);
  assert.equal(a.receipt.boundaries.productionRenderAuthorityGranted,false);
  assert.ok(a.receipt.lineCount>0);
  assert.match(a.svg,/^<svg /);
});

test('native preview reflects editable topology changes',()=>{
  const project=createWorldForgeStarterProject();
  const editable=applyWorldForgeOperations({
    project,
    expectedVersion:project.version,
    operations:[makeNodeEditableOperation({project,nodeId:'hero-core'})],
  });
  assert.equal(editable.status,'completed');

  const extruded=applyWorldForgeOperations({
    project:editable.project,
    expectedVersion:editable.project.version,
    operations:[extrudeNodeFaceOperation({
      project:editable.project,
      nodeId:'hero-core',
      faceIndex:1,
      distance:.5,
    })],
  });
  assert.equal(extruded.status,'completed');

  const before=renderWorldForgeNativePreview({
    project:editable.project,
    renderIntentId:'preview',
  });
  const after=renderWorldForgeNativePreview({
    project:extruded.project,
    renderIntentId:'preview',
  });

  assert.notEqual(before.receipt.svgSha256,after.receipt.svgSha256);
  assert.ok(after.receipt.lineCount>before.receipt.lineCount);
});


test('native preview digest changes when the authored camera changes',()=>{
  const project=createWorldForgeStarterProject();
  const base=renderWorldForgeNativePreview({project,renderIntentId:'preview'});

  const camera=project.nodes.find(node=>node.id==='camera-main');
  if(!camera?.camera) throw new Error('camera fixture missing');
  camera.camera.focalLengthMm=35;
  camera.camera.lookAt={x:1,y:0,z:1};

  const changed=renderWorldForgeNativePreview({project,renderIntentId:'preview'});
  assert.notEqual(base.receipt.svgSha256,changed.receipt.svgSha256);
  assert.notEqual(base.receipt.projectDigest,changed.receipt.projectDigest);
});

test('native preview refuses unsupported production-only scene features',()=>{
  const project=createWorldForgeStarterProject();
  project.simulations.push({
    id:'sim-1',
    type:'rigid_body',
    nodeIds:['hero-core'],
    cachePolicy:'live',
  });

  assert.throws(
    ()=>renderWorldForgeNativePreview({project,renderIntentId:'preview'}),
    /native_preview_unsupported:simulation/,
  );
});
