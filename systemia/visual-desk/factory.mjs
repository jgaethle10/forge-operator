import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ORIGIN='https://fabric.systemiacommandcenters.com/visuals';
const STATES=new Set(['observed','reported','modeled','inferred','synthetic']);

function esc(value){
  return String(value ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
}

function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(value && typeof value==='object'){
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a],[b])=>a.localeCompare(b))
        .map(([key,item])=>[key,stable(item)])
    );
  }
  return value;
}

function hash(value){
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function slugify(value){
  const slug=String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'');
  if(!slug) throw new Error('visual_story_slug_missing');
  return slug.slice(0,96);
}

function asNumber(value,label){
  const number=Number(value);
  if(!Number.isFinite(number)) throw new Error('visual_story_invalid_'+label);
  return number;
}

export function normalizeVisualStory(input){
  if(input?.schema!=='evercraft.visual-story.v1') throw new Error('visual_story_schema_invalid');
  const title=String(input.title ?? '').trim();
  if(!title) throw new Error('visual_story_title_missing');

  const evidenceState=String(input.evidenceState ?? '').toLowerCase();
  if(!STATES.has(evidenceState)) throw new Error('visual_story_evidence_state_invalid');

  const sourceRefs=[...new Set((input.sourceRefs ?? []).map(String).map(v=>v.trim()).filter(Boolean))];
  if(!sourceRefs.length) throw new Error('visual_story_sources_missing');

  const points=(input.points ?? []).map((point,index)=>{
    const lat=asNumber(point?.lat,'point_'+index+'_lat');
    const lon=asNumber(point?.lon,'point_'+index+'_lon');
    if(lat < -90 || lat > 90) throw new Error('visual_story_lat_range');
    if(lon < -180 || lon > 180) throw new Error('visual_story_lon_range');
    return {
      id:String(point?.id || 'point-'+(index+1)),
      label:String(point?.label || '').trim(),
      lat,
      lon,
      value:point?.value===undefined ? null : asNumber(point.value,'point_'+index+'_value'),
      note:String(point?.note || '').trim(),
    };
  });
  if(!points.length) throw new Error('visual_story_points_missing');

  const ids=new Set(points.map(point=>point.id));
  if(ids.size!==points.length) throw new Error('visual_story_point_id_duplicate');

  const lines=(input.lines ?? []).map((line,index)=>{
    const from=String(line?.from || '');
    const to=String(line?.to || '');
    if(!ids.has(from) || !ids.has(to)) throw new Error('visual_story_line_'+index+'_point_missing');
    return {from,to,label:String(line?.label || '').trim()};
  });

  const story={
    schema:'evercraft.visual-story.v1',
    slug:slugify(input.slug || title),
    title,
    subtitle:String(input.subtitle || '').trim(),
    narrative:String(input.narrative || '').trim(),
    callout:String(input.callout || '').trim(),
    evidenceState,
    sourceRefs,
    points,
    lines,
    brand:String(input.brand || 'Evercraft Visual Desk').trim() || 'Evercraft Visual Desk',
    publishedAt:input.publishedAt ? new Date(input.publishedAt).toISOString() : new Date().toISOString(),
  };
  return {...story,digest:hash(story)};
}

function bounds(points){
  let minLat=Math.min(...points.map(p=>p.lat));
  let maxLat=Math.max(...points.map(p=>p.lat));
  let minLon=Math.min(...points.map(p=>p.lon));
  let maxLon=Math.max(...points.map(p=>p.lon));
  const latPad=Math.max(1.5,(maxLat-minLat)*0.18);
  const lonPad=Math.max(1.5,(maxLon-minLon)*0.18);
  return {
    minLat:Math.max(-90,minLat-latPad),
    maxLat:Math.min(90,maxLat+latPad),
    minLon:Math.max(-180,minLon-lonPad),
    maxLon:Math.min(180,maxLon+lonPad),
  };
}

