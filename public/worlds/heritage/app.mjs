import {PAVLOPETRI_SCENE as scene,closestMarker,safePlayerPosition,buildHeritageDrawList} from './scene.mjs';
import {heritageTourFrame,HERITAGE_TOUR_SECONDS} from './tour.mjs';
const $=id=>document.getElementById(id),canvas=$('world');
const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:true,powerPreference:'high-performance'});
if(!gl){$('intro').classList.add('hidden');$('unsupported').classList.remove('hidden');}else run();
function run(){
const vs='#version 300 es\nprecision highp float;\nin vec3 aPosition;in vec3 aNormal;in vec3 aColor;\nuniform mat4 uProj,uView;out vec3 vColor;out vec3 vNormal;out float vDepth;out vec3 vWorld;\nvoid main(){vec4 v=uView*vec4(aPosition,1.);gl_Position=uProj*v;vDepth=-v.z;vColor=aColor;vNormal=aNormal;vWorld=aPosition;}';
const fs='#version 300 es\nprecision highp float;\nin vec3 vColor;in vec3 vNormal;in float vDepth;in vec3 vWorld;out vec4 frag;\nvoid main(){vec3 n=normalize(vNormal);float glow=max(dot(n,normalize(vec3(-.5,1.,.35))),0.);float light=.35+glow*.42+max(n.y,0.)*.15;float ripple=.028*sin(vWorld.x*.18+vWorld.z*.13)+.025*cos(vWorld.z*.22);vec3 lit=vColor*(light+ripple)+vec3(.012,.06,.065);float fog=clamp((vDepth-9.)/69.,0.,.97);vec3 c=mix(lit,vec3(.029,.15,.19),fog);frag=vec4(pow(c,vec3(.91)),1.);}';
function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vs));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
const attribs=['aPosition','aNormal','aColor'].map(n=>gl.getAttribLocation(program,n));
const uProj=gl.getUniformLocation(program,'uProj'),uView=gl.getUniformLocation(program,'uView');
const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);
const faces=[
{n:[0,0,1],v:[[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]]},
{n:[0,0,-1],v:[[.5,-.5,-.5],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5]]},
{n:[1,0,0],v:[[.5,-.5,.5],[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5]]},
{n:[-1,0,0],v:[[-.5,-.5,-.5],[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5]]},
{n:[0,1,0],v:[[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5],[-.5,.5,-.5]]},
{n:[0,-1,0],v:[[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5]]}];
function mesh(items){const vertices=[];for(const o of items){const c=rgb(o.color);for(const f of faces)for(const k of [0,1,2,0,2,3]){const p=f.v[k];vertices.push(o.x+p[0]*o.sx,o.y+p[1]*o.sy,o.z+p[2]*o.sz,...f.n,...c);}}
 const vao=gl.createVertexArray();gl.bindVertexArray(vao);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
 for(let i=0;i<3;i++){if(attribs[i]<0)throw Error('Missing vertex attribute');gl.enableVertexAttribArray(attribs[i]);gl.vertexAttribPointer(attribs[i],3,gl.FLOAT,false,36,i*12);}gl.bindVertexArray(null);return {vao,count:vertices.length/9};}
