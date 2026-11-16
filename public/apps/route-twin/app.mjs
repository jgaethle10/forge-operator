import { CORRIDOR, SCENARIOS, simulateRoute } from './route-core.mjs';

const $ = (selector) => document.querySelector(selector);
const scene = $('#scene');
const gl = scene.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'low-power' });
const els = {
 scenario: $('#scenario'), departure: $('#departure'), height: $('#height'),
 weight: $('#weight'), progress: $('#progress'), play: $('#play'),
 camera: $('#camera'), reset: $('#reset'), legs: $('#legs'),
 eta: $('#eta'), risks: $('#risks'), disposition: $('#disposition'),
 context: $('#context'), currentLeg: $('#current-leg'), mileLabel: $('#mile-label'),
 export: $('#export'),
};
let state = { current: simulateRoute(), progress: 0, playing: false, following: false,
 yaw: -1.06, pitch: 0.79, distance: 24, lastFrame: null };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const stops = CORRIDOR.stops;
const riskColors = {
 illustrative: [0.18,0.72,0.62], caution: [0.96,0.66,0.25],
 blocked: [0.95,0.29,0.30], unassessed: [0.36,0.41,0.48]
};
function terrainY(x,z) {
 const dx=(x-0.7)/5.5, dz=(z-1.5)/5.5;
 return .04 + 1.36*Math.exp(-(dx*dx+dz*dz))*(.35+.42*Math.sin(x*.95)**2)
       + .13*Math.sin(x*.6)*Math.cos(z*.45);
}
function positionAt(t) {
 const f=clamp(t,0,1)*4, i=Math.min(3,Math.floor(f)), a=stops[i],b=stops[i+1];
 const u=clamp(f-i,0,1),x=a.x+(b.x-a.x)*u,z=a.z+(b.z-a.z)*u;
 return {x,z,y:terrainY(x,z)+.36,theta:Math.atan2(b.z-a.z,b.x-a.x),leg:i};
}
const cappedProgress=() => state.current.blocked ? .25 : 1;
const setProgress=(p)=>{
 state.progress=clamp(p,0,cappedProgress());
 els.progress.value=Math.round(state.progress*1000);
};
function repaintSummary(){
 const r=state.current;
 els.eta.textContent=r.blocked?'NO-GO':r.travelHours.toFixed(1)+' h';
 els.risks.textContent=r.highRiskCount+' / 4';
 els.disposition.textContent=r.blocked?'STOP / REPLAN':'REHEARSAL ONLY';
 els.departure.previousElementSibling.querySelector('.readout').textContent=String(+els.departure.value).padStart(2,'0')+':00';
 els.legs.replaceChildren();
 for(const leg of r.legs) {
  const card=document.createElement('div');card.className='leg';
  const dot=document.createElement('i');dot.className='dot '+leg.status;
  const body=document.createElement('div');
  const heading=document.createElement('b');heading.textContent=leg.name;
  const note=document.createElement('small');
  note.textContent=leg.hazard || (leg.status==='unassessed'?'Not evaluated after stop':'Illustrative distance '+leg.miles+' mi; no real-world condition verified');
  body.append(heading,note);card.append(dot,body);els.legs.append(card);
 }
 repaintHUD();
}
function repaintHUD(){
 const p=positionAt(state.progress);
 const l=state.current.legs[p.leg];
 els.currentLeg.textContent=l.name;
 els.context.textContent=l.hazard || SCENARIOS[state.current.scenario].description + '. Not a live feed.';
 els.mileLabel.textContent=Math.round(state.progress*100)+'% of schematic route';
}
function recalc(){
 try {
  const r=simulateRoute({
   scenario:els.scenario.value,
   departureHour:Number(els.departure.value),
   truck:{heightFt:Number(els.height.value),grossWeightLb:Number(els.weight.value)}
  });
  state.current=r; state.playing=false;els.play.textContent='▶ Play rehearsal';
  setProgress(state.progress);repaintSummary();if(gl) rebuildScene();
  els.export.disabled=false;els.export.title='';
 } catch(err) {
  state.playing=false;els.play.textContent='▶ Play rehearsal';
  els.export.disabled=true;els.export.title='Correct invalid truck inputs';
  els.disposition.textContent='INVALID INPUT';
  els.context.textContent=err.message;
 }
}
for(const e of [els.scenario,els.departure,els.height,els.weight])
 e.addEventListener('input',recalc);
