// KAIDANCE / COLLIDER V03: light sculpture rendered on the viewer's own device.
// All beams, magnetic coils, particles and luminous collisions are AMBIENT ART,
// NOT agents, tasks, cycle counts, payments, scientific simulations or telemetry.
// Only a new *verified* cycle in app.mjs can trigger the exceptional field flash.
// No external assets, no live sensor or device permission, no data writes.
const stage = document.getElementById('stage');
const canvas = document.getElementById('colliderField');
const verifiedMarker = document.getElementById('collider');
if (stage && canvas && verifiedMarker) {
 const ctx = canvas.getContext('2d', {alpha:true, desynchronized:true});
 if (ctx) {
  const TAU = Math.PI*2;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const seed=n=>{const x=Math.sin(n*128.17+78.233)*43758.5453;return x-Math.floor(x)};
  const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
  let width=0,height=0,dpr=1,radius=130,centerX=0,centerY=0;
  let frame=0,previous=0,epoch=0,visible=true,disposed=false,flashAt=-1e8,adaptiveGap=55;
  let hoverX=0,hoverY=0,targetX=0,targetY=0;
  const mobile=()=>width<680;
  const powerSave=()=>reduce.matches;
  const sparks=Array.from({length:84},(_,i)=>({
   angle:TAU*seed(i+2),lane:seed(i+381),
   size:.45+seed(i+998)*1.3,depth:seed(i+643),
   drift:.08+seed(i+69)*.35,twinkle:seed(i+442)*TAU
  }));
  const dust=Array.from({length:50},(_,i)=>({
   x:seed(i+525),y:seed(i+738),size:.3+seed(i+208)*1.2,
   phase:TAU*seed(i+811),depth:seed(i+322)
  }));
  // Camera: tilted 3-D toroidal magnet ring, rendered with perspective.
  function transform(X,Y,Z,t){
   const yaw=.18+Math.sin(t*.045)*.12+hoverX*.12;
   const pitch=.92+hoverY*.11;
   const cp=Math.cos(pitch),sp=Math.sin(pitch);
   let x=X, y=Y*cp-Z*sp, z=Y*sp+Z*cp;
   const cy=Math.cos(yaw),sy=Math.sin(yaw);
   const xx=x*cy+z*sy, zz=-x*sy+z*cy;
   const view=3.7/(3.7+zz*.38);
   return {x:centerX+xx*radius*view,y:centerY+y*radius*view,
    z:zz,scale:view,depth:clamp(.6-zz*.19,.12,1)};
  }
  function torus(a,b,t,R=1,tube=.1){
   const ring=R+tube*Math.cos(b);
   return transform(Math.cos(a)*ring,Math.sin(a)*ring,tube*Math.sin(b),t);
  }
  function line(points,{color='#9cefff',alpha=.2,weight=1,glow=0,composite='source-over'}={}){
   if(points.length<2)return;
   ctx.save();ctx.globalCompositeOperation=composite;
   ctx.strokeStyle=color;ctx.globalAlpha=alpha;ctx.lineWidth=weight;
   ctx.lineCap='round';ctx.lineJoin='round';
   // Radial gradients supply bloom without costly per-segment shadow blur.
   ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
   for(let j=1;j<points.length;j++)ctx.lineTo(points[j].x,points[j].y);
   ctx.stroke();ctx.restore();
  }
  function dot(x,y,r,color,alpha=1,glow=0){
   if(r<=0)return;
   ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=alpha;
   ctx.fillStyle=color;// Radial gradients supply bloom without costly per-segment shadow blur.
   ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();ctx.restore();
  }
  function glow(x,y,r,colors,opacity=1){
   ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=opacity;
   const g=ctx.createRadialGradient(x,y,0,x,y,r);
   for(const [pos,color] of colors)g.addColorStop(pos,color);
   ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();ctx.restore();
  }
  function resize(){
   const box=stage.getBoundingClientRect();
   width=Math.max(1,box.width);height=Math.max(1,box.height);
   // Avoid massive offscreen buffers on phones while preserving sharpness.
   dpr=Math.min(mobile()?1.1:1.25,window.devicePixelRatio||1);
   canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
   canvas.style.width=width+'px';canvas.style.height=height+'px';
   ctx.setTransform(dpr,0,0,dpr,0,0);
   radius=Math.min(width*(mobile()?.395:.37),height*.38,310);
   centerX=width*.5;
   centerY=height*(document.body.classList.contains('portrait')?.41:mobile()?.35:.39);
  }
  function background(t){
   const R=radius;
   glow(centerX,centerY,R*2.25,[
    [0,'rgba(38,171,250,.16)'],[.28,'rgba(16,112,192,.10)'],
    [.64,'rgba(31,43,93,.06)'],[1,'rgba(0,0,0,0)']],.8);
   // Lens-like rings that suggest scale beyond the magnet machinery.
   ctx.save();ctx.lineWidth=.75;
   for(let i=0;i<7;i++){
    const r=R*(1.17+i*.142);
    ctx.strokeStyle=i%2===0?'rgba(86,183,242,.125)':'rgba(91,101,167,.085)';
    ctx.beginPath();ctx.ellipse(centerX,centerY,r,r*.77,-.11,0,TAU);ctx.stroke();
   }
   const count=mobile()?22:dust.length;
   for(let i=0;i<count;i++){
    const p=dust[i],x=p.x*width,y=p.y*height;
    const a=(.17+p.depth*.33)*(.76+.24*Math.sin(t*.8+p.phase));
    dot(x,y,p.size,p.depth>.75?'#aeefff':'#688fbd',a,0);
   }
   ctx.restore();
  }
  function magneticRing(t){
   const N=mobile()?34:48;
   // Dark metal extrusion: tube outline and rear/fore geometry sorted by
   // the camera's view depth for dimensionality.
   const rails=[-.32,0,.32];
   for(let rail=0;rail<rails.length;rail++){
    for(let i=0;i<N;i++){
     const a1=i*TAU/N,a2=(i+1)*TAU/N;
     const p1=torus(a1,rails[rail],t),p2=torus(a2,rails[rail],t);
     const depth=(p1.depth+p2.depth)/2;
     line([p1,p2],{color:rail===1?'#63d5fb':'#779bd1',
       alpha:(rail===1?.29:.17)*(.4+depth),weight:rail===1?10*depth:5*depth,
       glow:rail===1?6:0});
     line([p1,p2],{color:'#c5f7ff',alpha:.12*depth,weight:.7});
    }
   }
   // Copper and cyan sectional magnetic ribs. Their depth-sorted caps
   // create a tunnel / real machine silhouette rather than a flat diagram.
   const n=mobile()?15:20;
   const sections=Array.from({length:n},(_,i)=>{
    const a=(i+1/3)*TAU/n;
    const c=torus(a,0,t);
    return {a,c};
   }).sort((a,b)=>a.c.z-b.c.z);
   for(const item of sections){
    const pts=[];const steps=12;
    for(let j=0;j<=steps;j++)pts.push(torus(item.a,j*TAU/steps,t,1,.13));
    const d=item.c.depth;
    const gold=Math.sin(item.a*3+t*.08)>.23;
    line(pts,{color:'#031522',alpha:.77,weight:6*d+1,glow:0});
    line(pts,{color:gold?'#f2a469':'#7bcef8',alpha:(.14+.45*d),weight:2.4*d+.45,glow:gold?6:3});
    if(item.c.depth>.45){
      const a=torus(item.a,-.35,t,1,.145),b=torus(item.a,.35,t,1,.145);
      line([a,b],{color:gold?'#ffb476':'#c4f8ff',alpha:.2+.21*d,weight:1.1});
    }
   }
   // Flux lines wind around the torus, visually connecting the coils.
   for(let strand=0;strand<3;strand++){
    const points=[];
    const segments=mobile()?65:85;
    for(let j=0;j<=segments;j++){
     const a=j/segments*TAU,b=10*a+strand/3*TAU+t*(strand%2===0?.13:-.12);
     points.push(torus(a,b,t,1,.155));
    }
    line(points,{color:strand%3===0?'#eb9cfc':'#4cbcf5',
      alpha:.06+(strand%3===0?.1:.07),weight:.7,glow:3});
   }
  }
  function particleBeams(t){
   // Two counter-rotating packs. They are *visual metaphor* for a Collider:
   // their position and speed do not correspond to an observed job.
   const n=mobile()?35:68;
   const speed=t*.26;
   for(let lane=0;lane<2;lane++){
    const color=lane===0?'#71edff':'#ffc289';
    const alpha=lane===0?.57:.43;
    const pts=[];
    for(let j=0;j<=155;j++){
     const a=TAU*j/155;
     pts.push(torus(a,lane===0?-.78:2.18,t,1.001,lane===0?.047:.038));
    }
    line(pts,{color,alpha:.115,weight:8});
    line(pts,{color,alpha:.5,weight:1.55});
    for(let i=0;i<n;i++){
     const p=sparks[i],a=p.angle+(lane===0?1:-1)*speed*(.67+p.drift*.5);
     const b=lane===0?-.75:2.16;
     const pos=torus(a,b,t,1.002,lane===0?.05:.038);
     const life=.32+.68*(1-p.depth);
     dot(pos.x,pos.y,p.size*(.8+pos.depth)*pos.scale,color,
       alpha*life*(.48+.52*pos.depth),p.depth>.91?7:0);
     // Short bright directional filaments at varied lengths.
     if(i%7===0){
      const q=torus(a-(lane===0?1:-1)*(.018+.014*p.lane),b,t,1.002,lane===0?.05:.038);
      line([q,pos],{color,alpha:.25*pos.depth,weight:1+pos.depth*1.2,glow:4});
     }
    }
    // Luminous bunches: multiple adjacent heads with long tapered tails.
    for(let pack=0;pack<3;pack++){
     const head=(lane===0?1:-1)*speed*(.7+pack*.065)+pack*TAU/3+(lane?.7:0);
     const p=torus(head,bConst(lane),t,1,.052);
     glow(p.x,p.y,15*posScale(p),[
      [0,lane===0?'rgba(216,255,255,.77)':'rgba(255,237,189,.65)'],
      [.28,lane===0?'rgba(46,210,255,.32)':'rgba(255,167,84,.27)'],
      [1,'rgba(0,0,0,0)']],.8);
     dot(p.x,p.y,2.5*p.scale,color,.9,13);
     for(let j=0;j<12;j++){
      const a=head-(lane===0?1:-1)*j*.012;
      const q=torus(a,bConst(lane),t,1,.052);
      dot(q.x,q.y,(2.2-j*.1)*q.scale,color,.37*(1-j/18),3);
     }
    }
   }
  }
  function bConst(lane){return lane===0?-.75:2.16}
  function posScale(p){return Math.max(.5,p.scale)}
  // A deliberately continuous plasma sculpture, not a timed heartbeat:
  // refracted field ribbons lean into the central interaction chamber.
  function plasmaStorm(t){
   const cx=centerX,cy=centerY,R=radius;
   ctx.save();ctx.globalCompositeOperation='lighter';
   for(let i=0;i<22;i++){
    const a=i*TAU/22,other=a+Math.PI*.78;
    const drift=Math.sin(t*.34+i*1.71)*.045;
    const outer=R*(.57+.12*seed(i+930));
    const start={x:cx+Math.cos(a+drift)*outer,y:cy+Math.sin(a+drift)*outer*.70};
    const endR=R*(.13+.08*seed(i+741));
    const finish={x:cx+Math.cos(other)*endR,y:cy+Math.sin(other)*endR*.9};
    const cp1={x:cx+Math.cos(a+.42)*outer*.56,y:cy+Math.sin(a-.25)*outer*.53};
    const cp2={x:cx+Math.cos(other-.61)*R*.27,y:cy+Math.sin(other+.22)*R*.20};
    const cyan=i%5!==0;
    const col=cyan?'rgba(115,226,255,':'rgba(255,169,111,';
    ctx.beginPath();ctx.moveTo(start.x,start.y);
    ctx.bezierCurveTo(cp1.x,cp1.y,cp2.x,cp2.y,finish.x,finish.y);
    ctx.lineWidth=i%6===0?2.1:.65;
    ctx.strokeStyle=col+(.25+.17*seed(i+40))+')';ctx.stroke();
   }
   // Chromatic caustics: concentric shards of refracted light, not event rings.
   for(let i=0;i<30;i++){
    const a=(i/30)*TAU+t*.028*(i%2?1:-1);
    const near=R*(.19+.025*(i%3)),far=R*(.27+.025*(i%4));
    ctx.beginPath();
    ctx.moveTo(cx+Math.cos(a)*near,cy+Math.sin(a)*near*.88);
    ctx.lineTo(cx+Math.cos(a+.08)*far,cy+Math.sin(a+.08)*far*.88);
    ctx.strokeStyle=i%7===0?'rgba(255,210,166,.54)':'rgba(151,224,255,.33)';
    ctx.lineWidth=i%7===0?1.4:.7;ctx.stroke();
   }
   ctx.restore();
  }
  function interactionChamber(t,flash){
   const R=radius,cx=centerX,cy=centerY;
   glow(cx,cy,R*.78,[
    [0,'rgba(197,251,255,.78)'],[.13,'rgba(69,196,255,.48)'],
    [.4,'rgba(38,101,188,.19)'],[1,'rgba(0,0,0,0)']],.69+flash*.27);
   // Two opposing energy streams meet in a central, steady symbolic lens.
   // Their continuous shimmer is ambient artwork; NOT a heartbeat event.
   for(let side=0;side<2;side++){
    for(let k=0;k<6;k++){
     const col=side===0?'#8ce9ff':'#efb08a';
     const angle=side===0?Math.PI:-.09;
     const endX=cx+Math.cos(angle)*R*.79,endY=cy+Math.sin(angle)*R*.27;
     const wobble=Math.sin(t*1.25+k*1.3+side*3.2)*R*.013;
     const midX=cx+(endX-cx)*.44,midY=cy+(endY-cy)*.4+wobble;
     const mid2X=cx+(endX-cx)*.13,mid2Y=cy+(endY-cy)*.11;
     line([{x:endX,y:endY+wobble},{x:midX,y:midY},{x:mid2X,y:mid2Y},{x:cx,y:cy}],{
      color:col,alpha:.20+(.15*(6-k)/6),weight:.75+(k===0?2.6:0),glow:k===0?10:0,composite:'lighter'});
    }
   }
   // The "event horizon" is a glass-like iris surrounded by an engraved field.
   ctx.save();ctx.translate(cx,cy);ctx.rotate(t*.095);
   for(let i=0;i<4;i++){
    const r=R*(.17+i*.062);
    ctx.strokeStyle=i%2===0?'rgba(189,249,255,.39)':'rgba(116,172,248,.25)';
    ctx.lineWidth=i===0?1.5:.65;ctx.setLineDash(i%2?[3,9]:[]);
    ctx.beginPath();ctx.ellipse(0,0,r,r*.84,0,0,TAU);ctx.stroke();
   }
   ctx.setLineDash([]);
   ctx.restore();
   glow(cx,cy,R*.39,[
     [0,'rgba(250,255,255,.92)'],[.08,'rgba(170,239,255,.69)'],
     [.27,'rgba(33,158,255,.38)'],[.67,'rgba(41,98,185,.12)'],[1,'rgba(0,0,0,0)']],.87);
   // The dark iris makes the luminous chamber feel deep rather than washed out.
   ctx.save();ctx.globalAlpha=.93;const g=ctx.createRadialGradient(cx-R*.025,cy-R*.035,0,cx,cy,R*.16);
   g.addColorStop(0,'#fffdf8');g.addColorStop(.13,'#d6f9ff');
   g.addColorStop(.27,'#76dfff');g.addColorStop(.47,'#13517c');
   g.addColorStop(.75,'#041c31');g.addColorStop(1,'rgba(1,12,25,0)');
   ctx.fillStyle=g;ctx.beginPath();ctx.arc(cx,cy,R*.16,0,TAU);ctx.fill();ctx.restore();
   // Decorative particle spray, steady and bounded, no 5-minute timer.
   for(let i=0;i<(mobile()?50:78);i++){
     const p=sparks[i],a=p.angle+t*(.018+.021*p.drift);
     const dist=R*(.09+.26*p.lane);
     const x=cx+Math.cos(a)*dist,y=cy+Math.sin(a)*dist*.78;
     const opacity=(.13+.36*seed(i+103))*Math.pow(1-p.lane,.6);
     dot(x,y,.5+p.size*.62,i%7===0?'#ffd8a8':'#95eaff',opacity,4);
   }
   // Exceptional flare ONLY when app.mjs has marked an attested cycle increment.
   if(flash>0){
     const age=1-flash;
     glow(cx,cy,R*(.21+age*.65),[
       [0,'rgba(255,255,255,.78)'],
       [.11,'rgba(193,250,255,.5)'],
       [.4,'rgba(69,182,249,.22)'],[1,'rgba(0,0,0,0)']],flash*.9);
     ctx.save();ctx.strokeStyle='rgba(209,250,255,'+(flash*.8)+')';
     ctx.lineWidth=1.5+flash*2;ctx.shadowColor='#aaf0ff';
     ctx.shadowBlur=18;
     ctx.beginPath();ctx.ellipse(cx,cy,R*(.24+age*.92),R*(.20+age*.72),0,0,TAU);
     ctx.stroke();ctx.restore();
   }
  }
  function structuralAccents(t){
   const R=radius;
   // Faint apparatus sight-lines and monolithic bracket marks.
   ctx.save();ctx.strokeStyle='rgba(117,214,254,.24)';ctx.lineWidth=.75;
   const x=centerX,y=centerY,r=R*1.23;
   for(let i=0;i<4;i++){
    const a=i*Math.PI/2+Math.PI/4,px=x+Math.cos(a)*r,py=y+Math.sin(a)*r*.72;
    ctx.save();ctx.translate(px,py);ctx.rotate(a);
    ctx.beginPath();ctx.moveTo(-6,0);ctx.lineTo(6,0);ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,-6);ctx.lineTo(0,6);ctx.stroke();ctx.restore();
   }
   ctx.restore();
  }
  function draw(now){
    if(disposed)return;
    frame=requestAnimationFrame(draw);
    if(!visible||document.hidden)return;
    const maxFps=powerSave()?2:mobile()?15:20;
    if(now-previous<Math.max(1000/maxFps,adaptiveGap))return;
    previous=now;
    if(!epoch)epoch=now;
    const t=powerSave()?2.1:(now-epoch)*.001;
    const flash=powerSave()?0:clamp(1-(now-flashAt)/1900,0,1);
    // Recompute position when broadcast view changes dimensions without resize.
    centerY=height*(document.body.classList.contains('portrait')?.41:mobile()?.35:.39);
    hoverX+=(targetX-hoverX)*.055;hoverY+=(targetY-hoverY)*.055;
    ctx.clearRect(0,0,width,height);
    background(t);magneticRing(t);particleBeams(t);
    plasmaStorm(t);interactionChamber(t,flash);structuralAccents(t);
    // Software-rendered phone browsers must retain idle time for scroll,
    // screen recording and other apps. Never chase full FPS at 100% CPU.
    const renderCost=Math.max(1,performance.now()-now);
    adaptiveGap=clamp(renderCost*3.6,1000/maxFps,360);
  }
  // Provenance gate: the visual cannot schedule, synthesize, or self-trigger
  // verified pulse flashes. The separate source-validating app applies .beat.
  const beats=new MutationObserver(()=>{
    if(verifiedMarker.classList.contains('beat'))flashAt=performance.now();
  });
  beats.observe(verifiedMarker,{attributes:true,attributeFilter:['class']});
  const observer=new ResizeObserver(resize);observer.observe(stage);
  const viewObserver=new IntersectionObserver(entries=>{
   visible=entries[0]?.isIntersecting??false;
  },{threshold:.01});
  viewObserver.observe(stage);
  const move=event=>{
   if(event.pointerType==='touch')return;
   const rect=stage.getBoundingClientRect();
   targetX=clamp((event.clientX-rect.left)/Math.max(1,rect.width)*2-1,-1,1);
   targetY=clamp((event.clientY-rect.top)/Math.max(1,rect.height)*2-1,-1,1);
  };
  stage.addEventListener('pointermove',move,{passive:true});
  stage.addEventListener('pointerleave',()=>{targetX=0;targetY=0},{passive:true});
  resize();frame=requestAnimationFrame(draw);
  window.addEventListener('pagehide',()=>{
   disposed=true;cancelAnimationFrame(frame);observer.disconnect();
   viewObserver.disconnect();beats.disconnect();
  },{once:true});
 }
}
