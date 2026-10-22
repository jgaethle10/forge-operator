import fs from 'node:fs';
import path from 'node:path';
import {
  normalizeCommercialCampaign,
  compileCommercialAttention,
  assessCommercialScrollStop,
} from './commercial-director.mjs';
import { commercialPosterLayout, assessCommercialComposition } from './commercial-layout-qa.mjs';

const esc=(value)=>String(value??'')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#039;');

const SPECS={
  feed:{width:1080,height:1350,wide:false},
  square:{width:1080,height:1080,wide:false},
  story:{width:1080,height:1920,wide:false},
  'hero-wide':{width:1600,height:900,wide:true},
};

function wrap(text,maxChars,maxLines=2){
  const words=String(text||'').split(/\s+/).filter(Boolean);
  const out=[];
  let index=0;
  while(index<words.length&&out.length<maxLines){
    let row=words[index++];
    while(index<words.length&&(row+' '+words[index]).length<=maxChars){
      row+=' '+words[index++];
    }
    if(out.length===maxLines-1&&index<words.length){
      while(index<words.length&&(row+' '+words[index]).length<=maxChars+4){
        row+=' '+words[index++];
      }
      if(index<words.length) row=row.replace(/[.…]+$/,'')+'…';
    }
    out.push(row);
  }
  return out;
}

function trafficDots(spec,browser){
  const dots=[];
  const count=18;
  const startX=spec.wide?80:48;
  const startY=browser.y+browser.h*.27;
  for(let i=0;i<count;i++){
    const t=i/(count-1);
    const x=startX+(browser.x-startX+18)*t;
    const y=startY-Math.sin(t*Math.PI)*Math.min(90,browser.h*.18)+(i%3-1)*12;
    const r=i%4===0?9:i%3===0?7:5;
    dots.push('<circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="'+r+'" fill="#55C7FF" opacity="'+(0.36+0.5*t).toFixed(2)+'"/>');
  }
  return dots.join('\n');
}

function leakDots(spec,browser){
  const out=[];
  const x0=browser.x+browser.w*.63;
  const y0=browser.y+browser.h*.56;
  for(let i=0;i<10;i++){
    const t=i/9;
    const x=x0+Math.sin(t*5.2)*26+t*44;
    const y=y0+t*(spec.wide?170:245);
    const r=8-Math.min(4,i*.3);
    out.push('<circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="'+r.toFixed(1)+'" fill="#FF6D57" opacity="'+(0.82-t*.38).toFixed(2)+'"/>');
  }
  return out.join('\n');
}

function scanLabels(browser,wide){
  const labels=['CLARITY','SPEED','TRUST','MOBILE','CTA'];
  const gap=wide?104:82;
  const startX=browser.x+32;
  const y=browser.y+browser.h-34;
  return labels.map((label,index)=>{
    const x=startX+index*gap;
    return '<g><rect x="'+x+'" y="'+(y-24)+'" width="'+(wide?88:70)+'" height="32" rx="16" fill="#0E2030" stroke="#55C7FF" stroke-opacity=".28"/><text x="'+(x+(wide?44:35))+'" y="'+(y-3)+'" text-anchor="middle" font-family="Arial,sans-serif" font-size="'+(wide?12:10)+'" font-weight="800" letter-spacing="1" fill="#8ECFF1">'+label+'</text></g>';
  }).join('\n');
}

