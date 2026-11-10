import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditCommercialAudio} from './commercial-audio-lab.mjs';
import {inspectCommercialPicture} from './commercial-visual-qc.mjs';
import {assessClientCommercialRelease,COMMERCIAL_RELEASE_SCHEMA} from './commercial-release-preflight.mjs';

const SCHEMA='evercraft.fallen.client-commercial-gate-request.v1';
function requireObject(o,label) {
  if(!o || typeof o!=='object' || Array.isArray(o)) throw new Error('customer_gate_'+label+'_invalid');
  return o;
}
function fileJson(p,label){
  if(!p||typeof p!=='string'||!fs.existsSync(p)||!fs.statSync(p).isFile())throw new Error('customer_gate_file_missing:'+label);
  try {return JSON.parse(fs.readFileSync(p,'utf8'));}
  catch {throw new Error('customer_gate_json_invalid:'+label);}
}
function pathFor(base,value,label) {
  if(typeof value!=='string'||!value.trim())throw new Error('customer_gate_path_missing:'+label);
  return path.resolve(base,value);
}
function sha256File(filename) {
  const h=crypto.createHash('sha256'),fd=fs.openSync(filename,'r');
  const b=Buffer.allocUnsafe(1024*1024);
  try {
    while(true) {
      const n=fs.readSync(fd,b,0,b.length,null);
      if(n===0)break;
      h.update(b.subarray(0,n));
    }
  } finally {fs.closeSync(fd);}
  return h.digest('hex');
}
function validateSource({request,baseDir}) {
  if(request?.schema!==SCHEMA)throw new Error('customer_gate_schema_invalid');
  if(request.studioDeliveryReceiptPath && request.studioDelivery) {
    throw new Error('customer_gate_ambiguous_studio_delivery_sources');
  }
  const canonicalPath=request.studioDeliveryReceiptPath?
    pathFor(baseDir,request.studioDeliveryReceiptPath,'studio_delivery_receipt'):null;
  const canonical=canonicalPath?fileJson(canonicalPath,'studio_delivery_receipt'):null;
  if(canonical){
    if(canonical.schema!=='evercraft.fallen.studio-delivery-receipt.v1'){
      throw new Error('customer_gate_delivery_receipt_schema_invalid');
    }
    if(canonical.qualityMode!=='commercial'||canonical.state!=='ready_for_clip_intake'||
      canonical.publicationAuthorityGranted!==false) {
      throw new Error('customer_gate_delivery_receipt_not_admissible');
    }
  }
  const studio=canonical||requireObject(request.studioDelivery,'studio_delivery');
  const sourceDir=canonicalPath?path.dirname(canonicalPath):baseDir;
  const videoPath=pathFor(sourceDir,studio.videoPath,'master');
  const renderPath=pathFor(sourceDir,studio.renderReceiptPath,'render_receipt');
  const masterQcPath=pathFor(sourceDir,studio.masterQcReceiptPath,'master_qc');
  const clipPath=pathFor(sourceDir,studio.clipManifestPath,'clip_intake');
  if(!fs.existsSync(videoPath)||!fs.statSync(videoPath).isFile()){
    throw new Error('customer_gate_file_missing:master');
  }
  const renderReceipt=fileJson(renderPath,'render_receipt');
  const masterQc=fileJson(masterQcPath,'master_qc');
  const clipManifest=fileJson(clipPath,'clip_intake');
  if(path.resolve(sourceDir,renderReceipt.outputPath||'')!==videoPath){
    throw new Error('customer_gate_render_path_does_not_match_master');
  }
  if(path.resolve(sourceDir,clipManifest.media?.path||'')!==videoPath){
    throw new Error('customer_gate_clip_path_does_not_match_master');
  }
  const videoSha256=sha256File(videoPath);
  if(renderReceipt.sha256!==videoSha256||
     masterQc.sha256!==videoSha256||
     clipManifest.media?.sha256!==videoSha256){
    throw new Error('customer_gate_source_receipts_digest_mismatch');
  }
  if(masterQc.status!=='accepted'||clipManifest.schema!=='evercraft.clip.media-intake.v1'||
     clipManifest.state!=='ready_for_clip_intake'){
    throw new Error('customer_gate_source_receipts_not_accepted');
  }
  if(canonical){
    if(canonical.mediaSha256!==videoSha256||canonical.manifestSha256!==sha256File(clipPath)){
      throw new Error('customer_gate_delivery_receipt_digest_mismatch');
    }
  }
  return {videoPath,renderReceipt,masterQc,clipManifest,deliveryReceipt:canonical||null};
}

/** Assemble original production evidence and measured QC; never infer client approval. */
export function assembleCustomerCommercialGate({request,renderReceipt,masterQc,clipManifest,audioQc,visualQc}) {
  if(request?.schema!==SCHEMA)throw new Error('customer_gate_schema_invalid');
  const releaseInput={
    schema:COMMERCIAL_RELEASE_SCHEMA,
    order:request.order,
    storyboard:request.storyboard,
    rights:request.rights,
    productionGrade:request.productionGrade,
    creativeReview:request.creativeReview,
    clientApproval:request.clientApproval,
    promotionalReuse:request.promotionalReuse,
    renderReceipt,masterQc,clipManifest,audioQc,visualQc,
  };
  const release=assessClientCommercialRelease(releaseInput);
  return {
    schema:'evercraft.fallen.customer-commercial-gate-report.v1',
    orderId:release.orderId,
    status:release.status,
    masterSha256:release.masterSha256,
    audioStatus:audioQc.status,
    pictureStatus:visualQc.status,
    rightsAndCreativeStatus:release.reasons.length?'needs_review':'reviewed',
    release,
    evidence:{
      audio:audioQc,
      visual:visualQc,
      renderSha256:renderReceipt.sha256,
      masterQcSha256:masterQc.sha256,
      clipSha256:clipManifest.media?.sha256,
    },
    boundaries:{
      verifiedRawMediaBytesAtInvocation:true,
      privateInputContainsClientData:true,
      paymentAuthorityGranted:false,
      deliveryAuthorityGranted:false,
      publicationAuthorityGranted:false,
    },
  };
}
export function runCustomerCommercialGate({request,baseDir=process.cwd()}) {
  const source=validateSource({request,baseDir});
  const audioQc=auditCommercialAudio({input:source.videoPath,expectedSha256:source.renderReceipt.sha256});
  const visualQc=inspectCommercialPicture({
    filePath:source.videoPath,expectedSha256:source.renderReceipt.sha256,
    beats:request.storyboard?.beats,
  });
  return assembleCustomerCommercialGate({...source,request,audioQc,visualQc});
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [, ,inputPath,outputPath]=process.argv;
  try {
    if(!inputPath||!outputPath)throw new Error('Usage: node customer-commercial-gate.mjs <private-request.json> <private-output.json>');
    const request=fileJson(path.resolve(inputPath),'customer_request');
    const result=runCustomerCommercialGate({request,baseDir:path.dirname(path.resolve(inputPath))});
    const out=path.resolve(outputPath);
    if(out===path.resolve(inputPath))throw new Error('customer_gate_input_output_paths_identical');
    fs.mkdirSync(path.dirname(out),{recursive:true});
    fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n','utf8');
    console.log(JSON.stringify({schema:result.schema,orderId:result.orderId,status:result.status,
      reasons:result.release.reasons,audioStatus:result.audioStatus,pictureStatus:result.pictureStatus,
      outputPath:out},null,2));
    if(result.status==='blocked')process.exitCode=2;
  }catch(err){console.error(err instanceof Error?err.message:String(err));process.exitCode=1;}
}
