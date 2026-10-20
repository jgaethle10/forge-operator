import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {battleshipWorld,battleshipGeometry} from './battleship-scene.js';
import {composeNativeBattleshipCamera} from './native-format-camera.js';
import {directWorldEngineShot} from './shot-director.js';
import {compileTeachingCallouts,type TeachingCalloutManifest} from './scene-annotations.js';

const sha=(b:Buffer|string)=>crypto.createHash('sha256').update(b).digest('hex');
const fail=(why:string):never=>{throw Error('world_teaching_film_'+why)};
function run(cmd:string,args:string[],binary=false):string|Buffer{
 const r=spawnSync(cmd,args,{encoding:binary?null:'utf8',maxBuffer:16*1024*1024,timeout:180000});
 if(r.error||r.status!==0)fail(cmd+'_failed_'+String(r.error?.message||(binary?r.stderr.toString():r.stderr)||r.status).slice(-700));
 return r.stdout;
}
function media(file:string){
 const doc=JSON.parse(run('ffprobe',['-v','error','-show_entries',
  'format=duration:stream=codec_type,codec_name,width,height,nb_frames,avg_frame_rate',
  '-of','json',file]) as string);
 const v=doc.streams?.find((x:{codec_type:string})=>x.codec_type==='video');
 if(!v)fail('no_video');
 const fps=(v.avg_frame_rate||'0/1').split('/').map(Number);
 return {width:v.width,height:v.height,frames:Number(v.nb_frames),
  duration:Number(doc.format?.duration),fps:fps[0]/fps[1],codec:v.codec_name,
  audio:doc.streams.some((x:{codec_type:string})=>x.codec_type==='audio')};
}
function frameRgb(file:string,t:number){
 return run('ffmpeg',['-hide_banner','-loglevel','error','-ss',String(t),'-i',file,
 '-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],true) as Buffer;
}
export function produceBattleshipTeachingFilm(input:{sourceVideo:string;sourceReceipt:string;outDir:string}){
 const source=fs.realpathSync(input.sourceVideo),receiptFile=fs.realpathSync(input.sourceReceipt);
 if(fs.existsSync(input.outDir))fail('output_exists');
 const receipt=JSON.parse(fs.readFileSync(receiptFile,'utf8'));
 const sourceSha=sha(fs.readFileSync(source)),probe=media(source);
 if(receipt?.schema!=='evercraft.world-engine.cinematic-pixel-proof.v1'
  ||receipt.output?.sha256!==sourceSha
  ||receipt.sceneType!=='procedural_battleship'
  ||receipt.sourceState!=='synthetic_visualization'
  ||receipt.nativeFormat?.shotDirector?.intent!=='hero_full'
  ||receipt.nativeFormat?.cropApplied!==false
  ||receipt.nativeFormat?.original3dFrames!==true
  ||receipt.publicationAuthority!==false
  ||receipt.soundState!=='silent_at_founder_direction_no_sound_invented'
  ||receipt.exactGpuReadbackFrames!==96
  ||!/^sha256:[a-f0-9]{64}$/.test(receipt.shaderSha256)
  ||probe.width!==640||probe.height!==360||probe.frames!==96
  ||Math.abs(probe.fps-24)>.001||Math.abs(probe.duration-4)>.03||probe.audio)
  fail('signed_gpu_source_mismatch');
 const world=battleshipWorld(),geometries=battleshipGeometry();
 const direct=directWorldEngineShot({world,geometries,viewport:{width:640,height:360},
  take:composeNativeBattleshipCamera('wide').cameraTake,
  intent:'hero_full',hero:{id:'ship-hero',entityIds:['ship-hull','bridge-house','mast-main']}});
 const seq=direct.sequence;
 if(seq.worldDefinitionDigest!==receipt.worldDigest
  ||seq.frames[0].renderPlan.digest!==receipt.firstFramePlanDigest
  ||seq.frames[95].renderPlan.digest!==receipt.lastFramePlanDigest
  ||direct.receipt.cameraPlanDigests.some((d,i)=>
    d!==receipt.nativeFormat.shotDirector.cameraPlanDigests[i]))
  fail('original_camera_provenance_mismatch');
 const manifest:TeachingCalloutManifest={
  schema:'evercraft.world-engine.teaching-callouts.v1',
  sequenceWorldDigest:seq.worldDefinitionDigest,
  authoredByHuman:true,publicationAuthority:false,
  callouts:[
    {id:'modeled-hull',entityId:'ship-hull',label:'Modeled hull and deck structure',
     evidence:'modeled',localAnchor:{x:0,y:1.95,z:9},startSec:.18,endSec:1.30},
    {id:'modeled-turret',entityId:'turret-fore-a',label:'Twin barrels on the forward turret',
     evidence:'modeled',localAnchor:{x:0,y:.6,z:0},startSec:1.33,endSec:2.63},
    {id:'modeled-bridge',entityId:'bridge-house',label:'Modeled bridge and upper deck',
     evidence:'modeled',localAnchor:{x:0,y:.2,z:0},startSec:2.67,endSec:3.95}
  ]
 };
 const annotations=compileTeachingCallouts(seq,manifest);
 for(const item of annotations.receipt.labels){
  if(item.visibleFrames<8||item.changingPositionFrames<1){
   console.error('SCENE_ANCHOR_DIAGNOSTIC',JSON.stringify(item));
   fail('untracked_callout_'+item.calloutId);
  }
 }
 const out=path.resolve(input.outDir),tmp=out+'.partial-'+process.pid;
 if(fs.existsSync(tmp))fail('partial_exists');
 try{
  fs.mkdirSync(tmp,{recursive:false,mode:0o700});
  const ass=path.join(tmp,'tracked-callouts.ass');
  fs.writeFileSync(ass,annotations.ass,{flag:'wx',mode:0o600});
  const video=path.join(tmp,'battleship-tracked-lesson.mp4');
  const esc=ass.replaceAll('\\','\\\\').replaceAll(':','\\:').replaceAll("'","\\'").replaceAll(',','\\,');
  run('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',source,
   '-vf','subtitles='+esc,'-map','0:v:0','-an','-c:v','libx264',
   '-pix_fmt','yuv420p','-preset','medium','-crf','20','-r','24',
   '-movflags','+faststart',video]);
  const rendered=media(video);
  if(rendered.width!==640||rendered.height!==360||rendered.frames!==96||
   rendered.codec!=='h264'||rendered.audio||Math.abs(rendered.duration-4)>.03)
   fail('output_contract_invalid');
  const a=frameRgb(source,.7),b=frameRgb(video,.7);
  if(a.length!==b.length)fail('pixel_array_size_mismatch');
  let changed=0;
  for(let i=0;i<a.length;i+=3){
   if(Math.abs(a[i]-b[i])>18||Math.abs(a[i+1]-b[i+1])>18||
      Math.abs(a[i+2]-b[i+2])>18)changed++;
  }
  if(changed<500)fail('tracked_labels_not_visually_burned_in');
  const stills=[];
  for(const [name,time] of [['hull',.7],['turret',2.0],['bridge',3.45]] as const){
   const file=path.join(tmp,name+'.png');
   run('ffmpeg',['-hide_banner','-loglevel','error','-y','-ss',
    String(time),'-i',video,'-frames:v','1',file]);
   stills.push({name,sha256:sha(fs.readFileSync(file))});
  }
  if(new Set(stills.map(x=>x.sha256)).size!==3)fail('identical_stills');
  const proof={
   schema:'evercraft.world-engine.teaching-video-proof.v1',
   sourceVideoSha256:sourceSha,sourceReceiptSha256:sha(fs.readFileSync(receiptFile)),
   sourceWorldDigest:seq.worldDefinitionDigest,
   anchoredCalloutReceipt:annotations.receipt,
   sceneEvidenceType:'modeled_not_observed',
   film:{file:path.basename(video),sha256:sha(fs.readFileSync(video)),
    frames:rendered.frames,durationSec:rendered.duration,width:rendered.width,
    height:rendered.height,audio:false,changedPixelsAt07s:changed},
   stills,claimState:'no_verified_historical_facts',
   technicalState:'signed_3d_projection_and_burned_in_pixels',
   humanCreativeReviewRequired:true,clientApproval:false,publicationAuthority:false
  };
  fs.writeFileSync(path.join(tmp,'receipt.json'),JSON.stringify(proof,null,2)+'\n');
  fs.renameSync(tmp,out);
  return proof;
 }catch(e){fs.rmSync(tmp,{recursive:true,force:true});throw e;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
 try{
  const [sourceVideo,sourceReceipt,outDir]=process.argv.slice(2);
  if(!sourceVideo||!sourceReceipt||!outDir)fail('usage_video_receipt_output');
  const r=produceBattleshipTeachingFilm({sourceVideo,sourceReceipt,outDir});
  console.log(JSON.stringify({status:'real_tracked_teaching_film',film:r.film,
   labels:r.anchoredCalloutReceipt.labels,publicationAuthority:false}));
 }catch(e){console.error(String(e));process.exitCode=1;}
}
