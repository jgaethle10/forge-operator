import React, { useEffect, useMemo, useRef, useState } from 'react';
import './world-forge.css';
import {
  axisDragScaleValue,
  axisDragWorldDelta,
  frameDistanceForScale,
  perspectiveVerticalFovRad,
  screenRotationDeltaDeg,
} from './world-forge-viewport-tools';
import {
  nativePickMesh,
  orthographicPickRay,
  type PickRay,
  perspectivePickRay,
  pickNearestNativeMesh,
} from './world-forge-picking';
import { nativeViewportTriangleData } from './world-forge-viewport-mesh';
import {
  runtimeBodiesByForgeNodeId,
  runtimeTransformsByForgeNodeId,
  worldForgeDirectionToWorldEngine,
  worldForgePositionToWorldEngine,
} from './world-forge-runtime-view';

type Vec3={x:number;y:number;z:number};
type Transform={position:Vec3;rotationDeg:Vec3;scale:Vec3};
type ForgePhysics={
  mode:'static'|'kinematic'|'dynamic';
  massKg?:number;
  gravityScale?:number;
  linearDamping?:number;
  restitution?:number;
  collider:
    |{type:'auto_box'}
    |{type:'auto_sphere'}
    |{type:'box';halfExtents:Vec3}
    |{type:'sphere';radius:number};
};
type ForgeNode={
  id:string;
  name:string;
  kind:string;
  transform:Transform;
  visible?:boolean;
  locked?:boolean;
  geometry?:{
    kind:string;
    primitive?:string;
    mesh?:{
      vertices:Vec3[];
      faces:number[][];
    };
  };
  camera?:{
    projection:string;
    focalLengthMm?:number;
    sensorWidthMm?:number;
    orthoScale?:number;
    lookAt?:Vec3;
    near?:number;
    far?:number;
  };
  light?:{type:string;intensity:number;color:[number,number,number]};
  physics?:ForgePhysics;
  materialIds?:string[];
};
type ForgeProject={
  schema:string;
  id:string;
  title:string;
  version:number;
  activeCameraNodeId?:string;
  nodes:ForgeNode[];
  materials:Array<{
    id:string;
    name:string;
    baseColor:[number,number,number,number];
    metallic?:number;
    roughness?:number;
  }>;
};
type ForgeOperation=
  |{type:'set_transform';nodeId:string;transform:Partial<Transform>}
  |{type:'set_visibility';nodeId:string;visible:boolean}
  |{type:'set_camera';nodeId:string;camera:Partial<NonNullable<ForgeNode['camera']>>}
  |{type:'set_physics';nodeId:string;physics:ForgePhysics|null}
  |{type:'set_geometry';nodeId:string;geometry:NonNullable<ForgeNode['geometry']>;allowDestructive?:boolean}
  |{type:'add_node';node:ForgeNode}
  |{type:'remove_node';nodeId:string;allowDestructive?:boolean};

type MutationReceipt={
  versionBefore:number;
  versionAfter:number;
  digestBefore:string;
  digestAfter:string;
  inverseOperations:ForgeOperation[];
  rejectedOperations:Array<{index:number;reason:string}>;
};

type MutationResponse={
  success:boolean;
  result?:{
    status:'completed'|'blocked';
    project:ForgeProject;
    receipt:MutationReceipt;
    validation:{digest:string;warnings:string[]};
  };
  error?:string;
};

type EngineRuntimeState={
  world:Record<string,unknown>;
  assets:Record<string,unknown>;
  geometries:unknown[];
};

type PlaySessionState={
  sessionId:string;
  projectVersion:number;
  worldVersion:number;
  tick:number;
  timeSec:number;
  snapshotDigest:string;
  webGpuReady:boolean;
  visualParity:string;
  runtimeTransforms:Record<string,Transform>;
  runtimeBodies:Record<string,{
    entityId:string;
    velocity:Vec3|null;
    kinematic:boolean;
  }>;
};

const AXIS_STEP=.25;
const WORLD_FORGE_STORAGE_KEY='evercraft.fallen.world-forge.active-project.v1';

function rad(value:number){return value*Math.PI/180;}
function mat4Identity(){
  return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
}
function mat4Multiply(a:Float32Array,b:Float32Array){
  const out=new Float32Array(16);
  for(let c=0;c<4;c+=1){
    for(let r=0;r<4;r+=1){
      out[c*4+r]=
        a[0*4+r]*b[c*4+0]+
        a[1*4+r]*b[c*4+1]+
        a[2*4+r]*b[c*4+2]+
        a[3*4+r]*b[c*4+3];
    }
  }
  return out;
}
function mat4Perspective(fovRad:number,aspect:number,near:number,far:number){
  const f=1/Math.tan(fovRad/2);
  const nf=1/(near-far);
  const out=new Float32Array(16);
  out[0]=f/aspect;
  out[5]=f;
  out[10]=(far+near)*nf;
  out[11]=-1;
  out[14]=2*far*near*nf;
  return out;
}
function mat4Ortho(left:number,right:number,bottom:number,top:number,near:number,far:number){
  const out=mat4Identity();
  out[0]=2/(right-left);
  out[5]=2/(top-bottom);
  out[10]=-2/(far-near);
  out[12]=-(right+left)/(right-left);
  out[13]=-(top+bottom)/(top-bottom);
  out[14]=-(far+near)/(far-near);
  return out;
}
function normalize(v:number[]){
  const len=Math.hypot(v[0],v[1],v[2])||1;
  return [v[0]/len,v[1]/len,v[2]/len];
}
function cross(a:number[],b:number[]){
  return [
    a[1]*b[2]-a[2]*b[1],
    a[2]*b[0]-a[0]*b[2],
    a[0]*b[1]-a[1]*b[0],
  ];
}
function dot(a:number[],b:number[]){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
function mat4LookAt(eye:number[],center:number[],up:number[]){
  const z=normalize([eye[0]-center[0],eye[1]-center[1],eye[2]-center[2]]);
  const x=normalize(cross(up,z));
  const y=cross(z,x);
  return new Float32Array([
    x[0],y[0],z[0],0,
    x[1],y[1],z[1],0,
    x[2],y[2],z[2],0,
    -dot(x,eye),-dot(y,eye),-dot(z,eye),1,
  ]);
}
function mat4Translation(v:Vec3){
  const out=mat4Identity();
  out[12]=v.x;out[13]=v.y;out[14]=v.z;
  return out;
}
function mat4Scale(v:Vec3){
  const out=mat4Identity();
  out[0]=v.x;out[5]=v.y;out[10]=v.z;
  return out;
}
function mat4RotX(value:number){
  const c=Math.cos(value),s=Math.sin(value);
  return new Float32Array([1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1]);
}
function mat4RotY(value:number){
  const c=Math.cos(value),s=Math.sin(value);
  return new Float32Array([c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1]);
}
function mat4RotZ(value:number){
  const c=Math.cos(value),s=Math.sin(value);
  return new Float32Array([c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1]);
}
function modelMatrix(transform:Transform){
  let out=mat4Translation(transform.position);
  out=mat4Multiply(out,mat4RotZ(rad(transform.rotationDeg.z)));
  out=mat4Multiply(out,mat4RotY(rad(transform.rotationDeg.y)));
  out=mat4Multiply(out,mat4RotX(rad(transform.rotationDeg.x)));
  out=mat4Multiply(out,mat4Scale(transform.scale));
  return out;
}

const CUBE_LINES=new Float32Array([
  -1,-1,-1, 1,-1,-1, 1,-1,-1, 1,1,-1, 1,1,-1, -1,1,-1, -1,1,-1, -1,-1,-1,
  -1,-1,1, 1,-1,1, 1,-1,1, 1,1,1, 1,1,1, -1,1,1, -1,1,1, -1,-1,1,
  -1,-1,-1, -1,-1,1, 1,-1,-1, 1,-1,1, 1,1,-1, 1,1,1, -1,1,-1, -1,1,1,
].map(value=>value*.5));

const PLANE_LINES=new Float32Array([
  -.5,-.5,0, .5,-.5,0,
   .5,-.5,0, .5,.5,0,
   .5,.5,0, -.5,.5,0,
  -.5,.5,0, -.5,-.5,0,
]);

function editableMeshLines(node:ForgeNode){
  const mesh=node.geometry?.kind==='editable_mesh'?node.geometry.mesh:undefined;
  if(!mesh){
    if(node.geometry?.kind==='primitive'&&node.geometry.primitive==='plane') return PLANE_LINES;
    return CUBE_LINES;
  }
  const values:number[]=[];
  const seen=new Set<string>();
  for(const face of mesh.faces){
    for(let i=0;i<face.length;i+=1){
      const a=face[i];
      const b=face[(i+1)%face.length];
      const key=a<b?`${a}:${b}`:`${b}:${a}`;
      if(seen.has(key)) continue;
      seen.add(key);
      const va=mesh.vertices[a];
      const vb=mesh.vertices[b];
      if(!va||!vb) continue;
      values.push(va.x,va.y,va.z,vb.x,vb.y,vb.z);
    }
  }
  return new Float32Array(values);
}

function buildGrid(){
  const values:number[]=[];
  for(let i=-10;i<=10;i+=1){
    values.push(-10,i,0,10,i,0);
    values.push(i,-10,0,i,10,0);
  }
  return new Float32Array(values);
}
const GRID_LINES=buildGrid();

function buildRotationRing(axis:keyof Vec3,radius=1.35,segments=64){
  const values:number[]=[];
  for(let i=0;i<segments;i+=1){
    const a=i/segments*Math.PI*2;
    const b=(i+1)/segments*Math.PI*2;
    const point=(angle:number):Vec3=>{
      const ca=Math.cos(angle)*radius;
      const sa=Math.sin(angle)*radius;
      if(axis==='x') return {x:0,y:ca,z:sa};
      if(axis==='y') return {x:ca,y:0,z:sa};
      return {x:ca,y:sa,z:0};
    };
    const pa=point(a);
    const pb=point(b);
    values.push(pa.x,pa.y,pa.z,pb.x,pb.y,pb.z);
  }
  return new Float32Array(values);
}

const ROTATE_RING_X=buildRotationRing('x');
const ROTATE_RING_Y=buildRotationRing('y');
const ROTATE_RING_Z=buildRotationRing('z');

function compileShader(gl:WebGL2RenderingContext,type:number,source:string){
  const shader=gl.createShader(type);
  if(!shader) throw new Error('Could not create WebGL shader.');
  gl.shaderSource(shader,source);
  gl.compileShader(shader);
  if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){
    throw new Error(gl.getShaderInfoLog(shader)||'WebGL shader compile failed.');
  }
  return shader;
}
function createProgram(gl:WebGL2RenderingContext){
  const vertex=compileShader(gl,gl.VERTEX_SHADER,`#version 300 es
    in vec3 aPosition;
    uniform mat4 uMvp;
    void main(){ gl_Position=uMvp*vec4(aPosition,1.0); }
  `);
  const fragment=compileShader(gl,gl.FRAGMENT_SHADER,`#version 300 es
    precision highp float;
    uniform vec4 uColor;
    out vec4 outColor;
    void main(){ outColor=uColor; }
  `);
  const program=gl.createProgram();
  if(!program) throw new Error('Could not create WebGL program.');
  gl.attachShader(program,vertex);
  gl.attachShader(program,fragment);
  gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS)){
    throw new Error(gl.getProgramInfoLog(program)||'WebGL program link failed.');
  }
  return program;
}

