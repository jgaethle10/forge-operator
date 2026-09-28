const FALLBACK_THEME={
  fontFamily:'Arial, sans-serif',
  palette:{
    background:'#080b0b',
    surface:'#111719',
    surfaceRaised:'#1a2024',
    textPrimary:'#ffffff',
    textSecondary:'#b9bec3',
    accentGold:'#d0a85c',
    accentIce:'#65bfff',
    grid:'rgba(255,255,255,.08)',
    routeObserved:'rgba(255,255,255,.9)',
    routeModeled:'#d0a85c',
    point:'#ffffff',
    timelineRail:'rgba(255,255,255,.28)',
    timelinePlayhead:'#ffffff'
  },
  evidence:{
    observed:'#ffffff',
    public_source:'#65bfff',
    licensed:'#b9bec3',
    modeled:'#d0a85c',
    inferred:'#d0a85c',
    synthetic_visualization:'#d0a85c'
  }
};
function esc(value){
  return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function safeJson(value){
  return JSON.stringify(value).replace(/</g,'\\u003c');
}
function assetId(uri){
  const match=String(uri||'').match(/^asset:\/\/([a-zA-Z0-9._-]+)$/);
  return match?.[1]||null;
}
function evidenceLabel(state){
  return ({
    observed:'OBSERVED',
    public_source:'PUBLIC SOURCE',
    licensed:'LICENSED',
    modeled:'MODELED',
    inferred:'INFERRED',
    synthetic_visualization:'VISUALIZATION'
  })[state]||'';
}
function layerMarkup(layer){
  const base=`position:absolute;left:${Number(layer.x)||0}px;top:${Number(layer.y)||0}px;width:${Number(layer.width)||0}px;height:${Number(layer.height)||0}px;z-index:${Number(layer.z)||0};transform-origin:center center;`;
  const label=evidenceLabel(layer.evidenceState);
  const badge=label?`<div class="evidence-badge ev-${esc(layer.evidenceState)}">${esc(label)}</div>`:'';
  if(layer.kind==='media'){
    const id=assetId(layer.sourcePath);
    const src=`https://fallen.local/assets/${encodeURIComponent(id)}`;
    const tag=layer.mediaKind==='video'
      ? `<video src="${src}" muted playsinline preload="auto" style="width:100%;height:100%;object-fit:${layer.fit==='contain'?'contain':'cover'}"></video>`
      : `<img src="${src}" style="width:100%;height:100%;object-fit:${layer.fit==='contain'?'contain':'cover'}"/>`;
    return `<div class="layer media-layer" data-layer="${esc(layer.id)}" style="${base}">${tag}${badge}</div>`;
  }
  if(layer.kind==='text') return `<div class="layer text-layer" data-layer="${esc(layer.id)}" style="${base};font-family:${esc(layer.fontFamily||'Montserrat,Arial,sans-serif')};font-size:${Number(layer.fontSize)||32}px;font-weight:${Number(layer.fontWeight)||600};letter-spacing:${Number(layer.letterSpacing)||0}px;text-align:${esc(layer.align||'left')}">${esc(layer.text||'')}${badge}</div>`;
  if(layer.kind==='metric') return `<div class="layer metric-layer" data-layer="${esc(layer.id)}" style="${base}"><div class="metric-label">${esc(layer.label||'')}</div><div data-metric-value class="metric-value"></div>${badge}</div>`;
  if(layer.kind==='geo') return `<svg class="layer geo-layer" data-layer="${esc(layer.id)}" viewBox="0 0 ${Number(layer.width)||1} ${Number(layer.height)||1}" style="${base}" xmlns="http://www.w3.org/2000/svg"></svg>`;
  if(layer.kind==='timeline') return `<div class="layer timeline-layer" data-layer="${esc(layer.id)}" style="${base}"><div class="timeline-rail"></div><div class="timeline-playhead"></div>${(layer.events||[]).map(event=>`<div class="timeline-event" data-event-t="${Number(event.t)||0}"></div>`).join('')}${badge}</div>`;
  return `<div class="layer shape-layer" data-layer="${esc(layer.id)}" style="${base}">${badge}</div>`;
}

export function buildStageHtml(stage){
  const theme=stage.theme||FALLBACK_THEME;
  const json=safeJson(stage);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><style>
:root{
  --ev-bg:${esc(theme.palette.background)};
  --ev-surface:${esc(theme.palette.surface)};
  --ev-text:${esc(theme.palette.textPrimary)};
  --ev-text-secondary:${esc(theme.palette.textSecondary)};
  --ev-gold:${esc(theme.palette.accentGold)};
  --ev-ice:${esc(theme.palette.accentIce)};
  --ev-grid:${esc(theme.palette.grid)};
  --ev-route-observed:${esc(theme.palette.routeObserved)};
  --ev-route-modeled:${esc(theme.palette.routeModeled)};
  --ev-point:${esc(theme.palette.point)};
  --ev-timeline-rail:${esc(theme.palette.timelineRail)};
  --ev-timeline-playhead:${esc(theme.palette.timelinePlayhead)};
}
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:var(--ev-bg)}
#viewport{position:relative;width:${stage.width}px;height:${stage.height}px;overflow:hidden;background:${esc(stage.background||theme.palette.background)};color:var(--ev-text)}
#camera{position:absolute;inset:0;transform-origin:center center}
.layer{box-sizing:border-box}.media-layer{overflow:hidden}.text-layer{display:flex;align-items:center;white-space:pre-wrap;color:var(--ev-text)}
.metric-layer{display:flex;flex-direction:column;justify-content:center}.metric-label{font:600 22px var(--ev-font,Arial,sans-serif);letter-spacing:2px;color:var(--ev-text-secondary);opacity:.78}.metric-value{font:700 64px var(--ev-font,Arial,sans-serif);color:var(--ev-text)}
.evidence-badge{position:absolute;left:12px;bottom:12px;font:700 11px var(--ev-font,Arial,sans-serif);letter-spacing:1.5px;padding:5px 8px;border:1px solid var(--ev-text-secondary);background:rgba(8,11,11,.78);color:var(--ev-text)}
.ev-public_source{color:${esc(theme.evidence.public_source)};border-color:${esc(theme.evidence.public_source)}}
.ev-licensed{color:${esc(theme.evidence.licensed)};border-color:${esc(theme.evidence.licensed)}}
.ev-modeled,.ev-inferred,.ev-synthetic_visualization{border-style:dashed;color:var(--ev-gold);border-color:var(--ev-gold)}
.timeline-rail{position:absolute;left:0;right:0;top:50%;height:2px;background:var(--ev-timeline-rail)}
.timeline-playhead{position:absolute;top:25%;bottom:25%;width:2px;background:var(--ev-timeline-playhead)}.timeline-event{position:absolute;top:42%;width:8px;height:8px;border-radius:50%;background:var(--ev-text)}
</style></head><body style="--ev-font:${esc(theme.fontFamily)}"><div id="viewport"><div id="camera">${stage.layers.map(layerMarkup).join('')}</div></div>
<script id="stage" type="application/json">${json}</script><script>
(()=>{
const stage=JSON.parse(document.getElementById('stage').textContent),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const ease=(n,t)=>{const x=clamp(t,0,1);if(n==='ease_in')return x*x;if(n==='ease_out')return 1-(1-x)*(1-x);if(n==='ease_in_out')return x<.5?2*x*x:1-Math.pow(-2*x+2,2)/2;return x};
const at=(i,t,f)=>{if(i===undefined)return f;if(typeof i==='number')return i;if(!i.length)return f;const a=[...i].sort((x,y)=>x.t-y.t);if(t<=a[0].t)return a[0].value;if(t>=a[a.length-1].t)return a[a.length-1].value;for(let k=1;k<a.length;k++){const r=a[k],l=a[k-1];if(t<=r.t){const p=ease(r.ease||l.ease,(t-l.t)/(r.t-l.t));return l.value+(r.value-l.value)*p}}return f};
const cam=t=>{const a=[...stage.camera.keyframes].sort((x,y)=>x.t-y.t);if(t<=a[0].t)return a[0];if(t>=a[a.length-1].t)return a[a.length-1];for(let k=1;k<a.length;k++){const r=a[k],l=a[k-1];if(t<=r.t){const p=ease(r.ease||l.ease,(t-l.t)/(r.t-l.t));return{x:l.x+(r.x-l.x)*p,y:l.y+(r.y-l.y)*p,zoom:l.zoom+(r.zoom-l.zoom)*p,rotationDeg:(l.rotationDeg||0)+((r.rotationDeg||0)-(l.rotationDeg||0))*p}}}};
const wrap=lon=>((lon+180)%360+360)%360-180,project=(lat,lon,l)=>{const cl=wrap(l.centerLon||0),ct=clamp(l.centerLat||0,-85,85);let d=wrap(lon)-cl;if(d>180)d-=360;if(d<-180)d+=360;const z=Math.max(.1,l.zoom||1),merc=deg=>Math.log(Math.tan(Math.PI/4+(deg*Math.PI/180)/2))/(2*Math.PI),ny=l.projection==='mercator'?merc(ct)-merc(clamp(lat,-85,85)):(ct-clamp(lat,-85,85))/180;return{x:l.width/2+(d/360)*l.width*z,y:l.height/2+ny*l.height*z}};
const trim=(pts,p)=>{if(pts.length<2||p>=1)return pts;if(p<=0)return[pts[0]];let total=0,lens=[0];for(let i=1;i<pts.length;i++){total+=Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y);lens.push(total)}const target=total*p,out=[pts[0]];for(let i=1;i<pts.length;i++){if(lens[i]<=target){out.push(pts[i]);continue}const q=(target-lens[i-1])/(lens[i]-lens[i-1]||1);out.push({x:pts[i-1].x+(pts[i].x-pts[i-1].x)*q,y:pts[i-1].y+(pts[i].y-pts[i-1].y)*q});break}return out};
const geo=(el,l,t)=>{const ns='http://www.w3.org/2000/svg';el.replaceChildren();if(l.grid){for(let lon=-180;lon<=180;lon+=30){const a=project(-80,lon,l),b=project(80,lon,l),n=document.createElementNS(ns,'line');for(const[k,v]of Object.entries({x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:(stage.theme?.palette?.grid||'rgba(255,255,255,.08)'),'stroke-width':1}))n.setAttribute(k,v);el.appendChild(n)}}for(const r of l.routes||[]){const pts=trim(r.points.map(p=>project(p.lat,p.lon,l)),clamp(at(r.progress,t,t/stage.durationSec),0,1)),n=document.createElementNS(ns,'polyline');n.setAttribute('points',pts.map(p=>p.x+','+p.y).join(' '));n.setAttribute('fill','none');n.setAttribute('stroke',['modeled','inferred','synthetic_visualization'].includes(r.evidenceState)?(stage.theme?.palette?.routeModeled||'#d0a85c'):(stage.theme?.palette?.routeObserved||'rgba(255,255,255,.9)'));n.setAttribute('stroke-width',r.width||3);if(['modeled','inferred','synthetic_visualization'].includes(r.evidenceState))n.setAttribute('stroke-dasharray','10 8');el.appendChild(n)}for(const q of l.points||[]){const p=project(q.lat,q.lon,l),n=document.createElementNS(ns,'circle');n.setAttribute('cx',p.x);n.setAttribute('cy',p.y);n.setAttribute('r',5);n.setAttribute('fill',stage.theme?.palette?.point||'#fff');el.appendChild(n)}};
window.__evercraftRenderAt=async sec=>{const t=clamp(Number(sec)||0,0,stage.durationSec),c=cam(t),camera=document.getElementById('camera');camera.style.transform='translate('+(-c.x)+'px,'+(-c.y)+'px) scale('+c.zoom+') rotate('+(c.rotationDeg||0)+'deg)';for(const l of stage.layers){const el=document.querySelector('[data-layer="'+CSS.escape(l.id)+'"]');if(!el)continue;const o=clamp(at(l.opacity,t,1),0,1),sc=Math.max(0,at(l.scale,t,1)),rot=at(l.rotationDeg,t,0),rx=at(l.rotateXDeg,t,0),ry=at(l.rotateYDeg,t,0),tx=at(l.translateX,t,0),ty=at(l.translateY,t,0),par=Number.isFinite(Number(l.parallax))?Number(l.parallax):1,per=Number.isFinite(Number(l.perspectivePx))?Number(l.perspectivePx):1200,px=c.x*(1-par),py=c.y*(1-par),pz=Math.pow(Math.max(.0001,c.zoom),par-1);el.style.opacity=o;el.style.transform='perspective('+per+'px) translate('+(tx+px)+'px,'+(ty+py)+'px) scale('+(sc*pz)+') rotateX('+rx+'deg) rotateY('+ry+'deg) rotate('+(rot+(c.rotationDeg||0)*(par-1))+'deg)';if(l.kind==='media'){const v=el.querySelector('video');if(v){let desired=(l.trimStartSec||0)+t*(l.playbackRate||1);if(l.loop&&Number.isFinite(v.duration)&&v.duration>0)desired=desired%v.duration;if(Math.abs(v.currentTime-desired)>.035){v.currentTime=Math.max(0,desired);await new Promise(resolve=>{let settled=false;const done=()=>{if(settled)return;settled=true;v.removeEventListener('seeked',done);resolve()};v.addEventListener('seeked',done,{once:true});setTimeout(done,350)})}}}if(l.kind==='metric'){const p=clamp(at(l.progress,t,t/stage.durationSec),0,1),v=l.from+(l.to-l.from)*p,n=el.querySelector('[data-metric-value]');if(n)n.textContent=v.toFixed(l.decimals||0)+(l.unit||'')}if(l.kind==='geo')geo(el,l,t);if(l.kind==='timeline'){const p=clamp(at(l.playhead,t,t/stage.durationSec),0,1),ph=el.querySelector('.timeline-playhead');if(ph)ph.style.left=(p*100)+'%';for(const e of el.querySelectorAll('[data-event-t]'))e.style.left=((Number(e.dataset.eventT)-l.startSec)/(l.endSec-l.startSec)*100)+'%'}}document.documentElement.dataset.evercraftFrameReady='true';document.documentElement.dataset.evercraftTime=t.toFixed(3);return{time:t}};
window.__evercraftRenderFrame=f=>window.__evercraftRenderAt(Number(f)/stage.fps);window.__evercraftStageReady=true;window.__evercraftRenderAt(0);
})();</script></body></html>`;
}
