/**
 * Fallen documentary preflight. Purely local; cannot publish or verify claims.
 * Independent rights/source review remains mandatory.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SHA=/^[a-f0-9]{64}$/i;
const TEXT=x=>typeof x==='string'&&x.trim().length>0;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const hashFile=p=>sha(fs.readFileSync(p));
const unique=a=>[...new Set(a)];
const finite=x=>Number.isFinite(x)&&x>=0;

export function inspectDocumentaryEvidence(input){
  const failures=[];
  if(input?.schema!=='evercraft.fallen.documentary-preflight-input.v1') failures.push('documentary_schema_invalid');
  const project=input?.project;
  if(project?.schema!=='evercraft.fallen.timeline.v1'||!TEXT(project?.id)) failures.push('timeline_missing_or_invalid');
  if(!Array.isArray(project?.assets)||!Array.isArray(project?.tracks)) failures.push('timeline_assets_or_tracks_missing');
  const assets=new Map((Array.isArray(project?.assets)?project.assets:[]).map(a=>[a.id,a]));
  const scenes=Array.isArray(input?.scenes)?input.scenes:[];
  const claims=Array.isArray(input?.claims)?input.claims:[];
  if(!scenes.length) failures.push('documentary_scenes_missing');
  const claimMap=new Map(claims.map(c=>[c.id,c]));
  for(const claim of claims){
    if(!TEXT(claim.id)||!TEXT(claim.text)||!Array.isArray(claim.sourceRefs)||!claim.sourceRefs.some(TEXT)){
      failures.push('claim_source_missing:'+String(claim.id));
    }
    if(claim.reviewState!=='verified'||!TEXT(claim.reviewerRef)) failures.push('claim_human_verification_missing:'+String(claim.id));
  }
  const visualClips=(Array.isArray(project?.tracks)?project.tracks:[])
    .filter(t=>t.kind==='video'||t.kind==='overlay').flatMap(t=>t.clips||[]);
  const clipMap=new Map(visualClips.map(c=>[c.id,c]));
  const counted=new Map();
  for(const scene of scenes){
    if(!TEXT(scene.clipId)||counted.has(scene.clipId)) failures.push('scene_clip_duplicate_or_missing:'+String(scene.clipId));
    counted.set(scene.clipId,true);
    const clip=clipMap.get(scene.clipId);
    if(!clip){failures.push('scene_clip_not_on_timeline:'+String(scene.clipId));continue;}
    const asset=assets.get(clip.assetId);
    if(!asset){failures.push('scene_asset_missing:'+String(clip.assetId));continue;}
    if(!SHA.test(asset.digest||'')||!Array.isArray(asset.sourceRefs)||!asset.sourceRefs.some(TEXT)) failures.push('asset_lineage_invalid:'+asset.id);
    if(scene.assetId!==asset.id||scene.assetSha256!==asset.digest) failures.push('scene_asset_binding_mismatch:'+scene.clipId);
    if(!finite(clip.startSec)||!Number.isFinite(clip.durationSec)||clip.durationSec<=0) failures.push('clip_timing_invalid:'+clip.id);
    if(!['actual_event','archive','illustration','synthetic'].includes(scene.portrayal)) failures.push('scene_portrayal_unknown:'+scene.clipId);
    if(scene.portrayal==='actual_event'){
      if(!TEXT(scene.eventRef)||!TEXT(scene.captureDate)||scene.captureDate.slice(0,10)!==scene.eventDate){
        failures.push('event_capture_unverified:'+scene.clipId);
      }
      if(asset.evidenceState==='synthetic_visualization'||asset.evidenceState==='modeled') failures.push('synthetic_depicted_as_event:'+scene.clipId);
    }
    if(scene.portrayal==='archive'&&!TEXT(scene.captureDate)) failures.push('archive_capture_date_missing:'+scene.clipId);
    if(scene.portrayal==='synthetic'||asset.evidenceState==='synthetic_visualization'){
      if(scene.portrayal!=='synthetic'&&scene.portrayal!=='illustration') failures.push('synthetic_presentation_mismatch:'+scene.clipId);
      if(!TEXT(scene.disclosureText)||!TEXT(scene.disclosureReviewRef)) failures.push('synthetic_disclosure_unreviewed:'+scene.clipId);
    }
    if(!scene.rights||scene.rights.status!=='cleared'||!TEXT(scene.rights.evidenceRef)||!TEXT(scene.rights.usageScope)) failures.push('rights_clearance_missing:'+scene.clipId);
    if(!Array.isArray(scene.claimIds)) failures.push('scene_claim_ids_missing:'+scene.clipId);
    for(const id of scene.claimIds||[]) if(!claimMap.has(id)) failures.push('scene_claim_unknown:'+id);
  }
  for(const clip of visualClips) if(!counted.has(clip.id)) failures.push('timeline_visual_unaccounted:'+clip.id);
  if(!TEXT(input?.editorialReviewerRef)) failures.push('editorial_reviewer_missing');
  return {
    schema:'evercraft.fallen.documentary-evidence-preflight.v1',
    status:failures.length?'rejected':'preflight_complete_human_review_required',
    projectId:project?.id||null,sceneCount:scenes.length,
    failures:unique(failures),
    boundaries:{sourceContentIndependentlyChecked:false,licenseAuthenticityVerified:false,onScreenDisclosureObserved:false,publicationAuthorityGranted:false}
  };
}

function tool(bin,args){
  const run=spawnSync(bin,args,{encoding:'utf8',maxBuffer:1024*1024*5,timeout:180000});
  if(run.error||run.status!==0) throw new Error(bin+'_failed:'+(run.error?.message||run.stderr||run.status).slice(-240));
  return run.stdout;
}
function mp4Boxes(filePath){
  const fd=fs.openSync(filePath,'r');
  try{
    const length=fs.fstatSync(fd).size;
    let pos=0;const boxes=[];
    while(pos+8<=length){
      const header=Buffer.alloc(16);
      fs.readSync(fd,header,0,8,pos);
      let size=header.readUInt32BE(0);const kind=header.toString('ascii',4,8);
      let min=8;
      if(size===1){if(pos+16>length) throw new Error('mp4_box_truncated');fs.readSync(fd,header,8,8,pos+8);size=Number(header.readBigUInt64BE(8));min=16;}
      if(size===0)size=length-pos;
      if(!Number.isSafeInteger(size)||size<min||pos+size>length)throw new Error('mp4_box_invalid');
      boxes.push(kind);pos+=size;
    }
    if(pos!==length)throw new Error('mp4_trailing_bytes');
    return boxes;
  }finally{fs.closeSync(fd);}
}
export function inspectPortableMaster(filePath,expectedSha256){
  const failures=[];
  const file=path.resolve(filePath);
  if(!fs.existsSync(file)||!fs.statSync(file).isFile()){
    return {status:'rejected',failures:['file_missing'],publicationAuthorityGranted:false};
  }
  const digest=hashFile(file);
  if(expectedSha256&&digest!==expectedSha256.toLowerCase())failures.push('master_sha_mismatch');
  let durationSec=0,videoCodec=null,audioCodec=null,width=0,height=0,boxes=[];
  try{
    boxes=mp4Boxes(file);
    if(boxes.indexOf('ftyp')!==0||boxes.indexOf('moov')<0||boxes.indexOf('mdat')<0||boxes.indexOf('moov')>boxes.indexOf('mdat')) failures.push('mp4_faststart_invalid');
    const info=JSON.parse(tool('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file]));
    const video=info.streams?.find(s=>s.codec_type==='video');
    const audio=info.streams?.find(s=>s.codec_type==='audio');
    durationSec=Number(info.format?.duration)||0;videoCodec=video?.codec_name||null;audioCodec=audio?.codec_name||null;
    width=video?.width||0;height=video?.height||0;
    if(videoCodec!=='h264'||audioCodec!=='aac')failures.push('mobile_codec_not_h264_aac');
    if(!durationSec||width<480||height<270)failures.push('video_dimensions_or_duration_invalid');
    tool('ffmpeg',['-v','error','-xerror','-i',file,'-map','0:v:0','-map','0:a:0','-f','null','-']);
  }catch(e){failures.push('full_decode_or_probe_failed:'+String(e.message).slice(0,120));}
  return {
    schema:'evercraft.fallen.portable-master-preflight.v1',
    status:failures.length?'rejected':'technically_accepted_device_playback_unverified',
    failures,sha256:digest,sizeBytes:fs.statSync(file).size,
    durationSec,width,height,videoCodec,audioCodec,boxes,
    boundaries:{fullLocalDecodeAttempted:true,actualPhonePlaybackObserved:false,editorialTruthVerified:false,publicationAuthorityGranted:false}
  };
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
  const [manifestPath,mp4Path,reportPath]=process.argv.slice(2);
  if(!manifestPath||!mp4Path||!reportPath){console.error('Usage: node documentary-preflight.mjs <manifest.json> <master.mp4> <report.json>');process.exitCode=2;}
  else{
    try{
      const evidence=inspectDocumentaryEvidence(JSON.parse(fs.readFileSync(manifestPath,'utf8')));
      const media=inspectPortableMaster(mp4Path);
      const result={schema:'evercraft.fallen.documentary-preflight-report.v1',evidence,media,publicationAuthorityGranted:false};
      fs.writeFileSync(reportPath,JSON.stringify(result,null,2)+'\n');
      console.log(JSON.stringify({evidenceStatus:evidence.status,mediaStatus:media.status,reportPath}));
      if(evidence.status==='rejected'||media.status==='rejected')process.exitCode=1;
    }catch(e){console.error(String(e));process.exitCode=1;}
  }
}
