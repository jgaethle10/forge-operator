import {scenicChapter,SCENIC_LEG_SECONDS} from './field-chapters.mjs';
// KAIDANCE CONFLUENCE FIELD V05 · Living journeys
// Living network sculpture, inspired by Evercraft's own HUDSON river theater.
// ALL continuous streams/routes/explorer motion are ILLUSTRATIVE, not live jobs,
// agents, private Systemia execution or a measurement of Collider operations.
// Public GitHub records may select narrative topics, never fabricate missions.
// Only the independently source-verified .beat class may cause a pulse flare.
const canvas=document.getElementById('currentField');
const stage=document.getElementById('stage');
const marker=document.getElementById('collider');
if(canvas&&stage&&marker){
 const ctx=canvas.getContext('2d',{alpha:true,desynchronized:true});
 if(ctx){
  const TAU=Math.PI*2,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const random=n=>{let x=Math.sin(n*127.1+78.71)*43758.5453;return x-Math.floor(x)};
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const systems=Object.freeze([
   {key:'systemia',name:'SYSTEMIA',x:.18,y:.22,color:'#8af7e7',detail:'Mission coordination and orchestration'},
   {key:'hudson',name:'HUDSON',x:.77,y:.18,color:'#a2e7ff',detail:'Institutional knowledge and evidence'},
   {key:'discovery',name:'DISCOVERY',x:.12,y:.48,color:'#d6f8a4',detail:'Research, questions and opportunities'},
   {key:'kaidance',name:'KAIDANCE',x:.51,y:.45,color:'#c7ffff',detail:'Five-minute Collider and verified cycle boundary'},
   {key:'raven',name:'RAVEN NEXUS',x:.88,y:.48,color:'#c6aeff',detail:'Connections and communications'},
   {key:'saban',name:'WORK SABAN',x:.20,y:.73,color:'#a5c7ff',detail:'Work orchestration and delivery'},
   {key:'evidence',name:'EVIDENCE',x:.79,y:.74,color:'#a6ffe8',detail:'Public provenance and verification'}
  ]);
  const byKey=Object.fromEntries(systems.map(s=>[s.key,s]));
  const connections=[
   ['systemia','kaidance'],['kaidance','hudson'],
   ['discovery','kaidance'],['kaidance','raven'],
   ['kaidance','saban'],['saban','evidence'],
   ['hudson','evidence'],['raven','evidence'],
   ['systemia','discovery'],['discovery','saban'],
   ['hudson','raven']
  ];
  const routes=[
   ['systemia','kaidance'],['kaidance','discovery'],
   ['discovery','hudson'],['hudson','kaidance'],
   ['kaidance','raven'],['raven','evidence'],
   ['evidence','saban'],['saban','systemia']
  ];
  const dust=Array.from({length:100},(_,i)=>({
   x:random(i+10),y:random(i+220),r:.25+random(i+71)*.85,
   phase:random(i+531)*TAU,shade:random(i+820)
  }));
  const storyTitle=document.getElementById('fieldStoryTitle'),
   storyMeta=document.getElementById('fieldStoryMeta'),
   sourceState=document.getElementById('fieldStoryKind'),
   modeButton=document.getElementById('fieldMode'),
   pauseButton=document.getElementById('fieldPause'),
   exploreButton=document.getElementById('fieldExplore'),
   drawer=document.getElementById('fieldDrawer'),
   drawerClose=document.getElementById('fieldClose'),
   drawerTopics=document.getElementById('fieldTopics'),
   routeFrom=document.getElementById('fieldRouteFrom'),
   routeTo=document.getElementById('fieldRouteTo'),
   routeProgress=document.getElementById('fieldRouteProgress'),
   recordTopic=document.getElementById('fieldRecordTopic');
  let w=1,h=1,px=1,frame=0,prev=0,time=0,paused=false,visible=true;
  let focus='kaidance',journeyIndex=0,flashStart=-100;
  let lastNarratedOrdinal=-1,manualUntil=0,recordFocus=null,recordUntil=0;
  const EVENT_HIGHLIGHT_SECONDS=13;
  function syncStory(chapter){
   routeProgress.style.transform='scaleX('+chapter.progress.toFixed(3)+')';
   if(manualUntil>time)return;
   if(chapter.ordinal!==lastNarratedOrdinal){
    lastNarratedOrdinal=chapter.ordinal;
    focus=chapter.toKey;
    sourceState.textContent='ILLUSTRATED JOURNEY · CHAPTER '+(chapter.index+1)+' / '+chapter.total;
    storyTitle.textContent=chapter.title;
    storyMeta.textContent=chapter.meta;
    routeFrom.textContent=chapter.from.name;
    routeTo.textContent=chapter.to.name;
   }
   if(recordFocus&&time>=recordUntil){
    recordFocus=null;recordTopic.hidden=true;recordTopic.textContent='';
   }
  }

  function colors(hex,alpha){
   const value=hex.replace('#','');
   const rgb=[0,2,4].map(p=>parseInt(value.slice(p,p+2),16));
   return 'rgba('+rgb.join(',')+','+alpha+')';
  }
  function size(){
   const rect=stage.getBoundingClientRect();w=Math.max(1,rect.width);h=Math.max(1,rect.height);
   px=Math.min(w<680?1.16:1.36,devicePixelRatio||1);
   canvas.width=Math.round(w*px);canvas.height=Math.round(h*px);
   canvas.style.width=w+'px';canvas.style.height=h+'px';
   ctx.setTransform(px,0,0,px,0,0);
  }
  // The layout is a field of confluences, not a fixed UI grid.
  function point(key){
   const system=byKey[key];
   const landscape=w>680,land=h>680;
   let y=system.y;
   if(!landscape&&system.key==='kaidance')y=.425;
   if(!landscape&&system.key==='saban')y=.68;
   if(!landscape&&system.key==='evidence')y=.68;
   const reservedBottom=document.body.classList.contains('portrait')?h*.22:h*.18;
   const topMargin=h*(landscape?.11:.18);
   const fieldHeight=h-topMargin-reservedBottom;
   return {x:system.x*w,y:topMargin+y*fieldHeight*.92,color:system.color};
  }
  function path(a,b,offset=0){
   const p=point(a),q=point(b);
   const cx=w*.5,cy=h*.43;
   const dx=q.x-p.x,dy=q.y-p.y;
   const bend=Math.min(w*.2,76)+(offset*8);
   let nx=-dy/(Math.hypot(dx,dy)||1),ny=dx/(Math.hypot(dx,dy)||1);
   const towardsCenter=(cx-(p.x+q.x)*.5)*.14;
   const c1={x:p.x+dx*.35+nx*bend+towardsCenter,y:p.y+dy*.19+ny*bend};
   const c2={x:p.x+dx*.68-nx*bend*.64,y:p.y+dy*.8-ny*bend*.64};
   return {p,c1,c2,q};
  }
  function at(c,t){
   const o=1-t;return{
    x:o*o*o*c.p.x+3*o*o*t*c.c1.x+3*o*t*t*c.c2.x+t*t*t*c.q.x,
    y:o*o*o*c.p.y+3*o*o*t*c.c1.y+3*o*t*t*c.c2.y+t*t*t*c.q.y
   };
  }
  function ribbon(c,color,alpha,width,phase){
   ctx.beginPath();
   const sample=26;
   for(let k=0;k<=sample;k++){
    const t=k/sample;const p=at(c,t);
    const m=Math.sin(t*TAU*2.35+time*.58+phase)*Math.sin(t*Math.PI)*6.8;
    const x=p.x+m,y=p.y-m;
    if(k===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
   }
   ctx.strokeStyle=colors(color,alpha);ctx.lineWidth=width;ctx.lineCap='round';ctx.stroke();
  }
  function dot(x,y,r,col,alpha){
   ctx.globalAlpha=alpha;ctx.fillStyle=col;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();ctx.globalAlpha=1;
  }
  function halo(x,y,r,col,intensity){
   const g=ctx.createRadialGradient(x,y,0,x,y,r);
   g.addColorStop(0,colors(col,.31*intensity));
   g.addColorStop(.3,colors(col,.12*intensity));
   g.addColorStop(1,colors(col,0));
   ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();
  }
  function backdrop(){
   const background=ctx.createRadialGradient(w*.49,h*.44,10,w*.49,h*.44,Math.max(w,h)*.75);
   background.addColorStop(0,'#073045');
   background.addColorStop(.37,'#061b31');
   background.addColorStop(.69,'#030e1e');
   background.addColorStop(1,'#020711');
   ctx.fillStyle=background;ctx.fillRect(0,0,w,h);
   ctx.save();
   for(let i=0;i<dust.length;i++){
    const d=dust[i];const x=d.x*w,y=d.y*h;
    dot(x,y,d.r,d.shade>.7?'#a1d6ff':'#87c6c9',.12+.29*(.5+.5*Math.sin(time*.62+d.phase)));
   }
   ctx.restore();
  }
  function currents(chapter){
   ctx.save();ctx.globalCompositeOperation='lighter';
   const active=new Set([chapter.fromKey,chapter.toKey,focus]);
   for(let i=0;i<connections.length;i++){
    const [a,b]=connections[i],c=path(a,b,i%3-1);
    const bright=active.has(a)&&active.has(b);
    // Underwater light tunnels. Several strands converge into each system.
    ribbon(c,byKey[a].color,bright?.19:.11,bright?12:5,i);
    ribbon(c,byKey[b].color,bright?.68:.37,bright?2.1:1.25,i);
    for(let lane=0;lane<3;lane++){
     const c2=path(a,b,lane-1);
     ribbon(c2,byKey[b].color,.11+lane*.037,.85,i+lane);
    }
    // Individual energy packets travel without pretending to be missions.
    for(let j=0;j<(w<680?3:5);j++){
     const t=(time*(.035+.006*(i%3))+j/(w<680?3:5)+i*.131)%1;
     const p=at(c,t);
     halo(p.x,p.y,12,byKey[b].color,.88);
     dot(p.x,p.y,1.6,byKey[b].color,.56+.38*Math.sin(t*Math.PI));
    }
   }
   ctx.restore();
  }
  function arrivalBloom(chapter){
   // A local, colored destination bloom occurs on *illustrative approach*.
   // It is intentionally distinct from the central white verified-cycle flash.
   if(chapter.arrival<=0||reduced.matches)return;
   const p=point(chapter.toKey),intensity=Math.sin(chapter.arrival*Math.PI);
   if(intensity<=0)return;
   const color=byKey[chapter.toKey].color;
   halo(p.x,p.y,55+chapter.arrival*48,color,intensity*.92);
   ctx.save();ctx.strokeStyle=colors(color,intensity*.46);
   ctx.lineWidth=1.3;ctx.beginPath();
   ctx.arc(p.x,p.y,14+chapter.arrival*55,0,TAU);ctx.stroke();
   ctx.restore();
   for(let i=0;i<12;i++){
    const angle=TAU*i/12+time*.22;
    const reach=16+chapter.arrival*(21+11*random(i+166));
    const end=reach+11*intensity;
    const dx=Math.cos(angle),dy=Math.sin(angle);
    ctx.save();ctx.strokeStyle=colors(color,intensity*.34);
    ctx.lineWidth=.8;ctx.beginPath();
    ctx.moveTo(p.x+dx*reach,p.y+dy*reach);
    ctx.lineTo(p.x+dx*end,p.y+dy*end);ctx.stroke();ctx.restore();
   }
  }
  function collisions(){
   // The collider is a central confluence, not the whole visual field.
   const c=point('kaidance'),r=Math.min(w*.19,h*.15,105);
   const beat=Math.max(0,1-(time-flashStart)/2.2);
   ctx.save();ctx.translate(c.x,c.y);
   for(let i=0;i<5;i++){
    const rr=r*(.50+i*.20);
    ctx.beginPath();ctx.ellipse(0,0,rr,rr*.68,time*.045*(i%2?1:-1),0,TAU);
    ctx.strokeStyle=i===0?'rgba(197,255,255,.38)':'rgba(82,178,248,.16)';
    ctx.lineWidth=i===0?1.6:.7;ctx.stroke();
   }
   ctx.restore();
   halo(c.x,c.y,r*1.15,'#6ae8ff',1.1);
   halo(c.x,c.y,r*.39,'#d8ffff',1.4);
   dot(c.x,c.y,4.4,'#ddffff',.95);
   if(beat>0&&!reduced.matches){
    const rr=r*(.55+(1-beat)*1.8);
    ctx.save();ctx.strokeStyle='rgba(201,255,255,'+(beat*.8)+')';
    ctx.lineWidth=1.2+beat*3;ctx.shadowColor='#a6ffff';ctx.shadowBlur=12;
    ctx.beginPath();ctx.ellipse(c.x,c.y,rr,rr*.7,0,0,TAU);ctx.stroke();ctx.restore();
   }
  }
  function nodes(chapter){
   for(const sys of systems){
    const p=point(sys.key),active=sys.key===focus||sys.key===chapter.toKey;
    const recorded=recordFocus===sys.key&&time<recordUntil;
    if(recorded){
     ctx.save();ctx.setLineDash([2,5]);ctx.strokeStyle=colors(sys.color,.52);
     ctx.lineWidth=1;ctx.beginPath();ctx.arc(p.x,p.y,21+Math.sin(time*.7)*2,0,TAU);
     ctx.stroke();ctx.restore();
    }
    const r=sys.key==='kaidance'?10:active?8:5.6;
    halo(p.x,p.y,active?58:31,sys.color,active?1.35:.97);
    dot(p.x,p.y,r,sys.color,active?.85:.65);
    dot(p.x,p.y,active?2.9:1.9,'#eeffff',.9);
    if(sys.key==='kaidance')continue;
    const labelY=p.y-(w<680?17:19);
    ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font=(active?'700 ':'500 ')+(w<680?9:11)+'px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle=active?'#f2ffff':'#aac7db';
    ctx.fillText(sys.name,p.x,labelY);
    ctx.restore();
   }
   const c=point('kaidance');
   ctx.save();ctx.textAlign='center';ctx.fillStyle='#edffff';
   ctx.font='700 '+(w<680?15:23)+'px ui-sans-serif,system-ui,sans-serif';
   ctx.fillText('KAIDANCE',c.x,c.y-24);
   ctx.restore();
  }
  function voyager(chapter){
   // Spider-like photon explorer: mobile and varied silhouette, not just a
   // point with static whiskers. Its path is scenic / selected, never a job.
   const [a,b]=[chapter.fromKey,chapter.toKey],fraction=chapter.progress;
   const c=path(a,b),p=at(c,clamp(fraction,.01,.99));
   const next=at(c,clamp(fraction+.008,.02,1));
   const angle=Math.atan2(next.y-p.y,next.x-p.x),size=w<680?17:22;
   // A luminous comet wake makes direction legible even between systems.
   ctx.save();ctx.globalCompositeOperation='lighter';
   for(let trail=13;trail>=1;trail--){
    const prior=at(c,Math.max(.002,fraction-trail*.007));
    const strength=(1-trail/14)*.44;
    halo(prior.x,prior.y,4+strength*10,byKey[b].color,strength);
    dot(prior.x,prior.y,Math.max(.2,1.7*(1-trail/14)),byKey[b].color,strength);
   }
   ctx.restore();
   ctx.save();ctx.translate(p.x,p.y);ctx.rotate(angle);
   halo(0,0,size*5,'#b8ffeb',1.3);
   ctx.globalCompositeOperation='lighter';
   // Soft tendril fan moves like marine currents, not rigid straight feelers.
   for(let i=0;i<14;i++){
    const side=i%2?1:-1,depth=Math.floor(i/2);
    const spread=side*size*(.2+.24*depth);
    const tail=size*(1.7+depth*.35);
    const sway=Math.sin(time*1.2+i*.65)*size*.25;
    ctx.beginPath();ctx.moveTo(-size*.35,0);
    ctx.bezierCurveTo(-size*.75,spread*.18,-tail*.55,spread*.7+sway,-tail,spread+sway);
    ctx.strokeStyle=i%4===0?'rgba(194,160,255,.43)':'rgba(147,255,233,.53)';
    ctx.lineWidth=depth<2?1.2:.68;ctx.stroke();
   }
   const tail=ctx.createRadialGradient(0,0,0,0,0,size*4);
   tail.addColorStop(0,'rgba(232,255,241,.77)');
   tail.addColorStop(.25,'rgba(126,251,222,.25)');
   tail.addColorStop(1,'rgba(40,134,226,0)');
   ctx.fillStyle=tail;ctx.beginPath();ctx.arc(0,0,size*4,0,TAU);ctx.fill();
   dot(0,0,3.1,'#f5ffff',1);
   ctx.restore();
   // Route index derives from elapsed scenic time, not frame-dependent thresholds.
  }
  function draw(){
   const chapter=scenicChapter(time,routes,byKey);
   syncStory(chapter);
   ctx.clearRect(0,0,w,h);
   backdrop();currents(chapter);arrivalBloom(chapter);collisions();nodes(chapter);voyager(chapter);
  }
  function step(timestamp){
   frame=requestAnimationFrame(step);
   if(document.hidden||!visible||document.body.classList.contains('reactor')||paused)return;
   const fps=reduced.matches?2:w<680?20:28;
   if(timestamp-prev<1000/fps)return;
   const delta=Math.min(.08,(timestamp-prev)/1000||.02);prev=timestamp;
   if(!reduced.matches)time+=delta;
   draw();
  }
  function selection(key,kind='ILLUSTRATED CONFLUENCE'){
   if(!byKey[key])return;
   focus=key;
   sourceState.textContent=kind;
   routeFrom.textContent='EXPLORE';
   routeTo.textContent=byKey[key].name;
   storyTitle.textContent=byKey[key].name;
   storyMeta.textContent=byKey[key].detail+' · Visual routes are illustrative, not missions.';
   // Move the explorer toward this conceptual station on the next segment.
   const index=routes.findIndex(pair=>pair[1]===key);
   if(index>=0){journeyIndex=index;time=index*SCENIC_LEG_SECONDS+.25;}
   manualUntil=time+8;
   lastNarratedOrdinal=-1;
   draw();
  }
  canvas.addEventListener('click',event=>{
   if(document.body.classList.contains('reactor'))return;
   const rect=canvas.getBoundingClientRect();
   const x=event.clientX-rect.left,y=event.clientY-rect.top;
   let choice=null,distance=Infinity;
   for(const n of systems){
    const p=point(n.key);const d=Math.hypot(x-p.x,y-p.y);
    if(d<distance){choice=n.key;distance=d;}
   }
   if(distance<(w<680?40:50))selection(choice);
  });
  function mode(on){
   document.body.classList.toggle('reactor',on);
   modeButton.setAttribute('aria-pressed',String(on));
   modeButton.textContent=on?'FIELD VIEW':'REACTOR VIEW';
   if(!on){size();draw();}
  }
  modeButton.addEventListener('click',()=>mode(!document.body.classList.contains('reactor')));
  pauseButton.addEventListener('click',()=>{
   paused=!paused;pauseButton.textContent=paused?'RESUME':'PAUSE';
   pauseButton.setAttribute('aria-pressed',String(paused));
  });
  function openDrawer(){
   drawer.hidden=false;drawerClose.focus();
  }
  function closeDrawer(){drawer.hidden=true;exploreButton.focus();}
  exploreButton.addEventListener('click',openDrawer);
  drawerClose.addEventListener('click',closeDrawer);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!drawer.hidden)closeDrawer();});
  for(const item of systems){
   const b=document.createElement('button');b.type='button';
   b.textContent=item.name;b.addEventListener('click',()=>{selection(item.key);closeDrawer();});
   drawerTopics.appendChild(b);
  }
  // A public GitHub event may shift the illustrated focus. The label explicitly
  // disavows a live runtime action; no recorded source state is edited here.
  document.addEventListener('kaidance:public-record',event=>{
   const title=String(event.detail?.title||'').toLowerCase();
   const choices=[
    [/saban|worker|agent|crew/,'saban'],
    [/raven|relay|network|message/,'raven'],
    [/hudson|knowledge|worlds|classroom/,'hudson'],
    [/research|discover|science|aerospace/,'discovery'],
    [/evidence|audit|proof|test|receipt/,'evidence'],
    [/collider|kaidance|pulse|heartbeat/,'kaidance']
   ];
   const found=choices.find(([re])=>re.test(title));
   // A receipt may tint a topic, but must never hijack the ongoing scenic tour
   // or impersonate a newly completed Systemia mission.
   if(found){
    recordFocus=found[1];recordUntil=time+EVENT_HIGHLIGHT_SECONDS;
    recordTopic.textContent='PUBLIC GITHUB TOPIC · '+byKey[recordFocus].name;
    recordTopic.hidden=false;
   }
  });
  const beatObserver=new MutationObserver(()=>{
   if(marker.classList.contains('beat'))flashStart=time;
  });
  beatObserver.observe(marker,{attributes:true,attributeFilter:['class']});
  const resizer=new ResizeObserver(()=>{size();draw()});resizer.observe(stage);
  const intersection=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??true},{threshold:.01});
  intersection.observe(stage);
  window.addEventListener('pagehide',()=>{
   cancelAnimationFrame(frame);resizer.disconnect();intersection.disconnect();beatObserver.disconnect();
  },{once:true});
  size();draw();frame=requestAnimationFrame(step);
 }
}
