import {
  nativePickMesh,
  type PickNode,
  type PickVec3,
} from './world-forge-picking.js';

export interface NativeViewportTriangleData {
  positions:Float32Array;
  normals:Float32Array;
  triangleCount:number;
}

function sub(a:PickVec3,b:PickVec3):PickVec3{
  return {x:a.x-b.x,y:a.y-b.y,z:a.z-b.z};
}

function cross(a:PickVec3,b:PickVec3):PickVec3{
  return {
    x:a.y*b.z-a.z*b.y,
    y:a.z*b.x-a.x*b.z,
    z:a.x*b.y-a.y*b.x,
  };
}

function normalize(value:PickVec3):PickVec3{
  const length=Math.hypot(value.x,value.y,value.z);
  if(length<=1e-12) throw new Error('world_forge_viewport_mesh_degenerate_normal');
  return {x:value.x/length,y:value.y/length,z:value.z/length};
}

export function nativeViewportTriangleData(
  node:PickNode,
):NativeViewportTriangleData|null{
  const mesh=nativePickMesh(node);
  if(!mesh) return null;

  const positions:number[]=[];
  const normals:number[]=[];
  let triangleCount=0;

  for(let faceIndex=0;faceIndex<mesh.faces.length;faceIndex+=1){
    const face=mesh.faces[faceIndex];
    if(face.length<3) continue;
    const first=mesh.vertices[face[0]];
    if(!first) throw new Error(`world_forge_viewport_mesh_vertex_missing:${node.id}:${face[0]}`);

    for(let i=1;i<face.length-1;i+=1){
      const second=mesh.vertices[face[i]];
      const third=mesh.vertices[face[i+1]];
      if(!second||!third){
        throw new Error(`world_forge_viewport_mesh_vertex_missing:${node.id}:${faceIndex}:${i}`);
      }

      const normal=normalize(
        cross(
          sub(second,first),
          sub(third,first),
        ),
      );

      for(const vertex of [first,second,third]){
        positions.push(vertex.x,vertex.y,vertex.z);
        normals.push(normal.x,normal.y,normal.z);
      }
      triangleCount+=1;
    }
  }

  return {
    positions:new Float32Array(positions),
    normals:new Float32Array(normals),
    triangleCount,
  };
}
