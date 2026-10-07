export type PickVec3={x:number;y:number;z:number};

export interface PickTransform {
  position:PickVec3;
  rotationDeg:PickVec3;
  scale:PickVec3;
}

export interface PickMesh {
  vertices:PickVec3[];
  faces:number[][];
}

export interface PickNode {
  id:string;
  transform:PickTransform;
  visible?:boolean;
  geometry?:{
    kind:string;
    primitive?:string;
    mesh?:PickMesh;
  };
}

export interface PickRay {
  origin:PickVec3;
  direction:PickVec3;
}

export interface PickHit {
  nodeId:string;
  distance:number;
  point:PickVec3;
  faceIndex:number;
  triangleIndex:number;
}

const EPS=1e-9;
const DEG=Math.PI/180;

function add(a:PickVec3,b:PickVec3):PickVec3{
  return {x:a.x+b.x,y:a.y+b.y,z:a.z+b.z};
}
function sub(a:PickVec3,b:PickVec3):PickVec3{
  return {x:a.x-b.x,y:a.y-b.y,z:a.z-b.z};
}
function mul(a:PickVec3,value:number):PickVec3{
  return {x:a.x*value,y:a.y*value,z:a.z*value};
}
function dot(a:PickVec3,b:PickVec3){
  return a.x*b.x+a.y*b.y+a.z*b.z;
}
function cross(a:PickVec3,b:PickVec3):PickVec3{
  return {
    x:a.y*b.z-a.z*b.y,
    y:a.z*b.x-a.x*b.z,
    z:a.x*b.y-a.y*b.x,
  };
}
function length(value:PickVec3){
  return Math.hypot(value.x,value.y,value.z);
}
function normalize(value:PickVec3):PickVec3{
  const magnitude=length(value);
  if(magnitude<=EPS) throw new Error('world_forge_pick_zero_direction');
  return mul(value,1/magnitude);
}

export function transformPickPoint(point:PickVec3,transform:PickTransform):PickVec3{
  let x=point.x*transform.scale.x;
  let y=point.y*transform.scale.y;
  let z=point.z*transform.scale.z;

  const rx=transform.rotationDeg.x*DEG;
  const ry=transform.rotationDeg.y*DEG;
  const rz=transform.rotationDeg.z*DEG;

  {
    const c=Math.cos(rx),s=Math.sin(rx);
    const nextY=y*c-z*s;
    const nextZ=y*s+z*c;
    y=nextY;
    z=nextZ;
  }
  {
    const c=Math.cos(ry),s=Math.sin(ry);
    const nextX=x*c+z*s;
    const nextZ=-x*s+z*c;
    x=nextX;
    z=nextZ;
  }
  {
    const c=Math.cos(rz),s=Math.sin(rz);
    const nextX=x*c-y*s;
    const nextY=x*s+y*c;
    x=nextX;
    y=nextY;
  }

  return {
    x:x+transform.position.x,
    y:y+transform.position.y,
    z:z+transform.position.z,
  };
}

export function perspectivePickRay(input:{
  clientX:number;
  clientY:number;
  left:number;
  top:number;
  width:number;
  height:number;
  eye:PickVec3;
  target:PickVec3;
  up?:PickVec3;
  verticalFovRad:number;
}):PickRay{
  if(
    !Number.isFinite(input.width)||
    !Number.isFinite(input.height)||
    input.width<=0||
    input.height<=0
  ){
    throw new Error('world_forge_pick_viewport_invalid');
  }
  if(
    !Number.isFinite(input.verticalFovRad)||
    input.verticalFovRad<=0||
    input.verticalFovRad>=Math.PI
  ){
    throw new Error('world_forge_pick_fov_invalid');
  }

  const ndcX=((input.clientX-input.left)/input.width)*2-1;
  const ndcY=1-((input.clientY-input.top)/input.height)*2;
  const forward=normalize(sub(input.target,input.eye));
  let right=cross(forward,input.up??{x:0,y:0,z:1});
  if(length(right)<=EPS){
    right=cross(forward,{x:0,y:1,z:0});
  }
  right=normalize(right);
  const cameraUp=normalize(cross(right,forward));
  const halfHeight=Math.tan(input.verticalFovRad/2);
  const halfWidth=halfHeight*(input.width/input.height);
  const direction=normalize(
    add(
      add(forward,mul(right,ndcX*halfWidth)),
      mul(cameraUp,ndcY*halfHeight),
    ),
  );

  return {
    origin:{...input.eye},
    direction,
  };
}

