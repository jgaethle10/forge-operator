#!/usr/bin/env node
/**
 * Fallen Evidence Chapters v1
 * Signed World Engine 3D GPU source -> authored five-chapter review film.
 * Editorial instructions are data. No purported historical facts or paid
 * client claims are generated. No autonomous commercial distribution.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {verifyDirectorStoryboardSources} from './director-storyboard.mjs';

const FPS=24,WIDTH=640,HEIGHT=360;
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const fail=name=>{throw Error('fallen_chapters_'+name);};
const safeText=(value,label,max)=>{
 if(typeof value!=='string'||value.trim().length<3||value.trim().length>max||
    /[\x00-\x1f\x7f]/.test(value))fail(label+'_invalid');
 return value.trim();
};
const fmt=n=>Number(n.toFixed(6)).toString();
function call(binary,args){
 const p=spawnSync(binary,args,{encoding:'utf8',maxBuffer:8*1024*1024,timeout:180000});
 if(p.error||p.status!==0)fail(binary+'_failed_'+String(p.error?.message||p.stderr||p.status).slice(-1300));
 return p.stdout;
}
function media(file){
 const r=JSON.parse(call('ffprobe',['-v','error','-show_entries',
   'stream=codec_type,codec_name,width,height,avg_frame_rate,nb_frames:format=duration',
   '-of','json',file]));
 const video=r.streams.find(s=>s.codec_type==='video');
 const rate=(video?.avg_frame_rate||'0/1').split('/').map(Number);
 if(!video||!rate[1]||rate[0]/rate[1]!==FPS)fail('output_framerate_invalid');
 return {duration:Number(r.format.duration),width:video.width,height:video.height,
  frames:Number(video.nb_frames),codec:video.codec_name,
  hasAudio:r.streams.some(s=>s.codec_type==='audio')};
}
function escapePath(p){
 // Safe for FFmpeg drawtext textfile paths. Restrict output path to no
 // commas, colons or single quotes so source text never becomes filter syntax.
 if(/[,'\n:\[\];]/.test(p))fail('output_path_unsupported');
 return p.replaceAll('\\','/');
}
const sourceMap={hero_full:'wide',detail_closeup:'square',title_safe:'vertical'};
const font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
export function validateEvidenceChapters(request){
 if(request?.schema!=='evercraft.fallen.evidence-chapters-request.v1')
  fail('schema_invalid');
 if(!/^[a-z0-9][a-z0-9_-]{2,72}$/.test(request.id||''))fail('id_invalid');
 if(request.audioPolicy!=='silent')fail('unapproved_audio');
 if(!['educational_internal','evercraft_marketing_concept'].includes(request.productionIntent))
  fail('production_intent_invalid');
 if(!Array.isArray(request.shots)||request.shots.length!==3)fail('sources_missing');
 if(!Array.isArray(request.chapters)||request.chapters.length<3||request.chapters.length>8)
  fail('chapters_count_invalid');
 if(!Number.isInteger(request.transitionFrames)||request.transitionFrames<3||
   request.transitionFrames>18)fail('transition_duration_invalid');
 let lastId=new Set(),total=0,used=new Set();
 for(const chapter of request.chapters){
  if(!chapter||!sourceMap[chapter.intent])fail('chapter_intent_invalid');
  if(!/^[a-z][a-z0-9_-]{2,32}$/.test(chapter.id||'')||lastId.has(chapter.id))
    fail('chapter_id_invalid');
  lastId.add(chapter.id);used.add(chapter.intent);
  safeText(chapter.title,'chapter_title',37);
  safeText(chapter.note,'chapter_note',62);
  if(chapter.evidenceState!=='synthetic_visualization')
    fail('historical_evidence_state_unverified');
  if(!Number.isInteger(chapter.inFrame)||chapter.inFrame<0||
    !Number.isInteger(chapter.frames)||chapter.frames<48||chapter.frames>96||
    chapter.inFrame+chapter.frames>96)fail('chapter_source_trim_invalid');
  if(request.transitionFrames>=chapter.frames/3)fail('transition_too_long');
  total+=chapter.frames;
 }
 if(used.size<3)fail('narrative_camera_variety_missing');
 const projected=total-request.transitionFrames*(request.chapters.length-1);
 if(projected>24*30||projected<24*8)fail('story_duration_invalid');
 return {expectedFrames:projected,expectedDurationSec:projected/FPS};
}
function renderChapter(input,idx,stage){
 const {chapter,sourceIndex,asset}=input;
 const video='v'+idx,background='bg'+idx,foreground='fg'+idx;
 const texts=[
  ['heading',chapter.title],
  ['detail',chapter.note],
  ['chapter',String(idx+1).padStart(2,'0')+' / '+String(input.count).padStart(2,'0')],
  ['disclosure','MODELED 3D VISUAL - NOT HISTORICAL FOOTAGE']
 ];
 for(const [key,val] of texts){
  fs.writeFileSync(path.join(stage,chapter.id+'-'+key+'.txt'),val,
    {flag:'wx',mode:0o600});
 }
 const tp=key=>escapePath(path.join(stage,chapter.id+'-'+key+'.txt'));
 const clipEnd=fmt(chapter.frames/FPS),start=fmt(chapter.inFrame/FPS);
 return [
  '['+sourceIndex+':v]trim=start='+start+':duration='+clipEnd+
     ',setpts=PTS-STARTPTS,fps='+FPS+',settb=AVTB,split=2['+foreground+']['+background+'];',
  '['+background+']scale='+WIDTH+':'+HEIGHT+
     ':force_original_aspect_ratio=increase:flags=lanczos,crop='+WIDTH+':'+HEIGHT+
     ',boxblur=14:2,eq=brightness=-0.10['+background+'out];',
  '['+foreground+']scale='+WIDTH+':'+HEIGHT+
     ':force_original_aspect_ratio=decrease:flags=lanczos,setsar=1['+foreground+'out];',
  '['+background+'out]['+foreground+'out]overlay=(W-w)/2:(H-h)/2:format=auto,'+
     'format=yuv420p,'+
     'drawbox=x=0:y=0:w=iw:h=72:color=black@0.70:t=fill,'+
     'drawtext=fontfile='+font+':textfile='+tp('heading')+
        ':fontsize=21:fontcolor=white:x=21:y=13:shadowx=1:shadowy=1,'+
     'drawtext=fontfile='+font+':textfile='+tp('detail')+
        ':fontsize=13:fontcolor=white:x=22:y=45:shadowx=1:shadowy=1,'+
     'drawbox=x=0:y=ih-34:w=iw:h=34:color=black@0.75:t=fill,'+
     'drawtext=fontfile='+font+':textfile='+tp('chapter')+
        ':fontsize=12:fontcolor=white:x=20:y=h-27,'+
     'drawtext=fontfile='+font+':textfile='+tp('disclosure')+
        ':fontsize=11:fontcolor=white:x=110:y=h-27,'+
     'settb=AVTB['+video+'];'
 ].join('');
}
export function produceEvidenceChapters(request,outDir){
 const planned=validateEvidenceChapters(request);
 if(typeof outDir!=='string'||!outDir||fs.existsSync(outDir))
  fail('output_exists_or_missing');
 if(!fs.existsSync(font))fail('font_unavailable');
 // Reuse established World Engine source integrity gate rather than
 // designing a second, weaker definition of original render proof.
 const admit=verifyDirectorStoryboardSources({
  schema:'evercraft.fallen.director-storyboard-request.v1',
  id:request.id,shots:request.shots,audioPolicy:'silent'
 });
 const assetByIntent=new Map(request.shots.map((s,i)=>[s.intent,{sourceIndex:i,asset:admit.assets[i]}]));
 const assets=[];
 const indexes=new Map();
 const chapterInputs=request.chapters.map((chapter)=>{
  const source=assetByIntent.get(chapter.intent);
  if(!source)fail('missing_camera_source_'+chapter.intent);
  // Same GPU source is input multiple times if different moments are used.
  // The source is not synthetically generated/duplicated by the script.
  let idx=indexes.get(chapter.intent);
  if(idx===undefined){idx=assets.length;assets.push(source.asset);indexes.set(chapter.intent,idx);}
  return {chapter,sourceIndex:idx,count:request.chapters.length,asset:source.asset};
 });
 const dest=path.resolve(outDir);
 const tmp=dest+'.partial-'+process.pid;
 if(fs.existsSync(tmp))fail('partial_output_already_exists');
 try{
  fs.mkdirSync(tmp,{recursive:false,mode:0o700});
  const filters=chapterInputs.map((c,i)=>renderChapter(c,i,tmp));
  let current='v0',lengthFrames=request.chapters[0].frames;
  const timing=[];
  let time=0;
  request.chapters.forEach((c,i)=>{
   const start=time;
   time+=c.frames-request.transitionFrames;
   timing.push({id:c.id,intent:c.intent,sourceStartFrame:c.inFrame,
    sourceFrames:c.frames,filmStartSec:Number(fmt(start/FPS)),
    filmEndSec:Number(fmt((start+c.frames)/FPS)),
    evidenceState:c.evidenceState,
    worldShotDigest:admit.proofs.find(p=>p.intent===c.intent).sourceVideoSha256});
  });
  for(let i=1;i<chapterInputs.length;i++){
   const previous=current;
   const tag='join'+i;
   const offset=fmt((lengthFrames-request.transitionFrames)/FPS);
   filters.push('['+previous+'][v'+i+']xfade=transition=fade:duration='+
     fmt(request.transitionFrames/FPS)+':offset='+offset+
     ',format=yuv420p,settb=AVTB['+tag+'];');
   current=tag;
   lengthFrames+=request.chapters[i].frames-request.transitionFrames;
  }
  const movie=path.join(tmp,'evercraft-evidence-chapters.mp4');
  const args=['-hide_banner','-loglevel','error','-y'];
  for(const f of assets)args.push('-i',f);
  args.push('-filter_complex',filters.join('').replace(/;$/,''),'-map','['+current+']',
    '-an','-r',String(FPS),'-frames:v',String(planned.expectedFrames),
    '-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p',
    '-movflags','+faststart',movie);
  call('ffmpeg',args);
  const result=media(movie);
  if(result.width!==WIDTH||result.height!==HEIGHT||result.hasAudio||
    result.codec!=='h264'||result.frames!==planned.expectedFrames||
    Math.abs(result.duration-planned.expectedDurationSec)>.02)
    fail('output_media_contract_invalid');
  const stills=[];
  for(const [idx,c] of request.chapters.entries()){
   const midpoint=timing[idx].filmStartSec+c.frames/(FPS*2);
   const png=path.join(tmp,'chapter-'+(idx+1)+'.png');
   call('ffmpeg',['-hide_banner','-loglevel','error','-y',
     '-ss',fmt(midpoint),'-i',movie,'-frames:v','1',png]);
   stills.push({chapterId:c.id,timeSec:midpoint,file:path.basename(png),
     sha256:hash(fs.readFileSync(png))});
  }
  if(new Set(stills.map(s=>s.sha256)).size<3)fail('narrative_no_distinct_footage');
  const receipt={
   schema:'evercraft.fallen.evidence-chapters-receipt.v1',
   id:request.id,productionIntent:request.productionIntent,
   sourceState:'signed_synthetic_original_world_engine_gpu',
   sourceProofs:admit.proofs,
   sourceWorldDigest:admit.proofs[0].worldDigest,
   sourceShaderDigest:admit.proofs[0].shaderSha256,
   chapters:timing,transition:{type:'dissolve',frames:request.transitionFrames,
     durationSec:request.transitionFrames/FPS},
   output:{file:path.basename(movie),sha256:hash(fs.readFileSync(movie)),frames:result.frames,
     durationSec:result.duration,width:WIDTH,height:HEIGHT,fps:FPS,
     videoCodec:'h264',audioPresent:false},
   stills,
   protections:{sourceSha256Verified:true,sourceWorldAndShaderMatched:true,
     noHistoricalObservationClaim:true,editorialClaimsNotFactChecked:true,
     onScreenSyntheticDisclosure:true,onlyExistingGpuSourceFrames:true,
     noUnapprovedAudio:true,noClientOutreach:true,noPublication:true,
     creativeReviewRequired:true,actualCommercialRightsNotVerified:true,
     releaseApproval:false},
   status:'INTERNAL_REVIEW_ONLY',
   limitations:['not 1080p master','synthetic low-detail scene',
     'editorial statements require independent human factual/marketing review']
  };
  fs.writeFileSync(path.join(tmp,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',
    {flag:'wx',mode:0o600});
  fs.renameSync(tmp,dest);
  return receipt;
 }catch(e){fs.rmSync(tmp,{recursive:true,force:true});throw e;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [requestFile,outDir]=process.argv.slice(2);
  if(!requestFile||!outDir)fail('usage_request_json_new_output_dir');
  const r=produceEvidenceChapters(JSON.parse(fs.readFileSync(requestFile,'utf8')),outDir);
  console.log(JSON.stringify({status:r.status,output:r.output,chapters:r.chapters.length}));
 }catch(e){console.error(String(e.message||e));process.exitCode=1;}
}
