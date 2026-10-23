import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import { buildVoiceAudition } from '../systemia/media-studio/voice-audition-kit.mjs';
function setup(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-voice-listening-'));
 const voices=[];
 for(const [i,freq] of [280,390].entries()){
  const file=path.join(root,'synthetic-'+i+'.wav');
  const result=spawnSync('ffmpeg',['-y','-v','error','-f','lavfi','-i',`sine=frequency=${freq}:sample_rate=48000`,'-t','1.25','-filter:a','volume=0.10',file],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  voices.push({id:'synthetic-'+i,label:'Test Signal '+i,voiceProfileId:'unapproved-'+i,genderPresentation:i?'masculine':'feminine',
   accent:'general-american',locale:'en-US',performanceDirection:'synthetic fixture only',scriptText:'No human audio was produced.',audioPath:path.basename(file),provider:'test-waveform',modelId:'fixture-sine',rightsState:'unknown'});
 }
 const input={schema:'evercraft.voice-foundry.audition-input.v1',projectId:'waveform-test',scriptText:'No human audio was produced.',locale:'en-US',candidates:voices};
 const manifestPath=path.join(root,'manifest.json');fs.writeFileSync(manifestPath,JSON.stringify(input));
 return {root,input,manifestPath,outputDir:path.join(root,'output')};
}
test('audition builder exports portable offline listening room with two actual probed files',()=>{
 const s=setup();const result=buildVoiceAudition(s);
 assert.equal(result.candidates,2);assert.equal(result.held,0);
 const report=JSON.parse(fs.readFileSync(result.reportPath,'utf8'));
 assert.equal(report.verdict,'INTERNAL_AUDITION_ONLY');assert.equal(report.publicationAuthorityGranted,false);
 assert.equal(report.providerCallsMade,false);assert.equal(report.rightsAndConsentUnverified,true);
 assert.equal(report.candidates[0].status,'awaiting_human_review');
 assert.match(report.candidates[0].signal.audioDigest,/^[a-f0-9]{64}$/);
 assert.equal(report.candidates[0].pacing.audioDigest,report.candidates[0].signal.audioDigest);
 assert.equal(report.candidates[0].pacing.schema,'evercraft.voice-foundry.pacing-inspection.v1');
 assert.equal(report.candidates[0].pacing.publicationAuthorityGranted,false);
 assert.equal(typeof report.candidates[0].pacingReviewRequired,'boolean');
 assert.equal(fs.readFileSync(path.join(s.outputDir,report.candidates[0].audioPath)).length>0,true);
 assert.ok(fs.readFileSync(path.join(s.outputDir,'index.html'),'utf8').includes('Blind audition'));
 assert.ok(fs.readFileSync(path.join(s.outputDir,'audition-data.js'),'utf8').startsWith('window.__EVERCRAFT_VOICE_AUDITION_DATA__'));
});
test('mismatched script cannot silently be auditioned as the same take',()=>{
 const s=setup();s.input.candidates[1].scriptText='Different spoken words.';fs.writeFileSync(s.manifestPath,JSON.stringify(s.input));
 assert.throws(()=>buildVoiceAudition(s),/audition_script_mismatch/);
});
test('multiple locales cannot be smuggled into same-script A/B comparison',()=>{
 const s=setup();s.input.candidates[0].locale='es-MX';fs.writeFileSync(s.manifestPath,JSON.stringify(s.input));
 assert.throws(()=>buildVoiceAudition(s),/audition_language_mismatch/);
});
test('unsafe IDs and duplicate candidates are rejected',()=>{
 const s=setup();s.input.candidates[0].id='../secret';fs.writeFileSync(s.manifestPath,JSON.stringify(s.input));
 assert.throws(()=>buildVoiceAudition(s),/audition_candidate_id_unsafe/);
 const d=setup();d.input.candidates[0].id=d.input.candidates[1].id;fs.writeFileSync(d.manifestPath,JSON.stringify(d.input));
 assert.throws(()=>buildVoiceAudition(d),/audition_duplicate_candidate_id/);
});
test('script tags in data cannot escape the offline audition data payload',()=>{
 const s=setup();s.input.projectId='\u003c/script>\u003cscript>alert(1)\u003c/script>';fs.writeFileSync(s.manifestPath,JSON.stringify(s.input));
 buildVoiceAudition(s);const payload=fs.readFileSync(path.join(s.outputDir,'audition-data.js'),'utf8');
 assert.ok(!payload.includes('<script>'));assert.ok(payload.includes('\\u003cscript'));
});
test('missing source recordings fail rather than creating imaginary auditions',()=>{
 const s=setup();s.input.candidates[0].audioPath='missing.wav';fs.writeFileSync(s.manifestPath,JSON.stringify(s.input));
 assert.throws(()=>buildVoiceAudition(s));
});

test('rejects audio file traversal and accidental access outside its own project folder',()=>{
 const s=setup();s.input.candidates[0].audioPath='../other.wav';fs.writeFileSync(s.manifestPath,JSON.stringify(s.input));
 assert.throws(()=>buildVoiceAudition(s),/ENOENT|outside_manifest_directory/);
 const absolute=setup();absolute.input.candidates[0].audioPath='/tmp/example.wav';fs.writeFileSync(absolute.manifestPath,JSON.stringify(absolute.input));
 assert.throws(()=>buildVoiceAudition(absolute),/absolute_source_path_rejected/);
});

test('supports A/B comparisons across accents in the same language',()=>{
 const s=setup();s.input.candidates[1].locale='en-GB';s.input.candidates[1].accent='british-rp';fs.writeFileSync(s.manifestPath,JSON.stringify(s.input));
 const out=buildVoiceAudition(s);const report=JSON.parse(fs.readFileSync(out.reportPath,'utf8'));
 assert.equal(report.candidates[0].locale,'en-US');assert.equal(report.candidates[1].locale,'en-GB');
 assert.equal(report.candidates[1].accent,'british-rp');
});

test('every audition take must identify its model for controlled v3 vs v4 comparison',()=>{
 const s=setup();delete s.input.candidates[1].modelId;fs.writeFileSync(s.manifestPath,JSON.stringify(s.input));
 assert.throws(()=>buildVoiceAudition(s),/audition_model_id_missing/);
});

test('optional ASR observation for real audio bytes is included in the portable audition report',()=>{
 const s=setup();
 const source=path.join(s.root,s.input.candidates[0].audioPath);
 const digest=crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
 const observation={schema:'evercraft.voice-foundry.asr-observation.v1',method:'automated_asr',
  engineId:'fixture-not-actual-ASR',engineVersion:'fixture-v1',sourceReceiptRef:'unverified-fixture',
  cueId:'synthetic-0',audioDigest:digest,locale:'en-US',
  recognizedText:'No human audio was produced.'};
 fs.writeFileSync(path.join(s.root,'asr.json'),JSON.stringify(observation));
 s.input.candidates[0].asrObservationPath='asr.json';
 fs.writeFileSync(s.manifestPath,JSON.stringify(s.input));
 const out=buildVoiceAudition(s);
 const report=JSON.parse(fs.readFileSync(out.reportPath,'utf8'));
 assert.equal(report.candidates[0].asrAnalysisStatus,'candidate_text_match_needs_human_review');
 assert.equal(report.candidates[0].transcriptAudit.audioDigest,digest);
 assert.equal(report.candidates[0].transcriptAudit.humanListeningVerified,false);
 assert.equal(report.candidates[0].status,'awaiting_human_review');
 assert.equal(report.candidates[1].asrAnalysisStatus,'asr_not_provided');
 assert.ok(!JSON.stringify(report.candidates[0]).includes('asrObservationPath'));
});
test('wrong ASR audio digest holds audition candidate and does not promote silent fake text',()=>{
 const s=setup();
 const observation={schema:'evercraft.voice-foundry.asr-observation.v1',method:'automated_asr',
  engineId:'fixture',engineVersion:'v1',sourceReceiptRef:'fixture-receipt',
  cueId:'synthetic-0',audioDigest:'f'.repeat(64),locale:'en-US',
  recognizedText:'No human audio was produced.'};
 fs.writeFileSync(path.join(s.root,'asr.json'),JSON.stringify(observation));
 s.input.candidates[0].asrObservationPath='asr.json';
 fs.writeFileSync(s.manifestPath,JSON.stringify(s.input));
 const out=buildVoiceAudition(s);
 const report=JSON.parse(fs.readFileSync(out.reportPath,'utf8'));
 assert.equal(report.candidates[0].status,'asr_review_held');
 assert.ok(report.candidates[0].transcriptAudit.reasons.includes('asr_audio_digest_mismatch'));
});
test('ASR observation outside the project is refused before packaging',()=>{
 const s=setup();s.input.candidates[0].asrObservationPath='../secret.json';
 fs.writeFileSync(s.manifestPath,JSON.stringify(s.input));
 assert.throws(()=>buildVoiceAudition(s),/ENOENT|asr_path_outside_project/);
});