function browserSvg(spec){
  const browser=spec.wide
    ? {x:820,y:150,w:690,h:585}
    : {x:84,y:spec.height*(spec.height>1500?.34:.32),w:912,h:spec.height*(spec.height>1500?.42:.44)};
  const targetX=browser.x+browser.w*.79;
  const targetY=browser.y+browser.h*.42;
  const buttonW=spec.wide?170:160;
  return {
    browser,
    svg:[
      '<g filter="url(#panelShadow)">',
      '<rect x="'+browser.x+'" y="'+browser.y+'" width="'+browser.w+'" height="'+browser.h+'" rx="34" fill="#08121D" stroke="#1B3A4C" stroke-width="2"/>',
      '<rect x="'+browser.x+'" y="'+browser.y+'" width="'+browser.w+'" height="58" rx="34" fill="#0D1A27"/>',
      '<rect x="'+browser.x+'" y="'+(browser.y+28)+'" width="'+browser.w+'" height="30" fill="#0D1A27"/>',
      '<circle cx="'+(browser.x+34)+'" cy="'+(browser.y+29)+'" r="7" fill="#FF6D57"/>',
      '<circle cx="'+(browser.x+58)+'" cy="'+(browser.y+29)+'" r="7" fill="#E8C46A"/>',
      '<circle cx="'+(browser.x+82)+'" cy="'+(browser.y+29)+'" r="7" fill="#55C7FF"/>',
      '<rect x="'+(browser.x+120)+'" y="'+(browser.y+16)+'" width="'+(browser.w-156)+'" height="26" rx="13" fill="#132536"/>',
      '<rect x="'+(browser.x+42)+'" y="'+(browser.y+102)+'" width="'+(browser.w*.46)+'" height="'+(browser.h*.16)+'" rx="18" fill="#11293A"/>',
      '<rect x="'+(browser.x+42)+'" y="'+(browser.y+102+browser.h*.19)+'" width="'+(browser.w*.67)+'" height="18" rx="9" fill="#153044"/>',
      '<rect x="'+(browser.x+42)+'" y="'+(browser.y+134+browser.h*.19)+'" width="'+(browser.w*.56)+'" height="14" rx="7" fill="#102637"/>',
      '<rect x="'+(browser.x+42)+'" y="'+(browser.y+162+browser.h*.19)+'" width="'+(browser.w*.42)+'" height="14" rx="7" fill="#102637"/>',
      '<rect x="'+(targetX-buttonW/2)+'" y="'+(targetY-29)+'" width="'+buttonW+'" height="58" rx="29" fill="#E8C46A"/>',
      '<text x="'+targetX+'" y="'+(targetY+7)+'" text-anchor="middle" font-family="Arial,sans-serif" font-size="'+(spec.wide?18:17)+'" font-weight="900" letter-spacing="1.2" fill="#071018">CONVERT</text>',
      '<circle cx="'+targetX+'" cy="'+targetY+'" r="'+(spec.wide?82:72)+'" fill="none" stroke="#E8C46A" stroke-width="2" opacity=".16"/>',
      '<path d="M '+(browser.x+browser.w*.56)+' '+(browser.y+browser.h*.50)+' C '+(browser.x+browser.w*.61)+' '+(browser.y+browser.h*.54)+' '+(browser.x+browser.w*.60)+' '+(browser.y+browser.h*.63)+' '+(browser.x+browser.w*.65)+' '+(browser.y+browser.h*.69)+'" fill="none" stroke="#FF6D57" stroke-width="5" stroke-linecap="round" opacity=".65"/>',
      scanLabels(browser,spec.wide),
      '</g>',
    ].join('\n')
  };
}

