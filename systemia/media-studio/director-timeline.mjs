#!/usr/bin/env node
/**
 * Fallen Director Timeline v2. Internal authored edits of verified native
 * World Engine footage; not an image generator or publication pipeline.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const validSha=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const fail=x=>{throw Error('fallen_timeline_'+x);};
const FPS=24,W=640,H=360;
const FORMAT={hero_full:'wide',detail_closeup:'square',title_safe:'vertical'};
const BEATS=new Set(['establishing','detail','action','explanation','closing']);
function run(bin,args,bytes=false){
 const r=spawnSync(bin,args,{encoding:bytes?null:'utf8',timeout:180000,maxBuffer:64*1024*1024});
 if(r.error||r.status!==0)fail(bin+'_failed_'+String(r.error?.message||r.stderr||r.status).slice(-400));
 return r.stdout;
}
function probe(file){
 const d=JSON.parse(run('ffprobe',['-v','error','-show_entries',
 'stream=codec_type,codec_name,width,height,avg_frame_rate,nb_frames:format=duration','-of','json',file]));
 const v=d.streams?.find(x=>x.codec_type==='video');
 const rat=(v?.avg_frame_rate||'0/1').split('/').map(Number),fps=rat[1]?rat[0]/rat[1]:0;
 if(!v||!Number.isInteger(v.width)||!Number.isInteger(v.height)||!Number.isFinite(Number(d.format?.duration)))fail('probe_invalid');
 return {width:v.width,height:v.height,fps,frames:Number(v.nb_frames||0),duration:Number(d.format.duration),
 codec:v.codec_name,audio:d.streams.some(x=>x.codec_type==='audio')};
}
function verifySource(name,s){
 if(!FORMAT[name]||!s||!validSha(s.sha256)||typeof s.path!=='string'||typeof s.receiptPath!=='string')fail('source_invalid_'+name);
 const file=fs.realpathSync(s.path),receiptFile=fs.realpathSync(s.receiptPath);
 const stat=fs.statSync(file);if(stat.size<5000||stat.size>600*1024*1024)fail('source_size_'+name);
 const actual=sha(fs.readFileSync(file));if(s.sha256!==actual)fail('source_sha256_'+name);
 const raw=fs.readFileSync(receiptFile),r=JSON.parse(raw),dir=r.nativeFormat?.shotDirector,p=probe(file);
 if(r.output?.sha256!==actual||r.nativeFormat?.original3dFrames!==true||
 r.nativeFormat?.cropApplied!==false||r.nativeFormat?.format!==FORMAT[name]||
 dir?.schema!=='evercraft.world-engine.director-shot.v1'||dir.intent!==name||
 dir.publicationAuthority!==false||dir.clientApproval!==false||r.publicationAuthority!==false||
 r.sourceState!=='synthetic_visualization'||r.output.audioCodec!==null||
 !validSha(r.worldDigest)||!/^sha256:[a-f0-9]{64}$/.test(r.shaderSha256)||
 !Array.isArray(dir.cameraPlanDigests)||dir.cameraPlanDigests.length<2||
 r.exactGpuReadbackFrames<48||r.uniqueRawFrameDigests<20||p.codec!=='h264'||p.audio||
 Math.abs(p.fps-FPS)>.001||p.frames<48||p.width!==r.output.width||p.height!==r.output.height)
 fail('gpu_proof_'+name);
 if(name==='title_safe'&&(dir.titleSafeClearance?.clearAtAllSamples!==true||dir.titleSafeRegion?.axis!=='right'))fail('title_clearance');
 return {path:file,frames:p.frames,proof:{intent:name,sceneType:r.sceneType,worldDigest:r.worldDigest,
 shaderSha256:r.shaderSha256,videoSha256:actual,receiptSha256:sha(raw),
 renderPlanDigests:dir.cameraPlanDigests,originalGpuReadbackFrames:r.exactGpuReadbackFrames}};
}
export function validateTimeline(req){
 if(req?.schema!=='evercraft.fallen.director-timeline-request.v2')fail('schema');
 if(!/^[a-z0-9][a-z0-9_-]{2,65}$/.test(req.id||''))fail('id');
 if(![15,30,60].includes(req.targetSeconds)||req.audioPolicy!=='silent')fail('runtime_or_audio');
 if(req.sourceClass!=='illustrative_3d'||req.publicationAuthority!==false)fail('source_or_release');
 if(!req.sources||Array.isArray(req.sources)||typeof req.sources!=='object')fail('sources');
 const names=Object.keys(req.sources);if(names.length<2||names.some(n=>!FORMAT[n]))fail('source_set');
 if(!Array.isArray(req.shots)||req.shots.length<4||req.shots.length>24)fail('shot_count');
 const sources=Object.fromEntries(names.map(n=>[n,verifySource(n,req.sources[n])]));
 const counts=new Map();let total=0;
 const shots=req.shots.map((s,i)=>{
  if(!s||!BEATS.has(s.beat)||!sources[s.source]||
    typeof s.title!=='string'||s.title.length<3||s.title.length>65||/[\x00-\x1f\x7f]/.test(s.title)||
    !Number.isInteger(s.frames)||s.frames<24||s.frames>96||
    !Number.isInteger(s.startFrame)||s.startFrame<0||
    !Number.isInteger(s.transitionFrames)||s.transitionFrames<0||s.transitionFrames>12||
    (i===0&&s.transitionFrames!==0)||(i>0&&s.transitionFrames<3))fail('shot_'+i);
  if(s.startFrame+s.frames>sources[s.source].frames)fail('source_too_short_'+i);
  const reused=(counts.get(s.source)||0)>0;
  if(reused&&s.reuseAcknowledged!==true)fail('reuse_unacknowledged_'+i);
  counts.set(s.source,(counts.get(s.source)||0)+1);
  total+=s.frames-s.transitionFrames;
  return {beat:s.beat,source:s.source,title:s.title,startFrame:s.startFrame,
    frames:s.frames,transitionFrames:s.transitionFrames,reuseAcknowledged:reused};
 });
 if(total!==req.targetSeconds*FPS)fail('duration_frames_'+total);
 if(shots[0].beat!=='establishing'||shots.at(-1).beat!=='closing')fail('narrative_bounds');
 return {sources,shots,total};
}
function shotFilter(i,s,folder){
 const a='fg'+i,b='bg'+i,fp=path.join(folder,'title-'+i+'.txt');
 fs.writeFileSync(fp,s.title,{flag:'wx',mode:0o600});
 const font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
 if(!fs.existsSync(font))fail('missing_font');
 return '['+i+':v]trim=start_frame='+s.startFrame+':end_frame='+(s.startFrame+s.frames)+
 ',setpts=PTS-STARTPTS,fps='+FPS+',split=2['+a+']['+b+'];'+
 '['+b+']scale='+W+':'+H+':force_original_aspect_ratio=increase:flags=bicubic,crop='+W+':'+H+
 ',boxblur=18:2,eq=brightness=-0.13[blur'+i+'];'+
 '['+a+']scale='+W+':'+H+':force_original_aspect_ratio=decrease:flags=lanczos,setsar=1[fit'+i+'];'+
 '[blur'+i+'][fit'+i+']overlay=(W-w)/2:(H-h)/2:format=auto,format=yuv420p,'+
 'drawbox=x=0:y=0:w=iw:h=51:color=black@0.55:t=fill,'+
 'drawtext=fontfile='+font+':textfile='+fp+':fontsize=18:fontcolor=white:x=20:y=16:shadowx=1:shadowy=1,'+
 'drawbox=x=0:y=ih-25:w=iw:h=25:color=black@0.72:t=fill,'+
 'drawtext=fontfile='+font+':text=ILLUSTRATIVE\\ 3D\\ -\\ NOT\\ CAPTURED\\ FOOTAGE:fontsize=10:fontcolor=white:x=20:y=h-19,'+
 'setsar=1,format=yuv420p[v'+i+'];';
}
export function produceDirectorTimeline(req,outDir){
 const p=validateTimeline(req);
 if(typeof outDir!=='string'||!outDir||fs.existsSync(outDir))fail('output_exists');
 const dest=path.resolve(outDir),tmp=dest+'.partial-'+process.pid;
 if(fs.existsSync(tmp))fail('partial_exists');
 try{
  fs.mkdirSync(tmp,{recursive:false,mode:0o700});
  const filters=p.shots.map((s,i)=>shotFilter(i,s,tmp));
  let cur='v0',sum=p.shots[0].frames;
  for(let i=1;i<p.shots.length;i++){
   const s=p.shots[i],f=s.transitionFrames,n='join'+i;
   filters.push('['+cur+'][v'+i+']xfade=transition=fade:duration='+(f/FPS)+':offset='+((sum-f)/FPS)+'['+n+'];');
   cur=n;sum+=s.frames-f;
  }
  if(sum!==p.total)fail('compile_frame_mismatch');
  filters[filters.length-1]=filters.at(-1).replace(/;$/,'');
  const movie=path.join(tmp,'evercraft-directed-timeline.mp4');
  const args=['-hide_banner','-loglevel','error','-y'];
  for(const s of p.shots)args.push('-i',p.sources[s.source].path);
  args.push('-filter_complex',filters.join(''),'-map','['+cur+']','-an',
    '-c:v','libx264','-preset','medium','-crf','20','-pix_fmt','yuv420p',
    '-r',String(FPS),'-movflags','+faststart',movie);
  run('ffmpeg',args);
  const m=probe(movie);
  if(m.width!==W||m.height!==H||m.codec!=='h264'||m.audio||
     Math.abs(m.fps-FPS)>.001||m.frames!==p.total||
     Math.abs(m.duration-req.targetSeconds)>.05)fail('encoded_contract');
  const px=run('ffmpeg',['-v','error','-i',movie,
   '-vf','fps=2,scale=80:45,format=gray','-f','rawvideo','-'],true);
  const size=3600,count=px.length/size;let black=0,moving=0,lum=0;
  if(count!==req.targetSeconds*2)fail('decoded_sample_count');
  for(let i=0;i<count;i++){
   let sumPix=0,diff=0;
   for(let j=0;j<size;j++){
    const a=px[i*size+j];sumPix+=a;
    if(i)diff+=Math.abs(a-px[(i-1)*size+j]);
   }
   const mean=sumPix/size;lum+=mean;
   if(mean<12)black++;
   if(i&&diff/size>.30)moving++;
  }
  if(black||moving<Math.floor((count-1)*.55))fail('black_or_freeze_pixels');
  const review=[];let cursor=0;
  for(let i=0;i<p.shots.length;i++){
   const s=p.shots[i];if(i)cursor-=s.transitionFrames;
   const f=cursor+Math.floor(s.frames/2),file=path.join(tmp,'shot-'+String(i+1).padStart(2,'0')+'.png');
   run('ffmpeg',['-v','error','-y','-i',movie,'-vf','select=eq(n\\,'+f+')',
     '-vsync','vfr','-frames:v','1',file]);
   review.push({index:i,beat:s.beat,frame:f,file:path.basename(file),sha256:sha(fs.readFileSync(file))});
   cursor+=s.frames;
  }
  const sourceProofs=Object.fromEntries(Object.keys(p.sources).map(k=>[k,p.sources[k].proof]));
  const receipt={schema:'evercraft.fallen.director-timeline-receipt.v2',id:req.id,
   output:{file:path.basename(movie),sha256:sha(fs.readFileSync(movie)),width:W,height:H,
    fps:FPS,frames:m.frames,durationSec:m.duration,audio:false},
   sourceProofs,shots:p.shots,review,pixelQc:{sampledDecodedFrames:count,movingFramePairs:moving,
    blackFrames:black,averageSampleLuma:Number((lum/count).toFixed(2)),
    status:'technical_motion_gate_only_not_aesthetic_quality'},
   editing:{transition:'frame_accurate_xfade',audio:'silent',
    aspect:'complete_GPU_source_over_blurred_same_source',
    disclosureBurnedIn:true,sourceReuseExplicit:true},
   sourceClass:'illustrative_3d',sourceState:'native_owned_WebGPU_pixels_synthetic_scene',
   creativeApproval:false,clientApproval:false,publicationAuthority:false,
   masterQualityStatus:'internal_640x360_technical_review_not_customer_master',
   limitations:['Source resolution below HD','Explicitly recycled source camera footage',
    'No rights-cleared soundtrack','No independently verified historical accuracy',
    'Pixel motion is not artistic quality']};
  fs.writeFileSync(path.join(tmp,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  fs.renameSync(tmp,dest);return receipt;
 }catch(e){fs.rmSync(tmp,{recursive:true,force:true});throw e;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
 try{const [manifest,out]=process.argv.slice(2);if(!manifest||!out)fail('usage');
  const r=produceDirectorTimeline(JSON.parse(fs.readFileSync(manifest,'utf8')),out);
  console.log(JSON.stringify({status:'technical_film_review_ready',output:r.output,
  pixelQc:r.pixelQc,publicationAuthority:false}));
 }catch(e){console.error(String(e.message||e));process.exitCode=1;}
}
