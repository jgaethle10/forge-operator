import {normalizeDive,atTime} from '../core.mjs';

const $=id=>document.getElementById(id);
const canvas=$('view');
const gl=canvas.getContext('webgl',{alpha:false,antialias:true,depth:true});
if(!gl){
 $('unsupported').hidden=false;
}else{
 const vs='attribute vec3 aPos,aNormal,aColor;uniform mat4 uVP,uModel;varying vec3 vNormal,vWorld,vColor;void main(){vec4 p=uModel*vec4(aPos,1.0);vWorld=p.xyz;vNormal=normalize(mat3(uModel)*aNormal);vColor=aColor;gl_Position=uVP*p;}';
 const fs='precision mediump float;uniform vec3 uEye;uniform float uTime;varying vec3 vNormal,vWorld,vColor;void main(){vec3 light=normalize(vec3(-0.3,0.55,1.0));float d=max(dot(normalize(vNormal),light),0.0);float caustic=sin(vWorld.x*1.6+uTime*.6)*sin(vWorld.y*1.3-uTime*.4);float floorMask=1.0-smoothstep(-17.5,-13.0,vWorld.z);vec3 lit=vColor*(0.40+0.65*d+0.10*caustic*floorMask);float fog=1.0-exp(-distance(vWorld,uEye)*.028);gl_FragColor=vec4(mix(lit,vec3(.025,.19,.24),clamp(fog,0.0,.86)),1.0);}';
 function shader(type,text){
  const s=gl.createShader(type);gl.shaderSource(s,text);gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));
  return s;
 }
 const prog=gl.createProgram();gl.attachShader(prog,shader(gl.VERTEX_SHADER,vs));
 gl.attachShader(prog,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(prog);
 if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(prog));
 gl.useProgram(prog);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.clearColor(.015,.092,.16,1);
 const attrs=[gl.getAttribLocation(prog,'aPos'),gl.getAttribLocation(prog,'aNormal'),gl.getAttribLocation(prog,'aColor')];
 const uniforms={
  vp:gl.getUniformLocation(prog,'uVP'),model:gl.getUniformLocation(prog,'uModel'),
  eye:gl.getUniformLocation(prog,'uEye'),time:gl.getUniformLocation(prog,'uTime')
 };
 const scale=(v,n)=>[v[0]*n,v[1]*n,v[2]*n];
 const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
 const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
 const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const norm=v=>scale(v,1/(Math.hypot(...v)||1));
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const eyeMatrix=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
 function multiply(a,b){
  const out=new Float32Array(16);
  for(let c=0;c<4;c++)for(let r=0;r<4;r++){let s=0;for(let k=0;k<4;k++)s+=a[4*k+r]*b[4*c+k];out[4*c+r]=s;}
  return out;
 }
 function perspective(fovy,aspect,near,far){
  const f=1/Math.tan(fovy/2),o=new Float32Array(16);
  o[0]=f/aspect;o[5]=f;o[10]=(far+near)/(near-far);o[11]=-1;o[14]=2*far*near/(near-far);return o;
 }
 function lookAt(eye,target){
  const z=norm(sub(eye,target)),x=norm(cross([0,0,1],z)),y=cross(z,x);
  return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);
 }
 function move(pos,angle){
  const c=Math.cos(angle),s=Math.sin(angle);
  return new Float32Array([c,s,0,0,-s,c,0,0,0,0,1,0,pos[0],pos[1],pos[2],1]);
 }
 function tri(out,a,b,c,col){
  const normal=norm(cross(sub(b,a),sub(c,a)));
  for(const p of [a,b,c])out.push(...p,...normal,...col);
 }
 function quad(out,a,b,c,d,col){tri(out,a,b,c,col);tri(out,a,c,d,col);}
 function box(out,pos,size,col){
  const [x,y,z]=pos,[w,h,d]=size.map(v=>v/2);
  const p=[[x-w,y-h,z-d],[x+w,y-h,z-d],[x+w,y+h,z-d],[x-w,y+h,z-d],[x-w,y-h,z+d],[x+w,y-h,z+d],[x+w,y+h,z+d],[x-w,y+h,z+d]];
  for(const f of [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]])quad(out,p[f[0]],p[f[1]],p[f[2]],p[f[3]],col);
 }
 function sphere(out,c,sz,col,rings=8,slices=11){
  const pt=(t,p)=>[c[0]+sz[0]*Math.sin(t)*Math.cos(p),c[1]+sz[1]*Math.sin(t)*Math.sin(p),c[2]+sz[2]*Math.cos(t)];
  for(let i=0;i<rings;i++)for(let j=0;j<slices;j++){
   const t=i*Math.PI/rings,u=(i+1)*Math.PI/rings,p=j*2*Math.PI/slices,q=(j+1)*2*Math.PI/slices;
   quad(out,pt(t,p),pt(u,p),pt(u,q),pt(t,q),col);
  }
 }
 function tube(out,a,b,r,col,sides=9){
  const dir=norm(sub(b,a)),ref=Math.abs(dir[2])<.86?[0,0,1]:[0,1,0];
  const x=norm(cross(dir,ref)),y=cross(dir,x);
  const radial=t=>add(scale(x,r*Math.cos(t)),scale(y,r*Math.sin(t)));
  for(let i=0;i<sides;i++){
   const p=i*2*Math.PI/sides,q=(i+1)*2*Math.PI/sides;
   quad(out,add(a,radial(p)),add(b,radial(p)),add(b,radial(q)),add(a,radial(q)),col);
  }
 }
 function buffer(data){
  const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);
  return {buffer:b,count:data.length/9};
 }
 function draw(mesh,m){
  gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);
  for(let i=0;i<3;i++){gl.enableVertexAttribArray(attrs[i]);gl.vertexAttribPointer(attrs[i],3,gl.FLOAT,false,36,i*12);}
  gl.uniformMatrix4fv(uniforms.model,false,m);
  gl.drawArrays(gl.TRIANGLES,0,mesh.count);
 }
 // THIS ENTIRE ENVIRONMENT IS SYNTHETIC. No real seabed or site is mapped.
 const terrain=[],objects=[],pipe=[],diver=[];
 const floor=(x,y)=>-17.5+.65*Math.sin(x*.18)*Math.cos(y*.2)+.25*Math.sin(x*.43+y*.32);
 const n=32,w=86;
 for(let i=0;i<n;i++)for(let j=0;j<n;j++){
  const x=-w/2+i*w/n,y=-w/2+j*w/n,xx=x+w/n,yy=y+w/n;
  const tint=.75+.12*Math.sin(i*1.5+j*.9);
  quad(terrain,[x,y,floor(x,y)],[xx,y,floor(xx,y)],[xx,yy,floor(xx,yy)],[x,yy,floor(x,yy)],[.31*tint,.41*tint,.33*tint]);
 }
 for(let i=0;i<20;i++){
  const x=-35+i*13%70,y=-32+i*17%64,z=floor(x,y);
  if(Math.hypot(x-10,y-3)<7)continue;
  const size=.7+i%4*.2;
  sphere(objects,[x,y,z+.25],[size,size*.9,size*.6],[.32,.44,.38],6,8);
 }
 for(let i=0;i<42;i++){
  const x=-32+i*23%65,y=-30+i*19%62,z=floor(x,y);
  tube(objects,[x,y,z],[x+.13*Math.sin(i),y+.08*Math.cos(i),z+.65+i%5*.18],.045,[.19,.44,.33],5);
 }
 // The pipe is an illustration. Operating state, pressure, flow and isolation unknown.
 tube(pipe,[1,3,-13],[19,3,-13],1.17,[.72,.45,.23],13);
 tube(pipe,[1,3,-13],[1.4,3,-13],1.30,[.9,.67,.36],13);
 tube(pipe,[18.5,3,-13],[19,3,-13],1.30,[.9,.67,.36],13);
 sphere(pipe,[1,3,-13],[.10,.95,.95],[.09,.19,.21],10,12);
 for(const x of [3,10,17])box(pipe,[x,3,-15.15],[.8,2.4,3.0],[.36,.44,.41]);
 const suit=[.9,.72,.27];
 sphere(diver,[0,0,0],[.81,.38,.36],suit,10,15);
 sphere(diver,[1.0,0,0],[.34,.30,.31],[.18,.29,.30],10,14);
 sphere(diver,[1.23,0,.08],[.12,.23,.2],[.58,.88,.9],9,12);
 tube(diver,[-.2,0,.38],[.37,0,.48],.22,[.44,.66,.68],12);
 for(const side of [-1,1]){
  tube(diver,[.25,side*.28,-.08],[.72,side*.48,-.15],.11,suit,8);
  tube(diver,[-.57,side*.15,-.14],[-1.31,side*.3,-.17],.16,suit,8);
  box(diver,[-1.67,side*.31,-.18],[.69,.34,.07],[.14,.31,.39]);
 }
 const meshes={floor:buffer(terrain),objects:buffer(objects),pipe:buffer(pipe),diver:buffer(diver)};
 let track=null,logs=null,dive=null,current=0,playing=false,last=0;
 let yaw=-.43,pitch=.35,distance=18,following=true,drag=null,pinchDistance=null;
 const pointers=new Map();
 function route(points){
  const t=[],dots=[];
  for(let i=1;i<points.length;i++)if(points[i].t-points[i-1].t<=15)
   tube(t,[points[i-1].x,points[i-1].y,-points[i-1].depth],[points[i].x,points[i].y,-points[i].depth],.065,[.43,.93,.89],6);
  for(let i=0;i<points.length;i+=3)sphere(dots,[points[i].x,points[i].y,-points[i].depth],[.12,.12,.12],[.47,.87,.85],5,6);
  track=buffer(t);logs=buffer(dots);
 }
 const fmt=t=>String(Math.floor(t/60)).padStart(2,'0')+':'+String(Math.floor(t%60)).padStart(2,'0');
 async function load(){
  try{
   const r=await fetch('../sample.json',{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);
   dive=normalizeDive(await r.json());
   if(!dive.demo||!dive.xyAvailable||dive.positionSource!=='SIMULATED')throw Error('Example missing synthetic provenance');
   route(dive.points);current=dive.points[0].t;
   document.documentElement.dataset.subseaSample='synthetic-loaded';
   $('timeline').max=dive.points.at(-1).t;
  }catch(e){$('caption').textContent='Example unavailable: '+e.message;$('play').disabled=true;}
 }
 function frame(time){
  const W=Math.max(1,canvas.clientWidth),H=Math.max(1,canvas.clientHeight),dpr=Math.min(2,devicePixelRatio||1);
  if(canvas.width!==Math.round(W*dpr)||canvas.height!==Math.round(H*dpr)){canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);}
  gl.viewport(0,0,canvas.width,canvas.height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  if(playing&&dive){
   current=Math.min(dive.points.at(-1).t,current+Math.min(.1,Math.max(0,(time-last)/1000)));
   if(current>=dive.points.at(-1).t){playing=false;$('play').textContent='▶ Play';}
  }
  last=time;
  const pt=dive?atTime(dive,current):null;
  const pos=pt&&pt.x!==null?[pt.x,pt.y,-pt.depth]:[-4,-3,-7];
  const target=following?pos:[0,0,-9];
  const eye=[target[0]+Math.sin(yaw)*Math.cos(pitch)*distance,target[1]-Math.cos(yaw)*Math.cos(pitch)*distance,target[2]+Math.sin(pitch)*distance];
  gl.uniformMatrix4fv(uniforms.vp,false,multiply(perspective(57*Math.PI/180,W/H,.2,180),lookAt(eye,target)));
  gl.uniform3fv(uniforms.eye,new Float32Array(eye));gl.uniform1f(uniforms.time,time/1000);
  const id=eyeMatrix();draw(meshes.floor,id);draw(meshes.objects,id);draw(meshes.pipe,id);
  if(track)draw(track,id);if(logs)draw(logs,id);
  if(pt&&pt.x!==null){
   let angle=0;const a=dive.points[pt.nearest],b=dive.points[Math.min(pt.nearest+1,dive.points.length-1)];
   if(a!==b)angle=Math.atan2(b.y-a.y,b.x-a.x);
   draw(meshes.diver,move(pos,angle));
  }
  if(dive){
   $('depth').textContent=pt.depth===null?'Not recorded':pt.depth.toFixed(1)+' m';
   $('time').textContent=fmt(current)+' / '+fmt(dive.points.at(-1).t);
   $('timeline').value=current;
  }
  if(gl.getError()===gl.NO_ERROR)document.documentElement.dataset.subseaRenderer='webgl-drawn';
  requestAnimationFrame(frame);
 }
 $('play').addEventListener('click',()=>{
  if(!dive)return;
  if(current>=dive.points.at(-1).t)current=dive.points[0].t;
  playing=!playing;$('play').textContent=playing?'Ⅱ Pause':'▶ Play';
 });
 $('timeline').addEventListener('input',e=>current=Number(e.target.value));
 $('follow').addEventListener('click',()=>{following=!following;$('follow').setAttribute('aria-pressed',String(following));});
 $('rotate').addEventListener('click',()=>{yaw=-.43;pitch=.35;distance=18;following=true;$('follow').setAttribute('aria-pressed','true');});
 $('zoom-in').addEventListener('click',()=>distance=clamp(distance*.8,5,65));
 $('zoom-out').addEventListener('click',()=>distance=clamp(distance*1.2,5,65));
 $('evidence').addEventListener('click',()=>{$('details').hidden=false;$('evidence').setAttribute('aria-expanded','true');});
 $('close-details').addEventListener('click',()=>{$('details').hidden=true;$('evidence').setAttribute('aria-expanded','false');});
 function pinchLength(){
  if(pointers.size<2)return null;
  const [a,b]=[...pointers.values()];return Math.hypot(a.x-b.x,a.y-b.y);
 }
 canvas.addEventListener('pointerdown',e=>{
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size===1)drag={id:e.pointerId,x:e.clientX,y:e.clientY,yaw,pitch};
  else{drag=null;pinchDistance=pinchLength();}
 });
 canvas.addEventListener('pointermove',e=>{
  if(!pointers.has(e.pointerId))return;
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size>=2){
   const next=pinchLength();
   if(pinchDistance&&next)distance=clamp(distance*pinchDistance/next,5,65);
   pinchDistance=next;
   return;
  }
  if(!drag||drag.id!==e.pointerId)return;
  yaw=drag.yaw+(e.clientX-drag.x)*.008;
  pitch=clamp(drag.pitch+(e.clientY-drag.y)*.006,-.1,1.18);
 });
 function pointerDone(e){
  pointers.delete(e.pointerId);drag=null;pinchDistance=null;
 }
 canvas.addEventListener('pointerup',pointerDone);
 canvas.addEventListener('pointercancel',pointerDone);
 canvas.addEventListener('wheel',e=>{e.preventDefault();distance=clamp(distance*(e.deltaY>0?1.08:.92),5,65);},{passive:false});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){playing=false;$('play').textContent='▶ Play';}});
 load().then(()=>requestAnimationFrame(frame));
}