export function renderCommercialPoster(campaignInput,planInput,format='feed'){
  const campaign=normalizeCommercialCampaign(campaignInput);
  const plan=planInput||compileCommercialAttention(campaign);
  const spec=SPECS[format];
  if(!spec) throw new Error('commercial_poster_format_invalid');
  const layout=commercialPosterLayout(campaign,format);
  const {browser,svg:browserMarkup}=browserSvg(spec);
  const p=campaign.creative.palette;
  const {wide,left,hookY,hookSize,hookLines,subY,subSize,subLines}=layout;
  const hook=hookLines.map((row,index)=>
    '<text x="'+left+'" y="'+(hookY+index*hookSize*.92)+'" font-family="Arial,sans-serif" font-size="'+hookSize+'" font-weight="950" letter-spacing="-3" fill="'+esc(p.text)+'">'+esc(row)+'</text>'
  ).join('\n');
  const sub=subLines.map((row,index)=>
    '<text x="'+left+'" y="'+(subY+index*(subSize+10))+'" font-family="Arial,sans-serif" font-size="'+subSize+'" font-weight="650" fill="'+esc(p.muted)+'">'+esc(row)+'</text>'
  ).join('\n');
  const priceX=wide?90:72;
  const priceY=wide?690:(spec.height-205);
  const ctaY=priceY+65;
  const footerY=spec.height-48;

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="'+spec.width+'" height="'+spec.height+'" viewBox="0 0 '+spec.width+' '+spec.height+'">',
    '<defs>',
    '<radialGradient id="bg" cx="65%" cy="42%" r="78%"><stop offset="0%" stop-color="#123047"/><stop offset="44%" stop-color="#07111B"/><stop offset="100%" stop-color="'+esc(p.background)+'"/></radialGradient>',
    '<linearGradient id="flow" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#55C7FF" stop-opacity=".05"/><stop offset="100%" stop-color="#55C7FF" stop-opacity=".78"/></linearGradient>',
    '<filter id="panelShadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="24" stdDeviation="28" flood-color="#000" flood-opacity=".52"/></filter>',
    '<filter id="blueGlow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="10"/></filter>',
    '</defs>',
    '<rect width="'+spec.width+'" height="'+spec.height+'" fill="url(#bg)"/>',
    '<circle cx="'+(spec.width*.82)+'" cy="'+(spec.height*.22)+'" r="'+(spec.width*.28)+'" fill="#55C7FF" opacity=".05" filter="url(#blueGlow)"/>',
    '<text x="'+left+'" y="'+(wide?74:60)+'" font-family="Arial,sans-serif" font-size="'+(wide?17:16)+'" font-weight="900" letter-spacing="3.5" fill="'+esc(p.electric)+'">'+esc(campaign.creative.eyebrow)+'</text>',
    hook,
    sub,
    '<path d="M '+(wide?80:50)+' '+(browser.y+browser.h*.28)+' C '+(browser.x*.45)+' '+(browser.y+browser.h*.12)+' '+(browser.x*.72)+' '+(browser.y+browser.h*.42)+' '+(browser.x+18)+' '+(browser.y+browser.h*.28)+'" fill="none" stroke="url(#flow)" stroke-width="'+(wide?5:4)+'" stroke-linecap="round"/>',
    trafficDots(spec,browser),
    browserMarkup,
    leakDots(spec,browser),
    '<g>',
    '<rect x="'+priceX+'" y="'+(priceY-47)+'" width="'+(wide?168:152)+'" height="68" rx="34" fill="'+esc(p.gold)+'"/>',
    '<text x="'+(priceX+(wide?84:76))+'" y="'+(priceY-3)+'" text-anchor="middle" font-family="Arial,sans-serif" font-size="'+(wide?38:34)+'" font-weight="950" fill="#071018">'+esc(campaign.creative.priceLockup)+'</text>',
    '<text x="'+(priceX+(wide?190:176))+'" y="'+(priceY-8)+'" font-family="Arial,sans-serif" font-size="'+(wide?19:17)+'" font-weight="900" letter-spacing="1.3" fill="'+esc(p.text)+'">QUICK WIN AUDIT</text>',
    '</g>',
    '<text x="'+priceX+'" y="'+ctaY+'" font-family="Arial,sans-serif" font-size="'+(wide?22:20)+'" font-weight="900" letter-spacing="2.2" fill="'+esc(p.electric)+'">'+esc(campaign.creative.cta)+'  →</text>',
    '<text x="'+left+'" y="'+footerY+'" font-family="Arial,sans-serif" font-size="'+(wide?14:13)+'" fill="#657481">SYNTHETIC VISUAL • OFFER TERMS FROM EVERCRAFT FABRIC</text>',
    '<text x="'+(spec.width-left)+'" y="'+footerY+'" text-anchor="end" font-family="Arial,sans-serif" font-size="'+(wide?17:15)+'" font-weight="900" fill="'+esc(p.gold)+'">evercraft</text>',
    '</svg>',
    ''
  ].join('\n');
}

export function renderCommercialMotion(campaignInput,planInput){
  const campaign=normalizeCommercialCampaign(campaignInput);
  const plan=planInput||compileCommercialAttention(campaign);
  const poster=renderCommercialPoster(campaign,plan,'story');
  const encoded=Buffer.from(poster).toString('base64');
  const beats=campaign.creative.sonicHook;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(campaign.product)} commercial motion stage</title>