function createSolidProgram(gl:WebGL2RenderingContext){
  const vertex=compileShader(gl,gl.VERTEX_SHADER,`#version 300 es
    in vec3 aPosition;
    in vec3 aNormal;
    uniform mat4 uMvp;
    uniform mat4 uModel;
    out vec3 vNormal;
    void main(){
      gl_Position=uMvp*vec4(aPosition,1.0);
      vNormal=mat3(transpose(inverse(uModel)))*aNormal;
    }
  `);
  const fragment=compileShader(gl,gl.FRAGMENT_SHADER,`#version 300 es
    precision highp float;
    in vec3 vNormal;
    uniform vec4 uBaseColor;
    uniform vec3 uLightDirection;
    out vec4 outColor;
    void main(){
      vec3 normal=normalize(vNormal);
      float diffuse=max(dot(normal,normalize(uLightDirection)),0.0);
      float light=0.24+0.76*diffuse;
      outColor=vec4(uBaseColor.rgb*light,uBaseColor.a);
    }
  `);
  const program=gl.createProgram();
  if(!program) throw new Error('Could not create World Forge solid WebGL program.');
  gl.attachShader(program,vertex);
  gl.attachShader(program,fragment);
  gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS)){
    throw new Error(gl.getProgramInfoLog(program)||'World Forge solid WebGL program link failed.');
  }
  return program;
}