els.progress.addEventListener('input',()=>{state.playing=false;els.play.textContent='▶ Play rehearsal';setProgress(Number(els.progress.value)/1000);repaintHUD()});
els.play.addEventListener('click',()=>{
 if(state.progress>=cappedProgress()) setProgress(0);
 state.playing=!state.playing;els.play.textContent=state.playing?'❚❚ Pause':'▶ Play rehearsal';
});
els.reset.addEventListener('click',()=>{state.playing=false;setProgress(0);repaintHUD();els.play.textContent='▶ Play rehearsal'});
els.camera.addEventListener('click',()=>{state.following=!state.following;els.camera.textContent='View: '+(state.following?'truck':'orbit')});
window.addEventListener('keydown',(e)=>{
 if(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement||e.target instanceof HTMLButtonElement) return;
 if(e.code==='ArrowRight'||e.code==='ArrowLeft') {e.preventDefault();state.playing=false;setProgress(state.progress+(e.code==='ArrowRight'?.012:-.012));repaintHUD();}
 if(e.code==='Space'){e.preventDefault();els.play.click()}
});
els.export.addEventListener('click',()=>{
 const json=JSON.stringify({...state.current,rehearsalProgress:state.progress,exportedAt:new Date().toISOString()},null,2);
 const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download='evercraft-routetwin-synthetic-rehearsal.json';a.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
});
// A fully owned procedural WebGL2 rendering path; no provider tiles or remote scripts.
const VERT=`#version 300 es
in vec3 aPosition; in vec3 aColor;
uniform mat4 uProjection; uniform mat4 uView; uniform vec3 uOffset;
out vec3 vColor;
void main(){vColor=aColor;gl_Position=uProjection*uView*vec4(aPosition+uOffset,1.0);}`;
const FRAG=`#version 300 es
precision mediump float; in vec3 vColor; out vec4 pixel;
void main(){pixel=vec4(vColor,1.0);}`;
let program, attrPosition, attrColor, uProjection, uView, uOffset, terrainBuffer, roadBuffer, markerBuffer, truckBuffer;
let terrainCount=0,roadCount=0,markerCount=0,truckCount=0;
function shader(type,source) {
 const sh=gl.createShader(type);gl.shaderSource(sh,source);gl.compileShader(sh);
 if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
 return sh;
}
function vertices(arr,pts,color) {for(const p of pts) arr.push(p[0],p[1],p[2],...color)}
function triangle(arr,a,b,c,color) {vertices(arr,[a,b,c],color)}
function quad(arr,a,b,c,d,color) {triangle(arr,a,b,c,color);triangle(arr,a,c,d,color)}
function box(arr,x,y,z,wx,wy,wz,color) {
 const a=[x-wx/2,y,z-wz/2],b=[x+wx/2,y,z-wz/2],
 c=[x+wx/2,y,z+wz/2],d=[x-wx/2,y,z+wz/2],
 e=[a[0],y+wy,a[2]],f=[b[0],y+wy,b[2]],
 g=[c[0],y+wy,c[2]],h=[d[0],y+wy,d[2]];
 quad(arr,a,b,c,d,color.map(v=>v*.57));
 quad(arr,e,h,g,f,color);
 quad(arr,a,e,f,b,color.map(v=>v*.82));
 quad(arr,b,f,g,c,color.map(v=>v*.71));
 quad(arr,c,g,h,d,color.map(v=>v*.9));
 quad(arr,d,h,e,a,color.map(v=>v*.73));
}
function buildTerrain(){
 const arr=[], step=.8;
 for(let x=-17;x<17;x+=step)for(let z=-15;z<15;z+=step){
  const h=terrainY(x,z),v=clamp(h/1.3,0,1);
  const color=[.085+.11*v,.27+.13*v,.21+.04*v];
  const a=[x,h,z],b=[x+step,terrainY(x+step,z),z],
        c=[x+step,terrainY(x+step,z+step),z+step],d=[x,terrainY(x,z+step),z+step];
  quad(arr,a,b,c,d,color);
 }
 return arr;
}
function buildRoad(){
 const arr=[];
 for(let i=0;i<4;i++){
  const a=stops[i], b=stops[i+1],stateColor=riskColors[state.current.legs[i].status];
  const dx=b.x-a.x,dz=b.z-a.z,L=Math.hypot(dx,dz), nx=-dz/L,nz=dx/L;
  for(let j=0;j<25;j++){
   const t0=j/25,t1=(j+1)/25;
   const x0=a.x+t0*dx,z0=a.z+t0*dz,x1=a.x+t1*dx,z1=a.z+t1*dz;
   const h0=terrainY(x0,z0)+.07,h1=terrainY(x1,z1)+.07;
   const left0=[x0+nx*.27,h0,z0+nz*.27],right0=[x0-nx*.27,h0,z0-nz*.27],
     left1=[x1+nx*.27,h1,z1+nz*.27],right1=[x1-nx*.27,h1,z1-nz*.27];
   quad(arr,left0,left1,right1,right0,[.12,.17,.21]);
   // Colored shoulder encodes scenario, not verified hazards.
   quad(arr,[x0+nx*.34,h0+.02,z0+nz*.34],[x1+nx*.34,h1+.02,z1+nz*.34],
    [x1+nx*.28,h1+.02,z1+nz*.28],[x0+nx*.28,h0+.02,z0+nz*.28],stateColor);
   if(j%3!==1) quad(arr,
    [x0+nx*.026,h0+.026,z0+nz*.026],[x1+nx*.026,h1+.026,z1+nz*.026],
    [x1-nx*.026,h1+.026,z1-nz*.026],[x0-nx*.026,h0+.026,z0-nz*.026],[.95,.76,.33]);
  }
 }
 return arr;
}
function buildMarkers(){
 const arr=[];
 for(let i=0;i<stops.length;i++) {
  const s=stops[i],y=terrainY(s.x,s.z);
  box(arr,s.x,y+.02,s.z,.24,1.25,.24,[.91,.72,.37]);
  box(arr,s.x,y+1.23,s.z,.48,.15,.48,[1,.87,.62]);
 }
 // Abstract geography cues, not surveyed buildings.
 for(const base of [stops[0],stops[4]]){
  for(let k=0;k<7;k++){
   const x=base.x+Math.sin(k*2.8)*(.7+k*.15),z=base.z+Math.cos(k*1.7)*(.6+k*.15);
   box(arr,x,terrainY(x,z),z,.5,.3+(k%4)*.45,.5,[.25,.41,.50]);
  }
 }
 return arr;
}
function buildTruck(){
 const arr=[];
 box(arr,0,.0,0,.82,.33,.35,[.96,.40,.22]);
 box(arr,.24,.29,0,.29,.31,.34,[1,.78,.39]);
 box(arr,-.25,.31,0,.53,.23,.32,[.76,.83,.87]);
 for(const x of [-.26,.26])for(const z of [-.24,.24]) box(arr,x,-.12,z,.17,.21,.13,[.09,.10,.14]);
 return arr;
}
function upload(arr,existing){
 const buffer=existing||gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
 gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(arr),existing===truckBuffer?gl.DYNAMIC_DRAW:gl.STATIC_DRAW);
 return buffer;
}
function rebuildScene(){
 roadBuffer=upload(buildRoad(),roadBuffer);
 roadCount=Math.floor(gl.getBufferParameter(gl.ARRAY_BUFFER,gl.BUFFER_SIZE)/24);
}
function draw(buffer,count,offset=[0,0,0]){
 if(!buffer||!count)return;
 gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
 gl.vertexAttribPointer(attrPosition,3,gl.FLOAT,false,24,0);
 gl.vertexAttribPointer(attrColor,3,gl.FLOAT,false,24,12);
 gl.uniform3fv(uOffset,offset);
 gl.drawArrays(gl.TRIANGLES,0,count);
}
function normalize(v){const l=Math.hypot(...v)||1;return v.map(n=>n/l)}
function cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}
function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]}
function lookAt(eye,at) {
 const z=normalize(eye.map((v,i)=>v-at[i])),x=normalize(cross([0,1,0],z)),y=cross(z,x);
 return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);
}
function perspective(aspect) {
 const f=1/Math.tan(Math.PI/6), n=.1,F=150;
 return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(F+n)/(n-F),-1,0,0,2*F*n/(n-F),0]);
}
function render(){
 if(!gl)return;
 const w=Math.max(1,Math.floor(scene.clientWidth*Math.min(devicePixelRatio||1,1.7)));
 const h=Math.max(1,Math.floor(scene.clientHeight*Math.min(devicePixelRatio||1,1.7)));
 if(scene.width!==w||scene.height!==h){scene.width=w;scene.height=h;gl.viewport(0,0,w,h)}
 const p=positionAt(state.progress),look=state.following?[p.x,p.y,p.z]:[0,.2,1.6];
 const dist=state.following?Math.min(10,state.distance*.48):state.distance;
 const eye=[look[0]+Math.cos(state.yaw)*Math.cos(state.pitch)*dist,
            look[1]+Math.sin(state.pitch)*dist,look[2]+Math.sin(state.yaw)*Math.cos(state.pitch)*dist];
 gl.clearColor(.035,.075,.11,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
 gl.useProgram(program);
 gl.uniformMatrix4fv(uProjection,false,perspective(w/h));
 gl.uniformMatrix4fv(uView,false,lookAt(eye,look));
 draw(terrainBuffer,terrainCount);
 draw(roadBuffer,roadCount);
 draw(markerBuffer,markerCount);
 draw(truckBuffer,truckCount,[p.x,p.y,p.z]);
}
function initGL(){
 try{
  program=gl.createProgram();
  gl.attachShader(program,shader(gl.VERTEX_SHADER,VERT));
  gl.attachShader(program,shader(gl.FRAGMENT_SHADER,FRAG));gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  attrPosition=gl.getAttribLocation(program,'aPosition');
  attrColor=gl.getAttribLocation(program,'aColor');
  uProjection=gl.getUniformLocation(program,'uProjection');
  uView=gl.getUniformLocation(program,'uView');
  uOffset=gl.getUniformLocation(program,'uOffset');
  gl.enableVertexAttribArray(attrPosition);gl.enableVertexAttribArray(attrColor);
  gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);
  terrainBuffer=upload(buildTerrain());terrainCount=gl.getBufferParameter(gl.ARRAY_BUFFER,gl.BUFFER_SIZE)/24;
  markerBuffer=upload(buildMarkers());markerCount=gl.getBufferParameter(gl.ARRAY_BUFFER,gl.BUFFER_SIZE)/24;
  truckBuffer=upload(buildTruck());truckCount=gl.getBufferParameter(gl.ARRAY_BUFFER,gl.BUFFER_SIZE)/24;
  rebuildScene();
 } catch(err) {$('#webgl-error').style.display='grid';$('#webgl-error').textContent='3D renderer failed: '+err.message;return false}
 return true;
}
let dragging=false,px=0,py=0;
scene.addEventListener('pointerdown',e=>{dragging=true;px=e.clientX;py=e.clientY;scene.setPointerCapture(e.pointerId)});
scene.addEventListener('pointerup',()=>{dragging=false});
scene.addEventListener('pointercancel',()=>{dragging=false});
scene.addEventListener('pointermove',e=>{if(!dragging)return;
 state.yaw+=(e.clientX-px)*.008;
 state.pitch=clamp(state.pitch+(e.clientY-py)*.006,.16,1.33);
 px=e.clientX;py=e.clientY;
});
scene.addEventListener('wheel',e=>{e.preventDefault();state.distance=clamp(state.distance+e.deltaY*.025,4,52)},{passive:false});
repaintSummary();
if(!gl){$('#webgl-error').style.display='grid'}else if(initGL()){
 requestAnimationFrame(function tick(ms){
  const dt=state.lastFrame===null?0:Math.min(.1,(ms-state.lastFrame)/1000);
  state.lastFrame=ms;
  if(state.playing){
   setProgress(state.progress+dt*.035);
   if(state.progress>=cappedProgress()){state.playing=false;els.play.textContent='▶ Play rehearsal'}
   repaintHUD();
  }
  render();requestAnimationFrame(tick);
 });
}
