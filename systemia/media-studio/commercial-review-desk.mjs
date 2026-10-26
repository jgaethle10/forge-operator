#!/usr/bin/env node
// Offline viewer and exact-media review verifier for Fallen commercial variants.
// Approval evidence may be *recorded*, never assumed. No platform publishing authority.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const FORMATS={'16:9':[1920,1080],'1:1':[1080,1080],'9:16':[1080,1920]};
export const REVIEW_CHECKS=[
  'watch_all_three_full_masters',
  'inspect_every_framing_capture',
  'listen_to_actual_encoded_voice_music_sfx',
  'confirm_captions_safe_area_per_platform',
  'confirm_source_rights_and_client_claims',
  'approve_final_client_delivery'
];
const ACK='I personally reviewed all three final encoded videos and their evidence frames.';
function sha(file){
  const hash=crypto.createHash('sha256'),fd=fs.openSync(file,'r'),buffer=Buffer.allocUnsafe(1024*1024);
  try{for(;;){const n=fs.readSync(fd,buffer,0,buffer.length,null);if(!n)break;hash.update(buffer.subarray(0,n));}}
  finally{fs.closeSync(fd);}
  return hash.digest('hex');
}
function safeFile(root,filename,label){
  if(!filename||typeof filename!=='string')throw new Error('review_desk_file_missing:'+label);
  const file=path.resolve(filename);
  if(!fs.existsSync(file)||!fs.statSync(file).isFile())throw new Error('review_desk_file_unavailable:'+label);
  const rel=path.relative(fs.realpathSync(root),fs.realpathSync(file));
  if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))
    throw new Error('review_desk_file_outside_proof_pack:'+label);
  return file;
}
function verifyHash(file,expected,label){
  if(!/^[a-f0-9]{64}$/i.test(String(expected||''))||sha(file).toLowerCase()!==expected.toLowerCase())
    throw new Error('review_desk_digest_mismatch:'+label);
}
function parseReceipt(file,expectedSchema,label){
  let data;
  try{data=JSON.parse(fs.readFileSync(file,'utf8'));}
  catch{throw new Error('review_desk_receipt_unparseable:'+label);}
  if(data.schema!==expectedSchema)throw new Error('review_desk_receipt_schema_invalid:'+label);
  return data;
}
function probe(file){
  const r=spawnSync('ffprobe',['-v','error','-show_entries',
    'stream=codec_type,codec_name,width,height:format=duration','-of','json',file],
    {encoding:'utf8'});
  if(r.error||r.status!==0)throw new Error('review_desk_media_probe_failed');
  return JSON.parse(r.stdout);
}
function html(text){return String(text).replace(/[&<>"']/g,ch=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
})[ch]);}
function relativeUrl(root,file){
  const relative=path.relative(root,file);
  return relative.split(path.sep).map(encodeURIComponent).join('/');
}
function objectHash(object){
  return crypto.createHash('sha256').update(JSON.stringify(object)).digest('hex');
}
export function verifyCommercialReviewPack(packPath){
  const file=path.resolve(packPath),root=path.dirname(file);
  const pack=parseReceipt(file,'evercraft.fallen.commercial-variant-proof-pack.v1','review-pack');
  if(pack.releaseState!=='blocked_pending_human_review'||pack.humanApproved!==false||
     pack.customerPublished!==false||pack.publicationAuthorityGranted!==false)
    throw new Error('review_desk_unsafe_release_state');
  if(!Array.isArray(pack.variants)||pack.variants.length!==3)
    throw new Error('review_desk_expected_three_variants');
  const formats=new Set(),validated=[];
  for(const variant of pack.variants){
    const format=variant.format,expected=FORMATS[format];
    if(!expected||formats.has(format))throw new Error('review_desk_variant_format_duplicated_or_invalid');
    formats.add(format);
    if(variant.reviewState!=='pending_independent_customer_quality_review')
      throw new Error('review_desk_variant_unexpected_review_state:'+format);
    const video=safeFile(root,variant.videoPath,format+':video');
    verifyHash(video,variant.sha256,format+':video');
    const info=probe(video);
    const streams=info.streams||[],picture=streams.find(x=>x.codec_type==='video');
    const audio=streams.find(x=>x.codec_type==='audio');
    if(!picture||!audio||picture.width!==expected[0]||picture.height!==expected[1]||
       picture.codec_name!=='h264'||audio.codec_name!=='aac')
      throw new Error('review_desk_variant_media_invalid:'+format);
    const duration=Number(info.format?.duration);
    if(!Number.isFinite(duration)||Math.abs(duration-pack.durationSec)>0.15||
       Math.abs(duration-variant.durationSec)>0.15)
      throw new Error('review_desk_variant_duration_invalid:'+format);
    const manifestPath=safeFile(root,variant.clipManifestPath,format+':clip');
    const clip=parseReceipt(manifestPath,'evercraft.clip.media-intake.v1',format+':clip');
    if(clip.media?.sha256!==variant.sha256||path.resolve(clip.media.path)!==video||
       clip.media.width!==expected[0]||clip.media.height!==expected[1]||
       clip.qualityMode!=='commercial'||clip.boundaries?.commercialAudioQcRequired!==true||
       clip.boundaries?.publicationAuthorityGranted!==false||
       clip.boundaries?.downstreamClipGateRequired!==true)
      throw new Error('review_desk_clip_unbound:'+format);
    const qcPath=safeFile(root,variant.audioQcReceiptPath,format+':audio-qc');
    const qc=parseReceipt(qcPath,'evercraft.fallen.commercial-audio-qc.v1',format+':audio-qc');
    if(qc.status!=='accepted'||qc.sha256!==variant.sha256||
       path.resolve(qc.path)!==video)
      throw new Error('review_desk_audio_qc_unbound:'+format);
    if(path.resolve(clip.provenance?.commercialAudioQcReceiptPath||'')!==qcPath)
      throw new Error('review_desk_clip_qc_path_unbound:'+format);
    const masterReceipt=safeFile(root,clip.provenance?.commercialAudioMasterReceiptPath,format+':audio-master');
    const master=parseReceipt(masterReceipt,'evercraft.fallen.commercial-audio-master.v1',format+':audio-master');
    if(master.status!=='accepted'||master.outputSha256!==variant.sha256)
      throw new Error('review_desk_master_unbound:'+format);
    if(!Array.isArray(variant.framing)||!Array.isArray(variant.reviewFrames)||
       variant.framing.length!==variant.reviewFrames.length||!variant.reviewFrames.length)
      throw new Error('review_desk_framing_capture_incomplete:'+format);
    const shots=new Set(),frames=[];
    for(const [i,frame] of variant.reviewFrames.entries()){
      const matching=variant.framing[i];
      if(!matching||matching.sceneId!==frame.sceneId||shots.has(frame.sceneId)||
         !Array.isArray(matching.reviewRefs)||matching.reviewRefs.length===0||
         !Number.isFinite(matching.focalX)||matching.focalX<0||matching.focalX>1||
         !Number.isFinite(matching.focalY)||matching.focalY<0||matching.focalY>1||
         frame.status!=='needs_human_picture_review')
        throw new Error('review_desk_shot_evidence_unbound:'+format);
      shots.add(frame.sceneId);
      const jpeg=safeFile(root,frame.path,format+':frame:'+i);
      verifyHash(jpeg,frame.sha256,format+':frame:'+i);
      const magic=Buffer.alloc(2),fd=fs.openSync(jpeg,'r');
      try{fs.readSync(fd,magic,0,2,0);}finally{fs.closeSync(fd);}
      if(magic[0]!==0xff||magic[1]!==0xd8)throw new Error('review_desk_frame_not_jpeg:'+format);
      frames.push({...frame,path:jpeg});
    }
    validated.push({format,videoPath:video,sha256:variant.sha256,
      clipManifestPath:manifestPath,audioQcReceiptPath:qcPath,frames});
  }
  if(formats.size!==3||!Object.keys(FORMATS).every(x=>formats.has(x)))
    throw new Error('review_desk_formats_incomplete');
  if(new Set(validated.map(v=>v.sha256)).size!==3)throw new Error('review_desk_duplicate_encoded_media');
  if(validated.some(v=>v.frames.length!==validated[0].frames.length))
    throw new Error('review_desk_inconsistent_story_coverage');
  if(!Array.isArray(pack.humanReviewRequirements)||
     REVIEW_CHECKS.some(x=>!pack.humanReviewRequirements.includes(x)))
    throw new Error('review_desk_required_reviews_missing');
  return {schema:'evercraft.fallen.commercial-review-verification.v1',status:'media_integrity_verified',
    packPath:file,packDigest:sha(file),sourceFirstPlanDigest:pack.sourceFirstPlanDigest,
    durationSec:pack.durationSec,variants:validated,
    humanApproved:false,publicationAuthorityGranted:false};
}
export function writeReadOnlyCommercialReviewDesk(packPath,outputPath){
  const proof=verifyCommercialReviewPack(packPath),root=path.dirname(proof.packPath);
  const target=path.resolve(outputPath);
  if(path.dirname(target)!==root||fs.existsSync(target))
    throw new Error('review_desk_output_must_be_new_file_in_proof_root');
  let sections='';
  for(const variant of proof.variants){
    sections+='<article><h2>'+html(variant.format)+'</h2>'+
      '<p><strong>SHA-256:</strong> <code>'+html(variant.sha256)+'</code></p>'+
      '<video controls playsinline preload="metadata" src="'+html(relativeUrl(root,variant.videoPath))+'"></video>'+
      '<p>Listen to the entire encoded audio, check source framing and safe-area captions.</p>'+
      '<div class="shots">'+variant.frames.map(f=>
        '<figure><img loading="lazy" src="'+html(relativeUrl(root,f.path))+'" alt="Captured '+html(f.sceneId)+'"/>'+
        '<figcaption>'+html(f.sceneId)+' at '+html(f.timeSec)+' seconds</figcaption></figure>'
      ).join('')+'</div></article>';
  }
  const checklist=REVIEW_CHECKS.map(x=>'<li>'+html(x.replaceAll('_',' '))+'</li>').join('');
  const page='<!doctype html><html lang="en"><head><meta charset="utf-8"/>'+
    '<meta name="viewport" content="width=device-width,initial-scale=1"/>'+
    '<title>Fallen | Commercial Review Desk</title>'+
    '<style>:root{color-scheme:dark;font-family:system-ui,sans-serif}body{background:#101216;color:#f4f5f7;margin:0;padding:2rem}header{max-width:1200px;margin:auto}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,330px),1fr));gap:1.2rem;max-width:1450px;margin:2rem auto}article{background:#1e232a;border:1px solid #404b5a;border-radius:12px;padding:1.2rem;min-width:0}video{display:block;width:100%;aspect-ratio:16/9;object-fit:contain;background:black}h1{font-size:1.8rem}h2{font-size:1.3rem}code{overflow-wrap:anywhere;font-size:.75rem}p,li{line-height:1.5}.shots{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:.6rem}.shots img{width:100%;height:auto;object-fit:contain;background:black}figure{margin:0}figcaption{font-size:.75rem;color:#bfc6d0}footer{max-width:1200px;margin:auto}</style></head><body>'+
    '<header><h1>Fallen Commercial Review Desk</h1><p>Locally verified technical media only. This page is <strong>not</strong> a creative approval, a client delivery, or permission to publish.</p>'+
    '<p><strong>Proof digest:</strong> <code>'+html(proof.packDigest)+'</code></p></header>'+
    '<main>'+sections+'</main><footer><h2>Human review required</h2><ol>'+checklist+
    '</ol><p>Review each full video on desktop and mobile, listen with speakers and headphones, verify captions and legal claims, then record separate owner/customer approval. No publish control is present.</p></footer></body></html>';
  fs.writeFileSync(target,page,{flag:'wx'});
  return {schema:'evercraft.fallen.commercial-review-desk-receipt.v1',
    status:'read_only_gallery_created',path:target,sha256:sha(target),
    proofDigest:proof.packDigest,mediaCount:proof.variants.length,
    framesCount:proof.variants.reduce((n,v)=>n+v.frames.length,0),
    humanApproved:false,publicationAuthorityGranted:false};
}
export function recordCommercialReviewEvidence(packPath,decision,outputPath){
  const verified=verifyCommercialReviewPack(packPath);
  if(decision?.schema!=='evercraft.fallen.commercial-human-review-decision.v1')
    throw new Error('review_desk_decision_schema_invalid');
  if(!String(decision.reviewerId||'').trim()||decision.acknowledgement!==ACK)
    throw new Error('review_desk_personal_attestation_missing');
  if(!Number.isFinite(Date.parse(decision.reviewedAt)))
    throw new Error('review_desk_review_timestamp_invalid');
  if(decision.packDigest!==verified.packDigest)
    throw new Error('review_desk_attestation_proof_digest_mismatch');
  if(!Array.isArray(decision.reviewedMedia)||decision.reviewedMedia.length!==3)
    throw new Error('review_desk_attestation_media_incomplete');
  const seen=new Set();
  for(const row of decision.reviewedMedia){
    if(seen.has(row.format))throw new Error('review_desk_duplicate_attested_format');
    seen.add(row.format);
    const expected=verified.variants.find(x=>x.format===row.format);
    if(!expected||row.sha256!==expected.sha256)
      throw new Error('review_desk_attested_video_mismatch');
  }
  if(!decision.checks||REVIEW_CHECKS.some(x=>decision.checks[x]!==true))
    throw new Error('review_desk_human_checks_incomplete');
  const target=path.resolve(outputPath),root=path.dirname(verified.packPath);
  if(path.dirname(target)!==root||fs.existsSync(target))
    throw new Error('review_desk_attestation_output_must_be_new_in_proof_root');
  const receipt={schema:'evercraft.fallen.commercial-human-review-evidence.v1',
    status:'self_attested_human_review_recorded',
    reviewerId:decision.reviewerId,reviewedAt:decision.reviewedAt,
    proofPackDigest:verified.packDigest,
    evidenceDigest:objectHash(decision),
    reviewedMedia:decision.reviewedMedia,
    checks:REVIEW_CHECKS,
    independentIdentityVerificationPerformed:false,
    humanApprovalAuthenticityVerified:false,
    platformReleaseGranted:false,publicationAuthorityGranted:false};
  fs.writeFileSync(target,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  return receipt;
}
function main(){
  const [mode,pack,out,decisionFile]=process.argv.slice(2);
  if(mode==='verify'){console.log(JSON.stringify(verifyCommercialReviewPack(pack),null,2));return;}
  if(mode==='gallery'){console.log(JSON.stringify(writeReadOnlyCommercialReviewDesk(pack,out),null,2));return;}
  if(mode==='attest'){
    console.log(JSON.stringify(recordCommercialReviewEvidence(pack,
      JSON.parse(fs.readFileSync(decisionFile,'utf8')),out),null,2));return;
  }
  throw new Error('usage: commercial-review-desk.mjs verify PACK | gallery PACK OUT.html | attest PACK OUT.json DECISION.json');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{main();}catch(e){console.error(e.message||String(e));process.exitCode=2;}
}