function WorldViewport({
  project,
  selectedId,
  onSelect,
  onTranslate,
  onRotate,
  onScale,
  transformMode,
  snapStep,
  angleSnapDeg,
  scaleSnapStep,
}:{
  project:ForgeProject;
  selectedId:string;
  onSelect:(nodeId:string)=>void;
  onTranslate:(nodeId:string,axis:keyof Vec3,delta:number)=>void;
  onRotate:(nodeId:string,axis:keyof Vec3,deltaDeg:number)=>void;
  onScale:(nodeId:string,axis:keyof Vec3,value:number)=>void;
  transformMode:'translate'|'rotate'|'scale';
  snapStep:number;
  angleSnapDeg:number;
  scaleSnapStep:number;
}){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const [orbit,setOrbit]=useState({
    yaw:-38,
    pitch:28,
    distance:12,
    target:{x:0,y:0,z:1} as Vec3,
  });
  const [viewMode,setViewMode]=useState<'orbit'|'camera'>('orbit');
  const [shadingMode,setShadingMode]=useState<'solid'|'wireframe'>('solid');
  const [gizmoPreview,setGizmoPreview]=useState<
    | {mode:'translate';nodeId:string;axis:keyof Vec3;delta:number}
    | {mode:'rotate';nodeId:string;axis:keyof Vec3;deltaDeg:number}
    | {mode:'scale';nodeId:string;axis:keyof Vec3;value:number}
    | null
  >(null);
  const dragRef=useRef<
    | {mode:'orbit';x:number;y:number;moved:boolean}
    | {mode:'pick';x:number;y:number;moved:boolean}
    | {
        mode:'translate-gizmo';
        axis:keyof Vec3;
        startX:number;
        startY:number;
        axisScreenDx:number;
        axisScreenDy:number;
        axisWorldLength:number;
        delta:number;
      }
    | {
        mode:'scale-gizmo';
        axis:keyof Vec3;
        startX:number;
        startY:number;
        axisScreenDx:number;
        axisScreenDy:number;
        startScale:number;
        value:number;
      }
    | {
        mode:'rotate-gizmo';
        axis:keyof Vec3;
        startX:number;
        startY:number;
        centerX:number;
        centerY:number;
        deltaDeg:number;
      }
    | null
  >(null);

  const meshNodes=useMemo(
    ()=>project.nodes.filter(node=>node.kind==='mesh'&&node.visible!==false),
    [project],
  );
  const selectedNode=useMemo(
    ()=>project.nodes.find(node=>node.id===selectedId)??null,
    [project,selectedId],
  );
  const activeCamera=useMemo(()=>{
    const requested=project.activeCameraNodeId
      ? project.nodes.find(node=>node.id===project.activeCameraNodeId&&node.kind==='camera')
      : null;
    return requested??project.nodes.find(node=>node.kind==='camera')??null;
  },[project]);

  function transformWithPreview(node:ForgeNode):Transform{
    if(gizmoPreview?.nodeId!==node.id) return node.transform;
    if(gizmoPreview.mode==='translate'){
      return {
        ...node.transform,
        position:{
          ...node.transform.position,
          [gizmoPreview.axis]:node.transform.position[gizmoPreview.axis]+gizmoPreview.delta,
        },
      };
    }
    if(gizmoPreview.mode==='rotate'){
      return {
        ...node.transform,
        rotationDeg:{
          ...node.transform.rotationDeg,
          [gizmoPreview.axis]:node.transform.rotationDeg[gizmoPreview.axis]+gizmoPreview.deltaDeg,
        },
      };
    }
    return {
      ...node.transform,
      scale:{
        ...node.transform.scale,
        [gizmoPreview.axis]:gizmoPreview.value,
      },
    };
  }

  function positionWithPreview(node:ForgeNode){
    return transformWithPreview(node).position;
  }

  function matrices(width:number,height:number){
    const aspect=Math.max(.01,width/Math.max(1,height));
    if(viewMode==='camera'&&activeCamera?.camera){
      const camera=activeCamera.camera;
      const eye=[
        activeCamera.transform.position.x,
        activeCamera.transform.position.y,
        activeCamera.transform.position.z,
      ];
      const look=camera.lookAt??{x:0,y:0,z:0};
      const view=mat4LookAt(eye,[look.x,look.y,look.z],[0,0,1]);
      const near=Math.max(.001,camera.near??.05);
      const far=Math.max(near+.1,camera.far??200);
      const projection=camera.projection==='orthographic'
        ? (()=>{
            const scale=Math.max(.01,camera.orthoScale??10);
            const halfY=scale/2;
            const halfX=halfY*aspect;
            return mat4Ortho(-halfX,halfX,-halfY,halfY,near,far);
          })()
        : mat4Perspective(
            perspectiveVerticalFovRad({
              focalLengthMm:camera.focalLengthMm??50,
              sensorWidthMm:camera.sensorWidthMm??36,
              aspect,
            }),
            aspect,
            near,
            far,
          );
      return {view,projection,vp:mat4Multiply(projection,view)};
    }

    const yaw=rad(orbit.yaw);
    const pitch=rad(orbit.pitch);
    const cp=Math.cos(pitch);
    const eye=[
      orbit.target.x+Math.sin(yaw)*cp*orbit.distance,
      orbit.target.y-Math.cos(yaw)*cp*orbit.distance,
      orbit.target.z+Math.sin(pitch)*orbit.distance,
    ];
    const projection=mat4Perspective(rad(52),aspect,.05,200);
    const view=mat4LookAt(
      eye,
      [orbit.target.x,orbit.target.y,orbit.target.z],
      [0,0,1],
    );
    return {view,projection,vp:mat4Multiply(projection,view)};
  }

  function projectToClient(point:Vec3,vp:Float32Array,rect:DOMRect){
    const px=vp[0]*point.x+vp[4]*point.y+vp[8]*point.z+vp[12];
    const py=vp[1]*point.x+vp[5]*point.y+vp[9]*point.z+vp[13];
    const pw=vp[3]*point.x+vp[7]*point.y+vp[11]*point.z+vp[15];
    if(pw<=0) return null;
    return {
      x:rect.left+(px/pw*.5+.5)*rect.width,
      y:rect.top+(.5-py/pw*.5)*rect.height,
    };
  }

  function pointSegmentDistance(
    px:number,py:number,
    ax:number,ay:number,
    bx:number,by:number,
  ){
    const vx=bx-ax;
    const vy=by-ay;
    const lengthSq=vx*vx+vy*vy;
    if(lengthSq<=1e-9) return Math.hypot(px-ax,py-ay);
    const t=Math.max(0,Math.min(1,((px-ax)*vx+(py-ay)*vy)/lengthSq));
    return Math.hypot(px-(ax+vx*t),py-(ay+vy*t));
  }

  function axisGizmoHit(clientX:number,clientY:number){
    const canvas=canvasRef.current;
    if(!canvas||!selectedNode||selectedNode.locked) return null;
    const rect=canvas.getBoundingClientRect();
    const {vp}=matrices(rect.width,rect.height);
    const base=positionWithPreview(selectedNode);
    const projectedBase=projectToClient(base,vp,rect);
    if(!projectedBase) return null;
    const length=1.35;
    const vectors:Record<keyof Vec3,Vec3>={
      x:{x:length,y:0,z:0},
      y:{x:0,y:length,z:0},
      z:{x:0,y:0,z:length},
    };

    let best:{
      axis:keyof Vec3;
      distance:number;
      axisScreenDx:number;
      axisScreenDy:number;
      axisWorldLength:number;
    }|null=null;

    for(const axis of ['x','y','z'] as const){
      const vector=vectors[axis];
      const endpoint={
        x:base.x+vector.x,
        y:base.y+vector.y,
        z:base.z+vector.z,
      };
      const projectedEnd=projectToClient(endpoint,vp,rect);
      if(!projectedEnd) continue;
      const distance=pointSegmentDistance(
        clientX,clientY,
        projectedBase.x,projectedBase.y,
        projectedEnd.x,projectedEnd.y,
      );
      if(distance<=13&&(!best||distance<best.distance)){
        best={
          axis,
          distance,
          axisScreenDx:projectedEnd.x-projectedBase.x,
          axisScreenDy:projectedEnd.y-projectedBase.y,
          axisWorldLength:length,
        };
      }
    }
    return best;
  }

  function rotationGizmoHit(clientX:number,clientY:number){
    const canvas=canvasRef.current;
    if(!canvas||!selectedNode||selectedNode.locked) return null;
    const rect=canvas.getBoundingClientRect();
    const {vp}=matrices(rect.width,rect.height);
    const base=positionWithPreview(selectedNode);
    const projectedBase=projectToClient(base,vp,rect);
    if(!projectedBase) return null;

    const radius=1.35;
    const segments=64;
    let best:{
      axis:keyof Vec3;
      distance:number;
      centerX:number;
      centerY:number;
    }|null=null;

    for(const axis of ['x','y','z'] as const){
      const point=(angle:number):Vec3=>{
        const ca=Math.cos(angle)*radius;
        const sa=Math.sin(angle)*radius;
        if(axis==='x') return {x:base.x,y:base.y+ca,z:base.z+sa};
        if(axis==='y') return {x:base.x+ca,y:base.y,z:base.z+sa};
        return {x:base.x+ca,y:base.y+sa,z:base.z};
      };

      for(let i=0;i<segments;i+=1){
        const a=projectToClient(point(i/segments*Math.PI*2),vp,rect);
        const b=projectToClient(point((i+1)/segments*Math.PI*2),vp,rect);
        if(!a||!b) continue;
        const distance=pointSegmentDistance(
          clientX,clientY,
          a.x,a.y,b.x,b.y,
        );
        if(distance<=11&&(!best||distance<best.distance)){
          best={
            axis,
            distance,
            centerX:projectedBase.x,
            centerY:projectedBase.y,
          };
        }
      }
    }
    return best;
  }

  useEffect(()=>{
    const canvas=canvasRef.current;
    if(!canvas) return;
    const gl=canvas.getContext('webgl2',{antialias:true});
    if(!gl) return;

    const lineProgram=createProgram(gl);
    const linePos=gl.getAttribLocation(lineProgram,'aPosition');
    const lineMvp=gl.getUniformLocation(lineProgram,'uMvp');
    const lineColor=gl.getUniformLocation(lineProgram,'uColor');
    const lineBuffer=gl.createBuffer();

    const solidProgram=createSolidProgram(gl);
    const solidPos=gl.getAttribLocation(solidProgram,'aPosition');
    const solidNormal=gl.getAttribLocation(solidProgram,'aNormal');
    const solidMvp=gl.getUniformLocation(solidProgram,'uMvp');
    const solidModel=gl.getUniformLocation(solidProgram,'uModel');
    const solidBaseColor=gl.getUniformLocation(solidProgram,'uBaseColor');
    const solidLightDirection=gl.getUniformLocation(solidProgram,'uLightDirection');
    const solidPositionBuffer=gl.createBuffer();
    const solidNormalBuffer=gl.createBuffer();

    function resize(){
      const dpr=Math.min(2,window.devicePixelRatio||1);
      const width=Math.max(1,Math.round(canvas.clientWidth*dpr));
      const height=Math.max(1,Math.round(canvas.clientHeight*dpr));
      if(canvas.width!==width||canvas.height!==height){
        canvas.width=width;
        canvas.height=height;
      }
      gl!.viewport(0,0,width,height);
    }

    function drawVertices(vertices:Float32Array,mvp:Float32Array,color:[number,number,number,number]){
      gl!.useProgram(lineProgram);
      gl!.bindBuffer(gl!.ARRAY_BUFFER,lineBuffer);
      gl!.bufferData(gl!.ARRAY_BUFFER,vertices,gl!.STATIC_DRAW);
      gl!.enableVertexAttribArray(linePos);
      gl!.vertexAttribPointer(linePos,3,gl!.FLOAT,false,0,0);
      gl!.uniformMatrix4fv(lineMvp,false,mvp);
      gl!.uniform4fv(lineColor,color);
      gl!.drawArrays(gl!.LINES,0,vertices.length/3);
    }

    function drawSolid(node:ForgeNode,transform:Transform,mvp:Float32Array){
      const data=nativeViewportTriangleData(node);
      if(!data||data.triangleCount<1) return;
      const materialId=node.materialIds?.[0];
      const material=materialId
        ? project.materials.find(item=>item.id===materialId)
        : undefined;
      const baseColor=material?.baseColor??[.58,.54,.46,1];

      gl!.useProgram(solidProgram);
      gl!.bindBuffer(gl!.ARRAY_BUFFER,solidPositionBuffer);
      gl!.bufferData(gl!.ARRAY_BUFFER,data.positions,gl!.STATIC_DRAW);
      gl!.enableVertexAttribArray(solidPos);
      gl!.vertexAttribPointer(solidPos,3,gl!.FLOAT,false,0,0);

      gl!.bindBuffer(gl!.ARRAY_BUFFER,solidNormalBuffer);
      gl!.bufferData(gl!.ARRAY_BUFFER,data.normals,gl!.STATIC_DRAW);
      gl!.enableVertexAttribArray(solidNormal);
      gl!.vertexAttribPointer(solidNormal,3,gl!.FLOAT,false,0,0);

      gl!.uniformMatrix4fv(solidMvp,false,mvp);
      gl!.uniformMatrix4fv(solidModel,false,modelMatrix(transform));
      gl!.uniform4fv(solidBaseColor,baseColor);
      gl!.uniform3fv(solidLightDirection,new Float32Array([.35,-.45,.82]));
      gl!.drawArrays(gl!.TRIANGLES,0,data.positions.length/3);
    }

    function render(){
      resize();
      gl!.enable(gl!.DEPTH_TEST);
      gl!.depthFunc(gl!.LEQUAL);
      gl!.clearColor(.018,.021,.026,1);
      gl!.clear(gl!.COLOR_BUFFER_BIT|gl!.DEPTH_BUFFER_BIT);
      const {vp}=matrices(canvas.width,canvas.height);
      drawVertices(GRID_LINES,vp,[.13,.16,.19,1]);

      for(const node of meshNodes){
        const transform=transformWithPreview(node);
        const mvp=mat4Multiply(vp,modelMatrix(transform));
        const selected=node.id===selectedId;
        const locked=node.locked===true;

        if(shadingMode==='solid'){
          drawSolid(node,transform,mvp);
        }

        if(shadingMode==='wireframe'||selected){
          const color:[number,number,number,number]=selected
            ? [.31,.75,1,1]
            : locked
              ? [.36,.39,.43,1]
              : [.72,.63,.39,1];
          drawVertices(editableMeshLines(node),mvp,color);
        }
      }

      if(selectedNode&&!selectedNode.locked){
        const base=positionWithPreview(selectedNode);
        const gizmoModel=mat4Translation(base);
        const gizmoMvp=mat4Multiply(vp,gizmoModel);
        if(transformMode==='rotate'){
          drawVertices(ROTATE_RING_X,gizmoMvp,[1,.28,.24,1]);
          drawVertices(ROTATE_RING_Y,gizmoMvp,[.31,.9,.42,1]);
          drawVertices(ROTATE_RING_Z,gizmoMvp,[.3,.58,1,1]);
        }else{
          drawVertices(new Float32Array([0,0,0,1.35,0,0]),gizmoMvp,[1,.28,.24,1]);
          drawVertices(new Float32Array([0,0,0,0,1.35,0]),gizmoMvp,[.31,.9,.42,1]);
          drawVertices(new Float32Array([0,0,0,0,0,1.35]),gizmoMvp,[.3,.58,1,1]);
        }
      }
    }

    render();
    return ()=>{
      gl.deleteBuffer(lineBuffer);
      gl.deleteBuffer(solidPositionBuffer);
      gl.deleteBuffer(solidNormalBuffer);
      gl.deleteProgram(lineProgram);
      gl.deleteProgram(solidProgram);
    };
  },[project,meshNodes,orbit,selectedId,selectedNode,activeCamera,viewMode,gizmoPreview,transformMode,shadingMode]);

  function pickGeometry(clientX:number,clientY:number){
    const canvas=canvasRef.current;
    if(!canvas) return;
    const rect=canvas.getBoundingClientRect();

    let ray:PickRay;
    if(viewMode==='camera'&&activeCamera?.camera){
      const eye={...activeCamera.transform.position};
      const target=activeCamera.camera.lookAt??{x:0,y:0,z:0};
      if(activeCamera.camera.projection==='orthographic'){
        ray=orthographicPickRay({
          clientX,
          clientY,
          left:rect.left,
          top:rect.top,
          width:rect.width,
          height:rect.height,
          eye,
          target,
          up:{x:0,y:0,z:1},
          orthoHeight:Math.max(.01,activeCamera.camera.orthoScale??10),
        });
      }else{
        ray=perspectivePickRay({
          clientX,
          clientY,
          left:rect.left,
          top:rect.top,
          width:rect.width,
          height:rect.height,
          eye,
          target,
          up:{x:0,y:0,z:1},
          verticalFovRad:perspectiveVerticalFovRad({
            focalLengthMm:activeCamera.camera.focalLengthMm??50,
            sensorWidthMm:activeCamera.camera.sensorWidthMm??36,
            aspect:Math.max(.01,rect.width/Math.max(1,rect.height)),
          }),
        });
      }
    }else{
      const yaw=rad(orbit.yaw);
      const pitch=rad(orbit.pitch);
      const cp=Math.cos(pitch);
      const eye={
        x:orbit.target.x+Math.sin(yaw)*cp*orbit.distance,
        y:orbit.target.y-Math.cos(yaw)*cp*orbit.distance,
        z:orbit.target.z+Math.sin(pitch)*orbit.distance,
      };
      ray=perspectivePickRay({
        clientX,
        clientY,
        left:rect.left,
        top:rect.top,
        width:rect.width,
        height:rect.height,
        eye,
        target:{...orbit.target},
        up:{x:0,y:0,z:1},
        verticalFovRad:rad(52),
      });
    }

    const nativeNodes=meshNodes.filter(node=>nativePickMesh(node)!==null);
    const hit=pickNearestNativeMesh(ray,nativeNodes);
    if(hit) onSelect(hit.nodeId);
  }

  function frameSelected(){
    if(!selectedNode) return;
    setViewMode('orbit');
    const distance=frameDistanceForScale({
      scale:selectedNode.transform.scale,
      verticalFovRad:rad(52),
    });
    setOrbit(current=>({
      ...current,
      target:{...positionWithPreview(selectedNode)},
      distance,
    }));
  }

  return <div className="wf-viewport-wrap">
    <canvas
      ref={canvasRef}
      className="wf-viewport"
      onPointerDown={(event)=>{
        if(transformMode==='rotate'){
          const hit=rotationGizmoHit(event.clientX,event.clientY);
          if(hit){
            dragRef.current={
              mode:'rotate-gizmo',
              axis:hit.axis,
              startX:event.clientX,
              startY:event.clientY,
              centerX:hit.centerX,
              centerY:hit.centerY,
              deltaDeg:0,
            };
          }else if(viewMode==='orbit'){
            dragRef.current={mode:'orbit',x:event.clientX,y:event.clientY,moved:false};
          }else{
            dragRef.current={mode:'pick',x:event.clientX,y:event.clientY,moved:false};
          }
        }else{
          const hit=axisGizmoHit(event.clientX,event.clientY);
          if(hit){
            if(transformMode==='scale'&&selectedNode){
              dragRef.current={
                mode:'scale-gizmo',
                axis:hit.axis,
                startX:event.clientX,
                startY:event.clientY,
                axisScreenDx:hit.axisScreenDx,
                axisScreenDy:hit.axisScreenDy,
                startScale:selectedNode.transform.scale[hit.axis],
                value:selectedNode.transform.scale[hit.axis],
              };
            }else{
              dragRef.current={
                mode:'translate-gizmo',
                axis:hit.axis,
                startX:event.clientX,
                startY:event.clientY,
                axisScreenDx:hit.axisScreenDx,
                axisScreenDy:hit.axisScreenDy,
                axisWorldLength:hit.axisWorldLength,
                delta:0,
              };
            }
          }else if(viewMode==='orbit'){
            dragRef.current={mode:'orbit',x:event.clientX,y:event.clientY,moved:false};
          }else{
            dragRef.current={mode:'pick',x:event.clientX,y:event.clientY,moved:false};
          }
        }
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event)=>{
        const drag=dragRef.current;
        if(!drag) return;

        if(drag.mode==='translate-gizmo'){
          try{
            const delta=axisDragWorldDelta({
              pointerDx:event.clientX-drag.startX,
              pointerDy:event.clientY-drag.startY,
              axisScreenDx:drag.axisScreenDx,
              axisScreenDy:drag.axisScreenDy,
              axisWorldLength:drag.axisWorldLength,
              snapStep,
            });
            drag.delta=delta;
            if(selectedNode){
              setGizmoPreview({
                mode:'translate',
                nodeId:selectedNode.id,
                axis:drag.axis,
                delta,
              });
            }
          }catch{
            // Axis is visually degenerate at this camera angle. Keep the scene unchanged.
          }
          return;
        }

        if(drag.mode==='scale-gizmo'){
          try{
            const value=axisDragScaleValue({
              pointerDx:event.clientX-drag.startX,
              pointerDy:event.clientY-drag.startY,
              axisScreenDx:drag.axisScreenDx,
              axisScreenDy:drag.axisScreenDy,
              startScale:drag.startScale,
              snapStep:scaleSnapStep,
            });
            drag.value=value;
            if(selectedNode){
              setGizmoPreview({
                mode:'scale',
                nodeId:selectedNode.id,
                axis:drag.axis,
                value,
              });
            }
          }catch{
            // Degenerate screen-space scale axis. Keep the scene unchanged.
          }
          return;
        }

        if(drag.mode==='rotate-gizmo'){
          try{
            const deltaDeg=screenRotationDeltaDeg({
              startX:drag.startX,
              startY:drag.startY,
              currentX:event.clientX,
              currentY:event.clientY,
              centerX:drag.centerX,
              centerY:drag.centerY,
              snapDeg:angleSnapDeg,
            });
            drag.deltaDeg=deltaDeg;
            if(selectedNode){
              setGizmoPreview({
                mode:'rotate',
                nodeId:selectedNode.id,
                axis:drag.axis,
                deltaDeg,
              });
            }
          }catch{
            // Pointer is too close to the projected ring center to define rotation.
          }
          return;
        }

        const dx=event.clientX-drag.x;
        const dy=event.clientY-drag.y;
        if(Math.abs(dx)+Math.abs(dy)>3) drag.moved=true;
        drag.x=event.clientX;
        drag.y=event.clientY;

        if(drag.mode==='orbit'&&drag.moved){
          setOrbit(current=>({
            ...current,
            yaw:current.yaw-dx*.32,
            pitch:Math.max(-75,Math.min(78,current.pitch+dy*.28)),
          }));
        }
      }}
      onPointerUp={(event)=>{
        const drag=dragRef.current;
        dragRef.current=null;

        if(
          drag?.mode==='translate-gizmo'||
          drag?.mode==='scale-gizmo'||
          drag?.mode==='rotate-gizmo'
        ){
          setGizmoPreview(null);
          if(selectedNode){
            if(drag.mode==='translate-gizmo'&&Math.abs(drag.delta)>1e-9){
              onTranslate(selectedNode.id,drag.axis,drag.delta);
            }else if(
              drag.mode==='scale-gizmo'&&
              Math.abs(drag.value-drag.startScale)>1e-9
            ){
              onScale(selectedNode.id,drag.axis,drag.value);
            }else if(
              drag.mode==='rotate-gizmo'&&
              Math.abs(drag.deltaDeg)>1e-9
            ){
              onRotate(selectedNode.id,drag.axis,drag.deltaDeg);
            }
          }
          return;
        }

        if(drag&&!drag.moved) pickGeometry(event.clientX,event.clientY);
      }}
      onPointerCancel={()=>{
        dragRef.current=null;
        setGizmoPreview(null);
      }}
      onWheel={(event)=>{
        if(viewMode!=='orbit') return;
        event.preventDefault();
        setOrbit(current=>({
          ...current,
          distance:Math.max(1,Math.min(80,current.distance+event.deltaY*.012)),
        }));
      }}
    />
    <div className="wf-view-badge">
      {viewMode==='camera'
        ? `CAMERA · ${shadingMode.toUpperCase()}`
        : `WEBGL2 · ${shadingMode.toUpperCase()}`}
    </div>
    <div className="wf-view-controls">
      <button type="button" onClick={frameSelected} disabled={!selectedNode}>Frame Selected</button>
      <button
        type="button"
        onClick={()=>setViewMode(current=>current==='camera'?'orbit':'camera')}
        disabled={!activeCamera}
        className={viewMode==='camera'?'active':''}
      >
        {viewMode==='camera'?'Exit Camera':'Camera View'}
      </button>
      <button
        type="button"
        onClick={()=>setShadingMode(current=>current==='solid'?'wireframe':'solid')}
        className={shadingMode==='solid'?'active':''}
      >
        {shadingMode==='solid'?'Solid':'Wire'}
      </button>
      <span>
        {transformMode==='translate'
          ? `Move · ${snapStep}m`
          : transformMode==='rotate'
            ? `Rotate · ${angleSnapDeg}°`
            : `Scale · ${scaleSnapStep}`}
      </span>
    </div>
    <div className="wf-view-help">
      Drag empty space to orbit · wheel to zoom · click real geometry to select · drag active transform handles
    </div>
  </div>;
}

