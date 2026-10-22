#!/usr/bin/env node
/**
 * Admit an EXISTING source-produced native World Engine movie into the
 * existing Visual Floor shot-dailies review lane, not into publication.
 * A JSON receipt alone cannot authenticate its author or prove hardware.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {planFloor,probeVideo} from './visual-floor.mjs';

const sha256=v=>crypto.createHash('sha256').update(v).digest('hex');
const isSha=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const fail=reason=>{throw Error('native_floor_'+reason)};
const PROFILE='original_3d_synthetic_data_constellation';
const phases=[
  {id:'signal-discovery',intent:'Reveal the 3D data-space architecture with scale, perspective and visual restraint',visualProof:'Real GPU frame samples must reveal authored node geometry and credible lighting'},
  {id:'network-relationships',intent:'Use camera movement to reveal distinct relationship topology across clusters',visualProof:'Actual decoded middle frames must expose distinct connections and purposeful hierarchy'},
  {id:'intelligence-reveal',intent:'Land on a meaningful central node and resolve the dimensional composition',visualProof:'Closing frames must preserve shape and highlight control; no automatic beauty claim'}
];

export function buildNativeFloorJobpack({videoPath,receiptPath}){
  if(!videoPath||!receiptPath)fail('files_missing');
  const raw=fs.readFileSync(receiptPath,'utf8');
  const receipt=JSON.parse(raw),video=probeVideo(videoPath);
  if(receipt.schema!=='evercraft.world-engine.cinematic-pixel-proof.v1'||
     receipt.kind!=='synthetic_internal_canary'||
     receipt.sceneType!==PROFILE||
     receipt.publicationAuthority!==false||
     receipt.paidProductionReady!==false||
     receipt.visualReviewState!=='unreviewed')fail('native_receipt_identity_invalid');
  if(receipt.dataConstellation?.publicationAuthority!==false||
     receipt.dataConstellation?.nodeCount!==75||
     receipt.dataConstellation?.linkCount<60||
     receipt.dataConstellation?.sourceNativeWebGpuScene!==true||
     receipt.dataConstellation?.shaderFrameReadbackRequired!==true)fail('scene_evidence_invalid');
  if(!isSha(receipt.worldDigest)||!isSha(receipt.shaderSha256)||!isSha(receipt.shadowShaderSha256)||
     !isSha(receipt.firstFramePlanDigest)||!isSha(receipt.lastFramePlanDigest))fail('native_lineage_invalid');
  if(receipt.hardwareExecutionClaim!==false||
     receipt.exactGpuReadbackFrames!==video.frameCount||
     receipt.uniqueRawFrameDigests<Math.max(3,Math.round(video.frameCount*.65)))fail('frame_readback_invalid');
  if(receipt.output?.sha256!==video.sha256||
     receipt.output?.codec!==video.codec||
     receipt.output?.width!==video.width||receipt.output?.height!==video.height||
     receipt.output?.fps!==video.fps||
     receipt.output?.durationSec!==video.durationSec||
     receipt.output?.audioCodec!==null||video.hasAudio)fail('video_receipt_mismatch');
  if(video.frameCount!==96||video.fps!==24||video.durationSec!==4||video.codec!=='h264')fail('canary_timing_invalid');
  const frames=video.frameCount,count=phases.length;
  const boundaries=Array.from({length:count+1},(_,i)=>Math.round(i*frames/count));
  const shots=phases.map((p,i)=>({id:p.id,intent:p.intent,beat:p.id,
    screenText:'',startFrame:boundaries[i],frameCount:boundaries[i+1]-boundaries[i],
    fps:video.fps,size:{width:video.width,height:video.height},
    worldEngine:{state:'native_webgpu_receipt_claim_subject_to_external_ci_verification',
      firstFramePlanDigest:receipt.firstFramePlanDigest,lastFramePlanDigest:receipt.lastFramePlanDigest},
    fallen:{state:'awaiting_decoded_shot_review'}}));
  const campaignId='native-data-constellation-canary';
  const workOrder=planFloor({assetId:campaignId,profile:'cinematic_fx',
    truth:'synthetic_visualization',
    target:{width:video.width,height:video.height,fps:video.fps,durationSec:video.durationSec},
    beats:phases});
  return {
    schema:'evercraft.graphics-command.production-jobpack.v1',
    campaignId,campaignDigest:receipt.worldDigest,
    planDigest:receipt.firstFramePlanDigest,
    sourceRefs:[],truthState:'synthetic_visualization',
    frameCount:frames,fps:video.fps,resolution:{width:video.width,height:video.height},
    shots,
    visualFloor:{status:'native_canary_needs_actual_human_review',workOrder,
      publicationAuthority:false,customerApproved:false},
    nativeEvidence:{sourceMovieSha256:video.sha256,sourceReceiptSha256:sha256(raw),
      worldDigest:receipt.worldDigest,shaderSha256:receipt.shaderSha256,
      renderProfile:receipt.renderProfile,
      source:'producer_supplied_receipt_not_independently_signed',
      nativeGpuReadbackClaim:true,hardwareGpuVerified:false,
      videoBytes:video.bytes,
      sourceScene:PROFILE,
      ownerApprovalRequired:true,
      noCreativeScoreGranted:true},
    customerReady:false,publicationAuthority:false
  };
}
function run(){
  const argv=process.argv.slice(2);
  const get=f=>{const i=argv.indexOf(f);return i===-1?null:argv[i+1]};
  const video=get('--video'),receipt=get('--receipt'),out=get('--out');
  if(!video||!receipt||!out)fail('usage_video_receipt_out_required');
  const p=buildNativeFloorJobpack({videoPath:video,receiptPath:receipt});
  const resolved=path.resolve(out);
  fs.mkdirSync(path.dirname(resolved),{recursive:true});
  fs.writeFileSync(resolved,JSON.stringify(p,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({status:'native_cinema_shot_dailies_prepared_not_approved',
    output:resolved,shotCount:p.shots.length,workOrderDigest:p.visualFloor.workOrder.digest,
    publicationAuthority:false}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))run();
