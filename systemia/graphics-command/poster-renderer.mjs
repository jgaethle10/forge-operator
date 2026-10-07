import { getGeoBoundary } from './boundary-registry.mjs';
import { terrainReliefDataUri } from './terrain-registry.mjs';
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

function layoutLabels(story,positions,format){
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
    const elevation=Number.isFinite(Number(row.point.value))
      ? String(Math.round(Number(row.point.value))).replace(/\B(?=(\d{3})+(?!\d))/g,',')+' M'
      : '';
    const detail=[elevation,threat].filter(Boolean).join(' · ');
    return {
      point:row.point,
      p:row.p,
      label,
      estimate,
      font,
      x,y,anchor,leaderX,threat,detail,
      side:use,
    };
  });
}

function renderLabels(story,positions,format){
  return layoutLabels(story,positions,format).map(item=>[
    '<line x1="'+item.p.x+'" y1="'+item.p.y+'" x2="'+item.leaderX+'" y2="'+(item.y-7)+'" stroke="#75C8FF" stroke-width="1.5" opacity=".30"/>',
    '<text class="story-label" x="'+item.x+'" y="'+item.y+'" text-anchor="'+item.anchor+'" font-family="Arial,sans-serif" font-size="'+item.font+'" font-weight="800" fill="#F5F5F2">'+esc(item.label)+'</text>',
    item.detail?'<text class="story-label story-label-detail" x="'+item.x+'" y="'+(item.y+item.font+5)+'" text-anchor="'+item.anchor+'" font-family="Arial,sans-serif" font-size="'+Math.round(item.font*.58)+'" font-weight="800" letter-spacing="1.2" fill="'+(item.threat==='VERY HIGH'?'#FFB15A':'#AFC0C8')+'">'+esc(item.detail)+'</text>':'',
  ].join('\n')).join('\n');
}

function labelBounds(item){
  const x1=item.anchor==='start'?item.x:item.x-item.estimate;
  const x2=item.anchor==='start'?item.x+item.estimate:item.x;
  return {
    x1,x2,
    y1:item.y-item.font*.88,
    y2:item.y+(item.detail?item.font+10:6),
  };
}

function boxesOverlap(a,b,pad=0){
  return !(
    a.x2+pad<=b.x1||
    b.x2+pad<=a.x1||
    a.y2+pad<=b.y1||
    b.y2+pad<=a.y1
  );
}

function boxHitsCircle(box,circle,pad=0){
  const x=Math.max(box.x1,Math.min(circle.x,box.x2));
  const y=Math.max(box.y1,Math.min(circle.y,box.y2));
  return Math.hypot(circle.x-x,circle.y-y)<circle.r+pad;
}

