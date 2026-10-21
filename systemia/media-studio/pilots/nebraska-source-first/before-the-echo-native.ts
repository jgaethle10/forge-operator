import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {makeTimelineProject} from '../../timeline.js';
import {buildTimelineExportPlan,renderTimelineExport} from '../../timeline-export.js';

type Scene={id:string;source:'reel'|'photo';sourceStartSec:number;durationSec:number;storyFunction:string;dateAttribution:string};
type MapInput={schema:string;id:string;workingTitle:string;sourceReel:{bytes:number;sha256:string;url:string;probableDating:string;recordedContemporaneousAudio:boolean};sourcePhoto:{sha1:string;url:string;recordId:string;date:string};shots:Scene[];audio:Record<string,string>;production:{reviewOnly:boolean;writtenArchivePublicationPermissionObtained:boolean;founderApproved:boolean;publicationAuthorityGranted:boolean}};
const sha=(file:string,alg='sha256')=>crypto.createHash(alg).update(fs.readFileSync(file)).digest('hex');
const run=(bin:string,args:string[],timeout=240000)=>{
 const r=spawnSync(bin,args,{encoding:'utf8',timeout,maxBuffer:1024*1024*6});
 if(r.error||r.status!==0)throw Error(bin+'_failed:'+String(r.stderr||r.error?.message||r.status).slice(-850));
 return String(r.stdout||'');
};
const probe=(file:string)=>JSON.parse(run('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file],60000));
export function validateBeforeEcho(map:MapInput){
 const errors:string[]=[];
 if(map?.schema!=='evercraft.fallen.nebraska-observational-scene-map.v1')errors.push('schema_invalid');
 if(map?.sourceReel?.sha256!=='3156cd2202c8c3189dc563994688fb0f49231c9d78b6645287b535e53347f517')errors.push('reel_source_identity_changed');
 if(map?.sourcePhoto?.sha1!=='8476a2db33115d25a2fc0a60ea8618dea3795209')errors.push('nara_source_identity_changed');
 if(map?.sourceReel?.recordedContemporaneousAudio!==false||map?.audio?.music!=='none'||map?.audio?.voice!=='none'||map?.audio?.syntheticCrowd!=='none')errors.push('invented_or_unknown_historical_audio');
 if(map?.production?.reviewOnly!==true||map?.production?.writtenArchivePublicationPermissionObtained!==false||map?.production?.founderApproved!==false||map?.production?.publicationAuthorityGranted!==false)errors.push('premature_publishing_claim');
 const shots=Array.isArray(map?.shots)?map.shots:[];
 if(shots.length!==5||shots.map(s=>s.id).join('|')!=='crowd|field|play|team|crowd1973')errors.push('shot_continuity_changed');
 let total=0,photoCount=0;
 for(const shot of shots){
  if(!Number.isFinite(shot.durationSec)||shot.durationSec<=0||!Number.isFinite(shot.sourceStartSec)||shot.sourceStartSec<0)errors.push('shot_time_invalid:'+shot.id);
  if(shot.source==='reel'&&shot.sourceStartSec+shot.durationSec>250.116533)errors.push('reel_cut_overruns_original:'+shot.id);
  if(shot.source==='photo')photoCount++;
  if(!shot.storyFunction?.trim()||!shot.dateAttribution?.trim())errors.push('shot_has_no_editorial_reason:'+shot.id);
  total+=shot.durationSec||0;
 }
 if(Math.abs(total-50)>.001||photoCount!==1||shots[4]?.source!=='photo')errors.push('fifty_second_archive_structure_changed');
 if(shots[2]?.sourceStartSec!==34.5||shots[2]?.durationSec!==19)errors.push('forward_pass_scene_not_held');
 if(shots[3]?.dateAttribution!=='early football, exact year uncertain')errors.push('later_football_segment_falsely_dated');
 return {ok:!errors.length,errors,totalSec:total,shots:shots.length};
}
function sourceBytes(file:string,expected:string,algorithm='sha256',expectedSize?:number){
 if(!fs.existsSync(file)||!fs.statSync(file).size)throw Error('original_media_not_downloaded');
 if(expectedSize&&fs.statSync(file).size!==expectedSize)throw Error('original_media_byte_length_changed');
 if(sha(file,algorithm)!==expected)throw Error('original_media_digest_changed');
}
export function renderBeforeEchoNative(outputDir:string,sceneFile:string){
 const map=JSON.parse(fs.readFileSync(sceneFile,'utf8')) as MapInput;
 const checked=validateBeforeEcho(map);if(!checked.ok)throw Error('source_first_edit_plan_rejected:'+checked.errors.join(','));
 fs.mkdirSync(outputDir,{recursive:true});
 const reel=path.join(outputDir,'history-nebraska-RG6137.MI-original');
 const photo=path.join(outputDir,'NARA-547323-original.jpg');
 run('curl',['--fail','--location','--silent','--show-error','--max-time','240','--retry','2',
  '--output',reel,map.sourceReel.url],260000);
 sourceBytes(reel,map.sourceReel.sha256,'sha256',map.sourceReel.bytes);
 const sourceProbe=probe(reel);
 if(Math.abs(Number(sourceProbe.format.duration)-250.116533)>.12)throw Error('source_reel_runtime_changed');
 run('curl',['--fail','--location','--silent','--show-error','--max-time','90','--retry','2',
  '--output',photo,map.sourcePhoto.url],120000);
 sourceBytes(photo,map.sourcePhoto.sha1,'sha1');
 const assets:any[]=[];const clips:any[]=[];
 let position=0;
 for(let i=0;i<map.shots.length;i++){
  const shot=map.shots[i],id='scene-'+shot.id;
  const framed=path.join(outputDir,id+(shot.source==='photo'?'.png':'.mp4'));
  if(shot.source==='reel'){
   run('ffmpeg',['-y','-v','error','-ss',String(shot.sourceStartSec),'-t',String(shot.durationSec),
    '-i',reel,'-vf','fps=24,deflicker=size=5:mode=am,eq=contrast=1.07:brightness=0.005:gamma=1.03,scale=1280:720:force_original_aspect_ratio=decrease:flags=lanczos,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,format=yuv420p',
    '-an','-c:v','libx264','-preset','veryfast','-crf','19','-pix_fmt','yuv420p',framed],180000);
  }else{
   const font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
   if(!fs.existsSync(font))throw Error('archive_provenance_label_font_missing');
   run('ffmpeg',['-y','-v','error','-i',photo,'-vf',
    'scale=1280:720:force_original_aspect_ratio=decrease:flags=lanczos,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x131114,drawtext=fontfile='+font+':text=LINCOLN / MAY 1973:fontcolor=0xdedbd6:fontsize=19:x=24:y=663',
    '-frames:v','1',framed],90000);
  }
  assets.push({id,path:framed,kind:shot.source==='photo'?'image':'video',digest:sha(framed),
   sourceRefs:[shot.source==='photo'?map.sourcePhoto.url:map.sourceReel.url,
    shot.source==='photo'?'NARA-547323':'History-Nebraska-RG6137.MI',
    'event-date:'+shot.dateAttribution,'scene-intent:'+shot.storyFunction],
   evidenceState:'public_source'});
  clips.push({id:'clip-'+shot.id,trackId:'picture',assetId:id,startSec:position,durationSec:shot.durationSec});
  position+=shot.durationSec;
 }
 const project=makeTimelineProject({
  id:map.id,title:map.workingTitle,aspectRatio:'16:9',fps:24,assets,
  tracks:[{id:'picture',kind:'video',name:'Actual historical source pixels',clips}]
 });
 const master=path.join(outputDir,'Evercraft_Nebraska_Before_The_Echo_Native_RC08.mp4');
 const plan=buildTimelineExportPlan({project,outputPath:master});
 if(plan.audioClipIds.length!==0||plan.durationSec!==50||plan.visualClipIds.length!==5||
    plan.boundaries.publicationAuthorityGranted!==false)throw Error('native_timeline_footage_contract_broken');
 const receipt=renderTimelineExport({project,outputPath:master});
 const final=probe(master);
 const v=final.streams.find((s:any)=>s.codec_type==='video');
 const audio=final.streams.find((s:any)=>s.codec_type==='audio');
 if(v?.codec_name!=='h264'||v.width!==1920||v.height!==1080||audio||Math.abs(Number(final.format.duration)-50)>.25)
  throw Error('historical_visual_master_wrong_codec_duration_or_silence');
 run('ffmpeg',['-v','error','-xerror','-i',master,'-f','null','-'],160000);
 const stills:any[]=[];
 for(const sec of [3,13,24,38,47]){
  const imageFile=path.join(outputDir,'review-'+sec+'.jpg');
  run('ffmpeg',['-y','-v','error','-ss',String(sec),'-i',master,'-frames:v','1',imageFile],30000);
  stills.push({second:sec,filename:path.basename(imageFile),sha256:sha(imageFile)});
 }
 const report={
  schema:'evercraft.fallen.observed-nebraska-archive-scene.v1',status:'native_source_authenticated_private_creative_review',
  sourceReel:{sha256:sha(reel),bytes:fs.statSync(reel).size},
  sourcePhoto:{sha1:sha(photo,'sha1'),recordId:'NARA 547323'},
  output:{sha256:sha(master),bytes:fs.statSync(master).size,durationSec:Number(final.format.duration),videoCodec:v.codec_name,
   audioCodec:null,fullDecodePassed:true,shots:stills},
  timelineProject:project,exportReceipt:receipt,
  claims:{historicalGameYearProven:false,laterSegmentGameYearProven:false,
   currentFootballGameFootage:false,realRecordedHistoricSound:false,
   syntheticMotionUsed:false,founderApproved:false,publicationAuthorityGranted:false},
  humanGates:{HistoryNebraskaWrittenPublicationPermission:'pending',internationalRightsReview:'pending',
   originalImageAttribution:'review_pending',creativeApproval:'pending'}
 };
 fs.writeFileSync(path.join(outputDir,'receipt.json'),JSON.stringify(report,null,2)+'\n');
 return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
 try{
  const [sceneFile,outDir]=process.argv.slice(2);
  if(!sceneFile||!outDir)throw Error('Usage: node --import tsx before-the-echo-native.ts <scene-map.json> <outputdir>');
  const result=renderBeforeEchoNative(outDir,sceneFile);
  console.log(JSON.stringify({status:result.status,master:result.output.sha256,duration:result.output.durationSec,visuals:result.timelineProject.tracks[0].clips.length}));
 }catch(e){console.error(String(e));process.exitCode=1;}
}
