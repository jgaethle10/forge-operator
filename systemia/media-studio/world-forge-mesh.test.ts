import assert from 'node:assert/strict';
import test from 'node:test';

import { applyWorldForgeOperations } from './world-forge.js';
import { createWorldForgeStarterProject } from './world-forge-http.js';
import {
  createEditableCube,
  deleteFace,
  extrudeFace,
  extrudeNodeFaceOperation,
  insetFace,
  insetNodeFaceOperation,
  makeNodeEditableOperation,
  moveNodeVerticesOperation,
  moveVertices,
  validateEditableMeshTopology,
  weldVertices,
} from './world-forge-mesh.js';

test('editable cube has deterministic manifold starter topology',()=>{
  const mesh=createEditableCube(2);
  const report=validateEditableMeshTopology(mesh);
  assert.equal(mesh.vertices.length,8);
  assert.equal(mesh.faces.length,6);
  assert.ok(mesh.faces.every(face=>face.length===4));
  assert.equal(report.status,'valid');
  assert.equal(report.edgeCount,12);
  assert.equal(report.boundaryEdgeCount,0);
  assert.equal(report.nonManifoldEdgeCount,0);
  assert.equal(report.orphanVertexCount,0);
});

test('face extrusion creates a new cap and side walls',()=>{
  const mesh=createEditableCube(1);
  const extruded=extrudeFace(mesh,1,.5);
  assert.equal(extruded.vertices.length,12);
  assert.equal(extruded.faces.length,10);
  const cap=extruded.faces[1];
  assert.deepEqual(cap,[8,9,10,11]);
  assert.ok(extruded.vertices.slice(8).every(vertex=>vertex.z===1));
  assert.equal(validateEditableMeshTopology(extruded).status,'valid');
});

test('face inset creates a connected inner cap without destroying topology',()=>{
  const mesh=createEditableCube(2);
  const inset=insetFace(mesh,1,.25);
  assert.equal(inset.vertices.length,12);
  assert.equal(inset.faces.length,10);
  assert.deepEqual(inset.faces[1],[8,9,10,11]);
  assert.ok(inset.vertices.slice(8).every(vertex=>vertex.z===1));
  assert.ok(inset.vertices.slice(8).every(vertex=>Math.abs(vertex.x)<=.75&&Math.abs(vertex.y)<=.75));
  assert.equal(validateEditableMeshTopology(inset).status,'valid');
});

test('selected vertices can move while topology remains valid',()=>{
  const mesh=createEditableCube(1);
  const moved=moveVertices(mesh,[4,5,6,7],{x:0,y:0,z:.25});
  assert.ok(moved.vertices.slice(4).every(vertex=>vertex.z===.75));
  assert.equal(validateEditableMeshTopology(moved).status,'valid');
});

test('mesh deletion and welding require explicit destructive authority',()=>{
  const mesh=createEditableCube(1);
  assert.throws(()=>deleteFace(mesh,1),/editable_mesh_destructive_authority_required/);
  assert.throws(()=>weldVertices(mesh,[0,6]),/editable_mesh_destructive_authority_required/);

  const disconnected={
    vertices:[
      {x:0,y:0,z:0},{x:1,y:0,z:0},{x:0,y:1,z:0},
      {x:0,y:0,z:1},{x:1,y:0,z:1},{x:0,y:1,z:1},
    ],
    faces:[[0,1,2],[3,4,5]],
  };
  const welded=weldVertices(disconnected,[0,3],true);
  assert.equal(welded.vertices.length,5);
  assert.equal(validateEditableMeshTopology(welded).status,'valid');
});

