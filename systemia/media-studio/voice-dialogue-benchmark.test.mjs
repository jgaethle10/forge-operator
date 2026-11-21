import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {prepareDialogueBenchmark,inspectRuntime,assessBenchmarkEvidence} from './voice-dialogue-benchmark.mjs';

const home=path.dirname(fileURLToPath(import.meta.url));
const context=JSON.parse(fs.readFileSync(path.resolve(home,'../graphics-command/campaigns/systemia-v15-emotion-context-plan.json'),'utf8'));
const rejection=JSON.parse(fs.readFileSync(path.resolve(home,'../graphics-command/campaigns/systemia-v19-founder-rejection.json'),'utf8'));
const clone=x=>structuredClone(x);

test('complete two-speaker script preserves event and belief causality',()=>{
 const plan=prepareDialogueBenchmark({context,rejection:undefined,sourceManifest:rejection});
 assert.equal(plan.dialogue.length,7);
 assert.equal(plan.speakerMap.S1,'agent');
 assert.equal(plan.speakerMap.S2,'owner');
 assert.match(plan.modelScript,/^\[S1\] Your proposal's ready\./);
 assert.match(plan.modelScript,/\[S2\] Wait\. You sent it\? I said draft\./);
 assert.equal(plan.dialogue[3].event,'owner_challenges_send');
 assert.equal(plan.status,'held_missing_two_authorized_voice_prefixes');
 assert.equal(plan.conditioning.assetsAuthenticatedAndPresent,false);
 assert.equal(plan.generation.executed,false);
 assert.equal(plan.release.publicationAuthorized,false);
});
test('no missing or invented founder rejection can be converted to benchmark approval',()=>{
 const tamper=clone(rejection);tamper.versions[0].founderVerdict.decision='approved';
 assert.throws(()=>prepareDialogueBenchmark({context,sourceManifest:tamper}),/rejected_candidates_must_stay_rejected/);
 const broken=clone(context);broken.turns[3].before='everything_fine';
 assert.throws(()=>prepareDialogueBenchmark({context:broken,sourceManifest:rejection}),/broken_context_state_chain/);
});
test('unreviewed prefixes are rejected and never read by the model adapter',()=>{
 assert.throws(()=>prepareDialogueBenchmark({context,sourceManifest:rejection,prefixes:[
  {role:'agent',audioPath:'/tmp/not-real.wav',audioSha256:'a'.repeat(64),
   rightsEvidenceRef:'',ownerOrSpeakerConsentVerified:false,reviewedForSpeakerIdentity:false}
 ]}),/unverified_audio_reference_cannot_be_conditioned/);
});
test('two authentic *local test fixtures* only change preflight, never approval',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-test-prefix-'));
 try{
  const prefixes=['agent','owner'].map(role=>{
   const audioPath=path.join(dir,role+'.wav');
   fs.writeFileSync(audioPath,'local fixture; not model audio');
   return {role,audioPath,
    audioSha256:crypto.createHash('sha256').update(fs.readFileSync(audioPath)).digest('hex'),
    rightsEvidenceRef:'test-only-do-not-use',ownerOrSpeakerConsentVerified:true,reviewedForSpeakerIdentity:true};
  });
  const plan=prepareDialogueBenchmark({context,sourceManifest:rejection,prefixes});
  assert.equal(plan.status,'requires_gpu_runtime_and_reviewer_acceptance');
  assert.equal(plan.generation.executed,false);
  const verdict=assessBenchmarkEvidence({plan,modelOutput:null,reviews:[]});
  assert.equal(verdict.result,'held_requires_verified_admission');
  assert.ok(verdict.reasons.includes('no_real_synthesis_artifact'));
  assert.equal(verdict.publicationAuthorized,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('even fabricated perfect review docs cannot self-authorize publication',()=>{
 const plan=prepareDialogueBenchmark({context,sourceManifest:rejection});
 const modelOutput={status:'verified_audio_artifact',sha256:'f'.repeat(64),
   sourcePlanDigest:plan.benchmarkDigest,allSpokenWordsHumanVerified:true,
   twoSpeakerContinuityHumanVerified:true};
 const reviews=['reviewer-a','reviewer-b'].map(reviewerId=>({
  reviewerId,listenedToDigest:modelOutput.sha256,fullSceneListened:true,approved:true,
  naturalness:5,emotionalTruth:5,responsiveness:5,evidenceRef:'untrusted-inline-doc'
 }));
 const verdict=assessBenchmarkEvidence({plan,modelOutput,reviews});
 assert.equal(verdict.publicationAuthorized,false);
 assert.equal(verdict.bestTakeSelected,false);
 assert.equal(verdict.reviewAuthenticityIndependentlyVerified,false);
 assert.ok(verdict.reasons.includes('authorized_previous_audio_not_ready'));
});
test('read-only runner hardware audit never asserts GPU access from missing nvidia-smi',()=>{
 const r=inspectRuntime({command:'evercraft-nonexistent-nvidia-probe'});
 assert.equal(r.gpuExecutionEligible,false);
 assert.equal(r.modelGeneratedAudio,false);
 assert.equal(r.authorizedGpuSpend,false);
 assert.equal(r.blocker,'no_verified_cuda_gpu');
});
