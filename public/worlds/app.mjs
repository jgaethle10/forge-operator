import {initialWorld,loadWorld,saveWorld,applyCommand,stepAgents,validateWorld,canWalk} from './world-core.mjs';
import {QUALITY_KEY,validQualityMode,modeScale,tuneQuality,DEFAULT_QUALITY} from './quality.mjs';
import {PORTAL,portalEffect} from './portal-visual.mjs';
import {decodeSharedScene,sharedSceneUrl} from './share-scene.mjs';
import {CLOUD_KEY,validateOwner,vaultAvailable,publishWorld,unpublishWorld,fetchPublishedWorld,publishedWorldUrl} from './cloud-client.mjs';
const $=id=>document.getElementById(id), canvas=$('world');
let cloudOwner=null;
try{cloudOwner=validateOwner(JSON.parse(localStorage.getItem(CLOUD_KEY)||'null'));}catch{}
function forgetCloudOwner(){cloudOwner=null;try{localStorage.removeItem(CLOUD_KEY);}catch{}$('unpublishOnline').classList.add('hidden');}
vaultAvailable().then(available=>{
 if(!available)return;
 $('publishOnline').classList.remove('hidden');
 $('unpublishOnline').classList.toggle('hidden',!cloudOwner);
 $('cloudStatus').textContent=cloudOwner?'Your saved online scene is available to visitors holding its link.':'Owned online saves available. Your shared scenes are unlisted.';
}).catch(()=>{});

