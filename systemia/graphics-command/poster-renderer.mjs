import { getGeoBoundary } from './boundary-registry.mjs';
const esc=(value)=>String(value ?? '')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#039;');

function pointBounds(points){
  let minLat=Math.min(...points.map(p=>p.lat));
  let maxLat=Math.max(...points.map(p=>p.lat));
  let minLon=Math.min(...points.map(p=>p.lon));
  let maxLon=Math.max(...points.map(p=>p.lon));
  const latPad=Math.max(.45,(maxLat-minLat)*.18);
  const lonPad=Math.max(.45,(maxLon-minLon)*.28);
  return {
    minLat:minLat-latPad,
    maxLat:maxLat+latPad,
    minLon:minLon-lonPad,
    maxLon:maxLon+lonPad,
  };
}

function boundaryForStory(story){
  return getGeoBoundary(story?.visual?.boundaryId);
}

function projection(box,rect){
  const midLat=(box.minLat+box.maxLat)/2;
  const lonFactor=Math.cos(midLat*Math.PI/180);
  const geoWidth=Math.max(.0001,(box.maxLon-box.minLon)*lonFactor);
  const geoHeight=Math.max(.0001,box.maxLat-box.minLat);
  const scale=Math.min(rect.width/geoWidth,rect.height/geoHeight);
  const drawWidth=geoWidth*scale;
  const drawHeight=geoHeight*scale;
  const offsetX=rect.x+(rect.width-drawWidth)/2;
  const offsetY=rect.y+(rect.height-drawHeight)/2;
  return {
    project(point){
      return {
        x:offsetX+((point.lon-box.minLon)*lonFactor)*scale,
        y:offsetY+((box.maxLat-point.lat))*scale,
      };
    },
    draw:{x:offsetX,y:offsetY,width:drawWidth,height:drawHeight},
  };
}

function boundaryPath(boundary,projectPoint){
  if(!boundary?.coordinates?.length) return '';
  return boundary.coordinates.map(([lon,lat],index)=>{
    const p=projectPoint({lon,lat});
    return (index===0?'M ':'L ')+p.x.toFixed(2)+' '+p.y.toFixed(2);
  }).join(' ')+' Z';
}

function lines(text,maxChars,maxLines){
  const words=String(text||'').split(/\s+/).filter(Boolean);
  const out=[];
  let i=0;
  while(i<words.length&&out.length<maxLines){
    let row=words[i++];
    while(i<words.length&&(row+' '+words[i]).length<=maxChars) row+=' '+words[i++];
    if(out.length===maxLines-1&&i<words.length){
      row=row.replace(/[.…]+$/,'')+'…';
      i=words.length;
    }
    out.push(row);
  }
  return out;
}

function sourceHosts(refs){
  return [...new Set((refs||[]).map(ref=>{
    try{return new URL(ref).hostname.replace(/^www\./,'');}
    catch{return String(ref);}
  }))].slice(0,2).join(' • ');
}

const SPECS={
  feed:{width:1080,height:1350,map:{x:72,y:300,width:936,height:720},hookY:128,hookSize:82,footerY:1115},
  square:{width:1080,height:1080,map:{x:72,y:246,width:936,height:590},hookY:110,hookSize:66,footerY:890},
  story:{width:1080,height:1920,map:{x:72,y:500,width:936,height:920},hookY:155,hookSize:100,footerY:1585},
};

function decorativeContours(spec){
  const {width}=spec;
  const y0=spec.map.y;
  const h=spec.map.height;
  return [0.12,0.29,0.48,0.67,0.84].map((p,index)=>{
    const y=y0+h*p;
    const bend=(index%2?46:-52);
    return '<path d="M -80 '+y+' C '+(width*.22)+' '+(y+bend)+' '+(width*.48)+' '+(y-bend)+' '+(width*.7)+' '+y+' S '+(width+80)+' '+(y+bend)+' '+(width+120)+' '+y+'" fill="none" stroke="rgba(79,184,255,.10)" stroke-width="2"/>';
  }).join('\n');
}

