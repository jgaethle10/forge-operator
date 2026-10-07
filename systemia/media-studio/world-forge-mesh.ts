import type {
  Vec3,
  WorldForgeEditableMesh,
  WorldForgeOperation,
  WorldForgeProject,
  WorldForgeNode,
} from './world-forge.js';

export interface WorldForgeMeshTopologyReport {
  schema:'evercraft.fallen.world-forge-mesh-topology.v1';
  status:'valid'|'invalid';
  vertexCount:number;
  faceCount:number;
  edgeCount:number;
  boundaryEdgeCount:number;
  nonManifoldEdgeCount:number;
  orphanVertexCount:number;
  errors:string[];
  warnings:string[];
}

function clone<T>(value:T):T{
  return JSON.parse(JSON.stringify(value)) as T;
}

function subtract(a:Vec3,b:Vec3):Vec3{
  return {x:a.x-b.x,y:a.y-b.y,z:a.z-b.z};
}

function add(a:Vec3,b:Vec3):Vec3{
  return {x:a.x+b.x,y:a.y+b.y,z:a.z+b.z};
}

function multiply(v:Vec3,scalar:number):Vec3{
  return {x:v.x*scalar,y:v.y*scalar,z:v.z*scalar};
}

function cross(a:Vec3,b:Vec3):Vec3{
  return {
    x:a.y*b.z-a.z*b.y,
    y:a.z*b.x-a.x*b.z,
    z:a.x*b.y-a.y*b.x,
  };
}

function magnitude(v:Vec3){
  return Math.hypot(v.x,v.y,v.z);
}

function normalize(v:Vec3):Vec3{
  const length=magnitude(v);
  if(length<=1e-9) throw new Error('editable_mesh_face_normal_degenerate');
  return {x:v.x/length,y:v.y/length,z:v.z/length};
}

function faceNormal(mesh:WorldForgeEditableMesh,faceIndex:number){
  if(!Number.isInteger(faceIndex)||faceIndex<0||faceIndex>=mesh.faces.length){
    throw new Error(`editable_mesh_face_missing:${faceIndex}`);
  }
  const face=mesh.faces[faceIndex];
  if(face.length<3) throw new Error(`editable_mesh_face_invalid:${faceIndex}`);
  const a=mesh.vertices[face[0]];
  const b=mesh.vertices[face[1]];
  const c=mesh.vertices[face[2]];
  if(!a||!b||!c) throw new Error(`editable_mesh_face_vertex_missing:${faceIndex}`);
  return normalize(cross(subtract(b,a),subtract(c,a)));
}

function requireValidTopology(mesh:WorldForgeEditableMesh){
  const report=validateEditableMeshTopology(mesh);
  if(report.status==='invalid'){
    throw new Error(`editable_mesh_topology_invalid:${report.errors.join('|')}`);
  }
  return report;
}