const gl=canvas.getContext('webgl2',{antialias:false,alpha:false,powerPreference:'high-performance'});
if(!gl){$('intro').innerHTML='<h1>WebGL 2 is needed.</h1><p>Try a current version of Chrome, Safari, Firefox or Edge with graphics enabled.</p>';throw Error('WebGL2 unavailable');}
const vs=`#version 300 es
precision highp float;in vec3 position;in vec3 normal;in mat4 instanceMatrix;in vec3 instanceColor;uniform mat4 projection,view,model;uniform vec3 color;uniform float instancing;out vec3 vNormal,vWorld,vColor;void main(){mat4 activeModel=instancing>.5?instanceMatrix:model;vec4 p=activeModel*vec4(position,1.);vWorld=p.xyz;vNormal=normalize(mat3(activeModel)*normal);vColor=instancing>.5?instanceColor:color;gl_Position=projection*view*p;}`;
const fs=`#version 300 es
precision highp float;in vec3 vNormal,vWorld,vColor;uniform vec3 lightColor,fogColor,cameraPos;uniform float opacity,ambient;out vec4 frag;void main(){vec3 n=normalize(vNormal);float sun=max(dot(n,normalize(vec3(-.38,.8,.48))),0.);float fill=max(dot(n,normalize(vec3(.48,.2,-.65))),0.)*.13;float lit=ambient+sun*.54+fill;vec3 c=vColor*(lit*lightColor+.13);float dist=length(vWorld-cameraPos);float fog=clamp((dist-22.)/34.,0.,.88);c=mix(c,fogColor,fog);frag=vec4(pow(c,vec3(.94)),opacity);}`;
function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vs));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
const loc={};for(const k of ['projection','view','model','color','lightColor','fogColor','cameraPos','opacity','ambient','instancing'])loc[k]=gl.getUniformLocation(program,k);
function mesh(p,n){const vao=gl.createVertexArray();gl.bindVertexArray(vao);for(const [attr,data] of [['position',p],['normal',n]]){const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);const i=gl.getAttribLocation(program,attr);gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,3,gl.FLOAT,false,0,0);}gl.bindVertexArray(null);return {vao,count:p.length/3};}
function cube(){const p=[],n=[];const faces=[[[0,0,1],[[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]]],[[0,0,-1],[[.5,-.5,-.5],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5]]],[[1,0,0],[[.5,-.5,.5],[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5]]],[[-1,0,0],[[-.5,-.5,-.5],[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5]]],[[0,1,0],[[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5],[-.5,.5,-.5]]],[[0,-1,0],[[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5]]]];for(const [normal,verts]of faces){for(const i of [0,1,2,0,2,3]){p.push(...verts[i]);n.push(...normal);}}return mesh(p,n);}
function sphere(lat=12,lon=18){const p=[],n=[];for(let a=0;a<lat;a++)for(let b=0;b<lon;b++){const verts=[];for(const [i,j]of [[a,b],[a+1,b],[a+1,b+1],[a,b+1]]){const phi=Math.PI*i/lat,theta=2*Math.PI*j/lon;const v=[Math.sin(phi)*Math.cos(theta)*.5,Math.cos(phi)*.5,Math.sin(phi)*Math.sin(theta)*.5];verts.push(v);}for(const k of [0,1,2,0,2,3]){p.push(...verts[k]);n.push(...verts[k].map(x=>x*2));}}return mesh(p,n);}
function cylinder(seg=22){const p=[],n=[];for(let i=0;i<seg;i++){const a=i*2*Math.PI/seg,b=(i+1)*2*Math.PI/seg;const aa=[Math.cos(a)*.5,Math.sin(a)*.5],bb=[Math.cos(b)*.5,Math.sin(b)*.5];for(const [t,vs]of [[0,[[aa[0],-.5,aa[1]],[bb[0],-.5,bb[1]],[bb[0],.5,bb[1]],[aa[0],.5,aa[1]]]],[1,[[0,.5,0],[aa[0],.5,aa[1]],[bb[0],.5,bb[1]]]],[2,[[0,-.5,0],[bb[0],-.5,bb[1]],[aa[0],-.5,aa[1]]]]]){const ids=vs.length===4?[0,1,2,0,2,3]:[0,1,2];for(const k of ids){const v=vs[k];p.push(...v);n.push(...(t===1?[0,1,0]:t===2?[0,-1,0]:[v[0]*2,0,v[2]*2]));}}}return mesh(p,n);}
function ring(){const p=[],n=[];const rings=38,sides=8,R=.5,r=.068;for(let i=0;i<rings;i++)for(let j=0;j<sides;j++){const at=(a,b)=>{const theta=a*2*Math.PI/rings,phi=b*2*Math.PI/sides;return [(R+r*Math.cos(phi))*Math.cos(theta),(R+r*Math.cos(phi))*Math.sin(theta),r*Math.sin(phi)];};const verts=[at(i,j),at(i+1,j),at(i+1,j+1),at(i,j+1)];for(const k of [0,1,2,0,2,3]){p.push(...verts[k]);n.push(verts[k][0],verts[k][1],verts[k][2]);}}return mesh(p,n);}
const meshes={cube:cube(),sphere:sphere(),sphereStatic:sphere(9,14),cylinder:cylinder(),cylinderStatic:cylinder(14),ring:ring()};
const col=x=>{const z=x.replace('#','');return [0,2,4].map(i=>parseInt(z.slice(i,i+2),16)/255);};
const M=(x,y,z,sx,sy,sz,rot=0)=>{const c=Math.cos(rot),s=Math.sin(rot);return new Float32Array([c*sx,0,-s*sx,0,0,sy,0,0,s*sz,0,c*sz,0,x,y,z,1]);};
const perspective=(fov,aspect,near,far)=>{const f=1/Math.tan(fov/2),o=1/(near-far);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*o,-1,0,0,2*far*near*o,0]);};
function lookAt(eye,target){const z=norm([eye[0]-target[0],eye[1]-target[1],eye[2]-target[2]]),x=norm(cross([0,1,0],z)),y=cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);}
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=v=>{const d=Math.hypot(...v)||1;return v.map(x=>x/d);};
let state=loadWorld(localStorage),visitingShared=false,pendingShared=null,started=false,editorOpen=false,previous=performance.now(),elapsed=0,fpsFrames=0,fpsStart=performance.now(),fps=0,lastSave=0;
let camera={x:state.player.x,y:1.72,z:state.player.z,yaw:state.player.yaw,pitch:-.06,vy:0},keys={},joystick={x:0,y:0},renderAgents=[];
let qualityMode='auto',quality={...DEFAULT_QUALITY};
try{qualityMode=validQualityMode(localStorage.getItem(QUALITY_KEY));}catch{}
$('qualityMode').value=qualityMode;
$('qualityMode').addEventListener('change',()=>{qualityMode=validQualityMode($('qualityMode').value);quality={...DEFAULT_QUALITY};try{localStorage.setItem(QUALITY_KEY,qualityMode);}catch{}resize();});
const staticDraw=[],colored=(kind,x,y,z,sx,sy,sz,color,rot=0,alpha=1)=>({kind,x,y,z,sx,sy,sz,color,rot,alpha});
const box=(x,y,z,sx,sy,sz,color,rot=0,alpha=1)=>staticDraw.push(colored('cube',x,y,z,sx,sy,sz,color,rot,alpha));
const ball=(x,y,z,sx,sy,sz,color)=>staticDraw.push(colored('sphere',x,y,z,sx,sy,sz,color));
const tube=(x,y,z,sx,sy,sz,color)=>staticDraw.push(colored('cylinder',x,y,z,sx,sy,sz,color));
function rand(seed){let s=seed>>>0;return()=>((s=Math.imul(s,1664525)+1013904223>>>0)/4294967296);}
const random=rand(412);
// Original authored world geometry: the workshop and its small surrounding biome.
box(0,-.34,0,38,.7,38,'#779e80');
// Dappled garden patches.
for(let i=0;i<110;i++){const x=(random()-.5)*34,z=(random()-.5)*34;if(x>-7&&x<1&&z>-8&&z<3)continue;ball(x,.015,z,.25,.035,.18,i%4===0?'#b9be72':'#7ca884');}
// Winding path and stepping stones.
for(let i=0;i<21;i++){const z=7-i*.68,x=1.3*Math.sin(i*.22);tube(x,.028,z,1.45,.07,1.15,i%3===0?'#e3d6b2':'#d9cba9');}
// Workspace pavilion with cantilevered roof.
box(-3.2,.06,-4.2,8,.2,7.9,'#cdbb9f');box(-3.2,.14,-4.2,7.7,.07,7.6,'#ddcdb0');
box(-3.3,2.1,-8.06,8.1,4.2,.15,'#e6d7bd');box(-7.3,2.1,-4.5,.13,4.2,7.5,'#cfb798');
for(const x of [-7.1,.4]){box(x,1.95,-.55,.15,3.9,.15,'#a8856e');box(x,1.95,-8.02,.15,3.9,.15,'#a8856e');}
box(-3.3,4.04,-4.1,8.5,.2,8.15,'#a67e63');box(-3.3,4.25,-4.1,8.8,.12,8.35,'#77866f');
for(let i=0;i<7;i++)box(-7.26,1.65,-7.2+i*.9,.055,2.9,.07,'#f4ead4');
// Rounded books and an oak bookshelf.
box(-6.7,1.25,-7.67,1,.12,.5,'#8f664e');for(const y of [1,1.65,2.3]){box(-6.7,y,-7.6,1.25,.12,.5,'#956f56');for(let i=0;i<5;i++)box(-7.16+i*.22,y+.24,-7.58,.15,.38,.36,['#dc9f7c','#b0bd8f','#9ea9bf','#c99ba0','#e4c78d'][i]);}
// Desk, keyboard, screen, chair, rug.
box(-4.9,.77,-4,2.7,.14,1.2,'#947153');for(const x of [-6.02,-3.8])for(const z of [-4.45,-3.5])box(x,.4,z,.12,.72,.12,'#795c4b');
box(-4.9,1.36,-4.46,1.25,.85,.1,'#303d45');box(-4.9,1.38,-4.38,1.08,.64,.025,'#7da9aa');box(-4.88,.92,-3.88,.84,.025,.29,'#40494c');
box(-4.78,.49,-2.43,.85,.18,.85,'#ac9386');box(-4.78,1.04,-2.79,.85,.92,.15,'#b5a295');box(-4.78,.28,-2.43,.12,.5,.12,'#555b53');
box(-2.45,.04,-3.15,2.5,.035,1.3,'#b3a584');box(-2.1,.46,-3.2,1.7,.77,.65,'#8da5a0');box(-2.1,.82,-3.52,1.7,.77,.2,'#8da5a0');
// Potted plants in workshop.
for(const [x,z]of [[-6.6,-1.4],[-.3,-7.1],[-1.1,-1.2]]){tube(x,.35,z,.65,.7,.65,'#bf8275');tube(x,.75,z,.48,.16,.48,'#4f7351');for(let j=0;j<4;j++)ball(x+Math.cos(j*1.5)*.21,1.13,z+Math.sin(j*1.5)*.2,.34,.85,.28,'#74a982');}
// Reading lamp, counter and fish-tank stand.
box(-.9,.55,-4.7,1.65,.12,.8,'#bc977a');box(-.9,1.25,-4.82,1.6,1.18,.8,'#72b4c1',0,.5);
box(-.9,1.8,-4.82,1.7,.1,.87,'#4e726b');box(-.9,.95,-4.82,1.52,.1,.75,'#9bd2bb',0,.5);
for(let i=0;i<8;i++){ball(-1.55+random()*1.25,1.02+random()*.12,-5.02+random()*.5,.18,.17,.13,i%2?'#668a7a':'#b8bd96');}
// Pond, riparian rocks, lily pads.
tube(7,-.11,-5,8.2,.38,6.8,'#6b8374');tube(7,.07,-5,7.8,.13,6.4,'#589fa4');for(let j=0;j<20;j++){const a=j/20*Math.PI*2,r=1+(j%3)*.1;ball(7+Math.cos(a)*4.02*r,.13,-5+Math.sin(a)*3.37*r,.64,.34,.5,j%2?'#bdbaa4':'#b4b1a5');}
for(let i=0;i<12;i++){const x=5+random()*4.2,z=-6.9+random()*3.4;tube(x,.16,z,.38,.03,.35,'#7aaf87');}
// Ferny trees at the edges.
function tree(x,z,s=1){tube(x,1.35*s,z,.39*s,2.7*s,.39*s,'#856e57');for(let i=0;i<4;i++){ball(x+Math.sin(i*2.2)*.46*s,(2.65+Math.sin(i))*s,z+Math.cos(i*1.5)*.4*s,2*s,1.5*s,1.9*s,['#7ea488','#87ab88','#719d81','#a3b98c'][i]);}}
for(const [x,z,s]of [[-12,-10,1.5],[-16,0,1.2],[-13,11,1.3],[12,-12,1.4],[15,2,1.2],[10,13,1.25],[-3,15,1.55],[16,15,1.3],[3,-16,1.1]])tree(x,z,s);
// Flower heads and mushrooms.
for(let i=0;i<60;i++){const x=(random()-.5)*34,z=(random()-.5)*34;if(x>-7&&x<.8&&z>-8.2&&z<-.2)continue;tube(x,.2,z,.026,.4,.026,'#497752');ball(x,.4,z,.13,.13,.13,['#f2d3bd','#f1d8a0','#dee6c3','#efbcbf'][i%4]);}
// Little faraway destination beyond portal.
box(13,.15,9.5,6,.25,6,'#d7c4a6');box(13,1.3,12,5.5,2.6,.15,'#e4d5b7');box(13,2.8,9.5,6,.16,6,'#8d9a82');box(13,.6,10,1.4,.9,.8,'#92765d');
// Portal pedestal, permanent glowy portal ring drawn dynamically.
tube(PORTAL.x,.22,PORTAL.z,2.6,.45,1.7,'#b9a98e');box(PORTAL.x,PORTAL.y,-10.45,PORTAL.frameWidth,PORTAL.frameHeight,.15,'#6b817c');
// Static mesh transforms/colors are uploaded once as instance attributes, never repeated each frame.
const opaqueGroups=new Map();
for(const d of staticDraw){if(d.alpha!==1)continue;const group=opaqueGroups.get(d.kind)||[];group.push(d);opaqueGroups.set(d.kind,group);}
const staticInstances=[];
const matrixAttrib=gl.getAttribLocation(program,'instanceMatrix'),colorAttrib=gl.getAttribLocation(program,'instanceColor');
if(matrixAttrib<0||colorAttrib<0)throw Error('Static instancing shader contract unavailable');
for(const [kind,items] of opaqueGroups){
 const shape=kind==='sphere'?meshes.sphereStatic:kind==='cylinder'?meshes.cylinderStatic:(meshes[kind]||meshes.cube);
 const floats=new Float32Array(items.length*19);
 for(let i=0;i<items.length;i++){
  const d=items[i],offset=i*19;
  floats.set(M(d.x,d.y,d.z,d.sx,d.sy,d.sz,d.rot||0),offset);
  floats.set(col(d.color),offset+16);
 }
 gl.bindVertexArray(shape.vao);
 const buffer=gl.createBuffer();
 gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
 gl.bufferData(gl.ARRAY_BUFFER,floats,gl.STATIC_DRAW);
 for(let k=0;k<4;k++){
  gl.enableVertexAttribArray(matrixAttrib+k);
  gl.vertexAttribPointer(matrixAttrib+k,4,gl.FLOAT,false,76,k*16);
  gl.vertexAttribDivisor(matrixAttrib+k,1);
 }
 gl.enableVertexAttribArray(colorAttrib);
 gl.vertexAttribPointer(colorAttrib,3,gl.FLOAT,false,76,64);
 gl.vertexAttribDivisor(colorAttrib,1);
 staticInstances.push({kind,vao:shape.vao,vertices:shape.count,count:items.length,buffer});
}
gl.bindVertexArray(null);
const staticDrawCount=staticInstances.reduce((total,b)=>total+b.count,0);
let frameDrawCalls=0,frameInstanceCount=0,lastNearby=null;
function drawStaticInstances(){
 gl.uniform1f(loc.instancing,1);
 gl.uniform1f(loc.opacity,1);
 for(const bucket of staticInstances){
  gl.bindVertexArray(bucket.vao);
  gl.drawArraysInstanced(gl.TRIANGLES,0,bucket.vertices,bucket.count);
  frameDrawCalls++;
  frameInstanceCount+=bucket.count;
 }
 gl.uniform1f(loc.instancing,0);
}
function draw(d){const shape=meshes[d.kind]||meshes.cube;gl.bindVertexArray(shape.vao);gl.uniformMatrix4fv(loc.model,false,M(d.x,d.y,d.z,d.sx,d.sy,d.sz,d.rot||0));gl.uniform3fv(loc.color,col(d.color));gl.uniform1f(loc.opacity,d.alpha??1);gl.drawArrays(gl.TRIANGLES,0,shape.count);frameDrawCalls++;}
function drawStyled(d){if((d.alpha??1)<1){gl.depthMask(false);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);}draw(d);if((d.alpha??1)<1){gl.depthMask(true);gl.disable(gl.BLEND);}}
function agentDraw(a,i){const x=a.renderX,z=a.renderZ,b=a.renderBob,color=a.color;const d=(kind,dx,dy,dz,sx,sy,sz,c)=>draw(colored(kind,x+dx,dy+b,z+dz,sx,sy,sz,c));
 d('sphere',0,.71,0,.87,1,.7,color);d('sphere',0,1.41,0,.98,.93,.84,color);d('sphere',-.3,1.87,0,.33,.64,.3,color);d('sphere',.3,1.87,0,.33,.64,.3,color);
 d('sphere',-.18,1.5,-.42,.12,.14,.09,'#283d42');d('sphere',.18,1.5,-.42,.12,.14,.09,'#283d42');
 d('sphere',-.15,1.55,-.48,.04,.05,.025,'#fdf9e9');d('sphere',.21,1.55,-.48,.04,.05,.025,'#fdf9e9');
 d('sphere',0,1.28,-.46,.15,.09,.04,'#c58287');d('sphere',-.48,.8,0,.28,.35,.32,color);d('sphere',.48,.8,0,.28,.35,.32,color);
 d('sphere',-.22,.24,-.1,.3,.25,.44,'#c5b5a4');d('sphere',.22,.24,-.1,.3,.25,.44,'#c5b5a4');}
