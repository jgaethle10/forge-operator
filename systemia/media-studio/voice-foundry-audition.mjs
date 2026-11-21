/**
 * Evercraft Fallen | Voice Foundry audition admission.
 * Provider-neutral; no synthesis, publication, voice cloning, or paid execution.
 * A candidate cannot pass by supplying metadata without real, hashed audio
 * and blinded human ratings. Qualification is NOT a production approval.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const hex = /^[0-9a-f]{64}$/;
const clean = x => typeof x === 'string' ? x.trim() : '';
const bounded = n => Number.isInteger(n) && n>=1 && n<=5;
export const PROFILE_ID = 'evercraft-male-magnetic-audition-v1';
export const TEST_READS = Object.freeze([
  {
    id:'curiosity',
    text:'You know what’s interesting? Most people never notice the moment everything changes.',
    direction:'Small genuine smile on the first question. A thoughtful pause, then a quiet discovery. No manufactured suspense.',
  },
  {
    id:'trust',
    text:'There’s a reason we show the work. You deserve to know what you’re looking at.',
    direction:'Matter-of-fact and reassuring. Warm authority, not a sales pitch. Respect the listener’s intelligence.',
  },
  {
    id:'wonder',
    text:'Look a little closer. There’s an entire story hiding in the details.',
    direction:'Understated amazement. Invite curiosity without whispering or adding breathy intimacy.',
  },
]);
export function buildVoiceAuditionPlan(){
  const profile = {
    id:PROFILE_ID,
    status:'unselected_candidate_profile',
    role:'Male counterpart to Bella; distinct, not an impression or impersonation.',
    qualities:['effortless intrigue','warm chest resonance','quiet confidence','subtle amusement','clear diction','emotional intelligence'],
    avoid:['performative seduction','audible mouth breathing','forced bass','whisper-rasp','trailer announcer','robotic timing','flirtation aimed at listener'],
    engineeringNotes:{
      pitch:'Natural to the selected speaker; do not lower pitch to manufacture allure.',
      delivery:'Preserve natural phrasing and consonant transients; author pauses at semantic turns.',
      processing:'Use conservative denoise and compression; no extreme formant or time stretching.',
      listening:'Test unaccompanied, in mono on phone speakers, and with a restrained music bed.',
    },
  };
  const plan={
    schema:'evercraft.fallen.voice-audition-plan.v1',
    profile,
    reads:TEST_READS,
    candidatePolicy:{minCandidateCount:2,minDistinctListeners:6,minPerTargetGroup:2,requiredSelfReportedGroups:['woman','man'],
      metrics:['keepListening','intelligibility','naturalness','discomfort'],
      scale:'Integers 1 to 5. Higher is better except discomfort (1=none, 5=severe).',
      thresholds:{keepListeningMean:4,naturalnessMean:4,intelligibilityMean:4,discomfortMeanMax:1.5},
      blindTest:true,sourceRightsRequired:true,originalVoiceOnly:true,
    },
    boundaries:{audioGenerated:false,providerSelected:false,voiceIdentityLocked:false,releaseAuthorized:false,paidCallsAuthorized:false},
  };
  return {...plan,planDigest:sha(JSON.stringify(plan))};
}

function inspectAudio(filePath, expectedSha){
  const problems=[];
  if(!path.isAbsolute(filePath||''))return {problems:['audio_path_must_be_absolute']};
  if(!fs.existsSync(filePath)||!fs.statSync(filePath).isFile())return {problems:['audio_file_missing']};
  const realSha=sha(fs.readFileSync(filePath));
  if(realSha!==expectedSha)problems.push('audio_sha_mismatch');
  const probe=spawnSync('ffprobe',['-v','error','-select_streams','a:0','-show_entries','stream=codec_name,sample_rate,channels:format=duration','-of','json',filePath],{encoding:'utf8',timeout:12000});
  if(probe.error||probe.status!==0){
    problems.push('audio_probe_failed');return {realSha,problems};
  }
  let metadata;
  try{metadata=JSON.parse(probe.stdout);}catch{problems.push('audio_probe_invalid');return {realSha,problems};}
  const duration=Number(metadata.format?.duration);
  if(!metadata.streams?.length)problems.push('no_audio_stream');
  if(!Number.isFinite(duration)||duration<1||duration>40)problems.push('audio_duration_out_of_bounds');
  return {realSha,durationSec:duration,codec:metadata.streams?.[0]?.codec_name||null,problems};
}

export function evaluateVoiceAuditions(payload){
  const plan=buildVoiceAuditionPlan();
  if(payload?.schema!=='evercraft.fallen.voice-audition-review.v1')throw Error('voice_audition_schema_invalid');
  if(payload.planDigest!==plan.planDigest)throw Error('voice_audition_plan_digest_mismatch');
  const candidates=Array.isArray(payload.candidates)?payload.candidates:[];
  const allIds=new Set();
  const assessed=candidates.map(candidate=>{
    const issues=[];
    const id=clean(candidate?.candidateId);
    if(!id||allIds.has(id))issues.push('candidate_id_missing_or_repeated');
    allIds.add(id);
    if(clean(candidate?.voiceProfileId)!==PROFILE_ID)issues.push('voice_profile_id_mismatch');
    if(!clean(candidate?.providerModel))issues.push('provider_model_missing');
    if(candidate?.rights?.source!=='original_or_licensed' || candidate?.rights?.commercialUseVerified!==true || !clean(candidate?.rights?.evidenceRef))issues.push('voice_rights_not_verified');
    if(candidate?.identity?.consentedToVoiceUse!==true || candidate?.identity?.realPersonImpersonation===true)issues.push('voice_identity_authorization_missing');
    const samples=Array.isArray(candidate?.samples)?candidate.samples:[];
    const seenReads=new Set();
    const audio=[];
    for(const read of TEST_READS){
      const matches=samples.filter(s=>s.readId===read.id);
      if(matches.length!==1){issues.push('read_missing_or_duplicate:'+read.id);continue;}
      const s=matches[0];seenReads.add(read.id);
      if(s.scriptText!==read.text)issues.push('read_text_modified:'+read.id);
      if(!hex.test(clean(s.sha256)))issues.push('audio_digest_invalid:'+read.id);
      const detail=inspectAudio(s.filePath,clean(s.sha256));
      issues.push(...detail.problems.map(z=>z+':'+read.id));
      audio.push({readId:read.id,sha256:detail.realSha||null,durationSec:detail.durationSec||null});
    }
    if(samples.some(s=>!seenReads.has(s.readId)))issues.push('unknown_read_in_samples');
    const ratings=Array.isArray(candidate?.ratings)?candidate.ratings:[];
    const listenerIds=new Set();
    const groups={woman:new Set(),man:new Set()};
    const groupScores={woman:{keepListening:[],discomfort:[]},man:{keepListening:[],discomfort:[]}};
    const scores={keepListening:[],naturalness:[],intelligibility:[],discomfort:[]};
    for(const r of ratings){
      const listener=clean(r?.listenerId);
      if(!listener||listenerIds.has(listener)){issues.push('listener_id_missing_or_duplicate');continue;}
      listenerIds.add(listener);
      if(r?.blind!==true)issues.push('unblinded_rating:'+listener);
      if(groups[r?.selfReportedGroup]){
        groups[r.selfReportedGroup].add(listener);
        for(const metric of ['keepListening','discomfort']){
          if(bounded(r?.[metric]))groupScores[r.selfReportedGroup][metric].push(r[metric]);
        }
      }
      for(const metric of Object.keys(scores)){
        if(!bounded(r?.[metric]))issues.push('invalid_rating:'+metric+':'+listener);
        else scores[metric].push(r[metric]);
      }
    }
    if(listenerIds.size<plan.candidatePolicy.minDistinctListeners)issues.push('insufficient_distinct_listeners');
    for(const group of plan.candidatePolicy.requiredSelfReportedGroups){
      if(groups[group].size<plan.candidatePolicy.minPerTargetGroup)issues.push('insufficient_group_coverage:'+group);
    }
    const means=Object.fromEntries(Object.entries(scores).map(([k,v])=>[k,v.length?Number((v.reduce((a,b)=>a+b,0)/v.length).toFixed(3)):null]));
    const thresholds=plan.candidatePolicy.thresholds;
    for(const [metric,key] of [['keepListening','keepListeningMean'],['naturalness','naturalnessMean'],['intelligibility','intelligibilityMean']]){
      if(means[metric]===null||means[metric]<thresholds[key])issues.push('audience_threshold_not_met:'+metric);
    }
    if(means.discomfort===null||means.discomfort>thresholds.discomfortMeanMax)issues.push('audience_threshold_not_met:discomfort');
    const groupMeans=Object.fromEntries(Object.entries(groupScores).map(([group,ratings])=>[group,Object.fromEntries(Object.entries(ratings).map(([metric,values])=>[metric,values.length?Number((values.reduce((a,b)=>a+b,0)/values.length).toFixed(3)):null]))]));
    for(const group of plan.candidatePolicy.requiredSelfReportedGroups){
      if(groupMeans[group].keepListening===null||groupMeans[group].keepListening<thresholds.keepListeningMean)issues.push('group_keep_listening_below_threshold:'+group);
      if(groupMeans[group].discomfort===null||groupMeans[group].discomfort>thresholds.discomfortMeanMax)issues.push('group_discomfort_above_threshold:'+group);
    }
    return {candidateId:id||null,status:issues.length?'blocked':'qualified_for_director_review',issues:[...new Set(issues)],means,groupMeans,groupCounts:{woman:groups.woman.size,man:groups.man.size},audienceSize:listenerIds.size,audio};
  });
  const cohortProblem=candidates.length<plan.candidatePolicy.minCandidateCount?'insufficient_candidate_count':null;
  return {
    schema:'evercraft.fallen.voice-audition-result.v1',
    profileId:PROFILE_ID,planDigest:plan.planDigest,
    status:cohortProblem?'blocked':assessed.some(c=>c.status==='qualified_for_director_review')?'candidate_qualified_for_director_review':'blocked',
    blockers:cohortProblem?[cohortProblem]:[],candidates:assessed,
    boundaries:{humanDirectorApprovalRequired:true,productionVoiceNotSelected:true,noAudioGeneratedByEvaluation:true,providerExecutionNotImplied:true,noPublicationAuthority:true},
  };
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [,,command,arg1,arg2]=process.argv;
  try{
    if(!['plan','review'].includes(command)||!arg1)throw Error('Usage: node voice-foundry-audition.mjs plan <output.json> | review <input.json> <output.json>');
    if(command==='review'&&!arg2)throw Error('review requires input.json and output.json');
    const result=command==='plan'?buildVoiceAuditionPlan():evaluateVoiceAuditions(JSON.parse(fs.readFileSync(arg1,'utf8')));
    const out=command==='plan'?arg1:arg2;
    fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});
    fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify({status:result.status||'planned',output:path.resolve(out),planDigest:result.planDigest},null,2));
    if(command==='review'&&result.status==='blocked')process.exitCode=2;
  }catch(error){console.error(error.message);process.exitCode=1;}
}