export function assessDirectedPosterLayout(story,plan,format='feed'){
  const spec=SPECS[format];
  if(!spec) throw new Error('graphics_poster_format_invalid');
  if(plan?.schema!=='evercraft.graphics-command.plan.v1') throw new Error('graphics_poster_plan_invalid');
  const boundary=boundaryForStory(story);
  const terrainHref=plan.geography?.terrain ? terrainReliefDataUri(story?.visual?.terrainId) : null;
  const box=boundary?.bbox || pointBounds(story.points);
  const frame=projection(box,spec.map);
  const positions=new Map(story.points.map(point=>[point.id,frame.project(point)]));
  const maxValue=Math.max(1,...story.points.map(point=>Math.abs(Number(point.value)||1)));
  const labels=layoutLabels(story,positions,format);
  const labelBoxes=labels.map(item=>({id:item.point.id,label:item.label,...labelBounds(item)}));
  const markers=story.points.map(point=>{
    const p=positions.get(point.id);
    const base=(format==='story'?17:13)+Math.sqrt(Math.abs(Number(point.value)||1)/maxValue)*(format==='story'?15:11);
    return {id:point.id,x:p.x,y:p.y,r:base+7};
  });
  const issues=[];

  for(let i=0;i<labelBoxes.length;i++){
    const boxA=labelBoxes[i];
    if(boxA.x1<48||boxA.x2>spec.width-48||boxA.y1<spec.map.y-64||boxA.y2>spec.map.y+spec.map.height+52){
      issues.push('label_out_of_safe_bounds:'+boxA.id);
    }
    for(let j=i+1;j<labelBoxes.length;j++){
      if(boxesOverlap(boxA,labelBoxes[j],6)){
        issues.push('label_overlap:'+boxA.id+':'+labelBoxes[j].id);
      }
    }
    for(const marker of markers){
      if(marker.id!==boxA.id&&boxHitsCircle(boxA,marker,5)){
        issues.push('label_marker_overlap:'+boxA.id+':'+marker.id);
      }
    }
  }

  for(let i=0;i<markers.length;i++){
    for(let j=i+1;j<markers.length;j++){
      const a=markers[i],b=markers[j];
      if(Math.hypot(a.x-b.x,a.y-b.y)<a.r+b.r+4){
        issues.push('marker_overlap:'+a.id+':'+b.id);
      }
    }
  }

  const hookLines=lines(plan.hero.hook,format==='story'?14:format==='square'?25:23,2);
  const hookWidth=Math.max(0,...hookLines.map(row=>row.length*spec.hookSize*.53));
  if(hookWidth>spec.width-144) issues.push('headline_overflow');

  const metrics=(plan.metrics||[]).slice(0,format==='square'?2:3);
  const metricWidth=(spec.width-144-(metrics.length-1)*18)/Math.max(1,metrics.length);
  const metricFont=format==='story'?18:15;
  for(const metric of metrics){
    if(String(metric.label||'').toUpperCase().length*metricFont*.56>metricWidth-8){
      issues.push('metric_label_overflow:'+String(metric.id||metric.label||'metric'));
    }
  }

  const unique=[...new Set(issues)].sort();
  return {
    schema:'evercraft.graphics-command.poster-layout-report.v1',
    format,
    status:unique.length?'reject':'pass',
    issueCount:unique.length,
    issues:unique,
    checks:{
      labelCount:labelBoxes.length,
      markerCount:markers.length,
      labelsNonOverlapping:!unique.some(issue=>issue.startsWith('label_overlap:')),
      labelsClearOfOtherMarkers:!unique.some(issue=>issue.startsWith('label_marker_overlap:')),
      markersNonOverlapping:!unique.some(issue=>issue.startsWith('marker_overlap:')),
      safeMargins:!unique.some(issue=>issue.startsWith('label_out_of_safe_bounds:')),
      headlineFits:!unique.includes('headline_overflow'),
      metricLabelsFit:!unique.some(issue=>issue.startsWith('metric_label_overflow:')),
    },
    publicationAuthority:false,
  };
}

function renderGeography(boundary,statePath,spec,format,terrain,terrainHref,frame){
  if(!boundary||!statePath) return '<g opacity=".9">'+decorativeContours(spec)+'</g>';
  const stroke=format==='story'?4:3;
  const x=spec.map.x;
  const y=spec.map.y;
  const w=spec.map.width;
  const h=spec.map.height;
  const terrainLayer=terrain&&terrainHref
    ? '<image class="terrain-relief" href="'+terrainHref+'" data-source-sha256="'+esc(terrain.sourceSha256)+'" x="'+frame.draw.x+'" y="'+frame.draw.y+'" width="'+frame.draw.width+'" height="'+frame.draw.height+'" preserveAspectRatio="none" clip-path="url(#geoClip)" opacity=".78" style="mix-blend-mode:multiply"/>'
    : '<g class="terrain-relief-fallback" clip-path="url(#geoClip)" opacity=".40">'+decorativeContours(spec)+'</g>';
  return [
    '<clipPath id="geoClip"><path d="'+statePath+'"/></clipPath>',
    '<path class="geo-boundary" d="'+statePath+'" fill="url(#stateFill)" stroke="#72CFF4" stroke-width="'+stroke+'" stroke-opacity=".82" filter="url(#stateShadow)"/>',
    terrainLayer,
    '<path class="terrain-atmosphere" d="'+statePath+'" fill="url(#terrainWash)" opacity=".46"/>',
    '<path class="geo-boundary" d="'+statePath+'" fill="none" stroke="#EAF7FC" stroke-width="1.25" stroke-opacity=".30"/>',
    '<text class="region-label" x="'+(x+w*.50)+'" y="'+(y+h*.57)+'" text-anchor="middle" font-family="Arial,sans-serif" font-size="'+(format==='story'?55:42)+'" font-weight="900" letter-spacing="9" fill="#EAF7FC" opacity=".13">WASHINGTON</text>',
    '<text class="region-kicker" x="'+(x+w*.50)+'" y="'+(y+h*.57+(format==='story'?38:30))+'" text-anchor="middle" font-family="Arial,sans-serif" font-size="'+(format==='story'?15:12)+'" font-weight="800" letter-spacing="4" fill="#8EDBFA" opacity=".30">PACIFIC NORTHWEST</text>',
  ].join('\n');
}