<style>
html,body{margin:0;background:#05080D;overflow:hidden;width:100%;height:100%;font-family:Arial,sans-serif}
#stage{position:relative;width:1080px;height:1920px;transform-origin:top left;background:#05080D}
#poster{position:absolute;inset:0;width:100%;height:100%}
.pulse{position:absolute;width:28px;height:28px;border-radius:999px;background:#55C7FF;box-shadow:0 0 35px rgba(85,199,255,.9);opacity:0}
#p1{left:110px;top:670px}#p2{left:300px;top:610px}#p3{left:500px;top:655px}#p4{left:710px;top:625px}
#beat{position:absolute;left:72px;right:72px;bottom:290px;font-size:70px;font-weight:950;letter-spacing:-2px;color:#F6FAFF;opacity:0}
#scan{position:absolute;left:95px;right:95px;height:5px;top:720px;background:linear-gradient(90deg,transparent,#55C7FF,transparent);box-shadow:0 0 24px rgba(85,199,255,.8);opacity:0}
</style>
</head>
<body>
<div id="stage">
<img id="poster" alt="" src="data:image/svg+xml;base64,${encoded}">
<div class="pulse" id="p1"></div><div class="pulse" id="p2"></div><div class="pulse" id="p3"></div><div class="pulse" id="p4"></div>
<div id="scan"></div><div id="beat"></div>
</div>
<script>
const D=${JSON.stringify(plan.motion.targetDurationSec)};
const BEATS=${JSON.stringify(beats)};
const pulses=[...document.querySelectorAll('.pulse')];
const beat=document.getElementById('beat');
const scan=document.getElementById('scan');
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function renderAt(t){
  const x=clamp(Number(t)||0,0,D);
  pulses.forEach((el,i)=>{
    const local=clamp((x-(.35+i*.22))/.72,0,1);
    el.style.opacity=String(Math.sin(local*Math.PI)*.9);
    el.style.transform='translateX('+(local*220)+'px) scale('+(0.65+local*.7)+')';
  });
  const scanPhase=clamp((x-2.7)/2.2,0,1);
  scan.style.opacity=String(Math.sin(scanPhase*Math.PI)*.9);
  scan.style.transform='translateY('+(scanPhase*560)+'px)';
  const beatIndex=Math.min(BEATS.length-1,Math.floor(x/Math.max(.01,D/BEATS.length)));
  const within=(x%(D/BEATS.length))/(D/BEATS.length);
  beat.textContent=BEATS[beatIndex]||'';
  beat.style.opacity=String(within<.12?within/.12:within>.82?(1-within)/.18:1);
  beat.style.transform='translateY('+(18-18*clamp(within/.2,0,1))+'px)';
}
window.__evercraftRenderAt=renderAt;
window.__evercraftRenderFrame=(frame,fps=30)=>renderAt(Number(frame)/Number(fps||30));
renderAt(0);
</script>
</body>
</html>`;
}

export function buildCommercialCampaign(input,{outputRoot,origin='https://fabric.systemiacommandcenters.com/visuals'}={}){
  const campaign=normalizeCommercialCampaign(input);
  const plan=compileCommercialAttention(campaign);
  const report=assessCommercialScrollStop(plan);
  if(report.status!=='pass') throw new Error('commercial_campaign_scroll_stop_rejected');
  const composition=Object.fromEntries(Object.keys(SPECS).map(format=>
    [format,assessCommercialComposition(campaign,format)]
  ));
  const rejected=Object.values(composition).filter(item=>item.status!=='pass');
  if(rejected.length){
    throw new Error('commercial_campaign_composition_rejected:'+rejected.map(
      item=>item.format+':'+item.issues.join(',')
    ).join(';'));
  }

  const dir=path.join(path.resolve(outputRoot),campaign.slug);
  fs.mkdirSync(dir,{recursive:true});
  for(const format of Object.keys(SPECS)){
    fs.writeFileSync(path.join(dir,'poster-'+format+'.svg'),renderCommercialPoster(campaign,plan,format),'utf8');
  }
  fs.writeFileSync(path.join(dir,'motion.html'),renderCommercialMotion(campaign,plan),'utf8');
  fs.writeFileSync(path.join(dir,'campaign.json'),JSON.stringify(campaign,null,2)+'\n','utf8');
  fs.writeFileSync(path.join(dir,'graphics-plan.json'),JSON.stringify(plan,null,2)+'\n','utf8');
  fs.writeFileSync(path.join(dir,'scroll-stop-report.json'),JSON.stringify(report,null,2)+'\n','utf8');
  fs.writeFileSync(path.join(dir,'composition-report.json'),JSON.stringify({
    schema:'evercraft.graphics-command.composition-bundle.v1',
    formats:composition,
    status:'pass',
    method:'estimated_glyph_bounds_and_scene_geometry',
    publicationAuthority:false,
  },null,2)+'\n','utf8');
  fs.writeFileSync(path.join(dir,'creative-council-inventory.json'),JSON.stringify(plan.council,null,2)+'\n','utf8');

  const base=String(origin||'').replace(/\/$/,'')+'/'+campaign.slug;
  const manifest={
    schema:'evercraft.commercial-visual.manifest.v1',
    slug:campaign.slug,
    title:campaign.product+' • '+campaign.offer,
    campaignDigest:campaign.digest,
    planDigest:plan.digest,
    truthState:campaign.truthState,
    sourceRefs:campaign.sourceRefs,
    offerUrl:campaign.offerUrl,
    priceUsd:campaign.priceUsd,
    deliveryState:'previsualization_only',
    filmProductionStatus:'not_rendered',
    verifiedShotMediaCount:0,
    audioMasterStatus:'not_produced',
    humanVisualApproval:false,
    assets:{
      feed:base+'/poster-feed.svg',
      square:base+'/poster-square.svg',
      story:base+'/poster-story.svg',
      site:base+'/poster-hero-wide.svg',
      motion:base+'/motion.html',
    },
    clipHandoff:{
      schema:'evercraft.clip.visual-handoff.v1',
      destinations:plan.distribution.destinations,
      preferredAssets:plan.distribution.preferredAssets,
      offerUrl:campaign.offerUrl,
      publicationAuthority:false,
    },
    publicationAuthority:false,
  };
  fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n','utf8');
  fs.writeFileSync(path.join(dir,'clip-handoff.json'),JSON.stringify(manifest.clipHandoff,null,2)+'\n','utf8');
  return {campaign,plan,report,composition,manifest,dir};
}
