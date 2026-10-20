import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {inspectVoiceSignal} from './voice-signal-inspector.mjs';
import {inspectVoicePacing} from './voice-pacing.mjs';

const SHA=/^[a-f0-9]{64}$/i;
const ID=/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,59}$/;
const MAX_TEXT=1800;
const MAX_MODEL=2500*1024*1024;
function fail(code){throw new Error('voice_local_piper_'+code);}
function strictFile(p,label,max){
  if(typeof p!=='string'||!path.isAbsolute(p))fail(label+'_absolute_path_required');
  let resolved;try{resolved=fs.realpathSync(p);}catch{fail(label+'_not_installed');}
  const stat=fs.statSync(resolved);
  if(!stat.isFile()||stat.size===0||stat.size>max)fail(label+'_file_invalid_or_oversize');
  return resolved;
}
async function digestFile(file){
  const hash=crypto.createHash('sha256');
  for await(const part of fs.createReadStream(file))hash.update(part);
  return hash.digest('hex');
}
function jsonFile(p){
  if(fs.statSync(p).size>256*1024)fail('model_config_oversize');
  let data;try{data=JSON.parse(fs.readFileSync(p,'utf8'));}catch{fail('model_config_not_json');}
  return data;
}
function locale(value){
  if(typeof value!=='string'||!value.trim())fail('locale_invalid');
  try{return Intl.getCanonicalLocales(value.replace(/_/g,'-'))[0];}catch{fail('locale_invalid');}
}
function assertRange(value,min,max,label){
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail(label+'_outside_audition_bounds');
}
function command(executable,args,input){
  const r=spawnSync(executable,args,{
    encoding:'utf8',input,timeout:120000,maxBuffer:512*1024,shell:false,
  });
  if(r.error)fail('inference_process_error:'+r.error.code);
  if(r.status!==0)fail('inference_process_failed:'+r.status);
}
/**
 * Run an explicitly installed/licensed local Piper model to create an UNAPPROVED
 * private audition. Unlike dry synthetic unit signals, this invokes an actual
 * TTS executable when supplied. No model download, paid API or network calls.
 */