function project(point,box){
  const width=896;
  const height=610;
  const lonSpan=Math.max(0.0001,box.maxLon-box.minLon);
  const latSpan=Math.max(0.0001,box.maxLat-box.minLat);
  return {
    x:92+((point.lon-box.minLon)/lonSpan)*width,
    y:355+((box.maxLat-point.lat)/latSpan)*height,
  };
}

function titleLines(text,maxChars=28,maxLines=3){
  const words=String(text || '').split(/\s+/).filter(Boolean);
  const lines=[];
  let index=0;
  while(index<words.length && lines.length<maxLines){
    let current=words[index++];
    while(index<words.length && (current+' '+words[index]).length<=maxChars){
      current+=' '+words[index++];
    }
    if(lines.length===maxLines-1 && index<words.length){
      current=current.replace(/[.…]+$/,'')+'…';
      index=words.length;
    }
    lines.push(current);
  }
  return lines;
}

function layoutPointLabels(story,positions,maxValue){
  const items=story.points.map((point,index)=>{
    const p=positions.get(point.id);
    const radius=10+Math.sqrt(Math.abs(point.value ?? 1)/maxValue)*18;
    return {
      point,index,p,radius,
      side:p.x<540?'left':'right',
      labelY:p.y+7,
    };
  }).sort((a,b)=>a.p.y-b.p.y || a.p.x-b.p.x);

  const last={left:-Infinity,right:-Infinity};
  for(const item of items){
    const preferred=item.side;
    const alternate=preferred==='left'?'right':'left';
    if(item.labelY-last[preferred]<48 && item.labelY-last[alternate]>=48){
      item.side=alternate;
    }
    item.labelY=Math.max(item.labelY,last[item.side]+48);
    item.labelY=Math.max(390,Math.min(948,item.labelY));
    last[item.side]=item.labelY;
  }
  return items.sort((a,b)=>a.index-b.index);
}

