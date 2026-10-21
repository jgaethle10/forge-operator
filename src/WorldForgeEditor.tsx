import React, { useEffect, useMemo, useRef, useState } from 'react';
import './world-forge.css';
import {
  axisDragWorldDelta,
  frameDistanceForScale,
  perspectiveVerticalFovRad,
} from './world-forge-viewport-tools';

type Vec3={x:number;y:number;z:number};
type Transform={position:Vec3;rotationDeg:Vec3;scale:Vec3};
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
};
type ForgeProject={
  schema:string;
  id:string;
  title:string;
  version:number;
  activeCameraNodeId?:string;
  nodes:ForgeNode[];
  materials:Array<{id:string;name:string;baseColor:[number,number,number,number]}>;
};
type ForgeOperation=
  |{type:'set_transform';nodeId:string;transform:Partial<Transform>}
  |{type:'set_visibility';nodeId:string;visible:boolean}
  |{type:'set_camera';nodeId:string;camera:Partial<NonNullable<ForgeNode['camera']>>}
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
};

type PlayRuntimeProjection={
  projectVersion:number;
  worldVersion:number;
  tick:number;
  timeSec:number;
  snapshotDigest:string;
  nodeTransforms:Array<{
    nodeId:string;
    entityId:string;
    transform:Transform;
  }>;
  canonicalAuthoringMutation:false;
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

function editableMeshLines(node:ForgeNode){
  const mesh=node.geometry?.kind==='editable_mesh'?node.geometry.mesh:undefined;
  if(!mesh) return CUBE_LINES;
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

function WorldViewport({
  project,
  selectedId,
  onSelect,
  onTranslate,
  snapStep,
}:{
  project:ForgeProject;
  selectedId:string;
  onSelect:(nodeId:string)=>void;
  onTranslate:(nodeId:string,axis:keyof Vec3,delta:number)=>void;
  snapStep:number;
}){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const [orbit,setOrbit]=useState({
    yaw:-38,
    pitch:28,
    distance:12,
    target:{x:0,y:0,z:1} as Vec3,
  });
  const [viewMode,setViewMode]=useState<'orbit'|'camera'>('orbit');
  const [gizmoPreview,setGizmoPreview]=useState<{
    nodeId:string;
    axis:keyof Vec3;
    delta:number;
  }|null>(null);
  const dragRef=useRef<
    | {mode:'orbit';x:number;y:number;moved:boolean}
    | {mode:'pick';x:number;y:number;moved:boolean}
    | {
        mode:'gizmo';
        axis:keyof Vec3;
        startX:number;
        startY:number;
        axisScreenDx:number;
        axisScreenDy:number;
        axisWorldLength:number;
        delta:number;
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

  function positionWithPreview(node:ForgeNode){
    if(gizmoPreview?.nodeId!==node.id) return node.transform.position;
    return {
      ...node.transform.position,
      [gizmoPreview.axis]:node.transform.position[gizmoPreview.axis]+gizmoPreview.delta,
    };
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

  function gizmoHit(clientX:number,clientY:number){
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

  useEffect(()=>{
    const canvas=canvasRef.current;
    if(!canvas) return;
    const gl=canvas.getContext('webgl2',{antialias:true});
    if(!gl) return;

    const program=createProgram(gl);
    const pos=gl.getAttribLocation(program,'aPosition');
    const uMvp=gl.getUniformLocation(program,'uMvp');
    const uColor=gl.getUniformLocation(program,'uColor');
    const buffer=gl.createBuffer();

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
      gl!.bindBuffer(gl!.ARRAY_BUFFER,buffer);
      gl!.bufferData(gl!.ARRAY_BUFFER,vertices,gl!.STATIC_DRAW);
      gl!.enableVertexAttribArray(pos);
      gl!.vertexAttribPointer(pos,3,gl!.FLOAT,false,0,0);
      gl!.uniformMatrix4fv(uMvp,false,mvp);
      gl!.uniform4fv(uColor,color);
      gl!.drawArrays(gl!.LINES,0,vertices.length/3);
    }

    function render(){
      resize();
      gl!.enable(gl!.DEPTH_TEST);
      gl!.clearColor(.018,.021,.026,1);
      gl!.clear(gl!.COLOR_BUFFER_BIT|gl!.DEPTH_BUFFER_BIT);
      gl!.useProgram(program);

      const {vp}=matrices(canvas.width,canvas.height);
      drawVertices(GRID_LINES,vp,[.13,.16,.19,1]);

      for(const node of meshNodes){
        const transform=gizmoPreview?.nodeId===node.id
          ? {
              ...node.transform,
              position:positionWithPreview(node),
            }
          : node.transform;
        const mvp=mat4Multiply(vp,modelMatrix(transform));
        const selected=node.id===selectedId;
        const locked=node.locked===true;
        const color:[number,number,number,number]=selected
          ? [.31,.75,1,1]
          : locked
            ? [.36,.39,.43,1]
            : [.72,.63,.39,1];
        drawVertices(editableMeshLines(node),mvp,color);
      }

      if(selectedNode&&!selectedNode.locked){
        const base=positionWithPreview(selectedNode);
        const gizmoModel=mat4Translation(base);
        const gizmoMvp=mat4Multiply(vp,gizmoModel);
        drawVertices(new Float32Array([0,0,0,1.35,0,0]),gizmoMvp,[1,.28,.24,1]);
        drawVertices(new Float32Array([0,0,0,0,1.35,0]),gizmoMvp,[.31,.9,.42,1]);
        drawVertices(new Float32Array([0,0,0,0,0,1.35]),gizmoMvp,[.3,.58,1,1]);
      }
    }

    render();
    return ()=>{
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  },[project,meshNodes,orbit,selectedId,selectedNode,activeCamera,viewMode,gizmoPreview]);

  function approximatePick(clientX:number,clientY:number){
    const canvas=canvasRef.current;
    if(!canvas) return;
    const rect=canvas.getBoundingClientRect();
    const x=(clientX-rect.left)/rect.width*2-1;
    const y=1-(clientY-rect.top)/rect.height*2;
    const {vp}=matrices(rect.width,rect.height);

    let best:{id:string;distance:number}|null=null;
    for(const node of meshNodes){
      const p=positionWithPreview(node);
      const px=vp[0]*p.x+vp[4]*p.y+vp[8]*p.z+vp[12];
      const py=vp[1]*p.x+vp[5]*p.y+vp[9]*p.z+vp[13];
      const pw=vp[3]*p.x+vp[7]*p.y+vp[11]*p.z+vp[15];
      if(pw<=0) continue;
      const nx=px/pw;
      const ny=py/pw;
      const distance=Math.hypot(nx-x,ny-y);
      if(distance<.16&&(!best||distance<best.distance)) best={id:node.id,distance};
    }
    if(best) onSelect(best.id);
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
        const hit=gizmoHit(event.clientX,event.clientY);
        if(hit){
          dragRef.current={
            mode:'gizmo',
            axis:hit.axis,
            startX:event.clientX,
            startY:event.clientY,
            axisScreenDx:hit.axisScreenDx,
            axisScreenDy:hit.axisScreenDy,
            axisWorldLength:hit.axisWorldLength,
            delta:0,
          };
        }else if(viewMode==='orbit'){
          dragRef.current={mode:'orbit',x:event.clientX,y:event.clientY,moved:false};
        }else{
          dragRef.current={mode:'pick',x:event.clientX,y:event.clientY,moved:false};
        }
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event)=>{
        const drag=dragRef.current;
        if(!drag) return;

        if(drag.mode==='gizmo'){
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

        if(drag?.mode==='gizmo'){
          setGizmoPreview(null);
          if(selectedNode&&Math.abs(drag.delta)>1e-9){
            onTranslate(selectedNode.id,drag.axis,drag.delta);
          }
          return;
        }

        if(drag&&!drag.moved) approximatePick(event.clientX,event.clientY);
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
    <div className="wf-view-badge">{viewMode==='camera'?'CAMERA VIEW':'WEBGL2 ORBIT'}</div>
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
      <span>Snap {snapStep}m</span>
    </div>
    <div className="wf-view-help">
      Drag empty space to orbit · wheel to zoom · click to select · drag X/Y/Z handles to move
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
  const [playProjection,setPlayProjection]=useState<PlayRuntimeProjection|null>(null);
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
      }
    }

    return {...project,nodes};
  },[project,stageMode,stagedOperations]);

  const displayProject=useMemo(()=>{
    if(!viewportProject||!playSession||stageMode||!playProjection) return viewportProject;
    const runtimeByNode=new Map(
      playProjection.nodeTransforms.map(item=>[item.nodeId,item.transform]),
    );
    return {
      ...viewportProject,
      nodes:viewportProject.nodes.map(node=>{
        const runtimeTransform=runtimeByNode.get(node.id);
        return runtimeTransform
          ? {...node,transform:structuredClone(runtimeTransform)}
          : node;
      }),
    };
  },[viewportProject,playSession,stageMode,playProjection]);

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
      setPlayProjection(payload.projection as PlayRuntimeProjection);
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
      setPlayProjection(null);
      if(!silent) setCommandNote(`Play Mode stopped at tick ${current.tick}.`);
    }catch(err){
      if(!silent) throw err;
      setPlaySession(null);
      setPlayProjection(null);
    }
  }

  async function stepPlaySession(ticks:number){
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
          inputs:[],
        }),
      });
      const payload=await response.json();
      if(!response.ok||!payload.success||!payload.result?.snapshot||!payload.session){
        throw new Error(payload.error||'World Forge Play Mode step failed.');
      }
      setPlaySession(playStateFromPayload(payload.session,payload.result.snapshot));
      setPlayProjection(payload.projection as PlayRuntimeProjection);
      setCommandNote(
        `Play Mode advanced ${ticks} tick${ticks===1?'':'s'} → ${payload.result.snapshot.tick}.`
      );
    }catch(err){
      setError(err instanceof Error?err.message:String(err));
    }finally{
      setBusy(false);
    }
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
    setPlayProjection(payload.projection as PlayRuntimeProjection);
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

  function commitViewportTranslate(nodeId:string,axis:keyof Vec3,delta:number){
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

  function cameraPatch(patch:Partial<NonNullable<ForgeNode['camera']>>){
    if(!selected||selected.kind!=='camera'||!selected.camera) return;
    queueOrMutate([{
      type:'set_camera',
      nodeId:selected.id,
      camera:patch,
    }],`Update ${selected.name} camera`);
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
        {playSession&&!stageMode&&playProjection&&<span className="wf-runtime-view-badge">
          RUNTIME VIEW · t{playProjection.tick}
        </span>}
        {playSession&&stageMode&&<span className="wf-runtime-view-badge staged">
          AUTHORING PREVIEW · runtime t{playSession.tick}
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
        <WorldViewport
          project={displayProject??viewportProject??project}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onTranslate={commitViewportTranslate}
          snapStep={snapStep}
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
