#!/usr/bin/env node
// Fallen-owned, RECEIVER-SIDE customer footage qualification.
// Requires Harbor's actual byte receipt. Never uploads, publishes, or grants rights.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {verifyPrivateMediaImport} from '../../scripts/nextgen/verify-harbor-private-media-import.mjs';

export const QUALIFICATION_SCHEMA='evercraft.fallen.harbor-media-qualification.v1';
const HEX=/^[a-f0-9]{64}$/;
const PRIVATE=/^private:[A-Za-z0-9_./:-]{6,140}$/;
const ROLES=new Set(['hook','proof','payoff','cta','support']);
const SUPPORTED=new Set(['image/jpeg','image/png','image/webp','image/heic',
  'video/mp4','video/quicktime']);
const stable=o=>Array.isArray(o)?o.map(stable):o&&typeof o==='object'?
  Object.fromEntries(Object.entries(o).sort(([a],[b])=>a.localeCompare(b))
    .map(([k,v])=>[k,stable(v)])):o;
const sha=v=>crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
function secureRead(file,max=65536){
  const resolved=path.resolve(file),fd=fs.openSync(resolved,fs.constants.O_RDONLY|
    (fs.constants.O_NOFOLLOW||0));
  try{
    const s=fs.fstatSync(fd);
    if(!s.isFile()||s.size<=0||s.size>max)throw Error('fallen_qualify_json_unsafe');
    return JSON.parse(fs.readFileSync(fd,'utf8'));
  }finally{fs.closeSync(fd);}
}
function fileHash(file){
  const hash=crypto.createHash('sha256'),buf=Buffer.allocUnsafe(512*1024);
  const fd=fs.openSync(file,'r');
  try{for(;;){const n=fs.readSync(fd,buf,0,buf.length,null);if(!n)break;hash.update(buf.subarray(0,n));}}
  finally{fs.closeSync(fd);}
  return hash.digest('hex');
}
function run(name,args){
  const x=spawnSync(name,args,{encoding:'utf8',timeout:40000,maxBuffer:4_000_000});
  if(x.error||x.status!==0)throw Error('fallen_qualify_'+name+'_failed');
  return x.stdout;
}
function probe(file,expectedType){
  const p=JSON.parse(run('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file]));
  const stream=p.streams?.find(x=>x.codec_type==='video');
  if(!stream||!Number.isInteger(Number(stream.width))||Number(stream.width)<1||
      !Number.isInteger(Number(stream.height))||Number(stream.height)<1)
    throw Error('fallen_qualify_visual_not_decodable');
  const isVideo=expectedType.startsWith('video/');
  const duration=Number(p.format?.duration??stream.duration??0);
  if(isVideo&&(!Number.isFinite(duration)||duration<0.4))
    throw Error('fallen_qualify_video_duration_invalid');
  const hasAudio=Boolean(p.streams?.some(x=>x.codec_type==='audio'));
  return {kind:isVideo?'video':'image',width:Number(stream.width),
    height:Number(stream.height),durationSec:isVideo?duration:null,
    videoCodec:String(stream.codec_name||'unknown'),hasAudio,
    audioCodec:hasAudio?String(p.streams.find(x=>x.codec_type==='audio').codec_name||'unknown'):null};
}
function safeFolder(folder,{create=false}={}){
  const root=path.resolve(folder);
  if(create&&!fs.existsSync(root))fs.mkdirSync(root,{mode:0o700});
  const stat=fs.lstatSync(root);
  if(stat.isSymbolicLink()||!stat.isDirectory())throw Error('fallen_qualify_unsafe_folder');
  return root;
}
function checkFile(root,name){
  const file=path.join(root,name);
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)
    throw Error('fallen_qualify_source_not_regular');
  return file;
}
function reviewFor(decision,name){
  if(decision===undefined)return {decision:'hold',reason:'operator_visual_rights_review_missing'};
  if(decision?.decision==='exclude')return {decision:'exclude',reason:'operator_rejected_or_not_selected'};
  if(decision?.decision!=='consider')throw Error('fallen_qualify_review_decision_invalid');
  if(!PRIVATE.test(decision.operatorReviewRef||'')||
     !PRIVATE.test(decision.rightsEvidenceRef||'')||
     !['owned','licensed'].includes(decision.rights)||
     !Array.isArray(decision.subjects)||!decision.subjects.length||
     decision.subjects.some(x=>typeof x!=='string'||!x.trim()||x.length>120)||
     !Array.isArray(decision.roles)||!decision.roles.length||
     decision.roles.some(x=>!ROLES.has(x)))
    throw Error('fallen_qualify_review_evidence_missing:'+name);
  return {decision:'consider',rights:decision.rights,rightsEvidenceRef:decision.rightsEvidenceRef,
    operatorReviewRef:decision.operatorReviewRef,subjects:[...new Set(decision.subjects)],
    roles:[...new Set(decision.roles)]};
}
function thumb(file,kind,duration,target){
  const seek=kind==='video'?['-ss',String(Math.min(duration/2,30))]:[];
  run('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-y',...seek,'-i',file,
    '-map','0:v:0','-frames:v','1','-vf',
    'scale=w=640:h=360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2',
    '-pix_fmt','rgb24',target]);
  if(!fs.statSync(target).size)throw Error('fallen_qualify_thumbnail_empty');
  fs.chmodSync(target,0o600);
}
/**
 * A local contact-sheet and factual media probe built from the exact, previously
 * byte-verified Harbor transfer on the same NextGen receiver.
 * Not a commercial-source admission, license certification or finished film.
 */