export function renderShareCard(input){
  const story=input.digest ? input : normalizeVisualStory(input);
  const box=bounds(story.points);
  const positions=new Map(story.points.map(point=>[point.id,project(point,box)]));
  const maxValue=Math.max(1,...story.points.map(point=>Math.abs(point.value ?? 1)));

  const grid=[];
  for(let i=0;i<=5;i++){
    const x=92+i*(896/5);
    const y=355+i*(610/5);
    grid.push('<line x1="'+x+'" y1="355" x2="'+x+'" y2="965" stroke="#1b2b34" stroke-width="1"/>');
    grid.push('<line x1="92" y1="'+y+'" x2="988" y2="'+y+'" stroke="#1b2b34" stroke-width="1"/>');
  }

  const connectors=story.lines.map(line=>{
    const a=positions.get(line.from);
    const b=positions.get(line.to);
    const cx=(a.x+b.x)/2;
    const cy=Math.min(a.y,b.y)-70;
    return '<path d="M '+a.x+' '+a.y+' Q '+cx+' '+cy+' '+b.x+' '+b.y+'" fill="none" stroke="#4FB8FF" stroke-width="4" stroke-linecap="round" opacity=".72"/>';
  }).join('\n');

  const points=layoutPointLabels(story,positions,maxValue).map(item=>{
    const {point,p,radius,side,labelY}=item;
    const right=side==='right';
    const labelX=right ? p.x+radius+16 : p.x-radius-16;
    const anchor=right ? 'start' : 'end';
    const leaderX=right ? labelX-8 : labelX+8;
    return [
      '<line x1="'+p.x+'" y1="'+p.y+'" x2="'+leaderX+'" y2="'+(labelY-7)+'" stroke="#4FB8FF" stroke-width="2" opacity=".38"/>',
      '<circle cx="'+p.x+'" cy="'+p.y+'" r="'+(radius+8)+'" fill="#4FB8FF" opacity=".10"/>',
      '<circle cx="'+p.x+'" cy="'+p.y+'" r="'+radius+'" fill="#4FB8FF" stroke="#F5F5F2" stroke-width="3"/>',
      '<text x="'+labelX+'" y="'+labelY+'" text-anchor="'+anchor+'" font-family="Arial,sans-serif" font-size="26" font-weight="700" fill="#F5F5F2">'+esc(point.label || point.id)+'</text>',
    ].join('\n');
  }).join('\n');

  const titleLineArray=titleLines(story.title,31,3);
  const titleFont=titleLineArray.length>=3?54:58;
  const title=titleLineArray.map((line,index)=>
    '<text x="92" y="'+(126+index*60)+'" font-family="Arial,sans-serif" font-size="'+titleFont+'" font-weight="800" fill="#F5F5F2">'+esc(line)+'</text>'
  ).join('\n');

  const subtitle=titleLines(story.subtitle,62,2).map((line,index)=>
    '<text x="92" y="'+(290+index*32)+'" font-family="Arial,sans-serif" font-size="27" fill="#B7BDC5">'+esc(line)+'</text>'
  ).join('\n');

  const callout=titleLines(
    story.callout || 'Open the source-backed page for context and methodology.',
    64,
    2
  ).map((line,index)=>
    '<text x="92" y="'+(1110+index*31)+'" font-family="Arial,sans-serif" font-size="22" font-weight="650" fill="#F5F5F2">'+esc(line)+'</text>'
  ).join('\n');

  const sourceHosts=[...new Set(story.sourceRefs.map(ref=>{
    try{return new URL(ref).hostname.replace(/^www\./,'');}catch{return ref;}
  }))].slice(0,3).join(' • ');

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">',
    '<rect width="1080" height="1350" fill="#080B0B"/>',
    '<rect width="1080" height="18" fill="#4FB8FF"/>',
    '<text x="92" y="68" font-family="Arial,sans-serif" font-size="24" font-weight="800" letter-spacing="3" fill="#4FB8FF">EVERCRAFT VISUAL DESK</text>',
    title,
    subtitle,
    '<rect x="72" y="335" width="936" height="650" rx="28" fill="#0d1418" stroke="#263740" stroke-width="2"/>',
    grid.join('\n'),
    connectors,
    points,
    '<rect x="92" y="1016" width="210" height="44" rx="22" fill="#16252d"/>',
    '<text x="197" y="1046" text-anchor="middle" font-family="Arial,sans-serif" font-size="20" font-weight="800" fill="#4FB8FF">'+esc(story.evidenceState.toUpperCase())+'</text>',
    callout,
    '<text x="92" y="1198" font-family="Arial,sans-serif" font-size="20" fill="#B7BDC5">Sources: '+esc(sourceHosts)+'</text>',
    '<text x="92" y="1258" font-family="Arial,sans-serif" font-size="20" fill="#7f8c93">Digest '+story.digest.slice(0,16)+'</text>',
    '<text x="988" y="1258" text-anchor="end" font-family="Arial,sans-serif" font-size="22" font-weight="800" fill="#B79A56">evercraft</text>',
    '</svg>',
    ''
  ].join('\n');
}


const CARD_FORMATS={
  feed:{width:1080,height:1350,scale:1,tx:0,ty:0},
  story:{width:1080,height:1920,scale:1,tx:0,ty:210},
  square:{width:1080,height:1080,scale:0.8,tx:108,ty:0},
};

export function renderCardVariant(input,format='feed'){
  const story=input.digest ? input : normalizeVisualStory(input);
  const spec=CARD_FORMATS[format];
  if(!spec) throw new Error('visual_story_card_format_invalid');
  if(format==='feed') return renderShareCard(story);

  const base=renderShareCard(story);
  const inner=base
    .replace(/^<svg[^>]*>\s*/,'')
    .replace(/\s*<\/svg>\s*$/,'');

  const footerY=spec.height-72;
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="'+spec.width+'" height="'+spec.height+'" viewBox="0 0 '+spec.width+' '+spec.height+'">',
    '<rect width="'+spec.width+'" height="'+spec.height+'" fill="#080B0B"/>',
    format==='story' ? '<text x="92" y="105" font-family="Arial,sans-serif" font-size="26" font-weight="800" letter-spacing="3" fill="#4FB8FF">THE WORLD, MADE LEGIBLE</text>' : '',
    '<g transform="translate('+spec.tx+' '+spec.ty+') scale('+spec.scale+')">'+inner+'</g>',
    format==='story' ? '<text x="92" y="'+footerY+'" font-family="Arial,sans-serif" font-size="22" fill="#B7BDC5">Source-backed visual • '+esc(story.evidenceState.toUpperCase())+'</text>' : '',
    '</svg>',
    ''
  ].join('\n');
}

