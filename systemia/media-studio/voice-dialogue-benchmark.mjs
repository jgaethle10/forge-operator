import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const SHA=/^[a-f0-9]{64}$/i;
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const scriptLine=line=>{
  assert.equal(typeof line,'string','dialogue_text_missing');
  assert.ok(line.trim().length>2,'dialogue_empty');
  assert.ok(!/\[(?:S[12]|[^\]]{1,80})\]/u.test(line),'dialogue_embedded_model_tag_forbidden');
  assert.ok(!/[\r\n]/u.test(line),'dialogue_newline_rejected');
  return line.trim();
};

/**
 * Build a reproducible, rights-held *candidate request*, NOT a model result.
 *
 * Nari Dia2 supports previous speaker audio through prefix-speaker-1/2 and
 * two-speaker transcript tags. The actual Dia2 implementation and weights
 * remain external, are never automatically downloaded, and are not described
 * as Evercraft-trained. Model results require subsequent independent review.
 */
export function prepareDialogueBenchmark({context,sourceManifest,model='nari-labs/Dia2-1B',prefixes=[]}) {
  assert.equal(context?.schema,'evercraft.voice-foundry.contextual-performance-audition.v1','context_plan_schema_invalid');
  assert.equal(sourceManifest?.schema,'evercraft.voice-foundry.founder-rejection-record.v1','founder_rejection_required');
  assert.ok(sourceManifest.versions?.length>=2 &&
    sourceManifest.versions.every(v=>v.founderVerdict?.decision==='rejected'),'rejected_candidates_must_stay_rejected');
  assert.ok(['nari-labs/Dia2-1B','nari-labs/Dia2-2B'].includes(model),'unsupported_model');
  const turns=context.turns;
  assert.ok(Array.isArray(turns)&&turns.length>=5,'complete_dialogue_required');
  const roles=new Map([['agent','S1'],['owner','S2']]);
  const speakers=new Set(),seen=new Set();
  let previousAfter=null;
  const dialogue=turns.map((turn,i)=>{
    assert.ok(!seen.has(turn.id),'duplicate_turn');seen.add(turn.id);
    assert.ok(roles.has(turn.speaker),'unknown_speaker');
    const tag=roles.get(turn.speaker);
    speakers.add(tag);
    assert.ok(turn.event&&turn.goal&&turn.appraisal,'actor_intent_required');
    if(i>0)assert.equal(turn.before,previousAfter,'broken_context_state_chain');
    previousAfter=turn.after;
    return {id:turn.id,role:turn.speaker,speakerTag:tag,
      text:scriptLine(turn.text),event:turn.event,appraisal:turn.appraisal,
      actorGoal:turn.goal,sceneStart:turn.sceneStart,sceneEnd:turn.sceneEnd};
  });
  assert.equal(speakers.size,2,'two_speakers_required');
  const prefixRecords=prefixes.map(p=>{
    assert.ok(['agent','owner'].includes(p.role),'unrecognized_prefix_role');
    assert.ok(typeof p.audioPath==='string' && p.audioPath.trim(),'prefix_path_missing');
    assert.ok(SHA.test(p.audioSha256??''),'prefix_sha256_missing');
    assert.ok(typeof p.rightsEvidenceRef==='string'&&p.rightsEvidenceRef.trim(),
      'unverified_audio_reference_cannot_be_conditioned');
    assert.ok(p.ownerOrSpeakerConsentVerified===true,'voice_prefix_consent_required');
    assert.ok(p.reviewedForSpeakerIdentity===true,'voice_prefix_identity_unreviewed');
    return {...p};
  });
  assert.ok(new Set(prefixRecords.map(p=>p.role)).size===prefixRecords.length,'duplicate_speaker_prefix');
  const prefixReady=prefixRecords.length===2 && prefixRecords.every(p=>fs.existsSync(path.resolve(p.audioPath))
    && crypto.createHash('sha256').update(fs.readFileSync(path.resolve(p.audioPath))).digest('hex')===p.audioSha256);
  const script=dialogue.map(t=>'['+t.speakerTag+'] '+t.text).join(' ');
  const prepared={
    schema:'evercraft.voice-foundry.whole-dialogue-model-benchmark.v1',
    campaignId:context.campaign,
    comparedRejectedTakeIds:sourceManifest.versions.map(v=>v.id),
    model,externalPretrainedWeights:true,ownedOrchestrator:true,
    dialogue,speakerMap:{S1:'agent',S2:'owner'},
    modelScript:script,modelScriptSha256:crypto.createHash('sha256').update(script).digest('hex'),
    notes:'The dramatic context is preserved in evidence, but only tagged script and verified prefix WAVs are passed to Dia2. No assertion of arbitrary emotion/control inputs.',
    conditioning:{usesPreviousAudio:true,prefixes:prefixRecords,
      assetsAuthenticatedAndPresent:prefixReady},
    generation:{executed:false,modelCheckpointPinned:false,randomSeedPinned:false,
      cudaRequirementsVerified:false,resultWavSha256:null},
    quality:{multiTurnIdentityProven:false,wordFidelityProven:false,emotionalTruthProven:false,
      twoIndependentHumanSceneReviewsCompleted:false,founderApproved:false},
    release:{paidGenerationAuthorized:false,voiceRightsCleared:false,
      admittedToFallen:false,publicationAuthorized:false},
    status:prefixReady?'requires_gpu_runtime_and_reviewer_acceptance':'held_missing_two_authorized_voice_prefixes'
  };
  prepared.benchmarkDigest=digest({script,model,conditioning:prepared.conditioning});
  return prepared;
}

