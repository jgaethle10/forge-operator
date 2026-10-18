#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {assessStudioMaster} from '../media-studio/master-qc.ts';
import {assessCreativeDecision,gateCreativeCandidate} from './creative-decision.mjs';

const fileHash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function run(binary,args,{binaryOutput=false}={}){
  const r=spawnSync(binary,args,{encoding:binaryOutput?null:'utf8',maxBuffer:128*1024*1024});
  if(r.error||r.status!==0) throw new Error('emotional_master_tool_failed:'+binary+':'+String(r.stderr||r.error||'').slice(-900));
  return r.stdout;
}
function durationFrames(videoPath){
  const raw=run('ffprobe',['-v','error','-select_streams','v:0','-count_frames','-show_entries','stream=nb_read_frames','-of','default=nw=1:nk=1',videoPath]);
  return Number(String(raw).trim());
}
function extractExactFrame(videoPath,frameNumber,output){
  const pixels=run('ffmpeg',['-v','error','-i',videoPath,'-vf','select=eq(n\\,'+frameNumber+')','-frames:v','1','-vsync','0','-f','image2pipe','-vcodec','png','pipe:1'],{binaryOutput:true});
  if(!Buffer.isBuffer(pixels)||pixels.length<100) throw new Error('emotional_master_frame_extraction_empty:'+frameNumber);
  fs.writeFileSync(output,pixels);
  return {frame:frameNumber,path:output,sha256:fileHash(output)};
}
function audioMetrics(videoPath){
  const r=spawnSync('ffmpeg',['-hide_banner','-nostats','-i',videoPath,'-af','ebur128=peak=true','-f','null','-'],{encoding:'utf8',maxBuffer:32*1024*1024});
  if(r.error||r.status!==0) throw new Error('emotional_master_audio_meter_failed');
  const s=r.stderr;
  const summary=s.slice(s.lastIndexOf('Summary:'));
  const integrated=summary.match(/Integrated loudness:\s*I:\s*(-?[\d.]+)/);
  const peak=summary.match(/True peak:\s*Peak:\s*(-?[\d.]+)/);
  return {integratedLufs:integrated?Number(integrated[1]):null,truePeakDbfs:peak?Number(peak[1]):null,reviewRequired:true};
}
export function reviewEmotionalMaster({editMapPath,videoPath,outputDir,minShortEdge=1080,creativeDecisionPath}){
  const edit=JSON.parse(fs.readFileSync(editMapPath,'utf8'));
  if(edit.schema!=='evercraft.graphics-command.emotional-edit-map.v1') throw new Error('emotional_master_edit_schema_invalid');
  if(!Number.isInteger(edit.durationFrames)||edit.durationFrames<1||!Number.isInteger(edit.frameRate)) throw new Error('emotional_master_timeline_invalid');
  if(!Array.isArray(edit.beats)||edit.beats.length<1||edit.beats[0].startFrame!==0||edit.beats.at(-1).endFrame!==edit.durationFrames){
    throw new Error('emotional_master_beat_coverage_invalid');
  }
  for(let i=0;i<edit.beats.length;i++){
    const b=edit.beats[i];
    if(!Number.isInteger(b.startFrame)||!Number.isInteger(b.endFrame)||b.startFrame>=b.endFrame||(i&&b.startFrame!==edit.beats[i-1].endFrame)){
      throw new Error('emotional_master_beat_continuity_invalid');
    }
  }
  if(!Number.isInteger(minShortEdge)||minShortEdge<240) throw new Error('emotional_master_resolution_policy_invalid');
  fs.mkdirSync(outputDir,{recursive:true});
  const technical=assessStudioMaster({filePath:videoPath,policy:{
    expectedDurationSec:edit.durationSec,durationToleranceSec:.12,minShortEdge,
    minFps:edit.frameRate-.05,requireAudio:true,
  }});
  const measuredFrames=durationFrames(videoPath);
  const frameCountPassed=measuredFrames===edit.durationFrames;
  const samples=edit.beats.map(beat=>extractExactFrame(
    videoPath,beat.startFrame+Math.floor((beat.endFrame-beat.startFrame)/2),
    path.join(outputDir,'beat-'+beat.shotId.replace(/[^a-z0-9-]/gi,'-')+'.png')
  ));
  const audio=audioMetrics(videoPath);
  const blockedReasons=[
    ...technical.reasons,
    ...(frameCountPassed?[]:['exact_frame_count_mismatch']),
    ...(audio.integratedLufs===null?['audio_loudness_unavailable']:[]),
  ];
  const masterSha256=fileHash(videoPath);
  const creativeDecision=creativeDecisionPath
    ? assessCreativeDecision(JSON.parse(fs.readFileSync(creativeDecisionPath,'utf8')))
    : undefined;
  const creativeCandidateGate=gateCreativeCandidate({
    mediaSha256:masterSha256,
    technicalStatus:blockedReasons.length?'rejected':'technical_pass',
    creativeDecision,
  });
  const core={
    schema:'evercraft.graphics-command.emotional-master-review.v1',
    status:blockedReasons.length?'rejected':'technical_pass',
    campaignId:edit.campaignId,editMapDigest:edit.digest,editMapFileSha256:fileHash(editMapPath),
    masterSha256,actualFrameCount:measuredFrames,expectedFrameCount:edit.durationFrames,
    audio,technical,sampledFrames:samples,
    blockedReasons,creativeCandidateGate,
    creativeFeedbackDigest:creativeDecision?.digest||null,
    creativeFeedbackState:creativeDecision?'review_recorded':'not_submitted',
    creativeReview:{state:'not_performed',emotionContinuity:'unverified',audiovisualSync:'unverified',rights:'unverified',humanReception:'unverified'},
    boundaries:{technicalPassDoesNotProveArtisticQuality:true,noBoardroomReviewImplied:true,notPublicationAuthority:true},
  };
  const receiptPath=path.join(outputDir,'emotional-master-review.json');
  fs.writeFileSync(receiptPath,JSON.stringify(core,null,2)+'\n');
  return {...core,receiptPath};
}
function arg(flag){const i=process.argv.indexOf(flag);return i>=0?process.argv[i+1]:undefined}
if(process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname){
  try{
    const editMapPath=arg('--edit'),videoPath=arg('--video'),outputDir=arg('--out');
    if(!editMapPath||!videoPath||!outputDir) throw new Error('usage: --edit map.json --video master.mp4 --out review-dir [--prototype]');
    const isPrototype=process.argv.includes('--prototype');
    const review=reviewEmotionalMaster({editMapPath,videoPath,outputDir,minShortEdge:isPrototype?240:1080,creativeDecisionPath:arg('--creative-decision')});
    console.log(JSON.stringify({status:review.status,creativeGate:review.creativeCandidateGate.status,sha256:review.masterSha256,frameCount:review.actualFrameCount,report:review.receiptPath,blocked:review.blockedReasons},null,2));
    if(review.status!=='technical_pass') process.exitCode=2;
  }catch(error){console.error(String(error?.stack||error));process.exitCode=1}
}
