#!/usr/bin/env node
// Operator-local, real MP4 production proof for an ALREADY reviewed Fallen revision.
// Consumes the existing Preview Note -> Saban stage, Shot Tournament and Fallen
// renderer. No provider calls, candidate generation, payment or publication.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {stagePreviewNoteHandoff} from './preview-note-saban-handoff.mjs';
import {runShotTournament} from './shot-tournament-runner.mjs';
import {
  readTimelineVersion,readTimelineVersionHistory,saveTimelineVersion,
} from './timeline-version-vault.mjs';
import {replaceTimelineClipAsset,timelineDigest} from './timeline.js';
import {finalizeStudioDelivery} from './studio-delivery.js';

export const APPROVED_REVISION_RENDER_SCHEMA='evercraft.fallen.approved-revision-render.v1';
const HEX=/^[a-f0-9]{64}$/;
const PRIVATE=/^private:[A-Za-z0-9_./:-]{6,140}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{2,100}$/;
function shaFile(file){
  const hash=crypto.createHash('sha256'),buf=Buffer.allocUnsafe(512*1024);
  const fd=fs.openSync(file,'r');
  try{for(;;){const n=fs.readSync(fd,buf,0,buf.length,null);if(!n)break;hash.update(buf.subarray(0,n));}}
  finally{fs.closeSync(fd);}
  return hash.digest('hex');
}
function verifyPrivateFile(root,relative,expectedSha){
  if(!HEX.test(expectedSha||'')||typeof relative!=='string'||!relative||
    path.isAbsolute(relative)||relative.split(/[\\/]/).some(s=>s==='..')||
    path.extname(relative).toLowerCase()!=='.mp4')
    throw Error('fallen_revision_candidate_path_or_sha_invalid');
  const dir=path.resolve(root),base=fs.lstatSync(dir);
  if(base.isSymbolicLink()||!base.isDirectory())
    throw Error('fallen_revision_candidate_root_unsafe');
  const resolved=path.resolve(dir,relative);
  if(!resolved.startsWith(dir+path.sep))throw Error('fallen_revision_candidate_path_escape');
  let cursor=dir;
  for(const part of path.relative(dir,resolved).split(path.sep)){
    cursor=path.join(cursor,part);
    if(fs.lstatSync(cursor).isSymbolicLink())
      throw Error('fallen_revision_candidate_symlink_forbidden');
  }
  const stat=fs.lstatSync(resolved);
  if(!stat.isFile()||stat.size<100||stat.size>1_073_741_824)
    throw Error('fallen_revision_candidate_file_invalid');
  if(shaFile(resolved)!==expectedSha)
    throw Error('fallen_revision_candidate_sha_mismatch');
  const run=spawnSync('ffprobe',['-v','error','-show_format','-show_streams',
    '-of','json',resolved],{encoding:'utf8',maxBuffer:1_000_000,timeout:15000});
  if(run.error||run.status!==0)throw Error('fallen_revision_candidate_probe_failed');
  const meta=JSON.parse(run.stdout),video=meta.streams?.find(s=>s.codec_type==='video');
  const durationSec=Number(meta.format?.duration);
  if(!video||!Number.isFinite(durationSec)||durationSec<=0)
    throw Error('fallen_revision_candidate_no_video');
  return {resolved,durationSec};
}
function privateOutputDir(outputDir){
  const resolved=path.resolve(outputDir);
  const parent=path.dirname(resolved),stat=fs.lstatSync(parent);
  if(stat.isSymbolicLink()||!stat.isDirectory())throw Error('fallen_revision_output_parent_unsafe');
  fs.mkdirSync(resolved,{mode:0o700});
  fs.chmodSync(resolved,0o700);
  return resolved;
}
function restrictOutputFiles(root){
  for(const item of fs.readdirSync(root,{withFileTypes:true})){
    if(item.isFile())fs.chmodSync(path.join(root,item.name),0o600);
  }
}
function requireTournamentLink(stage,tournamentInput,mediaRelativePath){
  if(stage.status!=='CANDIDATES_NEEDED'||
     stage.staged?.generationNeeds?.length!==1||
     stage.staged?.audioReviewNeeds?.length!==0)
    throw Error('fallen_revision_visual_candidate_stage_required');
  const need=stage.staged.generationNeeds[0];
  if(need.requiresTournament!==true||need.directTimelineMutationAllowed!==false||
     need.projectId!==stage.projectId)
    throw Error('fallen_revision_generation_need_not_gated');
  if(tournamentInput?.schema!=='evercraft.fallen.shot-tournament-run.v1'||
     tournamentInput.needId!==need.id||tournamentInput.shotId!==need.clipId||
     !Array.isArray(tournamentInput.candidates)||
     tournamentInput.candidates.length<2)
    throw Error('fallen_revision_tournament_scope_mismatch');
  if(typeof mediaRelativePath!=='string'||!mediaRelativePath.trim())
    throw Error('fallen_revision_winner_media_required');
  return need;
}
/** Does real, offline H264/AAC rendering and master QC with existing Fallen tools.
 * Only after a successful QC and unchanged head does it append v+1.
 * Operator/rights references are NOT cryptographically authenticated.
 */
