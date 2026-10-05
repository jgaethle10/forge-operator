import assert from 'node:assert/strict';
import test from 'node:test';

import { applyWorldForgeOperations } from './world-forge.js';
import { createWorldForgeStarterProject } from './world-forge-http.js';
import {
  createEditableCube,
  extrudeFace,
  extrudeNodeFaceOperation,
  makeNodeEditableOperation,
} from './world-forge-mesh.js';

test('editable cube has manifold starter topology',()=>{
  const mesh=createEditableCube(2);
  assert.equal(mesh.vertices.length,8);
  assert.equal(mesh.faces.length,6);
  assert.ok(mesh.faces.every(face=>face.length===4));
});

test('face extrusion creates a new cap and side walls',()=>{
  const mesh=createEditableCube(1);
  const extruded=extrudeFace(mesh,1,.5);
  assert.equal(extruded.vertices.length,12);
  assert.equal(extruded.faces.length,10);
  const cap=extruded.faces[1];
  assert.deepEqual(cap,[8,9,10,11]);
  assert.ok(extruded.vertices.slice(8).every(vertex=>vertex.z===1));
});

test('primitive mesh can become editable and extrusion stays reversible through receipts',()=>{
  const project=createWorldForgeStarterProject();

  const makeEditable=applyWorldForgeOperations({
    project,
    expectedVersion:project.version,
    operations:[makeNodeEditableOperation({project,nodeId:'hero-core'})],
  });
  assert.equal(makeEditable.status,'completed');

  const editableNode=makeEditable.project.nodes.find(node=>node.id==='hero-core');
  assert.equal(editableNode?.geometry?.kind,'editable_mesh');

  const extrusion=applyWorldForgeOperations({
    project:makeEditable.project,
    expectedVersion:makeEditable.project.version,
    operations:[extrudeNodeFaceOperation({
      project:makeEditable.project,
      nodeId:'hero-core',
      faceIndex:1,
      distance:.5,
    })],
  });
  assert.equal(extrusion.status,'completed');
  const mesh=extrusion.project.nodes.find(node=>node.id==='hero-core')?.geometry;
  assert.equal(mesh?.kind,'editable_mesh');
  if(mesh?.kind==='editable_mesh'){
    assert.equal(mesh.mesh.vertices.length,12);
    assert.equal(mesh.mesh.faces.length,10);
  }

  const undo=applyWorldForgeOperations({
    project:extrusion.project,
    expectedVersion:extrusion.project.version,
    operations:extrusion.receipt.inverseOperations,
  });
  assert.equal(undo.status,'completed');
  const restored=undo.project.nodes.find(node=>node.id==='hero-core')?.geometry;
  assert.equal(restored?.kind,'editable_mesh');
  if(restored?.kind==='editable_mesh'){
    assert.equal(restored.mesh.vertices.length,8);
    assert.equal(restored.mesh.faces.length,6);
  }
});

test('extrusion rejects invalid face indices and zero distance',()=>{
  const mesh=createEditableCube(1);
  assert.throws(()=>extrudeFace(mesh,99,.5),/editable_mesh_face_missing/);
  assert.throws(()=>extrudeFace(mesh,0,0),/editable_mesh_extrude_distance_invalid/);
});