export async function qualifyPrivateHarborBatch({
  manifestPath,assetDir,receiverReceiptPath,operatorDecisionPath,outputDir,
  expectedCount=12,
}){
  const manifest=secureRead(manifestPath,1_000_000);
  const previous=secureRead(receiverReceiptPath,1_000_000);
  if(previous.schema!=='evercraft.fallen.private-media-import-receipt.v1'||
     previous.state!=='BYTES_REVERIFIED_ONLY'||previous.receiverHostname!==os.hostname()||
     previous.boundaries?.commercialUseRightsVerified!==false||
     previous.boundaries?.fallenProductionAccepted!==false||
     previous.boundaries?.customerPreviewReleaseAllowed!==false)
    throw Error('fallen_qualify_receiver_receipt_not_valid');
  const fresh=await verifyPrivateMediaImport({
    manifestPath,assetDir,operatorRef:previous.operatorRef,expectedCount,
  });
  if(fresh.manifestSha256!==previous.manifestSha256||
     previous.assetCount!==fresh.assetCount||previous.totalBytes!==fresh.totalBytes||
     sha(previous.assets)!==sha(fresh.assets))
    throw Error('fallen_qualify_transfer_receipt_or_bytes_changed');
  const decisions=secureRead(operatorDecisionPath,40000);
  if(decisions.schema!=='evercraft.fallen.private-operator-review.v1'||
    decisions.projectId?.length<3||!PRIVATE.test(decisions.operatorRef||'')||
    !Array.isArray(decisions.excludedPreviousAssetDigests)||
    decisions.excludedPreviousAssetDigests.some(x=>!HEX.test(x))||
    !decisions.perAsset||typeof decisions.perAsset!=='object'||
    Array.isArray(decisions.perAsset)||
    Object.keys(decisions.perAsset).some(k=>!fresh.assets.some(a=>a.filename===k)))
    throw Error('fallen_qualify_operator_review_invalid');
  const excluded=new Set(decisions.excludedPreviousAssetDigests);
  const sourceRoot=safeFolder(assetDir);
  // Verify and inspect every input before creating any output directory.
  const assessed=[];
  for(const [index,item] of fresh.assets.entries()){
    if(!SUPPORTED.has(item.mediaType))throw Error('fallen_qualify_unsupported_media');
    const file=checkFile(sourceRoot,item.filename);
    const media=probe(file,item.mediaType);
    if(fileHash(file)!==item.sha256)throw Error('fallen_qualify_changed_during_probe');
    const review=reviewFor(decisions.perAsset[item.filename],item.filename);
    assessed.push({index,assetId:'source-'+String(index+1).padStart(3,'0'),
      filename:item.filename,sha256:item.sha256,mediaType:item.mediaType,
      width:media.width,height:media.height,kind:media.kind,
      durationSec:media.durationSec,hasAudio:media.hasAudio,
      codec:media.videoCodec,review,
      previouslyRejected:excluded.has(item.sha256),
      sourceReadyForStoryboard:review.decision==='consider'&&!excluded.has(item.sha256)});
  }
  const out=safeFolder(outputDir,{create:true});
  if(fs.readdirSync(out).length!==0)throw Error('fallen_qualify_output_not_empty');
  const thumbs=path.join(out,'contact-frames');fs.mkdirSync(thumbs,{mode:0o700});
  const rows=[];
  for(const item of assessed){
    const full=checkFile(sourceRoot,item.filename);
    if(fileHash(full)!==item.sha256)throw Error('fallen_qualify_bytes_changed_before_thumbnail');
    const png=path.join(thumbs,item.assetId+'.png');
    thumb(full,item.kind,item.durationSec,png);
    rows.push({...item,thumbnailRelativePath:path.relative(out,png),
      thumbnailSha256:fileHash(png)});
  }
  const sourceAssets=rows.filter(x=>x.sourceReadyForStoryboard).map(x=>({
    id:x.assetId,path:checkFile(sourceRoot,x.filename),sha256:x.sha256,
    mediaKind:x.kind,rights:x.review.rights,evidenceState:'observed',
    sourceRefs:['private-transfer:'+fresh.manifestSha256,
      x.review.rightsEvidenceRef,'private-visual-review:'+x.review.operatorReviewRef],
    subjects:x.review.subjects,proposedRoles:x.review.roles,
  }));
  const hookVideo=sourceAssets.some(x=>x.mediaKind==='video'&&
    x.proposedRoles.includes('hook'));
  const state=!sourceAssets.length?'NEEDS_OPERATOR_SOURCE_REVIEW':
    !hookVideo?'NEEDS_APPROVED_REAL_VIDEO_HOOK':'REVIEWED_SOURCE_CANDIDATES_AVAILABLE';
  const receipt={
    schema:QUALIFICATION_SCHEMA,state,projectId:decisions.projectId,
    receiverHostname:os.hostname(),manifestSha256:fresh.manifestSha256,
    byteReceiptState:previous.state,assetCount:rows.length,
    assessedSourceCount:sourceAssets.length,approvedRealVideoHookDeclared:hookVideo,
    rows,sourceAssets,
    boundaries:{
      ownedReceiverOnly:true,allFilesLocallyRehashed:true,
      ffprobeAndPrivateContactFramesMade:true,
      operatorRightsReferencesNotIndependentlyAuthenticated:true,
      customerSubjectAndStoryClaimsNotIndependentlyVerified:true,
      actualCommercialBriefStillRequired:true,
      studioAdmissionGranted:false,realVideoRendered:false,
      humanCreativeAudioReviewRequired:true,customerDelivery:false,
      paymentAuthority:false,publicationAuthority:false,
    },
  };
  fs.writeFileSync(path.join(out,'private-media-qualification.json'),
    JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
  return receipt;
}
async function cli(){
  const [manifestPath,assetDir,receiptPath,reviewPath,outputDir]=process.argv.slice(2);
  if(!manifestPath||!assetDir||!receiptPath||!reviewPath||!outputDir)
    throw Error('Usage: node harbor-private-media-qualify.mjs <manifest.json> <asset-dir> <receiver-receipt.json> <private-review.json> <empty-private-output-dir>');
  const r=await qualifyPrivateHarborBatch({
    manifestPath,assetDir,receiverReceiptPath:receiptPath,operatorDecisionPath:reviewPath,outputDir,
  });
  console.log(JSON.stringify({state:r.state,assetCount:r.assetCount,
    candidateCount:r.assessedSourceCount,realVideoHookDeclared:r.approvedRealVideoHookDeclared,
    studioAdmission:false,customerPreviewSent:false}));
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)
  cli().catch(e=>{console.error(e instanceof Error?e.message:'fallen_qualify_failed');process.exitCode=2;});
