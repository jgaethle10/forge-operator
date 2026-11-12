#!/usr/bin/env node
// Documentary cinematic review gate. Objective signals + authenticated editorial review; NOT automated taste.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const CINEMATIC_SCHEMA='evercraft.fallen.documentary-cinematic-input.v1';
export const CINEMATIC_RECEIPT_SCHEMA='evercraft.fallen.documentary-cinematic-receipt.v1';
const SHA=/^[a-f0-9]{64}$/i;
const REAL_KINDS=new Set(['original_camera','licensed_archival_video']);
const VIDEO_SCALES=new Set(['wide','medium','detail','moving_follow','interview']);
const ROLES=new Set(['orientation','observation','human','evidence','consequence','reflection']);
const TYPES=new Set(['footage','map','title','graphic','still']);
const nonempty=v=>typeof v==='string'&&v.trim().length>0;
const round=(v,n=5)=>Number(v.toFixed(n));
function execute(binary,args,opts={}){
  const out=spawnSync(binary,args,{encoding:opts.encoding===undefined?'utf8':opts.encoding,maxBuffer:64*1024*1024,timeout:120000});
  if(out.error||out.status!==0)throw new Error(binary+'_inspection_failed');
  return out.stdout;
}
function sha256(file){
  const hash=crypto.createHash('sha256'),fd=fs.openSync(file,'r'),chunk=Buffer.allocUnsafe(1048576);
  try{for(;;){const n=fs.readSync(fd,chunk,0,chunk.length,null);if(!n)break;hash.update(chunk.subarray(0,n));}}
  finally{fs.closeSync(fd);}
  return hash.digest('hex');
}
const quantile=(values,f)=>values.length?values[Math.floor((values.length-1)*f)]:null;