export function validateEditableMeshTopology(mesh:WorldForgeEditableMesh):WorldForgeMeshTopologyReport{
  const errors:string[]=[];
  const warnings:string[]=[];
  const referenced=new Set<number>();
  const edgeUse=new Map<string,number>();

  if(mesh.vertices.length<3) errors.push('vertices_less_than_three');
  if(mesh.faces.length<1) errors.push('faces_missing');

  for(let index=0;index<mesh.vertices.length;index+=1){
    const vertex=mesh.vertices[index];
    if(!Number.isFinite(vertex.x)||!Number.isFinite(vertex.y)||!Number.isFinite(vertex.z)){
      errors.push(`vertex_nonfinite:${index}`);
    }
  }

  for(let faceIndex=0;faceIndex<mesh.faces.length;faceIndex+=1){
    const face=mesh.faces[faceIndex];
    if(face.length<3){
      errors.push(`face_less_than_three_vertices:${faceIndex}`);
      continue;
    }
    if(new Set(face).size!==face.length){
      errors.push(`face_duplicate_vertex:${faceIndex}`);
    }

    let valid=true;
    for(const vertexIndex of face){
      if(!Number.isInteger(vertexIndex)||vertexIndex<0||vertexIndex>=mesh.vertices.length){
        errors.push(`face_vertex_index_invalid:${faceIndex}:${vertexIndex}`);
        valid=false;
      }else{
        referenced.add(vertexIndex);
      }
    }
    if(!valid) continue;

    try{
      faceNormal(mesh,faceIndex);
    }catch{
      errors.push(`face_degenerate:${faceIndex}`);
    }

    for(let edgeIndex=0;edgeIndex<face.length;edgeIndex+=1){
      const a=face[edgeIndex];
      const b=face[(edgeIndex+1)%face.length];
      const key=a<b?`${a}:${b}`:`${b}:${a}`;
      edgeUse.set(key,(edgeUse.get(key)??0)+1);
    }
  }

  const boundaryEdgeCount=[...edgeUse.values()].filter(count=>count===1).length;
  const nonManifoldEdgeCount=[...edgeUse.values()].filter(count=>count>2).length;
  const orphanVertexCount=mesh.vertices.length-referenced.size;

  if(nonManifoldEdgeCount>0) errors.push(`non_manifold_edges:${nonManifoldEdgeCount}`);
  if(boundaryEdgeCount>0) warnings.push(`boundary_edges:${boundaryEdgeCount}`);
  if(orphanVertexCount>0) warnings.push(`orphan_vertices:${orphanVertexCount}`);

  return {
    schema:'evercraft.fallen.world-forge-mesh-topology.v1',
    status:errors.length?'invalid':'valid',
    vertexCount:mesh.vertices.length,
    faceCount:mesh.faces.length,
    edgeCount:edgeUse.size,
    boundaryEdgeCount,
    nonManifoldEdgeCount,
    orphanVertexCount,
    errors:[...new Set(errors)].sort(),
    warnings:[...new Set(warnings)].sort(),
  };
}

export function createEditableCube(size=1):WorldForgeEditableMesh{
  if(!Number.isFinite(size)||size<=0) throw new Error('editable_mesh_cube_size_invalid');
  const h=size/2;
  const mesh={
    vertices:[
      {x:-h,y:-h,z:-h},
      {x:h,y:-h,z:-h},
      {x:h,y:h,z:-h},
      {x:-h,y:h,z:-h},
      {x:-h,y:-h,z:h},
      {x:h,y:-h,z:h},
      {x:h,y:h,z:h},
      {x:-h,y:h,z:h},
    ],
    faces:[
      [0,3,2,1],
      [4,5,6,7],
      [0,1,5,4],
      [1,2,6,5],
      [2,3,7,6],
      [3,0,4,7],
    ],
  };
  requireValidTopology(mesh);
  return mesh;
}

export function editableMeshFromPrimitive(node:{
  geometry?:{kind:string;primitive?:string};
}):WorldForgeEditableMesh{
  if(node.geometry?.kind!=='primitive') throw new Error('primitive_geometry_required');
  if(node.geometry.primitive!=='cube') throw new Error(`primitive_conversion_not_supported:${node.geometry.primitive}`);
  return createEditableCube(1);
}

export function moveVertices(
  mesh:WorldForgeEditableMesh,
  vertexIndices:number[],
  delta:Vec3,
):WorldForgeEditableMesh{
  if(!vertexIndices.length) throw new Error('editable_mesh_vertex_selection_empty');
  if(!Number.isFinite(delta.x)||!Number.isFinite(delta.y)||!Number.isFinite(delta.z)){
    throw new Error('editable_mesh_vertex_delta_invalid');
  }
  const unique=[...new Set(vertexIndices)];
  const next=clone(mesh);
  for(const index of unique){
    if(!Number.isInteger(index)||index<0||index>=next.vertices.length){
      throw new Error(`editable_mesh_vertex_missing:${index}`);
    }
    next.vertices[index]=add(next.vertices[index],delta);
  }
  requireValidTopology(next);
  return next;
}

