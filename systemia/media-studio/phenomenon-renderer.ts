import crypto from 'node:crypto';

export type PhenomenonEvidenceState =
  | 'observed'
  | 'public_source'
  | 'licensed'
  | 'modeled'
  | 'inferred'
  | 'synthetic_visualization';

export interface PhenomenonGeoPoint {
  lat: number;
  lon: number;
}

export interface PhenomenonSample extends PhenomenonGeoPoint {
  colorValue?: number;
  magnitude?: number;
}

export interface PhenomenonStream {
  id: string;
  points: PhenomenonSample[];
  particles?: number;
  speed?: number;
  sourceRefs?: string[];
}

export interface PhenomenonOutline {
  id: string;
  points: PhenomenonGeoPoint[];
}

export interface PhenomenonLabel extends PhenomenonGeoPoint {
  label: string;
}

export interface PhenomenonInput {
  schema?: 'evercraft.fallen.phenomenon.v1';
  id: string;
  title: string;
  subtitle?: string;
  durationSec?: number;
  aspectRatio?: '16:9' | '9:16';
  time?: {
    startIso: string;
    endIso: string;
    label?: string;
    playbackRate?: number;
  };
  geography: {
    bounds: {
      north: number;
      south: number;
      east: number;
      west: number;
    };
    outlines?: PhenomenonOutline[];
    labels?: PhenomenonLabel[];
  };
  encoding: {
    motionLabel: string;
    color?: {
      label: string;
      min: number;
      max: number;
      unit?: string;
      palette?: string[];
    };
    brightness?: {
      label: string;
      min: number;
      max: number;
      unit?: string;
    };
  };
  field: {
    kind: 'flow';
    evidenceState: PhenomenonEvidenceState;
    sourceRefs: string[];
    streamlines: PhenomenonStream[];
    particleDensity?: number;
    trailFraction?: number;
  };
  source: {
    label: string;
    refs: string[];
  };
  callout?: string;
}

export interface PhenomenonReceipt {
  schema: 'evercraft.fallen.phenomenon-receipt.v1';
  phenomenon_id: string;
  status: 'accepted';
  digest: string;
  evidence_state: PhenomenonEvidenceState;
  source_refs: string[];
  stream_count: number;
  sample_count: number;
  exact_frame_control: true;
  publication_authority: false;
}

function clean(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function unique(values: string[] | undefined) {
  return [...new Set((values ?? []).map(clean).filter(Boolean))];
}

function finite(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value);
}

function safeJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function esc(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function digest(value: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function evidenceLabel(state: PhenomenonEvidenceState) {
  if (state === 'observed') return 'OBSERVED';
  if (state === 'public_source') return 'PUBLIC SOURCE';
  if (state === 'licensed') return 'LICENSED';
  if (state === 'modeled') return 'MODELED';
  if (state === 'inferred') return 'INFERRED';
  return 'VISUALIZATION';
}

export function validatePhenomenon(input: PhenomenonInput) {
  const errors: string[] = [];
  if (!clean(input?.id)) errors.push('id_missing');
  if (!clean(input?.title)) errors.push('title_missing');
  if (input?.field?.kind !== 'flow') errors.push('field_kind_unsupported');

  const bounds = input?.geography?.bounds;
  if (!bounds || ![bounds.north, bounds.south, bounds.east, bounds.west].every(finite)) {
    errors.push('bounds_invalid');
  } else {
    if (bounds.north <= bounds.south) errors.push('bounds_latitude_order_invalid');
    if (bounds.east === bounds.west) errors.push('bounds_longitude_span_invalid');
  }

  const sourceRefs = unique(input?.source?.refs);
  const fieldRefs = unique(input?.field?.sourceRefs);
  if (!clean(input?.source?.label)) errors.push('source_label_missing');
  if (!sourceRefs.length) errors.push('source_refs_missing');
  if (!fieldRefs.length) errors.push('field_source_refs_missing');

  const approvedRefs = new Set(sourceRefs);
  for (const ref of fieldRefs) {
    if (!approvedRefs.has(ref)) errors.push(`field_source_ref_outside_source:${ref}`);
  }

  const streams = input?.field?.streamlines ?? [];
  if (!streams.length) errors.push('streamlines_missing');

  for (const stream of streams) {
    if (!clean(stream.id)) errors.push('stream_id_missing');
    if (!Array.isArray(stream.points) || stream.points.length < 2) {
      errors.push(`stream_points_insufficient:${stream.id || 'unknown'}`);
      continue;
    }
    for (const point of stream.points) {
      if (!finite(point.lat) || !finite(point.lon)) {
        errors.push(`stream_coordinate_invalid:${stream.id || 'unknown'}`);
        break;
      }
      if (input.encoding?.color && !finite(point.colorValue)) {
        errors.push(`stream_color_value_missing:${stream.id || 'unknown'}`);
        break;
      }
      if (input.encoding?.brightness && !finite(point.magnitude)) {
        errors.push(`stream_magnitude_missing:${stream.id || 'unknown'}`);
        break;
      }
    }
    for (const ref of unique(stream.sourceRefs)) {
      if (!approvedRefs.has(ref)) errors.push(`stream_source_ref_outside_source:${ref}`);
    }
  }

  if (!clean(input?.encoding?.motionLabel)) errors.push('motion_label_missing');

  const color = input?.encoding?.color;
  if (color) {
    if (!finite(color.min) || !finite(color.max) || color.max <= color.min) {
      errors.push('color_range_invalid');
    }
    if (color.palette && color.palette.length < 2) errors.push('color_palette_too_short');
  }

  const brightness = input?.encoding?.brightness;
  if (brightness && (!finite(brightness.min) || !finite(brightness.max) || brightness.max <= brightness.min)) {
    errors.push('brightness_range_invalid');
  }

  if (input?.time) {
    const start = Date.parse(input.time.startIso);
    const end = Date.parse(input.time.endIso);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) errors.push('time_range_invalid');
  }

  return {
    schema: 'evercraft.fallen.phenomenon-validation.v1' as const,
    status: errors.length ? ('rejected' as const) : ('accepted' as const),
    errors,
  };
}

export function compilePhenomenonCanvas(input: PhenomenonInput): { html: string; receipt: PhenomenonReceipt } {
  const validation = validatePhenomenon(input);
  if (validation.status !== 'accepted') {
    throw new Error(`Phenomenon rejected: ${validation.errors.join(', ')}`);
  }

  const aspect = input.aspectRatio ?? '9:16';
  const width = aspect === '9:16' ? 1080 : 1920;
  const height = aspect === '9:16' ? 1920 : 1080;
  const durationSec = Math.max(4, Math.min(120, input.durationSec ?? 18));
  const sourceRefs = unique(input.source.refs);
  const sampleCount = input.field.streamlines.reduce((sum, stream) => sum + stream.points.length, 0);
  const normalized = {
    ...input,
    schema: 'evercraft.fallen.phenomenon.v1',
    durationSec,
    aspectRatio: aspect,
    field: {
      ...input.field,
      particleDensity: Math.max(0.25, Math.min(4, input.field.particleDensity ?? 1)),
      trailFraction: Math.max(0.01, Math.min(0.2, input.field.trailFraction ?? 0.055)),
    },
  };
  const receipt: PhenomenonReceipt = {
    schema: 'evercraft.fallen.phenomenon-receipt.v1',
    phenomenon_id: input.id,
    status: 'accepted',
    digest: digest(normalized),
    evidence_state: input.field.evidenceState,
    source_refs: sourceRefs,
    stream_count: input.field.streamlines.length,
    sample_count: sampleCount,
    exact_frame_control: true,
    publication_authority: false,
  };

  const data = safeJson({ ...normalized, width, height });
  const label = evidenceLabel(input.field.evidenceState);
  const subtitle = clean(input.subtitle);
  const callout = clean(input.callout);

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(input.title)} - Evercraft Phenomenon Canvas</title>
<style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#030609}
body{display:flex;align-items:center;justify-content:center;font-family:Inter,Montserrat,Arial,sans-serif}
#viewport{position:relative;width:${width}px;height:${height}px;overflow:hidden;background:#030609;color:#f7fbff}
#field{position:absolute;inset:0;width:100%;height:100%}
#chrome{position:absolute;inset:0;pointer-events:none}
.title{position:absolute;left:6.5%;top:4.5%;max-width:78%;font-size:${aspect === '9:16' ? 52 : 48}px;font-weight:650;letter-spacing:.02em;line-height:1.04;text-shadow:0 2px 24px #000}
.subtitle{position:absolute;left:6.6%;top:${aspect === '9:16' ? 8.3 : 10.4}%;font-size:${aspect === '9:16' ? 22 : 20}px;letter-spacing:.08em;color:rgba(233,244,255,.72);text-transform:uppercase}
.time{position:absolute;right:6.5%;top:4.7%;font:500 ${aspect === '9:16' ? 20 : 18}px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.1em;color:rgba(233,244,255,.76)}
.badge{position:absolute;right:6.5%;top:${aspect === '9:16' ? 8.2 : 10.3}%;padding:7px 10px;border:1px solid rgba(255,255,255,.32);font-size:13px;font-weight:700;letter-spacing:.14em;background:rgba(3,6,9,.64)}
.callout{position:absolute;left:6.5%;bottom:${aspect === '9:16' ? 13.5 : 12.5}%;max-width:${aspect === '9:16' ? 78 : 58}%;font-size:${aspect === '9:16' ? 30 : 28}px;line-height:1.18;font-weight:560;text-shadow:0 2px 24px #000}
.legend{position:absolute;left:6.5%;bottom:5.2%;display:flex;flex-direction:column;gap:8px;min-width:${aspect === '9:16' ? 420 : 360}px}
.legend-row{display:flex;align-items:center;gap:14px;font-size:14px;letter-spacing:.11em;text-transform:uppercase;color:rgba(233,244,255,.72)}
.gradient{width:260px;height:10px;border-radius:99px;border:1px solid rgba(255,255,255,.12)}
.source{position:absolute;right:6.5%;bottom:5.1%;max-width:42%;text-align:right;font-size:13px;line-height:1.35;color:rgba(233,244,255,.52)}
</style>
</head>
<body>
<div id="viewport">
  <canvas id="field" width="${width}" height="${height}"></canvas>
  <div id="chrome">
    <div class="title">${esc(input.title)}</div>
    ${subtitle ? `<div class="subtitle">${esc(subtitle)}</div>` : ''}
    <div class="time" id="time-label"></div>
    <div class="badge">${esc(label)}</div>
    ${callout ? `<div class="callout">${esc(callout)}</div>` : ''}
    <div class="legend" id="legend"></div>
    <div class="source">Data: ${esc(input.source.label)}</div>
  </div>
</div>
<script id="evercraft-phenomenon-data" type="application/json">${data}</script>
<script>
(() => {
  const data=JSON.parse(document.getElementById('evercraft-phenomenon-data').textContent);
  const canvas=document.getElementById('field');
  const ctx=canvas.getContext('2d');
  const W=data.width,H=data.height;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const mix=(a,b,t)=>a+(b-a)*t;
  const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0)/4294967295};
  const hexToRgb=h=>{const x=h.replace('#','');const v=parseInt(x.length===3?x.split('').map(c=>c+c).join(''):x,16);return {r:(v>>16)&255,g:(v>>8)&255,b:v&255}};
  const colorAt=(v,enc)=>{
    if(!enc)return {r:52,g:211,b:196};
    const palette=enc.palette&&enc.palette.length>1?enc.palette:['#2457ff','#00b7ff','#23e6c8','#f6d743','#ff633a'];
    const p=clamp((v-enc.min)/(enc.max-enc.min),0,1)*(palette.length-1);
    const i=Math.min(palette.length-2,Math.floor(p)),t=p-i,a=hexToRgb(palette[i]),b=hexToRgb(palette[i+1]);
    return {r:Math.round(mix(a.r,b.r,t)),g:Math.round(mix(a.g,b.g,t)),b:Math.round(mix(a.b,b.b,t))};
  };
  const lonSpan=()=>{
    const b=data.geography.bounds;
    return b.east>=b.west?b.east-b.west:(180-b.west)+(b.east+180);
  };
  const lonProgress=lon=>{
    const b=data.geography.bounds,span=lonSpan();
    let d=lon-b.west;
    if(d<0)d+=360;
    return clamp(d/span,0,1);
  };
  const mapBox=()=>{
    const vertical=H>W;
    return vertical
      ? {x:W*.045,y:H*.145,w:W*.91,h:H*.69}
      : {x:W*.045,y:H*.12,w:W*.91,h:H*.73};
  };
  const project=p=>{
    const b=data.geography.bounds,box=mapBox();
    return {x:box.x+lonProgress(p.lon)*box.w,y:box.y+(b.north-p.lat)/(b.north-b.south)*box.h};
  };
  const prepare=stream=>{
    const pts=stream.points.map((p,i)=>({...project(p),colorValue:p.colorValue,magnitude:p.magnitude,i}));
    const lengths=[0];let total=0;
    for(let i=1;i<pts.length;i++){total+=Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y);lengths.push(total)}
    return {...stream,pts,lengths,total:Math.max(total,1)};
  };
  const streams=data.field.streamlines.map(prepare);
  const sampleAt=(s,p)=>{
    const target=clamp(p,0,1)*s.total;
    let i=1;while(i<s.lengths.length&&s.lengths[i]<target)i++;
    i=Math.min(i,s.pts.length-1);
    const l=s.pts[i-1],r=s.pts[i],span=s.lengths[i]-s.lengths[i-1]||1,q=clamp((target-s.lengths[i-1])/span,0,1);
    return {x:mix(l.x,r.x,q),y:mix(l.y,r.y,q),colorValue:mix(l.colorValue??0,r.colorValue??0,q),magnitude:mix(l.magnitude??0,r.magnitude??0,q)};
  };
  const outline=()=>{
    ctx.save();ctx.lineWidth=1.15;ctx.strokeStyle='rgba(170,205,222,.20)';ctx.fillStyle='rgba(5,14,19,.38)';
    for(const shape of data.geography.outlines||[]){
      if(shape.points.length<2)continue;
      ctx.beginPath();shape.points.forEach((p,i)=>{const q=project(p);if(i===0)ctx.moveTo(q.x,q.y);else ctx.lineTo(q.x,q.y)});
      ctx.stroke();
    }
    ctx.restore();
  };
  const labels=()=>{
    ctx.save();ctx.font=(H>W?'500 18px':'500 16px')+' ui-monospace,SFMono-Regular,Menlo,monospace';ctx.fillStyle='rgba(225,239,247,.72)';
    for(const item of data.geography.labels||[]){const p=project(item);ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);ctx.fill();ctx.fillText(item.label.toUpperCase(),p.x+10,p.y+5)}
    ctx.restore();
  };
  const flow=(t)=>{
    const density=data.field.particleDensity||1,trail=data.field.trailFraction||.055;
    ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineCap='round';
    for(const s of streams){
      const particles=Math.max(1,Math.round((s.particles||Math.max(2,Math.round(s.total/85)))*density));
      const rate=(s.speed||1)*.035;
      for(let j=0;j<particles;j++){
        const seed=hash(s.id+':'+j);
        const head=(seed+t*rate)%1;
        const steps=8;
        for(let k=0;k<steps;k++){
          let a=head-trail*(k/steps),b=head-trail*((k+1)/steps);
          while(a<0)a+=1;while(b<0)b+=1;
          if(a<b && head<trail)continue;
          const p1=sampleAt(s,a),p2=sampleAt(s,b);
          const c=colorAt(p2.colorValue,data.encoding.color);
          const mag=data.encoding.brightness?clamp((p2.magnitude-data.encoding.brightness.min)/(data.encoding.brightness.max-data.encoding.brightness.min),0,1):.65;
          const fade=(steps-k)/steps;
          ctx.strokeStyle='rgba('+c.r+','+c.g+','+c.b+','+(0.08+0.56*mag*fade)+')';
          ctx.lineWidth=.65+1.65*mag;
          ctx.shadowBlur=2+8*mag;ctx.shadowColor='rgba('+c.r+','+c.g+','+c.b+','+(0.15+.35*mag)+')';
          ctx.beginPath();ctx.moveTo(p1.x,p1.y);ctx.lineTo(p2.x,p2.y);ctx.stroke();
        }
        const p=sampleAt(s,head),c=colorAt(p.colorValue,data.encoding.color);
        const mag=data.encoding.brightness?clamp((p.magnitude-data.encoding.brightness.min)/(data.encoding.brightness.max-data.encoding.brightness.min),0,1):.65;
        ctx.fillStyle='rgba('+c.r+','+c.g+','+c.b+','+(0.42+.55*mag)+')';
        ctx.beginPath();ctx.arc(p.x,p.y,1.1+1.4*mag,0,Math.PI*2);ctx.fill();
      }
    }
    ctx.restore();
  };
  const chrome=()=>{
    const legend=document.getElementById('legend');legend.replaceChildren();
    if(data.encoding.color){
      const row=document.createElement('div');row.className='legend-row';
      const label=document.createElement('span');label.textContent=data.encoding.color.label;
      const bar=document.createElement('div');bar.className='gradient';bar.style.background='linear-gradient(90deg,'+(data.encoding.color.palette||['#2457ff','#00b7ff','#23e6c8','#f6d743','#ff633a']).join(',')+')';
      const range=document.createElement('span');range.textContent=data.encoding.color.min+(data.encoding.color.unit||'')+' → '+data.encoding.color.max+(data.encoding.color.unit||'');
      row.append(label,bar,range);legend.append(row);
    }
    if(data.encoding.brightness){
      const row=document.createElement('div');row.className='legend-row';row.textContent='BRIGHTNESS = '+data.encoding.brightness.label;legend.append(row);
    }
    const motion=document.createElement('div');motion.className='legend-row';motion.textContent='MOTION = '+data.encoding.motionLabel;legend.append(motion);
  };
  chrome();
  window.__evercraftRenderAt=async(timeSec)=>{
    const t=clamp(Number(timeSec)||0,0,data.durationSec);
    ctx.clearRect(0,0,W,H);
    const g=ctx.createRadialGradient(W*.52,H*.47,0,W*.52,H*.47,Math.max(W,H)*.72);g.addColorStop(0,'#07151b');g.addColorStop(1,'#020407');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    outline();flow(t);labels();
    const timeNode=document.getElementById('time-label');
    if(data.time){
      const a=Date.parse(data.time.startIso),b=Date.parse(data.time.endIso),p=data.durationSec?clamp(t/data.durationSec,0,1):0;
      const stamp=new Date(a+(b-a)*p);
      timeNode.textContent=(data.time.label?data.time.label+' · ':'')+stamp.toISOString().replace('T',' ').slice(0,16)+' UTC';
    } else timeNode.textContent='';
    document.documentElement.dataset.evercraftFrameReady='true';
    document.documentElement.dataset.evercraftTime=t.toFixed(3);
    return {time:t};
  };
  window.__evercraftRenderFrame=frame=>window.__evercraftRenderAt(Number(frame)/30);
  window.__evercraftStageReady=true;
  window.__evercraftRenderAt(0);
})();
</script>
</body>
</html>`;

  return { html, receipt };
}
