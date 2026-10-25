#!/usr/bin/env node
// Approved source media + voice/music/SFX -> editable Fallen timeline -> real commercial delivery.
// No media generation, paid calls, or automatic publication. Use node --import tsx.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {planSourceFirstCommercial} from './commercial-shotlist.mjs';
import {makeTimelineProject} from './timeline.ts';
import {finalizeStudioDelivery} from './studio-delivery.ts';

const DESTINATIONS=new Set(['youtube','facebook','instagram','linkedin','tiktok']);
const FORMATS=new Set(['9:16','16:9','1:1']);
const RIGHTS=new Set(['owned','licensed']);
const clean=value=>String(value??'').trim();
function fileHash(file){
  const fd=fs.openSync(file,'r'),sha=crypto.createHash('sha256'),buf=Buffer.allocUnsafe(1024*1024);
  try{
    for(;;){const n=fs.readSync(fd,buf,0,buf.length,null);if(!n)break;sha.update(buf.subarray(0,n));}
  }finally{fs.closeSync(fd);}
  return sha.digest('hex');
}
function probe(file){
  const r=spawnSync('ffprobe',['-v','error','-show_format','-show_streams','-of','json',file],{encoding:'utf8'});
  if(r.error||r.status!==0)throw new Error('commercial_media_probe_failed:'+file);
  const j=JSON.parse(r.stdout),streams=j.streams||[];
  return {durationSec:Number(j.format?.duration)||0,
    audio:streams.some(x=>x.codec_type==='audio'),video:streams.some(x=>x.codec_type==='video')};
}
function approvedFile(item,context){
  if(!item||!clean(item.path)||!fs.existsSync(item.path)||!fs.statSync(item.path).isFile())
    throw new Error('commercial_approved_file_missing:'+context);
  if(!/^[a-f0-9]{64}$/i.test(String(item.sha256||''))||fileHash(item.path).toLowerCase()!==item.sha256.toLowerCase())
    throw new Error('commercial_approved_hash_mismatch:'+context);
  if(!RIGHTS.has(item.rights))throw new Error('commercial_approved_rights_missing:'+context);
  if(!Array.isArray(item.sourceRefs)||!item.sourceRefs.length||item.sourceRefs.some(x=>!clean(x)))
    throw new Error('commercial_approved_provenance_missing:'+context);
  // References are owner-supplied evidence pointers, not independent proof of human listening.
  if(!Array.isArray(item.reviewRefs)||!item.reviewRefs.length||item.reviewRefs.some(x=>!clean(x)))
    throw new Error('commercial_review_evidence_missing:'+context);
}
function audio(item,context){
  approvedFile(item,context);
  const info=probe(item.path);
  if(!info.audio||info.durationSec<=0)throw new Error('commercial_approved_audio_stream_missing:'+context);
  return info.durationSec;
}
function acceptedAudioAsset(item,id){
  return {id,path:path.resolve(item.path),digest:item.sha256,kind:'audio',
    sourceRefs:[...item.sourceRefs,...item.reviewRefs.map(x=>'review:'+x)]};
}
function uniqueKeys(items,fn,context){
  const keys=items.map(fn);
  if(new Set(keys).size!==keys.length)throw new Error('commercial_duplicate_'+context);
}
function almostEqual(x,y){return Math.abs(Number(x)-Number(y))<0.005;}
function sameText(x,y){
  return clean(x).replace(/\s+/g,' ').toLowerCase()===clean(y).replace(/\s+/g,' ').toLowerCase();
}
export function compileApprovedCommercial(input){
  if(input?.schema!=='evercraft.fallen.commercial-assembly.v1')
    throw new Error('commercial_assembly_schema_invalid');
  const plan=planSourceFirstCommercial(input.brief);
  const format=clean(input.format);
  if(!FORMATS.has(format)||!plan.formats.includes(format))throw new Error('commercial_format_not_approved');
  if(!Number.isInteger(input.fps)||input.fps<24||input.fps>60)throw new Error('commercial_fps_invalid');
  if(!Array.isArray(input.destinations)||!input.destinations.length||
     input.destinations.some(x=>!DESTINATIONS.has(x)))throw new Error('commercial_destinations_invalid');
  const approved=input.approvedAudio;
  if(!approved||!Array.isArray(approved.voices)||!Array.isArray(approved.sfx))
    throw new Error('commercial_approved_audio_manifest_missing');

  const sources=new Map(input.brief.sourceAssets.map(item=>[item.id,item]));
  const assets=[],pictureClips=[],voiceClips=[],sfxClips=[];
  for(const key of new Set(plan.timeline.map(item=>item.assetId))){
    const item=sources.get(key),media=probe(item.path);
    if(!media.video)throw new Error('commercial_visual_stream_missing:'+key);
    assets.push({id:'picture-'+key,path:path.resolve(item.path),digest:item.sha256,
      kind:item.mediaKind,sourceRefs:[...item.sourceRefs],evidenceState:item.evidenceState});
  }
  for(const item of plan.timeline){
    const source=sources.get(item.assetId),media=probe(source.path);
    if(source.mediaKind==='video'&&media.durationSec+0.05<item.durationSec)
      throw new Error('commercial_source_too_short:'+item.id);
    pictureClips.push({id:'picture-'+item.id,trackId:'picture',
      assetId:'picture-'+item.assetId,startSec:item.startSec,durationSec:item.durationSec});
  }

  uniqueKeys(approved.voices,x=>clean(x.sceneId),'voice_scene');
  if(approved.voices.length!==plan.voiceTakes.length)throw new Error('commercial_voice_count_mismatch');
  const voiceMap=new Map(approved.voices.map(item=>[clean(item.sceneId),item]));
  for(const cue of plan.voiceTakes){
    const row=voiceMap.get(cue.sceneId);
    if(!row)throw new Error('commercial_voice_take_missing:'+cue.sceneId);
    if(!sameText(cue.text,row.scriptText))throw new Error('commercial_voice_script_mismatch:'+cue.sceneId);
    if(!clean(row.voiceProfileId))throw new Error('commercial_voice_identity_unlocked:'+cue.sceneId);
    const observed=audio(row,'voice-'+cue.sceneId);
    const offset=Number(row.offsetSec??0),used=Number(row.durationSec??observed);
    if(!Number.isFinite(offset)||offset<0||!Number.isFinite(used)||used<=0||
       used>observed+0.01||used+offset>cue.endSec-cue.startSec+0.01)
      throw new Error('commercial_voice_window_invalid:'+cue.sceneId);
    const id='voice-'+cue.sceneId;
    assets.push(acceptedAudioAsset(row,id));
    voiceClips.push({id:'clip-'+id,trackId:'voice',assetId:id,
      startSec:Number((cue.startSec+offset).toFixed(3)),durationSec:used});
  }

  const musicLength=audio(approved.music,'music');
  if(musicLength+0.05<plan.durationSec)throw new Error('commercial_score_too_short');
  assets.push(acceptedAudioAsset(approved.music,'approved-score'));
  const musicClips=[{id:'music-master',trackId:'music',assetId:'approved-score',
    startSec:0,durationSec:plan.durationSec}];

  uniqueKeys(approved.sfx,x=>clean(x.sceneId)+':'+Number(x.atSec).toFixed(3),'sfx_cue');
  if(approved.sfx.length!==plan.sfxSpots.length)throw new Error('commercial_sfx_cue_count_mismatch');
  for(const [index,cue] of plan.sfxSpots.entries()){
    const row=approved.sfx.find(x=>x.sceneId===cue.sceneId && almostEqual(x.atSec,cue.atSec));
    if(!row)throw new Error('commercial_sfx_cue_missing:'+cue.sceneId);
    const length=audio(row,'sfx-'+index),duration=Number(row.durationSec??length);
    if(!Number.isFinite(duration)||duration<=0||duration>length+0.01||
       cue.atSec+duration>plan.durationSec+0.01)
      throw new Error('commercial_sfx_duration_invalid:'+index);
    const id='sfx-'+index;
    assets.push(acceptedAudioAsset(row,id));
    sfxClips.push({id:'clip-'+id,trackId:'sfx',assetId:id,
      startSec:cue.atSec,durationSec:duration});
  }

  if(plan.voiceTakes.length && !approved.captions)throw new Error('commercial_accessible_captions_required');
  const captionClips=[];
  if(approved.captions){
    const cap=approved.captions;
    approvedFile(cap,'captions');
    if(path.extname(cap.path).toLowerCase()!=='.srt')throw new Error('commercial_captions_srt_required');
    assets.push({id:'approved-captions',path:path.resolve(cap.path),digest:cap.sha256,
      kind:'captions',sourceRefs:[...cap.sourceRefs,...cap.reviewRefs.map(x=>'review:'+x)]});
    captionClips.push({id:'caption-track',trackId:'captions',assetId:'approved-captions',
      startSec:0,durationSec:plan.durationSec});
  }

  const project=makeTimelineProject({
    id:'commercial-'+plan.id+'-'+format.replace(':','x'),
    title:plan.brand+' | '+plan.offer,
    aspectRatio:format,fps:input.fps,assets,
    tracks:[
      {id:'picture',kind:'video',name:'Approved source footage',clips:pictureClips},
      {id:'voice',kind:'voice',name:'Approved natural narration',clips:voiceClips},
      {id:'music',kind:'music',name:'Approved original score',clips:musicClips},
      {id:'sfx',kind:'sfx',name:'Approved synchronized effects',clips:sfxClips},
      ...(captionClips.length?[{id:'captions',kind:'captions',name:'Reviewed captions',clips:captionClips}]:[])
    ],
    audioMaster:{targetLufs:-16,truePeakDb:-1.5,lra:9,dialogueDucking:true,
      duckThreshold:0.05,duckRatio:8,attackMs:20,releaseMs:350,sampleRate:48000}
  });
  const delivery={
    schema:'evercraft.fallen.studio-delivery-request.v1',id:project.id,
    slug:project.id,project,
    destinations:[...new Set(input.destinations)],
    metadata:{title:clean(input.title)||project.title,
      description:clean(input.description)||undefined,
      language:clean(input.language)||'en',
      tags:Array.isArray(input.tags)?input.tags:[]},
    qualityMode:'commercial',
    commercialAudioFinishing:'two_pass'
  };
  return {schema:'evercraft.fallen.approved-commercial-assembly.v1',
    status:'ready_to_render_not_creatively_approved_by_system',
    sourceFirstPlanDigest:plan.planDigest,format,durationSec:plan.durationSec,
    deliveryRequest:delivery,
    gates:{sourceFilesHashed:true,reviewReferencesSupplied:true,
      independentRightsVerificationPerformed:false,
      humanListeningVerifiedBySystem:false,commercialOutputRendered:false,
      publicationAuthorityGranted:false}};
}
export function renderApprovedCommercial(input,outputDir){
  const compiled=compileApprovedCommercial(input);
  const out=finalizeStudioDelivery({request:compiled.deliveryRequest,outputDir});
  return {schema:'evercraft.fallen.approved-commercial-render.v1',
    status:'rendered_and_technically_qc_accepted',
    sourceFirstPlanDigest:compiled.sourceFirstPlanDigest,
    mediaSha256:out.mediaSha256,videoPath:out.videoPath,clipManifestPath:out.clipManifestPath,
    audioQcReceiptPath:out.commercialAudioQcReceiptPath,
    qualityMode:out.qualityMode,
    boundaries:{originalFootageSourceVerifiedByHash:true,
      realHumanListenOrVisualReviewNotIndependentlyVerified:true,
      platformPublished:false,publicationAuthorityGranted:false}};
}
function main(){
  const [inputFile,outputDir,mode]=process.argv.slice(2);
  if(!inputFile||!outputDir||!['plan','render'].includes(mode))
    throw new Error('Usage: node --import tsx commercial-assembly.mjs <assembly.json> <outputDir> plan|render');
  const input=JSON.parse(fs.readFileSync(inputFile,'utf8'));
  fs.mkdirSync(outputDir,{recursive:true});
  const result=mode==='render'?renderApprovedCommercial(input,outputDir):compileApprovedCommercial(input);
  const filename=path.join(outputDir,mode==='render'?'commercial-render-receipt.json':'commercial-editable-project.json');
  fs.writeFileSync(filename,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({status:result.status,receipt:filename},null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{main();}catch(error){console.error(error?.stack||String(error));process.exitCode=2;}
}