export function orthographicPickRay(input:{
  clientX:number;
  clientY:number;
  left:number;
  top:number;
  width:number;
  height:number;
  eye:PickVec3;
  target:PickVec3;
  up?:PickVec3;
  orthoHeight:number;
}):PickRay{
  if(
    !Number.isFinite(input.width)||
    !Number.isFinite(input.height)||
    input.width<=0||
    input.height<=0||
    !Number.isFinite(input.orthoHeight)||
    input.orthoHeight<=0
  ){
    throw new Error('world_forge_pick_ortho_view_invalid');
  }

  const ndcX=((input.clientX-input.left)/input.width)*2-1;
  const ndcY=1-((input.clientY-input.top)/input.height)*2;
  const forward=normalize(sub(input.target,input.eye));
  let right=cross(forward,input.up??{x:0,y:0,z:1});
  if(length(right)<=EPS){
    right=cross(forward,{x:0,y:1,z:0});
  }
  right=normalize(right);
  const cameraUp=normalize(cross(right,forward));
  const halfHeight=input.orthoHeight/2;
  const halfWidth=halfHeight*(input.width/input.height);
  const origin=add(
    add(input.eye,mul(right,ndcX*halfWidth)),
    mul(cameraUp,ndcY*halfHeight),
  );
  return {origin,direction:forward};
}

function cubeMesh():PickMesh{
  return {
    vertices:[
      {x:-.5,y:-.5,z:-.5},{x:.5,y:-.5,z:-.5},
      {x:.5,y:.5,z:-.5},{x:-.5,y:.5,z:-.5},
      {x:-.5,y:-.5,z:.5},{x:.5,y:-.5,z:.5},
      {x:.5,y:.5,z:.5},{x:-.5,y:.5,z:.5},
    ],
    faces:[
      [0,3,2,1],[4,5,6,7],[0,1,5,4],
      [1,2,6,5],[2,3,7,6],[3,0,4,7],
    ],
  };
}

function planeMesh():PickMesh{
  return {
    vertices:[
      {x:-.5,y:-.5,z:0},{x:.5,y:-.5,z:0},
      {x:.5,y:.5,z:0},{x:-.5,y:.5,z:0},
    ],
    faces:[[0,1,2,3]],
  };
}

export function nativePickMesh(node:PickNode):PickMesh|null{
  if(node.geometry?.kind==='editable_mesh'&&node.geometry.mesh){
    return node.geometry.mesh;
  }
  if(node.geometry?.kind==='primitive'){
    if(node.geometry.primitive==='cube') return cubeMesh();
    if(node.geometry.primitive==='plane') return planeMesh();
  }
  return null;
}

export function rayTriangleDistance(
  ray:PickRay,
  a:PickVec3,
  b:PickVec3,
  c:PickVec3,
):number|null{
  const edge1=sub(b,a);
  const edge2=sub(c,a);
  const pvec=cross(ray.direction,edge2);
  const determinant=dot(edge1,pvec);
  if(Math.abs(determinant)<=EPS) return null;
  const inverse=1/determinant;
  const tvec=sub(ray.origin,a);
  const u=dot(tvec,pvec)*inverse;
  if(u<-EPS||u>1+EPS) return null;
  const qvec=cross(tvec,edge1);
  const v=dot(ray.direction,qvec)*inverse;
  if(v<-EPS||u+v>1+EPS) return null;
  const distance=dot(edge2,qvec)*inverse;
  return distance>EPS?distance:null;
}

export function pickNearestNativeMesh(
  ray:PickRay,
  nodes:PickNode[],
):PickHit|null{
  let best:PickHit|null=null;

  for(const node of nodes){
    if(node.visible===false) continue;
    const mesh=nativePickMesh(node);
    if(!mesh) continue;

    for(let faceIndex=0;faceIndex<mesh.faces.length;faceIndex+=1){
      const face=mesh.faces[faceIndex];
      if(face.length<3) continue;
      const first=mesh.vertices[face[0]];
      if(!first) continue;
      const a=transformPickPoint(first,node.transform);

      for(let triangleIndex=1;triangleIndex<face.length-1;triangleIndex+=1){
        const second=mesh.vertices[face[triangleIndex]];
        const third=mesh.vertices[face[triangleIndex+1]];
        if(!second||!third) continue;
        const b=transformPickPoint(second,node.transform);
        const c=transformPickPoint(third,node.transform);
        const distance=rayTriangleDistance(ray,a,b,c);
        if(distance===null) continue;
        if(!best||distance<best.distance){
          best={
            nodeId:node.id,
            distance,
            point:add(ray.origin,mul(ray.direction,distance)),
            faceIndex,
            triangleIndex:triangleIndex-1,
          };
        }
      }
    }
  }

  return best;
}
