/**
 * Native Fallen Studio film proof for original, recorded Nebraska scenery.
 * Uses the merged editable FallenTimelineProject and renderTimelineExport.
 * NOT a football documentary, release, 2026 game scene, or source rights grant.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {makeTimelineProject, type FallenTimelineProject, type TimelineAsset} from '../../timeline.js';
import {buildTimelineExportPlan, renderTimelineExport} from '../../timeline-export.js';

const hash=(p:string)=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const source=(p:string)=>JSON.parse(fs.readFileSync(p,'utf8'));
const SKY_SHA1='d7fb114b1d2e9b0b12556950e0c45b6797f947ac';
const LATHE_SHA1='2858bfee9858dda6dc184222991e6e742681e3e9';
const SKY_URL='https://commons.wikimedia.org/wiki/File:August_2011_sky_in_Lincoln,_Nebraska.webm';
const LATHE_URL='https://commons.wikimedia.org/wiki/File:Kregel_Windmill_Factory_Museum_Turret_Lathe_2.webm';

function probe(file:string){
 const r=spawnSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file],{encoding:'utf8'});
 if(r.status!==0)throw Error('native_footage_ffprobe_invalid:'+r.stderr);
 return JSON.parse(r.stdout);
}
function verifySource(file:string,requiresAudio=true){
 if(!fs.existsSync(file)||!fs.statSync(file).size)throw Error('native_footage_bytes_missing:'+file);
 const data=probe(file);
 const streams=data.streams??[];
 if(!streams.some((s:any)=>s.codec_type==='video'))throw Error('native_source_video_missing');
 if(requiresAudio&&!streams.some((s:any)=>s.codec_type==='audio'))throw Error('native_source_recorded_audio_missing');
 return data;
}
export function createNativeFallenStudyProject(outdir:string):{
 project:FallenTimelineProject;inputReceipt:any;skyFile:string;latheFile:string;
}{
 const incoming=source(path.join(outdir,'receipt.json'));
 if(incoming.schema!=='evercraft.fallen.real-motion-contrast.v1'
  ||incoming.publicationAuthorityGranted!==false
  ||incoming.isNebraskaGameFootage!==false
  ||incoming.sources?.[0]?.originalSha1!==SKY_SHA1
  ||incoming.sources?.[1]?.originalSha1!==LATHE_SHA1) throw Error('native_source_provenance_mismatch');
 const skyFile=path.join(outdir,'sky','Lincoln_2011_Genuine_Archive_Study_8s.mp4');
 const latheFile=path.join(outdir,'Kregel_2026_original.webm');
 const skyProbe=verifySource(skyFile),latheProbe=verifySource(latheFile);
 if(Number(skyProbe.format.duration)<7.99||Number(latheProbe.format.duration)<3.84)throw Error('native_footage_duration_invalid');
 const assets:TimelineAsset[]=[
  {id:'lincoln-sky-2011',path:skyFile,digest:hash(skyFile),kind:'video',
   sourceRefs:[SKY_URL,'source-original-sha1:'+SKY_SHA1,'caption:Lincoln Nebraska August 2011'],
   evidenceState:'public_source'},
  {id:'nebraska-city-lathe-2026',path:latheFile,digest:hash(latheFile),kind:'video',
   sourceRefs:[LATHE_URL,'source-original-sha1:'+LATHE_SHA1,'caption:Nebraska City April 2026'],
   evidenceState:'public_source'},
 ];
 const project=makeTimelineProject({
  id:'nebraska-real-observed-motion-native-fallen-rc02',
  title:'Evercraft original-source cinema: real Nebraska sky to workshop',
  aspectRatio:'16:9',fps:24,assets,
  audioMaster:{targetLufs:-16,truePeakDb:-1.5,lra:9,dialogueDucking:false,sampleRate:48000},
  tracks:[
   {id:'picture',kind:'video',name:'Observed captured picture',clips:[
    {id:'sky-shot',trackId:'picture',assetId:assets[0].id,startSec:0,durationSec:8,label:'Lincoln 2011 original archive'},
    {id:'workshop-shot',trackId:'picture',assetId:assets[1].id,startSec:8,durationSec:3.44,trimStartSec:.4,
     label:'Nebraska City 2026 original archive'},
   ]},
   {id:'sfx',kind:'sfx',name:'Authentic captured microphone sound (NOT designed Foley)',clips:[
    {id:'sky-recorded-audio',trackId:'sfx',assetId:assets[0].id,startSec:0,durationSec:7.6,volume:1,
     label:'genuine Lincoln microphone original'},
    {id:'workshop-recorded-audio-jcut',trackId:'sfx',assetId:assets[1].id,startSec:7.6,durationSec:3.84,volume:1,
     label:'genuine Nebraska City microphone starts .4 sec before scene cut'},
   ]},
  ],
 });
 const plan=buildTimelineExportPlan({project,outputPath:path.join(outdir,'Evercraft_Native_Fallen_Real_Source_Study_RC02.mp4')});
 assert.deepEqual(plan.visualClipIds,['sky-shot','workshop-shot']);
 assert.deepEqual(plan.audioClipIds,['sky-recorded-audio','workshop-recorded-audio-jcut']);
 assert.equal(plan.durationSec,11.44);
 assert.equal(plan.boundaries.publicationAuthorityGranted,false);
 assert.equal(plan.audioMaster.sampleRate,48000);
 return {project,inputReceipt:incoming,skyFile,latheFile};
}
/** Measured decoded PCM energy. This does not constitute a human sound-quality review. */
function audioWindow(master:string,startSec:number,durationSec:number){
 const r=spawnSync('ffmpeg',['-v','error','-ss',String(startSec),'-t',String(durationSec),
  '-i',master,'-vn','-ac','2','-ar','48000','-f','f32le','pipe:1'],
  {encoding:null,maxBuffer:4*1024*1024,timeout:90000});
 const pcm=Buffer.isBuffer(r.stdout)?r.stdout:Buffer.from(r.stdout);
 if(r.status!==0||pcm.length<16000)throw Error('native_sound_window_decode_missing:'+startSec);
 let sum=0,peak=0,count=0;
 for(let i=0;i+4<=pcm.length;i+=4){
  const v=pcm.readFloatLE(i);
  if(!Number.isFinite(v))throw Error('native_audio_nan');
  sum+=v*v;peak=Math.max(peak,Math.abs(v));count++;
 }
 return {startSec,durationSec,rms:Number(Math.sqrt(sum/count).toFixed(6)),
   peak:Number(peak.toFixed(6)),samples:count};
}