export function renderMotionStage(input){
  const story=input.digest ? input : normalizeVisualStory(input);
  const svg=renderShareCard(story);
  const payload=JSON.stringify({
    schema:'evercraft.visual-story.motion-stage.v1',
    storyDigest:story.digest,
    durationSec:8,
    fps:30,
    deterministic:true,
    publicationAuthority:false,
  }).replaceAll('<','\\u003c');

  return [
    '<!doctype html>',
    '<html><head><meta charset="utf-8"><meta name="viewport" content="width=1080,initial-scale=1">',
    '<style>',
    'html,body{margin:0;width:1080px;height:1920px;overflow:hidden;background:#080B0B}body{font-family:Arial,sans-serif}',
    '#stage{position:relative;width:1080px;height:1920px;background:radial-gradient(circle at 50% 42%,#14232b 0,#080B0B 58%)}',
    '#brand{position:absolute;left:92px;top:86px;color:#4FB8FF;font:800 25px Arial;letter-spacing:4px}',
    '#card{position:absolute;left:0;top:210px;width:1080px;height:1350px;transform-origin:50% 50%;will-change:transform}',
    '#card svg{display:block;width:1080px;height:1350px}',
    '#footer{position:absolute;left:92px;bottom:94px;color:#B7BDC5;font:600 24px Arial}',
    '</style></head><body>',
    '<div id="stage"><div id="brand">EVERCRAFT VISUAL DESK</div><div id="card">'+svg+'</div><div id="footer">Open the owned page for sources, context and methodology.</div></div>',
    '<script>',
    'window.__EVERCRAFT_VISUAL_STAGE__='+payload+';',
    '(function(){',
    'const duration=8;',
    'const card=document.getElementById("card");',
    'const paths=Array.from(card.querySelectorAll("path"));',
    'const circles=Array.from(card.querySelectorAll("circle"));',
    'const labels=Array.from(card.querySelectorAll("text"));',
    'function clamp(v){return Math.max(0,Math.min(1,v));}',
    'function ease(v){v=clamp(v);return v*v*(3-2*v);}',
    'function renderAt(seconds){',
    ' const t=clamp(Number(seconds||0)/duration);',
    ' card.style.transform="scale("+(1+0.045*t)+") translateY("+(-22*t)+"px)";',
    ' paths.forEach(function(node,index){',
    '   const local=ease((t-(0.10+index*0.055))/0.38);',
    '   node.style.strokeDasharray="1800";',
    '   node.style.strokeDashoffset=String(1800*(1-local));',
    '   node.style.opacity=String(0.15+0.85*local);',
    ' });',
    ' circles.forEach(function(node,index){',
    '   const local=ease((t-(0.18+index*0.035))/0.26);',
    '   node.style.transformBox="fill-box";',
    '   node.style.transformOrigin="center";',
    '   node.style.transform="scale("+(0.58+0.42*local)+")";',
    '   node.style.opacity=String(0.16+0.84*local);',
    ' });',
    ' labels.forEach(function(node,index){',
    '   const local=ease((t-(0.03+index*0.006))/0.22);',
    '   node.style.opacity=String(0.30+0.70*local);',
    ' });',
    ' return {seconds:Number(seconds||0),progress:t};',
    '}',
    'window.__evercraftRenderAt=renderAt;',
    'window.__evercraftRenderFrame=function(frame,fps){return renderAt(Number(frame||0)/Number(fps||30));};',
    'renderAt(0);',
    '})();',
    '</script></body></html>',
    ''
  ].join('\n');
}

