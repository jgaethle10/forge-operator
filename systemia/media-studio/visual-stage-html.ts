import type {
  EvidenceState,
  GeoLayer,
  MetricLayer,
  PhenomenonLayer,
  TextLayer,
  TimelineLayer,
  VisualLayer,
  VisualStage,
} from './visual-stage.js';
import { validateStage } from './visual-stage.js';
import { resolveVisualTheme } from './visual-theme.js';

function esc(value:string){
  return value
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function safeJson(value:unknown){
  return JSON.stringify(value).replace(/</g,'\\u003c');
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

  if(layer.kind==='phenomenon'){
    const phenomenon=layer as PhenomenonLayer;
    const palette=phenomenon.colorEncoding?.palette?.length
      ? phenomenon.colorEncoding.palette
      : ['#2457ff','#00b7ff','#23e6c8','#f6d743','#ff633a'];
    const colorLegend=phenomenon.colorEncoding
      ? `<div class="phenomenon-legend-row"><span>${esc(phenomenon.colorEncoding.label)}</span><span class="phenomenon-gradient" style="background:linear-gradient(90deg,${palette.map(esc).join(',')})"></span><span>${phenomenon.colorEncoding.min}${esc(phenomenon.colorEncoding.unit??'')} → ${phenomenon.colorEncoding.max}${esc(phenomenon.colorEncoding.unit??'')}</span></div>`
      : '';
    const brightnessLegend=phenomenon.brightnessEncoding
      ? `<div class="phenomenon-legend-row">BRIGHTNESS = ${esc(phenomenon.brightnessEncoding.label)}</div>`
      : '';
    return `<div class="layer phenomenon-layer" data-layer="${esc(layer.id)}" style="${base}">
      <canvas data-phenomenon-canvas width="${layer.width}" height="${layer.height}"></canvas>
      <div class="phenomenon-title">${esc(phenomenon.title)}</div>
      ${phenomenon.subtitle? `<div class="phenomenon-subtitle">${esc(phenomenon.subtitle)}</div>` : ''}
      <div class="phenomenon-time" data-phenomenon-time></div>
      ${badge}
      ${phenomenon.callout? `<div class="phenomenon-callout">${esc(phenomenon.callout)}</div>` : ''}
      <div class="phenomenon-legend">${colorLegend}${brightnessLegend}<div class="phenomenon-legend-row">MOTION = ${esc(phenomenon.motionLabel)}</div></div>
      <div class="phenomenon-source">Data: ${esc(phenomenon.sourceLabel)}</div>
    </div>`;
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
  const theme=resolveVisualTheme(stage.theme);
  const json=safeJson(stage);
  const layers=stage.layers.map(layerMarkup).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(stage.id)} - Evercraft Visual Stage</title>
<style>
:root{
  --ev-bg:${theme.palette.background};
  --ev-surface:${theme.palette.surface};
  --ev-surface-raised:${theme.palette.surfaceRaised};
  --ev-text:${theme.palette.textPrimary};
  --ev-text-secondary:${theme.palette.textSecondary};
  --ev-gold:${theme.palette.accentGold};
  --ev-ice:${theme.palette.accentIce};
  --ev-grid:${theme.palette.grid};
  --ev-route-observed:${theme.palette.routeObserved};
  --ev-route-modeled:${theme.palette.routeModeled};
  --ev-point:${theme.palette.point};
  --ev-timeline-rail:${theme.palette.timelineRail};
  --ev-timeline-playhead:${theme.palette.timelinePlayhead};
}
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:var(--ev-bg)}
body{display:flex;align-items:center;justify-content:center}
#viewport{position:relative;width:${stage.width}px;height:${stage.height}px;overflow:hidden;background:${esc(stage.background||theme.palette.background)};color:var(--ev-text)}
#camera{position:absolute;inset:0;transform-origin:center center}
.layer{box-sizing:border-box}
.media-layer{overflow:hidden}
.text-layer{display:flex;align-items:center;white-space:pre-wrap;color:var(--ev-text)}
.metric-layer{display:flex;flex-direction:column;justify-content:center}
.metric-label{font:600 22px var(--ev-font,Montserrat,Arial,sans-serif);letter-spacing:2px;color:var(--ev-text-secondary);opacity:.78}
.metric-value{font:700 64px var(--ev-font,Montserrat,Arial,sans-serif);line-height:1;color:var(--ev-text)}
.evidence-badge{position:absolute;left:12px;bottom:12px;font:700 11px var(--ev-font,Montserrat,Arial,sans-serif);letter-spacing:1.5px;padding:5px 8px;border:1px solid var(--ev-text-secondary);background:color-mix(in srgb,var(--ev-bg) 78%,transparent);color:var(--ev-text)}
.ev-observed{border-color:${theme.evidence.observed}}
.ev-public_source{border-color:${theme.evidence.public_source};color:${theme.evidence.public_source}}
.ev-licensed{border-color:${theme.evidence.licensed};color:${theme.evidence.licensed}}
.ev-modeled,.ev-inferred,.ev-synthetic_visualization{border-style:dashed;border-color:var(--ev-gold);color:var(--ev-gold)}
.timeline-rail{position:absolute;left:0;right:0;top:50%;height:2px;background:var(--ev-timeline-rail)}
.timeline-playhead{position:absolute;top:25%;bottom:25%;width:2px;background:var(--ev-timeline-playhead)}
.timeline-event{position:absolute;top:42%;width:8px;height:8px;border-radius:50%;background:var(--ev-text)}
.phenomenon-layer{overflow:hidden;background:#030609}.phenomenon-layer canvas{position:absolute;inset:0;width:100%;height:100%}
.phenomenon-title{position:absolute;left:6.5%;top:4.5%;max-width:78%;font:650 52px/1.04 var(--ev-font,Montserrat,Arial,sans-serif);letter-spacing:.02em;text-shadow:0 2px 24px #000}
.phenomenon-subtitle{position:absolute;left:6.6%;top:8.3%;font:500 22px var(--ev-font,Montserrat,Arial,sans-serif);letter-spacing:.08em;color:rgba(233,244,255,.72);text-transform:uppercase}
.phenomenon-time{position:absolute;right:6.5%;top:4.7%;font:500 20px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.1em;color:rgba(233,244,255,.76)}
.phenomenon-layer>.evidence-badge{left:auto;right:6.5%;top:8.2%;bottom:auto;background:rgba(3,6,9,.64)}
.phenomenon-callout{position:absolute;left:6.5%;bottom:13.5%;max-width:78%;font:560 30px/1.18 var(--ev-font,Montserrat,Arial,sans-serif);text-shadow:0 2px 24px #000}
.phenomenon-legend{position:absolute;left:6.5%;bottom:5.2%;display:flex;flex-direction:column;gap:8px;min-width:420px}
.phenomenon-legend-row{display:flex;align-items:center;gap:14px;font:500 14px var(--ev-font,Montserrat,Arial,sans-serif);letter-spacing:.11em;text-transform:uppercase;color:rgba(233,244,255,.72)}
.phenomenon-gradient{display:inline-block;width:260px;height:10px;border-radius:99px;border:1px solid rgba(255,255,255,.12)}
.phenomenon-source{position:absolute;right:6.5%;bottom:5.1%;max-width:42%;text-align:right;font:500 13px/1.35 var(--ev-font,Montserrat,Arial,sans-serif);color:rgba(233,244,255,.52)}
</style>
</head>
<body style="--ev-font:${esc(theme.fontFamily)};">
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
  const phenCache=new Map();
  const phenHash=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0)/4294967295};
  const phenHex=h=>{const x=String(h||'').replace('#','');const v=parseInt(x.length===3?x.split('').map(c=>c+c).join(''):x,16);return {r:(v>>16)&255,g:(v>>8)&255,b:v&255}};
  const phenColor=(v,enc)=>{if(!enc)return {r:52,g:211,b:196};const pal=enc.palette&&enc.palette.length>1?enc.palette:['#2457ff','#00b7ff','#23e6c8','#f6d743','#ff633a'];const p=clamp((v-enc.min)/(enc.max-enc.min),0,1)*(pal.length-1),i=Math.min(pal.length-2,Math.floor(p)),q=p-i,a=phenHex(pal[i]),b=phenHex(pal[i+1]);return {r:Math.round(a.r+(b.r-a.r)*q),g:Math.round(a.g+(b.g-a.g)*q),b:Math.round(a.b+(b.b-a.b)*q)}};
  const phenLonSpan=b=>b.east>=b.west?b.east-b.west:(180-b.west)+(b.east+180);
  const phenLonP=(lon,b)=>{
    if(b.east>=b.west) return clamp((lon-b.west)/(b.east-b.west),0,1);
    let d=lon-b.west;if(d<0)d+=360;return clamp(d/phenLonSpan(b),0,1);
  };
  const phenProject=(p,l)=>({x:phenLonP(p.lon,l.bounds)*l.width,y:(l.bounds.north-p.lat)/(l.bounds.north-l.bounds.south)*l.height});
  const phenPrepare=l=>{
    if(phenCache.has(l.id))return phenCache.get(l.id);
    const rows=(l.streamlines||[]).map(s=>{const pts=s.points.map(p=>({...phenProject(p,l),colorValue:p.colorValue,magnitude:p.magnitude})),lens=[0];let total=0;for(let i=1;i<pts.length;i++){total+=Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y);lens.push(total)}return {...s,pts,lens,total:Math.max(total,1)}});
    phenCache.set(l.id,rows);return rows;
  };
  const phenSample=(s,p)=>{const target=clamp(p,0,1)*s.total;let i=1;while(i<s.lens.length&&s.lens[i]<target)i++;i=Math.min(i,s.pts.length-1);const a=s.pts[i-1],b=s.pts[i],span=s.lens[i]-s.lens[i-1]||1,q=clamp((target-s.lens[i-1])/span,0,1);return {x:a.x+(b.x-a.x)*q,y:a.y+(b.y-a.y)*q,colorValue:(a.colorValue??0)+((b.colorValue??0)-(a.colorValue??0))*q,magnitude:(a.magnitude??0)+((b.magnitude??0)-(a.magnitude??0))*q}};
  const drawPhenomenon=(el,l,t)=>{
    const canvas=el.querySelector('[data-phenomenon-canvas]');if(!canvas)return;const ctx=canvas.getContext('2d'),W=l.width,H=l.height;
    ctx.clearRect(0,0,W,H);const g=ctx.createRadialGradient(W*.52,H*.47,0,W*.52,H*.47,Math.max(W,H)*.72);g.addColorStop(0,'#07151b');g.addColorStop(1,'#020407');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    ctx.save();ctx.lineWidth=1.15;ctx.strokeStyle='rgba(170,205,222,.20)';for(const shape of l.outlines||[]){if(!shape.points||shape.points.length<2)continue;ctx.beginPath();shape.points.forEach((p,i)=>{const q=phenProject(p,l);if(i===0)ctx.moveTo(q.x,q.y);else ctx.lineTo(q.x,q.y)});ctx.stroke()}ctx.restore();
    ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineCap='round';for(const s of phenPrepare(l)){const count=Math.max(1,Math.round((s.particles||Math.max(2,Math.round(s.total/85)))*(l.particleDensity||1))),rate=(s.speed||1)*.035,trail=l.trailFraction||.055;for(let j=0;j<count;j++){const seed=phenHash(s.id+':'+j),head=(seed+t*rate)%1,steps=8;for(let k=0;k<steps;k++){let a=head-trail*(k/steps),b=head-trail*((k+1)/steps);while(a<0)a+=1;while(b<0)b+=1;if(a<b&&head<trail)continue;const p1=phenSample(s,a),p2=phenSample(s,b),col=phenColor(p2.colorValue,l.colorEncoding),mag=l.brightnessEncoding?clamp((p2.magnitude-l.brightnessEncoding.min)/(l.brightnessEncoding.max-l.brightnessEncoding.min),0,1):.65,fade=(steps-k)/steps;ctx.strokeStyle='rgba('+col.r+','+col.g+','+col.b+','+(0.08+0.56*mag*fade)+')';ctx.lineWidth=.65+1.65*mag;ctx.shadowBlur=2+8*mag;ctx.shadowColor='rgba('+col.r+','+col.g+','+col.b+','+(0.15+.35*mag)+')';ctx.beginPath();ctx.moveTo(p1.x,p1.y);ctx.lineTo(p2.x,p2.y);ctx.stroke()}const p=phenSample(s,head),col=phenColor(p.colorValue,l.colorEncoding),mag=l.brightnessEncoding?clamp((p.magnitude-l.brightnessEncoding.min)/(l.brightnessEncoding.max-l.brightnessEncoding.min),0,1):.65;ctx.fillStyle='rgba('+col.r+','+col.g+','+col.b+','+(0.42+.55*mag)+')';ctx.beginPath();ctx.arc(p.x,p.y,1.1+1.4*mag,0,Math.PI*2);ctx.fill()}}ctx.restore();
    ctx.save();ctx.font='500 18px ui-monospace,SFMono-Regular,Menlo,monospace';ctx.fillStyle='rgba(225,239,247,.72)';for(const item of l.labels||[]){const p=phenProject(item,l);ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);ctx.fill();ctx.fillText(String(item.label||'').toUpperCase(),p.x+10,p.y+5)}ctx.restore();
    const timeNode=el.querySelector('[data-phenomenon-time]');if(timeNode&&l.time){const a=Date.parse(l.time.startIso),b=Date.parse(l.time.endIso),p=stage.durationSec?clamp(t/stage.durationSec,0,1):0,stamp=new Date(a+(b-a)*p);timeNode.textContent=(l.time.label?l.time.label+' · ':'')+stamp.toISOString().replace('T',' ').slice(0,16)+' UTC'}else if(timeNode)timeNode.textContent='';
  };

  const drawGeo=(el,layer,t)=>{
    const ns='http://www.w3.org/2000/svg';el.replaceChildren();
    if(layer.grid){
      for(let lon=-180;lon<=180;lon+=30){
        const a=project(-80,lon,layer),b=project(80,lon,layer);
        const line=document.createElementNS(ns,'line');line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);line.setAttribute('x2',b.x);line.setAttribute('y2',b.y);line.setAttribute('stroke',stage.theme?.palette?.grid||'rgba(255,255,255,.08)');line.setAttribute('stroke-width','1');el.appendChild(line);
      }
      for(let lat=-60;lat<=60;lat+=30){
        const pts=[];for(let lon=-180;lon<=180;lon+=10)pts.push(project(lat,lon,layer));
        const path=document.createElementNS(ns,'polyline');path.setAttribute('points',pts.map(p=>p.x+','+p.y).join(' '));path.setAttribute('fill','none');path.setAttribute('stroke',stage.theme?.palette?.grid||'rgba(255,255,255,.08)');path.setAttribute('stroke-width','1');el.appendChild(path);
      }
    }
    for(const route of layer.routes||[]){
      const pts=route.points.map(p=>project(p.lat,p.lon,layer));
      const shown=trim(pts,clamp(at(route.progress,t,t/stage.durationSec),0,1));
      const path=document.createElementNS(ns,'polyline');path.setAttribute('points',shown.map(p=>p.x+','+p.y).join(' '));path.setAttribute('fill','none');path.setAttribute('stroke',['modeled','inferred','synthetic_visualization'].includes(route.evidenceState)?(stage.theme?.palette?.routeModeled||'#d0a85c'):(stage.theme?.palette?.routeObserved||'rgba(255,255,255,.88)'));path.setAttribute('stroke-width',route.width||3);path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');if(['modeled','inferred','synthetic_visualization'].includes(route.evidenceState))path.setAttribute('stroke-dasharray','10 8');el.appendChild(path);
    }
    for(const point of layer.points||[]){
      const p=project(point.lat,point.lon,layer);
      const baseRadius=clamp(Number(point.radius)||5,2,24);
      const intensity=clamp(Number(point.intensity),0,1);
      const pulse=point.pulse ? 1+0.16*Math.sin(t*2.6) : 1;
      const color=stage.theme?.palette?.point||'#fff';
      if(point.pulse){
        const ring=document.createElementNS(ns,'circle');
        ring.setAttribute('cx',p.x);ring.setAttribute('cy',p.y);
        ring.setAttribute('r',String(baseRadius*(1.65+0.22*Math.sin(t*2.6))));
        ring.setAttribute('fill','none');ring.setAttribute('stroke',color);
        ring.setAttribute('stroke-width',String(1.25+1.75*intensity));
        ring.setAttribute('opacity',String(.12+.28*intensity));
        el.appendChild(ring);
      }
      const circle=document.createElementNS(ns,'circle');
      circle.setAttribute('cx',p.x);circle.setAttribute('cy',p.y);
      circle.setAttribute('r',String(baseRadius*pulse));
      circle.setAttribute('fill',color);
      circle.setAttribute('opacity',String(.58+.4*intensity));
      el.appendChild(circle);
      if(point.label){
        const label=document.createElementNS(ns,'text');label.setAttribute('x',p.x+baseRadius+7);label.setAttribute('y',p.y-8);
        label.setAttribute('fill',stage.theme?.palette?.textPrimary||'rgba(255,255,255,.88)');
        label.setAttribute('font-size',String(14+Math.round(3*intensity)));
        label.setAttribute('font-family',stage.theme?.fontFamily||'Montserrat,Arial,sans-serif');
        label.textContent=point.label;el.appendChild(label)
      }
    }
  };
  window.__evercraftRenderAt=async(timeSec)=>{
    const t=clamp(Number(timeSec)||0,0,stage.durationSec);
    const c=cameraAt(t);
    const camera=document.getElementById('camera');
    camera.style.transform='translate('+(-c.x)+'px,'+(-c.y)+'px) scale('+c.zoom+') rotate('+(c.rotationDeg||0)+'deg)';
    for(const layer of stage.layers){
      const el=document.querySelector('[data-layer="'+CSS.escape(layer.id)+'"]');if(!el)continue;
      const opacity=clamp(at(layer.opacity,t,1),0,1),scale=Math.max(0,at(layer.scale,t,1)),rot=at(layer.rotationDeg,t,0),rx=at(layer.rotateXDeg,t,0),ry=at(layer.rotateYDeg,t,0),tx=at(layer.translateX,t,0),ty=at(layer.translateY,t,0),parallax=Number.isFinite(Number(layer.parallax))?Number(layer.parallax):1,perspective=Number.isFinite(Number(layer.perspectivePx))?Number(layer.perspectivePx):1200;
      const px=c.x*(1-parallax),py=c.y*(1-parallax),pz=Math.pow(Math.max(.0001,c.zoom),parallax-1);
      el.style.opacity=opacity;el.style.transform='perspective('+perspective+'px) translate('+(tx+px)+'px,'+(ty+py)+'px) scale('+(scale*pz)+') rotateX('+rx+'deg) rotateY('+ry+'deg) rotate('+(rot+(c.rotationDeg||0)*(parallax-1))+'deg)';
      if(layer.kind==='media'){
        const video=el.querySelector('video');
        if(video){
          let desired=(layer.trimStartSec||0)+t*(layer.playbackRate||1);
          if(layer.loop && Number.isFinite(video.duration) && video.duration>0){
            desired=desired%video.duration;
          }
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
      if(layer.kind==='phenomenon') drawPhenomenon(el,layer,t);
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
