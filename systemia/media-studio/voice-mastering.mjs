import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {inspectVoiceSignal} from './voice-signal-inspector.mjs';

const SCHEMA='evercraft.voice-foundry.mastering.v1';
const VOICE_CHAIN='highpass=f=65,acompressor=threshold=0.09:ratio=1.6:attack=14:release=160';
// Render with 0.2 dBTP safety headroom; the admission ceiling stays -1.5 dBTP.
const LOUDNESS='I=-16:TP=-1.7:LRA=9';
function execFfmpeg(args){
  const result=spawnSync('ffmpeg',args,{encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024});
  if(result.error) throw new Error('voice_mastering_ffmpeg_error:'+result.error.message);
  if(result.status!==0)throw new Error('voice_mastering_ffmpeg_failed:'+String(result.stderr).slice(-450));
  return result.stderr;
}
function loudnessStats(log){
  const match=log.match(/\{\s*"input_i"[\s\S]*?\}/);
  if(!match)throw new Error('voice_mastering_loudness_measurement_missing');
  const m=JSON.parse(match[0]);
  for(const field of ['input_i','input_tp','input_lra','input_thresh','target_offset']){
    if(!Number.isFinite(Number(m[field])))throw new Error('voice_mastering_loudness_stat_invalid:'+field);
  }
  return m;
}
/**
 * Preserve the original performance and create a separate reviewed-bus candidate.
 * Objective mastering is deliberately NOT a naturalness, accent, or editorial approval.
 * This function never uploads audio or contacts any AI/voice provider.
 */
export function masterVoiceStem({inputPath,outputPath}){
  if(typeof inputPath!=='string'||!inputPath.trim()||typeof outputPath!=='string'||!outputPath.trim())throw new Error('voice_mastering_paths_required');
  const source=fs.realpathSync(inputPath);
  const target=path.resolve(outputPath);
  if(source===target)throw new Error('voice_mastering_original_must_be_preserved');
  if(path.extname(target).toLowerCase()!=='.wav')throw new Error('voice_mastering_lossless_wav_required');
  if(!fs.statSync(source).isFile())throw new Error('voice_mastering_source_not_file');
  if(fs.existsSync(target))throw new Error('voice_mastering_output_exists');
  const input=inspectVoiceSignal(source);
  if(input.status!=='objective_measurements_only')throw new Error('voice_mastering_source_signal_held:'+input.reasons.join(','));
  const pass1=execFfmpeg(['-hide_banner','-nostats','-i',source,'-vn','-af',VOICE_CHAIN+',loudnorm='+LOUDNESS+':print_format=json','-f','null','-']);
  const measured=loudnessStats(pass1);
  const filter=VOICE_CHAIN+',loudnorm='+LOUDNESS+
    ':measured_I='+measured.input_i+
    ':measured_TP='+measured.input_tp+
    ':measured_LRA='+measured.input_lra+
    ':measured_thresh='+measured.input_thresh+
    ':offset='+measured.target_offset+
    ':linear=true:print_format=json';
  fs.mkdirSync(path.dirname(target),{recursive:true});
  const temp=target+'.tmp.wav';
  if(fs.existsSync(temp))throw new Error('voice_mastering_temp_exists');
  try{
    execFfmpeg(['-hide_banner','-nostats','-i',source,'-vn','-af',filter,'-ar','48000','-ac','1','-c:a','pcm_s24le','-f','wav',temp]);
    const output=inspectVoiceSignal(temp,{master:true});
    const reasons=[...output.reasons];
    if(Math.abs(output.durationSec-input.durationSec)>0.10)reasons.push('mastering_changed_speech_duration');
    if(output.integratedLufs===null || Math.abs(output.integratedLufs-(-16))>2.0)reasons.push('master_loudness_outside_target');
    if(reasons.length)throw new Error('voice_mastering_review_hold:'+reasons.join(','));
    fs.renameSync(temp,target);
    return Object.freeze({schema:SCHEMA,sourceDigest:input.audioDigest,outputDigest:output.audioDigest,
      sourcePath:source,outputPath:target,sourceSignal:input,masterSignal:output,
      processing:['highpass 65Hz','gentle 1.6:1 compression','two-pass EBU R128 loudness','48kHz mono 24-bit PCM'],
      targetIntegratedLufs:-16,maxTruePeakDbTP:-1.5,
      status:'master_candidate_needs_listening_review',
      speakingQualityValidated:false,voiceIdentityValidated:false,accentValidated:false,
      publicationAuthorityGranted:false});
  }finally{if(fs.existsSync(temp))fs.rmSync(temp,{force:true});}
}