function renderLabels(story,positions,format){
  const font=format==='story'?27:format==='square'?18:22;
  const xs=story.points.map(point=>positions.get(point.id)?.x).filter(Number.isFinite).sort((a,b)=>a-b);
  const splitX=xs.length?xs[Math.floor((xs.length-1)/2)]:540;
  const rows=[...story.points]
    .map((point,index)=>({point,index,p:positions.get(point.id)}))
    .filter(row=>row.p)
    .sort((a,b)=>a.p.y-b.p.y||a.p.x-b.p.x);
  const occupied={left:-Infinity,right:-Infinity};
  const gap=format==='story'?62:48;
  return rows.map(row=>{
    const label=String(row.point.label||row.point.id);
    const estimate=label.length*font*.57;
    let preferred=row.p.x<=splitX?'left':'right';
    let x=preferred==='right'?row.p.x+38:row.p.x-38;
    if(preferred==='right'&&x+estimate>1008) preferred='left';
    if(preferred==='left'&&x-estimate<72) preferred='right';
    const alternate=preferred==='left'?'right':'left';
    let use=preferred;
    let y=row.p.y+7;
    if(y-occupied[preferred]<gap && y-occupied[alternate]>=gap) use=alternate;
    y=Math.max(row.p.y-44,Math.max(y,occupied[use]+gap));
    occupied[use]=y;
    const right=use==='right';
    x=right?row.p.x+38:row.p.x-38;
    const anchor=right?'start':'end';
    const leaderX=right?x-11:x+11;
    const threat=/very high/i.test(row.point.note||'')?'VERY HIGH':/high/i.test(row.point.note||'')?'HIGH':'';
    return [
      '<line x1="'+row.p.x+'" y1="'+row.p.y+'" x2="'+leaderX+'" y2="'+(y-7)+'" stroke="#75C8FF" stroke-width="1.5" opacity=".30"/>',
      '<text class="story-label" x="'+x+'" y="'+y+'" text-anchor="'+anchor+'" font-family="Arial,sans-serif" font-size="'+font+'" font-weight="800" fill="#F5F5F2">'+esc(label)+'</text>',
      threat?'<text class="story-label" x="'+x+'" y="'+(y+font+5)+'" text-anchor="'+anchor+'" font-family="Arial,sans-serif" font-size="'+Math.round(font*.58)+'" font-weight="800" letter-spacing="1.4" fill="'+(threat==='VERY HIGH'?'#FFB15A':'#B7BDC5')+'">'+threat+'</text>':'',
    ].join('\n');
  }).join('\n');
}

function renderGeography(boundary,statePath,spec,format){
  if(!boundary||!statePath) return '<g opacity=".9">'+decorativeContours(spec)+'</g>';
  const stroke=format==='story'?4:3;
  const contourRows=Array.from({length:11},(_,index)=>{
    const y=spec.map.y+spec.map.height*(.08+index*.083);
    const bend=(index%2===0?42:-34);
    return '<path d="M '+(spec.map.x-90)+' '+y+' C '+(spec.map.x+spec.map.width*.28)+' '+(y+bend)+' '+(spec.map.x+spec.map.width*.55)+' '+(y-bend)+' '+(spec.map.x+spec.map.width+90)+' '+(y+8)+'" fill="none" stroke="rgba(117,200,255,.10)" stroke-width="2"/>';
  }).join('\n');
  return [
    '<clipPath id="geoClip"><path d="'+statePath+'"/></clipPath>',
    '<path class="geo-boundary" d="'+statePath+'" fill="url(#stateFill)" stroke="rgba(117,200,255,.55)" stroke-width="'+stroke+'" filter="url(#stateShadow)"/>',
    '<g clip-path="url(#geoClip)">'+contourRows+'</g>',
    '<path class="geo-boundary" d="'+statePath+'" fill="none" stroke="rgba(245,245,242,.18)" stroke-width="1"/>',
    '<text x="'+(spec.map.x+spec.map.width*.50)+'" y="'+(spec.map.y+spec.map.height*.56)+'" text-anchor="middle" font-family="Arial,sans-serif" font-size="'+(format==='story'?54:40)+'" font-weight="900" letter-spacing="8" fill="rgba(245,245,242,.055)">WASHINGTON</text>',
  ].join('\n');
}

