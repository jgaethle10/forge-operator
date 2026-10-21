import crypto from 'node:crypto';

export type NativeMotionAspect='16:9'|'9:16'|'1:1';
export type NativeMotionEase='linear'|'ease_in'|'ease_out'|'ease_in_out';
export type NativeMotionPrimitive=
  |'snowplow_truck'|'tractor_loader'|'commercial_building'
  |'streetlight'|'snowbank'|'tree'|'sign'|'rect'|'circle';

export interface NativeMotionPoint{x:number;y:number}
export interface NativeMotionKeyframe extends NativeMotionPoint{
  t:number;scale?:number;rotationDeg?:number;opacity?:number;ease?:NativeMotionEase;
}
export interface NativeMotionActor{
  id:string;primitive:NativeMotionPrimitive;z:number;width:number;height:number;
  color?:string;accentColor?:string;label?:string;path:NativeMotionKeyframe[];sourceRefs?:string[];
}
export interface NativeMotionParticleEmitter{
  id:string;kind:'snow'|'plow_spray'|'mist'|'spark';z:number;count:number;seed?:string;
  startSec:number;endSec:number;bounds?:{x:number;y:number;width:number;height:number};
  actorId?:string;offset?:NativeMotionPoint;velocity?:NativeMotionPoint;spread?:number;
  sizeMin?:number;sizeMax?:number;opacity?:number;
}
export interface NativeMotionCameraKeyframe extends NativeMotionPoint{
  t:number;zoom:number;rotationDeg?:number;ease?:NativeMotionEase;
}
export interface NativeMotionTextCue{
  id:string;startSec:number;endSec:number;text:string;x:number;y:number;width:number;
  fontSize:number;fontWeight?:number;align?:'left'|'center'|'right';color?:string;
  background?:string;padding?:number;letterSpacing?:number;uppercase?:boolean;sourceRefs?:string[];
}
export interface NativeMotionScene{
  schema:'evercraft.fallen.native-motion-scene.v1';
  id:string;aspectRatio:NativeMotionAspect;durationSec:number;fps?:number;seed:string;
  background:{skyTop:string;skyBottom:string;horizonGlow?:string;ground:string;road:string;snow:string};
  camera:NativeMotionCameraKeyframe[];
  actors:NativeMotionActor[];
  emitters:NativeMotionParticleEmitter[];
  textCues:NativeMotionTextCue[];
  soundtrack?:{musicRef?:string;voiceoverRef?:string;sfxRefs?:string[]};
  provenance:{mode:'synthetic_visualization';sourceRefs:string[];factualClaimRefs?:string[]};
}
export interface NativeMotionReceipt{
  schema:'evercraft.fallen.native-motion-receipt.v1';sceneId:string;status:'accepted';
  digest:string;frameControl:'exact';renderer:'evercraft-native-canvas-2d-v1';deterministicSeed:string;
  dimensions:{width:number;height:number;fps:number;durationSec:number};
  provenance:{mode:'synthetic_visualization';sourceRefs:string[];factualClaimRefs:string[]};
  boundaries:{
    noExternalVisualModel:true;noProviderGenerationClaim:true;syntheticVisualizationLabelRequired:true;
    deterministicExactFrame:true;publicationAuthorityGranted:false;
  };
}
export interface NativeMotionBundle{scene:NativeMotionScene;html:string;receipt:NativeMotionReceipt}

