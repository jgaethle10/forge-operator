import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {inspectToonHandoff} from './toon-shot-handoff.mjs';
import {prepareToonCinemaShot} from './toon-cinema-preflight.mjs';

function guard(test,code){if(!test)throw new Error('toon_performance_intake_'+code)}
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const hex=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);

function readBoundAsset(root,name,expectedSha,limitBytes){
  guard(typeof name==='string'&&name.length>0&&name.length<220,'file_name_invalid');
  guard(!path.isAbsolute(name)&&name.split(/[\\/]/).every(part=>part&&part!=='.'&&part!=='..'),
    'file_path_unsafe');
  guard(!name.includes('\\')&&!name.includes('\0'),'file_path_unsafe');
  const rootReal=fs.realpathSync(root),full=path.resolve(rootReal,name);
  guard(full.startsWith(rootReal+path.sep),'file_outside_bundle');
  const stat=fs.lstatSync(full,{throwIfNoEntry:false});
  guard(stat?.isFile()&&!stat.isSymbolicLink(),'asset_not_regular_file');
  guard(fs.realpathSync(full)===full,'asset_symlink_forbidden');
  guard(stat.size>0&&stat.size<=limitBytes,'asset_size_invalid');
  const bytes=fs.readFileSync(full);
  guard(hex(expectedSha)&&sha(bytes)===expectedSha,'asset_sha_mismatch');
  return {full,bytes,sha256:expectedSha,sizeBytes:stat.size};
}
function probe(file){
  const p=spawnSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file],
    {encoding:'utf8',maxBuffer:2_000_000,timeout:15000});
  guard(!p.error&&p.status===0,'ffprobe_failed');
  try{return JSON.parse(p.stdout)}catch{throw new Error('toon_performance_intake_probe_invalid')}
}
function inspectAudio(file){
  const r=spawnSync('ffmpeg',['-v','error','-i',file,'-map','0:a:0',
    '-ac','1','-ar','16000','-f','s16le','pipe:1'],
    {encoding:null,maxBuffer:4_000_000,timeout:30000});
  guard(!r.error&&r.status===0,'audio_decode_failed');
  const samples=r.stdout;
  guard(Buffer.isBuffer(samples)&&samples.length>6400&&samples.length%2===0,
    'audio_samples_missing');
  let squares=0,peak=0,clipped=0,active=0;
  const count=samples.length/2;
  for(let i=0;i<count;i++){
    const v=Math.abs(samples.readInt16LE(i*2))/32768;
    squares+=v*v;
    peak=Math.max(peak,v);
    if(v>.02)active++;
    if(v>=.999)clipped++;
  }
  const rms=Math.sqrt(squares/count);
  const activeFraction=active/count,clippedFraction=clipped/count;
  guard(rms>=.007&&activeFraction>=.06,'speech_audio_essentially_silent');
  guard(clippedFraction<=.01,'speech_audio_heavily_clipped');
  return {
    measuredPcmSampleRate:16000,
    rms:Number(rms.toFixed(5)),peak:Number(peak.toFixed(5)),
    activeFraction:Number(activeFraction.toFixed(5)),
    clippedFraction:Number(clippedFraction.toFixed(5)),
    measurementOnlyNotExpressiveVoiceProof:true,
  };
}
function isPng(b){
  return b.length>24&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
}
function isJpeg(b){return b.length>4&&b[0]===0xff&&b[1]===0xd8&&b.at(-2)===0xff&&b.at(-1)===0xd9}
const extensions={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg'};

/**
 * Verifies real local image and dialogue bytes for one inspected Fallen shot.
 * Claims of likeness, human review, performance quality and rights remain declarations.
 * Does not upload or call paid providers.
 */
export function verifyToonPerformanceBundle({packet,shotId,bundleDir,manifest,endpoints}={}){
  const inspection=inspectToonHandoff(packet);
  guard(typeof shotId==='string'&&shotId.length>0,'shot_id_missing');
  const shot=packet.shots.find(s=>s.id===shotId);
  guard(shot,'shot_missing');
  guard(shot.characters.length===1,'one_actor_only');
  guard(manifest?.schema==='evercraft.fallen.toon-performance-sources.v1','manifest_schema');
  guard(manifest.packetDigest===inspection.packetDigest&&manifest.shotId===shotId,
    'manifest_shot_binding_mismatch');
  const actor=shot.characters[0];
  guard(manifest.actorId===actor.id,'actor_mismatch');
  guard(typeof bundleDir==='string'&&fs.statSync(bundleDir,{throwIfNoEntry:false})?.isDirectory(),
    'bundle_directory_missing');
  const image=manifest.image;
  guard(image&&actor.referenceAssetIds.includes(image.referenceAssetId),'identity_asset_unknown');
  guard(image.rightsClaim==='owned'||image.rightsClaim==='licensed','identity_rights_undeclared');
  guard(typeof image.reviewEvidenceRef==='string'&&image.reviewEvidenceRef.length>=8,
    'identity_review_evidence_missing');
  guard(image.reviewState==='declared_approved','identity_review_not_declared');
  const asset=readBoundAsset(bundleDir,image.file,image.sha256,5*1024*1024);
  const ext=path.extname(image.file).toLowerCase(),type=extensions[ext];
  guard(type&&(type==='image/png'?isPng(asset.bytes):isJpeg(asset.bytes)),
    'image_magic_mismatch');
  const imageProbe=probe(asset.full),v=imageProbe.streams?.find(s=>s.codec_type==='video');
  guard(Number.isInteger(v?.width)&&Number.isInteger(v?.height)&&
    v.width>=960&&v.height>=540,'identity_image_too_small');
  const cue=shot.dialogue||[];
  guard(cue.length<=1,'multi_dialogue_not_supported');
  let dialogue=null;
  if(cue.length){
    const voice=manifest.dialogueAudio;
    guard(voice,'dialogue_audio_missing');
    guard(voice.cueId===cue[0].id&&voice.text===cue[0].text&&
      voice.voiceProfileId===cue[0].voiceProfileId,
      'dialogue_cue_or_voice_declaration_mismatch');
    guard(voice.sourceKind==='voice_foundry_export'||voice.sourceKind==='human_recording',
      'scratch_speech_not_accepted');
    guard(voice.rightsClaim==='owned'||voice.rightsClaim==='licensed',
      'dialogue_rights_undeclared');
    guard(typeof voice.reviewEvidenceRef==='string'&&voice.reviewEvidenceRef.length>=8&&
      voice.reviewState==='declared_approved','voice_review_not_declared');
    const audio=readBoundAsset(bundleDir,voice.file,voice.sha256,20*1024*1024);
    guard(['.wav','.flac','.mp3'].includes(path.extname(voice.file).toLowerCase()),
      'audio_format_invalid');
    const data=probe(audio.full);
    const stream=data.streams?.find(s=>s.codec_type==='audio');
    const sec=Number(data.format?.duration??stream?.duration);
    guard(stream&&Number.isFinite(sec)&&sec>.2&&sec<=shot.durationSec+.2,
      'audio_timing_invalid');
    guard(Number(stream.sample_rate)>=16000,'audio_sample_rate_low');
    const acoustic=inspectAudio(audio.full);
    dialogue={
      cueId:cue[0].id,text:cue[0].text,
      voiceProfileId:cue[0].voiceProfileId,
      sourceKindDeclared:voice.sourceKind,
      sha256:audio.sha256,bytesVerified:true,audioDecoded:true,
      acoustic,
      durationSec:Number(sec.toFixed(3)),reviewEvidenceRef:voice.reviewEvidenceRef,
      rightsClaim:voice.rightsClaim,
      naturalVoiceQualityVerified:false,voiceIdentityVerified:false,
      phonemeAlignmentVerified:false,
    };
  }else{
    guard(!manifest.dialogueAudio,'unexpected_speech_asset');
  }
  const ref={
    schema:'evercraft.fallen.toon-approved-frame.v1',
    actorId:actor.id,referenceAssetId:image.referenceAssetId,
    sha256:asset.sha256,approvalState:image.reviewState,
    approvalEvidenceRef:image.reviewEvidenceRef,commercialRights:image.rightsClaim,
    dataUri:'data:'+type+';base64,'+asset.bytes.toString('base64'),
  };
  const options={packet,shotId,approvedStartFrame:ref};
  if(endpoints!==undefined)options.endpoints=endpoints;
  const model=prepareToonCinemaShot(options);
  return {
    schema:'evercraft.fallen.toon-performance-source-intake.v1',
    state:'bytes_verified_creative_and_provider_admission_pending',
    shotId,packetDigest:inspection.packetDigest,actorId:actor.id,
    identity:{
      imageSha256:asset.sha256,bytesVerified:true,decoded:true,
      width:v.width,height:v.height,
      referenceAssetId:image.referenceAssetId,
      reviewEvidenceRef:image.reviewEvidenceRef,
      likenessAndAnatomyVerified:false,
      commercialRightsIndependentlyVerified:false,
    },
    dialogue,modelPlan:model.modelPlan,
    providerExecutionEligible:false,
    actualProviderGeneration:false,
    actualExpressiveVoiceQualityVerified:false,
    audiencePerformanceApproved:false,
    humanRightsEvidenceIndependentlyVerified:false,
    publicationAuthority:false,
    blockers:[
      'Art and voice provenance review refs are declarations, not independent verification',
      'Subjective character/voice performance must be auditioned',
      'Provider execution and creative approval must be established independently',
      ...(model.modelPlan.status==='blocked'?['No currently verified compatible video provider']:[]),
    ],
    // Actual image bytes remain in-memory in the request, never in logs or receipts.
    highFidelityRequest:model.request,
  };
}