export function extrudeFace(
  mesh:WorldForgeEditableMesh,
  faceIndex:number,
  distance:number,
):WorldForgeEditableMesh{
  if(!Number.isFinite(distance)||Math.abs(distance)<=1e-9){
    throw new Error('editable_mesh_extrude_distance_invalid');
  }
  const normal=faceNormal(mesh,faceIndex);
  const next=clone(mesh);
  const face=[...next.faces[faceIndex]];

  const newIndices=face.map(index=>{
    const source=next.vertices[index];
    next.vertices.push(add(source,multiply(normal,distance)));
    return next.vertices.length-1;
  });

  next.faces[faceIndex]=newIndices;
  for(let i=0;i<face.length;i+=1){
    const j=(i+1)%face.length;
    next.faces.push([face[i],face[j],newIndices[j],newIndices[i]]);
  }

  requireValidTopology(next);
  return next;
}

export function insetFace(
  mesh:WorldForgeEditableMesh,
  faceIndex:number,
  amount:number,
):WorldForgeEditableMesh{
  if(!Number.isFinite(amount)||amount<=0||amount>=1){
    throw new Error('editable_mesh_inset_amount_invalid');
  }
  faceNormal(mesh,faceIndex);
  const next=clone(mesh);
  const face=[...next.faces[faceIndex]];
  const center=face.reduce(
    (sum,index)=>add(sum,next.vertices[index]),
    {x:0,y:0,z:0},
  );
  const inv=1/face.length;
  const centroid=multiply(center,inv);

  const newIndices=face.map(index=>{
    const source=next.vertices[index];
    const towardCenter=subtract(centroid,source);
    next.vertices.push(add(source,multiply(towardCenter,amount)));
    return next.vertices.length-1;
  });

  next.faces[faceIndex]=newIndices;
  for(let i=0;i<face.length;i+=1){
    const j=(i+1)%face.length;
    next.faces.push([face[i],face[j],newIndices[j],newIndices[i]]);
  }

  requireValidTopology(next);
  return next;
}

export function deleteFace(
  mesh:WorldForgeEditableMesh,
  faceIndex:number,
  allowDestructive=false,
):WorldForgeEditableMesh{
  if(allowDestructive!==true) throw new Error('editable_mesh_destructive_authority_required');
  if(!Number.isInteger(faceIndex)||faceIndex<0||faceIndex>=mesh.faces.length){
    throw new Error(`editable_mesh_face_missing:${faceIndex}`);
  }
  if(mesh.faces.length<=1) throw new Error('editable_mesh_last_face_delete_forbidden');

  const next=clone(mesh);
  next.faces.splice(faceIndex,1);
  requireValidTopology(next);
  return next;
}

export function weldVertices(
  mesh:WorldForgeEditableMesh,
  vertexIndices:number[],
  allowDestructive=false,
):WorldForgeEditableMesh{
  if(allowDestructive!==true) throw new Error('editable_mesh_destructive_authority_required');
  const selected=[...new Set(vertexIndices)].sort((a,b)=>a-b);
  if(selected.length<2) throw new Error('editable_mesh_weld_selection_invalid');
  for(const index of selected){
    if(!Number.isInteger(index)||index<0||index>=mesh.vertices.length){
      throw new Error(`editable_mesh_vertex_missing:${index}`);
    }
  }

  const selectedSet=new Set(selected);
  const target=selected
    .map(index=>mesh.vertices[index])
    .reduce((sum,vertex)=>add(sum,vertex),{x:0,y:0,z:0});
  const centroid=multiply(target,1/selected.length);
  const keep=selected[0];

  const compactVertices:Vec3[]=[];
  const remap=new Map<number,number>();
  for(let oldIndex=0;oldIndex<mesh.vertices.length;oldIndex+=1){
    if(selectedSet.has(oldIndex)&&oldIndex!==keep) continue;
    const newIndex=compactVertices.length;
    remap.set(oldIndex,newIndex);
    compactVertices.push(oldIndex===keep?centroid:clone(mesh.vertices[oldIndex]));
  }
  const keepNew=remap.get(keep);
  if(keepNew===undefined) throw new Error('editable_mesh_weld_internal_error');
  for(const oldIndex of selected) remap.set(oldIndex,keepNew);

  const compactFaces=mesh.faces.map((face,faceIndex)=>{
    const mapped=face.map(index=>{
      const next=remap.get(index);
      if(next===undefined) throw new Error(`editable_mesh_weld_remap_missing:${index}`);
      return next;
    });
    const unique=[...new Set(mapped)];
    if(unique.length<3) throw new Error(`editable_mesh_weld_degenerate_face:${faceIndex}`);
    return mapped;
  });

  const next={vertices:compactVertices,faces:compactFaces};
  requireValidTopology(next);
  return next;
}

