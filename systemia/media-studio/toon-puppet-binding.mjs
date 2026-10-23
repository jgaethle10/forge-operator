import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {verifyToonPerformanceBundle} from './toon-performance-intake.mjs';

const script=path.join(path.dirname(fileURLToPath(import.meta.url)),'toon-puppet-rig.py');
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function check(ok,reason){if(!ok)throw new Error('toon_puppet_binding_'+reason)}
const refs=items=>new Map(items.map(item=>[item.id,item]));

/**
 * Use the verified real-art + recorded-speech intake to authorize an offline
 * layered-puppet preview. A claim that a rig part belongs to the correct
 * character must be backed by the same locked actor reference registry.
 *
 * This does NOT imply pose suitability, lip sync or production admission.
 */
export function renderBoundPuppetMotion({
  packet,shotId,manifest,bundleDir,rig,outDir,python='python3',
}={}){
  const source=verifyToonPerformanceBundle({packet,shotId,manifest,bundleDir});
  check(source.dialogue?.audioDecoded===true,'recorded_voice_required');
  const shot=packet.shots.find(x=>x.id===shotId);
  check(rig?.schema==='evercraft.fallen.toon-puppet-rig.v1','rig_schema');
  check(rig.packetDigest===source.packetDigest&&rig.shotId===shotId&&
    rig.actorId===source.actorId,'rig_shot_or_actor_mismatch');
  check(rig.durationSec===shot.durationSec&&rig.fps===shot.fps,'rig_timing_mismatch');
  check(rig.width/rig.height===(shot.aspectRatio==='16:9'?16/9:shot.aspectRatio==='9:16'?9/16:1),
    'rig_aspect_ratio_mismatch');
  check(rig.voice?.file===manifest.dialogueAudio?.file&&
    rig.voice?.sha256===source.dialogue.sha256&&
    rig.voice?.cueId===source.dialogue.cueId&&
    rig.voice?.voiceProfileId===source.dialogue.voiceProfileId,
    'locked_dialogue_or_voice_mismatch');
  check(Array.isArray(rig.layers)&&rig.layers.length>=2,'rig_layers_missing');
  check(Array.isArray(manifest.rigParts)&&manifest.rigParts.length===rig.layers.length,
    'approved_rig_parts_missing');
  const parts=refs(manifest.rigParts);
  check(parts.size===rig.layers.length,'duplicate_rig_part');
  const actor=shot.characters[0];
  for(const layer of rig.layers){
    const item=parts.get(layer.id);
    check(item&&item.file===layer.file&&item.sha256===layer.sha256&&
      item.referenceAssetId===layer.referenceAssetId&&
      item.actorId===actor.id,'rig_part_binding_mismatch');
    check(actor.referenceAssetIds.includes(layer.referenceAssetId),
      'rig_part_identity_reference_unknown');
    check(item.rightsClaim==='owned'||item.rightsClaim==='licensed',
      'rig_part_rights_undeclared');
    check(item.reviewState==='declared_approved'&&
      typeof item.reviewEvidenceRef==='string'&&item.reviewEvidenceRef.length>=8,
      'rig_part_review_missing');
  }
  check(typeof outDir==='string'&&outDir.trim(),'output_directory_required');
  const out=path.resolve(outDir);
  const root=fs.realpathSync(bundleDir);
  check(out!==root&&!out.startsWith(root+path.sep),'output_inside_source_bundle');
  fs.mkdirSync(out,{recursive:true});
  const rigPath=path.join(out,'input-rig.json');
  fs.writeFileSync(rigPath,JSON.stringify(rig,null,2)+'\n',{mode:0o600});
  const done=spawnSync(python,[script,'--rig-json',rigPath,'--assets',root,'--out',out],
    {encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:180000,maxBuffer:2*1024*1024});
  if(done.error)throw new Error('toon_puppet_binding_runner_error:'+done.error.message);
  if(done.status!==0)throw new Error('toon_puppet_binding_runner_failed:'+String(done.stderr).slice(-600));
  const proof=JSON.parse(fs.readFileSync(path.join(out,'puppet-motion-receipt.json'),'utf8'));
  const movie=path.join(out,'puppet-motion-review.mp4');
  check(proof.videoSha256===digest(movie),'movie_digest_mismatch');
  check(proof.packetDigest===source.packetDigest&&proof.shotId===shotId&&
    proof.actorId===actor.id,'render_source_binding_mismatch');
  check(proof.voiceSha256===source.dialogue.sha256&&
    proof.voiceCueId===source.dialogue.cueId,'render_voice_binding_mismatch');
  check(proof.frameCount===Math.round(shot.durationSec*shot.fps),'frame_count_mismatch');
  check(proof.articulatedJointTransformsExecuted===true,'joint_animation_missing');
  const requiredTracks=Array.isArray(rig.facialTracks)?rig.facialTracks:[];
  check(proof.authoredFacialSpritesSwitched===(requiredTracks.length>0),
    'facial_sprite_execution_mismatch');
  check(proof.audioPhonemeAlignmentMeasured===false,
    'unearned_phoneme_claim');
  for(const track of requiredTracks){
    const sample=proof.facialSwitchSamples?.[track.group];
    const counts=proof.facialVisibleFrameCounts?.[track.group];
    check(Array.isArray(sample)&&sample.length===track.events.length,
      'facial_event_receipt_missing:'+track.group);
    check(sample.every((item,i)=>item.atFrame===track.events[i].atFrame&&
      item.variant===track.events[i].variant),'facial_event_receipt_mismatch:'+track.group);
    check(Object.values(counts||{}).reduce((a,b)=>a+b,0)===proof.frameCount,
      'facial_frame_coverage_invalid:'+track.group);
  }
  check(proof.lipSyncVerified===false&&proof.publicationAuthority===false&&
    proof.humanCreativeApproved===false,'unearned_approval');
  // The returned object is metadata only. No user images, audio or data URI.
  return {
    ...proof,verifiedArtAndSpeechBytes:true,
    actingIllustrationsActualRigFrames:true,
    noReferenceIdentityApproval:true,noVoicePerformanceApproval:true,
    noAutomaticPublish:true,
  };
}