test('primitive mesh can become editable and geometry edits stay reversible through receipts',()=>{
  const project=createWorldForgeStarterProject();

  const makeEditable=applyWorldForgeOperations({
    project,
    expectedVersion:project.version,
    operations:[makeNodeEditableOperation({project,nodeId:'hero-core'})],
  });
  assert.equal(makeEditable.status,'completed');

  const editableNode=makeEditable.project.nodes.find(node=>node.id==='hero-core');
  assert.equal(editableNode?.geometry?.kind,'editable_mesh');

  const moved=applyWorldForgeOperations({
    project:makeEditable.project,
    expectedVersion:makeEditable.project.version,
    operations:[moveNodeVerticesOperation({
      project:makeEditable.project,
      nodeId:'hero-core',
      vertexIndices:[4,5,6,7],
      delta:{x:0,y:0,z:.15},
    })],
  });
  assert.equal(moved.status,'completed');

  const inset=applyWorldForgeOperations({
    project:moved.project,
    expectedVersion:moved.project.version,
    operations:[insetNodeFaceOperation({
      project:moved.project,
      nodeId:'hero-core',
      faceIndex:1,
      amount:.2,
    })],
  });
  assert.equal(inset.status,'completed');

  const extrusion=applyWorldForgeOperations({
    project:inset.project,
    expectedVersion:inset.project.version,
    operations:[extrudeNodeFaceOperation({
      project:inset.project,
      nodeId:'hero-core',
      faceIndex:1,
      distance:.5,
    })],
  });
  assert.equal(extrusion.status,'completed');

  const geometry=extrusion.project.nodes.find(node=>node.id==='hero-core')?.geometry;
  assert.equal(geometry?.kind,'editable_mesh');
  if(geometry?.kind==='editable_mesh'){
    assert.equal(geometry.mesh.vertices.length,16);
    assert.equal(geometry.mesh.faces.length,14);
    assert.equal(validateEditableMeshTopology(geometry.mesh).status,'valid');
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
    assert.equal(restored.mesh.vertices.length,12);
    assert.equal(restored.mesh.faces.length,10);
  }
});

test('raw topology shrink is blocked unless destructive geometry authority is explicit',()=>{
  const project=createWorldForgeStarterProject();
  const editable=applyWorldForgeOperations({
    project,
    expectedVersion:project.version,
    operations:[makeNodeEditableOperation({project,nodeId:'hero-core'})],
  });
  assert.equal(editable.status,'completed');

  const node=editable.project.nodes.find(item=>item.id==='hero-core');
  assert.equal(node?.geometry?.kind,'editable_mesh');
  if(node?.geometry?.kind!=='editable_mesh') return;

  const shrunken={
    kind:'editable_mesh' as const,
    mesh:{
      vertices:node.geometry.mesh.vertices,
      faces:node.geometry.mesh.faces.slice(0,-1),
    },
  };

  const blocked=applyWorldForgeOperations({
    project:editable.project,
    expectedVersion:editable.project.version,
    operations:[{type:'set_geometry',nodeId:'hero-core',geometry:shrunken}],
  });
  assert.equal(blocked.status,'blocked');
  assert.match(blocked.receipt.rejectedOperations[0].reason,/destructive_geometry_authority_required/);

  const allowed=applyWorldForgeOperations({
    project:editable.project,
    expectedVersion:editable.project.version,
    operations:[{type:'set_geometry',nodeId:'hero-core',geometry:shrunken,allowDestructive:true}],
  });
  assert.equal(allowed.status,'completed');
  assert.ok(allowed.validation.warnings.some(warning=>warning.startsWith('editable_mesh_boundary_edges:')));
});

test('mesh operators reject invalid edits instead of emitting corrupt topology',()=>{
  const mesh=createEditableCube(1);
  assert.throws(()=>extrudeFace(mesh,99,.5),/editable_mesh_face_missing/);
  assert.throws(()=>extrudeFace(mesh,0,0),/editable_mesh_extrude_distance_invalid/);
  assert.throws(()=>insetFace(mesh,0,1),/editable_mesh_inset_amount_invalid/);
  assert.throws(()=>moveVertices(mesh,[99],{x:1,y:0,z:0}),/editable_mesh_vertex_missing/);
});