function requireEditableNode(
  project:WorldForgeProject,
  nodeId:string,
):WorldForgeNode & {geometry:{kind:'editable_mesh';mesh:WorldForgeEditableMesh}}{
  const node=project.nodes.find(item=>item.id===nodeId);
  if(!node) throw new Error(`node_missing:${nodeId}`);
  if(node.kind!=='mesh') throw new Error(`editable_mesh_target_not_mesh:${node.id}`);
  if(node.geometry?.kind!=='editable_mesh') throw new Error(`editable_mesh_required:${node.id}`);
  return node as WorldForgeNode & {geometry:{kind:'editable_mesh';mesh:WorldForgeEditableMesh}};
}

export function makeNodeEditableOperation(input:{
  project:WorldForgeProject;
  nodeId:string;
}):WorldForgeOperation{
  const node=input.project.nodes.find(item=>item.id===input.nodeId);
  if(!node) throw new Error(`node_missing:${input.nodeId}`);
  if(node.kind!=='mesh') throw new Error(`editable_mesh_target_not_mesh:${node.id}`);
  if(node.geometry?.kind==='editable_mesh'){
    return {type:'set_geometry',nodeId:node.id,geometry:clone(node.geometry)};
  }

  return {
    type:'set_geometry',
    nodeId:node.id,
    geometry:{
      kind:'editable_mesh',
      mesh:editableMeshFromPrimitive(node),
    },
  };
}

export function moveNodeVerticesOperation(input:{
  project:WorldForgeProject;
  nodeId:string;
  vertexIndices:number[];
  delta:Vec3;
}):WorldForgeOperation{
  const node=requireEditableNode(input.project,input.nodeId);
  return {
    type:'set_geometry',
    nodeId:node.id,
    geometry:{
      kind:'editable_mesh',
      mesh:moveVertices(node.geometry.mesh,input.vertexIndices,input.delta),
    },
  };
}

export function extrudeNodeFaceOperation(input:{
  project:WorldForgeProject;
  nodeId:string;
  faceIndex:number;
  distance:number;
}):WorldForgeOperation{
  const node=requireEditableNode(input.project,input.nodeId);
  return {
    type:'set_geometry',
    nodeId:node.id,
    geometry:{
      kind:'editable_mesh',
      mesh:extrudeFace(node.geometry.mesh,input.faceIndex,input.distance),
    },
  };
}

export function insetNodeFaceOperation(input:{
  project:WorldForgeProject;
  nodeId:string;
  faceIndex:number;
  amount:number;
}):WorldForgeOperation{
  const node=requireEditableNode(input.project,input.nodeId);
  return {
    type:'set_geometry',
    nodeId:node.id,
    geometry:{
      kind:'editable_mesh',
      mesh:insetFace(node.geometry.mesh,input.faceIndex,input.amount),
    },
  };
}

export function deleteNodeFaceOperation(input:{
  project:WorldForgeProject;
  nodeId:string;
  faceIndex:number;
  allowDestructive:boolean;
}):WorldForgeOperation{
  const node=requireEditableNode(input.project,input.nodeId);
  return {
    type:'set_geometry',
    nodeId:node.id,
    geometry:{
      kind:'editable_mesh',
      mesh:deleteFace(node.geometry.mesh,input.faceIndex,input.allowDestructive),
    },
    allowDestructive:true,
  };
}

export function weldNodeVerticesOperation(input:{
  project:WorldForgeProject;
  nodeId:string;
  vertexIndices:number[];
  allowDestructive:boolean;
}):WorldForgeOperation{
  const node=requireEditableNode(input.project,input.nodeId);
  return {
    type:'set_geometry',
    nodeId:node.id,
    geometry:{
      kind:'editable_mesh',
      mesh:weldVertices(node.geometry.mesh,input.vertexIndices,input.allowDestructive),
    },
    allowDestructive:true,
  };
}
