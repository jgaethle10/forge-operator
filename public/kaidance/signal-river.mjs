// KAIDANCE V06 / PUBLIC SIGNAL RIVER
// Ambient sculpture connecting the positions of source-linked GitHub records.
// Moving light is not a live job, mission, sensor, sale, or Collider heartbeat.
// Real records alone control which event elements and status colors exist.
const record=document.querySelector('.record');
const canvas=document.getElementById('signalRiver');
if(record&&canvas){
 const ctx=canvas.getContext('2d',{alpha:true,desynchronized:true});
 if(ctx){
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
  const palette={
   RUNNING:'#94dfff',PASSED:'#9ff4cc',MERGED:'#9ff4cc',
   FAILED:'#ecc19c',CANCELLED:'#ecc19c',RECORDED:'#b6b6ff',
   QUEUED:'#b3c5da',PENDING:'#b3c5da',DEFAULT:'#a9edee'
  };
  let w=1,h=1,dpr=1,frame=0,last=0,time=0,visible=true,disposed=false;
  let cached=[];
  function hexColor(hex,alpha){
   const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
   return 'rgba('+rgb.join(',')+','+alpha+')';
  }
  function point(el,anchor=.5){
   const r=el.getBoundingClientRect(),root=record.getBoundingClientRect();
   return {x:r.left-root.left+r.width*anchor,y:r.top-root.top+r.height*.5};
  }
  function geometry(){
   const spotlight=document.getElementById('signalSpotlight');
   const events=Array.from(document.querySelectorAll('#eventList .event')).slice(0,6);
   const root=record.getBoundingClientRect();
   if(!spotlight||root.width<1)return[];
   const start={x:root.width*.52,y:0};
   const featured=point(spotlight,.82);
   const paths=[{start,end:featured,color:'#93f3ed',kind:'featured'}];
   for(const [i,event] of events.entries()){
    const style=event.dataset.state||'DEFAULT';
    paths.push({start:{x:featured.x-12,y:featured.y+Math.min(i*15,52)},
      end:point(event,.07),color:palette[style]||palette.DEFAULT,kind:'record'});
   }
   return paths;
  }
  function resize(){
   const rect=record.getBoundingClientRect();
   w=Math.max(1,rect.width);h=Math.max(1,rect.height);
   dpr=Math.min(window.devicePixelRatio||1,w<700?1.12:1.4);
   canvas.width=Math.ceil(w*dpr);canvas.height=Math.ceil(h*dpr);
   canvas.style.width=w+'px';canvas.style.height=h+'px';
   ctx.setTransform(dpr,0,0,dpr,0,0);
   cached=geometry();
  }
  function cubic(route,t){
   const a=route.start,b=route.end,dx=b.x-a.x,dy=b.y-a.y;
   const p1={x:a.x+dx*.17,y:a.y+dy*.45};
   const p2={x:b.x-dx*.14,y:b.y-dy*.27};
   const q=1-t;
   return {x:q*q*q*a.x+3*q*q*t*p1.x+3*q*t*t*p2.x+t*t*t*b.x,
           y:q*q*q*a.y+3*q*q*t*p1.y+3*q*t*t*p2.y+t*t*t*b.y};
  }
  function trace(route,color,alpha,width){
   const p=route.start,q=route.end,dx=q.x-p.x,dy=q.y-p.y;
   ctx.beginPath();ctx.moveTo(p.x,p.y);
   ctx.bezierCurveTo(p.x+dx*.17,p.y+dy*.45,q.x-dx*.14,q.y-dy*.27,q.x,q.y);
   ctx.strokeStyle=hexColor(color,alpha);ctx.lineWidth=width;
   ctx.lineCap='round';ctx.stroke();
  }
  function glow(x,y,r,color,opacity){
   const g=ctx.createRadialGradient(x,y,0,x,y,r);
   g.addColorStop(0,hexColor(color,opacity*.8));
   g.addColorStop(.38,hexColor(color,opacity*.21));
   g.addColorStop(1,hexColor(color,0));
   ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
  }
  function render(){
   ctx.clearRect(0,0,w,h);
   // Broad atmospheric field, intentionally quiet under text and clickable links.
   const bg=ctx.createRadialGradient(w*.5,h*.4,5,w*.5,h*.4,Math.max(w,h)*.68);
   bg.addColorStop(0,'rgba(49,165,183,.085)');bg.addColorStop(.6,'rgba(26,80,125,.055)');
   bg.addColorStop(1,'rgba(7,25,41,0)');
   ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
   const paths=cached.length?cached:geometry();
   for(const [i,r] of paths.entries()){
    const intensity=r.kind==='featured'?.62:.32;
    trace(r,r.color,intensity*.15,8);
    trace(r,r.color,intensity,1.2);
    const count=r.kind==='featured'?4:3;
    for(let j=0;j<count;j++){
     const progress=(time*(.08+.006*(i%4))+j/count+i*.11)%1;
     const p=cubic(r,progress);
     glow(p.x,p.y,13,r.color,.21);
     ctx.fillStyle=hexColor(r.color,.45+.43*Math.sin(Math.PI*progress));
     ctx.beginPath();ctx.arc(p.x,p.y,1.4,0,Math.PI*2);ctx.fill();
    }
    glow(r.end.x,r.end.y,13,r.color,.4);
   }
  }
  function tick(now){
   if(disposed)return;
   frame=requestAnimationFrame(tick);
   if(!visible||document.hidden||document.body.classList.contains('portrait')||reduced.matches)return;
   const fps=w<700?14:23;
   if(now-last<1000/fps)return;
   time+=clamp((now-last)/1000||.035,0,.1);
   last=now;
   render();
  }
  const ro=new ResizeObserver(resize);ro.observe(record);
  const io=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??false},{threshold:.01});
  io.observe(record);
  const mo=new MutationObserver(()=>{cached=geometry();});
  mo.observe(document.getElementById('eventList'),{childList:true});
  resize();render();frame=requestAnimationFrame(tick);
  window.addEventListener('pagehide',()=>{
   disposed=true;cancelAnimationFrame(frame);ro.disconnect();io.disconnect();mo.disconnect();
  },{once:true});
 }
}
