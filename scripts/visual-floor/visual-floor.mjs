#!/usr/bin/env node
/** Evercraft Visual Floor: actual-media technical proof + independent creative admission. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const SCHEMA='evercraft.visual-floor.v1';
export const AXES=['composition','intentional_motion','material_and_lighting','typography_and_hierarchy','product_truth','story_and_pacing','brand_originality'];
export const PROFILES=Object.freeze({
  cinematic_fx:{audio:false},product_commercial:{audio:true},data_intelligence:{audio:true},
  product_ui:{audio:true},documentary:{audio:true},family_animation:{audio:true}
});
export const FLOOR=Object.freeze({minimumFps:24,minAxis:4,minMean:4.5,minReviewers:2,minBeats:3,landscape:[1920,1080],portrait:[1080,1920]});
const sha256=value=>crypto.createHash('sha256').update(value).digest('hex');
const validPositive=value=>Number.isInteger(value)&&value>0;

export function planFloor({assetId,profile='product_commercial',target,beats,truth='synthetic'}){
  if(!PROFILES[profile])throw Error('floor_profile_unknown');
  if(!assetId||typeof assetId!=='string')throw Error('floor_asset_missing');
  if(!Array.isArray(beats)||beats.length<FLOOR.minBeats)throw Error('floor_beats_missing');
  if(new Set(beats.map(x=>x.id)).size!==beats.length||beats.some(x=>!x.id||!x.intent||!x.visualProof))throw Error('floor_beats_invalid');
  if(!validPositive(target?.width)||!validPositive(target?.height)||!validPositive(target?.fps)||!Number.isFinite(target.durationSec)||target.durationSec<=0)throw Error('floor_target_invalid');
  const core={schema:'evercraft.visual-floor.work-order.v1',assetId,profile,target,truth,beats,
    creativeRequirements:[
      'purposeful_story_before_visual_decoration','original_design_no_reference_asset_copying',
      'physically_motivated_camera_and_lighting','readable_type_and_interface_hierarchy',
      'truthful_product_capture_or_labeled_simulation','deliberate_shot_pacing','approved_audio_for_commercial_work'
    ],
    axisNames:AXES,minimumAxisScore:FLOOR.minAxis,minimumMeanScore:FLOOR.minMean,
    requiredIndependentReviewers:FLOOR.minReviewers,
    evidenceState:'awaiting_actual_render_and_reviews',publicationAuthority:false};
  return {...core,digest:sha256(JSON.stringify(core))};
}
export function probeVideo(file){
  const absolute=path.resolve(file);
  if(!fs.statSync(absolute,{throwIfNoEntry:false})?.isFile())throw Error('floor_media_missing');
  const output=execFileSync('ffprobe',[
    '-v','error','-count_frames','-show_entries',
    'stream=codec_type,codec_name,width,height,r_frame_rate,nb_read_frames',
    '-show_entries','format=duration','-of','json',absolute],{encoding:'utf8',maxBuffer:1024*1024});
  const doc=JSON.parse(output),streams=doc.streams||[],videos=streams.filter(s=>s.codec_type==='video');
  if(videos.length!==1)throw Error('floor_video_stream_invalid');
  const v=videos[0],[num,den]=String(v.r_frame_rate||'0/0').split('/').map(Number);
  if(!num||!den)throw Error('floor_video_fps_invalid');
  const data=fs.readFileSync(absolute);
  return {sha256:sha256(data),bytes:data.length,width:v.width,height:v.height,
    fps:Number((num/den).toFixed(4)),durationSec:Number(doc.format?.duration),
    frameCount:v.nb_read_frames===undefined?null:Number(v.nb_read_frames),
    codec:v.codec_name,hasAudio:streams.some(s=>s.codec_type==='audio')};
}
function scoreReviews(reviews,mediaSha){
  if(!Array.isArray(reviews)||reviews.length<FLOOR.minReviewers)
    return {status:'pending',issues:['floor_two_independent_reviews_required'],mean:null};
  const ids=new Set(),issues=[],means=[];
  for(const r of reviews){
    if(!r||typeof r.reviewerId!=='string'||!r.reviewerId.trim()||ids.has(r.reviewerId)){
      issues.push('floor_reviewer_duplicate_or_missing');continue;
    }
    ids.add(r.reviewerId);
    if(r.mediaSha256!==mediaSha||r.decision!=='approve'||!r.reviewedAt||!r.notes||r.notes.trim().length<16){
      issues.push('floor_review_evidence_invalid');continue;
    }
    const vals=[];
    for(const axis of AXES){
      const v=r.scores?.[axis];
      if(!Number.isInteger(v)||v<1||v>5){issues.push('floor_axis_unscored:'+axis);continue;}
      if(v<FLOOR.minAxis)issues.push('floor_axis_below_standard:'+axis);
      vals.push(v);
    }
    if(vals.length===AXES.length){
      const mean=vals.reduce((a,b)=>a+b,0)/vals.length;
      means.push(mean);
      if(mean<FLOOR.minMean)issues.push('floor_average_below_standard');
    }
  }
  return {status:issues.length?'rejected':'approved',issues:[...new Set(issues)],
    mean:means.length?Number((means.reduce((a,b)=>a+b,0)/means.length).toFixed(3)):null};
}
export function inspectFloor({media,profile,mode='master',format='landscape',reviews=[],
  frameEvidence=null,truthVerified=false,rightsVerified=false,audioApproved=false,
  sourceLineage=[],renderBackend='unknown'}){
  if(!PROFILES[profile])throw Error('floor_profile_unknown');
  if(!['master','preview'].includes(mode)||!['landscape','portrait'].includes(format))throw Error('floor_mode_or_format_invalid');
  if(!media||!/^[a-f0-9]{64}$/.test(media.sha256||''))throw Error('floor_media_invalid');
  const issues=[];
  const [width,height]=FLOOR[format];
  if(media.width<width||media.height<height)issues.push('floor_resolution_below_master');
  if(media.fps<FLOOR.minimumFps)issues.push('floor_fps_below_standard');
  if(!validPositive(media.frameCount)||!Number.isFinite(media.durationSec)||
      Math.abs(media.frameCount/media.fps-media.durationSec)>Math.max(0.15,2/media.fps))
    issues.push('floor_decode_or_timing_invalid');
  if(PROFILES[profile].audio&&!media.hasAudio)issues.push('floor_audio_missing');
  if(PROFILES[profile].audio&&!audioApproved)issues.push('floor_audio_listening_approval_missing');
  if(truthVerified!==true)issues.push('floor_truth_review_missing');
  if(rightsVerified!==true)issues.push('floor_rights_review_missing');
  if(!Array.isArray(sourceLineage)||!sourceLineage.length)issues.push('floor_source_lineage_missing');
  if(mode==='master'&&(!frameEvidence||
      frameEvidence.schema!=='evercraft.visual-floor.frame-evidence.v1'||
      frameEvidence.mediaSha256!==media.sha256||
      frameEvidence.sampleCount<8||!Array.isArray(frameEvidence.samples)||
      frameEvidence.samples.length!==frameEvidence.sampleCount))
    issues.push('floor_decoded_pixels_unverified');
  const review=scoreReviews(reviews,media.sha256);
  if(review.status!=='approved')issues.push(...review.issues);
  const status=mode==='preview'?'preview_only':issues.length?'held_below_visual_floor':'eligible_for_separate_master_and_owner_approval';
  const core={schema:SCHEMA,profile,mode,format,media,renderBackend,
    sampledFrameEvidence:frameEvidence?{mediaSha256:frameEvidence.mediaSha256,samples:frameEvidence.sampleCount,diagnostics:frameEvidence.diagnostics||[]}:null,
    reviewerMean:review.mean,issues:[...new Set(issues)],status,
    independentReviewCheckPassed:review.status==='approved',
    canPublish:false,publicationAuthority:false,ownerApprovalRequired:true,
    humanIdentityAttestationStillRequired:true,
    warning:'No numerical metric or self-asserted reviewer ID proves artistic quality or authorization. Independent human QA and owner approval must occur outside this classifier.'};
  return {...core,digest:sha256(JSON.stringify(core))};
}
export function evaluateVideoFile(file,options){return inspectFloor({media:probeVideo(file),...options});}
function cli(){
  const args=process.argv.slice(2),get=(flag,def)=>{const ix=args.indexOf(flag);return ix<0?def:args[ix+1]};
  const video=get('--video');
  if(!video)throw Error('Usage: node visual-floor.mjs --video VIDEO --profile cinematic_fx --mode preview --report REPORT');
  const evidenceFile=get('--evidence-file'),evidence=evidenceFile?JSON.parse(fs.readFileSync(evidenceFile,'utf8')):{};
  const result=evaluateVideoFile(video,{...evidence,
    profile:get('--profile','cinematic_fx'),mode:get('--mode','preview'),format:get('--format','landscape'),
    renderBackend:get('--backend',evidence.renderBackend||'unknown')});
  if(get('--report'))fs.writeFileSync(get('--report'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
  if(result.status!=='eligible_for_separate_master_and_owner_approval')process.exitCode=2;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))cli();