function NumberField({
  label,value,onCommit,step=.1,
}:{label:string;value:number;onCommit:(value:number)=>void;step?:number}){
  const [draft,setDraft]=useState(String(Number(value.toFixed(3))));
  useEffect(()=>setDraft(String(Number(value.toFixed(3)))),[value]);
  return <label className="wf-number">
    <span>{label}</span>
    <input
      type="number"
      step={step}
      value={draft}
      onChange={event=>setDraft(event.target.value)}
      onBlur={()=>{
        const next=Number(draft);
        if(Number.isFinite(next)&&next!==value) onCommit(next);
        else setDraft(String(Number(value.toFixed(3))));
      }}
      onKeyDown={event=>{
        if(event.key==='Enter') event.currentTarget.blur();
      }}
    />
  </label>;
}

export default function WorldForgeEditor(){
  const [project,setProject]=useState<ForgeProject|null>(null);
  const [digest,setDigest]=useState('');
  const [selectedId,setSelectedId]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [receipts,setReceipts]=useState<MutationReceipt[]>([]);
  const [undoStack,setUndoStack]=useState<ForgeOperation[][]>([]);
  const [command,setCommand]=useState('');
  const [commandNote,setCommandNote]=useState('');
  const [shotDigest,setShotDigest]=useState('');
  const [nativePreview,setNativePreview]=useState<{svg:string;sha:string;renderer:string;solid:boolean}|null>(null);
  const [engineRuntime,setEngineRuntime]=useState<EngineRuntimeState|null>(null);
  const [playSession,setPlaySession]=useState<PlaySessionState|null>(null);
  const [engineBridge,setEngineBridge]=useState<{
    worldId:string;
    digest:string;
    runtimeReady:boolean;
    webGpuReady:boolean;
    visualParity:string;
    geometryCount:number;
    warnings:number;
    blockers:number;
  }|null>(null);
  const [meshFaceIndex,setMeshFaceIndex]=useState(1);
  const [meshAmount,setMeshAmount]=useState(.25);
  const [playImpulse,setPlayImpulse]=useState(1);
  const [runtimeDragMode,setRuntimeDragMode]=useState(false);
  const [transformMode,setTransformMode]=useState<'translate'|'rotate'|'scale'>('translate');
  const [stageMode,setStageMode]=useState(false);
  const [stagedOperations,setStagedOperations]=useState<ForgeOperation[]>([]);
  const [snapStep,setSnapStep]=useState(.25);
  const [snapshotState,setSnapshotState]=useState<'loading'|'saved'|'dirty'>('loading');
  const importInputRef=useRef<HTMLInputElement>(null);

  useEffect(()=>{
    let active=true;

    async function validateCandidate(candidate:ForgeProject){
      const response=await fetch('/api/fallen/world-forge/validate',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({project:candidate}),
      });
      const payload=await response.json();
      if(!response.ok||!payload.validation||payload.validation.status!=='accepted'){
        throw new Error(payload.validation?.errors?.join(', ')||payload.error||'World Forge project validation failed.');
      }
      return payload.validation.digest as string;
    }

    async function boot(){
      const response=await fetch('/api/fallen/world-forge/starter');
      const payload=await response.json();
      if(!response.ok||!payload.success) throw new Error(payload.error||'Could not load World Forge.');

      let nextProject=payload.project as ForgeProject;
      let nextDigest=payload.validation.digest as string;

      try{
        const stored=window.localStorage.getItem(WORLD_FORGE_STORAGE_KEY);
        if(stored){
          const candidate=JSON.parse(stored) as ForgeProject;
          nextDigest=await validateCandidate(candidate);
          nextProject=candidate;
        }
      }catch{
        window.localStorage.removeItem(WORLD_FORGE_STORAGE_KEY);
      }

      if(!active) return;
      setProject(nextProject);
      setDigest(nextDigest);
      setSnapshotState('saved');
      const first=nextProject.nodes.find((node:ForgeNode)=>node.kind==='mesh'&&!node.locked);
      setSelectedId(first?.id||nextProject.nodes[0]?.id||'');
    }

    void boot().catch(err=>active&&setError(err instanceof Error?err.message:String(err)));
    return ()=>{active=false;};
  },[]);

  useEffect(()=>{
    const selectedNode=project?.nodes.find(node=>node.id===selectedId);
    if(
      runtimeDragMode&&(
        !playSession||
        stagedOperations.length>0||
        selectedNode?.physics?.mode!=='dynamic'||
        playSession.runtimeBodies[selectedId]?.kinematic===true||
        transformMode!=='translate'
      )
    ){
      setRuntimeDragMode(false);
    }
  },[
    runtimeDragMode,
    playSession,
    stagedOperations.length,
    project,
    selectedId,
    transformMode,
  ]);

  useEffect(()=>{
    if(!project) return;
    setSnapshotState('dirty');
    const timer=window.setTimeout(()=>{
      window.localStorage.setItem(WORLD_FORGE_STORAGE_KEY,JSON.stringify(project));
      setSnapshotState('saved');
    },250);
    return ()=>window.clearTimeout(timer);
  },[project]);

  const viewportProject=useMemo(()=>{
    if(!project||!stageMode||!stagedOperations.length) return project;

    let nodes:ForgeNode[]=project.nodes.map(node=>({
      ...node,
      transform:{
        position:{...node.transform.position},
        rotationDeg:{...node.transform.rotationDeg},
        scale:{...node.transform.scale},
      },
      camera:node.camera?{...node.camera,lookAt:node.camera.lookAt?{...node.camera.lookAt}:undefined}:undefined,
      geometry:node.geometry?JSON.parse(JSON.stringify(node.geometry)):undefined,
      physics:node.physics?JSON.parse(JSON.stringify(node.physics)):undefined,
    }));

    for(const operation of stagedOperations){
      if(operation.type==='add_node'){
        if(!nodes.some(node=>node.id===operation.node.id)){
          nodes.push(JSON.parse(JSON.stringify(operation.node)) as ForgeNode);
        }
        continue;
      }

      if(operation.type==='remove_node'){
        nodes=nodes.filter(node=>node.id!==operation.nodeId);
        continue;
      }

      const index=nodes.findIndex(node=>node.id===operation.nodeId);
      if(index<0) continue;
      const node=nodes[index];

      if(operation.type==='set_transform'){
        node.transform={
          position:{...node.transform.position,...operation.transform.position},
          rotationDeg:{...node.transform.rotationDeg,...operation.transform.rotationDeg},
          scale:{...node.transform.scale,...operation.transform.scale},
        };
      }else if(operation.type==='set_visibility'){
        node.visible=operation.visible;
      }else if(operation.type==='set_camera'){
        node.camera=node.camera?{...node.camera,...operation.camera}:node.camera;
      }else if(operation.type==='set_geometry'){
        node.geometry=JSON.parse(JSON.stringify(operation.geometry));
      }else if(operation.type==='set_physics'){
        node.physics=operation.physics
          ? JSON.parse(JSON.stringify(operation.physics))
          : undefined;
      }
    }

    return {...project,nodes};
  },[project,stageMode,stagedOperations]);

  const runtimeViewportProject=useMemo(()=>{
    if(!viewportProject||!playSession||stagedOperations.length) return viewportProject;
    const runtimeTransforms=playSession.runtimeTransforms;
    if(!Object.keys(runtimeTransforms).length) return viewportProject;
    return {
      ...viewportProject,
      nodes:viewportProject.nodes.map(node=>{
        const runtimeTransform=runtimeTransforms[node.id];
        return runtimeTransform
          ? {...node,transform:runtimeTransform}
          : node;
      }),
    };
  },[viewportProject,playSession,stagedOperations.length]);

  const selected=viewportProject?.nodes.find(node=>node.id===selectedId)||null;

  function selectDefaultNode(nextProject:ForgeProject){
    const first=nextProject.nodes.find(node=>node.kind==='mesh'&&!node.locked);
    setSelectedId(first?.id||nextProject.nodes[0]?.id||'');
  }

  function playStateFromPayload(session:any,snapshot:any):PlaySessionState{
    return {
      sessionId:String(session.sessionId),
      projectVersion:Number(session.projectVersion),
      worldVersion:Number(session.worldVersion),
      tick:Number(snapshot?.tick??session.tick??0),
      timeSec:Number(snapshot?.timeSec??session.timeSec??0),
      snapshotDigest:String(snapshot?.digest??''),
      webGpuReady:Boolean(session.webGpuReady),
      visualParity:String(session.visualParity??'unknown'),
      runtimeTransforms:runtimeTransformsByForgeNodeId(snapshot),
      runtimeBodies:runtimeBodiesByForgeNodeId(snapshot),
    };
  }

  async function startPlaySession(){
    if(!project||busy) return;
    if(playSession){
      setError('Stop Play Mode before rebuilding the static World Engine bridge.');
      return;
    }
    if(stagedOperations.length){
      setError('Apply or clear staged changes before entering Play Mode.');
      return;
    }
    setBusy(true);
    setError('');
    try{
      if(playSession){
        await stopPlaySession(true);
      }
      const sessionId=`editor-play-${Date.now().toString(36)}`;
      const response=await fetch('/api/fallen/world-forge/play/start',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({project,sessionId}),
      });
      const payload=await response.json();
      if(!response.ok||!payload.success||!payload.session||!payload.snapshot){
        throw new Error(payload.error||'Could not start World Forge Play Mode.');
      }
      setEngineRuntime(null);
      setPlaySession(playStateFromPayload(payload.session,payload.snapshot));
      setCommandNote(
        `Play Mode started at tick ${payload.snapshot.tick} · runtime world v${payload.session.worldVersion}.`
      );
    }catch(err){
      setError(err instanceof Error?err.message:String(err));
    }finally{
      setBusy(false);
    }
  }

  async function stopPlaySession(silent=false){
    if(!playSession) return;
    const current=playSession;
    try{
      const response=await fetch('/api/fallen/world-forge/play/stop',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({sessionId:current.sessionId}),
      });
      const payload=await response.json();
      if(!response.ok||!payload.success){
        throw new Error(payload.error||'Could not stop World Forge Play Mode.');
      }
      setPlaySession(null);
      setRuntimeDragMode(false);
      if(!silent) setCommandNote(`Play Mode stopped at tick ${current.tick}.`);
    }catch(err){
      if(!silent) throw err;
      setPlaySession(null);
      setRuntimeDragMode(false);
    }
  }

  async function stepPlaySession(ticks:number,inputs:any[]=[]){
    if(!playSession||busy) return;
    setBusy(true);
    setError('');
    try{
      const response=await fetch('/api/fallen/world-forge/play/step',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({
          sessionId:playSession.sessionId,
          ticks,
          inputs,
        }),
      });
      const payload=await response.json();
      if(!response.ok||!payload.success||!payload.result?.snapshot||!payload.session){
        throw new Error(payload.error||'World Forge Play Mode step failed.');
      }
      setPlaySession(playStateFromPayload(payload.session,payload.result.snapshot));
      setCommandNote(
        `Play Mode advanced ${ticks} tick${ticks===1?'':'s'} → ${payload.result.snapshot.tick}.`
      );
    }catch(err){
      setError(err instanceof Error?err.message:String(err));
    }finally{
      setBusy(false);
    }
  }

  async function impulseSelected(axis:keyof Vec3,amount:number){
    if(!playSession||!selected||selected.physics?.mode!=='dynamic') return;
    if(stagedOperations.length){
      setError('Apply or clear staged authoring changes before sending runtime inputs.');
      return;
    }
    const body=playSession.runtimeBodies[selected.id];
    if(!body?.entityId){
      setError('Selected object is not present as a dynamic body in the current runtime snapshot.');
      return;
    }
    const forgeImpulse={x:0,y:0,z:0};
    forgeImpulse[axis]=amount;
    const value=worldForgeDirectionToWorldEngine(forgeImpulse);
    await stepPlaySession(1,[{
      id:`editor-impulse-${Date.now().toString(36)}`,
      tick:playSession.tick+1,
      entityId:body.entityId,
      kind:'impulse',
      value,
    }]);
  }

  async function zeroSelectedVelocity(){
    if(!playSession||!selected||selected.physics?.mode!=='dynamic') return;
    if(stagedOperations.length){
      setError('Apply or clear staged authoring changes before sending runtime inputs.');
      return;
    }
    const body=playSession.runtimeBodies[selected.id];
    if(!body?.entityId){
      setError('Selected object is not present as a dynamic body in the current runtime snapshot.');
      return;
    }
    await stepPlaySession(1,[{
      id:`editor-stop-${Date.now().toString(36)}`,
      tick:playSession.tick+1,
      entityId:body.entityId,
      kind:'set_velocity',
      value:{x:0,y:0,z:0},
    }]);
  }

  async function syncPlaySessionProject(nextProject:ForgeProject){
    if(!playSession) return;
    const response=await fetch('/api/fallen/world-forge/play/sync',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        sessionId:playSession.sessionId,
        afterProject:nextProject,
        actor:{kind:'human',id:'world-forge-editor'},
        reason:'Committed World Forge editor revision',
      }),
    });
    const payload=await response.json();
    if(!response.ok||!payload.success||!payload.result?.session){
      throw new Error(payload.error||'Play Mode runtime rejected the authored revision.');
    }
    const snapshot=payload.result.runtimeSync?.snapshot;
    setPlaySession(playStateFromPayload(payload.result.session,snapshot));
  }

  async function validateAndAdoptProject(candidate:ForgeProject,sourceLabel:string){
    setBusy(true);
    setError('');
    try{
      const response=await fetch('/api/fallen/world-forge/validate',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({project:candidate}),
      });
      const payload=await response.json();
      if(!response.ok||!payload.validation||payload.validation.status!=='accepted'){
        throw new Error(payload.validation?.errors?.join(', ')||payload.error||'World Forge project validation failed.');
      }
      if(playSession) await stopPlaySession(true);
      setProject(candidate);
      setDigest(payload.validation.digest);
      setReceipts([]);
      setUndoStack([]);
      setNativePreview(null);
      setEngineRuntime(null);
      setEngineBridge(null);
      setShotDigest('');
      setStagedOperations([]);
      selectDefaultNode(candidate);
      setCommandNote(`${sourceLabel} loaded at v${candidate.version}. Scene validation accepted.`);
      window.localStorage.setItem(WORLD_FORGE_STORAGE_KEY,JSON.stringify(candidate));
      setSnapshotState('saved');
    }catch(err){
      setError(err instanceof Error?err.message:String(err));
    }finally{
      setBusy(false);
    }
  }

  function exportProject(){
    if(!project) return;
    const blob=new Blob([JSON.stringify(project,null,2)+'\n'],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement('a');
    anchor.href=url;
    anchor.download=`${project.id}-v${project.version}.world-forge.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setCommandNote(`Exported ${project.title} v${project.version} with digest ${digest.slice(0,12)}.`);
  }

  async function importProject(file:File){
    try{
      const parsed=JSON.parse(await file.text()) as ForgeProject;
      await validateAndAdoptProject(parsed,file.name);
    }catch(err){
      setError(err instanceof Error?err.message:'World Forge project import failed.');
    }
  }

  async function resetProject(){
    if(busy) return;
    setBusy(true);
    setError('');
    try{
      const response=await fetch('/api/fallen/world-forge/starter');
      const payload=await response.json();
      if(!response.ok||!payload.success) throw new Error(payload.error||'Could not reset World Forge.');
      if(playSession) await stopPlaySession(true);
      window.localStorage.removeItem(WORLD_FORGE_STORAGE_KEY);
      setProject(payload.project);
      setDigest(payload.validation.digest);
      setReceipts([]);
      setUndoStack([]);
      setNativePreview(null);
      setEngineRuntime(null);
      setEngineBridge(null);
      setShotDigest('');
      setStagedOperations([]);
      selectDefaultNode(payload.project);
      setCommandNote('Reset to the validated World Forge starter scene.');
      setSnapshotState('saved');
    }catch(err){
      setError(err instanceof Error?err.message:String(err));
    }finally{
      setBusy(false);
    }
  }

  async function mutate(operations:ForgeOperation[],recordUndo=true){
    if(!project||busy) return;
    setBusy(true);
    setError('');
    try{
      if(engineRuntime&&!playSession){
        const destructiveAuthority=operations.some(operation=>
          (operation.type==='remove_node'&&operation.allowDestructive===true) ||
          (operation.type==='set_geometry'&&operation.allowDestructive===true)
        );
        const createResponse=await fetch('/api/fallen/world-forge/change-set',{
          method:'POST',
          headers:{'content-type':'application/json'},
          body:JSON.stringify({
            project,
            id:`runtime-edit-${Date.now().toString(36)}`,
            title:'World Forge live runtime edit',
            author:{kind:'human',id:'world-forge-editor'},
            operations,
            destructiveAuthority,
          }),
        });
        const created=await createResponse.json();
        if(!createResponse.ok||!created.success||!created.changeSet){
          throw new Error(created.error||'Could not create runtime ChangeSet.');
        }

        const syncResponse=await fetch('/api/fallen/world-forge/runtime-sync',{
          method:'POST',
          headers:{'content-type':'application/json'},
          body:JSON.stringify({
            project,
            changeSet:created.changeSet,
            runtimeWorld:engineRuntime.world,
            runtimeAssets:engineRuntime.assets,
          }),
        });
        const synced=await syncResponse.json();
        if(!syncResponse.ok||!synced.success||!synced.sync){
          throw new Error(synced.error||'World Engine runtime sync was blocked.');
        }

        const sync=synced.sync;
        const receipt=sync.forgeMutationReceipt as MutationReceipt;
        setProject(sync.nextProject);
        setDigest(receipt.digestAfter);
        setReceipts(current=>[receipt,...current].slice(0,12));
        if(recordUndo&&receipt.inverseOperations.length){
          setUndoStack(current=>[...current,receipt.inverseOperations].slice(-50));
        }
        setEngineRuntime({
          world:sync.runtime.world,
          assets:sync.runtime.assets,
          geometries:sync.geometries,
        });
        setEngineBridge({
          worldId:String(sync.runtime.world.id),
          digest:String(sync.bridgeReceiptAfter.digest),
          runtimeReady:Boolean(sync.bridgeReceiptAfter.runtimeReady),
          webGpuReady:Boolean(sync.bridgeReceiptAfter.webGpuReady),
          visualParity:String(sync.bridgeReceiptAfter.visualParity),
          geometryCount:Array.isArray(sync.geometries)?sync.geometries.length:0,
          warnings:Array.isArray(sync.bridgeReceiptAfter.warnings)?sync.bridgeReceiptAfter.warnings.length:0,
          blockers:Array.isArray(sync.bridgeReceiptAfter.blockers)?sync.bridgeReceiptAfter.blockers.length:0,
        });
        setCommandNote(
          `Live synced ${operations.length} edit${operations.length===1?'':'s'} into World Engine · runtime v${sync.runtime.world.version} · ${String(sync.receipt.digest).slice(0,12)}.`
        );
        return;
      }

      const response=await fetch('/api/fallen/world-forge/mutate',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({
          project,
          operations,
          expectedVersion:project.version,
        }),
      });
      const payload=await response.json() as MutationResponse;
      if(!response.ok||!payload.success||!payload.result){
        const reason=payload.result?.receipt.rejectedOperations?.[0]?.reason;
        throw new Error(reason||payload.error||'World Forge mutation was blocked.');
      }
      if(playSession){
        await syncPlaySessionProject(payload.result.project);
      }
      setProject(payload.result.project);
      setDigest(payload.result.validation.digest);
      setReceipts(current=>[payload.result!.receipt,...current].slice(0,12));
      if(recordUndo&&payload.result.receipt.inverseOperations.length){
        setUndoStack(current=>[...current,payload.result!.receipt.inverseOperations].slice(-50));
      }
    }catch(err){
      setError(err instanceof Error?err.message:String(err));
    }finally{
      setBusy(false);
    }
  }

  function queueOrMutate(operations:ForgeOperation[],label:string){
    if(stageMode){
      setStagedOperations(current=>[...current,...operations].slice(0,100));
      setCommandNote(`Staged: ${label}`);
      return;
    }
    void mutate(operations);
  }

  function transformPatch(group:'position'|'rotationDeg'|'scale',axis:keyof Vec3,value:number){
    if(!selected) return;
    queueOrMutate([{
      type:'set_transform',
      nodeId:selected.id,
      transform:{[group]:{...selected.transform[group],[axis]:value}},
    } as ForgeOperation],`${selected.name} ${group} ${axis.toUpperCase()} = ${value}`);
  }

  function nudge(axis:keyof Vec3,amount:number){
    if(!selected) return;
    const next=selected.transform.position[axis]+amount;
    transformPatch('position',axis,next);
  }

  async function teleportRuntimeByAxis(
    nodeId:string,
    axis:keyof Vec3,
    delta:number,
  ){
    if(!playSession||busy||stagedOperations.length) return;
    const node=project?.nodes.find(item=>item.id===nodeId);
    const runtimeTransform=playSession.runtimeTransforms[nodeId];
    const body=playSession.runtimeBodies[nodeId];
    if(!node||node.physics?.mode!=='dynamic'||!runtimeTransform||!body?.entityId||body.kinematic){
      setError('Runtime Drag requires a selected non-kinematic Dynamic body in the active Play session.');
      return;
    }

    const targetForge={
      ...runtimeTransform.position,
      [axis]:runtimeTransform.position[axis]+delta,
    };
    const targetEngine=worldForgePositionToWorldEngine(targetForge);
    const stamp=Date.now().toString(36);
    await stepPlaySession(1,[
      {
        id:`editor-drag-${stamp}-00-teleport`,
        tick:playSession.tick+1,
        entityId:body.entityId,
        kind:'teleport',
        value:targetEngine,
      },
      {
        id:`editor-drag-${stamp}-01-stop`,
        tick:playSession.tick+1,
        entityId:body.entityId,
        kind:'set_velocity',
        value:{x:0,y:0,z:0},
      },
    ]);
  }

  function commitViewportTranslate(nodeId:string,axis:keyof Vec3,delta:number){
    if(runtimeDragMode){
      void teleportRuntimeByAxis(nodeId,axis,delta);
      return;
    }
    const node=viewportProject?.nodes.find(item=>item.id===nodeId);
    if(!node||node.locked) return;
    const value=node.transform.position[axis]+delta;
    queueOrMutate([{
      type:'set_transform',
      nodeId,
      transform:{
        position:{...node.transform.position,[axis]:value},
      },
    }],`Move ${node.name} ${axis.toUpperCase()} by ${delta} m`);
  }

  function commitViewportRotate(nodeId:string,axis:keyof Vec3,deltaDeg:number){
    const node=viewportProject?.nodes.find(item=>item.id===nodeId);
    if(!node||node.locked) return;
    const value=node.transform.rotationDeg[axis]+deltaDeg;
    queueOrMutate([{
      type:'set_transform',
      nodeId,
      transform:{
        rotationDeg:{...node.transform.rotationDeg,[axis]:value},
      },
    }],`Rotate ${node.name} ${axis.toUpperCase()} by ${deltaDeg}°`);
  }

  function commitViewportScale(nodeId:string,axis:keyof Vec3,value:number){
    const node=viewportProject?.nodes.find(item=>item.id===nodeId);
    if(!node||node.locked) return;
    queueOrMutate([{
      type:'set_transform',
      nodeId,
      transform:{
        scale:{...node.transform.scale,[axis]:Math.max(.01,value)},
      },
    }],`Scale ${node.name} ${axis.toUpperCase()} to ${value}`);
  }

  function cameraPatch(patch:Partial<NonNullable<ForgeNode['camera']>>){
    if(!selected||selected.kind!=='camera'||!selected.camera) return;
    queueOrMutate([{
      type:'set_camera',
      nodeId:selected.id,
      camera:patch,
    }],`Update ${selected.name} camera`);
  }

  function setPhysicsMode(mode:ForgePhysics['mode']|null){
    if(!selected||selected.kind!=='mesh') return;
    if(mode===null){
      queueOrMutate([{
        type:'set_physics',
        nodeId:selected.id,
        physics:null,
      }],`Disable physics on ${selected.name}`);
      return;
    }
    const previous=selected.physics;
    const physics:ForgePhysics={
      mode,
      massKg:mode==='static'?undefined:(previous?.massKg??1),
      gravityScale:mode==='static'?undefined:(mode==='kinematic'?0:(previous?.gravityScale??1)),
      linearDamping:mode==='static'?undefined:(previous?.linearDamping??.05),
      restitution:previous?.restitution??0,
      collider:previous?.collider??{type:'auto_box'},
    };
    queueOrMutate([{
      type:'set_physics',
      nodeId:selected.id,
      physics,
    }],`Set ${selected.name} physics to ${mode}`);
  }

  function physicsPatch(patch:Partial<ForgePhysics>){
    if(!selected||selected.kind!=='mesh'||!selected.physics) return;
    queueOrMutate([{
      type:'set_physics',
      nodeId:selected.id,
      physics:{...selected.physics,...patch},
    }],`Update ${selected.name} physics`);
  }

  function colliderPatch(collider:ForgePhysics['collider']){
    physicsPatch({collider});
  }

  function addCube(){
    if(!viewportProject) return;
    const index=viewportProject.nodes.filter(node=>node.kind==='mesh').length+1;
    const id=`cube-${Date.now().toString(36)}`;
    const node:ForgeNode={
      id,
      name:`Cube ${index}`,
      kind:'mesh',
      transform:{
        position:{x:0,y:0,z:1.5+index*.2},
        rotationDeg:{x:0,y:0,z:0},
        scale:{x:1,y:1,z:1},
      },
      geometry:{kind:'primitive',primitive:'cube'},
      visible:true,
    };
    queueOrMutate([{type:'add_node',node}],`Add ${node.name}`);
    setSelectedId(id);
  }

  async function undo(){
    const inverse=undoStack[undoStack.length-1];
    if(!inverse?.length) return;
    setUndoStack(current=>current.slice(0,-1));
    await mutate(inverse,false);
  }

  async function renderNativePreview(solid=false){
    if(!project||busy) return;
    setBusy(true);
    setError('');
    try{
      const endpoint=solid
        ? '/api/fallen/world-forge/native-solid-preview'
        : '/api/fallen/world-forge/native-preview';
      const response=await fetch(endpoint,{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({project,renderIntentId:'preview'}),
      });
      const payload=await response.json();
      if(!response.ok||!payload.success||!payload.preview){
        throw new Error(payload.error||'Native World Forge preview failed.');
      }
      setNativePreview({
        svg:payload.preview.svg,
        sha:payload.preview.receipt.svgSha256,
        renderer:payload.preview.receipt.renderer,
        solid,
      });
      setCommandNote(`Rendered by ${payload.preview.receipt.renderer}. Production authority remains off.`);
    }catch(err){
      setError(err instanceof Error?err.message:String(err));
    }finally{
      setBusy(false);
    }
  }

  async function compileEngineBridge(){
    if(!project||busy) return;
    if(stagedOperations.length){
      setError('Apply or clear the staged ChangeSet before compiling World Engine runtime state.');
      return;
    }
    setBusy(true);
    setError('');
    try{
      const response=await fetch('/api/fallen/world-forge/world-engine',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({project}),
      });
      const payload=await response.json();
      if(!response.ok||!payload.success||!payload.bridge){
        throw new Error(payload.error||'World Forge could not compile into World Engine.');
      }
      const bridge=payload.bridge;
      setEngineRuntime({
        world:bridge.world,
        assets:bridge.assets,
        geometries:Array.isArray(bridge.geometries)?bridge.geometries:[],
      });
      setEngineBridge({
        worldId:bridge.world.id,
        digest:bridge.receipt.digest,
        runtimeReady:Boolean(bridge.receipt.runtimeReady),
        webGpuReady:Boolean(bridge.receipt.webGpuReady),
        visualParity:String(bridge.receipt.visualParity),
        geometryCount:Array.isArray(bridge.geometries)?bridge.geometries.length:0,
        warnings:Array.isArray(bridge.receipt.warnings)?bridge.receipt.warnings.length:0,
        blockers:Array.isArray(bridge.receipt.blockers)?bridge.receipt.blockers.length:0,
      });
      setCommandNote(
        `World Engine bridge compiled: ${bridge.world.id} · ${bridge.receipt.visualParity} parity · ${bridge.geometries.length} geometry asset(s).`
      );
    }catch(err){
      setError(err instanceof Error?err.message:String(err));
    }finally{
      setBusy(false);
    }
  }

  async function bindCinematicShot(){
    if(!project||busy) return;
    setBusy(true);
    setError('');
    try{
      const response=await fetch('/api/fallen/world-forge/cinematic-shot',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({
          project,
          renderIntentId:'preview',
          shotId:`${project.id}-shot-v${project.version}`,
        }),
      });
      const payload=await response.json();
      if(!response.ok||!payload.success||!payload.shot){
        throw new Error(payload.error||'Could not bind this world into a cinematic shot.');
      }
      setShotDigest(payload.shot.digest);
      setCommandNote(`Cinematic shot bound at world v${project.version}. Tournament required after render.`);
    }catch(err){
      setError(err instanceof Error?err.message:String(err));
    }finally{
      setBusy(false);
    }
  }

  async function executePlannedCommand(instruction:string,clearComposer=false){
    if(!project||!instruction.trim()||busy) return;
    setBusy(true);
    setError('');
    setCommandNote('');
    try{
      const response=await fetch('/api/fallen/world-forge/command-plan',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({
          project,
          instruction,
          selectedNodeId:selectedId||undefined,
        }),
      });
      const payload=await response.json();
      if(!response.ok||!payload.plan||payload.plan.status!=='accepted'){
        throw new Error(payload.plan?.explanation||payload.error||'World Forge could not compile that command.');
      }
      const plan=payload.plan;
      if(stageMode){
        setStagedOperations(current=>[...current,...plan.operations].slice(0,100));
        setCommandNote(`Staged: ${plan.explanation}`);
        setBusy(false);
      }else{
        setCommandNote(plan.explanation);
        setBusy(false);
        await mutate(plan.operations);
      }
      if(clearComposer) setCommand('');
    }catch(err){
      setError(err instanceof Error?err.message:String(err));
      setBusy(false);
    }
  }

  async function runCommand(){
    await executePlannedCommand(command,true);
  }

  async function applyStagedChangeSet(){
    if(!project||!stagedOperations.length||busy) return;
    setBusy(true);
    setError('');
    try{
      const createResponse=await fetch('/api/fallen/world-forge/change-set',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({
          project,
          id:`studio-stage-${Date.now().toString(36)}`,
          title:'Studio staged changes',
          author:{kind:'human',id:'world-forge-editor'},
          operations:stagedOperations,
          destructiveAuthority:false,
        }),
      });
      const created=await createResponse.json();
      if(!createResponse.ok||!created.success||!created.changeSet){
        throw new Error(created.error||'Could not create World Forge ChangeSet.');
      }

      if(engineRuntime&&!playSession){
        const syncResponse=await fetch('/api/fallen/world-forge/runtime-sync',{
          method:'POST',
          headers:{'content-type':'application/json'},
          body:JSON.stringify({
            project,
            changeSet:created.changeSet,
            runtimeWorld:engineRuntime.world,
            runtimeAssets:engineRuntime.assets,
          }),
        });
        const synced=await syncResponse.json();
        if(!syncResponse.ok||!synced.success||!synced.sync){
          throw new Error(synced.error||'World Engine runtime sync was blocked.');
        }

        const sync=synced.sync;
        const receipt=sync.forgeMutationReceipt as MutationReceipt;
        setProject(sync.nextProject);
        setDigest(receipt.digestAfter);
        setReceipts(current=>[receipt,...current].slice(0,12));
        if(receipt.inverseOperations?.length){
          setUndoStack(current=>[...current,receipt.inverseOperations].slice(-50));
        }
        setEngineRuntime({
          world:sync.runtime.world,
          assets:sync.runtime.assets,
          geometries:sync.geometries,
        });
        setEngineBridge({
          worldId:String(sync.runtime.world.id),
          digest:String(sync.bridgeReceiptAfter.digest),
          runtimeReady:Boolean(sync.bridgeReceiptAfter.runtimeReady),
          webGpuReady:Boolean(sync.bridgeReceiptAfter.webGpuReady),
          visualParity:String(sync.bridgeReceiptAfter.visualParity),
          geometryCount:Array.isArray(sync.geometries)?sync.geometries.length:0,
          warnings:Array.isArray(sync.bridgeReceiptAfter.warnings)?sync.bridgeReceiptAfter.warnings.length:0,
          blockers:Array.isArray(sync.bridgeReceiptAfter.blockers)?sync.bridgeReceiptAfter.blockers.length:0,
        });
        setStagedOperations([]);
        setStageMode(false);
        setCommandNote(
          `Applied + live-synced ${created.changeSet.operations.length} staged operations · World Engine v${sync.runtime.world.version} · ${String(sync.receipt.digest).slice(0,12)}.`
        );
      }else{
        const applyResponse=await fetch('/api/fallen/world-forge/apply-change-set',{
          method:'POST',
          headers:{'content-type':'application/json'},
          body:JSON.stringify({project,changeSet:created.changeSet}),
        });
        const applied=await applyResponse.json();
        if(!applyResponse.ok||!applied.success||!applied.result?.mutation){
          throw new Error(applied.result?.reason||applied.error||'World Forge ChangeSet was blocked.');
        }

        const mutation=applied.result.mutation;
        if(playSession){
          await syncPlaySessionProject(mutation.project);
        }
        setProject(mutation.project);
        setDigest(mutation.validation.digest);
        setReceipts(current=>[mutation.receipt,...current].slice(0,12));
        if(mutation.receipt.inverseOperations?.length){
          setUndoStack(current=>[...current,mutation.receipt.inverseOperations].slice(-50));
        }
        setStagedOperations([]);
        setStageMode(false);
        setCommandNote(
          `Applied ${created.changeSet.operations.length} staged operations atomically as ${created.changeSet.id}.`
        );
      }
    }catch(err){
      setError(err instanceof Error?err.message:String(err));
    }finally{
      setBusy(false);
    }
  }

  if(!project){
    return <main className="wf-shell wf-loading">
      <div className="wf-kicker">FALLEN // WORLD FORGE</div>
      <h1>Booting spatial world…</h1>
      {error&&<div className="wf-error">{error}</div>}
    </main>;
  }

  return <main className="wf-app">
    <header className="wf-topbar">
      <div>
        <div className="wf-kicker">FALLEN // WORLD FORGE</div>
        <strong>{project.title}</strong>
      </div>
      <div className="wf-top-meta">
        <span>v{project.version}</span>
        <span title={digest}>{digest.slice(0,10)}</span>
        <span title="Local project snapshot">{snapshotState==='saved'?'SAVED':'DIRTY'}</span>
        <button onClick={undo} disabled={!undoStack.length||busy}>Undo</button>
        <button onClick={addCube} disabled={busy}>+ Cube</button>
        <button onClick={exportProject} disabled={busy}>Export</button>
        <button onClick={()=>importInputRef.current?.click()} disabled={busy}>Import</button>
        <button onClick={()=>void resetProject()} disabled={busy}>Reset</button>
        <button
          className={stageMode?'wf-stage-toggle active':'wf-stage-toggle'}
          onClick={()=>setStageMode(current=>!current)}
          disabled={busy}
        >
          Stage {stageMode?'ON':'OFF'}
        </button>
        {stagedOperations.length>0&&<>
          <button onClick={()=>void applyStagedChangeSet()} disabled={busy}>
            Apply Batch ({stagedOperations.length})
          </button>
          <button onClick={()=>setStagedOperations([])} disabled={busy}>Clear Batch</button>
        </>}
        {!playSession
          ? <button
              className="wf-play-button"
              onClick={()=>void startPlaySession()}
              disabled={busy||stagedOperations.length>0}
              title={stagedOperations.length?'Apply or clear staged changes first':'Start deterministic World Engine Play Mode'}
            >
              ▶ Play
            </button>
          : <>
              <span
                className={playSession.projectVersion===project.version?'wf-play-badge':'wf-play-badge stale'}
                title={playSession.snapshotDigest}
              >
                PLAY · t{playSession.tick} · v{playSession.projectVersion}
              </span>
              <button onClick={()=>void stepPlaySession(1)} disabled={busy}>+1 Tick</button>
              <button onClick={()=>void stepPlaySession(60)} disabled={busy}>+60 Ticks</button>
              <button
                className={runtimeDragMode?'wf-runtime-drag active':'wf-runtime-drag'}
                onClick={()=>setRuntimeDragMode(current=>!current)}
                disabled={
                  busy||
                  stagedOperations.length>0||
                  selected?.physics?.mode!=='dynamic'||
                  Boolean(playSession.runtimeBodies[selectedId]?.kinematic)||
                  transformMode!=='translate'
                }
                title={
                  stagedOperations.length
                    ? 'Apply or clear staged authoring changes first'
                    : selected?.physics?.mode!=='dynamic'
                      ? 'Select a Dynamic mesh to enable Runtime Drag'
                      : 'Toggle viewport gizmo between authored transforms and ephemeral runtime teleport'
                }
              >
                {runtimeDragMode?'Runtime Drag ON':'Runtime Drag'}
              </button>
              <button onClick={()=>void stopPlaySession()} disabled={busy}>■ Stop</button>
            </>}
        <input
          ref={importInputRef}
          className="wf-hidden-input"
          type="file"
          accept=".json,application/json"
          onChange={event=>{
            const file=event.currentTarget.files?.[0];
            event.currentTarget.value='';
            if(file) void importProject(file);
          }}
        />
        <div className="wf-transform-modes" role="group" aria-label="Transform mode">
          {([
            ['translate','Move'],
            ['rotate','Rotate'],
            ['scale','Scale'],
          ] as const).map(([mode,label])=><button
            key={mode}
            type="button"
            className={transformMode===mode?'active':''}
            onClick={()=>setTransformMode(mode)}
            disabled={busy}
          >
            {label}
          </button>)}
        </div>
        <label className="wf-snap-control">
          <span>Snap</span>
          <select
            value={snapStep}
            onChange={event=>setSnapStep(Number(event.target.value))}
            disabled={busy}
          >
            <option value={.01}>0.01m</option>
            <option value={.05}>0.05m</option>
            <option value={.1}>0.10m</option>
            <option value={.25}>0.25m</option>
            <option value={.5}>0.50m</option>
            <option value={1}>1.00m</option>
          </select>
        </label>
        <button onClick={()=>void renderNativePreview(false)} disabled={busy}>Wireframe</button>
        <button onClick={()=>void renderNativePreview(true)} disabled={busy}>Solid Render</button>
        <button
          onClick={()=>void compileEngineBridge()}
          disabled={busy||stagedOperations.length>0||Boolean(playSession)}
          title={
            playSession
              ? 'Stop Play Mode before rebuilding the static World Engine bridge'
              : stagedOperations.length
                ? 'Apply or clear staged changes first'
                : 'Compile committed scene into World Engine'
          }
        >
          Engine Bridge
        </button>
        <button onClick={()=>void bindCinematicShot()} disabled={busy}>Bind Shot</button>
        {engineBridge&&<span
          className={engineBridge.webGpuReady?'wf-engine-ready':'wf-engine-partial'}
          title={engineBridge.digest}
        >
          WE {engineBridge.webGpuReady?'GPU READY':'RUNTIME'} · {engineBridge.visualParity.toUpperCase()}
        </span>}
        {playSession&&<span className="wf-play-runtime-meta">
          {playSession.webGpuReady?'GPU READY':'RUNTIME'} · {playSession.visualParity.toUpperCase()} · {playSession.timeSec.toFixed(3)}s
        </span>}
      </div>
    </header>

    <section className="wf-workspace">
      <aside className="wf-panel wf-outliner">
        <div className="wf-panel-title">Scene</div>
        {project.nodes.map(node=><button
          key={node.id}
          className={`wf-node ${node.id===selectedId?'selected':''}`}
          onClick={()=>setSelectedId(node.id)}
        >
          <span className="wf-node-icon">{node.kind==='camera'?'CAM':node.kind==='light'?'LGT':node.kind==='mesh'?'GEO':'OBJ'}</span>
          <span>{node.name}</span>
          {node.locked&&<span className="wf-lock">LOCK</span>}
        </button>)}
      </aside>

      <section className="wf-stage">
        {playSession&&<div className={
          stagedOperations.length
            ? 'wf-runtime-view-badge authoring'
            : runtimeDragMode
              ? 'wf-runtime-view-badge dragging'
              : 'wf-runtime-view-badge'
        }>
          {stagedOperations.length
            ? 'AUTHOR PREVIEW'
            : runtimeDragMode
              ? 'RUNTIME DRAG'
              : 'RUNTIME VIEW'} · t{playSession.tick}
        </div>}
        <WorldViewport
          project={runtimeViewportProject??viewportProject??project}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onTranslate={commitViewportTranslate}
          onRotate={commitViewportRotate}
          onScale={commitViewportScale}
          transformMode={transformMode}
          snapStep={snapStep}
          angleSnapDeg={15}
          scaleSnapStep={.1}
        />
        {engineBridge&&<div className="wf-engine-bridge-status">
          <strong>WORLD ENGINE</strong>
          <span>{engineBridge.worldId}</span>
          <span>{engineBridge.geometryCount} geometry</span>
          <span>{engineBridge.warnings} warning{engineBridge.warnings===1?'':'s'}</span>
          <span>{engineBridge.blockers} blocker{engineBridge.blockers===1?'':'s'}</span>
          <small>{engineBridge.digest.slice(0,12)}</small>
        </div>}
        {stagedOperations.length>0&&<div className="wf-stage-tray">
          <strong>CHANGESET STAGED</strong>
          <span>{stagedOperations.length} operation{stagedOperations.length===1?'':'s'}</span>
          <small>Bound to world v{project.version} · {digest.slice(0,12)}</small>
        </div>}
        <form
          className="wf-commandbar"
          onSubmit={event=>{
            event.preventDefault();
            void runCommand();
          }}
        >
          <span>⌘</span>
          <input
            value={command}
            onChange={event=>setCommand(event.target.value)}
            placeholder={selected?`Tell World Forge what to do with ${selected.name}…`:'Select an object, then give World Forge a command…'}
            disabled={busy}
          />
          <button disabled={busy||!command.trim()}>Apply</button>
          {commandNote&&<small>{commandNote}</small>}
        </form>
        {nativePreview&&<div className="wf-native-preview">
          <div>
            <strong>{nativePreview.solid?'EVERCRAFT NATIVE SOLID':'EVERCRAFT NATIVE WIREFRAME'}</strong>
            <span>{nativePreview.renderer} · {nativePreview.sha.slice(0,12)}</span>
            <button onClick={()=>setNativePreview(null)}>×</button>
          </div>
          <img
            alt={nativePreview.solid?'World Forge native solid render':'World Forge native wireframe render'}
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(nativePreview.svg)}`}
          />
          <small>{nativePreview.solid?'Filled faces + material color + basic scene lighting':'Wireframe geometry'} · production render authority OFF</small>
        </div>}
        {error&&<div className="wf-error wf-floating-error">{error}</div>}
        {busy&&<div className="wf-busy">Applying scene operation…</div>}
      </section>

      <aside className="wf-panel wf-inspector">
        <div className="wf-panel-title">Inspector</div>
        {selected ? <>
          <div className="wf-selected-name">
            <span>{selected.kind}</span>
            <strong>{selected.name}</strong>
            <small>{selected.id}</small>
          </div>

          <fieldset disabled={selected.locked||busy}>
            <legend>Position</legend>
            <div className="wf-fields">
              {(['x','y','z'] as const).map(axis=><NumberField
                key={axis}
                label={axis.toUpperCase()}
                value={selected.transform.position[axis]}
                onCommit={value=>transformPatch('position',axis,value)}
              />)}
            </div>
            <div className="wf-nudges">
              {(['x','y','z'] as const).map(axis=><div key={axis}>
                <button onClick={()=>nudge(axis,-AXIS_STEP)}>-{axis.toUpperCase()}</button>
                <button onClick={()=>nudge(axis,AXIS_STEP)}>+{axis.toUpperCase()}</button>
              </div>)}
            </div>
          </fieldset>

          <fieldset disabled={selected.locked||busy}>
            <legend>Rotation</legend>
            <div className="wf-fields">
              {(['x','y','z'] as const).map(axis=><NumberField
                key={axis}
                label={axis.toUpperCase()}
                value={selected.transform.rotationDeg[axis]}
                step={1}
                onCommit={value=>transformPatch('rotationDeg',axis,value)}
              />)}
            </div>
          </fieldset>

          <fieldset disabled={selected.locked||busy}>
            <legend>Scale</legend>
            <div className="wf-fields">
              {(['x','y','z'] as const).map(axis=><NumberField
                key={axis}
                label={axis.toUpperCase()}
                value={selected.transform.scale[axis]}
                onCommit={value=>transformPatch('scale',axis,Math.max(.01,value))}
              />)}
            </div>
          </fieldset>

          {selected.kind==='camera'&&selected.camera&&<fieldset disabled={selected.locked||busy}>
            <legend>Camera</legend>
            <div className="wf-camera-grid">
              <NumberField
                label="MM"
                value={selected.camera.focalLengthMm??50}
                step={1}
                onCommit={value=>cameraPatch({focalLengthMm:Math.max(1,value)})}
              />
              <NumberField
                label="S"
                value={selected.camera.sensorWidthMm??36}
                step={1}
                onCommit={value=>cameraPatch({sensorWidthMm:Math.max(1,value)})}
              />
            </div>
            <div className="wf-camera-look">
              <span>Look at</span>
              <div className="wf-fields">
                {(['x','y','z'] as const).map(axis=><NumberField
                  key={axis}
                  label={axis.toUpperCase()}
                  value={(selected.camera?.lookAt??{x:0,y:0,z:0})[axis]}
                  onCommit={value=>cameraPatch({
                    lookAt:{...(selected.camera?.lookAt??{x:0,y:0,z:0}),[axis]:value},
                  })}
                />)}
              </div>
            </div>
          </fieldset>}

          {selected.kind==='mesh'&&<fieldset className="wf-physics-tools" disabled={selected.locked||busy}>
            <legend>Physics</legend>
            <div className="wf-physics-modes">
              {([
                ['off','Off'],
                ['static','Static'],
                ['kinematic','Kinematic'],
                ['dynamic','Dynamic'],
              ] as const).map(([mode,label])=><button
                key={mode}
                type="button"
                className={(mode==='off'&&!selected.physics)||selected.physics?.mode===mode?'active':''}
                onClick={()=>setPhysicsMode(mode==='off'?null:mode)}
              >
                {label}
              </button>)}
            </div>

            {selected.physics&&<>
              <label className="wf-physics-select">
                <span>Collider</span>
                <select
                  value={selected.physics.collider.type}
                  onChange={event=>{
                    const type=event.target.value;
                    if(type==='auto_box') colliderPatch({type:'auto_box'});
                    else if(type==='auto_sphere') colliderPatch({type:'auto_sphere'});
                    else if(type==='box') colliderPatch({type:'box',halfExtents:{x:.5,y:.5,z:.5}});
                    else colliderPatch({type:'sphere',radius:.5});
                  }}
                >
                  <option value="auto_box">Auto Box</option>
                  <option value="auto_sphere">Auto Sphere</option>
                  <option value="box">Box</option>
                  <option value="sphere">Sphere</option>
                </select>
              </label>

              {selected.physics.collider.type==='box'&&<div className="wf-fields">
                {(['x','y','z'] as const).map(axis=><NumberField
                  key={axis}
                  label={`H${axis.toUpperCase()}`}
                  value={selected.physics!.collider.type==='box'
                    ? selected.physics!.collider.halfExtents[axis]
                    : .5}
                  onCommit={value=>{
                    if(selected.physics?.collider.type!=='box') return;
                    colliderPatch({
                      type:'box',
                      halfExtents:{
                        ...selected.physics.collider.halfExtents,
                        [axis]:Math.max(.001,value),
                      },
                    });
                  }}
                />)}
              </div>}

              {selected.physics.collider.type==='sphere'&&<NumberField
                label="Radius"
                value={selected.physics.collider.radius}
                onCommit={value=>colliderPatch({type:'sphere',radius:Math.max(.001,value)})}
              />}

              {selected.physics.mode!=='static'&&<div className="wf-physics-grid">
                <NumberField
                  label="Mass kg"
                  value={selected.physics.massKg??1}
                  step={.1}
                  onCommit={value=>physicsPatch({massKg:Math.max(.001,value)})}
                />
                <NumberField
                  label="Gravity"
                  value={selected.physics.gravityScale??(selected.physics.mode==='kinematic'?0:1)}
                  step={.1}
                  onCommit={value=>physicsPatch({gravityScale:Math.max(0,value)})}
                />
                <NumberField
                  label="Damping"
                  value={selected.physics.linearDamping??0}
                  step={.05}
                  onCommit={value=>physicsPatch({linearDamping:Math.max(0,value)})}
                />
                <NumberField
                  label="Bounce"
                  value={selected.physics.restitution??0}
                  step={.05}
                  onCommit={value=>physicsPatch({restitution:Math.max(0,Math.min(1,value))})}
                />
              </div>}
              <small>
                Static = collider only · Kinematic = authored motion wins · Dynamic = World Engine simulation.
              </small>

              {playSession&&selected.physics.mode==='dynamic'&&!stagedOperations.length&&(()=>{
                const body=playSession.runtimeBodies[selected.id];
                const speed=body?.velocity
                  ? Math.hypot(body.velocity.x,body.velocity.y,body.velocity.z)
                  : 0;
                return <div className="wf-play-force">
                  <div className="wf-play-force-head">
                    <strong>Runtime input</strong>
                    <span>{speed.toFixed(2)} m/s</span>
                  </div>
                  <NumberField
                    label="Impulse"
                    value={playImpulse}
                    step={.25}
                    onCommit={value=>setPlayImpulse(Math.max(.01,Math.abs(value)))}
                  />
                  <div className="wf-play-force-grid">
                    {(['x','y','z'] as const).map(axis=><div key={axis}>
                      <button
                        type="button"
                        onClick={()=>void impulseSelected(axis,-playImpulse)}
                        disabled={busy}
                      >
                        -{axis.toUpperCase()}
                      </button>
                      <button
                        type="button"
                        onClick={()=>void impulseSelected(axis,playImpulse)}
                        disabled={busy}
                      >
                        +{axis.toUpperCase()}
                      </button>
                    </div>)}
                  </div>
                  <button
                    type="button"
                    className="wf-wide-button"
                    onClick={()=>void zeroSelectedVelocity()}
                    disabled={busy}
                  >
                    Zero Velocity
                  </button>
                  <small>Runtime impulses are tick-bound Play inputs. They never rewrite authored transforms.</small>
                </div>;
              })()}
            </>}
          </fieldset>}

          {selected.kind==='mesh'&&<fieldset className="wf-mesh-tools" disabled={selected.locked||busy}>
            <legend>Mesh / Edit</legend>
            <div className="wf-mesh-stats">
              <span>{selected.geometry?.kind==='editable_mesh'?'EDITABLE':'OBJECT'}</span>
              {selected.geometry?.kind==='editable_mesh'&&<>
                <strong>V {selected.geometry.mesh?.vertices.length??0}</strong>
                <strong>F {selected.geometry.mesh?.faces.length??0}</strong>
              </>}
            </div>
            {selected.geometry?.kind!=='editable_mesh'
              ? <button
                  className="wf-wide-button"
                  onClick={()=>void executePlannedCommand('make editable')}
                  type="button"
                >
                  Make Editable
                </button>
              : <>
                  <div className="wf-mesh-fields">
                    <label>
                      <span>Face</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={meshFaceIndex}
                        onChange={event=>setMeshFaceIndex(Math.max(0,Math.floor(Number(event.target.value)||0)))}
                      />
                    </label>
                    <label>
                      <span>Amount</span>
                      <input
                        type="number"
                        step=".05"
                        value={meshAmount}
                        onChange={event=>setMeshAmount(Number(event.target.value)||0)}
                      />
                    </label>
                  </div>
                  <div className="wf-mesh-actions">
                    <button
                      type="button"
                      onClick={()=>void executePlannedCommand(`extrude face ${meshFaceIndex} by ${meshAmount}`)}
                    >
                      Extrude
                    </button>
                    <button
                      type="button"
                      onClick={()=>void executePlannedCommand(
                        `inset face ${meshFaceIndex} by ${Math.max(.01,Math.min(.99,Math.abs(meshAmount)))}`
                      )}
                    >
                      Inset
                    </button>
                  </div>
                  <small>Weld and delete remain destructive-authority operations and are intentionally unavailable here.</small>
                </>}
          </fieldset>}

          {selected.locked&&<div className="wf-locked-note">Canonical environment object. Locked mutations fail closed.</div>}
        </>:<div className="wf-empty">Select an object.</div>}

        <div className="wf-receipts">
          <div className="wf-panel-title">Mutation receipts</div>
          {!receipts.length&&<div className="wf-empty">No edits yet.</div>}
          {receipts.map((receipt,index)=><div className="wf-receipt" key={receipt.digestAfter+index}>
            <strong>v{receipt.versionBefore} → v{receipt.versionAfter}</strong>
            <span>{receipt.digestAfter.slice(0,12)}</span>
            <small>{receipt.inverseOperations.length} inverse op{receipt.inverseOperations.length===1?'':'s'}</small>
          </div>)}
        </div>
      </aside>
    </section>

    <footer className="wf-statusbar">
      <span>Scene graph: {project.nodes.length} nodes</span>
      <span>Human + command operations share one contract</span>
      <span>Publication authority: OFF</span>
      {shotDigest&&<span title={shotDigest}>Shot: {shotDigest.slice(0,10)}</span>}
    </footer>
  </main>;
}
