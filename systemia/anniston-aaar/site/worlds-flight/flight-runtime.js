/* Anniston Flight Range v0.5. Native WebGL2 scenery and keyboard/touch controller.
 * Synthetic valley world / gameplay math; no authoritative World Engine claims.
 */
(() => {'use strict';
const $=id=>document.getElementById(id);
const core=window.AAARFlight;
const THREE_NEEDED='WebGL2 is unavailable in this browser. Open in a WebGL2-capable browser or device.';
let state=core.start('trainer'),running=false,view='chase',mode='mission',last=0,frames=0,lastHUD=0,lastDraw=0,alertUntil=0;
const held=new Set(),touch=new Set();
const shell=$('flightShell'),canvas=$('flightCanvas');
const opts={alpha:true,antialias:false,depth:true,powerPreference:'low-power',preserveDrawingBuffer:false};
const gl=canvas.getContext('webgl2',opts);
let program=null,meshes={},uVP,uModel,uFog,aPos,aCol;
const identity=()=>[1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
function mul(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let v=0;for(let k=0;k<4;k++)v+=a[k*4+r]*b[c*4+k];o[c*4+r]=v;}return o;}
function perspective(fov,aspect,near,far){const f=1/Math.tan(fov/2),nf=1/(near-far);return [f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0];}
function sub(a,b){return a.map((x,i)=>x-b[i]);}function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function norm(a){const n=Math.hypot(...a)||1;return a.map(x=>x/n);}
function lookAt(eye,center,up){const z=norm(sub(eye,center)),x=norm(cross(up,z)),y=cross(z,x);return [x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1];}
function shader(kind,source){const s=gl.createShader(kind);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
function initGL(){
 if(!gl)throw Error(THREE_NEEDED);
 const vs=shader(gl.VERTEX_SHADER,`#version 300 es\nin vec3 aPos; in vec3 aColor; uniform mat4 uVP;uniform mat4 uModel;out vec3 vColor;out float vDepth;void main(){vec4 p=uModel*vec4(aPos,1.0);gl_Position=uVP*p;vColor=aColor;vDepth=gl_Position.w;}`);
 const fs=shader(gl.FRAGMENT_SHADER,`#version 300 es\nprecision mediump float;in vec3 vColor;in float vDepth;uniform vec3 uFog;out vec4 frag;void main(){float f=smoothstep(1400.0,7900.0,vDepth);frag=vec4(mix(vColor,uFog,f),1.0);}`);
 program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
 if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
 gl.useProgram(program);uVP=gl.getUniformLocation(program,'uVP');uModel=gl.getUniformLocation(program,'uModel');uFog=gl.getUniformLocation(program,'uFog');aPos=gl.getAttribLocation(program,'aPos');aCol=gl.getAttribLocation(program,'aColor');
 gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);
 gl.uniform3fv(uFog,new Float32Array([.72,.80,.76]));buildMeshes();
}
function builder(){const verts=[];function tri(a,b,c,color){for(const v of [a,b,c])verts.push(v[0],v[1],v[2],...color);}function quad(a,b,c,d,color){tri(a,b,c,color);tri(a,c,d,color);}function box(x,y,z,wx,wy,wz,color){const A=[x-wx/2,y-wy/2,z-wz/2],B=[x+wx/2,y-wy/2,z-wz/2],C=[x+wx/2,y+wy/2,z-wz/2],D=[x-wx/2,y+wy/2,z-wz/2],E=[x-wx/2,y-wy/2,z+wz/2],F=[x+wx/2,y-wy/2,z+wz/2],G=[x+wx/2,y+wy/2,z+wz/2],H=[x-wx/2,y+wy/2,z+wz/2];quad(A,B,C,D,color);quad(E,H,G,F,color);quad(D,C,G,H,color.map(x=>x*.85));quad(A,E,F,B,color.map(x=>x*.7));quad(B,F,G,C,color.map(x=>x*.9));quad(A,D,H,E,color.map(x=>x*.78));}
function cone(x,y,z,r,h,color){const sides=7;for(let i=0;i<sides;i++){let t=i*2*Math.PI/sides,n=(i+1)*2*Math.PI/sides;tri([x+r*Math.cos(t),y,z+r*Math.sin(t)],[x,y+h,z],[x+r*Math.cos(n),y,z+r*Math.sin(n)],color.map(x=>x*(.83+.17*i/sides)));}}
function upload(){const v=new Float32Array(verts),b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,v,gl.STATIC_DRAW);return{buffer:b,count:v.length/6};}
return {tri,quad,box,cone,upload};}
function drawMesh(mesh,model){gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);gl.enableVertexAttribArray(aPos);gl.vertexAttribPointer(aPos,3,gl.FLOAT,false,24,0);gl.enableVertexAttribArray(aCol);gl.vertexAttribPointer(aCol,3,gl.FLOAT,false,24,12);gl.uniformMatrix4fv(uModel,false,model);gl.drawArrays(gl.TRIANGLES,0,mesh.count);}
function buildMeshes(){
 const w=builder(),rad=core.constants.RAD,terrain=core.groundHeight;
 const cells=125,min=-6500,span=13000;
 for(let iz=0;iz<cells;iz++)for(let ix=0;ix<cells;ix++){
  const x=min+span*ix/cells,z=min+span*iz/cells,dx=span/cells,dz=dx;
  const a=[x,terrain(x,z),z],b=[x+dx,terrain(x+dx,z),z],c=[x+dx,terrain(x+dx,z+dz),z+dz],d=[x,terrain(x,z+dz),z+dz];
  const avg=(a[1]+b[1]+c[1]+d[1])/4,water=Math.hypot((x+1250)/1000,(z-1450)/850)<1;
  const v=(Math.sin(x*.014+z*.009)*.5+.5),color=water?[.15,.43,.50]:avg>270?[.48,.53,.48]:avg>110?[.31+.06*v,.46+.03*v,.37]:[.28+.08*v,.40+.08*v,.31+.025*v];
  w.quad(a,b,c,d,color);
 }
 // Airport: deliberately flat and drawn above synthetic terrain near the center.
 w.quad([-46,8,-940],[46,8,-940],[46,8,980],[-46,8,980],[.14,.19,.22]);
 w.quad([-51,7,-955],[-46,7,-955],[-46,7,995],[-51,7,995],[.78,.73,.60]);
 w.quad([46,7,-955],[51,7,-955],[51,7,995],[46,7,995],[.78,.73,.60]);
 for(let z=-875;z<980;z+=118){w.quad([-3,8.4,z], [3,8.4,z],[3,8.4,z+53],[-3,8.4,z+53],[.94,.88,.63]);}
 for(let z of [-800,850])for(let i=0;i<4;i++)w.quad([-34+18*i,8.5,z],[-26+18*i,8.5,z],[-26+18*i,8.5,z+32],[-34+18*i,8.5,z+32],[.86,.85,.78]);
 for(let j=0;j<6;j++){w.box(140+j*55,28,-620+j*84,34,42,54,[.55,.64,.64]);w.box(140+j*55,52,-620+j*84,37,5,57,[.27,.35,.39]);}
 // Small observation buildings and hangars.
 for(let j=0;j<4;j++){w.box(-225-j*75,24,-360+j*175,60,34,50,[.72,.69,.58]);w.box(-225-j*75,43,-360+j*175,67,8,60,[.36,.39,.37]);}
 let seed=501;const rnd=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
 for(let i=0;i<360;i++){const x=(rnd()-.5)*12000,z=(rnd()-.5)*12000;if(Math.abs(x)<360&&Math.abs(z)<1200)continue;if(terrain(x,z)>260)continue;const h=12+rnd()*30,y=terrain(x,z);w.box(x,y+h*.12,z,2.1,h*.24,2.1,[.35,.34,.25]);w.cone(x,y+h*.23,z,7+rnd()*6,h,[.13+rnd()*.07,.31+rnd()*.12,.24]);}
 // Flight gate rings: original synthetic geometry rather than flight-path authority.
 for(let i=0;i<core.gates.length;i++){
  const g=core.gates[i],r=52,inner=r-4,col=i===0?[1,.64,.37]:[.60,.97,.80];
  for(let s=0;s<64;s++){const a=s*Math.PI/32,b=(s+1)*Math.PI/32;
   w.quad([g.x+r*Math.cos(a),g.y+r*Math.sin(a),g.z], [g.x+r*Math.cos(b),g.y+r*Math.sin(b),g.z],[g.x+inner*Math.cos(b),g.y+inner*Math.sin(b),g.z],[g.x+inner*Math.cos(a),g.y+inner*Math.sin(a),g.z],col);
  }
 }
 meshes.world=w.upload();
 for(const craft of Object.values(core.aircraft)){
  const p=builder(),isJet=craft.id==='jet',isGlider=craft.id==='glider',wing=isGlider?18:isJet?11:13;
  const body=isJet?[.72,.73,.73]:isGlider?[.78,.91,.95]:[.92,.92,.86],accent=isJet?[.95,.60,.29]:[.95,.55,.32];
  p.box(0,0,0,1.9,1.85,isGlider?18:17,body);
  p.tri([0,.2,11],[-.9,-.7,7],[.9,-.7,7],body);
  p.box(0,.16,1.3,wing*2,.35,isJet?3.7:3.1,body);
  p.box(0,.3,-7,wing*.9,.25,2.3,body);
  p.tri([0,4.6,-8],[0,0,-9],[0,.35,-4],[.71,.78,.81]);
  p.box(0,1.23,2,1.25,.75,3.7,[.19,.42,.57]);
  p.box(-wing+1,.2,1.3,2.2,.31,3.2,accent);
  p.box(wing-1,.2,1.3,2.2,.31,3.2,accent);
  if(isJet){p.box(-.95,-.5,-8,.5,.7,3,[.26,.34,.36]);p.box(.95,-.5,-8,.5,.7,3,[.26,.34,.36]);}
  else p.box(0,0,10,.35,4,.35,[.27,.35,.38]);
  meshes[craft.id]=p.upload();
 }
}
function buildCustomMesh(design){
 if(!gl||!program)return;
 const d=window.AAARFoundry.validate(design),p=builder();
 const body=[.86,.91,.88],accent=[.96,.60,.38];
 const scale=Math.min(2.2,Math.max(.32,17/Math.max(d.spanM,d.bodyLengthM)));
 const length=d.bodyLengthM*scale, width=Math.max(.6,d.bodyWidthM*scale);
 p.box(0,0,0,width,Math.max(.35,width*.45),length,body);
 p.box(0,.25,Math.min(length*.18,2),width*.56,.4,length*.38,[.21,.44,.55]);
 if(d.type==='wing'){
   const wing=d.spanM*scale/2,chord=d.chordM*scale,sw=Math.tan(d.sweepDeg*Math.PI/180)*wing*.36;
   for(const sign of [-1,1]){
     const a=[sign*width*.45,.1,-chord*.5],b=[sign*wing,.1,-chord*.5+sw],c=[sign*wing,.1,chord*.5+sw],e=[sign*width*.45,.1,chord*.5];
     p.quad(a,b,c,e,body);
   }
   const tail=Math.min(wing*.5,Math.sqrt(d.tailAreaM2)*scale*.5);
   if(tail>.04)p.box(0,.15,-length*.39,Math.max(.1,tail*2),.16,.65,[.68,.82,.83]);
   if(d.tailAreaM2>.3)p.tri([0,Math.max(.7,length*.16),-length*.48],[0,0,-length*.50],[0,0,-length*.23],accent);
 }else{
   const radius=Math.max(.5,d.rotorRadiusM*scale*1.5),ring=Math.max(width*1.1,d.rotorRadiusM*scale*2.3);
   for(let i=0;i<d.rotors;i++){
    const theta=2*Math.PI*i/d.rotors+Math.PI/4,x=Math.cos(theta)*ring,z=Math.sin(theta)*ring;
    p.box(x/2,.05,z/2,Math.abs(x)+.4,.16,.15,[.53,.79,.78]);
    for(let a=0;a<12;a++){const u=a*Math.PI/6,v=(a+1)*Math.PI/6;
      p.tri([x,.22,z],[x+radius*Math.cos(u),.22,z+radius*Math.sin(u)],[x+radius*Math.cos(v),.22,z+radius*Math.sin(v)],[.58,.74,.76]);}
    p.box(x,.25,z,.3,.2,.3,accent);
   }
 }
 if(meshes.custom?.buffer)gl.deleteBuffer(meshes.custom.buffer);
 meshes.custom=p.upload();
}
function planeModel(s){const c=Math.cos,b=Math.sin,cy=c(s.yaw),sy=b(s.yaw),cp=c(-s.pitch),sp=b(-s.pitch),cr=c(-s.bank),sr=b(-s.bank);const RY=[cy,0,-sy,0,0,1,0,0,sy,0,cy,0,0,0,0,1];const RX=[1,0,0,0,0,cp,sp,0,0,-sp,cp,0,0,0,0,1];const RZ=[cr,sr,0,0,-sr,cr,0,0,0,0,1,0,0,0,0,1];const T=identity();T[12]=s.x;T[13]=s.y;T[14]=s.z;return mul(mul(mul(T,RY),RX),RZ);}
let fallback2D=false;
/* Native Canvas2D perspective fallback for restricted devices. No third-party rendering engine. */
function drawCustom2D(ctx,w,h,d,bank){
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const cx=w/2,cy=h*.71,sc=Math.max(.55,Math.min(1.65,h/640));ctx.save();ctx.translate(cx,cy);ctx.scale(sc,sc);ctx.rotate(-bank*.83);
 ctx.shadowColor='#031624b9';ctx.shadowBlur=22;ctx.shadowOffsetY=9;
 const paint=(points,fill)=>{ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(const p of points.slice(1))ctx.lineTo(p[0],p[1]);ctx.closePath();ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle='#567783';ctx.lineWidth=1.4;ctx.stroke();};
 if(d.type==='wing'){
  const hs=clamp(d.spanM*11,46,133),nose=clamp(d.bodyLengthM*6,45,91),tail=nose*.7,chord=clamp(d.chordM*11,14,54);
  const sweep=Math.tan(d.sweepDeg*Math.PI/180)*hs*.35;
  for(const sign of [-1,1])paint([[sign*8,-chord*.5],[sign*hs,-chord*.5+sweep],[sign*hs,chord*.5+sweep],[sign*8,chord*.5]],'#d7e4e4');
  if(d.tailAreaM2>.05){const tw=clamp(Math.sqrt(d.tailAreaM2)*30,8,62);paint([[-tw,tail*.72],[tw,tail*.72],[tw*.84,tail],[ -tw*.84,tail]],'#a0c2c4');}
  paint([[0,-nose],[-9,-nose*.75],[-11,tail*.72],[-5,tail],[5,tail],[11,tail*.72],[9,-nose*.75]],'#f7f3e9');
  ctx.fillStyle='#315b71';ctx.beginPath();ctx.ellipse(0,-nose*.45,5,16,0,0,Math.PI*2);ctx.fill();
 }else{
  const n=d.rotors,ring=95,rotorR=clamp(d.rotorRadiusM*75,11,31);
  for(let i=0;i<n;i++){const a=2*Math.PI*i/n+Math.PI/4,x=Math.cos(a)*ring,y=Math.sin(a)*ring;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(x,y);ctx.strokeStyle='#9abcbf';ctx.lineWidth=7;ctx.stroke();ctx.beginPath();ctx.arc(x,y,rotorR,0,Math.PI*2);ctx.fillStyle='#c4e4df55';ctx.fill();ctx.strokeStyle='#f4d0ad';ctx.lineWidth=2.5;ctx.stroke();ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fillStyle='#eaa370';ctx.fill();}
  const bw=clamp(d.bodyWidthM*35,12,40),bl=clamp(d.bodyLengthM*30,22,75);
  paint([[0,-bl],[-bw,-bl*.6],[-bw,bl*.55],[-bw*.7,bl],[bw*.7,bl],[bw,bl*.55],[bw,-bl*.6]],'#d1e8e6');
  ctx.fillStyle='#2c6372';ctx.fillRect(-bw*.28,-bl*.48,bw*.56,bl*.46);
 }
 ctx.shadowBlur=0;ctx.shadowOffsetY=0;ctx.restore();
}
function render2D(){
 const dpi=Math.min(window.devicePixelRatio||1,1.25),w=Math.round(canvas.clientWidth*dpi),h=Math.round(canvas.clientHeight*dpi);
 if(!w||!h)return;if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
 const ctx=canvas.getContext('2d');if(!ctx)return;
 const sky=ctx.createLinearGradient(0,0,0,h);sky.addColorStop(0,'#2e7295');sky.addColorStop(.46,'#90c4d0');sky.addColorStop(.65,'#d6dbb2');sky.addColorStop(1,'#738e82');ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
 const fwd=[Math.sin(state.yaw)*Math.cos(state.path),Math.sin(state.path),Math.cos(state.yaw)*Math.cos(state.path)],up=[-Math.sin(state.bank)*.18,1,0];
 const eye=view==='cockpit'?[state.x+fwd[0]*4,state.y+2,state.z+fwd[2]*4]:[state.x-fwd[0]*48,state.y+15-fwd[1]*12,state.z-fwd[2]*48];
 const target=[state.x+fwd[0]*55,state.y+fwd[1]*55+2,state.z+fwd[2]*55];
 const z=norm(sub(eye,target)),x=norm(cross(up,z)),y=cross(z,x),focal=(h/2)/Math.tan((view==='cockpit'?78:70)*Math.PI/360);
 function project(v){const rel=sub(v,eye),d=-dot(z,rel);if(d<1.5||d>16000)return null;return{u:w/2+dot(x,rel)*focal/d,v:h/2-dot(y,rel)*focal/d,d};}
 function quad(a,b,c,d,color){const ps=[a,b,c,d].map(project);if(ps.some(q=>!q))return;const avg=ps.reduce((t,q)=>t+q.d,0)/4;if(avg>8500)return;shapes.push({avg,pts:ps,color});}
 const shapes=[];
 const ground=core.groundHeight,step=260,rx=Math.floor(state.x/step)*step,rz=Math.floor(state.z/step)*step;
 for(let a=-15;a<=15;a++)for(let b=-16;b<=20;b++){
  const X=rx+a*step,Z=rz+b*step,t=[X,ground(X,Z),Z],u=[X+step,ground(X+step,Z),Z],v=[X+step,ground(X+step,Z+step),Z+step],q=[X,ground(X,Z+step),Z+step];
  const avg=(t[1]+u[1]+v[1]+q[1])/4,water=Math.hypot((X+1250)/1000,(Z-1450)/850)<1,col=water?'#397a89':avg>280?'#87928b':avg>90?'#688b75':(a+b)%3===0?'#527966':'#618977';quad(t,u,v,q,col);
 }
 // Airport and strips, laid out as in the WebGL valley.
 quad([-46,8,-940],[46,8,-940],[46,8,980],[-46,8,980],'#2b3c47');
 for(let Z=-875;Z<900;Z+=115)quad([-3,9,Z],[3,9,Z],[3,9,Z+52],[-3,9,Z+52],'#ede0af');
 for(let j=0;j<6;j++){const X=140+j*55,Z=-620+j*84;quad([X-17,49,Z-27],[X+17,49,Z-27],[X+17,49,Z+27],[X-17,49,Z+27],'#d5e2d7');}
 shapes.sort((a,b)=>b.avg-a.avg);
 for(const shape of shapes){const q=shape.pts;ctx.beginPath();ctx.moveTo(q[0].u,q[0].v);q.slice(1).forEach(p=>ctx.lineTo(p.u,p.v));ctx.closePath();ctx.fillStyle=shape.color;ctx.fill();}
 // Rounded mountain skyline and a thin light haze layer in the far distance.
 ctx.save();ctx.globalAlpha=.18;const haz=ctx.createLinearGradient(0,h*.48,0,h*.84);haz.addColorStop(0,'#e4ddaf');haz.addColorStop(1,'#daeac500');ctx.fillStyle=haz;ctx.fillRect(0,h*.42,w,h*.4);ctx.restore();
 // World training gates are projected in 3D; draw ring paths with depth-sensitive line weight.
 core.gates.forEach((g,i)=>{const p=project([g.x,g.y,g.z]);if(!p)return;const r=52*focal/p.d;if(r<2||r>h*6)return;ctx.save();ctx.globalAlpha=i<state.checkpoints?.22:.92;ctx.lineWidth=Math.min(6,Math.max(1,3.2*focal/p.d));ctx.strokeStyle=i<state.checkpoints?'#b2dec4':i===state.checkpoints?'#ffbf77':'#a6f3db';ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=17;ctx.beginPath();ctx.ellipse(p.u,p.v,r,r,0,0,Math.PI*2);ctx.stroke();ctx.restore();});
 // Aircraft follows the 3D flight state; cockpit view hides the chase airplane.
 if(view!=='cockpit'&&state.craft==='custom'){drawCustom2D(ctx,w,h,state.design,state.bank);}
 else if(view!=='cockpit'){
  const cx=w/2,cy=h*.69,sc=Math.max(.52,Math.min(1.6,h/650));
  ctx.save();ctx.translate(cx,cy);ctx.scale(sc,sc);ctx.rotate(-state.bank*.80);ctx.shadowColor='#041522b7';ctx.shadowBlur=26;ctx.shadowOffsetY=8;
  ctx.fillStyle='#142d3b';ctx.beginPath();ctx.moveTo(-93,13);ctx.lineTo(-10,-8);ctx.lineTo(-15,52);ctx.lineTo(-36,64);ctx.lineTo(-35,73);ctx.lineTo(0,67);ctx.lineTo(35,73);ctx.lineTo(36,64);ctx.lineTo(15,52);ctx.lineTo(10,-8);ctx.lineTo(93,13);ctx.lineTo(102,2);ctx.lineTo(10,-32);ctx.lineTo(0,-91);ctx.lineTo(-10,-32);ctx.lineTo(-102,2);ctx.closePath();ctx.fill();
  ctx.shadowBlur=0;ctx.shadowOffsetY=0;ctx.fillStyle='#d8ecec';ctx.beginPath();ctx.moveTo(0,-91);ctx.lineTo(9,-31);ctx.lineTo(100,4);ctx.lineTo(91,15);ctx.lineTo(13,-5);ctx.lineTo(15,54);ctx.lineTo(36,68);ctx.lineTo(33,73);ctx.lineTo(0,66);ctx.lineTo(-33,73);ctx.lineTo(-36,68);ctx.lineTo(-15,54);ctx.lineTo(-13,-5);ctx.lineTo(-91,15);ctx.lineTo(-100,4);ctx.lineTo(-9,-31);ctx.closePath();ctx.fill();
  ctx.fillStyle=state.craft==='custom'?'#f2aa7c':core.aircraft[state.craft].skin;ctx.fillRect(-100,4,24,8);ctx.fillRect(76,4,24,8);ctx.fillStyle='#286077';ctx.beginPath();ctx.ellipse(0,-20,6,22,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#93cbd9';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,-86);ctx.lineTo(0,65);ctx.stroke();ctx.restore();
 }
 // Low-opacity directional wind lines and cinematic shadows, still decorative.
 ctx.save();ctx.strokeStyle='#d8f5e640';ctx.lineWidth=1;for(let i=0;i<7;i++){const ux=(w*.12+i*w*.14+state.flightTime*7)%w,vy=h*.55+(i%3)*20;ctx.beginPath();ctx.moveTo(ux,vy);ctx.lineTo(ux+25,vy);ctx.stroke();}ctx.restore();
}

function resize(){const dpr=Math.min(window.devicePixelRatio||1,1.25);const w=Math.max(320,Math.round(canvas.clientWidth*dpr)),h=Math.max(250,Math.round(canvas.clientHeight*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}gl.viewport(0,0,w,h);}
function render(){
 if(fallback2D){render2D();return;}
 if(!program)return;
 resize();gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
 const ahead=[Math.sin(state.yaw)*Math.cos(state.path),Math.sin(state.path),Math.cos(state.yaw)*Math.cos(state.path)];
 let eye,focus,up=[0,1,0];
 if(view==='cockpit'){
   eye=[state.x+ahead[0]*4,state.y+2,state.z+ahead[2]*4];focus=[eye[0]+ahead[0]*320,eye[1]+ahead[1]*320,eye[2]+ahead[2]*320];up=[-Math.sin(state.bank)*.85,Math.cos(state.bank),0];
 }else{
   eye=[state.x-ahead[0]*48,state.y+15-ahead[1]*12,state.z-ahead[2]*48];focus=[state.x+ahead[0]*45,state.y+ahead[1]*45+2,state.z+ahead[2]*45];up=[-Math.sin(state.bank)*.28,1,0];
 }
 const vp=mul(perspective(view==='cockpit'?78*Math.PI/180:70*Math.PI/180,canvas.width/canvas.height,.5,15000),lookAt(eye,focus,up));
 gl.useProgram(program);gl.uniformMatrix4fv(uVP,false,vp);drawMesh(meshes.world,identity());if(view!=='cockpit')drawMesh(meshes[state.craft],planeModel(state));
}
function hud(){const round=n=>Math.round(n).toLocaleString('en-US');$('speedOut').textContent=round(state.speed*1.94384);$('altOut').textContent=round(state.y*3.28084);$('headOut').textContent=String(Math.round((state.yaw*180/Math.PI+3600)%360)).padStart(3,'0');$('pitchOut').textContent=(state.pitch*180/Math.PI).toFixed(0);$('bankOut').textContent=(state.bank*180/Math.PI).toFixed(0);$('throttleOut').textContent=round(state.throttle*100);const sec=Math.floor(state.flightTime);$('flightTime').textContent='T+ '+String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');$('gateProgress').querySelectorAll('i').forEach((el,i)=>el.classList.toggle('done',i<state.checkpoints));const next=core.gates[state.checkpoints];$('nextGate').textContent=next?`NEXT: ${next.title} · ${state.checkpoints} / 3`:'MISSION COMPLETE · 3 / 3';$('flightStatus').textContent=state.condition==='GROUND_CONTACT'?'GROUND CONTACT':state.paused?'PAUSED':state.craft==='custom'?'FOUNDRY FLIGHT / SCREENING':'SIMULATION ACTIVE';$('pauseToggle').textContent=state.paused?'▶ Resume':'Ⅱ Pause';$('cameraToggle').textContent=view==='chase'?'◉ Chase view':'◉ Cockpit view';}
function controls(){const has=(...a)=>a.some(k=>held.has(k));const t=k=>touch.has(k);return {pitch:(has('w','arrowup')||t('pitchUp')?1:0)-(has('s','arrowdown')||t('pitchDown')?1:0),bank:(has('d','arrowright')||t('right')?1:0)-(has('a','arrowleft')||t('left')?1:0),rudder:(has('e')?1:0)-(has('q')?1:0),throttle:(has('shift')||t('throttleUp')?1:0)-(has('control')||t('throttleDown')?1:0)};}
function notify(message,seconds=3){$('flightAlert').textContent=message;$('flightAlert').classList.add('active');alertUntil=performance.now()+seconds*1000;$('flightA11y').textContent=message;}
function frame(timestamp){if(!running)return;const dt=Math.min(.05,(timestamp-last)/1000||.016);last=timestamp;
 const was=state.checkpoints,prior=state.condition;core.step(state,controls(),dt);
 if(was!==state.checkpoints)notify(state.checkpoints>=3?'MISSION COMPLETE · SAVE YOUR FLIGHT':`GATE ${state.checkpoints} CLEARED`,4);
 if(prior!==state.condition&&state.condition==='GROUND_CONTACT'){state.paused=true;notify('GROUND CONTACT · RESTART OR SAVE FLIGHT',5);}
 if((state.craft==='custom'?state.aero?.stall:state.speed<core.aircraft[state.craft].stall)&&!state.paused&&Math.floor(timestamp/800)!==Math.floor((timestamp-16)/800))notify('LOW AIRSPEED · SIMULATED STALL',1.0);
 if(!fallback2D||timestamp-lastDraw>65){render();lastDraw=timestamp;}if(timestamp-lastHUD>100){hud();lastHUD=timestamp;}if(alertUntil&&timestamp>alertUntil){$('flightAlert').classList.remove('active');alertUntil=0;}
 frames++;requestAnimationFrame(frame);
}
function reset(kind=state.craft){const design=state.design;state=core.start(kind,kind==='custom'?design:null);view='chase';hud();notify('FLIGHT RESTARTED · SYNTHETIC RANGE',2);}
function togglePause(){state.paused=!state.paused;hud();notify(state.paused?'SIMULATION PAUSED':'SIMULATION RESUMED',1.2);}
function saveFlight(){const receipt=core.flightReceipt(state);try{localStorage.setItem('evercraft-aaar-last-flight',JSON.stringify(receipt));}catch{}
 const sent=window.parent!==window;
 if(sent){window.parent.postMessage({type:'AAAR_FLIGHT_RECEIPT',schema:'evercraft.aaar.worlds-flight.message.v1',receipt},'*');notify('FLIGHT RECORD SENT TO ANNISTON · LOCAL ONLY',4);}
 else {const blob=new Blob([JSON.stringify(receipt,null,2)],{type:'application/json'}),a=document.createElement('a');a.download=`anniston-flight-${receipt.id}.json`;a.href=URL.createObjectURL(blob);document.body.append(a);a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);a.remove();notify('EXPORTED LOCAL SIMULATION RECORD',3);}
}
function begin(){if(running)return;running=true;$('startScreen').style.display='none';canvas.focus({preventScroll:true});last=performance.now();requestAnimationFrame(frame);notify('FLIGHT RANGE ACTIVE · W/S PITCH · A/D BANK',3);}
function initEvents(){
 window.addEventListener('AAAR_FOUNDRY_OPEN',()=>{if(running)state.paused=true;hud();});
 window.addEventListener('AAAR_LAUNCH_CRAFT',event=>{
   const design=window.AAARFoundry.validate(event.detail);state=core.start('custom',design);
   const select=$('planeType');let opt=select.querySelector('option[value=custom]');if(!opt){opt=document.createElement('option');opt.value='custom';select.appendChild(opt);}opt.textContent=design.name;select.value='custom';
   if(gl&&program)buildCustomMesh(design);view='chase';if(!running)begin();else{state.paused=false;}hud();notify('CUSTOM '+(design.type==='wing'?'WING':'ROTORCRAFT')+' LAUNCHED · ANALYTICAL GAME MODEL',4);
 });
 $('beginFlight').addEventListener('click',begin);
 $('skipToControls').addEventListener('click',()=>{notify('W/S PITCH · A/D BANK · SHIFT/CTRL THROTTLE',5);$('beginFlight').focus();});
 $('planeType').addEventListener('change',e=>{if(e.target.value==='custom'&&state.design)reset('custom');else if(e.target.value!=='custom')reset(e.target.value);});
 $('cameraToggle').addEventListener('click',()=>{view=view==='chase'?'cockpit':'chase';hud();});
 $('pauseToggle').addEventListener('click',togglePause);$('resetFlight').addEventListener('click',()=>reset());$('saveFlight').addEventListener('click',saveFlight);
 $('fullscreenToggle').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(shell.requestFullscreen)await shell.requestFullscreen();}catch{notify('FULLSCREEN NOT AVAILABLE ON THIS DEVICE',2);}});
 for(const b of document.querySelectorAll('[data-touch]')){const key=b.dataset.touch;
  const start=e=>{e.preventDefault();b.setPointerCapture?.(e.pointerId);touch.add(key);};
  const end=e=>{e.preventDefault();touch.delete(key);};b.addEventListener('pointerdown',start);b.addEventListener('pointerup',end);b.addEventListener('pointercancel',end);b.addEventListener('lostpointercapture',()=>touch.delete(key));
 }
 document.addEventListener('keydown',e=>{if(document.getElementById('foundryOverlay')?.classList.contains('open'))return;const k=e.key.toLowerCase();if(['w','s','a','d','q','e','shift','control','arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)){if(running&&!e.target.closest('select'))e.preventDefault();held.add(k);}if(e.repeat)return;if(k==='c'){$('cameraToggle').click();}if(k==='r')reset();if(k==='p'||k===' ')togglePause();});
 document.addEventListener('keyup',e=>held.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>{held.clear();touch.clear();if(running&&!state.paused){state.paused=true;hud();}});document.addEventListener('visibilitychange',()=>{if(document.hidden&&running){state.paused=true;}});
 window.addEventListener('message',event=>{if(event.source!==window.parent||event.source===window)return;if(event.data?.type==='AAAR_WORLD_PAUSE'){state.paused=true;hud();}if(event.data?.type==='AAAR_WORLD_RESUME'){state.paused=false;hud();}if(event.data?.type==='AAAR_OPEN_FOUNDRY'){window.AAARFoundryUI?.open();}});
}
try{if(gl)initGL();else{fallback2D=true;$('flightStatus').textContent='SOFTWARE 3D VIEW';}initEvents();hud();render();}catch(error){$('beginFlight').disabled=true;$('beginFlight').textContent='GRAPHICS UNAVAILABLE';$('startScreen').querySelector('p').textContent=String(error.message||error)+' This does not affect your saved AAAR registry.';}
})();