export function renderDirectedPoster(story,plan,format='feed'){
  const spec=SPECS[format];
  if(!spec) throw new Error('graphics_poster_format_invalid');
  if(plan?.schema!=='evercraft.graphics-command.plan.v1') throw new Error('graphics_poster_plan_invalid');
  const boundary=boundaryForStory(story);
  const box=boundary?.bbox || pointBounds(story.points);
  const frame=projection(box,spec.map);
  const positions=new Map(story.points.map(point=>[point.id,frame.project(point)]));
  const statePath=boundary?boundaryPath(boundary,frame.project):'';
  const maxValue=Math.max(1,...story.points.map(point=>Math.abs(Number(point.value)||1)));

  const routeSvg=(story.lines||[]).map((line)=>{
    const a=positions.get(line.from);
    const b=positions.get(line.to);
    if(!a||!b) return '';
    return '<path class="story-route" d="M '+a.x+' '+a.y+' L '+b.x+' '+b.y+'" fill="none" stroke="#75C8FF" stroke-width="'+(format==='story'?6:4)+'" stroke-linecap="round" stroke-linejoin="round" opacity=".58"/>';
  }).join('\n');

  const pointSvg=story.points.map(point=>{
    const p=positions.get(point.id);
    const radius=(format==='story'?17:13)+Math.sqrt(Math.abs(Number(point.value)||1)/maxValue)*(format==='story'?15:11);
    const veryHigh=/very high/i.test(point.note||'');
    const risk=veryHigh?'#FFB15A':'#D2C5A0';
    const peakH=radius*.9;
    const peakW=radius*.9;
    return [
      '<circle class="peak-halo" cx="'+p.x+'" cy="'+p.y+'" r="'+(radius+18)+'" fill="#4FB8FF" opacity=".06"/>',
      '<circle class="peak-marker" cx="'+p.x+'" cy="'+p.y+'" r="'+(radius+7)+'" fill="#071319" stroke="'+risk+'" stroke-width="3" opacity=".98" filter="url(#glow)"/>',
      '<path class="peak-marker" d="M '+(p.x-peakW)+' '+(p.y+peakH*.65)+' L '+p.x+' '+(p.y-peakH)+' L '+(p.x+peakW)+' '+(p.y+peakH*.65)+' Z" fill="#F5F5F2" opacity=".96"/>',
      '<path class="peak-marker" d="M '+(p.x-peakW*.32)+' '+(p.y-peakH*.18)+' L '+p.x+' '+(p.y-peakH)+' L '+(p.x+peakW*.24)+' '+(p.y-peakH*.28)+' Z" fill="'+risk+'"/>',
    ].join('\n');
  }).join('\n');

  const hookLines=lines(plan.hero.hook,format==='story'?14:format==='square'?25:23,2);
  const hook=hookLines.map((row,index)=>
    '<text x="72" y="'+(spec.hookY+index*(spec.hookSize*.94))+'" font-family="Arial,sans-serif" font-size="'+spec.hookSize+'" font-weight="900" letter-spacing="-2" fill="#F5F5F2">'+esc(row)+'</text>'
  ).join('\n');

  const subY=spec.hookY+hookLines.length*(spec.hookSize*.94)+38;
  const sub=lines(plan.hero.subhook,format==='story'?42:55,2).map((row,index)=>
    '<text x="74" y="'+(subY+index*(format==='story'?39:31))+'" font-family="Arial,sans-serif" font-size="'+(format==='story'?32:25)+'" font-weight="650" fill="#B7BDC5">'+esc(row)+'</text>'
  ).join('\n');

  const metrics=(plan.metrics||[]).slice(0,format==='square'?2:3);
  const metricWidth=(spec.width-144-(metrics.length-1)*18)/Math.max(1,metrics.length);
  const metricSvg=metrics.map((metric,index)=>{
    const x=72+index*(metricWidth+18);
    const value=String(metric.value)+(metric.unit?' '+metric.unit:'');
    return [
      '<text class="metric-value" x="'+x+'" y="'+spec.footerY+'" font-family="Arial,sans-serif" font-size="'+(format==='story'?58:42)+'" font-weight="900" fill="#F5F5F2">'+esc(value)+'</text>',
      '<text class="metric-label" x="'+x+'" y="'+(spec.footerY+(format==='story'?40:31))+'" font-family="Arial,sans-serif" font-size="'+(format==='story'?18:15)+'" font-weight="800" letter-spacing="1.6" fill="#4FB8FF">'+esc(metric.label.toUpperCase())+'</text>',
    ].join('\n');
  }).join('\n');

  const sourceY=spec.height-58;
  const evidence=String(story.evidenceState||'').toUpperCase();
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="'+spec.width+'" height="'+spec.height+'" viewBox="0 0 '+spec.width+' '+spec.height+'" style="max-width:100%;height:auto;display:block">',
    '<defs>',
    '<radialGradient id="heroGlow" cx="50%" cy="48%" r="60%"><stop offset="0%" stop-color="#17303D"/><stop offset="58%" stop-color="#0A1013"/><stop offset="100%" stop-color="#050707"/></radialGradient>',
    '<linearGradient id="spine" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#75C8FF"/><stop offset="100%" stop-color="#2B6B95"/></linearGradient>',
    '<linearGradient id="stateFill" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#112832"/><stop offset="52%" stop-color="#0B171D"/><stop offset="100%" stop-color="#061014"/></linearGradient>',
    '<filter id="stateShadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="18" stdDeviation="26" flood-color="#000" flood-opacity=".45"/></filter>',
    '<filter id="glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>',
    '</defs>',
    '<rect width="'+spec.width+'" height="'+spec.height+'" fill="url(#heroGlow)"/>',
    '<text x="72" y="'+(format==='story'?82:58)+'" font-family="Arial,sans-serif" font-size="'+(format==='story'?24:19)+'" font-weight="900" letter-spacing="3.2" fill="#4FB8FF">'+esc(plan.hero.eyebrow.toUpperCase())+'</text>',
    hook,
    sub,
    renderGeography(boundary,statePath,spec,format),
    routeSvg,
    pointSvg,
    renderLabels(story,positions,format),
    metricSvg || '<text x="72" y="'+spec.footerY+'" font-family="Arial,sans-serif" font-size="28" font-weight="800" fill="#F5F5F2">'+esc(story.callout||'Source-backed visual')+'</text>',
    '<text x="72" y="'+sourceY+'" font-family="Arial,sans-serif" font-size="'+(format==='story'?18:14)+'" fill="#7F8C93">'+esc(evidence)+' • '+esc(sourceHosts(story.sourceRefs))+'</text>',
    '<text x="'+(spec.width-72)+'" y="'+sourceY+'" text-anchor="end" font-family="Arial,sans-serif" font-size="'+(format==='story'?19:15)+'" font-weight="900" fill="#B79A56">evercraft</text>',
    '</svg>',
    ''
  ].join('\n');
}
