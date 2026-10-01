import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { IdentityEvidence } from './types.js';

export interface NormalizedMouthRegion {
  x:number;
  y:number;
  width:number;
  height:number;
}

export interface MouthTrackSample {
  timestampSec:number;
  region:NormalizedMouthRegion;
}

export interface DialogueSyncRequest {
  schema:'evercraft.fallen.dialogue-sync-request.v1';
  id:string;
  speakerId:string;
  sourceVideoPath:string;
  sourceVideoSha256:string;
  syncedVideoPath:string;
  syncedVideoSha256:string;
  dialogueAudioPath:string;
  dialogueAudioSha256:string;
  mouthTrack:MouthTrackSample[];
  mouthTrackEvidenceRefs:string[];
  identityEvidence:IdentityEvidence[];
}

export interface DialogueSyncSample {
  timestampSec:number;
  frameSha256:string;
  mouthCropSha256:string;
  audioActivity:number;
  mouthActivity:number;
}

export interface DialogueSyncPacket {
  schema:'evercraft.fallen.dialogue-sync-packet.v1';
  id:string;
  speakerId:string;
  sourceVideoSha256:string;
  syncedVideoSha256:string;
  dialogueAudioSha256:string;
  duration:{
    sourceVideoSec:number;
    syncedVideoSec:number;
    dialogueAudioSec:number;
  };
  samples:DialogueSyncSample[];
  alignment:{
    zeroLagCorrelation:number;
    bestCorrelation:number;
    bestOffsetMs:number;
    audioActiveFraction:number;
    mouthActiveFraction:number;
  };
  mouthTrackEvidenceRefs:string[];
  packetDigest:string;
  boundaries:{
    exactMediaDigestsBound:true;
    objectiveActivityAlignmentMeasured:true;
    localActivityIsNotPhonemeProof:true;
    verifiedVisualSyncReceiptRequired:true;
    postSyncIdentityEvidenceRequired:true;
    publicationAuthorityGranted:false;
  };
  createdAt:string;
}

export interface VisualDialogueSyncReceipt {
  schema:'evercraft.fallen.visual-dialogue-sync-receipt.v1';
  packetDigest:string;
  speakerId:string;
  syncedVideoSha256:string;
  dialogueAudioSha256:string;
  verifierId:string;
  verifierState:'declared'|'verified';
  phonemeMouthScore:number;
  nonSpeakingMouthStabilityScore:number;
  identityPreservationScore:number;
  threshold:number;
  sampledFrameSha256s:string[];
  findings?:string[];
}

export interface DialogueSyncPolicy {
  minActivityCorrelation?:number;
  maxBestOffsetMs?:number;
  minVisualSyncScore?:number;
  minNonSpeakingStability?:number;
  minIdentityScore?:number;
  maxDurationDeltaSec?:number;
}

export interface DialogueSyncAdmission {
  schema:'evercraft.fallen.dialogue-sync-admission.v1';
  packetDigest:string;
  speakerId:string;
  syncedVideoSha256:string;
  status:'accepted'|'rejected';
  reasons:string[];
  warnings:string[];
  bestCorrelation:number;
  bestOffsetMs:number;
  visualSyncScore?:number;
  identityScore?:number;
  admissionDigest:string;
  boundaries:{
    providerSuccessIsNotAdmission:true;
    objectiveAndVisualSyncEvidenceRequired:true;
    identityMustSurviveFinishPass:true;
    noPhonemeRecognitionClaim:true;
    publicationAuthorityGranted:false;
  };
  admittedAt:string;
}

function stable(value:unknown):unknown{
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(
      Object.entries(value as Record<string,unknown>)
        .sort(([a],[b])=>a.localeCompare(b))
        .map(([key,item])=>[key,stable(item)])
    );
  }
  return value;
}

