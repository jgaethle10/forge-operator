import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {inspectToonHandoff} from './toon-shot-handoff.mjs';

const script=path.join(path.dirname(fileURLToPath(import.meta.url)),'toon-cel-canary.py');
const isSha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function fail(condition,code){if(!condition)throw new Error('toon_cel_adapter_'+code)}
function hash(bytes){return crypto.createHash('sha256').update(bytes).digest('hex')}

/**
 * The built-in fox cel is original artwork. It is NOT a family/identity-aware
 * renderer. Only single-fox, dialogue-free shots may be routed here.
 */
export function prepareToonCelPreview({packet,shotId}){
  const inspection=inspectToonHandoff(packet);
  const shot=packet.shots.find(item=>item.id===shotId);
  fail(shot,'shot_unknown');
  fail(shot.characters?.length===1,'one_synthetic_character_only');
  const actor=shot.characters[0];
  fail(actor.lockedTraits?.species==='fox','supported_original_fox_only');
  fail(Array.isArray(actor.referenceAssetIds)&&actor.referenceAssetIds.length>0,'character_reference_declared');
  fail(!shot.dialogue?.length,'spoken_dialogue_not_supported');
  const motion=shot.previewMotion;
  fail(motion?.specimenProfile==='original_fox_v1','authored_preview_motion_required');
  // The full packet digest covers these numeric, authored acting controls.
  const ranges={reach:[0,1],blinkAtSec:[0,shot.frameCount/shot.fps],
    gazeX:[-1,1],lanternLift:[0,1],tailEnergy:[0,1]};
  fail(Object.keys(motion).length===6,'unexpected_preview_motion_fields');
  for(const [key,[min,max]] of Object.entries(ranges)){
    fail(typeof motion[key]==='number'&&Number.isFinite(motion[key])&&
      motion[key]>=min&&motion[key]<=max,'preview_motion_range_invalid:'+key);
  }
  fail(Number.isInteger(shot.fps)&&shot.fps>=24&&shot.fps<=60,'fps_invalid');
  fail(Number.isInteger(shot.frameCount)&&shot.frameCount>0,'frames_invalid');
  const durationSec=shot.frameCount/shot.fps;
  fail(durationSec>=.5&&durationSec<=8,'duration_outside_canary_bounds');
  fail(inspection.packetDigest===packet.digest,'inspection_digest_mismatch');
  return {
    schema:'evercraft.fallen.toon-cel-preview-plan.v1',
    sourcePacketDigest:packet.digest,shotId:shot.id,entityId:actor.id,
    frameCount:shot.frameCount,fps:shot.fps,durationSec,
    previewMotion:structuredClone(motion),previewMotionDigest:hash(Buffer.from(JSON.stringify(motion))),
    kind:'generic_fox_vector_animation_canary',
    state:'ready_for_local_synthetic_preview',
    boundToRealShotId:true,
    referenceMatched:false,characterPerformanceAdmitted:false,
    dialogueSupported:false,filmMasterReady:false,publicationAuthority:false,
  };
}

export function renderToonCelPreview({packet,shotId,outDir,python='python3',allowSyntheticCanary=false}){
  fail(allowSyntheticCanary===true,'explicit_canary_opt_in_required');
  fail(typeof outDir==='string'&&outDir.trim(),'output_directory_required');
  const plan=prepareToonCelPreview({packet,shotId});
  const output=path.resolve(outDir);
  fs.mkdirSync(output,{recursive:true});
  const motionPath=path.join(output,'authored-motion.json');
  fs.writeFileSync(motionPath,JSON.stringify(plan.previewMotion)+'\n');
  const args=[script,'--out',output,'--motion-json',motionPath,'--seconds',String(plan.durationSec),
    '--fps',String(plan.fps),'--width','768','--height','432'];
  const execution=spawnSync(python,args,{
    encoding:'utf8',timeout:180000,maxBuffer:2*1024*1024,stdio:['ignore','pipe','pipe'],
  });
  if(execution.error)throw new Error('toon_cel_adapter_renderer_error:'+execution.error.message);
  if(execution.status!==0)throw new Error('toon_cel_adapter_renderer_failed:'+String(execution.stderr).slice(-600));
  const receiptFile=path.join(output,'render-receipt.json');
  fail(fs.statSync(receiptFile,{throwIfNoEntry:false})?.isFile(),'render_receipt_missing');
  const sourceReceipt=JSON.parse(fs.readFileSync(receiptFile,'utf8'));
  fail(sourceReceipt.schema==='evercraft.fallen.toon-cel-render-proof.v1','renderer_schema_invalid');
  fail(sourceReceipt.status==='rendered_canary_not_production_admitted','renderer_state_invalid');
  fail(sourceReceipt.frameCount===plan.frameCount&&sourceReceipt.fps===plan.fps,'render_timing_mismatch');
  fail(sourceReceipt.previewMotionDigest===plan.previewMotionDigest,'render_motion_digest_mismatch');
  fail(sourceReceipt.previewMotionSource==='explicit_authored_original_fox_v1',
    'render_motion_provenance_invalid');
  fail(sourceReceipt.shotHandoffConnected===false&&sourceReceipt.characterIdentityVerified===false&&
    sourceReceipt.publicationAuthority===false,'renderer_boundaries_invalid');
  const media=path.join(output,'toon-cel-canary.mp4');
  fail(fs.statSync(media,{throwIfNoEntry:false})?.isFile(),'mp4_missing');
  const digest=hash(fs.readFileSync(media));
  fail(isSha(digest)&&digest===sourceReceipt.sha256,'mp4_digest_mismatch');
  const core={
    schema:'evercraft.fallen.toon-cel-shot-binding.v1',
    packetDigest:plan.sourcePacketDigest,shotId:plan.shotId,entityId:plan.entityId,
    width:sourceReceipt.width,height:sourceReceipt.height,fps:plan.fps,
    frameCount:plan.frameCount,mediaSha256:digest,mediaPath:media,
    previewMotionDigest:plan.previewMotionDigest,
    actualAuthoredMotionApplied:true,
    state:'rendered_synthetic_preview_only',
    actualMovieBytesVerified:true,
    exactRequestedFrameCountVerified:true,
    referenceMatched:false,dialogueSynced:false,characterPerformanceAdmitted:false,
    musicMasterAdmitted:false,filmMasterReady:false,publicationAuthority:false,
    warning:'Packet-bound authored motion controls drive an original fox cel. Character appearance is not identity/reference matched.',
  };
  const result={...core,digest:hash(Buffer.from(JSON.stringify(core)))};
  fs.writeFileSync(path.join(output,'toon-shot-binding-receipt.json'),JSON.stringify(result,null,2)+'\n');
  return result;
}
