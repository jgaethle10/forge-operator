// Becoming Worlds, first-person 3D: standalone owned WebGL2 renderer.
// It reads the same local campus as worlds.html. No tracking, backend, CDN, or AI.
import {STORAGE_KEY,GOALS,dayKey,shiftDay,emptyState,normalizeState} from './engine.mjs';
import {placeFacility,WORLD_CATALOG} from './world-engine.mjs';
import {walkableScene,spawnExplorer,updateExplorer,nearestFacility} from './walk-engine.mjs';

const el=id=>document.getElementById(id);
const canvas=el('view');
const goalFallback='alcohol-free';
let habit=emptyState(),goal=goalFallback,mode='franchise',isDemo=false;
try{habit=normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)||'null'));}catch{}
goal=GOALS.some(g=>g.id===habit.goal)?habit.goal:goalFallback;
mode=habit.worldState?.activeModes?.[goal]||'franchise';
function sampleCampus(){
  let copy=emptyState();
  copy.goal=goal;
  copy.creditedDays[goal]=Array.from({length:520},(_,i)=>shiftDay(dayKey(),-i));
  const lots=[[1,0],[0,1],[-1,0],[0,-1],[2,0],[0,-2],[2,2],[-2,-1]];
  const kinds=(WORLD_CATALOG[mode]||WORLD_CATALOG.franchise).slice(0,lots.length);
  kinds.forEach((item,i)=>{try{copy=placeFacility(copy,goal,mode,item.kind,...lots[i]);}catch{}});
  return copy;
}
function campusState(){return isDemo?sampleCampus():habit;}
let scene=walkableScene(campusState(),goal,mode),player=spawnExplorer();
let running=false,dragging=false,lookPointer=null,lastX=0,lastY=0;
const held=new Set(),touch=new Set();
const colors={
 franchise:{ground:'#37694e',grass:'#528260',path:'#b9aa86',wood:'#a78a67',stone:'#9da8a2',roof:'#bec6c2',accent:'#edc48d',sky:'#75979a'},
 symphony:{ground:'#354860',grass:'#4b6175',path:'#9b9bac',wood:'#93849d',stone:'#aeb6bd',roof:'#b8a8c3',accent:'#f5b7d4',sky:'#667c9e'},
 sanctuary:{ground:'#3e6b52',grass:'#638666',path:'#bfa78a',wood:'#aa8f65',stone:'#c2b6a0',roof:'#c9b79a',accent:'#f4d7a6',sky:'#7ca69a'}
};
const hex=s=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16)/255);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const cubeMeshes=[];
let packed=[],triangles=0;
function quad(a,b,c,d,color){
  const u=b.map((v,i)=>v-a[i]),v=c.map((x,i)=>x-a[i]);
  const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  const length=Math.hypot(...n)||1;const normal=n.map(x=>x/length),rgb=hex(color);
  for(const point of [a,b,c,a,c,d])packed.push(...point,...normal,...rgb);
  triangles+=2;
}
function box(x,y,z,w,h,d,color){
  const x1=x-w/2,x2=x+w/2,y1=y-h/2,y2=y+h/2,z1=z-d/2,z2=z+d/2;
  quad([x1,y2,z1],[x1,y2,z2],[x2,y2,z2],[x2,y2,z1],color);
  quad([x1,y1,z2],[x1,y1,z1],[x2,y1,z1],[x2,y1,z2],color);
  quad([x1,y1,z2],[x1,y2,z2],[x1,y2,z1],[x1,y1,z1],color);
  quad([x2,y1,z1],[x2,y2,z1],[x2,y2,z2],[x2,y1,z2],color);
  quad([x1,y1,z1],[x1,y2,z1],[x2,y2,z1],[x2,y1,z1],color);
  quad([x2,y1,z2],[x2,y2,z2],[x1,y2,z2],[x1,y1,z2],color);
}
function wedgeRoof(x,y,z,w,d,rise,color){
  const x1=x-w/2,x2=x+w/2,z1=z-d/2,z2=z+d/2;
  quad([x1,y,z1],[x1,y,z2],[x,y+rise,z2],[x,y+rise,z1],color);
  quad([x,y+rise,z1],[x,y+rise,z2],[x2,y,z2],[x2,y,z1],color);
  quad([x1,y,z2],[x2,y,z2],[x,y+rise,z2],[x,y+rise,z2],color);
  quad([x2,y,z1],[x1,y,z1],[x,y+rise,z1],[x,y+rise,z1],color);
}
function drawTree(x,z,scale=1){
  box(x,1.5*scale,z,.6*scale,3*scale,.6*scale,'#785f42');
  box(x,3.2*scale,z,2.4*scale,2.7*scale,2.4*scale,mode==='symphony'?'#5e8a85':'#4b8764');
  box(x,4.9*scale,z,1.6*scale,2*scale,1.6*scale,mode==='symphony'?'#719d91':'#689873');
}
function signpost(x,z){box(x,1,z,.22,2,.2,'#604f42');box(x,2.06,z,2.9,.75,.2,'#b39d7a');}
function founderArea(p){
  // Ground zero belongs to every lifetime world. No build purchase required.
  box(0,-.08,0,15,.18,15,p.path);
  box(0,.15,0,7,.6,7,p.stone);
  box(0,1.35,0,1.3,2.1,1.3,p.roof);
  box(0,2.5,0,3,.25,3,p.accent);
  for(const [x,z] of [[-5,-5],[5,5],[-5,5],[5,-5]]){box(x,2,z,.16,4,.16,p.accent);box(x,4.05,z,.55,.2,.55,'#f9dea9');}
}
function stadium(b,p){
  const x=b.x,z=b.z;
  box(x,.12,z,39,.25,30,'#7ba06d');
  for(let i=0;i<8;i++)box(x-16+i*4.6,.28,z,2.1,.05,25,i%2===0?'#8faf7a':'#78a267');
  box(x,.34,z,1.1,.09,28,'#f4ebd0');
  for(const zOff of [-15,15]){box(x,.34,z+zOff,39,.07,.4,'#f3e6cf');}
  for(const xOff of [-20,20]){box(x+xOff,2.5,z,5,5,34,p.stone);box(x+xOff,5.15,z,7,.7,35,p.roof);box(x+xOff,3,z,5.6,2.3,32,'#516b63');}
  for(const zOff of [-20,20]){box(x,2.4,z+zOff,44,4.8,7,p.wood);box(x,5.1,z+zOff,44,.6,8,p.roof);}
  for(const dx of [-24,24])for(const dz of [-22,22]){box(x+dx,7,z+dz,.45,14,.45,p.stone);box(x+dx,14,z+dz,4,1,1.8,'#faf3c6');}
  for(const dz of [-12,12]){box(x,.9,z+dz,.28,1.7,.28,'#fff5dd');box(x,1.75,z+dz,6,.22,.22,'#fff5dd');}
}
function practiceField(b,p){
  const x=b.x,z=b.z;box(x,.1,z,31,.2,17,'#77a16d');
  for(let i=-4;i<=4;i++)box(x+i*3.4,.25,z,.15,.05,16,'#e6e9d7');
  for(const dz of [-10,10])box(x,.35,z+dz,34,.25,.3,p.wood);
  box(x+14,2,z,1,4,1,p.stone);box(x+14,4.2,z,6,.3,1,p.accent);
}
function hall(b,p){
  const x=b.x,z=b.z,w=Math.max(11,b.halfWidth*1.4),d=Math.max(10,b.halfDepth*1.3);
  const height=Math.min(9+Math.min(b.level,6)*.7,15);
  box(x,height/2,z,w,height,d,p.wood);
  box(x,height+.45,z,w+2,.9,d+2,p.roof);
  box(x,height+.98,z,w+1,.2,d+1,p.accent);
  for(let i=-2;i<=2;i++){
    box(x+i*w/6,3.5,z+d/2+.08,1.35,4,.25,'#507d83');
    box(x+i*w/6,3.5,z-d/2-.08,1.35,4,.25,'#507d83');
  }
  box(x,1.65,z+d/2+.2,2.8,3.3,.3,'#3e5555');
  box(x,.28,z+d/2+2,5,.45,4,p.stone);
}
function smallFacility(b,p){
  if(b.kind==='stadium'||b.kind==='arena'||b.kind==='amphitheater'){stadium(b,p);return;}
  if(b.kind==='practice-field'||b.kind==='garden'||b.kind==='pond'||b.kind==='grove'){practiceField(b,p);return;}
  hall(b,p);
}
function terrain(scene){
  const p=colors[mode],radius=Math.min(scene.radius,400);
  box(0,-.62,0,radius*2+80,1.2,radius*2+80,p.ground);
  for(let i=-4;i<=4;i++){
    box(i*36,-.005,0,2.7,.02,radius*2,p.path);
    box(0,-.003,i*36,radius*2,.02,2.7,p.path);
  }
  founderArea(p);
  // Repeatable original landscape using deterministic arithmetic, never user data.
  for(let i=0;i<120;i++){
    const x=(((i*83+17)%401)-200),z=(((i*137+79)%401)-200);
    if(Math.abs(x)<10||Math.abs(z)<10)continue;
    if(scene.buildings.some(b=>Math.abs(x-b.x)<b.halfWidth+6&&Math.abs(z-b.z)<b.halfDepth+6))continue;
    if(Math.abs(x%36)<5||Math.abs(z%36)<5)continue;
    drawTree(x,z,.7+(i%4)*.13);
  }
  scene.buildings.forEach(b=>{smallFacility(b,p);});
  signpost(-12,9);
}
function compile(type,src){
  const sh=gl.createShader(type);gl.shaderSource(sh,src);gl.compileShader(sh);
  if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));
  return sh;
}
const vertexSource=[
'#version 300 es','precision highp float;','in vec3 position;','in vec3 normal;','in vec3 color;',
'uniform mat4 projection;','uniform mat4 view;','out vec3 vNormal;','out vec3 vColor;','out float vDistance;',
'void main(){vec4 v=view*vec4(position,1.);vDistance=length(v.xyz);vNormal=normal;vColor=color;gl_Position=projection*v;}'
].join('\n');
const fragmentSource=[
'#version 300 es','precision highp float;','in vec3 vNormal;','in vec3 vColor;','in float vDistance;',
'uniform vec3 fogColor;','out vec4 frag;',
'void main(){float sun=max(dot(normalize(vNormal),normalize(vec3(-.34,.88,.4))),0.);',
'float light=.48+sun*.5;vec3 lit=vColor*light;',
'float fog=clamp((vDistance-65.)/240.,0.,.84);frag=vec4(mix(lit,fogColor,fog),1.);}'
].join('\n');
let gl=null,program=null,buffer=null,loc={},drawCount=0;
try{gl=canvas.getContext('webgl2',{antialias:true,alpha:false,depth:true,powerPreference:'default'});}catch{}
if(!gl){el('fallback').style.display='block';}
else{
  try{
    program=gl.createProgram();
    gl.attachShader(program,compile(gl.VERTEX_SHADER,vertexSource));
    gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragmentSource));
    gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    for(const name of ['projection','view','fogColor'])loc[name]=gl.getUniformLocation(program,name);
    buffer=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    const attrs=[['position',0],['normal',12],['color',24]];
    for(const [name,offset] of attrs){const n=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(n);gl.vertexAttribPointer(n,3,gl.FLOAT,false,36,offset);}
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
  }catch(error){gl=null;el('fallback').style.display='block';el('fallback').prepend(document.createTextNode('3D initialization failed. Your data is unchanged. '));}
}
function refreshScene(){
  scene=walkableScene(campusState(),goal,mode);packed=[];triangles=0;terrain(scene);
  if(gl){gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(packed),gl.STATIC_DRAW);drawCount=packed.length/9;}
  canvas.dataset.facilityCount=String(scene.buildings.length);
  canvas.dataset.mode=mode;
  canvas.dataset.geometryTriangles=String(triangles);
  el('world-name').textContent=mode==='franchise'?'Franchise World':mode==='symphony'?'Symphony World':'Sanctuary World';
  el('meta').textContent=scene.buildings.length+' owned facilities · '+(isDemo?'sample campus, not saved':'personal world, local only');
}
function perspective(fov,ratio,near,far){
 const f=1/Math.tan(fov/2), nf=1/(near-far);
 return new Float32Array([f/ratio,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0]);
}
const vector=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=x=>{const n=Math.hypot(...x)||1;return x.map(v=>v/n);};
function lookAt(eye,target){
 const z=norm(vector(eye,target)),x=norm(cross([0,1,0],z)),y=cross(z,x);
 return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);
}
function resize(){
 if(!gl)return;
 const dpr=Math.min(devicePixelRatio||1,1.75);
 const width=Math.max(1,Math.round(innerWidth*dpr)),height=Math.max(1,Math.round(innerHeight*dpr));
 if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;gl.viewport(0,0,width,height);}
}
function draw(){
 if(!gl)return;
 resize();const fog=hex(colors[mode].sky);
 gl.clearColor(...fog,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
 gl.useProgram(program);
 const eye=[player.x,player.y,player.z];
 const toward=[Math.sin(player.yaw)*Math.cos(player.pitch),Math.sin(player.pitch),-Math.cos(player.yaw)*Math.cos(player.pitch)];
 const target=eye.map((v,i)=>v+toward[i]);
 gl.uniformMatrix4fv(loc.projection,false,perspective(Math.PI/2.8,canvas.width/canvas.height,.08,760));
 gl.uniformMatrix4fv(loc.view,false,lookAt(eye,target));
 gl.uniform3f(loc.fogColor,...fog);
 gl.drawArrays(gl.TRIANGLES,0,drawCount);
 canvas.dataset.rendered=drawCount>0?'true':'false';
}
function inputs(){
 return {forward:(held.has('KeyW')||held.has('ArrowUp')||touch.has('forward')?1:0)-(held.has('KeyS')||held.has('ArrowDown')||touch.has('back')?1:0),
 strafe:(held.has('KeyD')||touch.has('strafe-right')?1:0)-(held.has('KeyA')||touch.has('strafe-left')?1:0),
 run:held.has('ShiftLeft')||held.has('ShiftRight')||touch.has('run')};
}
let previous=performance.now(),sampleTimer=0;
function tick(now){
 const dt=Math.min(.08,(now-previous)/1000||0);previous=now;
 if(running){
   player=updateExplorer(scene,player,inputs(),dt);
   sampleTimer+=dt;
   if(sampleTimer>.3){sampleTimer=0;const nearby=nearestFacility(scene,player.x,player.z,22);
     el('nearby').textContent=nearby?nearby.name:'Founders Ground';
     el('description').textContent=nearby?'Level '+nearby.level+' · '+nearby.distance+' meters away':'Walk toward a facility to discover it';
     canvas.dataset.playerX=player.x.toFixed(3);canvas.dataset.playerZ=player.z.toFixed(3);
   }
 }
 draw();
 requestAnimationFrame(tick);
}
function start(demo){
 isDemo=demo;refreshScene();player=spawnExplorer();canvas.dataset.playerX=player.x.toFixed(3);canvas.dataset.playerZ=player.z.toFixed(3);running=true;el('welcome').classList.add('hidden');el('hud').classList.remove('hidden');
 el('status').textContent=demo?'Preview only. No progress was changed.':'Your lifetime facilities are safe.';
}
el('enter').addEventListener('click',()=>start(false));
el('demo').addEventListener('click',()=>start(true));
el('reset').addEventListener('click',()=>{player=spawnExplorer();el('status').textContent='Back at Founders Ground.';});
el('pause').addEventListener('click',()=>{running=!running;el('pause').textContent=running?'Pause':'Resume';held.clear();touch.clear();});
addEventListener('keydown',event=>{
 if(['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight','ArrowUp','ArrowDown'].includes(event.code)){held.add(event.code);event.preventDefault();}
 if(event.code==='Escape'&&running){running=false;el('pause').textContent='Resume';held.clear();touch.clear();}
});
addEventListener('keyup',event=>held.delete(event.code));
addEventListener('blur',()=>{held.clear();touch.clear();dragging=false;});
canvas.addEventListener('pointerdown',event=>{if(!running)return;dragging=true;lookPointer=event.pointerId;lastX=event.clientX;lastY=event.clientY;canvas.setPointerCapture(event.pointerId);});
canvas.addEventListener('pointermove',event=>{
 if(!dragging||event.pointerId!==lookPointer||!running)return;
 player.yaw+=(event.clientX-lastX)*.005;player.pitch=clamp(player.pitch-(event.clientY-lastY)*.004,-1.3,1.3);
 lastX=event.clientX;lastY=event.clientY;
});
for(const eventName of ['pointerup','pointercancel'])canvas.addEventListener(eventName,event=>{if(event.pointerId===lookPointer){dragging=false;lookPointer=null;}});
document.querySelectorAll('[data-move]').forEach(btn=>{
 const name=btn.dataset.move;
 btn.addEventListener('pointerdown',event=>{touch.add(name);btn.setPointerCapture(event.pointerId);event.preventDefault();});
 for(const ev of ['pointerup','pointercancel','lostpointercapture'])btn.addEventListener(ev,()=>touch.delete(name));
});
addEventListener('resize',resize);
refreshScene();
if(gl)requestAnimationFrame(tick);