function clean(value:unknown){return String(value??'').trim()}
function finite(value:unknown){return typeof value==='number'&&Number.isFinite(value)}
function unique(values:string[]|undefined){return [...new Set((values??[]).map(clean).filter(Boolean))]}
function dimensions(aspect:NativeMotionAspect){
  if(aspect==='9:16')return{width:1080,height:1920};
  if(aspect==='1:1')return{width:1080,height:1080};
  return{width:1920,height:1080};
}
function stable(value:unknown):unknown{
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object')return Object.fromEntries(
    Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)])
  );
  return value;
}
function digest(value:unknown){return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')}
function safeJson(value:unknown){return JSON.stringify(value).replace(/</g,'\\u003c')}
function esc(value:string){return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function validColor(value:unknown){return typeof value==='string'&&(/^#[0-9a-f]{3,8}$/i.test(value)||/^rgba?\(/i.test(value))}

export function validateNativeMotionScene(scene:NativeMotionScene){
  const errors:string[]=[];
  if(scene?.schema!=='evercraft.fallen.native-motion-scene.v1')errors.push('schema_invalid');
  if(!clean(scene?.id))errors.push('id_missing');
  if(!['16:9','9:16','1:1'].includes(scene?.aspectRatio))errors.push('aspect_ratio_invalid');
  if(!finite(scene?.durationSec)||scene.durationSec<1||scene.durationSec>180)errors.push('duration_invalid');
  if(!clean(scene?.seed))errors.push('seed_missing');
  if(scene?.fps!==undefined&&(!finite(scene.fps)||scene.fps<12||scene.fps>120))errors.push('fps_invalid');
  if(!scene?.camera?.length)errors.push('camera_missing');
  if(scene?.provenance?.mode!=='synthetic_visualization')errors.push('provenance_mode_invalid');
  if(!unique(scene?.provenance?.sourceRefs).length)errors.push('provenance_source_refs_missing');
  const colors=[scene?.background?.skyTop,scene?.background?.skyBottom,scene?.background?.ground,scene?.background?.road,scene?.background?.snow];
  if(colors.some(c=>!validColor(c)))errors.push('background_color_invalid');

  const actorIds=new Set<string>();
  for(const actor of scene?.actors??[]){
    if(!clean(actor.id))errors.push('actor_id_missing');
    if(actorIds.has(actor.id))errors.push('actor_id_duplicate:'+actor.id);
    actorIds.add(actor.id);
    if(!actor.path?.length)errors.push('actor_path_missing:'+actor.id);
    if(!finite(actor.width)||actor.width<=0||!finite(actor.height)||actor.height<=0)errors.push('actor_size_invalid:'+actor.id);
    let last=-Infinity;
    for(const frame of actor.path??[]){
      if(!finite(frame.t)||frame.t<0||frame.t>scene.durationSec)errors.push('actor_frame_time_invalid:'+actor.id);
      if(frame.t<last)errors.push('actor_frame_order_invalid:'+actor.id);
      last=frame.t;
      if(!finite(frame.x)||!finite(frame.y))errors.push('actor_frame_position_invalid:'+actor.id);
    }
  }

  const emitterIds=new Set<string>();
  for(const emitter of scene?.emitters??[]){
    if(!clean(emitter.id))errors.push('emitter_id_missing');
    if(emitterIds.has(emitter.id))errors.push('emitter_id_duplicate:'+emitter.id);
    emitterIds.add(emitter.id);
    if(!Number.isInteger(emitter.count)||emitter.count<1||emitter.count>2000)errors.push('emitter_count_invalid:'+emitter.id);
    if(!finite(emitter.startSec)||!finite(emitter.endSec)||emitter.startSec<0||emitter.endSec<=emitter.startSec||emitter.endSec>scene.durationSec)errors.push('emitter_window_invalid:'+emitter.id);
    if(emitter.actorId&&!actorIds.has(emitter.actorId))errors.push('emitter_actor_missing:'+emitter.id+':'+emitter.actorId);
  }

  const textIds=new Set<string>();
  for(const cue of scene?.textCues??[]){
    if(!clean(cue.id))errors.push('text_id_missing');
    if(textIds.has(cue.id))errors.push('text_id_duplicate:'+cue.id);
    textIds.add(cue.id);
    if(!clean(cue.text))errors.push('text_empty:'+cue.id);
    if(!finite(cue.startSec)||!finite(cue.endSec)||cue.startSec<0||cue.endSec<=cue.startSec||cue.endSec>scene.durationSec)errors.push('text_window_invalid:'+cue.id);
    if(cue.sourceRefs?.length===0)errors.push('text_source_refs_empty:'+cue.id);
  }
  if((scene?.textCues??[]).some(c=>c.sourceRefs?.length)&&!unique(scene?.provenance?.factualClaimRefs).length)errors.push('factual_claim_refs_missing');

  return{schema:'evercraft.fallen.native-motion-validation.v1' as const,status:errors.length?('rejected' as const):('accepted' as const),errors:[...new Set(errors)]};
}

function buildHtml(scene:NativeMotionScene,width:number,height:number,fps:number){
  const json=safeJson(scene);
  const ratio=width/1920;
  const syntheticFont=Math.max(12,Math.round(13*ratio));
  const html=[
    '<!doctype html><html lang="en"><head><meta charset="utf-8"/>',
    '<meta name="viewport" content="width=device-width,initial-scale=1"/>',
    '<title>'+esc(scene.id)+' - Fallen Native Motion</title><style>',
    'html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#020407}',
    'body{display:flex;align-items:center;justify-content:center}',
    '#viewport{position:relative;width:'+width+'px;height:'+height+'px;overflow:hidden;background:#020407}',
    '#film{position:absolute;inset:0;width:100%;height:100%}',
    '#titles{position:absolute;inset:0;pointer-events:none;font-family:Inter,Arial,sans-serif;color:white}',
    '.cue{position:absolute;display:flex;align-items:center;box-sizing:border-box;white-space:pre-wrap;text-shadow:0 3px 18px rgba(0,0,0,.8)}',
    '#synthetic{position:absolute;right:'+Math.round(34*ratio)+'px;bottom:'+Math.round(26*ratio)+'px;padding:'+Math.round(8*ratio)+'px '+Math.round(12*ratio)+'px;border:1px solid rgba(255,255,255,.28);background:rgba(2,4,7,.58);font:700 '+syntheticFont+'px/1 Arial,sans-serif;letter-spacing:.16em;color:rgba(255,255,255,.72)}',
    '</style></head><body><div id="viewport"><canvas id="film" width="'+width+'" height="'+height+'"></canvas><div id="titles"></div><div id="synthetic">SYNTHETIC VISUALIZATION</div></div>',
    '<script id="fallen-native-motion" type="application/json">'+json+'</script><script>',
    '(()=>{',
    "const scene=JSON.parse(document.getElementById('fallen-native-motion').textContent);",
    "const canvas=document.getElementById('film'),ctx=canvas.getContext('2d'),titles=document.getElementById('titles');",
    'const W=canvas.width,H=canvas.height,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t;',
    "const ease=(n,t)=>{const x=clamp(t,0,1);if(n==='ease_in')return x*x;if(n==='ease_out')return 1-(1-x)*(1-x);if(n==='ease_in_out')return x<.5?2*x*x:1-Math.pow(-2*x+2,2)/2;return x};",
    'const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0};',
    'const rand=(seed,index)=>{let x=(hash(seed)^Math.imul(index+1,0x9e3779b9))>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967295};',
    "const kf=(frames,t)=>{const a=[...frames].sort((x,y)=>x.t-y.t);if(t<=a[0].t)return a[0];if(t>=a[a.length-1].t)return a[a.length-1];for(let i=1;i<a.length;i++){const r=a[i],l=a[i-1];if(t<=r.t){const p=ease(r.ease||l.ease,(t-l.t)/(r.t-l.t));return{x:lerp(l.x,r.x,p),y:lerp(l.y,r.y,p),scale:lerp(l.scale??1,r.scale??1,p),rotationDeg:lerp(l.rotationDeg??0,r.rotationDeg??0,p),opacity:lerp(l.opacity??1,r.opacity??1,p),zoom:lerp(l.zoom??1,r.zoom??1,p),t}}}return a[a.length-1]};",
    'const cam=t=>kf(scene.camera,t),actorAt=(a,t)=>kf(a.path,t),screen=(p,c)=>({x:(p.x-c.x)*c.zoom+W/2,y:(p.y-c.y)*c.zoom+H/2});',
    "const rr=(x,y,w,h,r)=>{const q=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+q,y);ctx.arcTo(x+w,y,x+w,y+h,q);ctx.arcTo(x+w,y+h,x,y+h,q);ctx.arcTo(x,y+h,x,y,q);ctx.arcTo(x,y,x+w,y,q);ctx.closePath()};",
    "const glow=(x,y,r,color,a=.7)=>{const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(.28,color);g.addColorStop(1,'rgba(0,0,0,0)');ctx.globalAlpha=a;ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1};",
    "const bg=t=>{let g=ctx.createLinearGradient(0,0,0,H*.68);g.addColorStop(0,scene.background.skyTop);g.addColorStop(1,scene.background.skyBottom);ctx.fillStyle=g;ctx.fillRect(0,0,W,H*.7);if(scene.background.horizonGlow){g=ctx.createRadialGradient(W*.62,H*.48,0,W*.62,H*.48,W*.42);g.addColorStop(0,scene.background.horizonGlow);g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,W,H*.74)}ctx.fillStyle=scene.background.ground;ctx.fillRect(0,H*.58,W,H*.42);ctx.fillStyle=scene.background.road;ctx.beginPath();ctx.moveTo(0,H*.7);ctx.lineTo(W,H*.61);ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.closePath();ctx.fill();ctx.strokeStyle='rgba(255,255,255,.12)';ctx.lineWidth=Math.max(2,W*.0016);for(let i=0;i<5;i++){const y=H*(.76+i*.055);ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y-H*.07);ctx.stroke()}ctx.fillStyle=scene.background.snow;ctx.globalAlpha=.92;ctx.beginPath();ctx.moveTo(0,H*.62);for(let x=0;x<=W;x+=W/18)ctx.lineTo(x,H*.61+Math.sin(x*.011+t*.4)*H*.004);ctx.lineTo(W,H*.69);ctx.lineTo(0,H*.7);ctx.closePath();ctx.fill();ctx.globalAlpha=1};",
    "const truck=(a,p,c)=>{const s=(p.scale??1)*c.zoom,q=screen(p,c),w=a.width*s,h=a.height*s;ctx.save();ctx.translate(q.x,q.y);ctx.rotate((p.rotationDeg??0)*Math.PI/180);ctx.globalAlpha=p.opacity??1;const body=a.color||'#173a56',accent=a.accentColor||'#65bfff';ctx.fillStyle='rgba(0,0,0,.34)';ctx.beginPath();ctx.ellipse(0,h*.34,w*.55,h*.13,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=body;rr(-w*.42,-h*.25,w*.67,h*.46,h*.08);ctx.fill();ctx.fillStyle='#d8e7ef';rr(-w*.24,-h*.36,w*.33,h*.23,h*.04);ctx.fill();ctx.fillStyle='rgba(10,20,28,.86)';rr(-w*.215,-h*.33,w*.14,h*.17,h*.025);ctx.fill();rr(-w*.055,-h*.33,w*.12,h*.17,h*.025);ctx.fill();ctx.fillStyle=accent;ctx.fillRect(-w*.39,h*.02,w*.54,h*.07);ctx.fillStyle='#101418';for(const wx of[-w*.28,w*.13]){ctx.beginPath();ctx.arc(wx,h*.24,h*.13,0,Math.PI*2);ctx.fill();ctx.fillStyle='#b9c2c8';ctx.beginPath();ctx.arc(wx,h*.24,h*.055,0,Math.PI*2);ctx.fill();ctx.fillStyle='#101418'}ctx.fillStyle='#202a31';ctx.beginPath();ctx.moveTo(w*.18,-h*.02);ctx.lineTo(w*.58,h*.06);ctx.lineTo(w*.68,h*.27);ctx.lineTo(w*.19,h*.2);ctx.closePath();ctx.fill();ctx.fillStyle='#dfeaf0';ctx.globalAlpha=.86;ctx.fillRect(w*.21,h*.12,w*.43,h*.035);ctx.globalAlpha=1;glow(w*.17,-h*.04,h*.18,'rgba(255,240,190,.85)',.8);ctx.restore()};",
    "const tractor=(a,p,c)=>{const s=(p.scale??1)*c.zoom,q=screen(p,c),w=a.width*s,h=a.height*s;ctx.save();ctx.translate(q.x,q.y);ctx.rotate((p.rotationDeg??0)*Math.PI/180);ctx.globalAlpha=p.opacity??1;const body=a.color||'#1a78a9';ctx.fillStyle='rgba(0,0,0,.32)';ctx.beginPath();ctx.ellipse(0,h*.37,w*.55,h*.12,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=body;rr(-w*.28,-h*.12,w*.48,h*.32,h*.07);ctx.fill();ctx.fillStyle='#20282c';rr(-w*.12,-h*.43,w*.28,h*.34,h*.04);ctx.fill();ctx.fillStyle='rgba(145,210,235,.45)';rr(-w*.09,-h*.39,w*.22,h*.23,h*.025);ctx.fill();ctx.fillStyle='#111';for(const wx of[-w*.2,w*.16]){ctx.beginPath();ctx.arc(wx,h*.25,h*.16,0,Math.PI*2);ctx.fill();ctx.fillStyle='#b8c2c7';ctx.beginPath();ctx.arc(wx,h*.25,h*.065,0,Math.PI*2);ctx.fill();ctx.fillStyle='#111'}ctx.strokeStyle=body;ctx.lineWidth=Math.max(3,w*.035);ctx.beginPath();ctx.moveTo(w*.12,-h*.08);ctx.lineTo(w*.39,h*.02);ctx.lineTo(w*.5,h*.2);ctx.stroke();ctx.fillStyle='#273038';ctx.beginPath();ctx.moveTo(w*.38,h*.04);ctx.lineTo(w*.7,h*.09);ctx.lineTo(w*.74,h*.28);ctx.lineTo(w*.42,h*.23);ctx.closePath();ctx.fill();glow(w*.2,-h*.1,h*.16,'rgba(255,240,190,.85)',.8);ctx.restore()};",
    "const building=(a,p,c)=>{const q=screen(p,c),s=(p.scale??1)*c.zoom,w=a.width*s,h=a.height*s,x=q.x-w/2,y=q.y-h/2;ctx.save();ctx.globalAlpha=p.opacity??1;ctx.fillStyle=a.color||'#1c2328';rr(x,y,w,h,Math.max(4,w*.01));ctx.fill();const cols=7,rows=3,pad=w*.07,gap=w*.02,ww=(w-pad*2-gap*(cols-1))/cols,hh=h*.12;for(let ry=0;ry<rows;ry++)for(let cx=0;cx<cols;cx++){const wx=x+pad+cx*(ww+gap),wy=y+h*.18+ry*h*.2;ctx.fillStyle='rgba(255,207,126,'+(0.35+0.35*((cx+ry)%2))+')';rr(wx,wy,ww,hh,Math.max(2,ww*.08));ctx.fill()}ctx.restore()};",
    "const light=(a,p,c)=>{const q=screen(p,c),s=(p.scale??1)*c.zoom,w=a.width*s,h=a.height*s;ctx.save();ctx.translate(q.x,q.y);ctx.strokeStyle=a.color||'#232a2e';ctx.lineWidth=Math.max(3,w*.18);ctx.beginPath();ctx.moveTo(0,h*.46);ctx.lineTo(0,-h*.42);ctx.lineTo(w*.32,-h*.42);ctx.stroke();glow(w*.34,-h*.4,h*.16,'rgba(255,225,160,.9)',.75);ctx.restore()};",
    "const tree=(a,p,c)=>{const q=screen(p,c),s=(p.scale??1)*c.zoom,w=a.width*s,h=a.height*s;ctx.save();ctx.translate(q.x,q.y);ctx.fillStyle='#2c3336';ctx.fillRect(-w*.05,h*.1,w*.1,h*.32);ctx.fillStyle=a.color||'#203d35';for(let i=0;i<4;i++){const yy=-h*.34+i*h*.13,ww=w*(.35+i*.1);ctx.beginPath();ctx.moveTo(0,yy-h*.16);ctx.lineTo(-ww,yy+h*.11);ctx.lineTo(ww,yy+h*.11);ctx.closePath();ctx.fill()}ctx.fillStyle=scene.background.snow;ctx.globalAlpha=.8;for(let i=0;i<3;i++){const yy=-h*.29+i*h*.14,ww=w*(.26+i*.08);ctx.beginPath();ctx.moveTo(0,yy-h*.08);ctx.lineTo(-ww,yy+h*.04);ctx.lineTo(ww,yy+h*.04);ctx.closePath();ctx.fill()}ctx.restore()};",
    "const bank=(a,p,c)=>{const q=screen(p,c),s=(p.scale??1)*c.zoom,w=a.width*s,h=a.height*s;ctx.save();ctx.translate(q.x,q.y);ctx.fillStyle=a.color||scene.background.snow;ctx.beginPath();ctx.moveTo(-w/2,h/2);for(let i=0;i<=8;i++)ctx.lineTo(-w/2+w*i/8,-h*.35+Math.sin(i*1.7+hash(a.id)%7)*h*.09);ctx.lineTo(w/2,h/2);ctx.closePath();ctx.fill();ctx.restore()};",
    "const sign=(a,p,c)=>{const q=screen(p,c),s=(p.scale??1)*c.zoom,w=a.width*s,h=a.height*s;ctx.save();ctx.translate(q.x,q.y);ctx.fillStyle=a.color||'#08111a';rr(-w/2,-h/2,w,h,Math.max(6,w*.03));ctx.fill();ctx.strokeStyle=a.accentColor||'#65bfff';ctx.lineWidth=Math.max(2,w*.01);ctx.stroke();ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='700 '+Math.max(12,h*.22)+'px Arial,sans-serif';ctx.fillText(a.label||'',0,0,w*.86);ctx.restore()};",
    "const actor=(a,p,c)=>{if(a.primitive==='snowplow_truck')return truck(a,p,c);if(a.primitive==='tractor_loader')return tractor(a,p,c);if(a.primitive==='commercial_building')return building(a,p,c);if(a.primitive==='streetlight')return light(a,p,c);if(a.primitive==='tree')return tree(a,p,c);if(a.primitive==='snowbank')return bank(a,p,c);if(a.primitive==='sign')return sign(a,p,c);const q=screen(p,c),s=(p.scale??1)*c.zoom,w=a.width*s,h=a.height*s;ctx.save();ctx.translate(q.x,q.y);ctx.rotate((p.rotationDeg??0)*Math.PI/180);ctx.globalAlpha=p.opacity??1;ctx.fillStyle=a.color||'#fff';if(a.primitive==='circle'){ctx.beginPath();ctx.arc(0,0,Math.min(w,h)/2,0,Math.PI*2);ctx.fill()}else ctx.fillRect(-w/2,-h/2,w,h);ctx.restore()};",
    "const ep=(e,t,c)=>{if(e.actorId){const a=scene.actors.find(x=>x.id===e.actorId);if(a){const p=actorAt(a,t);return screen({x:p.x+(e.offset?.x||0),y:p.y+(e.offset?.y||0)},c)}}return{x:(e.bounds?.x||0)+(e.bounds?.width||W)/2,y:(e.bounds?.y||0)+(e.bounds?.height||H)/2}};",
    "const particles=(e,t,c)=>{if(t<e.startSec||t>e.endSec)return;const local=(t-e.startSec)/(e.endSec-e.startSec),seed=scene.seed+':'+(e.seed||e.id),base=ep(e,t,c),spread=e.spread??1,op=e.opacity??.82;ctx.save();if(e.kind==='spark')ctx.globalCompositeOperation='lighter';for(let i=0;i<e.count;i++){const r1=rand(seed,i*7),r2=rand(seed,i*7+1),r3=rand(seed,i*7+2),r4=rand(seed,i*7+3),r5=rand(seed,i*7+4);let x,y,size,alpha;if(e.kind==='snow'){const b=e.bounds||{x:0,y:0,width:W,height:H};x=b.x+((r1+local*(.02+r4*.08))%1)*b.width;y=b.y+((r2+local*(.35+r3*.55))%1)*b.height;size=(e.sizeMin??1.5)+r3*((e.sizeMax??7)-(e.sizeMin??1.5));alpha=op*(.28+.72*r4);ctx.fillStyle='rgba(246,251,255,'+alpha+')';ctx.beginPath();ctx.arc(x,y,size,0,Math.PI*2);ctx.fill()}else{const age=(local+r1)%1,dir=e.velocity||{x:-120,y:-90},speed=.35+r3*.95;x=base.x+dir.x*age*speed+(r2-.5)*110*spread;y=base.y+dir.y*age*speed+(r4-.5)*70*spread+180*age*age;size=(e.sizeMin??3)+r5*((e.sizeMax??16)-(e.sizeMin??3));alpha=op*(1-age)*(.4+.6*r3);ctx.fillStyle=e.kind==='spark'?'rgba(255,210,125,'+alpha+')':'rgba(245,250,255,'+alpha+')';ctx.beginPath();ctx.arc(x,y,size,0,Math.PI*2);ctx.fill()}}ctx.restore()};",
    "const nodes=new Map(),node=cue=>{if(nodes.has(cue.id))return nodes.get(cue.id);const el=document.createElement('div');el.className='cue';el.textContent=cue.uppercase?cue.text.toUpperCase():cue.text;Object.assign(el.style,{left:cue.x+'px',top:cue.y+'px',width:cue.width+'px',fontSize:cue.fontSize+'px',fontWeight:String(cue.fontWeight||700),textAlign:cue.align||'left',justifyContent:cue.align==='center'?'center':cue.align==='right'?'flex-end':'flex-start',color:cue.color||'#fff',letterSpacing:(cue.letterSpacing||0)+'px'});if(cue.background){el.style.background=cue.background;el.style.padding=(cue.padding||14)+'px';el.style.borderRadius='14px'}titles.appendChild(el);nodes.set(cue.id,el);return el};",
    "const text=t=>{for(const cue of scene.textCues){const el=node(cue),active=t>=cue.startSec&&t<=cue.endSec;if(!active){el.style.opacity='0';continue}const d=cue.endSec-cue.startSec,p=(t-cue.startSec)/d,fade=Math.min(1,p/.12,(1-p)/.12);el.style.opacity=String(clamp(fade,0,1));el.style.transform='translateY('+((1-clamp(p/.18,0,1))*14)+'px)'}};",
    "window.__evercraftRenderAt=async sec=>{const t=clamp(Number(sec)||0,0,scene.durationSec),c=cam(t);ctx.clearRect(0,0,W,H);bg(t);const draws=[...scene.actors.map(a=>({z:a.z,type:'actor',v:a})),...scene.emitters.map(e=>({z:e.z,type:'emitter',v:e}))].sort((a,b)=>a.z-b.z);for(const d of draws){if(d.type==='actor')actor(d.v,actorAt(d.v,t),c);else particles(d.v,t,c)}text(t);document.documentElement.dataset.evercraftFrameReady='true';document.documentElement.dataset.evercraftTime=t.toFixed(3);return{time:t}};",
    'window.__evercraftRenderFrame=frame=>window.__evercraftRenderAt(Number(frame)/'+fps+');window.__evercraftStageReady=true;window.__evercraftRenderAt(0);',
    '})();</script></body></html>'
  ].join('');
  return html;
}

export function compileNativeMotionScene(scene:NativeMotionScene):NativeMotionBundle{
  const validation=validateNativeMotionScene(scene);
  if(validation.status!=='accepted')throw new Error('native_motion_scene_rejected:'+validation.errors.join('|'));
  const dims=dimensions(scene.aspectRatio),fps=Math.round(scene.fps??30);
  const normalized:NativeMotionScene={
    ...scene,fps,
    actors:scene.actors.map(a=>({...a,sourceRefs:unique(a.sourceRefs)})),
    provenance:{...scene.provenance,sourceRefs:unique(scene.provenance.sourceRefs),factualClaimRefs:unique(scene.provenance.factualClaimRefs)}
  };
  const receipt:NativeMotionReceipt={
    schema:'evercraft.fallen.native-motion-receipt.v1',
    sceneId:normalized.id,status:'accepted',digest:digest(normalized),frameControl:'exact',
    renderer:'evercraft-native-canvas-2d-v1',deterministicSeed:normalized.seed,
    dimensions:{width:dims.width,height:dims.height,fps,durationSec:normalized.durationSec},
    provenance:{mode:'synthetic_visualization',sourceRefs:normalized.provenance.sourceRefs,factualClaimRefs:normalized.provenance.factualClaimRefs??[]},
    boundaries:{noExternalVisualModel:true,noProviderGenerationClaim:true,syntheticVisualizationLabelRequired:true,deterministicExactFrame:true,publicationAuthorityGranted:false}
  };
  return{scene:normalized,html:buildHtml(normalized,dims.width,dims.height,fps),receipt};
}