function extra(kind,x,z){const arr=[];const a=(type,dx,y,dz,sx,sy,sz,color)=>arr.push(colored(type,x+dx,y,z+dz,sx,sy,sz,color));
 if(kind==='tree'){a('cylinder',0,1,0,.4,2,.4,'#886c56');a('sphere',0,2.45,0,2,2,2,'#7ba483');a('sphere',.5,2.8,.2,1.45,1.4,1.5,'#93b592');}
 if(kind==='flower'){a('cylinder',0,.32,0,.05,.6,.05,'#54895e');a('sphere',0,.66,0,.32,.28,.32,'#edb0c1');a('sphere',0,.68,-.2,.14,.16,.14,'#f4cf83');}
 if(kind==='rock')a('sphere',0,.22,0,.9,.43,.7,'#b1b3a6');
 if(kind==='bench'){a('cube',0,.6,0,1.8,.16,.55,'#ba9475');a('cube',0,1.02,.28,1.8,.73,.1,'#ba9475');for(const xx of [-.68,.68])a('cube',xx,.3,0,.13,.62,.12,'#786458');}
 if(kind==='lamp'){a('cylinder',0,1.1,0,.1,2.2,.1,'#7b8275');a('sphere',0,2.3,0,.5,.45,.5,'#f1d997');}
 if(kind==='mushroom'){a('cylinder',0,.23,0,.19,.46,.19,'#ecdfc7');a('sphere',0,.51,0,.8,.38,.8,'#c88286');for(const xx of [-.2,.2])a('sphere',xx,.67,-.24,.12,.09,.1,'#f7e6cb');}
 return arr;
}
function resize(){const ratio=Math.min(devicePixelRatio||1,1.65)*modeScale(qualityMode,quality),w=Math.max(1,Math.round(canvas.clientWidth*ratio)),h=Math.max(1,Math.round(canvas.clientHeight*ratio));if(w!==canvas.width||h!==canvas.height){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);}}
function present(time){requestAnimationFrame(present);frameDrawCalls=0;frameInstanceCount=0;const dt=Math.min((time-previous)/1000,.05);previous=time;elapsed+=dt;if(started&&!editorOpen){
 let f=Number(Boolean(keys.KeyW||keys.ArrowUp))-Number(Boolean(keys.KeyS||keys.ArrowDown))-joystick.y,side=Number(Boolean(keys.KeyD||keys.ArrowRight))-Number(Boolean(keys.KeyA||keys.ArrowLeft))+joystick.x;
 const mag=Math.hypot(f,side);if(mag>.02){f/=Math.max(1,mag);side/=Math.max(1,mag);const step=dt*(keys.ShiftLeft?6.6:3.75),s=Math.sin(camera.yaw),c=Math.cos(camera.yaw),x=camera.x+(s*f+c*side)*step,z=camera.z+(-c*f+s*side)*step;if(canWalk(x,camera.z))camera.x=x;if(canWalk(camera.x,z))camera.z=z;}
 camera.vy-=12.4*dt;camera.y+=camera.vy*dt;if(camera.y<1.72){camera.y=1.72;camera.vy=0;}
 if(time-lastSave>6500){state.player={x:camera.x,z:camera.z,yaw:camera.yaw};persist();lastSave=time;}
 }
 resize();const sky={day:['#bedad2','#e6dbc0',.6],sunset:['#d3a48c','#f6ccae',.43],night:['#314b64','#92a3ad',.36]}[state.sky];const fog=col(sky[0]);gl.clearColor(...fog,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.useProgram(program);
 gl.uniformMatrix4fv(loc.projection,false,perspective(65*Math.PI/180,canvas.width/Math.max(1,canvas.height),.07,110));const cy=Math.cos(camera.yaw),sy=Math.sin(camera.yaw),cp=Math.cos(camera.pitch),sp=Math.sin(camera.pitch),eye=[camera.x,camera.y,camera.z];gl.uniformMatrix4fv(loc.view,false,lookAt(eye,[camera.x+sy*cp,camera.y+sp,camera.z-cy*cp]));gl.uniform3fv(loc.cameraPos,eye);gl.uniform3fv(loc.fogColor,fog);gl.uniform3fv(loc.lightColor,col(sky[1]));gl.uniform1f(loc.ambient,sky[2]);
 drawStaticInstances();
 // Water animated surface, reeds and living fish in the glass tank.
 draw(colored('cylinder',7,.146+Math.sin(elapsed*1.4)*.014,-5,7.6,.075,6.3,'#80cacc',0,.84));
 for(let i=0;i<3;i++){const x=-1.38+i*.45,z=-4.75+Math.sin(elapsed*1.5+i)*.19;draw(colored('sphere',x,1.3+Math.sin(elapsed*2+i)*.12,z,.25,.16,.12,['#f6bf85','#edd7a0','#dd9ba9'][i]));draw(colored('sphere',x-.12,1.32+Math.sin(elapsed*2+i)*.12,z-.1,.045,.046,.038,'#333e46'));}
 for(const d of staticDraw){if(d.alpha<1)drawStyled(d);}
 const portalDistance=Math.hypot(camera.x-PORTAL.x,camera.z-PORTAL.z);
 const portalGlow=portalEffect(portalDistance,elapsed);
 if(portalGlow.opacity>.01){
  drawStyled(colored('ring',PORTAL.x,PORTAL.y,-10.23,PORTAL.outerX*portalGlow.pulse,PORTAL.outerY*portalGlow.pulse,1,'#d0b3ee',0,portalGlow.opacity));
  drawStyled(colored('ring',PORTAL.x,PORTAL.y,-10.15,PORTAL.innerX,PORTAL.innerY,1,'#97d5c9',0,Math.min(1,portalGlow.opacity+.06)));
 }
 renderAgents=stepAgents(state,dt,elapsed);for(let i=0;i<renderAgents.length;i++)agentDraw(renderAgents[i],i);
 for(const o of state.objects)for(const d of extra(o.kind,o.x,o.z))draw(d);
 if(started){const near=nearby();if(near?.id!==lastNearby?.id){lastNearby=near;$('prompt').textContent=near?`Press E to ${near.action}${near.agent?' · '+near.agent.activity:''}`:'Look for friends, the fish tank and the glowing portal.';}const bearing=((camera.yaw*180/Math.PI)%360+360)%360;$('compass').textContent=['N','NE','E','SE','S','SW','W','NW'][Math.round(bearing/45)%8];$('weather').textContent=state.sky==='day'?'Golden afternoon · Daylight':state.sky==='sunset'?'Warm skies · Sunset':'Quiet stars · Night';}
 fpsFrames++;if(time-fpsStart>1200){fps=Math.round(fpsFrames*1000/(time-fpsStart));fpsStart=time;fpsFrames=0;if(started&&qualityMode==='auto'&&!document.hidden)quality=tuneQuality(quality,fps);$('metrics').textContent=`${fps} fps · ${canvas.width}×${canvas.height} · ${frameDrawCalls} draws · ${staticDrawCount} instanced · ${qualityMode} ${modeScale(qualityMode,quality).toFixed(2)}× · scene ${state.revision}`;}
}
function nearby(){const list=[...renderAgents.map(a=>({id:a.id,x:a.renderX,z:a.renderZ,action:`talk to ${a.name}`,agent:a})),{id:'portal',x:3,z:-10.2,action:'step through the portal'},{id:'tank',x:-.9,z:-4.5,action:'inspect the fish tank'},{id:'workshop',x:-4.9,z:-3.5,action:'inspect the workspace'},{id:'pond',x:7,z:-3.5,action:'admire Glasswater Pond'},{id:'cove',x:13,z:9,action:'return through the cove portal'}];const found=list.map(x=>({...x,d:Math.hypot(camera.x-x.x,camera.z-x.z)})).sort((a,b)=>a.d-b.d)[0];return found&&found.d<3.2?found:null;}
function notify(msg){$('prompt').textContent=msg;$('result').textContent=msg;}
function interact(){const n=nearby();if(!n){notify('Explore closer to a person or an interesting object.');return;}if(n.id==='portal'){camera.x=13;camera.z=9;notify('The portal hums softly. Welcome to the Sunlit Cove.');return;}if(n.id==='cove'){camera.x=2;camera.z=-8;notify('You have returned to Mossmere.');return;}if(n.agent){const a=state.agents.find(x=>x.id===n.id);a.memories=[...a.memories.slice(-7),`Visitor said hello while ${n.agent.activity.toLowerCase()}.`];state.revision++;persist();notify(`${n.agent.name} · ${n.agent.activity}: “${n.agent.dialogue}”`);return;}notify({tank:'Three tiny fish glide through the sunlit tank.',workshop:'A living workspace. The notebook on the desk is waiting for ideas.',pond:'The pond reflects the afternoon light. Little lily pads float across it.'}[n.id]);}
function persist(){if(visitingShared)return;try{state=saveWorld(localStorage,state);}catch(e){console.warn('World save unavailable:',e);}}
function runCommand(command){const result=applyCommand(state,command);if(result.world!==state){state=result.world;persist();}notify(result.message+(visitingShared?' Preview only until you save a copy.':''));$('command').value='';}
$('start').onclick=()=>{started=true;$('intro').classList.add('hide');$('hud').classList.remove('hidden');if(matchMedia('(pointer:coarse)').matches){$('joystick').classList.remove('hidden');$('touchhint').classList.remove('hidden');}};
$('help').onclick=()=>{$('modal').classList.remove('hidden');};$('closeModal').onclick=$('gotIt').onclick=()=>{$('modal').classList.add('hidden');};
$('buildToggle').onclick=()=>{editorOpen=!editorOpen;$('editor').classList.toggle('hidden',!editorOpen);if(editorOpen&&matchMedia('(pointer:fine)').matches)$('command').focus();};$('closeEditor').onclick=()=>{editorOpen=false;$('editor').classList.add('hidden');$('buildToggle').focus({preventScroll:true});};
function adjustMobileEditorForKeyboard(){
 const vp=window.visualViewport;
 if(!vp)return;
 const covered=Math.max(0,Math.round(window.innerHeight-vp.height-vp.offsetTop));
 document.documentElement.style.setProperty('--keyboard-bottom',covered+'px');
}
window.visualViewport?.addEventListener('resize',adjustMobileEditorForKeyboard);
window.visualViewport?.addEventListener('scroll',adjustMobileEditorForKeyboard);
adjustMobileEditorForKeyboard();
$('interact').onclick=interact;$('save').onclick=()=>{
 if(visitingShared){
  if(!window.confirm('Save a copy of this shared world? This will replace your existing local Mossmere save.'))return;
  visitingShared=false;
  forgetCloudOwner();
  $('save').textContent='Save';
 }
 state.player={x:camera.x,z:camera.z,yaw:camera.yaw};persist();
 notify('World saved to this browser. Come back whenever you like.');
};
$('share').onclick=async()=>{
 try{
  const url=sharedSceneUrl(location.href,state);
  if(typeof navigator.share==='function'){
   try{await navigator.share({title:'Evercraft Worlds · Mossmere',text:'Explore my world',url});notify('World link shared.');return;}
   catch(err){if(err?.name==='AbortError')return;}
  }
  if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url);notify('World link copied. Paste it into a message to invite someone.');return;}
  window.prompt('Copy this world link:',url);
 }catch(err){notify('Could not prepare link: '+err.message);}
};
async function readSharedInvitation(){
 const params=new URLSearchParams(location.hash.replace(/^#/,''));
 const token=params.get('scene'),worldId=params.get('world');
 if(!token&&!worldId)return;
 try{
  pendingShared=token?decodeSharedScene(token):await fetchPublishedWorld(worldId);
  $('sharedInvite').classList.remove('hidden');
 }catch(err){
  console.warn('World invitation unavailable:',err.message);
  $('intro').querySelector('p').textContent='This shared world could not load. You can still explore your own Mossmere world.';
 }
}
$('visitShared').onclick=()=>{
 if(!pendingShared)return;
 state=pendingShared;pendingShared=null;visitingShared=true;
 camera.x=state.player.x;camera.z=state.player.z;camera.yaw=state.player.yaw;
 $('sharedInvite').classList.add('hidden');
 $('save').textContent='Save copy';
 notify('Exploring a shared scene. Your saved local world is unchanged until you choose Save copy.');
};
$('keepLocal').onclick=()=>{
 pendingShared=null;$('sharedInvite').classList.add('hidden');
 history.replaceState(null,'',location.pathname+location.search);
};
readSharedInvitation();
$('publishOnline').onclick=async()=>{
 if(visitingShared){notify('Save a local copy before publishing this visited scene.');return;}
 const button=$('publishOnline');button.disabled=true;button.textContent='Saving…';
 try{
  cloudOwner=await publishWorld(state,cloudOwner);
  localStorage.setItem(CLOUD_KEY,JSON.stringify(cloudOwner));
  $('unpublishOnline').classList.remove('hidden');
  const url=publishedWorldUrl(location.href,cloudOwner.id);
  $('cloudStatus').textContent='Online revision '+cloudOwner.version+' · unlisted link ready';
  if(navigator.clipboard?.writeText){
   try{await navigator.clipboard.writeText(url);notify('World saved online. Its visit link was copied!');}
   catch{window.prompt('Your online world visit link:',url);notify('World saved online.');}
  }else{window.prompt('Your online world visit link:',url);notify('World saved online.');}
 }catch(err){notify('Online save did not complete: '+err.message);}
 finally{button.disabled=false;button.textContent='Save online';}
};
$('unpublishOnline').onclick=async()=>{
 if(visitingShared||!cloudOwner){notify('Only the original world creator can unpublish.');return;}
 if(!window.confirm('Unpublish this online world? Existing visit links will stop working. Your local world stays saved. Private backups may still retain earlier copies.'))return;
 const button=$('unpublishOnline');button.disabled=true;
 try{
  await unpublishWorld(cloudOwner);
  forgetCloudOwner();
  $('cloudStatus').textContent='This world is no longer online. Your local copy is untouched.';
  notify('Online world unpublished. Its old visit link no longer works.');
 }catch(err){notify('Unpublish failed. Online world remains available: '+err.message);}
 finally{button.disabled=false;}
};
$('commandForm').onsubmit=e=>{e.preventDefault();runCommand($('command').value);};document.querySelectorAll('[data-command]').forEach(b=>b.onclick=()=>runCommand(b.dataset.command));
$('download').onclick=()=>{state.player={x:camera.x,z:camera.z,yaw:camera.yaw};persist();const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='evercraft-worlds-mossmere.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),500);};
$('upload').onchange=async e=>{try{const file=e.target.files?.[0];if(!file||file.size>200000)throw Error('Choose a world JSON under 200 KB');const w=validateWorld(JSON.parse(await file.text()));state=w;camera.x=w.player.x;camera.z=w.player.z;camera.yaw=w.player.yaw;visitingShared=false;forgetCloudOwner();$('save').textContent='Save';persist();notify('World imported successfully.');}catch(err){notify(`Import rejected: ${err.message}`);}e.target.value='';};
addEventListener('keydown',e=>{if(document.activeElement?.tagName==='INPUT')return;keys[e.code]=true;if(e.code==='KeyE'){e.preventDefault();interact();}if(e.code==='KeyB'&&started){e.preventDefault();$('buildToggle').click();}if(e.code==='Space'&&camera.y<=1.721){camera.vy=5.1;e.preventDefault();}});addEventListener('keyup',e=>{keys[e.code]=false;});addEventListener('blur',()=>{keys={};joystick={x:0,y:0};});
let pointer=null;canvas.addEventListener('pointerdown',e=>{if(!started||editorOpen||!$('modal').classList.contains('hidden'))return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointermove',e=>{if(!pointer||pointer.id!==e.pointerId)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;camera.yaw+=dx*.004;camera.pitch=Math.max(-1.18,Math.min(1.18,camera.pitch-dy*.0034));pointer.x=e.clientX;pointer.y=e.clientY;});canvas.addEventListener('pointerup',()=>{pointer=null;});
let stickPointer=null;const stick=$('joystick'),thumb=$('joystickThumb');function stickMove(e){const r=stick.getBoundingClientRect(),x=e.clientX-(r.left+r.width/2),y=e.clientY-(r.top+r.height/2),rad=Math.max(25,r.width*.4),scale=Math.min(1,rad/(Math.hypot(x,y)||1));joystick={x:x*scale/rad,y:y*scale/rad};thumb.style.transform=`translate(${joystick.x*rad}px,${joystick.y*rad}px)`;}stick.addEventListener('pointerdown',e=>{stickPointer=e.pointerId;stick.setPointerCapture(e.pointerId);stickMove(e);});stick.addEventListener('pointermove',e=>{if(stickPointer===e.pointerId)stickMove(e);});function releaseStick(){stickPointer=null;joystick={x:0,y:0};thumb.style.transform='translate(0,0)';}stick.addEventListener('pointerup',releaseStick);stick.addEventListener('pointercancel',releaseStick);
addEventListener('pagehide',()=>{state.player={x:camera.x,z:camera.z,yaw:camera.yaw};persist();});
requestAnimationFrame(present);