// Motion measurement is an editorial review signal. Slow scenes can be intentional.
// Motion by itself NEVER establishes visual truth, source rights or cinematic quality.
export function inspectDocumentaryDynamics(masterPath,{sampleFps=1,width=64,height=36}={}){
  const file=path.resolve(masterPath);
  if(!fs.existsSync(file)||!fs.statSync(file).isFile())throw new Error('master_missing');
  if(sampleFps!==1||width!==64||height!==36)throw new Error('unsupported_sampling_policy');
  const probe=JSON.parse(execute('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file]));
  const video=(probe.streams||[]).filter(s=>s.codec_type==='video');
  const duration=Number(probe.format?.duration);
  if(video.length!==1||!Number.isFinite(duration)||duration<=0||duration>90)throw new Error('unsupported_master_duration_or_video_streams');
  const frames=execute('ffmpeg',['-nostdin','-hide_banner','-v','error','-i',file,'-map','0:v:0',
    '-vf','fps='+sampleFps+',scale='+width+':'+height+':flags=area,format=gray',
    '-frames:v','90','-f','rawvideo','-pix_fmt','gray','pipe:1'],{encoding:null});
  const frameBytes=width*height;
  if(!Buffer.isBuffer(frames)||frames.length%frameBytes||frames.length<3*frameBytes)throw new Error('decoded_frame_sample_invalid');
  const count=frames.length/frameBytes,changes=[],blank=[];
  for(let i=0;i<count;i++){
    let sum=0,square=0,difference=0;
    const start=i*frameBytes,previous=(i-1)*frameBytes;
    for(let j=0;j<frameBytes;j++){
      const v=frames[start+j];sum+=v;square+=v*v;
      if(i>0)difference+=Math.abs(v-frames[previous+j]);
    }
    const avg=sum/frameBytes,variance=square/frameBytes-avg*avg;
    blank.push(avg<4&&variance<4);
    if(i>0)changes.push(difference/(frameBytes*255));
  }
  const ordered=changes.toSorted((a,b)=>a-b);
  return{
    masterSha256:sha256(file),durationSec:round(duration,3),framesSampled:count,
    medianLumaDifference:round(quantile(ordered,.5)),p75LumaDifference:round(quantile(ordered,.75)),
    lowMotionFraction:round(changes.filter(x=>x<.025).length/changes.length),
    nearlyBlankFrameFraction:round(blank.filter(Boolean).length/count),
    objectiveOnly:true,method:'ffmpeg 1fps 64x36 grayscale mean absolute luma difference'
  };
}

export function assessDocumentaryCinematic(input,observed){
  const blockers=[],reviewFlags=[],need=(ok,reason)=>{if(!ok)blockers.push(reason);};
  need(input?.schema===CINEMATIC_SCHEMA,'schema_invalid');
  need(SHA.test(observed?.masterSha256||'')&&observed.masterSha256===input?.expectedMasterSha256,'master_digest_invalid_or_mismatch');
  const duration=observed?.durationSec;
  need(Number.isFinite(duration)&&duration>=15&&duration<=90,'master_duration_invalid');
  const shots=Array.isArray(input?.shots)?input.shots:[];
  const sources=Array.isArray(input?.sources)?input.sources:[];
  need(shots.length>=6&&shots.length<=60,'shot_count_insufficient_or_excessive');
  need(sources.length>0&&sources.length<=60,'source_count_invalid');
  const sourceIds=new Set(),sourceHashes=new Set(),sourceById=new Map();
  for(const source of sources){
    const id=source?.id;
    need(nonempty(id)&&!sourceIds.has(id),'source_id_invalid_or_duplicate');
    if(!nonempty(id))continue;
    sourceIds.add(id);sourceById.set(id,source);
    if(REAL_KINDS.has(source.kind)){
      need(SHA.test(source.sha256||''),'source_digest_missing:'+id);
      need(!sourceHashes.has(source.sha256),'source_digest_reused_under_multiple_ids:'+id);
      if(SHA.test(source.sha256||''))sourceHashes.add(source.sha256);
      need(source.independentlyVerified===true&&nonempty(source.rightsReviewRef)&&
        nonempty(source.privacyReviewRef)&&nonempty(source.sourceOriginRef),'source_evidence_missing:'+id);
    }
  }
  const shotIds=new Set(),scaleSet=new Set(),roleSet=new Set(),footageIds=new Set();
  let footageSeconds=0,titleSeconds=0,footageShots=0,cursor=0;
  for(const shot of shots){
    const id=shot?.id;
    need(nonempty(id)&&!shotIds.has(id),'shot_id_invalid_or_duplicate');
    if(!nonempty(id))continue;
    shotIds.add(id);
    need(TYPES.has(shot.type),'shot_type_invalid:'+id);
    need(ROLES.has(shot.narrativeRole),'narrative_role_invalid:'+id);
    if(ROLES.has(shot.narrativeRole))roleSet.add(shot.narrativeRole);
    const start=shot.startSec,length=shot.durationSec;
    need(Number.isFinite(start)&&Number.isFinite(length)&&length>0,'shot_time_invalid:'+id);
    if(!Number.isFinite(start)||!Number.isFinite(length)||length<=0)continue;
    need(Math.abs(start-cursor)<=.1,'timeline_gap_or_overlap:'+id);
    cursor=start+length;
    if(shot.type==='footage'){
      footageShots++;
      const source=sourceById.get(shot.sourceId);
      need(Boolean(source&&REAL_KINDS.has(source.kind)),'footage_not_authorized_real_video:'+id);
      need(VIDEO_SCALES.has(shot.shotScale),'shot_scale_missing:'+id);
      if(VIDEO_SCALES.has(shot.shotScale))scaleSet.add(shot.shotScale);
      if(source&&REAL_KINDS.has(source.kind)){footageIds.add(shot.sourceId);footageSeconds+=length;}
    }else if(shot.type==='title')titleSeconds+=length;
    else if(shot.type==='map'||shot.type==='still')need(nonempty(shot.sourceRef),'graphic_or_still_source_ref_missing:'+id);
  }
  need(Number.isFinite(duration)&&Math.abs(cursor-duration)<=.25,'timeline_duration_mismatch');
  const realFraction=duration>0?footageSeconds/duration:0;
  const titleFraction=duration>0?titleSeconds/duration:1;
  need(realFraction>=.6,'original_or_licensed_video_coverage_below_60_percent');
  need(titleFraction<=.2,'title_card_coverage_above_20_percent');
  need(footageShots>=5,'footage_shot_count_insufficient');
  need(footageIds.size>=3,'distinct_real_video_sources_insufficient');
  need(scaleSet.size>=2,'shot_scale_variety_insufficient');
  need(roleSet.size>=3,'narrative_progression_insufficient');
  if(observed?.medianLumaDifference<.012&&observed?.lowMotionFraction>.8)reviewFlags.push('suspected_static_or_repetitive_visuals');
  if(observed?.nearlyBlankFrameFraction>.1)reviewFlags.push('possible_blank_screen_intervals');
  const review=input?.creativeReview||{};
  if(review.status==='rejected'||input?.founderDecision==='rejected')blockers.push('creative_rejection_is_binding');
  const signed=review.status==='approved'&&nonempty(review.reviewedBy)&&
    nonempty(review.reviewEvidenceRef)&&review.masterSha256===observed?.masterSha256;
  const exception=input?.motionException||{};
  const motionReviewed=reviewFlags.length===0||(signed&&exception.approved===true&&
    nonempty(exception.evidenceRef)&&nonempty(exception.reason)&&
    exception.masterSha256===observed?.masterSha256);
  const uniqueBlockers=[...new Set(blockers)];
  const status=uniqueBlockers.length?'rejected':!signed||!motionReviewed?'review_required':'approved_for_private_editorial_preview';
  return{
    schema:CINEMATIC_RECEIPT_SCHEMA,status,blockers:uniqueBlockers,reviewFlags,
    measurements:{durationSec:duration,verifiedFootageFraction:round(realFraction),titleFraction:round(titleFraction),
      footageShotCount:footageShots,distinctRealVideoSources:footageIds.size,
      shotScaleCount:scaleSet.size,narrativeRoleCount:roleSet.size,
      medianLumaDifference:observed?.medianLumaDifference,lowMotionFraction:observed?.lowMotionFraction},
    masterSha256:observed?.masterSha256||null,
    boundaries:{photoMontageIsNotRealVideo:true,selfDeclaredRightsMustBeAudited:true,
      visualMetricsDoNotProveCinematicQuality:true,humanCreativeApprovalRequired:true,
      footageAndRightsCannotBeOverriddenByMotionException:true,
      clientApprovalGranted:false,paymentAuthorityGranted:false,publicationAuthorityGranted:false}
  };
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [master,manifestFile,receiptFile]=process.argv.slice(2);
  if(!master||!manifestFile||!receiptFile){
    console.error('Usage: node documentary-cinematic-gate.mjs <master.mp4> <private-story-manifest.json> <private-receipt.json>');
    process.exitCode=1;
  }else{
    try{
      const input=JSON.parse(fs.readFileSync(path.resolve(manifestFile),'utf8'));
      const result=assessDocumentaryCinematic(input,inspectDocumentaryDynamics(master));
      const target=path.resolve(receiptFile);
      fs.mkdirSync(path.dirname(target),{recursive:true});
      fs.writeFileSync(target,JSON.stringify(result,null,2)+'\n',{mode:0o600});
      console.log('Documentary cinematic gate: '+result.status);
      if(result.status!=='approved_for_private_editorial_preview')process.exitCode=2;
    }catch(error){console.error('Documentary cinematic inspection failed: '+(error?.message||'unknown'));process.exitCode=1;}
  }
}
