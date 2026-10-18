import {planInfluenceGraphics} from './graphics-bridge.mjs';

const FORMATS=Object.freeze({
  feed:{width:1080,height:1350},
  square:{width:1080,height:1080},
  story:{width:1080,height:1920},
  'hero-wide':{width:1600,height:900},
});
const enc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;')
  .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
const str=value=>String(value??'').trim();
function verifyTreatment(t){
  if(!['designer','human','proof'].includes(t?.key)||t?.state!=='requires_distinct_renderer_and_real_media'){
    throw Error('influence_preview_invalid_treatment');
  }
  if(t.publicationAuthority!==false||t.plan?.publicationAuthority!==false||t.visualsRendered!==false){
    throw Error('influence_preview_publication_boundary_invalid');
  }
  if(!Array.isArray(t.requiredSourceMedia)||t.requiredSourceMedia.length<2){
    throw Error('influence_preview_source_media_requirements_missing');
  }
  return t.key;
}
function typography(t,w,h){
  const wide=w>h;const baseline=wide?130:180;const titleSize=wide?54:Math.round(w*.060);
  const eyebrow=enc('EVERCRAFT / INFLUENCE LAB');
  const title=enc(t.key==='designer'?'THE PASSAGE':t.key==='human'?'SHOW YOUR WORK':'THE CLICK THAT MATTERS');
  return [
    '<text x="72" y="'+(wide?65:92)+'" font-size="'+(wide?18:20)+'" font-weight="650" letter-spacing="4" fill="currentColor">'+eyebrow+'</text>',
    '<text x="72" y="'+baseline+'" font-size="'+titleSize+'" font-weight="800" letter-spacing="-1.3" fill="currentColor">'+title+'</text>',
    '<text x="72" y="'+(baseline+36)+'" font-size="'+(wide?18:21)+'" fill="currentColor" opacity=".65">CREATIVE CONCEPT • NOT PRODUCT FOOTAGE</text>',
  ].join('');
}
function sceneDesigner(w,h){
  const wide=w>h;const centerX=wide?w*.73:w*.52;const centerY=wide?h*.56:h*.58;
  const r=wide?210:Math.min(300,h*.24);
  return [
    '<defs><linearGradient id="background" x1="0" y1="1" x2="1" y2="0"><stop stop-color="#03080F"/><stop offset=".56" stop-color="#0B2038"/><stop offset="1" stop-color="#102C39"/></linearGradient>',
    '<linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#9AE5FF" stop-opacity=".85"/><stop offset=".48" stop-color="#376FCA" stop-opacity=".08"/><stop offset="1" stop-color="#5FE5DF" stop-opacity=".52"/></linearGradient>',
    '<filter id="bloom" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="25"/></filter></defs>',
    '<rect width="'+w+'" height="'+h+'" fill="url(#background)"/>',
    '<circle cx="'+centerX+'" cy="'+centerY+'" r="'+r+'" fill="#43A5FF" opacity=".16" filter="url(#bloom)"/>',
    '<path d="M '+(centerX-r*.78)+' '+(centerY+r*.94)+' Q '+(centerX-r*.9)+' '+(centerY-r*1.3)+' '+centerX+' '+(centerY-r*1.18)+' Q '+(centerX+r*.9)+' '+(centerY-r*1.3)+' '+(centerX+r*.78)+' '+(centerY+r*.94)+' Z" stroke="url(#glass)" stroke-width="4" fill="#74C6F0" fill-opacity=".07"/>',
    '<path d="M '+(centerX-r*.5)+' '+(centerY+r*.92)+' Q '+(centerX-r*.62)+' '+(centerY-r*.82)+' '+centerX+' '+(centerY-r*.83)+' Q '+(centerX+r*.62)+' '+(centerY-r*.82)+' '+(centerX+r*.5)+' '+(centerY+r*.92)+' Z" stroke="#9EEDFF" stroke-width="2" stroke-opacity=".64" fill="#4FB3DD" fill-opacity=".09"/>',
    '<path d="M '+(centerX-r*.97)+' '+(centerY+r*.95)+' L '+(centerX+r*.97)+' '+(centerY+r*.95)+'" stroke="#6BCBFF" stroke-opacity=".42" stroke-width="3"/>',
    '<circle cx="'+centerX+'" cy="'+centerY+'" r="'+(r*.11)+'" fill="#D8FCFF" opacity=".9"/>',
    '<circle cx="'+centerX+'" cy="'+centerY+'" r="'+(r*.24)+'" fill="none" stroke="#8ACFFF" stroke-width="1" stroke-opacity=".65"/>',
    '<path d="M '+(centerX-r*.96)+' '+(centerY+r*.95)+' L '+centerX+' '+(centerY-r*.35)+' L '+(centerX+r*.96)+' '+(centerY+r*.95)+'" fill="none" stroke="#9AE5FF" opacity=".24" stroke-width="1"/>',
  ].join('');
}
function sceneHuman(w,h){
  const wide=w>h;const x=wide?w*.48:120;const y=wide?150:h*.32;
  const rw=wide?w*.41:w-240;const rh=wide?h*.60:h*.49;
  return [
    '<rect width="'+w+'" height="'+h+'" fill="#EFE8DD"/>',
    '<path d="M0 '+h*.85+' Q '+w*.45+' '+h*.72+' '+w+' '+h*.9+'" fill="none" stroke="#D9B6A7" stroke-width="70" opacity=".28"/>',
    '<rect x="'+(x+24)+'" y="'+(y+24)+'" width="'+rw+'" height="'+rh+'" rx="18" fill="#BD8176"/>',
    '<rect x="'+x+'" y="'+y+'" width="'+rw+'" height="'+rh+'" rx="18" fill="#231F1F"/>',
    '<rect x="'+(x+20)+'" y="'+(y+20)+'" width="'+(rw-40)+'" height="'+(rh-40)+'" rx="10" fill="#534844"/>',
    '<path d="M '+(x+42)+' '+(y+48)+' H '+(x+rw-42)+'" stroke="#EEE4DA" stroke-opacity=".5" stroke-width="2"/>',
    '<circle cx="'+(x+rw/2)+'" cy="'+(y+rh*.43)+'" r="'+Math.min(70,rw*.17)+'" fill="none" stroke="#EFE2D3" stroke-width="3" stroke-dasharray="9 12" opacity=".8"/>',
    '<path d="M '+(x+rw/2-10)+' '+(y+rh*.43-16)+' l 28 17 l -28 17 Z" fill="#F6E9DD" opacity=".8"/>',
    '<text x="'+(x+rw/2)+'" y="'+(y+rh*.65)+'" text-anchor="middle" fill="#F2EAE0" font-weight="750" font-size="'+(wide?22:27)+'">REAL FOOTAGE REQUIRED</text>',
    '<text x="'+(x+rw/2)+'" y="'+(y+rh*.65+35)+'" text-anchor="middle" fill="#D9C7B7" font-size="'+(wide?16:19)+'">Consent-cleared operator + screen capture</text>',
  ].join('');
}
function sceneProof(w,h){
  const wide=w>h,frameX=wide?w*.45:95,frameY=wide?165:h*.33,frameW=wide?w*.48:w-190,frameH=wide?h*.55:h*.49;
  const parts=[['01','OBSERVE'],['02','EXPLAIN'],['03','VERIFY']];
  return [
    '<rect width="'+w+'" height="'+h+'" fill="#111619"/>',
    '<rect x="'+frameX+'" y="'+frameY+'" width="'+frameW+'" height="'+frameH+'" rx="24" fill="#161F23" stroke="#586468" stroke-width="2"/>',
    '<rect x="'+(frameX+22)+'" y="'+(frameY+22)+'" width="'+(frameW-44)+'" height="'+(frameH-44)+'" rx="16" fill="#F0F5F2"/>',
    '<rect x="'+(frameX+45)+'" y="'+(frameY+46)+'" width="'+(frameW-90)+'" height="38" rx="9" fill="#CCD8CF"/>',
    '<text x="'+(frameX+66)+'" y="'+(frameY+72)+'" fill="#264339" font-weight="700" font-size="18">DEMONSTRATION SLOT / NOT LIVE EVIDENCE</text>',
    ...parts.map((p,i)=>{const yy=frameY+125+i*Math.min(105,(frameH-170)/3);return '<circle cx="'+(frameX+84)+'" cy="'+yy+'" r="25" fill="#A0DCBE"/><text x="'+(frameX+84)+'" y="'+(yy+7)+'" text-anchor="middle" fill="#16402B" font-size="15" font-weight="900">'+p[0]+'</text><text x="'+(frameX+135)+'" y="'+(yy+7)+'" fill="#18382D" font-size="'+(wide?23:26)+'" font-weight="750">'+p[1]+'</text>';}).join(''),
    '<path d="M '+(frameX+48)+' '+(frameY+frameH-66)+' H '+(frameX+frameW-48)+'" stroke="#5D9984" stroke-width="2" stroke-dasharray="10 8"/>',
    '<text x="'+(frameX+48)+'" y="'+(frameY+frameH-37)+'" fill="#3A7060" font-size="18">No invented audit score or conversion claim</text>',
  ].join('');
}
/** Distinct source-only SVG treatment, watermark cannot be disabled by caller. */
export function renderInfluenceConceptSvg(treatment,format='feed'){
  const key=verifyTreatment(treatment);
  const dimensions=FORMATS[format];
  if(!dimensions)throw Error('influence_preview_format_invalid');
  const {width:w,height:h}=dimensions;
  const dark=key!=='human';
  const fg=dark?'#F6FCFF':'#302827';
  const stage=key==='designer'?sceneDesigner(w,h):key==='human'?sceneHuman(w,h):sceneProof(w,h);
  const edgeY=h-70;
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Evercraft '+enc(key)+' conceptual treatment, not real product footage" viewBox="0 0 '+w+' '+h+'" width="'+w+'" height="'+h+'">',
    '<title>Evercraft Influence Lab / '+enc(key)+' concept</title>',
    stage,
    '<g color="'+fg+'">'+typography(treatment,w,h)+'</g>',
    '<path d="M72 '+(edgeY-27)+' H '+(w-72)+'" stroke="'+fg+'" opacity=".36"/>',
    '<text x="72" y="'+edgeY+'" fill="'+fg+'" font-size="16" letter-spacing="2">STORYBOARD PREVIEW / EDITORIAL REVIEW ONLY</text>',
    '<text x="'+(w-72)+'" y="'+edgeY+'" fill="'+fg+'" opacity=".62" text-anchor="end" font-size="17">'+enc(str(treatment.key).toUpperCase())+'</text>',
    '</svg>',
  ].join('\n');
}
export function renderInfluenceConceptCollection(slate){
  if(slate?.schema!=='evercraft.influence-lab.graphics-review-slate.v1'||slate.publicationAuthority!==false){
    throw Error('influence_preview_slate_invalid');
  }
  const outputs={};
  for(const treatment of slate.treatments){
    const key=verifyTreatment(treatment);
    outputs[key]=Object.fromEntries(Object.keys(FORMATS).map(f=>[f,renderInfluenceConceptSvg(treatment,f)]));
  }
  if(Object.keys(outputs).length!==3)throw Error('influence_preview_incomplete');
  return {schema:'evercraft.influence-lab.concept-preview.v1',state:'concept_only',
    campaignId:slate.campaignId,briefDigest:slate.briefDigest,
    formats:Object.fromEntries(Object.entries(FORMATS).map(([k,v])=>[k,v])),
    outputs,rightsState:'original_code_shapes; real-media rights still unverified',
    publicationAuthority:false,productionReady:false};
}
