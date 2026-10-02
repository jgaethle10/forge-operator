import React, { useEffect, useMemo, useRef, useState } from 'react';
import './world-forge.css';

type Vec3={x:number;y:number;z:number};
type Transform={position:Vec3;rotationDeg:Vec3;scale:Vec3};
type ForgeNode={
  id:string;
  name:string;
  kind:string;
  transform:Transform;
  visible?:boolean;
  locked?:boolean;
  geometry?:{kind:string;primitive?:string};
  light?:{type:string;intensity:number;color:[number,number,number]};
};
type ForgeProject={
  schema:string;
  id:string;
  title:string;
  version:number;
  nodes:ForgeNode[];
  materials:Array<{id:string;name:string;baseColor:[number,number,number,number]}>;
};
type ForgeOperation=
  |{type:'set_transform';nodeId:string;transform:Partial<Transform>}
  |{type:'set_visibility';nodeId:string;visible:boolean}
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

const AXIS_STEP=.25;

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
}:{
  project:ForgeProject;
  selectedId:string;
  onSelect:(nodeId:string)=>void;
}){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const [orbit,setOrbit]=useState({yaw:-38,pitch:28,distance:12});
  const dragRef=useRef<{x:number;y:number;moved:boolean}|null>(null);

  const meshNodes=useMemo(
    ()=>project.nodes.filter(node=>node.kind==='mesh'&&node.visible!==false),
    [project],
  );

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

      const yaw=rad(orbit.yaw);
      const pitch=rad(orbit.pitch);
      const cp=Math.cos(pitch);
      const eye=[
        Math.sin(yaw)*cp*orbit.distance,
        -Math.cos(yaw)*cp*orbit.distance,
        Math.sin(pitch)*orbit.distance+1.25,
      ];
      const projection=mat4Perspective(rad(52),canvas.width/canvas.height,.05,200);
      const view=mat4LookAt(eye,[0,0,1],[0,0,1]);
      const vp=mat4Multiply(projection,view);

      drawVertices(GRID_LINES,vp,[.13,.16,.19,1]);

      for(const node of meshNodes){
        const mvp=mat4Multiply(vp,modelMatrix(node.transform));
        const selected=node.id===selectedId;
        const locked=node.locked===true;
        const color:[number,number,number,number]=selected
          ? [.31,.75,1,1]
          : locked
            ? [.36,.39,.43,1]
            : [.72,.63,.39,1];
        drawVertices(CUBE_LINES,mvp,color);
      }
    }

    render();
    return ()=>{
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  },[project,meshNodes,orbit,selectedId]);

  function approximatePick(clientX:number,clientY:number){
    const canvas=canvasRef.current;
    if(!canvas) return;
    const rect=canvas.getBoundingClientRect();
    const x=(clientX-rect.left)/rect.width*2-1;
    const y=1-(clientY-rect.top)/rect.height*2;
    const yaw=rad(orbit.yaw);
    const pitch=rad(orbit.pitch);
    const cp=Math.cos(pitch);
    const eye=[
      Math.sin(yaw)*cp*orbit.distance,
      -Math.cos(yaw)*cp*orbit.distance,
      Math.sin(pitch)*orbit.distance+1.25,
    ];
    const projection=mat4Perspective(rad(52),rect.width/rect.height,.05,200);
    const view=mat4LookAt(eye,[0,0,1],[0,0,1]);
    const vp=mat4Multiply(projection,view);

    let best:{id:string;distance:number}|null=null;
    for(const node of meshNodes){
      const p=node.transform.position;
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

  return <div className="wf-viewport-wrap">
    <canvas
      ref={canvasRef}
      className="wf-viewport"
      onPointerDown={(event)=>{
        dragRef.current={x:event.clientX,y:event.clientY,moved:false};
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event)=>{
        const drag=dragRef.current;
        if(!drag) return;
        const dx=event.clientX-drag.x;
        const dy=event.clientY-drag.y;
        if(Math.abs(dx)+Math.abs(dy)>3) drag.moved=true;
        drag.x=event.clientX;
        drag.y=event.clientY;
        if(drag.moved){
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
        if(drag&&!drag.moved) approximatePick(event.clientX,event.clientY);
      }}
      onWheel={(event)=>{
        event.preventDefault();
        setOrbit(current=>({
          ...current,
          distance:Math.max(3,Math.min(40,current.distance+event.deltaY*.012)),
        }));
      }}
    />
    <div className="wf-view-badge">WEBGL2 VIEWPORT</div>
    <div className="wf-view-help">Drag to orbit · wheel to zoom · click object to select</div>
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

  useEffect(()=>{
    let active=true;
    fetch('/api/fallen/world-forge/starter')
      .then(async response=>{
        const payload=await response.json();
        if(!response.ok||!payload.success) throw new Error(payload.error||'Could not load World Forge.');
        if(!active) return;
        setProject(payload.project);
        setDigest(payload.validation.digest);
        const first=payload.project.nodes.find((node:ForgeNode)=>node.kind==='mesh'&&!node.locked);
        setSelectedId(first?.id||payload.project.nodes[0]?.id||'');
      })
      .catch(err=>active&&setError(err instanceof Error?err.message:String(err)));
    return ()=>{active=false;};
  },[]);

  const selected=project?.nodes.find(node=>node.id===selectedId)||null;

  async function mutate(operations:ForgeOperation[],recordUndo=true){
    if(!project||busy) return;
    setBusy(true);
    setError('');
    try{
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

  function transformPatch(group:'position'|'rotationDeg'|'scale',axis:keyof Vec3,value:number){
    if(!selected) return;
    mutate([{
      type:'set_transform',
      nodeId:selected.id,
      transform:{[group]:{...selected.transform[group],[axis]:value}},
    } as ForgeOperation]);
  }

  function nudge(axis:keyof Vec3,amount:number){
    if(!selected) return;
    const next=selected.transform.position[axis]+amount;
    transformPatch('position',axis,next);
  }

  function addCube(){
    if(!project) return;
    const index=project.nodes.filter(node=>node.kind==='mesh').length+1;
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
    mutate([{type:'add_node',node}]).then(()=>setSelectedId(id));
  }

  async function undo(){
    const inverse=undoStack[undoStack.length-1];
    if(!inverse?.length) return;
    setUndoStack(current=>current.slice(0,-1));
    await mutate(inverse,false);
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

  async function runCommand(){
    if(!project||!command.trim()||busy) return;
    setBusy(true);
    setError('');
    setCommandNote('');
    try{
      const response=await fetch('/api/fallen/world-forge/command-plan',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({
          project,
          instruction:command,
          selectedNodeId:selectedId||undefined,
        }),
      });
      const payload=await response.json();
      if(!response.ok||!payload.plan||payload.plan.status!=='accepted'){
        throw new Error(payload.plan?.explanation||payload.error||'World Forge could not compile that command.');
      }
      const plan=payload.plan;
      setCommandNote(plan.explanation);
      setBusy(false);
      await mutate(plan.operations);
      setCommand('');
    }catch(err){
      setError(err instanceof Error?err.message:String(err));
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
        <button onClick={undo} disabled={!undoStack.length||busy}>Undo</button>
        <button onClick={addCube} disabled={busy}>+ Cube</button>
        <button onClick={()=>void bindCinematicShot()} disabled={busy}>Bind Shot</button>
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
        <WorldViewport project={project} selectedId={selectedId} onSelect={setSelectedId}/>
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
