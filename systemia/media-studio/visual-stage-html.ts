import type {
  EvidenceState,
  GeoLayer,
  MetricLayer,
  TextLayer,
  TimelineLayer,
  VisualLayer,
  VisualStage,
} from './visual-stage.js';
import { validateStage } from './visual-stage.js';

function esc(value:string){
  return value
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function safeJson(value:unknown){
  return JSON.stringify(value).replace(/</g,'\\u003c').replace(/<\\/script/gi,'<\\/script');
}

function evidenceLabel(state:EvidenceState|undefined){
  if(!state) return '';
  if(state==='observed') return 'OBSERVED';
  if(state==='public_source') return 'PUBLIC SOURCE';
  if(state==='licensed') return 'LICENSED';
  if(state==='modeled') return 'MODELED';
  if(state==='inferred') return 'INFERRED';
  return 'VISUALIZATION';
}

function evidenceClass(state:EvidenceState|undefined){
  return state ? ` ev-${state}` : '';
}

function layerMarkup(layer:VisualLayer){
  const base=`position:absolute;left:${layer.x}px;top:${layer.y}px;width:${layer.width}px;height:${layer.height}px;z-index:${layer.z};transform-origin:center center;`;
  const label=evidenceLabel(layer.evidenceState);
  const badge=label?`<div class="evidence-badge${evidenceClass(layer.evidenceState)}">${esc(label)}</div>`:'';

  if(layer.kind==='media'){
    const tag=layer.mediaKind==='video'
      ? `<video src="${esc(layer.sourcePath)}" data-source="${esc(layer.sourcePath)}" muted playsinline preload="auto" style="width:100%;height:100%;object-fit:${layer.fit};"></video>`
      : `<img src="${esc(layer.sourcePath)}" style="width:100%;height:100%;object-fit:${layer.fit};"/>`;
    return `<div class="layer media-layer" data-layer="${esc(layer.id)}" style="${base}">${tag}${badge}</div>`;
  }

  if(layer.kind==='text'){
    const text=layer as TextLayer;
    return `<div class="layer text-layer" data-layer="${esc(layer.id)}" style="${base};font-family:${esc(text.fontFamily??'Montserrat, Arial, sans-serif')};font-size:${text.fontSize}px;font-weight:${text.fontWeight??600};letter-spacing:${text.letterSpacing??0}px;text-align:${text.align??'left'}">${esc(text.text)}${badge}</div>`;
  }

  if(layer.kind==='metric'){
    const metric=layer as MetricLayer;
    return `<div class="layer metric-layer" data-layer="${esc(layer.id)}" style="${base}"><div class="metric-label">${esc(metric.label)}</div><div class="metric-value" data-metric-value></div>${badge}</div>`;
  }

  if(layer.kind==='geo'){
    return `<svg class="layer geo-layer" data-layer="${esc(layer.id)}" viewBox="0 0 ${layer.width} ${layer.height}" style="${base}" xmlns="http://www.w3.org/2000/svg"></svg>`;
  }

  if(layer.kind==='timeline'){
    const timeline=layer as TimelineLayer;
    return `<div class="layer timeline-layer" data-layer="${esc(layer.id)}" style="${base}"><div class="timeline-rail"></div><div class="timeline-playhead"></div>${timeline.events.map(event=>`<div class="timeline-event" data-event-t="${event.t}" title="${esc(event.label)}"></div>`).join('')}${badge}</div>`;
  }

  return `<div class="layer shape-layer" data-layer="${esc(layer.id)}" style="${base}">${badge}</div>`;
}

export function buildVisualStageHtml(stage:VisualStage){
  const validation=validateStage(stage);
  if(validation.status!=='accepted'){
    throw new Error(`Visual stage rejected: ${validation.errors.join(', ')}`);
  }
  const json=safeJson(stage);
  const layers=stage.layers.map(layerMarkup).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(stage.id)} - Evercraft Visual Stage</title>
<style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#080b0b}
body{display:flex;align-items:center;justify-content:center}
#viewport{position:relative;width:${stage.width}px;height:${stage.height}px;overflow:hidden;background:${esc(stage.background)};color:#fff}
#camera{position:absolute;inset:0;transform-origin:center center}
.layer{box-sizing:border-box}
.media-layer{overflow:hidden}
.text-layer{display:flex;align-items:center;white-space:pre-wrap}
.metric-layer{display:flex;flex-direction:column;justify-content:center}
.metric-label{font:600 22px Montserrat,Arial,sans-serif;letter-spacing:2px;opacity:.65}
.metric-value{font:700 64px Montserrat,Arial,sans-serif;line-height:1}
.evidence-badge{position:absolute;left:12px;bottom:12px;font:700 11px Montserrat,Arial,sans-serif;letter-spacing:1.5px;padding:5px 8px;border:1px solid rgba(255,255,255,.35);background:rgba(8,11,11,.72)}
.ev-modeled,.ev-inferred,.ev-synthetic_visualization{border-style:dashed}
.timeline-rail{position:absolute;left:0;right:0;top:50%;height:2px;background:rgba(255,255,255,.28)}
.timeline-playhead{position:absolute;top:25%;bottom:25%;width:2px;background:#fff}
.timeline-event{position:absolute;top:42%;width:8px;height:8px;border-radius:50%;background:#fff}
</style>
</head>
<body>
<div id="viewport"><div id="camera">${layers}</div></div>
<script id="evercraft-stage-data" type="application/json">${json}</script>
<script>
(() => {
  const stage=JSON.parse(document.getElementById('evercraft-stage-data').textContent);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const ease=(name,t)=>{
    const x=clamp(t,0,1);
    if(name==='ease_in') return x*x;
    if(name==='ease_out') return 1-(1-x)*(1-x);
    if(name==='ease_in_out') return x<.5?2*x*x:1-Math.pow(-2*x+2,2)/2;
    return x;
  };
  const at=(input,t,fallback)=>{
    if(input===undefined) return fallback;
    if(typeof input==='number') return input;
    if(!input.length) return fallback;
    const frames=[...input].sort((a,b)=>a.t-b.t);
    if(t<=frames[0].t) return frames[0].value;
    if(t>=frames[frames.length-1].t) return frames[frames.length-1].value;
    for(let i=1;i<frames.length;i++){
      const r=frames[i],l=frames[i-1];
      if(t<=r.t){
        const p=ease(r.ease||l.ease,(t-l.t)/(r.t-l.t));
        return l.value+(r.value-l.value)*p;
      }
    }
    return frames[frames.length-1].value;
  };
  const cameraAt=(t)=>{
    const frames=[...stage.camera.keyframes].sort((a,b)=>a.t-b.t);
    if(t<=frames[0].t) return frames[0];
    if(t>=frames[frames.length-1].t) return frames[frames.length-1];
    for(let i=1;i<frames.length;i++){
      const r=frames[i],l=frames[i-1];
      if(t<=r.t){
        const p=ease(r.ease||l.ease,(t-l.t)/(r.t-l.t));
        return {
          x:l.x+(r.x-l.x)*p,
          y:l.y+(r.y-l.y)*p,
          zoom:l.zoom+(r.zoom-l.zoom)*p,
          rotationDeg:(l.rotationDeg||0)+((r.rotationDeg||0)-(l.rotationDeg||0))*p
        };
      }
    }
  };
  const wrapLon=lon=>((lon+180)%360+360)%360-180;
  const project=(lat,lon,layer)=>{
    const centerLon=wrapLon(layer.centerLon||0);
    const centerLat=clamp(layer.centerLat||0,-85,85);
    let d=wrapLon(lon)-centerLon;if(d>180)d-=360;if(d<-180)d+=360;
    const z=Math.max(.1,layer.zoom||1);
    const nx=d/360;
    const merc=deg=>Math.log(Math.tan(Math.PI/4+(deg*Math.PI/180)/2))/(2*Math.PI);
    const ny=layer.projection==='mercator'?merc(centerLat)-merc(clamp(lat,-85,85)):(centerLat-clamp(lat,-85,85))/180;
    return {x:layer.width/2+nx*layer.width*z,y:layer.height/2+ny*layer.height*z};
  };
  const routeLength=pts=>{
    let total=0;const lens=[0];
    for(let i=1;i<pts.length;i++){total+=Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y);lens.push(total)}
    return {total,lens};
  };
  const trim=(pts,p)=>{
    if(pts.length<2||p>=1)return pts;if(p<=0)return [pts[0]];
    const {total,lens}=routeLength(pts),target=total*p,out=[pts[0]];
    for(let i=1;i<pts.length;i++){
      if(lens[i]<=target){out.push(pts[i]);continue}
      const q=(target-lens[i-1])/(lens[i]-lens[i-1]||1);
      out.push({x:pts[i-1].x+(pts[i].x-pts[i-1].x)*q,y:pts[i-1].y+(pts[i].y-pts[i-1].y)*q});break;
    }
    return out;
  };
  const drawGeo=(el,layer,t)=>{
    const ns='http://www.w3.org/2000/svg';el.replaceChildren();
    if(layer.grid){
      for(let lon=-180;lon<=180;lon+=30){
        const a=project(-80,lon,layer),b=project(80,lon,layer);
        const line=document.createElementNS(ns,'line');line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);line.setAttribute('x2',b.x);line.setAttribute('y2',b.y);line.setAttribute('stroke','rgba(255,255,255,.08)');line.setAttribute('stroke-width','1');el.appendChild(line);
      }
      for(let lat=-60;lat<=60;lat+=30){
        const pts=[];for(let lon=-180;lon<=180;lon+=10)pts.push(project(lat,lon,layer));
        const path=document.createElementNS(ns,'polyline');path.setAttribute('points',pts.map(p=>p.x+','+p.y).join(' '));path.setAttribute('fill','none');path.setAttribute('stroke','rgba(255,255,255,.08)');path.setAttribute('stroke-width','1');el.appendChild(path);
      }
    }
    for(const route of layer.routes||[]){
      const pts=route.points.map(p=>project(p.lat,p.lon,layer));
      const shown=trim(pts,clamp(at(route.progress,t,t/stage.durationSec),0,1));
      const path=document.createElementNS(ns,'polyline');path.setAttribute('points',shown.map(p=>p.x+','+p.y).join(' '));path.setAttribute('fill','none');path.setAttribute('stroke','rgba(255,255,255,.88)');path.setAttribute('stroke-width',route.width||3);path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');if(['modeled','inferred','synthetic_visualization'].includes(route.evidenceState))path.setAttribute('stroke-dasharray','10 8');el.appendChild(path);
    }
    for(const point of layer.points||[]){
      const p=project(point.lat,point.lon,layer);
      const circle=document.createElementNS(ns,'circle');circle.setAttribute('cx',p.x);circle.setAttribute('cy',p.y);circle.setAttribute('r','5');circle.setAttribute('fill','#fff');el.appendChild(circle);if(point.label){const label=document.createElementNS(ns,'text');label.setAttribute('x',p.x+10);label.setAttribute('y',p.y-8);label.setAttribute('fill','rgba(255,255,255,.88)');label.setAttribute('font-size','16');label.setAttribute('font-family','Montserrat,Arial,sans-serif');label.textContent=point.label;el.appendChild(label)}
    }
  };
  window.__evercraftRenderAt=async(timeSec)=>{
    const t=clamp(Number(timeSec)||0,0,stage.durationSec);
    const c=cameraAt(t);
    const camera=document.getElementById('camera');
    camera.style.transform='translate('+(-c.x)+'px,'+(-c.y)+'px) scale('+c.zoom+') rotate('+(c.rotationDeg||0)+'deg)';
    for(const layer of stage.layers){
      const el=document.querySelector('[data-layer="'+CSS.escape(layer.id)+'"]');if(!el)continue;
      const opacity=clamp(at(layer.opacity,t,1),0,1),scale=Math.max(0,at(layer.scale,t,1)),rot=at(layer.rotationDeg,t,0),tx=at(layer.translateX,t,0),ty=at(layer.translateY,t,0),parallax=Number.isFinite(Number(layer.parallax))?Number(layer.parallax):1;
      const px=c.x*(1-parallax),py=c.y*(1-parallax),pz=Math.pow(Math.max(.0001,c.zoom),parallax-1);
      el.style.opacity=opacity;el.style.transform='translate('+(tx+px)+'px,'+(ty+py)+'px) scale('+(scale*pz)+') rotate('+(rot+(c.rotationDeg||0)*(parallax-1))+'deg)';
      if(layer.kind==='media'){
        const video=el.querySelector('video');
        if(video){
          const desired=(layer.trimStartSec||0)+t*(layer.playbackRate||1);
          if(Math.abs(video.currentTime-desired)>.04){
            video.currentTime=Math.max(0,desired);
            await new Promise(resolve=>{const done=()=>{video.removeEventListener('seeked',done);resolve()};video.addEventListener('seeked',done,{once:true});setTimeout(done,250)});
          }
        }
      }
      if(layer.kind==='metric'){
        const p=clamp(at(layer.progress,t,t/stage.durationSec),0,1);
        const v=layer.from+(layer.to-layer.from)*p;
        const node=el.querySelector('[data-metric-value]');
        if(node)node.textContent=v.toFixed(layer.decimals||0)+(layer.unit||'');
      }
      if(layer.kind==='geo') drawGeo(el,layer,t);
      if(layer.kind==='timeline'){
        const p=clamp(at(layer.playhead,t,t/stage.durationSec),0,1);
        const ph=el.querySelector('.timeline-playhead');if(ph)ph.style.left=(p*100)+'%';
        for(const event of el.querySelectorAll('[data-event-t]'))event.style.left=((Number(event.dataset.eventT)-layer.startSec)/(layer.endSec-layer.startSec)*100)+'%';
      }
    }
    document.documentElement.dataset.evercraftFrameReady='true';
    document.documentElement.dataset.evercraftTime=t.toFixed(3);
    return {time:t};
  };
  window.__evercraftRenderFrame=frame=>window.__evercraftRenderAt(Number(frame)/stage.fps);
  window.__evercraftStageReady=true;
  window.__evercraftRenderAt(0);
})();
</script>
</body>
</html>`;
}
