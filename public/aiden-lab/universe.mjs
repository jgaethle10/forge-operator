// Aiden's Lab: entirely local, decorative universe animation. No tracking,
// external requests, live telemetry claims, model calls or learner data.
export const frameBudgetMs = 33;
export const pixelRatio = (dpr = 1) => Math.min(1.75, Math.max(1, dpr || 1));
export function seededPoint(index) {
  const frac = (v) => v - Math.floor(v);
  return {
    x: frac(Math.sin(index * 78.233 + 12.9) * 43758.5453),
    y: frac(Math.sin(index * 26.921 + 71.1) * 12515.873),
    r: 0.35 + frac(Math.sin(index * 15.781 + 8.2) * 8251.28) * 1.65,
    phase: frac(Math.sin(index * 9.87 + 39.4) * 8923.2) * Math.PI * 2
  };
}

export function startUniverse(canvas) {
  if (!canvas || typeof window === 'undefined') return () => {};
  const context = canvas.getContext('2d', { alpha:true });
  if (!context) return () => {};
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const stars = Array.from({ length: 96 }, (_, i) => seededPoint(i + 1));
  const nodes = [
    [0.17, 0.21],[0.77, 0.13],[0.88, 0.45],[0.73, 0.83],[0.19, 0.79],
    [0.12, 0.49],[0.51, 0.12],[0.48, 0.93],[0.33, 0.59],[0.66, 0.45]
  ];
  let w = 0, h = 0, visible = true, active = true, handle = 0, last = 0, lastTime = 0;
  function resize() {
    const bounds = canvas.getBoundingClientRect();
    w = Math.max(1, Math.floor(bounds.width));
    h = Math.max(1, Math.floor(bounds.height));
    const dpr = pixelRatio(window.devicePixelRatio);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    context.setTransform(dpr,0,0,dpr,0,0);
    if (reducedMotion.matches) paint(0);
  }
  function dot(x,y,r,color) {
    context.beginPath();context.arc(x,y,r,0,Math.PI*2);
    context.fillStyle=color;context.fill();
  }
  function paint(t) {
    context.clearRect(0,0,w,h);
    const centerX = w * .5, centerY = h * .48, radius = Math.min(w,h) * .43;
    const fog = context.createRadialGradient(centerX,centerY,0,centerX,centerY,radius);
    fog.addColorStop(0,'rgba(62,220,217,.12)');
    fog.addColorStop(.46,'rgba(37,117,160,.065)');
    fog.addColorStop(1,'rgba(4,11,35,0)');
    context.fillStyle=fog;context.fillRect(0,0,w,h);
    for(let i=0;i<stars.length;i++){
      const star=stars[i];
      const drift=reducedMotion.matches?0:Math.sin(t*.00013+star.phase)*3.5;
      const alpha=(.26 + .5 * Math.pow(Math.sin(t*.00055+star.phase),2)).toFixed(3);
      dot(star.x*w+drift,star.y*h,star.r,w<440?'rgba(221,250,245,'+alpha+')':'rgba(222,247,255,'+alpha+')');
    }
    context.lineWidth=1;
    for(let i=0;i<nodes.length;i++){
      const [nx,ny]=nodes[i];
      const [mx,my]=nodes[(i+3)%nodes.length];
      const x=nx*w,y=ny*h,bx=mx*w,by=my*h;
      const pulse = .10 + .07*Math.sin(t*.0013+i);
      context.strokeStyle='rgba(108,234,207,'+Math.max(.03,pulse)+')';
      context.beginPath();context.moveTo(x,y);context.lineTo(bx,by);context.stroke();
      if(i%2===0){
        const p=reducedMotion.matches ? .36 : (t*.000065 + i*.21)%1;
        dot(x+(bx-x)*p,y+(by-y)*p,2.2,'rgba(193,249,219,.8)');
      }
      dot(x,y,2.5,'rgba(157,247,225,.55)');
    }
    for(let j=0;j<3;j++){
      const angle=t*.00013+j*2.13;
      const x=centerX+Math.cos(angle)*radius*.74;
      const y=centerY+Math.sin(angle)*radius*.42;
      dot(x,y,3.2,'rgba(204,255,197,.88)');
    }
  }
  function animate(t) {
    if(!active || !visible || document.hidden) {handle=0;return}
    if(t-last>=frameBudgetMs){paint(t);last=t;lastTime=t}
    handle=requestAnimationFrame(animate);
  }
  function sync(){
    const shouldAnimate = active && visible && !document.hidden && !reducedMotion.matches;
    if(handle){cancelAnimationFrame(handle);handle=0}
    paint(lastTime);
    if(shouldAnimate)handle=requestAnimationFrame(animate);
  }
  const observer=typeof IntersectionObserver==='function'?
    new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??true;sync()},{threshold:.01}):null;
  if(observer)observer.observe(canvas);
  const onChange=()=>sync();
  const onResize=()=>{resize();sync()};
  window.addEventListener('resize',onResize,{passive:true});
  document.addEventListener('visibilitychange',onChange);
  if(typeof reducedMotion.addEventListener==='function')reducedMotion.addEventListener('change',onChange);
  resize();sync();
  return ()=>{
    active=false;
    if(handle)cancelAnimationFrame(handle);
    observer?.disconnect();
    window.removeEventListener('resize',onResize);
    document.removeEventListener('visibilitychange',onChange);
    if(typeof reducedMotion.removeEventListener==='function')reducedMotion.removeEventListener('change',onChange);
  };
}
if (typeof document !== 'undefined') startUniverse(document.getElementById('universeCanvas'));
