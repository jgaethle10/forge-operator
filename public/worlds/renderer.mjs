// Original, zero-dependency WebGL2 miniature-world renderer.
// Right-handed, Y-up meters. WebGL2 is the V0 browser adapter, not the canonical Node engine.
const VERT=`#version 300 es
in vec3 a_pos; in vec3 a_normal;
uniform mat4 u_proj,u_view,u_model;
out vec3 v_normal;out vec3 v_world;out float v_depth;
void main(){vec4 p=u_model*vec4(a_pos,1.);v_world=p.xyz;v_normal=mat3(u_model)*a_normal;vec4 eye=u_view*p;v_depth=length(eye.xyz);gl_Position=u_proj*eye;}`;
const FRAG=`#version 300 es
precision mediump float;in vec3 v_normal;in vec3 v_world;in float v_depth;
uniform vec3 u_color,u_fog,u_sun;uniform float u_alpha,u_glow;out vec4 frag;
void main(){vec3 n=normalize(v_normal);float d=max(dot(n,normalize(u_sun)),0.);float side=.72+d*.36;float highlight=pow(max(dot(reflect(-normalize(u_sun),n),normalize(vec3(.15,.8,1.))),0.),24.);
vec3 c=u_color*(side+u_glow)+highlight*.13;float fog=clamp((v_depth-24.)/65.,0.,.65);c=mix(c,u_fog,fog);frag=vec4(c,u_alpha);}`;
const I=()=>[1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
function perspective(fov,aspect,near,far){const f=1/Math.tan(fov/2),nf=1/(near-far);return [f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0]}
function lookAt(eye,center,up=[0,1,0]){let z=normalize(sub(eye,center)),x=normalize(cross(up,z)),y=cross(z,x);return [x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]}
const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],normalize=a=>{let l=Math.hypot(...a)||1;return a.map(v=>v/l)};
function model(x,y,z,sx,sy,sz,rot=0){const c=Math.cos(rot),s=Math.sin(rot);return [c*sx,0,-s*sx,0,0,sy,0,0,s*sz,0,c*sz,0,x,y,z,1]}
function hexColor(hex){const v=hex.replace('#','');return [0,2,4].map(i=>parseInt(v.slice(i,i+2),16)/255)}
function createBox(){let p=[],n=[],ind=[];const faces=[[[0,0,1],[[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]]],[[0,0,-1],[[.5,-.5,-.5],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5]]],[[1,0,0],[[.5,-.5,.5],[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5]]],[[-1,0,0],[[-.5,-.5,-.5],[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5]]],[[0,1,0],[[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5],[-.5,.5,-.5]]],[[0,-1,0],[[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5]]]];for(const [norm,pts] of faces){let k=p.length/3;pts.forEach(q=>{p.push(...q);n.push(...norm)});ind.push(k,k+1,k+2,k,k+2,k+3)}return{p,n,ind}}
function paramMesh(rows,cols,at,closed=true){const p=[],n=[],ind=[];for(let i=0;i<=rows;i++)for(let j=0;j<=cols;j++){let a=at(i/rows,j/cols);p.push(...a.p);n.push(...normalize(a.n))}for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){let a=i*(cols+1)+j,b=a+cols+1;ind.push(a,b,a+1,b,b+1,a+1)}return{p,n,ind}}
function sphere(){return paramMesh(16,24,(v,u)=>{let phi=v*Math.PI,theta=u*Math.PI*2;const p=[Math.sin(phi)*Math.cos(theta)*.5,Math.cos(phi)*.5,Math.sin(phi)*Math.sin(theta)*.5];return{p,n:p}})}
function cylinder(){return paramMesh(1,40,(v,u)=>{const a=u*Math.PI*2;return{p:[Math.cos(a)*.5,v-.5,Math.sin(a)*.5],n:[Math.cos(a),0,Math.sin(a)]}})}
function cone(){return paramMesh(8,30,(v,u)=>{let a=u*Math.PI*2,r=(1-v)*.5;return{p:[Math.cos(a)*r,v-.5,Math.sin(a)*r],n:[Math.cos(a),.5,Math.sin(a)]}})}
function torus(){return paramMesh(12,40,(v,u)=>{const a=u*Math.PI*2,b=v*Math.PI*2,R=.5,r=.095;return{p:[(R+r*Math.cos(b))*Math.cos(a),(R+r*Math.cos(b))*Math.sin(a),r*Math.sin(b)],n:[Math.cos(b)*Math.cos(a),Math.cos(b)*Math.sin(a),Math.sin(b)]}})}
function compile(gl,type,src){const sh=gl.createShader(type);gl.shaderSource(sh,src);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh}
export class WorldRenderer{
 constructor(canvas){this.canvas=canvas;this.gl=canvas.getContext('webgl2',{antialias:true,alpha:false,depth:true,powerPreference:'high-performance'});if(!this.gl)throw Error('WebGL2 unavailable on this device');const gl=this.gl;const prog=gl.createProgram();gl.attachShader(prog,compile(gl,gl.VERTEX_SHADER,VERT));gl.attachShader(prog,compile(gl,gl.FRAGMENT_SHADER,FRAG));gl.linkProgram(prog);if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(prog));gl.useProgram(prog);this.prog=prog;this.u={};for(const k of ['proj','view','model','color','fog','sun','alpha','glow'])this.u[k]=gl.getUniformLocation(prog,'u_'+k);this.meshes={};for(const [name,source] of Object.entries({box:createBox(),sphere:sphere(),cylinder:cylinder(),cone:cone(),torus:torus()})){let vao=gl.createVertexArray();gl.bindVertexArray(vao);for(const [attr,data] of [['a_pos',source.p],['a_normal',source.n]]){let buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);let loc=gl.getAttribLocation(prog,attr);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,0,0)}let buf=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,buf);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(source.ind),gl.STATIC_DRAW);this.meshes[name]={vao,count:source.ind.length}}gl.bindVertexArray(null);gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);this.drawCount=0;this.resize();}
 resize(){const dpr=Math.min(window.devicePixelRatio||1,1.6),w=Math.round(this.canvas.clientWidth*dpr),h=Math.round(this.canvas.clientHeight*dpr);if(w!==this.canvas.width||h!==this.canvas.height){this.canvas.width=w;this.canvas.height=h;this.gl.viewport(0,0,w,h)}this.aspect=w/Math.max(1,h)}
 begin(cam,lighting){this.resize();let bg=lighting==='night'?'#1b284b':lighting==='sunset'?'#bc90a4':'#91bdb8', fog=hexColor(bg);const gl=this.gl;gl.clearColor(...fog,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.prog);const eye=[cam.x,cam.y,cam.z],dir=[Math.sin(cam.yaw)*Math.cos(cam.pitch),Math.sin(cam.pitch),-Math.cos(cam.yaw)*Math.cos(cam.pitch)],center=eye.map((n,i)=>n+dir[i]);gl.uniformMatrix4fv(this.u.proj,false,perspective(Math.PI*.37,this.aspect,.07,160));gl.uniformMatrix4fv(this.u.view,false,lookAt(eye,center));gl.uniform3fv(this.u.fog,fog);gl.uniform3fv(this.u.sun,lighting==='night'?[.2,1,-.3]:lighting==='sunset'?[-.9,.6,-.1]:[-.6,1,.6]);this.drawCount=0;this.transparent=[];}
 shape(mesh,pos,scale,color,options={}){const gl=this.gl,m=this.meshes[mesh];if(!m)return;if(options.alpha!==undefined&&options.alpha<1){this.transparent.push({mesh,pos,scale,color,options});return}this.renderMesh(mesh,pos,scale,color,options)}
 renderMesh(mesh,pos,scale,color,{rot=0,alpha=1,glow=0}={}){const gl=this.gl,m=this.meshes[mesh];gl.uniformMatrix4fv(this.u.model,false,model(...pos,...scale,rot));gl.uniform3fv(this.u.color,typeof color==='string'?hexColor(color):color);gl.uniform1f(this.u.alpha,alpha);gl.uniform1f(this.u.glow,glow);gl.bindVertexArray(m.vao);gl.drawElements(gl.TRIANGLES,m.count,gl.UNSIGNED_SHORT,0);this.drawCount++}
 finish(){if(this.transparent.length){const gl=this.gl;gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);for(const i of this.transparent)this.renderMesh(i.mesh,i.pos,i.scale,i.color,i.options);gl.depthMask(true);gl.disable(gl.BLEND)}}
}
// A small geometry vocabulary keeps all scene authoring data editable and portable.
export function drawEnvironment(r,s,t,residentPositions){
 const sh=(m,x,y,z,sx,sy,sz,col,opt)=>r.shape(m,[x,y,z],[sx,sy,sz],col,opt);
 const B=(x,y,z,sx,sy,sz,col,opt)=>sh('box',x,y,z,sx,sy,sz,col,opt),S=(x,y,z,sx,sy,sz,col,opt)=>sh('sphere',x,y,z,sx,sy,sz,col,opt),C=(x,y,z,sx,sy,sz,col,opt)=>sh('cylinder',x,y,z,sx,sy,sz,col,opt),T=(x,y,z,sx,sy,sz,col,opt)=>sh('torus',x,y,z,sx,sy,sz,col,opt);
 // Floating sculpted island and swaths of grass.
 C(0,-1.3,0,47,2.5,47,'#c8a8a2');C(0,-.04,0,46.7,.11,46.7,'#8dc8a5');
 for(let i=0;i<48;i++){const a=i*2.39996,rad=16+(i%5)*1.2;S(Math.cos(a)*rad,-.03,Math.sin(a)*rad,1.2+(i%3)*.5,.28,1.3,'#8bcba9')}
 // Curving pebble path from the studio to meadow.
 for(let i=0;i<14;i++){let z=11-i*.67,x=1.6+Math.sin(i*.55)*.38;S(x,.015,z,.62,.04,.43,i%2?'#f9e9d1':'#f4d8cb')}
 // The open-sided warm studio with beautiful windows, polished floor, softly lit roof.
 B(0,.10,-1.5,11,.22,8,'#f4e9da');B(0,2,-5.52,11,3.9,.24,'#e6d2c9');B(-5.55,1.9,-1.5,.24,3.7,8,'#efddd0');B(5.55,1.9,-1.5,.24,3.7,8,'#e7d0c1');B(0,4.05,-1.5,11.9,.3,8.75,'#826f8d');B(0,4.24,-1.5,12.2,.18,9,'#ab9ec2');
 for(const x of [-3.9,3.9])for(const z of [-3.5,-1.3,1]){B(x,2.15,z,.055,2,.07,'#c7ad91');B(x,2.15,z,.12,1.6,1.55,'#a0d9db',{alpha:.20})}
 B(0,3.8,2.4,11.5,.24,.24,'#fcddbc');for(let i=0;i<7;i++)B(-4.7+i*1.55,3.79,2.4,.07,.06,.2,'#fff3ce',{glow:.5});
 // Lounge rug, desk, computer, large dark monitor, lamp, plant stand, cabinet.
 B(0,.235,-1.25,6,.035,4.3,'#b8a2c8');B(.45,1.06,-1.8,3.45,.2,1.35,'#d3a989');for(const x of [-.85,1.8])for(const z of [-2.2,-1.3])B(x,.65,z,.15,1,.15,'#806a76');
 B(.5,1.60,-2.35,1.65,.95,.14,'#3c435b');B(.5,1.64,-2.25,1.46,.76,.045,'#9a9bd5',{glow:.16});B(.5,1.47,-2.16,.7,.19,.06,'#e6d3e8');B(.5,1.14,-1.4,.88,.035,.35,'#f9e7d7');
 B(-2.75,.55,-3.85,2.4,1.0,1.0,'#c6908f');B(-2.75,1,-4.25,2.4,.8,.20,'#bc7c92');S(-3.65,1.1,-3.7,.5,.3,.6,'#e7bfaa');S(-1.85,1.1,-3.7,.5,.3,.6,'#f0d1c7');
 B(3.45,1.12,-4,2.25,1.7,.8,'#91acb9',{alpha:.29});B(3.45,.22,-4,2.33,.35,.95,'#f9e5d0');B(3.45,2.06,-4,2.37,.15,.95,'#d9bfc0');
 // Actual tank fish swim in sinusoidal 3D loops and plants sit underwater.
 B(3.45,1.12,-4,2.16,1.53,.73,'#74bec7',{alpha:.19});for(let i=0;i<3;i++){let x=3.45+Math.sin(t*(.7+i*.18)+i*2)*.73,z=-4+Math.cos(t*(.7+i*.18)+i*2)*.23,y=1+.2*Math.sin(t*.9+i);S(x,y,z,.24,.13,.11,['#ffe6ad','#f5a5c6','#abdcf2'][i]);S(x-.16,y,z,.13,.15,.12,['#ffe6ad','#f5a5c6','#abdcf2'][i])}
 for(const x of [2.55,3.15,4.1]){C(x,.62,-4.1,.10,.48,.1,'#5b9c8d');S(x,.93,-4.1,.22,.35,.18,'#6bd1b0')}
 // Book shelves, art, desk stool, glowing pendant.
 for(const z of [-4.25,-3.6])B(-4.6,1.35,z,.75,.07,.35,'#ae8fa4');for(let i=0;i<9;i++)B(-4.6,1.55,-4.45+i*.11,.44,.32,.08,['#d6b39c','#a8b6cc','#d9b7c8'][i%3]);
 C(1.55,.56,.1,.75,.16,.75,'#d8b6a3');C(1.55,.3,.1,.18,.7,.18,'#877883');C(-.1,3.35,-1.8,.6,.3,.6,'#ffe8b4',{glow:.65});
 // Pond, water glimmer, shoreline stones, lily pads and reeds.
 S(-8.9,.045,7.7,9,.06,6.5,'#65bbc6',{alpha:.78});S(-8.9,.001,7.7,9.5,.09,7,'#d8c0ac');S(-8.9,.055,7.7,9,.06,6.6,'#75cbd2',{alpha:.73});
 for(let i=0;i<21;i++){let a=i*Math.PI*2/21,x=-8.9+Math.cos(a)*4.5,z=7.7+Math.sin(a)*3.4;S(x,.09,z,.7,.28,.55,'#c7c2af')}
 for(let i=0;i<7;i++){let x=-11.4+(i%4)*1.2,z=6.7+Math.floor(i/4)*1.7;S(x,.1,z,.8,.06,.56,'#8dd4ad');S(x+.16,.17,z-.08,.18,.14,.19,'#efb2d3')}
 // Distant pastel firs frame the miniature world.
 for(let i=0;i<26;i++){let a=i*2.39996,rad=14.5+(i%4)*1.65,x=Math.cos(a)*rad,z=Math.sin(a)*rad;if(x>-4&&x<5&&z>-7&&z<6)continue;C(x,.7,z,.23,1.6,.23,'#998c7f');S(x,2.05,z,1.5,2.1,1.5,['#75b7a0','#6fac9e','#9acdab','#8ec2a6'][i%4]);S(x+.35,2.5,z-.24,1.2,1.25,1.2,'#9bd1b3')}
 // Tiny lantern path and benches.
 for(let i=0;i<7;i++){let x=-3.7+i*1.9,z=8+Math.cos(i*.8)*2.7;C(x,.44,z,.07,.9,.07,'#8c8790');S(x,.96,z,.27,.35,.27,'#ffdfab',{glow:.8})}
 // A sculpted petal bed, small stones and animated firefly lights.
 for(let i=0;i<50;i++){let a=i*2.39996,rad=3.3+(i%9)*.35,x=9.9+Math.cos(a)*rad,z=11+Math.sin(a)*rad;if(x>20||z>20)continue;C(x,.23,z,.045,.4,.045,'#58927c');S(x,.47,z,.17,.21,.17,['#d5a9f5','#f7b6bd','#f8e7bd'][i%3]);}
 for(let i=0;i<18;i++){let a=i*1.89,x=10+Math.cos(a)*(2+i%3),z=10+Math.sin(a)*(2+i%3);S(x,.8+Math.sin(t*.9+i)*.22,z,.075,.075,.075,'#ffedc1',{glow:1.3})}
 // All permanent and visitor-built items go through the same editable scene state.
 for(const o of s.objects){const x=o.x,y=o.y,z=o.z,k=o.kind,c=o.color,f=o.size||1;
   if(k==='tree'){C(x,y+.75*f,z,.45*f,1.5*f,.45*f,'#a07c80');S(x,y+2*f,z,1.9*f,1.85*f,1.8*f,c);S(x+.45*f,y+2.5*f,z-.2*f,1.35*f,1.3*f,1.3*f,'#a1e3c7')}
   if(k==='bench'){B(x,y+.58*f,z,1.8*f,.19*f,.72*f,c);B(x,y+.95*f,z+.3*f,1.8*f,.78*f,.17*f,'#ac8297');for(const dx of [-.7,.7])B(x+dx*f,y+.3*f,z,.15*f,.7*f,.15*f,'#857184')}
   if(k==='flower'){C(x,y+.22*f,z,.06*f,.43*f,.06*f,'#5d9e80');for(let i=0;i<5;i++)S(x+Math.sin(i*1.26)*.16*f,y+.47*f,z+Math.cos(i*1.26)*.16*f,.26*f,.22*f,.26*f,c);S(x,y+.48*f,z,.19*f,.19*f,.19*f,'#ffe5a5')}
   if(k==='plant'){C(x,y+.14*f,z,.64*f,.27*f,.64*f,'#d6a6a5');for(let i=0;i<7;i++){let a=i*2.4;S(x+Math.sin(a)*.24*f,y+.55*f,z+Math.cos(a)*.2*f,.28*f,.68*f,.22*f,c,{rot:a})}}
   if(k==='lamp'){C(x,y+.75*f,z,.12*f,1.5*f,.12*f,'#948694');S(x,y+1.65*f,z,.55*f,.65*f,.55*f,c,{glow:.9})}
   if(k==='rock'){S(x,y+.24*f,z,.95*f,.47*f,.8*f,c)}
   if(k==='table'){B(x,y+.8*f,z,1.5*f,.18*f,1.2*f,c);for(const dx of [-.55,.55])for(const dz of [-.42,.42])B(x+dx*f,y+.37*f,z+dz*f,.11*f,.7*f,.11*f,'#977e89')}
   if(k==='crystal'){sh('cone',x,y+.58*f,z,.75*f,1.15*f,.75*f,c,{glow:.7});S(x,y+.06*f,z,.8*f,.15*f,.8*f,'#c3b4ca')}
   if(k==='portal'){T(x,y+1.7*f,z,2.4*f,3.25*f,.6*f,c,{glow:.85});S(x,y+1.7*f,z,2.1*f,3*f,.1*f,c,{alpha:.30,glow:.45});C(x,y+.12*f,z,1.9*f,.22*f,1*f,'#d5bcd5')}
 }
 // Animated residents are procedural beings, not remote LLM agents.
 for(const a of residentPositions){let {x,y,z}=a.pos;S(x,.04,z,.68,.08,.6,'#51756c',{alpha:.20});S(x,y+.23,z,.73,.78,.64,a.color);S(x,y+.58,z,.68,.6,.61,a.color);for(const dx of [-.19,.19]){S(x+dx,y+.62,z-.30,.125,.17,.10,'#fff8f2');S(x+dx,y+.64,z-.39,.06,.09,.04,'#34334e')}S(x,y+.44,z-.335,.10,.07,.09,'#f6c4b3');S(x-.32,y+.05,z,.17,.21,.2,a.color);S(x+.32,y+.05,z,.17,.21,.2,a.color);S(x-.26,y+.94,z,.18,.35,.18,a.color);S(x+.24,y+.98,z,.18,.33,.18,a.color);}
}
export function calculateRay(cam,screenX,screenY,width,height){const nx=(screenX/width)*2-1,ny=1-(screenY/height)*2;let f=Math.tan(Math.PI*.37/2),asp=width/height;const fw=[Math.sin(cam.yaw)*Math.cos(cam.pitch),Math.sin(cam.pitch),-Math.cos(cam.yaw)*Math.cos(cam.pitch)],right=[Math.cos(cam.yaw),0,Math.sin(cam.yaw)],up=normalize(cross(right,fw));return normalize(fw.map((n,i)=>n+right[i]*nx*f*asp+up[i]*ny*f))}
export function rayHit(origin,dir,point,radius){const d=sub(point,origin),t=dot(d,dir);if(t<=0||t>28)return Infinity;const dist=Math.hypot(...sub(d,dir.map(n=>n*t)));return dist<radius?t:Infinity}