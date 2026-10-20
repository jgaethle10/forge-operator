#!/usr/bin/env node
/**
 * Fallen Director Storyboard v1.
 * Composes original World Engine GPU renders into one authored visual story.
 * The inputs are real signed engineering videos. This tool does not fabricate
 * historical facts, generate sounds, certify licensed footage or publish.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';

const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const isSha=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const OUT_WIDTH=640,OUT_HEIGHT=360,FPS=24,SHOT_SEC=3,FADE_SEC=.375;
const intents=['hero_full','detail_closeup','title_safe'];
const err=code=>{throw Error('fallen_storyboard_'+code);};
function exec(bin,args){
 const r=spawnSync(bin,args,{encoding:'utf8',maxBuffer:16*1024*1024,timeout:180000});
 if(r.error||r.status!==0)err(bin+'_failed_'+String(r.error?.message||r.stderr||r.status).slice(-1200));
 return r.stdout;
}
function probe(file){
 const doc=JSON.parse(exec('ffprobe',['-v','error','-show_entries',
  'stream=codec_type,codec_name,width,height,avg_frame_rate,nb_frames:format=duration',
  '-of','json',file]));
 const video=doc.streams?.find(s=>s.codec_type==='video');
 const duration=Number(doc.format?.duration);
 const a=(video?.avg_frame_rate||'0/1').split('/').map(Number);
 const fps=a[1]?a[0]/a[1]:0;
 if(!video||!Number.isInteger(video.width)||!Number.isInteger(video.height)||
  !Number.isFinite(duration)||!Number.isFinite(fps))err('media_probe_invalid');
 return {width:video.width,height:video.height,codec:video.codec_name,
  fps,duration,frames:Number(video.nb_frames||0),
  audio:doc.streams.some(s=>s.codec_type==='audio')};
}
export function verifyDirectorStoryboardSources(request){
 if(request?.schema!=='evercraft.fallen.director-storyboard-request.v1')err('schema_invalid');
 if(!/^[a-z0-9][a-z0-9_-]{2,65}$/.test(request.id||''))err('id_invalid');
 if(!Array.isArray(request.shots)||request.shots.length!==3||
  request.shots.some((s,i)=>s.intent!==intents[i]))err('shot_order_invalid');
 if(request.audioPolicy!=='silent')err('audio_not_approved');
 const proofs=[],assets=[];
 for(const shot of request.shots){
  if(typeof shot.path!=='string'||typeof shot.receiptPath!=='string'||
   !isSha(shot.sha256)||typeof shot.title!=='string'||
   shot.title.length<3||shot.title.length>65||/[\x00-\x1f\x7f]/.test(shot.title))
    err('shot_fields_invalid');
  const file=fs.realpathSync(shot.path);
  const receiptFile=fs.realpathSync(shot.receiptPath);
  const size=fs.statSync(file).size;
  if(size<5000||size>600*1024*1024)err('shot_size_invalid');
  const actual=hash(fs.readFileSync(file));
  if(shot.sha256!==actual)err('source_sha256_mismatch_'+shot.intent);
  const receipt=JSON.parse(fs.readFileSync(receiptFile,'utf8'));
  const director=receipt?.nativeFormat?.shotDirector;
  const media=probe(file);
  if(receipt?.output?.sha256!==actual||
    director?.intent!==shot.intent||director?.schema!=='evercraft.world-engine.director-shot.v1'||
    receipt.nativeFormat?.original3dFrames!==true||
    receipt.nativeFormat?.cropApplied!==false||
    receipt.publicationAuthority!==false||
    director.publicationAuthority!==false||
    director.clientApproval!==false)
    err('signed_world_engine_source_invalid_'+shot.intent);
  const requiredFormat={hero_full:'wide',detail_closeup:'square',title_safe:'vertical'}[shot.intent];
  if(receipt.nativeFormat.format!==requiredFormat||
    receipt.output.audioCodec!==null||
    receipt.sceneType!=='procedural_battleship'||
    receipt.sourceState!=='synthetic_visualization'||
    receipt.soundState!=='silent_at_founder_direction_no_sound_invented'||
    receipt.exactGpuReadbackFrames!==96||
    receipt.uniqueRawFrameDigests<20||
    !/^sha256:[0-9a-f]{64}$/.test(receipt.shaderSha256)||!isSha(receipt.worldDigest)||
    !Array.isArray(director.cameraPlanDigests)||
    director.cameraPlanDigests.length!==3||
    media.codec!=='h264'||Math.abs(media.fps-FPS)>.001||
    media.duration<SHOT_SEC||media.audio||
    media.width!==receipt.output.width||media.height!==receipt.output.height)
    err('original_gpu_proof_invalid_'+shot.intent);
  if(shot.intent==='title_safe'&&
   (director.titleSafeClearance?.clearAtAllSamples!==true||
     director.titleSafeRegion?.axis!=='right'))err('title_safe_frame_not_clear');
  proofs.push({intent:shot.intent,worldDigest:receipt.worldDigest,
    shaderSha256:receipt.shaderSha256,renderPlanDigests:director.cameraPlanDigests,
    sourceReceiptSha256:hash(fs.readFileSync(receiptFile)),
    sourceVideoSha256:actual,width:media.width,height:media.height,
    title:shot.title});
  assets.push(file);
 }
 if(new Set(proofs.map(x=>x.worldDigest)).size!==1||
   new Set(proofs.map(x=>x.shaderSha256)).size!==1)
   err('story_world_or_shader_mismatch');
 return {proofs,assets};
}
function videoFilter(index,shot,stage){
 const label='v'+index;
 const fg='f'+index,bg='bg'+index;
 const text=stage+'/'+shot.intent+'.txt';
 fs.writeFileSync(text,shot.title,{flag:'wx',mode:0o600});
 const font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
 if(!fs.existsSync(font))err('font_missing');
 // The entire original frame remains visible. Square and portrait become
 // center stages over blurred imagery FROM THE SAME SOURCE (no invented pixels).
 const base='['+index+':v]trim=start=0:duration='+SHOT_SEC+
  ',setpts=PTS-STARTPTS,fps='+FPS+',split=2['+fg+']['+bg+'];';
 const fill='['+bg+']scale='+OUT_WIDTH+':'+OUT_HEIGHT+
  ':force_original_aspect_ratio=increase:flags=bicubic,crop='+OUT_WIDTH+':'+OUT_HEIGHT+
  ',boxblur=18:2,eq=brightness=-0.12['+bg+'out];';
 const fit='['+fg+']scale='+OUT_WIDTH+':'+OUT_HEIGHT+
  ':force_original_aspect_ratio=decrease:flags=lanczos,setsar=1['+fg+'out];';
 const overlay='['+bg+'out]['+fg+'out]overlay=(W-w)/2:(H-h)/2:format=auto,'+
  'format=yuv420p,drawbox=x=0:y=0:w=iw:h=64:color=black@0.54:t=fill,'+
  'drawtext=fontfile='+font+':textfile='+text+
  ':fontsize=21:fontcolor=white:x=24:y=19:shadowx=2:shadowy=2,'+
  'drawbox=x=0:y=ih-26:w=iw:h=26:color=black@0.64:t=fill,'+
  'drawtext=fontfile='+font+':text=ILLUSTRATIVE\\ 3D\\ -\\ NOT\\ HISTORICAL\\ FOOTAGE'+
  ':fontsize=11:fontcolor=white:x=20:y=h-20['+label+'];';
 return base+fill+fit+overlay;
}
export function produceDirectorStoryboard(request,outDir){
 const {proofs,assets}=verifyDirectorStoryboardSources(request);
 if(typeof outDir!=='string'||!outDir||fs.existsSync(outDir))err('output_exists_or_missing');
 const dest=path.resolve(outDir),tmp=dest+'.partial-'+process.pid;
 if(fs.existsSync(tmp))err('partial_output_exists');
 try{
  fs.mkdirSync(tmp,{recursive:false,mode:0o700});
  const filters=request.shots.map((s,i)=>videoFilter(i,s,tmp));
  filters.push('[v0][v1]xfade=transition=fade:duration='+FADE_SEC+
   ':offset='+(SHOT_SEC-FADE_SEC)+'[first];');
  filters.push('[first][v2]xfade=transition=fade:duration='+FADE_SEC+
   ':offset='+(SHOT_SEC*2-FADE_SEC*2)+'[film]');
  const film=path.join(tmp,'evercraft-director-storyboard.mp4');
  const args=['-hide_banner','-loglevel','error','-y'];
  for(const asset of assets)args.push('-i',asset);
  args.push('-filter_complex',filters.join(''),'-map','[film]','-an',
   '-c:v','libx264','-preset','medium','-crf','20','-pix_fmt','yuv420p',
   '-r',String(FPS),'-movflags','+faststart',film);
  exec('ffmpeg',args);
  const result=probe(film);
  const target=SHOT_SEC*3-FADE_SEC*2;
  if(result.width!==OUT_WIDTH||result.height!==OUT_HEIGHT||
   result.audio||result.codec!=='h264'||Math.abs(result.fps-FPS)>.001||
   Math.abs(result.duration-target)>.07||result.frames<190)
   err('final_mp4_contract_invalid');
  const stills=[];
  for(const [name,t] of [['opening',.8],['closeup',3.9],['final',7.4]]){
   const p=path.join(tmp,name+'.png');
   exec('ffmpeg',['-hide_banner','-loglevel','error','-y','-ss',String(t),
    '-i',film,'-frames:v','1',p]);
   stills.push({name,sha256:hash(fs.readFileSync(p))});
  }
  if(new Set(stills.map(s=>s.sha256)).size!==3)err('visual_story_scenes_not_distinct');
  const output={
   schema:'evercraft.fallen.director-storyboard-receipt.v1',
   id:request.id,
   inputProofs:proofs,
   output:{file:'evercraft-director-storyboard.mp4',sha256:hash(fs.readFileSync(film)),
    durationSec:result.duration,width:result.width,height:result.height,
    fps:result.fps,frames:result.frames,codec:result.codec,audio:false},
   editing:{shotOrder:intents,eachSourceDurationSec:SHOT_SEC,
    transition:'ffmpeg_xfade',transitionDurationSec:FADE_SEC,cutOrCrop:'none',
    sourceAspectHandling:'complete_native_source_over_blurred_same_source_fill',
    titlesFromAuthoredReviewText:true,
    historicalDisclosureBurnedIn:true},
   stills,
   sourceState:'original_world_engine_synthetic_scene',
   creativeApproval:false,clientApproval:false,publicationAuthority:false,
   masterQualityStatus:'internal_low_resolution_review_not_hd_master',
   limitations:['source footage 360-640px only',
    'no licensed soundtrack or approved audio','not a verified historical reconstruction',
    'title safe composition requires independent client-specific design approval']
  };
  fs.writeFileSync(path.join(tmp,'receipt.json'),JSON.stringify(output,null,2)+'\n');
  fs.renameSync(tmp,dest);
  return output;
 }catch(e){fs.rmSync(tmp,{recursive:true,force:true});throw e;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
 try{
  const [requestFile,destination]=process.argv.slice(2);
  if(!requestFile||!destination)err('usage_request_json_new_output_dir');
  const receipt=produceDirectorStoryboard(JSON.parse(fs.readFileSync(requestFile,'utf8')),destination);
  console.log(JSON.stringify({status:'internal_film_rendered',output:receipt.output,publicationAuthority:false}));
 }catch(e){console.error(String(e.message||e));process.exitCode=1;}
}
