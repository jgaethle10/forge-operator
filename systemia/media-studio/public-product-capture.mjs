#!/usr/bin/env node
/**
 * Evidence-bound screenshot -> existing Fallen SourceAsset bridge.
 * Consumes an existing PUBLIC READ-ONLY Browser Worker result only.
 * Approval attests review; it is not a signature or legal clearance.
 * No browsing, paid generation, user login, publishing, or checkout.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PNG_MAGIC=Buffer.from([137,80,78,71,13,10,26,10]);
const MAX_BYTES=3*1024*1024;
const hex64=/^[0-9a-f]{64}$/i;
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const fail=code=>{throw new Error('fallen_public_capture_'+code)};
function exactHttpsOrigin(value){
  let u;
  try{u=new URL(value)}catch{fail('origin_invalid')}
  if(typeof value!=='string'||u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/'||u.port)fail('origin_invalid');
  return u.origin;
}
function publicPage(value,origin){
  let u;
  try{u=new URL(value)}catch{fail('url_invalid')}
  if(u.protocol!=='https:'||u.origin!==origin||u.username||u.password||u.hash||u.search)fail('url_outside_approved_public_origin');
  return u.toString();
}
function safeId(value){
  if(typeof value!=='string'||!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(value))fail('id_invalid');
  return value;
}
function pngDimensions(bytes){
  if(bytes.length<33||bytes.length>MAX_BYTES||!bytes.subarray(0,8).equals(PNG_MAGIC)||
    bytes.readUInt32BE(8)!==13||bytes.subarray(12,16).toString('ascii')!=='IHDR')fail('png_invalid');
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
  if(width<200||height<200||width>4096||height>4096)fail('png_dimensions_invalid');
  return {width,height};
}
function evidenceDigest(r){
  // Exact property order of systemia/evercraft-web/browser-worker/server.mjs.
  const evidence={
    engine:r.engine,mode:r.mode,requested_url:r.requested_url,
    final_url:r.final_url,http_status:r.http_status,title:r.title,
    text_sha256:r.text_sha256,screenshot_sha256:r.screenshot_sha256,
    actions:r.actions,blocked_network_events:r.blocked_network_events,
    console_errors:r.console_errors,started_at:r.started_at,
    finished_at:r.finished_at,duration_ms:r.duration_ms,boundaries:r.boundaries,
  };
  return hash(Buffer.from(JSON.stringify(evidence)));
}
export function preparePublicProductCapture(response,approval){
  if(!response||typeof response!=='object'||response.ok!==true||
    response.engine!=='evercraft-owned-browser-worker-v1'||response.mode!=='public_read_only'||
    response.http_status!==200)fail('worker_receipt_invalid');
  const b=response.boundaries;
  if(!b||b.fresh_context_per_job!==true||b.persisted_cookies!==false||
    b.outbound_cookie_headers_stripped!==true||b.outbound_authorization_headers_stripped!==true||
    b.private_and_reserved_targets_blocked!==true||b.form_submit_action_supported!==false||
    b.arbitrary_click_action_supported!==false||b.downloads_allowed!==false)fail('browser_boundary_invalid');
  if(!Array.isArray(response.actions)||response.actions.some(a=>a.ok!==true||
    !['wait','wait_for_selector','scroll','follow_anchor'].includes(a.type)))fail('action_invalid');
  if(!hex64.test(String(response.evidence_receipt_sha256||''))||
    evidenceDigest(response)!==response.evidence_receipt_sha256.toLowerCase())fail('worker_receipt_digest_mismatch');
  if(!approval||approval.schema!=='evercraft.fallen.public-product-capture-approval.v1')fail('approval_schema_invalid');
  const id=safeId(approval.id);
  const origin=exactHttpsOrigin(approval.approvedOrigin);
  const page=publicPage(response.final_url,origin);
  publicPage(response.requested_url,origin);
  const screenshot=response.screenshot;
  if(!screenshot||typeof screenshot.base64!=='string'||screenshot.base64.length>MAX_BYTES*2||
    !hex64.test(String(screenshot.sha256||''))||!Number.isInteger(screenshot.bytes))fail('screenshot_missing');
  if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(screenshot.base64))fail('screenshot_encoding_invalid');
  const bytes=Buffer.from(screenshot.base64,'base64'),digest=hash(bytes);
  if(bytes.toString('base64')!==screenshot.base64||bytes.length!==screenshot.bytes||
     digest!==screenshot.sha256.toLowerCase()||digest!==response.screenshot_sha256)fail('screenshot_digest_mismatch');
  const dimensions=pngDimensions(bytes);
  if(approval.reviewedScreenshotSha256!==digest||approval.approvedPageUrl!==page||
    approval.approvedForInternalCreative!==true||approval.personalOrPrivateContentAbsent!==true||
    !['owned','licensed'].includes(approval.rights)||
    typeof approval.reviewerId!=='string'||approval.reviewerId.trim().length<2||
    !Number.isFinite(Date.parse(approval.reviewedAt))||
    typeof approval.productName!=='string'||approval.productName.trim().length<2||
    typeof approval.viewerPromise!=='string'||approval.viewerPromise.trim().length<10)fail('human_content_review_required');
  if(approval.rights==='licensed'&&!(typeof approval.licenseRef==='string'&&approval.licenseRef.trim()))fail('license_reference_missing');
  return {
    id,bytes,digest,dimensions,page,
    manifest:{
      schema:'evercraft.fallen.public-product-capture-receipt.v1',
      id,sourceKind:'real_public_browser_capture',sourcePage:page,
      sourceRefs:['browser-worker:'+response.evidence_receipt_sha256,'sha256:'+digest],
      screenshotSha256:digest,evidenceReceiptSha256:response.evidence_receipt_sha256,
      dimensions,productName:approval.productName.trim(),viewerPromise:approval.viewerPromise.trim(),
      rights:approval.rights,licenseRef:approval.licenseRef||null,
      review:{state:'human_approved_for_internal_creative',reviewerId:approval.reviewerId.trim(),reviewedAt:approval.reviewedAt},
      warnings:[
        'Worker SHA-256 proves local content integrity, not worker identity or authenticity.',
        'Human review is an attestation, not independent rights/privacy verification.',
        'A screenshot proves only what its pixels display.',
      ],
      boundaries:{noSyntheticUi:true,authCookiesCaptured:false,publicationAuthority:false,
        distributionAuthority:false,customerApprovalClaimed:false,noModelOrPaidGeneration:true},
    },
  };
}
export function importPublicProductCapture({response,approval,outputDir}){
  const p=preparePublicProductCapture(response,approval);
  const dir=path.resolve(outputDir);
  if(fs.existsSync(dir))fail('output_directory_exists');
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const imagePath=path.join(dir,p.id+'.png'),projectPath=path.join(dir,p.id+'.project.json'),
        receiptPath=path.join(dir,p.id+'.capture-receipt.json');
  const project={
    id:'capture-'+p.id,title:p.manifest.productName+' | Authentic product capture',
    brief:{prompt:'Show the actual product as captured. No fabricated screens or claims. '+p.manifest.viewerPromise,
      format:'social_short',aspectRatio:'9:16',audience:approval.audience||'potential customers',
      style:'authentic product interface; subject-first; no ornamental filler',
      ...(approval.cta?{cta:approval.cta}:{})},
    assets:[{id:'real-product-'+p.id,path:imagePath,kind:'image',
      width:p.dimensions.width,height:p.dimensions.height,rights:approval.rights,
      tags:['real-product-capture','source-first','human-review-required-before-release'],
      notes:'Actual browser screenshot, sha256:'+p.digest+'; internal creative use only.'}],
  };
  fs.writeFileSync(imagePath,p.bytes,{flag:'wx',mode:0o600});
  fs.writeFileSync(projectPath,JSON.stringify(project,null,2)+'\n',{flag:'wx',mode:0o600});
  fs.writeFileSync(receiptPath,JSON.stringify(p.manifest,null,2)+'\n',{flag:'wx',mode:0o600});
  return {imagePath,projectPath,receiptPath,screenshotSha256:p.digest,publicationAuthorized:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const [receipt,approval,outputDir]=process.argv.slice(2);
  if(!receipt||!approval||!outputDir){
    console.error('Usage: node systemia/media-studio/public-product-capture.mjs <private-worker-result.json> <reviewed-approval.json> <new-private-output-dir>');
    process.exitCode=2;
  }else{
    console.log(JSON.stringify(importPublicProductCapture({
      response:JSON.parse(fs.readFileSync(receipt,'utf8')),
      approval:JSON.parse(fs.readFileSync(approval,'utf8')),
      outputDir,
    }),null,2));
  }
}
