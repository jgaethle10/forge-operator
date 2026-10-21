#!/usr/bin/env node
// Non-destructive RC21 spoken-voice finalization audit. This is NOT a license or publication gate.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export const SCHEMA = 'evercraft.voice-foundry.voice-commercial-finish.v1';
export const TARGETS = Object.freeze({
 online_review: {integrated:-16, truePeak:-2},
 us_tv_reference: {integrated:-24, truePeak:-2.3},
});
const ABSENT_APPROVALS = ['licenseRightsVerified','founderFinalPerformanceAccepted',
                          'publicationAuthorized','endCustomerUseAuthorized'];
export const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function fail(message){throw new Error('Voice commercial QA: '+message);}
function measured(value){
 const n = Number(value);
 if (!Number.isFinite(n))fail('Missing or nonfinite measurement');
 return n;
}
function inspectWav(file){
 const result=spawnSync('ffprobe',['-v','error','-show_entries',
   'stream=codec_name,channels,sample_rate,sample_fmt','-of','json',file],
   {encoding:'utf8',timeout:12000});
 if(result.status!==0)fail('ffprobe unavailable or rejected WAV '+path.basename(file));
 let streams;
 try {streams=JSON.parse(result.stdout).streams;}catch{fail('invalid probe output');}
 if(streams?.length!==1 || streams[0].codec_name!=='pcm_s24le' ||
    streams[0].channels!==1 || Number(streams[0].sample_rate)!==48000)
   fail('Not 48k mono 24-bit PCM: '+path.basename(file));
}

export function verifyReceipt(receipt){
 if(receipt.schema!==SCHEMA)fail('Unexpected receipt schema');
 if(receipt.status!=='technical_private_audition_not_production_approved')
   fail('Wrong evaluation status');
 if(receipt.originalModelArtifactsModified!==false || receipt.actorPerformanceChanged!==false ||
    receipt.phonemesChanged!==false)fail('Source is not a protected voice finishing trial');
 for(const k of ABSENT_APPROVALS){if(receipt[k]!==false)fail('Unproven release approval: '+k);}
 if(!Array.isArray(receipt.masters) || receipt.masters.length!==10)
   fail('Expect exactly ten RC21 mastered outputs');
 if(!Array.isArray(receipt.sourceProofs) || receipt.sourceProofs.length!==4)
   fail('Expect exactly four RC20 source proofs');
 const ids=new Set(receipt.masters.map(r=>r.masterWav));
 if(ids.size!==10)fail('Duplicate mastered file');
 for(const row of receipt.masters){
   const target=TARGETS[row.preset];
   if(!target)fail('Unknown loudness preset');
   if(Math.abs(measured(row.verifiedMasterLufs)-target.integrated)>.8)
      fail('Master outside loudness tolerance: '+row.masterWav);
   if(measured(row.verifiedMasterTruePeakDbtp)>target.truePeak+.18)
      fail('Master outside true-peak tolerance: '+row.masterWav);
   if(row.sampleRate!==48000 || row.pcmBits!==24)fail('Wrong PCM format');
   if(!/^[a-f0-9]{64}$/.test(row.wavSha256) || !/^[a-f0-9]{64}$/.test(row.mp3Sha256))
     fail('Malformed audio digest');
 }
 return true;
}
export function verifyDirectory(dir){
 const receiptFile=path.resolve(dir,'evidence.json');
 const receipt=JSON.parse(fs.readFileSync(receiptFile,'utf8'));
 verifyReceipt(receipt);
 const located = p => {
   if(typeof p!=='string' || !/^[A-Za-z0-9_.-]+$/.test(p))fail('Unsafe artifact filename');
   const full=path.resolve(dir,p);
   if(!fs.statSync(full).isFile())fail('Artifact is not a regular file');
   return full;
 };
 for(const row of receipt.sourceProofs){
   const original=located(row.source);
   if(sha(fs.readFileSync(original))!==row.sourceSha256)fail('Source has changed '+row.source);
 }
 for(const row of receipt.masters){
   const wav=located(row.masterWav), mp3=located(row.previewMp3);
   if(sha(fs.readFileSync(wav))!==row.wavSha256 ||
      sha(fs.readFileSync(mp3))!==row.mp3Sha256)fail('Master digest mismatch: '+row.masterWav);
   inspectWav(wav);
 }
 return {status:'verified_private_audio_evidence_only',
         inspectedMasterWavs:receipt.masters.length,
         inspectedMasterMp3s:receipt.masters.length,
         originalFilesVerified:receipt.sourceProofs.length,
         publicationAuthorized:false, customerDeliveryAuthorized:false};
}
const invoked=process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href;
if(invoked){
 try{
   if(process.argv.includes('--verify-only')){
     verifyReceipt({schema:SCHEMA,status:'technical_private_audition_not_production_approved',
       originalModelArtifactsModified:false,actorPerformanceChanged:false,phonemesChanged:false,
       ...Object.fromEntries(ABSENT_APPROVALS.map(x=>[x,false])),
       masters:Array.from({length:10},(_,i)=>({masterWav:'demo'+i+'.wav',
         preset:'online_review', verifiedMasterLufs:-16,verifiedMasterTruePeakDbtp:-2,
         sampleRate:48000,pcmBits:24,wavSha256:'a'.repeat(64),mp3Sha256:'b'.repeat(64)})),
       sourceProofs:Array.from({length:4},(_,i)=>({source:'a'+i+'.wav'}))});
     process.stdout.write('RC21 receipt contract preflight OK; no audio falsely approved\n');
   } else {
     if(process.argv.length!==3)fail('Usage: node voice-commercial-qa.mjs <RC21 extracted directory>');
     process.stdout.write(JSON.stringify(verifyDirectory(process.argv[2]),null,2)+'\n');
   }
 }catch(e){process.stderr.write(String(e.message)+'\n');process.exitCode=1;}
}
