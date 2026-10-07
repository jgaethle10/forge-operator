import assert from 'node:assert/strict';
import test from 'node:test';

import { applyWorldForgeOperations } from './world-forge.js';
import { createWorldForgeStarterProject } from './world-forge-http.js';
import {
  extrudeNodeFaceOperation,
  makeNodeEditableOperation,
} from './world-forge-mesh.js';
import { renderWorldForgeNativeSolidPreview } from './world-forge-native-solid-preview.js';

test('native solid preview renders filled, lit scene polygons with a receipt',()=>{
  const project=createWorldForgeStarterProject();
  const preview=renderWorldForgeNativeSolidPreview({
    project,
    renderIntentId:'preview',
  });

  assert.equal(preview.receipt.renderer,'evercraft-native-solid-v1');
  assert.equal(preview.receipt.productionGrade,false);
  assert.equal(preview.receipt.boundaries.productionRenderAuthorityGranted,false);
  assert.equal(preview.receipt.boundaries.publicationAuthorityGranted,false);
  assert.equal(preview.receipt.lightCount,2);
  assert.ok(preview.receipt.polygonCount>0);
  assert.match(preview.receipt.svgSha256,/^[a-f0-9]{64}$/);
  assert.match(preview.svg,/<polygon /);
  assert.match(preview.svg,/solid preview/);
});

test('native solid preview follows editable mesh topology after extrusion',()=>{
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
      distance:.4,
    })],
  });
  assert.equal(extruded.status,'completed');

  const preview=renderWorldForgeNativeSolidPreview({
    project:extruded.project,
    renderIntentId:'preview',
  });
  assert.ok(preview.receipt.polygonCount>0);
  assert.equal(preview.receipt.projectVersion,extruded.project.version);
});

test('native solid preview fails closed on unsupported asset-backed mesh geometry',()=>{
  const project=createWorldForgeStarterProject();
  project.assets.push({
    id:'asset-mesh',
    kind:'mesh',
    uri:'asset://mesh',
    evidenceState:'licensed',
    rightsState:'owned',
    sourceRefs:['test:asset-mesh'],
  });
  const hero=project.nodes.find(node=>node.id==='hero-core');
  assert.ok(hero);
  hero!.geometry={kind:'asset',assetId:'asset-mesh'};

  assert.throws(
    ()=>renderWorldForgeNativeSolidPreview({
      project,
      renderIntentId:'preview',
    }),
    /native_solid_asset_geometry_unsupported/,
  );
});

test('native solid preview refuses production render intents',()=>{
  const project=createWorldForgeStarterProject();
  project.renderIntents[0].quality='production';

  assert.throws(
    ()=>renderWorldForgeNativeSolidPreview({
      project,
      renderIntentId:'preview',
    }),
    /native_solid_production_intent_forbidden/,
  );
});