export function renderDirectedPoster(story,plan,format='feed'){
  const spec=SPECS[format];
  if(!spec) throw new Error('graphics_poster_format_invalid');
  if(plan?.schema!=='evercraft.graphics-command.plan.v1') throw new Error('graphics_poster_plan_invalid');
  const boundary=boundaryForStory(story);
  const terrainHref=plan.geography?.terrain ? terrainReliefDataUri(story?.visual?.terrainId) : null;
  const box=boundary?.bbox || pointBounds(story.points);
  const frame=projection(box,spec.map);
  const positions=new Map(story.points.map(point=>[point.id,frame.project(point)]));
  const statePath=boundary?boundaryPath(boundary,frame.project):'';
  const maxValue=Math.max(1,...story.points.map(point=>Math.abs(Number(point.value)||1)));

  const routeSvg=(story.lines||[]).map((line)=>{
    const a=positions.get(line.from);
    const b=positions.get(line.to);
    if(!a||!b) return '';
    return '<path class="story-route cascade-axis" d="M '+a.x+' '+a.y+' L '+b.x+' '+b.y+'" fill="none" stroke="#C7ECFA" stroke-width="'+(format==='story'?7:5)+'" stroke-linecap="round" stroke-linejoin="round" opacity=".085"/>';
  }).join('\n');

  const pointSvg=story.points.map(point=>{
    const p=positions.get(point.id);
    const radius=(format==='story'?17:13)+Math.sqrt(Math.abs(Number(point.value)||1)/maxValue)*(format==='story'?15:11);
    const veryHigh=/very high/i.test(point.note||'');
    const risk=veryHigh?'#FFB15A':'#D2C5A0';
    const peakH=radius*1.06;
    const peakW=radius*1.10;
    return [
      '<path class="peak-shadow" d="M '+(p.x-peakW)+' '+(p.y+peakH*.62)+' L '+p.x+' '+(p.y-peakH)+' L '+(p.x+peakW)+' '+(p.y+peakH*.62)+' Z" fill="#000" opacity=".48" transform="translate(0 5)"/>',
      '<path class="peak-marker" d="M '+(p.x-peakW)+' '+(p.y+peakH*.62)+' L '+p.x+' '+(p.y-peakH)+' L '+(p.x+peakW)+' '+(p.y+peakH*.62)+' Z" fill="#EAF6FA" stroke="#061014" stroke-width="4" stroke-linejoin="round"/>',
      '<path class="peak-snow" d="M '+(p.x-peakW*.30)+' '+(p.y-peakH*.18)+' L '+p.x+' '+(p.y-peakH)+' L '+(p.x+peakW*.24)+' '+(p.y-peakH*.26)+' Z" fill="'+risk+'"/>',
      '<circle class="peak-summit" cx="'+p.x+'" cy="'+(p.y-peakH)+'" r="'+(format==='story'?4:3)+'" fill="'+risk+'"/>',
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
    '<svg xmlns="http://www.w3.org/2000/svg" width="'+spec.width+'" height="'+spec.height+'" viewBox="0 0 '+spec.width+' '+spec.height+'" data-visual-model="cinematic-terrain-geography-v2" style="max-width:100%;height:auto;display:block">',
    '<defs>',
    '<radialGradient id="heroGlow" cx="50%" cy="48%" r="60%"><stop offset="0%" stop-color="#17303D"/><stop offset="58%" stop-color="#0A1013"/><stop offset="100%" stop-color="#050707"/></radialGradient>',
    '<linearGradient id="spine" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#75C8FF"/><stop offset="100%" stop-color="#2B6B95"/></linearGradient>',
    '<linearGradient id="stateFill" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#19323A"/><stop offset="52%" stop-color="#102129"/><stop offset="100%" stop-color="#091319"/></linearGradient>',
    '<linearGradient id="terrainWash" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#5CC7E8" stop-opacity=".18"/><stop offset="48%" stop-color="#0C2028" stop-opacity=".08"/><stop offset="100%" stop-color="#020608" stop-opacity=".52"/></linearGradient>',
    '<filter id="stateShadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="18" stdDeviation="26" flood-color="#000" flood-opacity=".45"/></filter>',
    '<filter id="glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>',
    '</defs>',
    '<rect width="'+spec.width+'" height="'+spec.height+'" fill="url(#heroGlow)"/>',
    '<text x="72" y="'+(format==='story'?82:58)+'" font-family="Arial,sans-serif" font-size="'+(format==='story'?24:19)+'" font-weight="900" letter-spacing="3.2" fill="#4FB8FF">'+esc(plan.hero.eyebrow.toUpperCase())+'</text>',
    hook,
    sub,
    renderGeography(boundary,statePath,spec,format,plan.geography?.terrain,terrainHref,frame),
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
