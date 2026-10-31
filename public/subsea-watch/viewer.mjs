import {normalizeDive,parseInput,atTime,segments,brief} from './core.mjs';
const $=id=>document.getElementById(id);
const world=$('world'),profile=$('profile'),ctx=world.getContext('2d'),chart=profile.getContext('2d');
let dive=null,current=0,playing=false,speed=1,lastFrame=0;
let camera={yaw:-.47,pitch:.50,zoom:1},drag=null;
const fmt=t=>String(Math.floor(t/60)).padStart(2,'0')+':'+String(Math.floor(t%60)).padStart(2,'0');
const clamp=(x,min,max)=>Math.min(max,Math.max(min,x));
function dimensions(canvas,context){
 const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
 const w=Math.max(1,Math.round(rect.width)),h=Math.max(1,Math.round(rect.height));
 if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
 context.setTransform(dpr,0,0,dpr,0,0);return {w,h};
}
function projector(w,h){
 const {yaw,pitch,zoom}=camera,cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
 const base=Math.min(w/64,h/30)*zoom;
 return (x,y,depth)=>{
  const u=x*cy-y*sy,back=x*sy+y*cy;
  const v=(depth-7.5)*cp+back*sp;
  const distance=18+back*cp-(depth-7.5)*sp;
  const factor=base*18/Math.max(8,distance+18);
  return {x:w*.50+u*factor,y:h*.49+v*factor,factor};
 };
}
function line(p,a,b,color,width=1,dash=[]){
 const x=p(a[0],a[1],a[2]),y=p(b[0],b[1],b[2]);ctx.save();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);
 ctx.beginPath();ctx.moveTo(x.x,x.y);ctx.lineTo(y.x,y.y);ctx.stroke();ctx.restore();
}
function txt(text,x,y,color='#d8edef',size=11,align='left'){
 ctx.fillStyle=color;ctx.textAlign=align;ctx.font=size+'px system-ui,sans-serif';ctx.fillText(text,x,y);
}
function circle(x,y,r,fill,stroke){
 ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();
 if(stroke){ctx.lineWidth=1.6;ctx.strokeStyle=stroke;ctx.stroke();}
}
function drawScene(){
 if(!ctx)return;
 const {w,h}=dimensions(world,ctx);ctx.clearRect(0,0,w,h);
 const grad=ctx.createLinearGradient(0,0,0,h);grad.addColorStop(0,'#0e4657');grad.addColorStop(.58,'#0b293d');grad.addColorStop(1,'#071826');
 ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);
 const p=projector(w,h);
 for(let g=-24;g<=24;g+=4){line(p,[g,-23,16],[g,23,16],'#3762735e');line(p,[-24,g,16],[24,g,16],'#3762735e');}
 for(let g=-24;g<=24;g+=8){line(p,[g,-23,0],[g,23,0],'#79d0d433',.7);line(p,[-24,g,0],[24,g,0],'#79d0d433',.7);}
 for(let z=0;z<=16;z+=4){const pt=p(-24,-22,z);txt(z+' m',pt.x-9,pt.y-4,'#b9d6dc',10,'right');}
 line(p,[-24,-22,0],[-24,-22,16],'#79b8c1',1.4);
 const water=p(-23,-18,0),floor=p(-23,-18,16);
 txt('WATER SURFACE / REFERENCE',clamp(water.x,12,w-215),Math.max(22,water.y-11),'#a3d7dd',10);
 txt('ILLUSTRATIVE GRID — NOT BATHYMETRY',clamp(floor.x,12,w-260),Math.min(h-27,floor.y+18),'#8eb6c3',9);
 if(!dive||!dive.xyAvailable)return;
 if(dive.infrastructure){
  const pipe=dive.infrastructure,a=[pipe.x-pipe.length/2,pipe.y,pipe.depth],b=[pipe.x+pipe.length/2,pipe.y,pipe.depth];
  line(p,a,b,'#ffba5a63',21);line(p,a,b,'#c8a77c',13);line(p,a,b,'#433e2c',6);
  const pt=p(pipe.x,pipe.y,pipe.depth);txt('ILLUSTRATIVE PIPE',clamp(pt.x+15,10,w-128),clamp(pt.y-20,25,h-20),'#ffd39d',10);
 }
 for(const s of segments(dive))line(p,[s.a.x,s.a.y,s.a.depth],[s.b.x,s.b.y,s.b.depth],dive.demo?'#74efe5b3':'#76ecf5a9',3.2);
 const pt=atTime(dive,current);
 if(pt.x!==null){
  const d=p(pt.x,pt.y,pt.depth),shadow=p(pt.x,pt.y,16);
  line(p,[pt.x,pt.y,pt.depth],[pt.x,pt.y,16],'#d0f4ec6a',1.5,[3,5]);
  circle(shadow.x,shadow.y,4,'#b4d2d462');
  circle(d.x,d.y,8,'#80eee5','#f5ffff');circle(d.x-2,d.y-2,2.3,'#e7fcff');
  txt(dive.demo?'SAMPLE DIVER':'DECLARED TRACK',clamp(d.x+13,7,w-158),clamp(d.y-13,20,h-20),'#e7ffff',11);
 }
}
function depthChart(){
 if(!chart||!dive)return;
 const {w,h}=dimensions(profile,chart);chart.clearRect(0,0,w,h);
 const left=38,right=w-13,top=13,bottom=h-27;
 const maxDepth=Math.max(5,Math.ceil(dive.maxDepth/5)*5),pts=dive.points,start=pts[0].t,duration=dive.duration;
 chart.font='10px system-ui';chart.textAlign='right';
 for(let k=0;k<=4;k++){const dep=maxDepth*k/4,y=top+(bottom-top)*k/4;chart.strokeStyle='#325567';chart.lineWidth=1;chart.beginPath();chart.moveTo(left,y);chart.lineTo(right,y);chart.stroke();chart.fillStyle='#adc7d0';chart.fillText(dep.toFixed(0)+'m',left-6,y+3);}
 chart.textAlign='left';chart.fillStyle='#a7c2ca';chart.fillText(fmt(start),left,bottom+17);chart.textAlign='right';chart.fillText(fmt(pts.at(-1).t),right,bottom+17);
 const x=t=>left+(t-start)/Math.max(1,duration)*(right-left),y=d=>top+d/maxDepth*(bottom-top);
 chart.lineWidth=2.4;chart.strokeStyle='#80e0d7';chart.beginPath();
 pts.forEach((pt,i)=>{if(i===0||pt.t-pts[i-1].t>15)chart.moveTo(x(pt.t),y(pt.depth));else chart.lineTo(x(pt.t),y(pt.depth));});chart.stroke();
 const snap=atTime(dive,current),px=x(current);
 chart.setLineDash([3,4]);chart.strokeStyle='#ffda96';chart.lineWidth=1.6;chart.beginPath();chart.moveTo(px,top);chart.lineTo(px,bottom);chart.stroke();chart.setLineDash([]);
 if(snap.depth!==null){chart.beginPath();chart.arc(px,y(snap.depth),4.1,0,Math.PI*2);chart.fillStyle='#f9deb1';chart.fill();}
}
function update(){
 if(!dive)return;
 const point=atTime(dive,current);
 $('mission-title').textContent=dive.title;$('time').textContent=fmt(current)+' / '+fmt(dive.points.at(-1).t);
 $('depth').textContent=point.depth===null?'No reading':point.depth.toFixed(1)+' m';$('maximum').textContent=dive.maxDepth.toFixed(1)+' m';$('elapsed').textContent=fmt(current);
 $('position').textContent=dive.demo?'Simulated':dive.xyAvailable?'User-declared':'Not available';
 $('position').className=dive.demo||!dive.xyAvailable?'uncertain':'value';
 $('scene-status').textContent=dive.demo?'SYNTHETIC EXAMPLE':dive.xyAvailable?'USER-DECLARED TRACK':'NO XY TRACK';
 $('scene-sub').textContent=dive.demo?'No actual dive, hazard or facility':dive.xyAvailable?'Coordinates are not independently verified':'Depth only, no horizontal route';
 $('state').textContent=point.depthState==='gap_unobserved'?'Time gap · depth and position unknown':point.positionState==='gap_not_interpolated'?'Position gap · not inferred':dive.demo?'Sample position · synthetic':dive.xyAvailable?'Position source: '+dive.positionSource:'Depth only · no XY';
 $('no-xy').hidden=dive.xyAvailable;
 $('source-type').textContent=dive.demo?'Synthetic demonstration':dive.xyAvailable?dive.positionSource+' user-declared positioning':'Depth-only imported data';
 $('source-description').textContent=dive.provenance;
 $('pipe-status').textContent=dive.demo?'Illustrative sample pipe':'No mapped infrastructure from this file';
 $('pipe-description').textContent=dive.demo?'Flow, isolation and proximity are unknown. Not a safe-distance illustration.':'This replay cannot confirm any site is free of pipes, intakes or Delta-P hazards.';
 $('scrub').min=dive.points[0].t;$('scrub').max=dive.points.at(-1).t;$('scrub').value=current;
 drawScene();depthChart();
}
function stop(){playing=false;$('play').textContent='▶ Play';}
function setDive(value){
 dive=normalizeDive(value);stop();current=dive.points[0].t;update();
}
function tick(time){
 if(playing&&dive){
  current=Math.min(dive.points.at(-1).t,current+(time-lastFrame)/1000*speed);
  if(current>=dive.points.at(-1).t)stop();update();
 }
 lastFrame=time;requestAnimationFrame(tick);
}
$('play').addEventListener('click',()=>{
 if(!dive)return;
 if(playing)stop();else{if(current>=dive.points.at(-1).t)current=dive.points[0].t;playing=true;$('play').textContent='Ⅱ Pause';}
});
$('speed').addEventListener('click',()=>{speed=({1:2,2:4,4:0.5,0.5:1})[speed]||1;$('speed').textContent=speed+'× speed';});
$('scrub').addEventListener('input',e=>{if(dive){current=Number(e.target.value);update();}});
$('zoom-in').addEventListener('click',()=>{camera.zoom=clamp(camera.zoom*1.22,.48,2.5);drawScene();});
$('zoom-out').addEventListener('click',()=>{camera.zoom=clamp(camera.zoom/1.22,.48,2.5);drawScene();});
$('reset-camera').addEventListener('click',()=>{camera={yaw:-.47,pitch:.5,zoom:1};drawScene();});
world.addEventListener('pointerdown',e=>{world.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY,yaw:camera.yaw,pitch:camera.pitch};});
world.addEventListener('pointermove',e=>{if(!drag)return;camera.yaw=drag.yaw+(e.clientX-drag.x)*.009;camera.pitch=clamp(drag.pitch+(e.clientY-drag.y)*.008,.15,1.25);drawScene();});
world.addEventListener('pointerup',()=>drag=null);world.addEventListener('pointercancel',()=>drag=null);
world.addEventListener('wheel',e=>{e.preventDefault();camera.zoom=clamp(camera.zoom*(e.deltaY>0?.92:1.08),.48,2.5);drawScene();},{passive:false});
$('import-btn').addEventListener('click',()=>$('file-input').click());
$('file-input').addEventListener('change',async e=>{
 const f=e.target.files?.[0];if(!f)return;
 try{
  if(f.size>2000000)throw Error('Files over 2 MB are not supported in this prototype.');
  const data=parseInput(await f.text(),f.name);
  // Retain validated coordinates, depth, and explicit positioning method.
  const points=data.points.map(p=>({t_s:p.t,depth_m:p.depth,x_m:p.x,y_m:p.y,position_source:p.position_source,note:p.label}));
  setDive({title:data.title,provenance:data.provenance,position_source:data.positionSource,points});
 }catch(error){window.alert('Could not open dive record: '+error.message);}
 e.target.value='';
});
$('export').addEventListener('click',()=>{
 if(!dive)return;
 const url=URL.createObjectURL(new Blob([brief(dive)],{type:'text/plain;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='subsea-watch-evidence-brief.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
async function loadSample(){
 try{const r=await fetch('./sample.json',{cache:'no-store'});if(!r.ok)throw Error('Sample HTTP '+r.status);setDive(await r.json());}
 catch(error){$('mission-title').textContent='Sample unavailable';$('scene-status').textContent='SAMPLE NOT LOADED';$('scene-sub').textContent=error.message;$('no-xy').hidden=false;drawScene();}
}
$('load-demo').addEventListener('click',loadSample);
window.addEventListener('resize',()=>{drawScene();depthChart();});
requestAnimationFrame(tick);loadSample();