const drawList=buildHeritageDrawList(scene),base=mesh(drawList.filter(x=>x.tier!=='interpretive')),imagined=mesh(drawList.filter(x=>x.tier==='interpretive'));
gl.enable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.clearColor(.024,.101,.139,1);
const norm=v=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l)},cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
function lookAt(eye,target){const z=norm([eye[0]-target[0],eye[1]-target[1],eye[2]-target[2]]),x=norm(cross([0,1,0],z)),y=cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);}
function perspective(fov,aspect,near,far){const f=1/Math.tan(fov/2),v=1/(near-far);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*v,-1,0,0,2*far*near*v,0]);}
let running=false,interpretive=false,x=0,z=17,yaw=0,pitch=-.13,last=performance.now(),lastMarker=null,lastDist=Infinity,lookPointer=null,joyPointer=null,dragX=0,dragY=0;
let move={x:0,y:0},tourActive=false,tourElapsed=0;const keys=new Set(),joy=$('joystick');
// Read-only QA snapshot restricted to loopback test servers, never the public release.
if(['127.0.0.1','localhost'].includes(location.hostname)){
 Object.defineProperty(window,'__evercraftHeritageQA',{value:()=>({
  running,tourActive,x,z,yaw,pitch,keys:[...keys],frameTime:last,
  focused:document.activeElement?.id||null
 }),configurable:false});
}
function resize(){const dpr=Math.min(devicePixelRatio||1,matchMedia('(max-width:690px)').matches?1.1:1.5);const w=Math.max(1,Math.round(canvas.clientWidth*dpr)),h=Math.max(1,Math.round(canvas.clientHeight*dpr));if(w!==canvas.width||h!==canvas.height){canvas.width=w;canvas.height=h;}gl.viewport(0,0,canvas.width,canvas.height);}
function enterWorld(){running=true;$('intro').classList.add('hidden');$('hud').classList.remove('hidden');last=performance.now();}
function stopTour(){
 if(!tourActive)return;
 tourActive=false;
 // Restore keyboard control to the scene after the guided camera releases it.
 if(running&&document.activeElement!==canvas)canvas.focus({preventScroll:true});
 $('tour').setAttribute('aria-pressed','false');
 $('tour').textContent='▶ Guided walk · 60s';
 $('tourprogress').classList.add('hidden');
}
function startTour(){
 enterWorld();tourActive=true;tourElapsed=0;
 const shot=heritageTourFrame(0,scene);
 x=shot.x;z=shot.z;yaw=shot.yaw;pitch=shot.pitch;
 $('tour').setAttribute('aria-pressed','true');
 $('tour').textContent='■ Stop guided walk';
 $('tourprogress').classList.remove('hidden');
 $('tourchapter').textContent=shot.markerTitle+' · 60s remaining';
 $('tourfill').style.transform='scaleX(0)';
 $('location').textContent=shot.markerTitle;
 $('distance').textContent=shot.evidenceBoundary;
}
function toggle(){interpretive=!interpretive;$('toggle').setAttribute('aria-pressed',String(interpretive));$('toggle').textContent=interpretive?'◧ Hide imagined upper walls':'◧ Show imagined upper walls';$('distance').textContent=interpretive?'Blue upper walls are an artistic interpretation.':'Showing one-course foundation-style masonry in a schematic layout.';}
function openPanel(title,body,sources){$('panel-title').textContent=title;$('panel-copy').textContent=body;const box=$('sources');box.replaceChildren();const label=document.createElement('div');label.className='detail-label';label.textContent='Research sources';box.append(label);sources.forEach((s,i)=>{const a=document.createElement('a');a.href=s;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Open archaeology reference '+(i+1)+' ↗';box.append(a)});$('panel').classList.remove('hidden');}
function inspect(){stopTour();const m=closestMarker(x,z,scene).marker;if(m)openPanel(m.title,m.body,[scene.sources[m.source]]);}
function guide(){stopTour();openPanel('What is real? What is imagined?','Pavlopetri is a confirmed submerged prehistoric settlement. Researchers mapped actual building foundations, streets, courtyards and walls. This walkable arrangement is made from original illustrative shapes, with no copied survey data, no exact archaeological positions, and no claimed digital-twin accuracy. Any blue upper walls are hypothetical. UNESCO guidance favors preserving underwater heritage in place.',scene.sources);}
$('toggle').addEventListener('click',toggle);$('tour').addEventListener('click',()=>tourActive?stopTour():startTour());$('inspect').addEventListener('click',inspect);$('guide').addEventListener('click',guide);$('close').addEventListener('click',()=>$('panel').classList.add('hidden'));
$('start').addEventListener('click',enterWorld);$('start-tour').addEventListener('click',startTour);
window.addEventListener('keydown',e=>{if(e.key==='Escape'){$('panel').classList.add('hidden');return;}if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();keys.add(e.key.toLowerCase());if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(e.key.toLowerCase()))stopTour();if(!running||e.repeat)return;if(e.key.toLowerCase()==='e')inspect();if(e.key.toLowerCase()==='r')toggle();});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>{keys.clear();move={x:0,y:0};});
canvas.addEventListener('pointerdown',e=>{if(!running||e.pointerType==='touch'&&e.clientX<innerWidth*.40)return;stopTour();lookPointer=e.pointerId;dragX=e.clientX;dragY=e.clientY;canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!running||lookPointer!==e.pointerId)return;const dx=e.clientX-dragX,dy=e.clientY-dragY;yaw+=Math.max(-55,Math.min(55,dx))*.005;pitch=Math.max(-1,Math.min(1,pitch-Math.max(-55,Math.min(55,dy))*.004));dragX=e.clientX;dragY=e.clientY;});
for(const evt of ['pointerup','pointercancel'])canvas.addEventListener(evt,e=>{if(lookPointer===e.pointerId)lookPointer=null;});
function setJoy(e){const r=joy.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),d=Math.max(1,Math.hypot(dx,dy)),m=Math.min(36,d);move={x:dx/d*m/36,y:dy/d*m/36};joy.style.setProperty('--joy-x',move.x*36+'px');joy.style.setProperty('--joy-y',move.y*36+'px');}
function resetJoy(){joyPointer=null;move={x:0,y:0};joy.style.setProperty('--joy-x','0px');joy.style.setProperty('--joy-y','0px');}
joy.addEventListener('pointerdown',e=>{stopTour();joyPointer=e.pointerId;joy.setPointerCapture(e.pointerId);setJoy(e);});joy.addEventListener('pointermove',e=>{if(joyPointer===e.pointerId)setJoy(e);});joy.addEventListener('pointerup',resetJoy);joy.addEventListener('pointercancel',resetJoy);
function frame(now){
const dt=Math.min(.05,(now-last)/1000||0);last=now;
if(running&&$('panel').classList.contains('hidden')){
 if(tourActive){
  tourElapsed=Math.min(HERITAGE_TOUR_SECONDS,tourElapsed+dt);
  const shot=heritageTourFrame(tourElapsed,scene);
  x=shot.x;z=shot.z;yaw=shot.y;pitch=shot.pitch;
  $('location').textContent=shot.markerTitle;
  $('distance').textContent=shot.evidenceBoundary;
  $('tourchapter').textContent=shot.markerTitle+' · '+Math.ceil(HERITAGE_TOUR_SECONDS-shot.elapsed)+'s remaining';
  $('tourfill').style.transform='scaleX('+shot.progress+')';
  if(shot.finished)stopTour();
 }else{
 const forward=Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown'))-move.y,side=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'))+move.x;
 const l=Math.max(1,Math.hypot(forward,side)),speed=keys.has('shift')?7.5:4.4;
 const next=safePlayerPosition(x+(Math.sin(yaw)*forward+Math.cos(yaw)*side)*speed*dt/l,z+(-Math.cos(yaw)*forward+Math.sin(yaw)*side)*speed*dt/l);x=next.x;z=next.z;
 const found=closestMarker(x,z,scene);if(found.marker&&(found.marker.id!==lastMarker||Math.abs(found.distance-lastDist)>2)){
 lastMarker=found.marker.id;lastDist=found.distance;$('location').textContent=found.marker.title;$('distance').textContent='Nearby research marker · '+Math.round(found.distance)+' schematic units away. Press E or tap Inspect.';}
 }
}
resize();gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(program);
const dir=[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)],eye=[x,1.65,z],target=eye.map((v,i)=>v+dir[i]);
gl.uniformMatrix4fv(uView,false,lookAt(eye,target));gl.uniformMatrix4fv(uProj,false,perspective(Math.PI/3,canvas.width/canvas.height,.12,180));
gl.bindVertexArray(base.vao);gl.drawArrays(gl.TRIANGLES,0,base.count);if(interpretive){gl.bindVertexArray(imagined.vao);gl.drawArrays(gl.TRIANGLES,0,imagined.count);}gl.bindVertexArray(null);requestAnimationFrame(frame);
}
window.addEventListener('resize',resize);resize();requestAnimationFrame(frame);
}