import type {
  Vec3,
  WorldForgeEditableMesh,
  WorldForgeOperation,
  WorldForgeProject,
} from './world-forge.js';

function clone<T>(value:T):T{
  return JSON.parse(JSON.stringify(value)) as T;
}

function subtract(a:Vec3,b:Vec3):Vec3{
  return {x:a.x-b.x,y:a.y-b.y,z:a.z-b.z};
}

function cross(a:Vec3,b:Vec3):Vec3{
  return {
    x:a.y*b.z-a.z*b.y,
    y:a.z*b.x-a.x*b.z,
    z:a.x*b.y-a.y*b.x,
  };
}

function normalize(v:Vec3):Vec3{
  const length=Math.hypot(v.x,v.y,v.z);
  if(length<=1e-9) throw new Error('editable_mesh_face_normal_degenerate');
  return {x:v.x/length,y:v.y/length,z:v.z/length};
}

export function createEditableCube(size=1):WorldForgeEditableMesh{
  const h=size/2;
  return {
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
}

export function editableMeshFromPrimitive(node:{
  geometry?:{kind:string;primitive?:string};
}):WorldForgeEditableMesh{
  if(node.geometry?.kind!=='primitive') throw new Error('primitive_geometry_required');
  if(node.geometry.primitive!=='cube') throw new Error(`primitive_conversion_not_supported:${node.geometry.primitive}`);
  return createEditableCube(1);
}

export function extrudeFace(
  mesh:WorldForgeEditableMesh,
  faceIndex:number,
  distance:number,
):WorldForgeEditableMesh{
  if(!Number.isFinite(distance)||Math.abs(distance)<=1e-9){
    throw new Error('editable_mesh_extrude_distance_invalid');
  }
  if(!Number.isInteger(faceIndex)||faceIndex<0||faceIndex>=mesh.faces.length){
    throw new Error(`editable_mesh_face_missing:${faceIndex}`);
  }

  const next=clone(mesh);
  const face=next.faces[faceIndex];
  if(face.length<3) throw new Error(`editable_mesh_face_invalid:${faceIndex}`);

  const a=next.vertices[face[0]];
  const b=next.vertices[face[1]];
  const c=next.vertices[face[2]];
  const normal=normalize(cross(subtract(b,a),subtract(c,a)));

  const newIndices=face.map(index=>{
    const source=next.vertices[index];
    const vertex={
      x:source.x+normal.x*distance,
      y:source.y+normal.y*distance,
      z:source.z+normal.z*distance,
    };
    next.vertices.push(vertex);
    return next.vertices.length-1;
  });

  next.faces[faceIndex]=newIndices;
  for(let i=0;i<face.length;i+=1){
    const j=(i+1)%face.length;
    next.faces.push([
      face[i],
      face[j],
      newIndices[j],
      newIndices[i],
    ]);
  }

  return next;
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

export function extrudeNodeFaceOperation(input:{
  project:WorldForgeProject;
  nodeId:string;
  faceIndex:number;
  distance:number;
}):WorldForgeOperation{
  const node=input.project.nodes.find(item=>item.id===input.nodeId);
  if(!node) throw new Error(`node_missing:${input.nodeId}`);
  if(node.kind!=='mesh') throw new Error(`editable_mesh_target_not_mesh:${node.id}`);
  if(node.geometry?.kind!=='editable_mesh') throw new Error(`editable_mesh_required:${node.id}`);

  return {
    type:'set_geometry',
    nodeId:node.id,
    geometry:{
      kind:'editable_mesh',
      mesh:extrudeFace(node.geometry.mesh,input.faceIndex,input.distance),
    },
  };
}