export async function renderApprovedRevision(input){
  const {
    context,noteId,proposalPacket,expectedBridgeDigest,operatorApprovalReference,
    tournamentInput,winnerRelativeMediaPath,operatorRightsRefs,operatorVisualReviewRefs,
    snapshotScopeReference,outputDir,
  }=input||{};
  if(!PRIVATE.test(snapshotScopeReference||'')||
     !Array.isArray(operatorRightsRefs)||operatorRightsRefs.length===0||
     !Array.isArray(operatorVisualReviewRefs)||operatorVisualReviewRefs.length===0||
     [...operatorRightsRefs,...operatorVisualReviewRefs].some(x=>!PRIVATE.test(x)))
    throw Error('fallen_revision_owner_rights_or_review_missing');
  const stage=stagePreviewNoteHandoff({
    ...context,noteId,proposalPacket,expectedBridgeDigest,operatorApprovalReference,
  });
  const need=requireTournamentLink(stage,tournamentInput,winnerRelativeMediaPath);
  const tournament=await runShotTournament(tournamentInput);
  const selection=tournament.selectionReceipt;
  if(tournament.status!=='selected'||!selection||
     selection.needId!==need.id||selection.tournamentReceiptDigest!==tournament.tournamentReceiptDigest)
    throw Error('fallen_revision_tournament_not_selected');
  const winner=tournamentInput.candidates.find(c=>c.id===selection.candidateId);
  if(!winner||winner.shotId!==need.clipId||winner.artifactDigest!==selection.artifactDigest||
     winner.kind!=='video'||winner.aspectRatio!==need.aspectRatio||
     winner.sourceState==='generated_visualization'&&winner.syntheticLabelPresent!==true||
     winner.provenance!=='complete'||!ID.test(winner.id))
    throw Error('fallen_revision_winner_invalid');
  const project=readTimelineVersion({root:context.vaultRoot,projectId:stage.projectId});
  if(project.version!==stage.projectVersion||timelineDigest(project)!==stage.projectDigest)
    throw Error('fallen_revision_stale_head_before_render');
  const media=verifyPrivateFile(context.mediaRoot,winnerRelativeMediaPath,selection.artifactDigest);
  if(path.resolve(winner.artifactPath||'')!==media.resolved)
    throw Error('fallen_revision_tournament_file_not_bound');
  if(media.durationSec+0.03<need.durationSec||
     !Number.isFinite(Number(winner.durationSec))||
     Number(winner.durationSec)+0.03<need.durationSec)
    throw Error('fallen_revision_winner_duration_too_short');
  const original=project.tracks.flatMap(t=>t.clips).find(c=>c.id===need.clipId);
  if(!original)throw Error('fallen_revision_clip_missing');
  const originalAsset=project.assets.find(a=>a.id===original.assetId);
  if(!originalAsset||originalAsset.kind!=='video')
    throw Error('fallen_revision_picture_source_not_video');
  const newAsset={
    id:'reviewed-'+winner.id+'-'+selection.artifactDigest.slice(0,12),
    path:media.resolved,digest:selection.artifactDigest,kind:'video',
    sourceRefs:[...operatorRightsRefs,...operatorVisualReviewRefs,
      'tournament:'+tournament.tournamentReceiptDigest,
      'preview-note:'+stage.noteId,
      ...originalAsset.sourceRefs],
    evidenceState:winner.sourceState==='generated_visualization'||
      winner.sourceState==='modeled_visualization'
      ?'synthetic_visualization':winner.sourceState==='licensed_source'?'licensed':'observed',
    ...(originalAsset.continuityDigest?{continuityDigest:originalAsset.continuityDigest}:{}),
  };
  const replaced=replaceTimelineClipAsset({project,clipId:need.clipId,
    newAsset,expectedVersion:project.version});
  if(replaced.receipt.preserved.downstreamClipTiming!==true||
    replaced.receipt.preserved.startTime!==true||
    replaced.receipt.preserved.duration!==true)
    throw Error('fallen_revision_timeline_preservation_failed');
  if(input.dryRun===true){
    return {
      schema:APPROVED_REVISION_RENDER_SCHEMA,status:'READY_TO_RENDER_NOT_YET_EXECUTED',
      sourceProjectDigest:stage.projectDigest,nextProjectDigest:timelineDigest(replaced.project),
      noteId:stage.noteId,needId:need.id,clipId:need.clipId,
      tournamentReceiptDigest:tournament.tournamentReceiptDigest,
      publicationAuthority:false,
    };
  }
  const destination=privateOutputDir(outputDir);
  const delivery=finalizeStudioDelivery({
    request:{
      schema:'evercraft.fallen.studio-delivery-request.v1',
      id:'revision-'+stage.noteId,
      slug:'fallen-private-revision-'+stage.noteId,
      project:replaced.project,
      destinations:['youtube'],
      metadata:{title:project.title+' | Private revision review',
        description:'Unreleased operator-only preview; not customer approved.',
        language:'en'},
      qualityMode:'standard',
    },
    outputDir:destination,
  });
  restrictOutputFiles(destination);
  if(delivery.state!=='ready_for_clip_intake'||delivery.publicationAuthorityGranted!==false)
    throw Error('fallen_revision_delivery_not_technically_accepted');
  const finalHead=readTimelineVersionHistory({root:context.vaultRoot,projectId:project.id});
  if(finalHead.head?.projectDigest!==stage.projectDigest||
     finalHead.head?.version!==stage.projectVersion)
    throw Error('fallen_revision_head_changed_during_render');
  const saved=saveTimelineVersion({
    root:context.vaultRoot,project:replaced.project,
    expectedHeadDigest:stage.projectDigest,
    operatorScopeReference:snapshotScopeReference,
  });
  const packet={
    schema:APPROVED_REVISION_RENDER_SCHEMA,
    status:'PRIVATE_RENDER_TECHNICALLY_ACCEPTED_PENDING_HUMAN_REVIEW',
    projectId:project.id,fromVersion:project.version,toVersion:replaced.project.version,
    fromProjectDigest:stage.projectDigest,toProjectDigest:saved.projectDigest,
    noteId:stage.noteId,noteDigest:stage.noteDigest,
    oldClipAssetDigest:originalAsset.digest,newClipAssetDigest:newAsset.digest,
    changedClipId:need.clipId,unchangedClipTiming:true,
    tournamentReceiptDigest:tournament.tournamentReceiptDigest,
    selectionReceipt:selection,renderReceiptPath:delivery.renderReceiptPath,
    masterQcReceiptPath:delivery.masterQcReceiptPath,
    encodedMediaSha256:delivery.mediaSha256,encodedMediaPath:delivery.videoPath,
    boundaries:{operatorReferencesNotIndependentlyAuthenticated:true,
      preservedPriorTimelineVersion:true,noPaidModelExecution:true,
      finalHumanAudioVisualRightsReviewRequired:true,
      noCustomerDelivery:true,noPaymentAuthority:true,noPublicationAuthority:true},
  };
  fs.writeFileSync(path.join(destination,'private-revision-render-receipt.json'),
    JSON.stringify(packet,null,2)+'\n',{flag:'wx',mode:0o600});
  return packet;
}
async function main(){
  const file=process.argv[2];
  if(!file||process.argv.length!==3)
    throw Error('Usage: node --import tsx systemia/media-studio/approved-revision-render.mjs <private-job.json>');
  const stat=fs.lstatSync(path.resolve(file));
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>250000)
    throw Error('fallen_revision_job_file_unsafe');
  const job=JSON.parse(fs.readFileSync(file,'utf8'));
  const result=await renderApprovedRevision(job);
  console.log(JSON.stringify({status:result.status,projectId:result.projectId||null,
    output:result.encodedMediaPath||null,publicationAuthority:false}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  main().catch(e=>{console.error(e instanceof Error?e.message:'approved_revision_render_failed');process.exitCode=1;});
}
