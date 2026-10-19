#!/usr/bin/env node
// FALLEN: evidence-bound cinematic finishing for EXISTING motion-picture masters.
// No synthetic event generation, action substitution, or publication authority.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const HASH = /^[0-9a-f]{64}$/i;
const SCHEMA = 'evercraft.fallen.action-finish-request.v1';
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const reject = code => { throw new Error('fallen_action_finish_' + code); };
const round = x => Number(x.toFixed(5));

function processMedia(binary,args) {
  const r = spawnSync(binary,args,{encoding:'utf8',maxBuffer:8*1024*1024,timeout:120000});
  if(r.error || r.status !== 0) reject(binary+'_failed:'+(r.error?.message||r.stderr||r.status).slice(-1200));
  return r.stdout;
}
function probe(file) {
  const data = JSON.parse(processMedia('ffprobe',['-v','error','-show_entries',
    'format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate','-of','json',file]));
  const video = data.streams?.find(x=>x.codec_type==='video');
  const audio = data.streams?.find(x=>x.codec_type==='audio');
  const duration = Number(data.format?.duration);
  const [a,b] = String(video?.avg_frame_rate||'0/1').split('/').map(Number);
  const fps = a/b;
  if(!video||!audio||!Number.isFinite(duration)||duration<0.8||duration>120||
    !Number.isFinite(fps)||fps<23||fps>61||
    !Number.isInteger(video.width)||!Number.isInteger(video.height)||
    video.width<320||video.height<180||video.width>4096||video.height>4096)
    reject('master_media_invalid_or_audio_missing');
  return {width:video.width,height:video.height,durationSec:duration,fps,
    videoCodec:video.codec_name,audioCodec:audio.codec_name};
}
function sourceMotionActivity(file){
  // Measure the ORIGINAL frames before adding any camera effects. Blur/shake cannot
  // turn a still image into proof of physical action. This is a screening metric,
  // never an assertion that an object, product, or human was actually present.
  const r=spawnSync('ffmpeg',['-v','error','-nostdin','-i',file,
    '-vf','fps=2,scale=64:36:flags=area,format=gray',
    '-an','-f','rawvideo','-pix_fmt','gray','pipe:1'],
    {encoding:null,maxBuffer:4*1024*1024,timeout:120000});
  if(r.error||r.status!==0)reject('motion_probe_failed');
  const data=r.stdout;
  const frameBytes=64*36;
  const count=Math.floor(data.length/frameBytes);
  if(count<2)reject('motion_probe_insufficient_frames');
  let accumulated=0;
  for(let frame=1;frame<count;frame++){
    let diff=0;
    for(let i=0;i<frameBytes;i++)diff+=Math.abs(data[(frame-1)*frameBytes+i]-data[frame*frameBytes+i]);
    accumulated+=diff/(frameBytes*255);
  }
  return round(accumulated/(count-1));
}
function validateFile(entry,label) {
  if(!entry || typeof entry.path!=='string'||typeof entry.sha256!=='string'||!HASH.test(entry.sha256))reject(label+'_binding_missing');
  const filename=path.resolve(entry.path);
  if(!fs.existsSync(filename)||!fs.statSync(filename).isFile())reject(label+'_file_missing');
  if(hash(filename)!==entry.sha256.toLowerCase())reject(label+'_digest_mismatch');
  return filename;
}
function positiveFloat(value,min,max,label){
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)reject(label+'_invalid');
  return value;
}
function reviewSources(entry,label){
  if(!Array.isArray(entry)||!entry.length||entry.length>12||
    entry.some(x=>typeof x!=='string'||x.length<3||x.length>500))reject(label+'_source_refs_invalid');
}
function validate(input) {
  if(!input ||input.schema!==SCHEMA)reject('schema_invalid');
  if(typeof input.id!=='string'||!/^[a-z0-9][a-z0-9-]{2,79}$/.test(input.id))reject('id_invalid');
  if(!['internal_canary','marketing_candidate'].includes(input.usage))reject('usage_invalid');
  if(!['owned','licensed'].includes(input.rights))reject('rights_unapproved');
  if(input.rights==='licensed'&&!(typeof input.licenseRef==='string'&&input.licenseRef.trim()))reject('license_ref_missing');
  reviewSources(input.sourceRefs,'master');
  if(!['observed_capture','licensed_footage','synthetic_visualization'].includes(input.evidenceState))reject('evidence_state_invalid');
  if(!['physical_action','simulation','software_product'].includes(input.subjectClass))reject('subject_class_invalid');
  if(!['steel_amber','cool_precision','natural'].includes(input.look))reject('look_invalid');
  if(input.subjectClass==='software_product'&&input.look!=='natural')reject('product_ui_requires_natural_look');
  if(typeof input.outputPath!=='string'||!input.outputPath.toLowerCase().endsWith('.mp4'))reject('output_invalid');
  const src=validateFile(input.master,'master');
  const dest=path.resolve(input.outputPath);
  if(src===dest||fs.existsSync(dest)||fs.existsSync(dest+'.before.png')||fs.existsSync(dest+'.after.png')||
    fs.existsSync(dest+'.receipt.json'))reject('output_exists_or_is_source');
  const info=probe(src);
  if(input.usage==='marketing_candidate'&&Math.min(info.width,info.height)<1080)reject('marketing_candidate_below_1080_short_edge');
  const beats=input.impactBeats??[];
  if(!Array.isArray(beats)||beats.length>4)reject('impact_count_invalid');
  if(input.subjectClass==='software_product'&&beats.length)reject('product_ui_impact_forbidden');
  let last=-999;
  for(const b of beats) {
    if(!b||typeof b!=='object')reject('impact_invalid');
    positiveFloat(b.atSec,0.2,Math.max(0.2,info.durationSec-0.22),'impact_time');
    positiveFloat(b.strength,0.1,1,'impact_strength');
    if(b.atSec-last<0.55)reject('impact_spacing_invalid');
    last=b.atSec;
  }
  const observedMotionActivity=beats.length?sourceMotionActivity(src):null;
  if(beats.length && observedMotionActivity < 0.004){
    reject('source_lacks_observed_motion_for_action_impacts');
  }
  let sfx=null;
  if(input.impactSound!==undefined){
    if(!beats.length)reject('sound_without_impact');
    if(!['owned','licensed'].includes(input.impactSound.rights))reject('sound_rights_unapproved');
    if(input.impactSound.rights==='licensed'&&!input.impactSound.licenseRef?.trim())reject('sound_license_missing');
    reviewSources(input.impactSound.sourceRefs,'sound');
    sfx=validateFile(input.impactSound,'sound');
    const snd=JSON.parse(processMedia('ffprobe',['-v','error','-show_entries',
      'format=duration:stream=codec_type','-of','json',sfx]));
    if(!snd.streams?.some(z=>z.codec_type==='audio') ||
      !(Number(snd.format?.duration)>0.08 && Number(snd.format?.duration)<10))reject('sound_media_invalid');
  }
  return {src,dest,info,beats,sfx,observedMotionActivity};
}
function impactExpression(beats,strengthFactor){
  if(!beats.length)return '0';
  // 280ms damped impulse. No simulated explosions or new objects, only camera response.
  return beats.map(b=>{
    const at=round(b.atSec),force=round(b.strength*strengthFactor);
    return 'if(between(t,'+at+','+round(at+0.28)+'),'+force+'*sin(110*(t-'+at+'))*exp(-11*(t-'+at+')),0)';
  }).join('+');
}
export function buildActionFinishPlan(request){
  const v=validate(request);
  const {width,height}=v.info;
  const overscan=v.beats.length?.06:0;
  const sw=2*Math.ceil(width*(1+overscan)/2),sh=2*Math.ceil(height*(1+overscan)/2);
  const cx=(sw-width)/2,cy=(sh-height)/2;
  const shakeX=impactExpression(v.beats,Math.min(width,height)*0.012);
  const shakeY=impactExpression(v.beats,Math.min(width,height)*0.009);
  const x='max(0,min(in_w-out_w,'+cx+'+('+shakeX+')))';
  const y='max(0,min(in_h-out_h,'+cy+'+('+shakeY+')))';
  const looks={
    steel_amber:{contrast:1.14,saturation:1.15,gamma:1.02,rs:0.022,bs:-0.025,rh:0.035,bh:-0.008},
    cool_precision:{contrast:1.10,saturation:1.07,gamma:1.01,rs:-0.008,bs:0.025,rh:0.012,bh:0.011},
    natural:{contrast:1.025,saturation:1.018,gamma:1.0,rs:0,bs:0,rh:0,bh:0},
  };
  const c=looks[request.look];
  const flash=impactExpression(v.beats,0.048);
  const grade='eq=contrast='+c.contrast+':saturation='+c.saturation+':gamma='+c.gamma+':brightness='+"'"+flash+"'"+':eval=frame';
  const filters=['scale='+sw+':'+sh+':flags=lanczos',
    'crop='+width+':'+height+":x='"+x+"':y='"+y+"'",
    grade,
    'colorbalance=rs='+c.rs+':bs='+c.bs+':rh='+c.rh+':bh='+c.bh,
    ...(request.look==='natural'?[]:['vignette=angle=PI/5:eval=init','unsharp=5:5:0.34:3:3:0.0']),
    'format=yuv420p'];
  const args=['-hide_banner','-loglevel','error','-nostdin','-n','-i',v.src];
  const reviewTime=round(Math.min(v.info.durationSec-0.1,v.beats[0]?.atSec??v.info.durationSec/2));
  if(v.sfx){
    for(let i=0;i<v.beats.length;i++)args.push('-i',v.sfx);
    const aFilters=['[0:a:0]aresample=48000,aformat=channel_layouts=stereo[mainaudio]'];
    v.beats.forEach((b,i)=>{
      const delay=Math.round(b.atSec*1000);
      aFilters.push('['+(i+1)+':a:0]atrim=duration=0.35,asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,volume='+round(0.42*b.strength)+',adelay='+delay+':all=1[sfx'+i+']');
    });
    aFilters.push('[mainaudio]'+v.beats.map((_,i)=>'[sfx'+i+']').join('')+'amix=inputs='+(1+v.beats.length)+':duration=first:normalize=0,alimiter=limit=0.95[aout]');
    args.push('-filter_complex','[0:v:0]'+filters.join(',')+'[vout];'+aFilters.join(';'),'-map','[vout]','-map','[aout]');
  }else args.push('-vf',filters.join(','),'-map','0:v:0','-map','0:a:0');
  args.push('-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p',
    '-c:a',v.sfx?'aac':'copy',...(v.sfx?['-b:a','192k','-ar','48000']:[]),
    '-movflags','+faststart',v.dest);
  return {schema:'evercraft.fallen.action-finish-plan.v1',id:request.id,
    masterPath:v.src,outputPath:v.dest,sourceSha256:request.master.sha256.toLowerCase(),
    width,height,durationSec:v.info.durationSec,fps:v.info.fps,reviewTime,
    filterChain:filters.join(','),ffmpegArgs:args,sourceRefs:request.sourceRefs,
    impactCount:v.beats.length,impactBeats:v.beats.map(x=>({...x})),
    sourceMotionActivity:v.observedMotionActivity,
    treatment:request.look,subjectClass:request.subjectClass,evidenceState:request.evidenceState,
    rights:request.rights,usage:request.usage,impactSoundSha256:request.impactSound?.sha256??null,
    boundaries:{realMasterRequired:true,exactMasterDigestRequired:true,soundRightsRequired:true,
      softwareUiCameraShakeForbidden:true,sourceFootageNotFabricated:true,
      visualReviewStillRequired:true,publicationAuthority:false},
  };
}
function snapshot(inputPath,outPath,time){
  processMedia('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-n',
    '-ss',String(time),'-i',inputPath,'-frames:v','1','-an',outPath]);
  return {path:outPath,sha256:hash(outPath)};
}
export function renderActionFinish(request){
  const p=buildActionFinishPlan(request);
  fs.mkdirSync(path.dirname(p.outputPath),{recursive:true});
  const beforePath=p.outputPath+'.before.png';
  const afterPath=p.outputPath+'.after.png';
  const receiptPath=p.outputPath+'.receipt.json';
  try{
    processMedia('ffmpeg',p.ffmpegArgs);
    const observed=probe(p.outputPath);
    if(observed.width!==p.width||observed.height!==p.height||
      Math.abs(observed.durationSec-p.durationSec)>0.2)reject('output_shape_mismatch');
    const before=snapshot(p.masterPath,beforePath,p.reviewTime);
    const after=snapshot(p.outputPath,afterPath,p.reviewTime);
    const receipt={schema:'evercraft.fallen.action-finish-receipt.v1',
      id:p.id,sourceSha256:p.sourceSha256,outputSha256:hash(p.outputPath),
      outputPath:p.outputPath,media:{...observed},sourceRefs:p.sourceRefs,
      treatment:p.treatment,impactCount:p.impactCount,impactBeats:p.impactBeats,
      impactSoundSha256:p.impactSoundSha256,sourceMotionActivity:p.sourceMotionActivity,evidenceState:p.evidenceState,
      subjectClass:p.subjectClass,rights:p.rights,usage:p.usage,
      pixelReview:{before,after,timestampSec:p.reviewTime,status:'awaiting_human_review'},
      boundaries:p.boundaries,
      disclosures:['Cinematic grade, lens crop and optional camera motion are post-production effects.',
        'No new physical action or explosion was generated.',
        'Pixel comparison does not establish aesthetic approval or truth of source material.',
        'This is not an Evercraft Clip publication or customer-delivered master.'],
      completedAt:new Date().toISOString(),publicationAuthority:false};
    fs.writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
    return {receiptPath,receipt};
  }catch(error){
    for(const item of [p.outputPath,beforePath,afterPath,receiptPath]){
      try{fs.rmSync(item,{force:true})}catch{}
    }
    throw error;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const input=process.argv[2];
  if(!input){console.error('Usage: node systemia/media-studio/action-finish.mjs <request.json>');process.exitCode=2;}
  else{
    try{const result=renderActionFinish(JSON.parse(fs.readFileSync(input,'utf8')));console.log(JSON.stringify(result.receipt,null,2));}
    catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
  }
}