export async function createLocalPiperTake({
  scriptText,candidateId,voiceProfileId,locale:requestedLocale,accent,genderPresentation,
  performanceDirection,piperCliPath,modelPath,modelConfigPath,
  expectedBinarySha256,expectedModelSha256,expectedConfigSha256,
  speakerId=0,lengthScale=1,noiseScale=.667,noiseWidth=.8,
  sentenceSilenceSec=.2,outputDir,licenseEvidenceRef,rightsState
}){
  if(typeof scriptText!=='string'||!scriptText.trim()||scriptText.length>MAX_TEXT)fail('script_missing_or_oversize');
  if(scriptText.includes('\u0000')||scriptText.includes('\r'))fail('script_control_characters');
  if(typeof candidateId!=='string'||!ID.test(candidateId))fail('candidate_id_unsafe');
  if(typeof voiceProfileId!=='string'||!ID.test(voiceProfileId))fail('voice_profile_invalid');
  const language=locale(requestedLocale);
  if(typeof accent!=='string'||!accent.trim()||typeof performanceDirection!=='string'||!performanceDirection.trim())fail('casting_direction_missing');
  if(!['feminine','masculine','neutral','unspecified'].includes(genderPresentation))fail('presentation_invalid');
  if(rightsState!=='cleared'||typeof licenseEvidenceRef!=='string'||!licenseEvidenceRef.trim())fail('voice_license_evidence_required');
  if(!Number.isInteger(speakerId)||speakerId<0||speakerId>1000)fail('speaker_id_invalid');
  assertRange(lengthScale,.8,1.2,'length_scale');
  assertRange(noiseScale,0,1.5,'noise_scale');
  assertRange(noiseWidth,0,1.5,'noise_width');
  assertRange(sentenceSilenceSec,0,1,'sentence_silence');
  if(![expectedBinarySha256,expectedModelSha256,expectedConfigSha256].every(x=>typeof x==='string'&&SHA.test(x)))fail('pinned_sha256_required');
  const cli=strictFile(piperCliPath,'binary',100*1024*1024);
  const model=strictFile(modelPath,'model',MAX_MODEL);
  const config=strictFile(modelConfigPath,'config',256*1024);
  if(!(fs.statSync(cli).mode&0o111))fail('binary_not_executable');
  const cfg=jsonFile(config);
  if(locale(cfg.language?.code)!==language)fail('model_locale_not_verified_for_cast');
  if(Number.isInteger(cfg.num_speakers)&&speakerId>=cfg.num_speakers)fail('speaker_outside_model_catalog');
  const [binarySha,modelSha,configSha]=await Promise.all([digestFile(cli),digestFile(model),digestFile(config)]);
  if(binarySha.toLowerCase()!==expectedBinarySha256.toLowerCase()||
     modelSha.toLowerCase()!==expectedModelSha256.toLowerCase()||
     configSha.toLowerCase()!==expectedConfigSha256.toLowerCase())fail('pinned_runtime_or_voice_changed');
  if(typeof outputDir!=='string'||!outputDir.trim())fail('output_dir_required');
  const dir=path.resolve(outputDir);
  if(!fs.existsSync(dir)||!fs.statSync(dir).isDirectory())fail('output_dir_not_existing');
  const out=path.join(dir,candidateId+'.wav');
  const receipt=path.join(dir,candidateId+'.voice-take.json');
  if(fs.existsSync(out)||fs.existsSync(receipt))fail('audition_take_already_exists');
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-piper-take-'));
  try{
    const staged=path.join(scratch,'neural-take.wav');
    command(cli,['--model',model,'--config',config,'--output_file',staged,'--speaker',String(speakerId),
      '--length_scale',String(lengthScale),'--noise_scale',String(noiseScale),'--noise_w',String(noiseWidth),
      '--sentence_silence',String(sentenceSilenceSec)],scriptText+'\n');
    if(!fs.existsSync(staged)||!fs.statSync(staged).isFile()||fs.statSync(staged).size===0||
       fs.statSync(staged).size>30*1024*1024)fail('synthesis_output_missing_or_oversize');
    const signal=inspectVoiceSignal(staged);
    const pacing=inspectVoicePacing(staged);
    if(signal.audioDigest!==pacing.audioDigest)fail('audio_inspection_digest_mismatch');
    if(signal.status!=='objective_measurements_only')fail('audio_signal_held');
    if(signal.durationSec>150)fail('synthesized_audio_too_long');
    // Exclusive copy ensures existing takes are never clobbered.
    fs.copyFileSync(staged,out,fs.constants.COPYFILE_EXCL);
    const manifestCandidate={
      id:candidateId,label:candidateId,voiceProfileId,locale:language,accent,genderPresentation,
      scriptText,provider:'piper-local',modelId:'sha256:'+modelSha,
      providerReceiptRef:'local-piper-runtime-sha256:'+binarySha,rightsState,
      rightsEvidenceRef:licenseEvidenceRef,audioPath:path.basename(out),performanceDirection,
    };
    const record={
      schema:'evercraft.voice-foundry.local-piper-take.v1',candidateId,sourceAudioDigest:signal.audioDigest,
      scriptDigest:crypto.createHash('sha256').update(scriptText).digest('hex'),
      engineDigest:binarySha,modelDigest:modelSha,configDigest:configSha,
      params:{speakerId,lengthScale,noiseScale,noiseWidth,sentenceSilenceSec},
      signal,pacing,manifestCandidate,
      status:'private_neural_audition_needs_human_review',
      licenseEvidenceClaimedNotAuthenticated:true,localeAndAccentNeedQualifiedReview:true,
      speechContentNotVerified:true,emotionalTruthNotVerified:true,
      paidProviderCallsMade:false,publicationAuthorityGranted:false,
    };
    try{fs.writeFileSync(receipt,JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600});}
    catch(e){fs.rmSync(out,{force:true});throw e;}
    return {outputPath:out,receiptPath:receipt,record};
  }finally{fs.rmSync(scratch,{recursive:true,force:true});}
}
