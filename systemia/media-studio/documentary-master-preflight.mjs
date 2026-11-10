#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const SCHEMA = 'evercraft.fallen.documentary-master-preflight.v1';
const HEX = /^[a-f0-9]{64}$/i;
const text = v => typeof v === 'string' && Boolean(v.trim());
function run(binary, args) {
  const r=spawnSync(binary,args,{encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024});
  if(r.error || r.status!==0)throw new Error(binary+'_inspection_failed');
  return String(r.stdout||'')+'\n'+String(r.stderr||'');
}
function sha256(file) {
  const fd=fs.openSync(file,'r'),hash=crypto.createHash('sha256'),buf=Buffer.allocUnsafe(1024*1024);
  try {for(;;){const n=fs.readSync(fd,buf,0,buf.length,null);if(!n)break;hash.update(buf.subarray(0,n));}}
  finally{fs.closeSync(fd);}
  return hash.digest('hex');
}
export function inspectDocumentaryMaster(file) {
  const filename=path.resolve(file);
  if(!fs.statSync(filename).isFile())throw new Error('master_is_not_a_file');
  const probe=JSON.parse(run('ffprobe',['-v','error','-show_format','-show_streams','-of','json',filename]));
  const streams=probe.streams||[],video=streams.filter(s=>s.codec_type==='video'),audio=streams.filter(s=>s.codec_type==='audio');
  const fps=video[0]?.r_frame_rate?.split('/').map(Number);
  const sample=run('ffmpeg',['-hide_banner','-nostdin','-i',filename,'-filter_complex','ebur128=peak=true','-f','null','-']);
  const loudness=[...sample.matchAll(/Integrated loudness:\s*I:\s*(-?[0-9.]+) LUFS/g)].at(-1);
  const peak=[...sample.matchAll(/True peak:\s*Peak:\s*(-?[0-9.]+) dBFS/g)].at(-1);
  return {
    masterSha256:sha256(filename),sizeBytes:fs.statSync(filename).size,
    durationSec:Number(probe.format?.duration),videoStreamCount:video.length,audioStreamCount:audio.length,
    width:video[0]?.width??null,height:video[0]?.height??null,
    fps:fps&&fps[1]?fps[0]/fps[1]:null,
    videoCodec:video[0]?.codec_name??null,audioCodec:audio[0]?.codec_name??null,
    integratedLufs:loudness?Number(loudness[1]):null,truePeakDbfs:peak?Number(peak[1]):null
  };
}
export function assessDocumentaryMaster(input,observed) {
  const reasons=[],need=(v,k)=>{if(!v)reasons.push(k);};
  need(input?.schema===SCHEMA,'schema_invalid');
  const classification=input?.classification;
  need(['internal_spec','authorized_client_preview'].includes(classification),'classification_invalid');
  const internal=classification==='internal_spec';
  need(HEX.test(observed?.masterSha256||''),'master_digest_missing');
  need(observed?.masterSha256===input?.expectedSha256,'master_digest_mismatch');
  need(observed?.durationSec>=45&&observed.durationSec<=90,'duration_outside_pilot_range');
  need(observed?.videoStreamCount===1&&observed?.audioStreamCount===1,'stream_counts_invalid');
  need(observed?.videoCodec==='h264'&&observed?.audioCodec==='aac','codecs_invalid');
  need(observed?.fps>=23.9&&observed?.fps<=60.1,'fps_invalid');
  need(Math.min(observed?.width??0,observed?.height??0)>=(internal?720:1080),'short_edge_too_small');
  need(Number.isFinite(observed?.integratedLufs)&&observed.integratedLufs>=-18&&observed.integratedLufs<=-14,'audio_loudness_outside_gate');
  need(Number.isFinite(observed?.truePeakDbfs)&&observed.truePeakDbfs<=-1,'true_peak_above_gate');
  if(internal)need(input?.declaredSyntheticOrFirstParty===true,'internal_source_declaration_missing');
  if(classification==='authorized_client_preview'){
    const intake=input?.intakeReceipt||{},editorial=input?.editorialReview||{},creative=input?.creativeReview||{};
    need(intake.schema==='evercraft.fallen.documentary-intake-receipt.v1'&&
      intake.status==='ready_for_private_edit'&&intake.sourceReceipts?.length>0,'private_intake_receipt_missing');
    need(editorial.status==='approved'&&text(editorial.reviewedBy)&&text(editorial.evidenceRef),'editorial_review_missing');
    need(creative.status==='approved'&&text(creative.reviewedBy)&&text(creative.playbackEvidenceRef),'human_playback_review_missing');
    need(input?.rightsAuthentication?.status==='verified'&&text(input.rightsAuthentication?.evidenceRef)&&
      text(input.rightsAuthentication?.reviewedBy),'independent_rights_verification_missing');
    need(input?.clientPermission?.privatePreview===true&&text(input.clientPermission?.evidenceRef),'private_preview_consent_missing');
  }
  const status=reasons.length?'blocked':internal?'internal_spec_verified':'ready_for_client_review';
  return {schema:'evercraft.fallen.documentary-master-receipt.v1',status,reasons,
    classification,observed,boundaries:{technicalPassIsNotCreativeApproval:true,
      clientApprovalGranted:false,paymentAuthorityGranted:false,publicationAuthorityGranted:false,
      portfolioReuseAuthorityGranted:false}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [master,manifest,receipt]=process.argv.slice(2);
  if(!master||!manifest||!receipt){console.error('Usage: node documentary-master-preflight.mjs <master.mp4> <private-manifest.json> <private-receipt.json>');process.exitCode=1;}
  else try{
    const manifestJson=JSON.parse(fs.readFileSync(path.resolve(manifest),'utf8'));
    const report=assessDocumentaryMaster(manifestJson,inspectDocumentaryMaster(master));
    fs.mkdirSync(path.dirname(path.resolve(receipt)),{recursive:true});
    fs.writeFileSync(path.resolve(receipt),JSON.stringify(report,null,2)+'\n',{mode:0o600});
    console.log('Documentary master: '+report.status+'; sha256:'+report.observed.masterSha256);
    if(report.status==='blocked')process.exitCode=2;
  }catch(error){console.error('Documentary master inspection failed: '+error.message);process.exitCode=1;}
}