function digest(value:unknown){
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function hashFile(filePath:string){
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function run(command:string,args:string[],encoding:BufferEncoding|null='utf8'){
  const result=spawnSync(command,args,{encoding,maxBuffer:128*1024*1024});
  if(result.error) throw new Error(command+'_failed:'+result.error.message);
  if(result.status!==0) throw new Error(command+'_failed:'+String(result.stderr||'').trim().slice(-1200));
  return result.stdout;
}

function mediaDuration(filePath:string){
  const out=run('ffprobe',[
    '-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',filePath
  ]);
  const value=Number(String(out||'').trim());
  if(!Number.isFinite(value)||value<=0) throw new Error('dialogue_sync_duration_invalid:'+filePath);
  return value;
}

function checkDigest(filePath:string,expected:string,label:string){
  if(!fs.existsSync(filePath)) throw new Error('dialogue_sync_file_missing:'+label);
  const observed=hashFile(filePath);
  if(observed!==expected.replace(/^sha256:/,'').toLowerCase()){
    throw new Error('dialogue_sync_digest_mismatch:'+label);
  }
  return observed;
}

function checkRegion(region:NormalizedMouthRegion,index:number){
  const values=[region.x,region.y,region.width,region.height];
  if(values.some(value=>!Number.isFinite(value))) throw new Error('dialogue_sync_mouth_region_invalid:'+index);
  if(region.x<0||region.y<0||region.width<=0||region.height<=0||
     region.x+region.width>1.0001||region.y+region.height>1.0001){
    throw new Error('dialogue_sync_mouth_region_out_of_bounds:'+index);
  }
  if(region.width<.02||region.height<.02) throw new Error('dialogue_sync_mouth_region_too_small:'+index);
}

function extractFrame(inputPath:string,timestampSec:number,outputPath:string){
  run('ffmpeg',[
    '-y','-v','error','-ss',String(timestampSec),'-i',inputPath,
    '-frames:v','1','-vf','scale=960:-2:flags=lanczos',outputPath
  ]);
}

function extractMouth(
  inputPath:string,
  timestampSec:number,
  region:NormalizedMouthRegion,
  outputPath:string
){
  const filter=[
    'crop=iw*'+region.width+':ih*'+region.height+':iw*'+region.x+':ih*'+region.y,
    'scale=64:32:flags=area',
    'format=gray'
  ].join(',');
  run('ffmpeg',[
    '-y','-v','error','-ss',String(timestampSec),'-i',inputPath,
    '-frames:v','1','-vf',filter,outputPath
  ]);
}

function grayBytes(imagePath:string){
  const out=run('ffmpeg',[
    '-v','error','-i',imagePath,'-frames:v','1',
    '-vf','scale=64:32:flags=area,format=gray',
    '-f','rawvideo','-pix_fmt','gray','pipe:1'
  ],null);
  return Buffer.isBuffer(out)?out:Buffer.from(out||[]);
}

function normalizedFrameDiff(a:Buffer,b:Buffer){
  const n=Math.min(a.length,b.length);
  if(!n) return 0;
  let sum=0;
  for(let i=0;i<n;i+=1) sum+=Math.abs(a[i]-b[i]);
  return sum/(n*255);
}

function decodeAudioMono16k(filePath:string){
  const out=run('ffmpeg',[
    '-v','error','-i',filePath,
    '-ac','1','-ar','16000','-f','s16le','pipe:1'
  ],null);
  return Buffer.isBuffer(out)?out:Buffer.from(out||[]);
}

function rmsAt(audio:Buffer,timestampSec:number,windowSec=.1){
  const sampleRate=16000;
  const center=Math.round(timestampSec*sampleRate);
  const radius=Math.max(1,Math.round(windowSec*sampleRate/2));
  const start=Math.max(0,center-radius);
  const end=Math.min(Math.floor(audio.length/2),center+radius);
  if(end<=start) return 0;
  let sum=0,count=0;
  for(let i=start;i<end;i+=1){
    const value=audio.readInt16LE(i*2)/32768;
    sum+=value*value;count+=1;
  }
  return count?Math.sqrt(sum/count):0;
}

function normalize(values:number[]){
  if(!values.length) return [];
  const min=Math.min(...values),max=Math.max(...values);
  if(max-min<1e-8) return values.map(()=>0);
  return values.map(value=>(value-min)/(max-min));
}

function pearson(a:number[],b:number[]){
  const n=Math.min(a.length,b.length);
  if(n<3) return 0;
  const aa=a.slice(0,n),bb=b.slice(0,n);
  const ma=aa.reduce((x,y)=>x+y,0)/n,mb=bb.reduce((x,y)=>x+y,0)/n;
  let numerator=0,da=0,db=0;
  for(let i=0;i<n;i+=1){
    const xa=aa[i]-ma,xb=bb[i]-mb;
    numerator+=xa*xb;da+=xa*xa;db+=xb*xb;
  }
  if(da<=1e-12||db<=1e-12) return 0;
  return numerator/Math.sqrt(da*db);
}

export function bestActivityAlignment(input:{
  audioActivity:number[];
  mouthActivity:number[];
  sampleStepMs:number;
  maxOffsetMs?:number;
}){
  const audio=normalize(input.audioActivity);
  const mouth=normalize(input.mouthActivity);
  const maxShift=Math.max(0,Math.floor((input.maxOffsetMs??500)/input.sampleStepMs));
  let bestCorrelation=-1,bestShift=0;
  for(let shift=-maxShift;shift<=maxShift;shift+=1){
    const a:number[]=[],m:number[]=[];
    for(let i=0;i<audio.length;i+=1){
      const j=i+shift;
      if(j<0||j>=mouth.length) continue;
      a.push(audio[i]);m.push(mouth[j]);
    }
    const corr=pearson(a,m);
    if(corr>bestCorrelation){
      bestCorrelation=corr;bestShift=shift;
    }
  }
  return {
    zeroLagCorrelation:Number(pearson(audio,mouth).toFixed(4)),
    bestCorrelation:Number(Math.max(-1,bestCorrelation).toFixed(4)),
    bestOffsetMs:bestShift*input.sampleStepMs,
  };
}

export function prepareDialogueSyncPacket(
  request:DialogueSyncRequest,
):DialogueSyncPacket{
  if(request.schema!=='evercraft.fallen.dialogue-sync-request.v1') throw new Error('dialogue_sync_schema_invalid');
  if(!request.id?.trim()) throw new Error('dialogue_sync_id_missing');
  if(!request.speakerId?.trim()) throw new Error('dialogue_sync_speaker_missing');
  if(request.mouthTrack.length<6) throw new Error('dialogue_sync_mouth_track_insufficient');
  if(!request.mouthTrackEvidenceRefs.length) throw new Error('dialogue_sync_mouth_track_evidence_missing');

  const sourceVideoSha256=checkDigest(request.sourceVideoPath,request.sourceVideoSha256,'source_video');
  const syncedVideoSha256=checkDigest(request.syncedVideoPath,request.syncedVideoSha256,'synced_video');
  const dialogueAudioSha256=checkDigest(request.dialogueAudioPath,request.dialogueAudioSha256,'dialogue_audio');

  const duration={
    sourceVideoSec:mediaDuration(request.sourceVideoPath),
    syncedVideoSec:mediaDuration(request.syncedVideoPath),
    dialogueAudioSec:mediaDuration(request.dialogueAudioPath),
  };

  const track=[...request.mouthTrack].sort((a,b)=>a.timestampSec-b.timestampSec);
  for(let i=0;i<track.length;i+=1){
    checkRegion(track[i].region,i);
    if(!Number.isFinite(track[i].timestampSec)||track[i].timestampSec<0||track[i].timestampSec>duration.syncedVideoSec+.05){
      throw new Error('dialogue_sync_timestamp_invalid:'+i);
    }
    if(i>0&&track[i].timestampSec<=track[i-1].timestampSec){
      throw new Error('dialogue_sync_timestamps_not_strict:'+i);
    }
  }

  const deltas=track.slice(1).map((sample,index)=>sample.timestampSec-track[index].timestampSec);
  const stepSec=deltas.reduce((a,b)=>a+b,0)/deltas.length;
  if(stepSec>.25) throw new Error('dialogue_sync_mouth_track_too_sparse');

  const audio=decodeAudioMono16k(request.dialogueAudioPath);
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-dialogue-sync-'));
  const rawMouth:Buffer[]=[];
  const samples=track.map((sample,index)=>{
    const frame=path.join(root,'frame-'+String(index).padStart(3,'0')+'.jpg');
    const mouth=path.join(root,'mouth-'+String(index).padStart(3,'0')+'.png');
    extractFrame(request.syncedVideoPath,sample.timestampSec,frame);
    extractMouth(request.syncedVideoPath,sample.timestampSec,sample.region,mouth);
    const bytes=grayBytes(mouth);
    rawMouth.push(bytes);
    const mouthActivity=index===0?0:normalizedFrameDiff(rawMouth[index-1],bytes);
    return {
      timestampSec:sample.timestampSec,
      frameSha256:hashFile(frame),
      mouthCropSha256:hashFile(mouth),
      audioActivity:rmsAt(audio,sample.timestampSec),
      mouthActivity,
    };
  });

  const audioActivity=samples.map(sample=>sample.audioActivity);
  const mouthActivity=samples.map(sample=>sample.mouthActivity);
  const sampleStepMs=Math.max(1,Math.round(stepSec*1000));
  const alignment=bestActivityAlignment({
    audioActivity,mouthActivity,sampleStepMs,maxOffsetMs:500
  });
  const normAudio=normalize(audioActivity),normMouth=normalize(mouthActivity);
  const audioActiveFraction=normAudio.filter(value=>value>.18).length/normAudio.length;
  const mouthActiveFraction=normMouth.filter(value=>value>.18).length/normMouth.length;

  const core={
    schema:'evercraft.fallen.dialogue-sync-packet.v1' as const,
    id:request.id,
    speakerId:request.speakerId,
    sourceVideoSha256,
    syncedVideoSha256,
    dialogueAudioSha256,
    duration,
    samples,
    alignment:{
      ...alignment,
      audioActiveFraction:Number(audioActiveFraction.toFixed(4)),
      mouthActiveFraction:Number(mouthActiveFraction.toFixed(4)),
    },
    mouthTrackEvidenceRefs:[...new Set(request.mouthTrackEvidenceRefs)],
    boundaries:{
      exactMediaDigestsBound:true as const,
      objectiveActivityAlignmentMeasured:true as const,
      localActivityIsNotPhonemeProof:true as const,
      verifiedVisualSyncReceiptRequired:true as const,
      postSyncIdentityEvidenceRequired:true as const,
      publicationAuthorityGranted:false as const,
    },
    createdAt:new Date().toISOString(),
  };
  return {...core,packetDigest:digest({...core,createdAt:undefined})};
}

function bestIdentityEvidence(
  packet:DialogueSyncPacket,
  evidence:IdentityEvidence[],
  minScore:number,
){
  return evidence
    .filter(item=>
      item.entityId===packet.speakerId&&
      item.verifierState==='verified'&&
      item.candidateDigest===packet.syncedVideoSha256&&
      item.referenceAssetIds.length>0&&
      Number.isFinite(item.score)&&
      item.score>=Math.max(minScore,item.threshold)
    )
    .sort((a,b)=>b.score-a.score)[0];
}

export function admitDialogueSync(input:{
  packet:DialogueSyncPacket;
  visualReceipt?:VisualDialogueSyncReceipt;
  identityEvidence:IdentityEvidence[];
  policy?:DialogueSyncPolicy;
}):DialogueSyncAdmission{
  const policy={
    minActivityCorrelation:input.policy?.minActivityCorrelation??.18,
    maxBestOffsetMs:input.policy?.maxBestOffsetMs??180,
    minVisualSyncScore:input.policy?.minVisualSyncScore??.82,
    minNonSpeakingStability:input.policy?.minNonSpeakingStability??.78,
    minIdentityScore:input.policy?.minIdentityScore??.86,
    maxDurationDeltaSec:input.policy?.maxDurationDeltaSec??.2,
  };
  const {packet}=input;
  const reasons:string[]=[];
  const warnings:string[]=[];

  if(Math.abs(packet.duration.sourceVideoSec-packet.duration.syncedVideoSec)>policy.maxDurationDeltaSec){
    reasons.push('sync_changed_video_duration');
  }
  if(packet.duration.dialogueAudioSec>packet.duration.syncedVideoSec+policy.maxDurationDeltaSec){
    reasons.push('dialogue_audio_longer_than_synced_video');
  }
  if(packet.alignment.audioActiveFraction<.03) reasons.push('dialogue_audio_activity_missing');
  if(packet.alignment.mouthActiveFraction<.03) reasons.push('mouth_activity_missing');
  if(packet.alignment.bestCorrelation<policy.minActivityCorrelation) reasons.push('av_activity_correlation_too_low');
  if(Math.abs(packet.alignment.bestOffsetMs)>policy.maxBestOffsetMs) reasons.push('av_activity_offset_too_large');
  else if(Math.abs(packet.alignment.bestOffsetMs)>policy.maxBestOffsetMs*.7) warnings.push('av_activity_offset_near_limit');

  const identity=bestIdentityEvidence(packet,input.identityEvidence,policy.minIdentityScore);
  if(!identity) reasons.push('post_sync_identity_evidence_missing_or_failed');

  const receipt=input.visualReceipt;
  let visualSyncScore:number|undefined;
  if(!receipt){
    reasons.push('verified_visual_dialogue_sync_receipt_missing');
  }else{
    if(receipt.schema!=='evercraft.fallen.visual-dialogue-sync-receipt.v1') reasons.push('dialogue_sync_receipt_schema_invalid');
    if(receipt.packetDigest!==packet.packetDigest) reasons.push('dialogue_sync_receipt_packet_mismatch');
    if(receipt.speakerId!==packet.speakerId) reasons.push('dialogue_sync_receipt_speaker_mismatch');
    if(receipt.syncedVideoSha256!==packet.syncedVideoSha256) reasons.push('dialogue_sync_receipt_video_mismatch');
    if(receipt.dialogueAudioSha256!==packet.dialogueAudioSha256) reasons.push('dialogue_sync_receipt_audio_mismatch');
    if(receipt.verifierState!=='verified') reasons.push('dialogue_sync_receipt_unverified');
    const frames=new Set(packet.samples.map(sample=>sample.frameSha256));
    if([...frames].some(frame=>!receipt.sampledFrameSha256s.includes(frame))) reasons.push('dialogue_sync_receipt_frame_coverage_missing');
    const threshold=Math.max(policy.minVisualSyncScore,receipt.threshold);
    if(!Number.isFinite(receipt.phonemeMouthScore)||receipt.phonemeMouthScore<threshold){
      reasons.push('visual_phoneme_mouth_score_failed');
    }else visualSyncScore=receipt.phonemeMouthScore;
    if(!Number.isFinite(receipt.nonSpeakingMouthStabilityScore)||receipt.nonSpeakingMouthStabilityScore<policy.minNonSpeakingStability){
      reasons.push('non_speaking_mouth_stability_failed');
    }
    if(!Number.isFinite(receipt.identityPreservationScore)||receipt.identityPreservationScore<policy.minIdentityScore){
      reasons.push('visual_identity_preservation_failed');
    }
  }

  const core={
    packetDigest:packet.packetDigest,
    speakerId:packet.speakerId,
    syncedVideoSha256:packet.syncedVideoSha256,
    status:reasons.length?'rejected':'accepted',
    reasons:[...new Set(reasons)],
    warnings:[...new Set(warnings)],
    bestCorrelation:packet.alignment.bestCorrelation,
    bestOffsetMs:packet.alignment.bestOffsetMs,
    visualSyncScore,
    identityScore:identity?.score,
  };

  return {
    schema:'evercraft.fallen.dialogue-sync-admission.v1',
    ...core,
    status:core.status as 'accepted'|'rejected',
    admissionDigest:digest(core),
    boundaries:{
      providerSuccessIsNotAdmission:true,
      objectiveAndVisualSyncEvidenceRequired:true,
      identityMustSurviveFinishPass:true,
      noPhonemeRecognitionClaim:true,
      publicationAuthorityGranted:false,
    },
    admittedAt:new Date().toISOString(),
  };
}