export function inspectRuntime({command='nvidia-smi'}={}) {
  const probe=spawnSync(command,
    ['--query-gpu=index,name,memory.total,driver_version','--format=csv,noheader,nounits'],
    {encoding:'utf8',timeout:5000});
  const gpuLines=probe.status===0?probe.stdout.trim().split('\n').filter(Boolean):[];
  const gpus=gpuLines.map(x=>{
    const [index,name,memoryMiB,driverVersion]=x.split(',').map(v=>v.trim());
    return {index:Number(index),name,memoryMiB:Number(memoryMiB),driverVersion};
  }).filter(g=>Number.isFinite(g.memoryMiB));
  const receipt={
    schema:'evercraft.voice-foundry.dia2-hardware-audit.v1',
    hostCpuCount:os.cpus().length,
    hostTotalMemoryGiB:Number((os.totalmem()/1024**3).toFixed(2)),
    visibleNvidiaGpus:gpus,
    modelDownloaded:false,
    modelGeneratedAudio:false,
    authorizedGpuSpend:false,
    gpuExecutionEligible:gpus.length>0,
    blocker:gpus.length===0?'no_verified_cuda_gpu':'cuda_runtime_and_model_memory_still_require_proof'
  };
  return receipt;
}

export function assessBenchmarkEvidence({plan,modelOutput,reviews=[]}){
  assert.equal(plan?.schema,'evercraft.voice-foundry.whole-dialogue-model-benchmark.v1','benchmark_plan_invalid');
  const reasons=[];
  if(plan.status!=='requires_gpu_runtime_and_reviewer_acceptance')
    reasons.push('authorized_previous_audio_not_ready');
  if(modelOutput?.status!=='verified_audio_artifact' || !SHA.test(modelOutput?.sha256??''))
    reasons.push('no_real_synthesis_artifact');
  if(modelOutput?.sourcePlanDigest!==plan.benchmarkDigest)reasons.push('model_output_not_bound_to_plan');
  if(modelOutput?.allSpokenWordsHumanVerified!==true)reasons.push('word_fidelity_unverified');
  if(modelOutput?.twoSpeakerContinuityHumanVerified!==true)reasons.push('speaker_continuity_unverified');
  if(!Array.isArray(reviews)||reviews.length<2)reasons.push('whole_scene_human_reviews_required');
  else {
    const ids=reviews.map(r=>r.reviewerId);
    if(new Set(ids).size!==ids.length||ids.some(x=>!x))reasons.push('independent_reviewers_required');
    for(const r of reviews){
      if(r.listenedToDigest!==modelOutput?.sha256||r.fullSceneListened!==true)
        reasons.push('full_scene_review_missing');
      if(r.approved!==true||r.naturalness<4||r.emotionalTruth<4||r.responsiveness<4)
        reasons.push('creative_acceptance_not_met');
      if(!r.evidenceRef)reasons.push('authentic_review_receipt_missing');
    }
  }
  return {schema:'evercraft.voice-foundry.whole-dialogue-benchmark-assessment.v1',
    result:'held_requires_verified_admission',reasons:[...new Set(reasons)],
    reviewAuthenticityIndependentlyVerified:false,
    founderApprovalRequired:true,publicationAuthorized:false,
    bestTakeSelected:false};
}

const main=()=>{
  const [op,contextPath,rejectionPath,outDir]=process.argv.slice(2);
  if(op==='audit-runtime'){
    process.stdout.write(JSON.stringify(inspectRuntime(),null,2)+'\n');return;
  }
  if(op!=='prepare'||!contextPath||!rejectionPath||!outDir)
    throw Error('Usage: node voice-dialogue-benchmark.mjs prepare <context.json> <founder-rejection.json> <output-directory> OR audit-runtime');
  const context=JSON.parse(fs.readFileSync(contextPath,'utf8'));
  const sourceManifest=JSON.parse(fs.readFileSync(rejectionPath,'utf8'));
  const result=prepareDialogueBenchmark({context,sourceManifest});
  fs.mkdirSync(outDir,{recursive:true});
  fs.writeFileSync(path.join(outDir,'dialogue.txt'),result.modelScript+'\n');
  fs.writeFileSync(path.join(outDir,'benchmark-held.json'),JSON.stringify(result,null,2)+'\n');
  fs.writeFileSync(path.join(outDir,'runtime-audit.json'),JSON.stringify(inspectRuntime(),null,2)+'\n');
  process.stdout.write(JSON.stringify({status:result.status,dialogueTurns:result.dialogue.length,
    benchmarkDigest:result.benchmarkDigest},null,2)+'\n');
};
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{main();}catch(e){console.error(e);process.exitCode=1;}
}
