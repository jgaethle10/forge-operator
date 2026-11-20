// KAIDANCE visual theater. Ambient art only: this module has NO network,
// timers that mutate source state, simulated work counts, or private data.
// The ONLY verified heartbeat trigger is controlled by app.mjs.
const canvas=document.getElementById('visualField');
const stage=document.getElementById('stage');
if(canvas&&stage){
 const context=canvas.getContext('2d',{alpha:true});
 if(context){
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  let w=0,h=0,dpr=1,frame=0,last=0,disposed=false;
  const seeded=(n)=>{const v=Math.sin(n*297.31+13.7)*43758.5453;return v-Math.floor(v)};
  const particles=Array.from({length:74},(_,i)=>({
    phase:seeded(i+21)*Math.PI*2,
    radius:.16+seeded(i+42)*.77,
    speed:(.00014+seeded(i+71)*.00033)*(i%2===0?1:-1),
    size:.4+seeded(i+17)*1.6,
    opacity:.25+seeded(i+96)*.65
  }));
  const spokes=Array.from({length:17},(_,i)=>({
    angle:i*Math.PI*2/17+seeded(i)*.3,
    spread:.55+seeded(i+100)*.45
  }));
  function resize(){
    const rect=stage.getBoundingClientRect();
    w=Math.max(1,rect.width);h=Math.max(1,rect.height);
    dpr=Math.min(1.5,window.devicePixelRatio||1);
    canvas.width=Math.ceil(w*dpr);canvas.height=Math.ceil(h*dpr);
    canvas.style.width=w+'px';canvas.style.height=h+'px';
    context.setTransform(dpr,0,0,dpr,0,0);
  }
  function render(t){
    if(disposed)return;
    frame=requestAnimationFrame(render);
    if(document.hidden)return;
    const fps=reduced.matches?4:24;
    if(t-last<1000/fps)return;
    last=t;
    context.clearRect(0,0,w,h);
    const portrait=document.body.classList.contains('portrait');
    const mobile=w<680;
    const centerX=w*.5,centerY=h*(portrait?.41:mobile?.37:.40);
    const R=Math.min(w*(portrait?.47:.39),h*(portrait?.27:.34),265);
    const k=reduced.matches?0:t;
    // Faint technical contours. Concentric rings are artwork, not cycle state.
    context.save();
    context.translate(centerX,centerY);
    context.strokeStyle='rgba(122,201,241,.09)';
    context.lineWidth=.8;
    for(let ring=1;ring<=4;ring++){
      context.beginPath();context.ellipse(0,0,R*(.5+ring*.2),R*(.5+ring*.2),0,0,Math.PI*2);context.stroke();
    }
    // An engineered network lattice with gentle flowing decorative paths.
    for(let i=0;i<spokes.length;i++){
      const s=spokes[i],theta=s.angle;
      const x=Math.cos(theta)*R*1.16*s.spread,y=Math.sin(theta)*R*1.16*s.spread;
      context.beginPath();context.moveTo(Math.cos(theta+1.1)*R*.2,Math.sin(theta+1.1)*R*.2);
      context.quadraticCurveTo(x*.62,y*.62,x,y);
      context.strokeStyle='rgba(71,168,220,'+(i%4===0?.16:.07)+')';
      context.lineWidth=i%4===0?1.4:.7;context.stroke();
      if(i%3===0){
        context.fillStyle='rgba(155,234,255,.35)';
        context.fillRect(x-1,y-1,2,2);
      }
    }
    // Ambient particles move along an illustrative orbit. No particle maps to
    // an agent, job, mission, cycle, transaction or observable runtime event.
    const n=mobile?39:particles.length;
    for(let i=0;i<n;i++){
      const p=particles[i];
      const angle=p.phase+k*p.speed,rad=R*p.radius*(.91+.04*Math.sin(k*.0003+i));
      const x=Math.cos(angle)*rad,y=Math.sin(angle)*rad;
      const grad=context.createRadialGradient(x,y,0,x,y,p.size*7);
      grad.addColorStop(0,'rgba(186,242,255,'+(.52*p.opacity)+')');
      grad.addColorStop(.3,'rgba(91,205,255,'+(.26*p.opacity)+')');
      grad.addColorStop(1,'rgba(91,205,255,0)');
      context.fillStyle=grad;context.beginPath();context.arc(x,y,p.size*7,0,Math.PI*2);context.fill();
      context.fillStyle='rgba(218,251,255,'+p.opacity+')';
      context.beginPath();context.arc(x,y,p.size*.55,0,Math.PI*2);context.fill();
    }
    // Atmospheric sweeping light; consistent speed regardless of backend
    // availability. The real .beat animation stays exclusively in app.mjs.
    if(!reduced.matches){
      const angle=t*.0001;
      const grad=context.createLinearGradient(-R,-R,R,R);
      grad.addColorStop(0,'rgba(92,200,249,0)');
      grad.addColorStop(.5,'rgba(114,217,255,.055)');
      grad.addColorStop(1,'rgba(92,200,249,0)');
      context.strokeStyle=grad;context.lineWidth=R*.14;
      context.beginPath();context.arc(0,0,R*.83,angle,angle+.33);context.stroke();
    }
    context.restore();
  }
  const observer=new ResizeObserver(resize);
  observer.observe(stage);
  resize();frame=requestAnimationFrame(render);
  window.addEventListener('pagehide',()=>{cancelAnimationFrame(frame);observer.disconnect();disposed=true},{once:true});
 }
}