export function renderStoryHtml(input,{origin=DEFAULT_ORIGIN}={}){
  const story=input.digest ? input : normalizeVisualStory(input);
  const root=String(origin || DEFAULT_ORIGIN).replace(/\/$/,'');
  const canonical=root+'/'+story.slug+'/';
  const cardUrl=canonical+'card-feed.svg';
  const description=story.subtitle || story.narrative || story.callout || story.title;
  const pointCards=story.points.map(point=>
    '<div class="point"><b>'+esc(point.label || point.id)+'</b><span>'+point.lat.toFixed(3)+', '+point.lon.toFixed(3)+'</span>'+(point.note ? '<p>'+esc(point.note)+'</p>' : '')+'</div>'
  ).join('');

  return [
    '<!doctype html>',
    '<html lang="en"><head>',
    '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>'+esc(story.title)+' | Evercraft Visual Desk</title>',
    '<meta name="description" content="'+esc(description)+'">',
    '<link rel="canonical" href="'+esc(canonical)+'">',
    '<meta property="og:type" content="article">',
    '<meta property="og:title" content="'+esc(story.title)+'">',
    '<meta property="og:description" content="'+esc(description)+'">',
    '<meta property="og:url" content="'+esc(canonical)+'">',
    '<meta property="og:image" content="'+esc(cardUrl)+'">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:image" content="'+esc(cardUrl)+'">',
    '<style>:root{color-scheme:dark;font-family:Inter,system-ui,sans-serif;background:#080B0B;color:#F5F5F2}*{box-sizing:border-box}body{margin:0;background:#080B0B}main{max-width:1180px;margin:auto;padding:42px 24px 72px}.eyebrow{color:#4FB8FF;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,.72fr);gap:38px;align-items:start}h1{font-size:clamp(2.5rem,7vw,5.7rem);line-height:.96;margin:.3em 0 .25em}.sub{font-size:clamp(1.15rem,2.2vw,1.55rem);line-height:1.45;color:#B7BDC5}.card{width:100%;border-radius:24px;border:1px solid #263740;background:#0d1418}.meta{display:flex;gap:10px;flex-wrap:wrap;margin:20px 0}.badge{border:1px solid #263740;border-radius:999px;padding:8px 12px;color:#B7BDC5;font-size:.88rem}.badge strong{color:#4FB8FF}article{font-size:1.08rem;line-height:1.75;color:#d8dbdc;margin-top:42px;max-width:850px}.sources{margin-top:42px;border-top:1px solid #263740;padding-top:28px}.sources a{display:block;color:#4FB8FF;overflow-wrap:anywhere;margin:.5rem 0}.points{margin-top:28px;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.point{padding:16px;border:1px solid #263740;border-radius:16px;background:#0d1418}.point b{display:block;margin-bottom:6px}@media(max-width:850px){.hero{grid-template-columns:1fr}main{padding-top:26px}}</style>',
    '</head><body><main>',
    '<div class="eyebrow">'+esc(story.brand)+'</div>',
    '<section class="hero"><div><h1>'+esc(story.title)+'</h1><p class="sub">'+esc(story.subtitle)+'</p><div class="meta"><span class="badge"><strong>'+esc(story.evidenceState.toUpperCase())+'</strong> evidence state</span><span class="badge">Published '+esc(story.publishedAt.slice(0,10))+'</span><span class="badge">Digest '+story.digest.slice(0,12)+'</span></div></div>',
    '<img class="card" src="./card.svg" alt="'+esc(story.title)+'"></section>',
    '<article>'+(story.narrative ? '<p>'+esc(story.narrative)+'</p>' : '')+(story.callout ? '<p><strong>'+esc(story.callout)+'</strong></p>' : '')+'<div class="points">'+pointCards+'</div>',
    '<section class="sources"><div class="eyebrow">Sources</div>'+story.sourceRefs.map(ref=>'<a href="'+esc(ref)+'" rel="noopener noreferrer">'+esc(ref)+'</a>').join('')+'</section>',
    '</article></main></body></html>',
    ''
  ].join('\n');
}

