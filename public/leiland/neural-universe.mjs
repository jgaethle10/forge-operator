/*
 * LEILAND / The Neural Universe
 * An original architectural illustration. Nodes, sparks, orbital paths and
 * motion are synthetic geometry, NOT real model activations or performance.
 * A separate, short acknowledgement ripple may only be requested by the
 * existing source-attested KAIDANCE cycle gate in brain.js.
 *
 * Native Canvas 2D: zero remote scripts, no inference endpoints, no telemetry
 * stored, no permissions, no WebGL requirement, mobile/low-motion friendly.
 */
export const REGIONS=Object.freeze(['systemia','raven','saban','compute','passport']);
const CENTERS=Object.freeze({
 systemia:[0,-0.56,0.06],
 raven:[-0.59,-0.04,0.07],
 saban:[0.59,-0.04,-0.04],
 compute:[-0.39,0.55,-0.07],
 passport:[0.41,0.55,0.04],
});
const PALETTE=Object.freeze({
 systemia:[117,243,224],
 raven:[112,181,255],
 saban:[189,156,255],
 compute:[107,214,237],
 passport:[250,206,158],
});
const TAU=Math.PI*2,clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const rgba=(rgb,a)=>'rgba('+rgb.join(',')+','+clamp(a,0,1).toFixed(3)+')';
const square=v=>v*v;
function random(seed){
 let s=seed>>>0;
 return ()=>{s=(Math.imul(1664525,s)+1013904223)>>>0;return s/4294967296};
}
// Deliberately deterministic so source data never moves the illustration
// except for the explicitly gated cycle acknowledgement.
export function buildNeuralAtlas({seed=19092026,count=850}={}){
 if(!Number.isInteger(count)||count<25||count>1400)throw Error('atlas_node_count_invalid');
 const rand=random(seed),nodes=[];
 for(let i=0;i<count;i++){
  const region=REGIONS[i%REGIONS.length],center=CENTERS[region];
  // Five overlapping spatial neighborhoods create a walkable brain-shaped
  // sculpture around the central nucleus. Coordinates are entirely invented.
  let a=rand()*TAU,b=(rand()*2-1),rad=Math.cbrt(rand());
  const span=Math.sqrt(1-b*b)*rad,spread=.48;
  const x=center[0]+Math.cos(a)*span*spread;
  const y=center[1]+Math.sin(a)*span*spread*.89;
  const z=center[2]+b*rad*.58;
  nodes.push(Object.freeze({
   x,y,z,region,twinkle:rand()*TAU,radius:.55+rand()*1.16,
   emphasis:rand()>.93,phase:rand()
  }));
 }
 const links=[],seen=new Set();
 for(let i=0;i<nodes.length;i++){
  const p=nodes[i];
  const closest=[];
  for(let j=0;j<nodes.length;j++){
   if(j===i||nodes[j].region!==p.region)continue;
   const q=nodes[j],dist=square(p.x-q.x)+square(p.y-q.y)+square((p.z-q.z)*.85);
   if(dist>.20)continue;
   if(closest.length<3){closest.push({j,dist});closest.sort((a,b)=>a.dist-b.dist)}
   else if(dist<closest[2].dist){closest[2]={j,dist};closest.sort((a,b)=>a.dist-b.dist)}
  }
  for(const q of closest.slice(0,2)){
   const a=Math.min(i,q.j),b=Math.max(i,q.j),key=a+':'+b;
   if(seen.has(key))continue;seen.add(key);
   links.push(Object.freeze({a,b,region:p.region,speed:.4+rand()*.85,phase:rand()}));
  }
 }
 // Few cross-region bridges express coordinated architecture, not observed work.
 for(let i=0;i<70;i++){
  const a=Math.floor(rand()*nodes.length),target=REGIONS[(REGIONS.indexOf(nodes[a].region)+1)%REGIONS.length];
  let best=-1,d=Infinity;
  for(let j=0;j<nodes.length;j++){
   if(nodes[j].region!==target)continue;
   const q=nodes[j],p=nodes[a],dist=square(p.x-q.x)+square(p.y-q.y)+square(p.z-q.z);
   if(dist<d){d=dist;best=j}
  }
  if(best>=0){const u=Math.min(a,best),v=Math.max(a,best),key=u+':'+v;
   if(!seen.has(key)){seen.add(key);links.push(Object.freeze({a:u,b:v,region:'bridge',speed:.3,phase:rand()}))}
  }
 }
 const stars=Array.from({length:145},()=>Object.freeze({
  x:rand(),y:rand(),size:.3+rand()*1.25,phase:rand()*TAU,
  layer:.24+rand()*.76
 }));
 return Object.freeze({nodes:Object.freeze(nodes),links:Object.freeze(links),stars:Object.freeze(stars)});
}
export function adaptiveNodeBudget(width,reduced=false){
 if(!Number.isFinite(width)||width<1)return 125;
 if(reduced)return width<700?225:460;
 if(width<500)return 275;
 if(width<820)return 430;
 return 850;
}
export function projectAtlasNode(point,{width,height,yaw=0,pitch=0,offsetX=0,offsetY=0,zoom=1}){
 const cos=Math.cos(yaw),sin=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
 const xx=point.x*cos-point.z*sin;
 const zz=point.x*sin+point.z*cos;
 const yy=point.y*cp-zz*sp,depth=point.y*sp+zz*cp;
 const perspective=clamp(1/(1+depth*.37),.71,1.45);
 const radius=Math.min(width*.50,height*.74)*zoom;
 return {x:width*.5+(xx-offsetX)*perspective*radius,
   y:height*.5+(yy-offsetY)*perspective*radius,
   depth,scale:perspective};
}
export function createNeuralUniverse({canvas,stage,reduce,initialFocus='systemia'}={}){
 if(!canvas||!stage||!reduce)throw Error('visual_mount_required');
 const ctx=canvas.getContext('2d',{alpha:false});
 if(!ctx)throw Error('canvas_2d_unavailable');
 const atlas=buildNeuralAtlas();
 let width=640,height=550,dpr=1,selected=REGIONS.includes(initialFocus)?initialFocus:'systemia';
 let originX=0,originY=0,pointerX=0,pointerY=0,active=true,onscreen=true,disposed=false;
 let lastDraw=-1000,lastNow=0,cycleAt=-1,eventCount=0,raf=0,focusStrength=0;
 const getVisible=()=>!disposed&&active&&onscreen;
 function resize(){
  const bounds=stage.getBoundingClientRect();
  width=Math.max(1,Math.round(bounds.width));height=Math.max(1,Math.round(bounds.height));
  dpr=Math.min(width<700?1.45:1.8,Math.max(1,window.devicePixelRatio||1));
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
  canvas.style.width=width+'px';canvas.style.height=height+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
  if(reduce.matches)draw(0);
 }
 function draw(t){
  const still=reduce.matches,clock=still?0:t;
  const small=width<700,budget=Math.min(atlas.nodes.length,adaptiveNodeBudget(width,still));
  const focus=CENTERS[selected],tgtX=focus[0]*.13,tgtY=focus[1]*.10;
  if(still){originX=tgtX;originY=tgtY;focusStrength=1}
  else{originX+=(tgtX-originX)*.026;originY+=(tgtY-originY)*.026;focusStrength+=(1-focusStrength)*.023}
  const yaw=(still?0:Math.sin(clock*.00011)*.16)+pointerX*.10;
  const pitch=(still?-.10:Math.cos(clock*.000079)*.08-.10)+pointerY*.07;
  ctx.globalCompositeOperation='source-over';
  ctx.fillStyle='#050b16';ctx.fillRect(0,0,width,height);
  let background=ctx.createRadialGradient(width*.50,height*.45,5,width*.50,height*.52,Math.max(width*.73,height*.8));
  background.addColorStop(0,'#102a44');background.addColorStop(.39,'#091b30');
  background.addColorStop(1,'#050b16');ctx.fillStyle=background;ctx.fillRect(0,0,width,height);
  for(const s of atlas.stars){
   const x=s.x*width+pointerX*s.layer*9,y=s.y*height+pointerY*s.layer*7;
   const alpha=still?.24:.13+.12*(.5+.5*Math.sin(clock*.0007+s.phase));
   ctx.fillStyle='rgba(185,220,252,'+alpha.toFixed(3)+')';
   ctx.fillRect(x,y,s.size,s.size);
  }
  const cx=width*.5,cy=height*.5;
  const span=Math.min(width*.47,height*.72);
  let haze=ctx.createRadialGradient(cx,cy,span*.08,cx,cy,span*1.6);
  haze.addColorStop(0,'rgba(72,155,238,.15)');haze.addColorStop(.43,'rgba(45,107,192,.075)');
  haze.addColorStop(1,'rgba(7,18,39,0)');ctx.fillStyle=haze;
  ctx.fillRect(0,0,width,height);
  // Elliptical orbit geometry is an artistic navigation grid, not telemetry.
  ctx.save();ctx.translate(cx,cy);
  for(let k=0;k<4;k++){
   const alpha=small?.19:.27;
   ctx.strokeStyle='rgba(115,180,239,'+(alpha-k*.037).toFixed(3)+')';
   ctx.lineWidth=.65;ctx.setLineDash(k%2?[2,9]:[]);
   ctx.beginPath();ctx.ellipse(0,0,span*(.37+k*.25),span*(.18+k*.14),-.19+k*.27,0,TAU);ctx.stroke();
  }
  ctx.restore();ctx.setLineDash([]);
  const projected=atlas.nodes.slice(0,budget).map(p=>projectAtlasNode(p,{
   width,height,yaw,pitch,offsetX:originX,offsetY:originY,zoom:small?.91:1.03
  }));
  ctx.globalCompositeOperation='lighter';
  for(let i=0;i<atlas.links.length;i++){
   const line=atlas.links[i];
   if(line.a>=budget||line.b>=budget)continue;
   const a=projected[line.a],b=projected[line.b];
   const matched=line.region===selected;
   const color=PALETTE[line.region]||[142,175,245];
   const drift=still?0:.12*Math.sin(clock*.0012+line.phase*TAU);
   const opacity=line.region==='bridge'?.085:(matched?.43:.115)+drift*(matched?1:.4);
   ctx.strokeStyle=rgba(color,opacity);
   ctx.lineWidth=matched?small?.75:1.07:.53;
   ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
   // Traveling pinpricks are synthetic atmosphere and never claimed as jobs.
   if(!still&&matched&&i%5===0){
    const p=((clock*.00017*line.speed+line.phase)%1),x=a.x+(b.x-a.x)*p,y=a.y+(b.y-a.y)*p;
    ctx.fillStyle=rgba(color,.72);ctx.beginPath();ctx.arc(x,y,1.2,0,TAU);ctx.fill();
   }
  }
  for(let i=0;i<budget;i++){
   const node=atlas.nodes[i],p=projected[i],chosen=node.region===selected;
   const twinkle=still?.5:.60+.40*Math.sin(clock*.00125+node.twinkle);
   const alpha=chosen?.68+.24*twinkle:.20+.14*twinkle;
   const radius=node.radius*(chosen?1.5:1)*p.scale*(small?.85:1);
   ctx.fillStyle=rgba(PALETTE[node.region],alpha*p.scale);
   ctx.beginPath();ctx.arc(p.x,p.y,Math.max(.3,radius),0,TAU);ctx.fill();
   if(node.emphasis&&chosen){
    ctx.strokeStyle=rgba(PALETTE[node.region],.10+twinkle*.13);
    ctx.lineWidth=.8;ctx.beginPath();ctx.arc(p.x,p.y,4.1*p.scale,0,TAU);ctx.stroke();
   }
  }
  // A handful of golden witnesses represents ONLY validated public event count.
  // The marks never suggest inference activity or the content of private work.
  if(eventCount>0){
   for(let i=0;i<Math.min(eventCount,12);i++){
    const a=-Math.PI/2+(i/eventCount)*TAU+(still?0:clock*.000055);
    const radius=span*.89;
    const x=cx+Math.cos(a)*radius,y=cy+Math.sin(a)*radius*.65;
    ctx.fillStyle='rgba(249,216,162,.83)';
    ctx.beginPath();ctx.arc(x,y,2.2,0,TAU);ctx.fill();
   }
  }
  // This ripple is exclusively triggered by a *new* fresh field-attested
  // KAIDANCE cycle supplied by the existing pulse gate in brain.js.
  if(!still&&cycleAt>=0){
   const age=clock-cycleAt;
   if(age>=0&&age<1900){
    const progress=age/1900;
    ctx.strokeStyle='rgba(126,251,219,'+(0.73*(1-progress)).toFixed(3)+')';
    ctx.lineWidth=2.2*(1-progress)+.4;
    ctx.beginPath();ctx.ellipse(cx,cy,span*(.16+progress*1.07),span*(.13+progress*.72),0,0,TAU);ctx.stroke();
   }
  }
  ctx.globalCompositeOperation='source-over';
  // Faint horizon creates depth and keeps the nucleus legible on mobile.
  const near=ctx.createRadialGradient(cx,cy,span*.05,cx,cy,span*.40);
  near.addColorStop(0,'rgba(7,15,31,.72)');near.addColorStop(1,'rgba(7,15,31,0)');
  ctx.fillStyle=near;ctx.beginPath();ctx.arc(cx,cy,span*.45,0,TAU);ctx.fill();
 }
 function frame(t){
  raf=0;
  if(!getVisible())return;
  const rate=width<700?1000/24:1000/30;
  if(t-lastDraw>=rate){lastDraw=t;lastNow=t;draw(t)}
  if(!reduce.matches)raf=requestAnimationFrame(frame);
 }
 function start(){
  if(!getVisible()||raf)return;
  if(reduce.matches){draw(0);return}
  raf=requestAnimationFrame(frame);
 }
 function stop(){if(raf)cancelAnimationFrame(raf);raf=0}
 const onVisibility=()=>{active=!document.hidden;if(active)start();else stop()};
 const onPointer=event=>{
  if(event.pointerType==='touch')return;
  const r=stage.getBoundingClientRect();
  pointerX=clamp((event.clientX-r.left)/Math.max(1,r.width)*2-1,-1,1);
  pointerY=clamp((event.clientY-r.top)/Math.max(1,r.height)*2-1,-1,1);
 };
 const onLeave=()=>{pointerX=0;pointerY=0};
 const onMotion=()=>{stop();start()};
 document.addEventListener('visibilitychange',onVisibility);
 stage.addEventListener('pointermove',onPointer,{passive:true});
 stage.addEventListener('pointerleave',onLeave,{passive:true});
 reduce.addEventListener('change',onMotion);
 const resizeObserver=new ResizeObserver(()=>{resize();start()});resizeObserver.observe(stage);
 const viewObserver=typeof IntersectionObserver==='function'
  ?new IntersectionObserver(entries=>{onscreen=entries.some(e=>e.isIntersecting);if(onscreen)start();else stop()},{threshold:0})
  :null;
 viewObserver?.observe(stage);
 resize();start();
 return Object.freeze({
  resize,
  setFocus(region){if(REGIONS.includes(region)){selected=region;focusStrength=0;start();if(reduce.matches)draw(0)}},
  acknowledgeCycle(){if(!reduce.matches){cycleAt=performance.now();start()}},
  setPublicEventCount(n){eventCount=Number.isSafeInteger(n)?clamp(n,0,12):0;if(reduce.matches)draw(0)},
  destroy(){disposed=true;stop();resizeObserver.disconnect();viewObserver?.disconnect();
   document.removeEventListener('visibilitychange',onVisibility);
   stage.removeEventListener('pointermove',onPointer);
   stage.removeEventListener('pointerleave',onLeave);reduce.removeEventListener('change',onMotion)}
 });
}