export function runNativeFallenStudy(outdir:string){
 const {project,inputReceipt,skyFile,latheFile}=createNativeFallenStudyProject(outdir);
 const master=path.join(outdir,'Evercraft_Native_Fallen_Real_Source_Study_RC02.mp4');
 const receipt=renderTimelineExport({project,outputPath:master});
 if(receipt.videoCodec!=='h264'||receipt.audioCodec!=='aac'||receipt.width!==1920||receipt.height!==1080
  ||Math.abs(receipt.durationSec-11.44)>.14)throw Error('native_merged_export_codec_or_duration_mismatch');
 const decode=spawnSync('ffmpeg',['-v','error','-xerror','-i',master,'-map','0:v:0','-map','0:a:0','-f','null','-'],
  {encoding:'utf8',timeout:180000});
 if(decode.status!==0)throw Error('native_master_full_decode_failed:'+String(decode.stderr).slice(-600));
 const soundWindows=[
  audioWindow(master,2,0.5),
  audioWindow(master,7.67,0.26), // real machine sound before the picture cut
  audioWindow(master,8.35,0.5),  // real machine sound after the picture cut
  audioWindow(master,10.1,0.5)
 ];
 for(const window of soundWindows){
  if(window.rms<0.001||window.peak<0.006){
   throw Error('native_fallen_audio_dropped_at_'+window.startSec+'s:rms='+window.rms);
  }
 }
 const reviewed={
  schema:'evercraft.fallen.native-real-source-receipt.v1',status:'native_timeline_media_technical_proof_only',
  nativeExporter:'systemia/media-studio/timeline-export.ts',nativeProject:'evercraft.fallen.timeline.v1',
  nativeReceipt:receipt,
  verifiedAudioSignalWindows:soundWindows,
  independentSourceBinds:{
   skySourceSha1:SKY_SHA1,latheSourceSha1:LATHE_SHA1,
   skyInputSha256:hash(skyFile),latheInputSha256:hash(latheFile),
   comparisonExternalMasterSha256:inputReceipt.master.sha256
  },
  creative:{hasMusic:false,hasSyntheticSpeech:false,hasSyntheticFoley:false,
   recordedMicrophonesPreserved:true,authenticSoundPrelapSeconds:.4,
   sourceEventIsNebraskaFootball:false,founderCreativeApproval:false},
  boundaries:{sourceAttributionAndShareAlikeReviewNeeded:true,real2026GameMaterial:false,
   realFanInterview:false,realPhonePlaybackObserved:false,sourceAudioActuallyListened:false,
   footageClarityReviewed:false,publicReleaseAllowed:false,publicationAuthorityGranted:false}
 };
 fs.writeFileSync(path.join(outdir,'native-fallen-project.json'),JSON.stringify(project,null,2)+'\n');
 fs.writeFileSync(path.join(outdir,'native-fallen-receipt.json'),JSON.stringify(reviewed,null,2)+'\n');
 return reviewed;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
 try{
  if(!process.argv[2])throw Error('Usage: node --import tsx native-fallen-source-proof.ts <previous-two-source-folder>');
  const result=runNativeFallenStudy(process.argv[2]);
  console.log(JSON.stringify({status:result.status,sha256:result.nativeReceipt.sha256,
   resolution:[result.nativeReceipt.width,result.nativeReceipt.height],
   duration:result.nativeReceipt.durationSec,sourceBinds:result.independentSourceBinds}));
 }catch(e){console.error(String(e));process.exitCode=1;}
}