export function buildVisualStory(input,{outputRoot,origin=DEFAULT_ORIGIN}={}){
  if(!outputRoot) throw new Error('visual_story_output_root_missing');
  const story=normalizeVisualStory(input);
  const root=String(origin || DEFAULT_ORIGIN).replace(/\/$/,'');
  const canonicalUrl=root+'/'+story.slug+'/';
  const outputDir=path.join(outputRoot,story.slug);
  fs.mkdirSync(outputDir,{recursive:true});

  const manifest={
    schema:'evercraft.visual-story.manifest.v2',
    slug:story.slug,
    title:story.title,
    canonicalUrl,
    socialCardUrl:canonicalUrl+'card-feed.svg',
    assets:{
      feed:canonicalUrl+'card-feed.svg',
      square:canonicalUrl+'card-square.svg',
      story:canonicalUrl+'card-story.svg',
      motionStage:canonicalUrl+'motion.html',
    },
    evidenceState:story.evidenceState,
    sourceRefs:story.sourceRefs,
    storyDigest:story.digest,
    publishedAt:story.publishedAt,
  };

  const clipHandoff={
    schema:'evercraft.visual-story.clip-handoff.v2',
    publicationAuthority:false,
    brandKey:'evercraft',
    canonicalUrl,
    socialCardUrl:manifest.socialCardUrl,
    assets:manifest.assets,
    preferredAssetByDestination:{
      facebook:manifest.assets.feed,
      instagram:manifest.assets.feed,
      linkedin:manifest.assets.feed,
      tiktok:manifest.assets.story,
    },
    suggestedMessage:[story.title,story.subtitle].filter(Boolean).join(' | '),
    suggestedDestinations:['facebook','instagram','linkedin','tiktok'],
    sourceRefs:story.sourceRefs,
  };

  fs.writeFileSync(path.join(outputDir,'index.html'),renderStoryHtml(story,{origin}));
  const feed=renderCardVariant(story,'feed');
  fs.writeFileSync(path.join(outputDir,'card.svg'),feed);
  fs.writeFileSync(path.join(outputDir,'card-feed.svg'),feed);
  fs.writeFileSync(path.join(outputDir,'card-square.svg'),renderCardVariant(story,'square'));
  fs.writeFileSync(path.join(outputDir,'card-story.svg'),renderCardVariant(story,'story'));
  fs.writeFileSync(path.join(outputDir,'motion.html'),renderMotionStage(story));
  fs.writeFileSync(path.join(outputDir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  fs.writeFileSync(path.join(outputDir,'story.json'),JSON.stringify(story,null,2)+'\n');
  fs.writeFileSync(path.join(outputDir,'clip-handoff.json'),JSON.stringify(clipHandoff,null,2)+'\n');

  return {story,manifest,clipHandoff,outputDir};
}

const invoked=fileURLToPath(import.meta.url)===path.resolve(process.argv[1] || '');
if(invoked){
  const inputPath=process.argv[2];
  const outputRoot=process.argv[3];
  const originArg=process.argv[4];
  if(!inputPath || !outputRoot){
    console.error('usage: node systemia/visual-desk/factory.mjs <story.json> <output-root> [origin]');
    process.exit(2);
  }
  const input=JSON.parse(fs.readFileSync(path.resolve(inputPath),'utf8'));
  const result=buildVisualStory(input,{
    outputRoot:path.resolve(outputRoot),
    origin:originArg || process.env.EVERCRAFT_VISUAL_ORIGIN || DEFAULT_ORIGIN,
  });
  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.visual-story.build-receipt.v1',
    slug:result.story.slug,
    digest:result.story.digest,
    canonicalUrl:result.manifest.canonicalUrl,
    outputDir:result.outputDir,
    publicationAuthority:false,
  },null,2));
}
