import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { CreativeDepartment } from './departments.js';
import type {
  ProductionProviderAdapter,
  ProductionProviderResult,
} from './production-provider-runtime.js';
import type { ProductionNeed } from './types.js';

type FetchLike=(input:string,init?:{
  method?:string;
  headers?:Record<string,string>;
  body?:string;
})=>Promise<{
  ok:boolean;
  status:number;
  arrayBuffer():Promise<ArrayBuffer>;
  text():Promise<string>;
}>;

export interface ElevenLabsAudioAdapterConfig {
  apiKey:string;
  outputDir:string;
  verified:boolean;
  commercialRights:'allowed'|'unknown'|'denied';
  allowPaidGeneration?:boolean;
  departmentId?:string;
  defaultVoiceId?:string;
  voiceProfiles?:Record<string,string>;
  speechModelId?:string;
  musicModelId?:'music_v1'|'music_v2'|'music_v2_5';
  soundModelId?:'eleven_text_to_sound_v2';
  musicForceInstrumental?:boolean;
  soundPromptInfluence?:number;
  maxSpeechTempoAdjustmentPct?:number;
  baseUrl?:string;
  fetchImpl?:FetchLike;
  probeDurationSec?:(filePath:string)=>number;
  runFfmpeg?:(args:string[])=>void;
}

const DOCS={
  speech:'https://elevenlabs.io/docs/api-reference/text-to-speech/convert',
  music:'https://elevenlabs.io/docs/api-reference/music/compose',
  sfx:'https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert',
} as const;

function fetcher(config:ElevenLabsAudioAdapterConfig):FetchLike{
  const impl=config.fetchImpl??(globalThis.fetch as unknown as FetchLike);
  if(!impl) throw new Error('elevenlabs_audio_fetch_unavailable');
  return impl;
}

function safeName(value:string){
  return value.replace(/[^a-zA-Z0-9._-]+/g,'_');
}

function mimeFor(kind:ProductionNeed['kind']){
  if(kind==='speech') return 'audio/mpeg';
  if(kind==='music') return 'audio/mpeg';
  if(kind==='sfx') return 'audio/mpeg';
  throw new Error('elevenlabs_audio_kind_unsupported:'+kind);
}

function runFfmpegDefault(args:string[]){
  const result=spawnSync('ffmpeg',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  if(result.error) throw new Error('elevenlabs_audio_ffmpeg_failed:'+result.error.message);
  if(result.status!==0) throw new Error('elevenlabs_audio_ffmpeg_failed:'+(result.stderr||'unknown_error'));
}

function probeDurationDefault(filePath:string){
  const result=spawnSync('ffprobe',[
    '-v','error',
    '-show_entries','format=duration',
    '-of','default=noprint_wrappers=1:nokey=1',
    filePath,
  ],{encoding:'utf8'});
  if(result.error) throw new Error('elevenlabs_audio_ffprobe_failed:'+result.error.message);
  if(result.status!==0) throw new Error('elevenlabs_audio_ffprobe_failed:'+(result.stderr||'unknown_error'));
  const duration=Number(result.stdout.trim());
  if(!Number.isFinite(duration)||duration<=0) throw new Error('elevenlabs_audio_duration_invalid');
  return duration;
}

function timingTolerance(target:number){
  return Math.max(.25,target*.05);
}

function fitSpeechTiming(input:{
  sourcePath:string;
  outputPath:string;
  observedDuration:number;
  targetDuration:number;
  maxAdjustmentPct:number;
  runFfmpeg:(args:string[])=>void;
}){
  const delta=Math.abs(input.observedDuration-input.targetDuration);
  if(delta<=timingTolerance(input.targetDuration)){
    fs.renameSync(input.sourcePath,input.outputPath);
    return;
  }
  const tempo=input.observedDuration/input.targetDuration;
  const adjustment=Math.abs(tempo-1)*100;
  if(adjustment>input.maxAdjustmentPct){
    throw new Error('elevenlabs_speech_timing_out_of_bounds:'+adjustment.toFixed(1));
  }
  input.runFfmpeg([
    '-y',
    '-i',input.sourcePath,
    '-filter:a','atempo='+tempo.toFixed(6)+',apad,atrim=0:'+input.targetDuration,
    '-c:a','libmp3lame',
    '-b:a','192k',
    input.outputPath,
  ]);
  fs.rmSync(input.sourcePath,{force:true});
}

function voiceIdFor(need:ProductionNeed,config:ElevenLabsAudioAdapterConfig){
  if(need.voiceProfileId){
    const mapped=config.voiceProfiles?.[need.voiceProfileId];
    if(!mapped) throw new Error('elevenlabs_voice_profile_unmapped:'+need.voiceProfileId);
    return mapped;
  }
  if(config.defaultVoiceId?.trim()) return config.defaultVoiceId;
  throw new Error('elevenlabs_default_voice_missing');
}

function validateNeed(need:ProductionNeed){
  if(!['speech','music','sfx'].includes(need.kind)){
    throw new Error('elevenlabs_audio_kind_unsupported:'+need.kind);
  }
  if(!need.prompt?.trim()) throw new Error('elevenlabs_audio_prompt_missing');
  if(need.kind==='music'&&need.durationSec!==undefined&&(need.durationSec<3||need.durationSec>600)){
    throw new Error('elevenlabs_music_duration_unsupported');
  }
  if(need.kind==='sfx'&&need.durationSec!==undefined&&(need.durationSec<.5||need.durationSec>30)){
    throw new Error('elevenlabs_sfx_duration_unsupported');
  }
}

export function elevenLabsAudioDepartment(
  verified=false,
  departmentId='elevenlabs-audio',
):CreativeDepartment{
  const common=['commercial_rights','provenance_receipt','timing_control'] as const;
  return {
    id:departmentId,
    name:'ElevenLabs Audio Department',
    enabled:true,
    executionState:verified?'verified':'declared',
    capabilities:[
      {
        kind:'speech',
        requirements:['voice_profile',...common],
        maxDurationSec:300,
        languages:['*'],
        qualityTier:5,
        costTier:3,
        latencyTier:2,
      },
      {
        kind:'music',
        requirements:[...common],
        maxDurationSec:600,
        qualityTier:5,
        costTier:4,
        latencyTier:3,
      },
      {
        kind:'sfx',
        requirements:[...common],
        maxDurationSec:30,
        qualityTier:5,
        costTier:2,
        latencyTier:2,
      },
    ],
  };
}

export function createElevenLabsAudioAdapter(
  config:ElevenLabsAudioAdapterConfig,
):ProductionProviderAdapter{
  const base=(config.baseUrl??'https://api.elevenlabs.io').replace(/\/$/,'');
  const departmentId=config.departmentId??'elevenlabs-audio';
  const speechModel=config.speechModelId??'eleven_v3';
  const musicModel=config.musicModelId??'music_v2_5';
  const soundModel=config.soundModelId??'eleven_text_to_sound_v2';
  const probe=config.probeDurationSec??probeDurationDefault;
  const runFfmpeg=config.runFfmpeg??runFfmpegDefault;
  const maxSpeechTempoAdjustmentPct=config.maxSpeechTempoAdjustmentPct??20;

  return {
    id:'elevenlabs-audio-adapter',
    departmentId,
    verified:config.verified,
    supports:['speech','music','sfx'],
    async execute(need:ProductionNeed):Promise<ProductionProviderResult>{
      validateNeed(need);
      if(!config.apiKey?.trim()) throw new Error('elevenlabs_audio_api_key_missing');
      if(config.allowPaidGeneration!==true) throw new Error('elevenlabs_audio_paid_generation_not_authorized');
      const fetchImpl=fetcher(config);
      fs.mkdirSync(config.outputDir,{recursive:true});

      let endpoint:string;
      let body:Record<string,unknown>;
      let modelId:string;
      let voiceProfileId:string|undefined;
      const outputBase=path.resolve(config.outputDir,safeName(need.id));
      const headers={
        'xi-api-key':config.apiKey,
        'Content-Type':'application/json',
      };

      if(need.kind==='speech'){
        const providerVoiceId=voiceIdFor(need,config);
        endpoint=base+'/v1/text-to-speech/'+encodeURIComponent(providerVoiceId)+'?output_format=mp3_44100_128';
        modelId=speechModel;
        voiceProfileId=need.voiceProfileId;
        body={
          text:need.prompt,
          model_id:speechModel,
          ...(need.language?{language_code:need.language}:{}),
        };
      }else if(need.kind==='music'){
        endpoint=base+'/v1/music?output_format=mp3_48000_192';
        modelId=musicModel;
        body={
          prompt:need.prompt,
          model_id:musicModel,
          ...(need.durationSec?{music_length_ms:Math.round(need.durationSec*1000)}:{}),
          force_instrumental:config.musicForceInstrumental??true,
        };
      }else{
        endpoint=base+'/v1/sound-generation?output_format=mp3_44100_128';
        modelId=soundModel;
        body={
          text:need.prompt,
          model_id:soundModel,
          ...(need.durationSec?{duration_seconds:need.durationSec}:{}),
          prompt_influence:config.soundPromptInfluence??.3,
        };
      }

      const response=await fetchImpl(endpoint,{
        method:'POST',
        headers,
        body:JSON.stringify(body),
      });
      if(!response.ok){
        throw new Error('elevenlabs_audio_generation_failed:'+response.status+':'+(await response.text()).slice(0,500));
      }
      const bytes=Buffer.from(await response.arrayBuffer());
      if(!bytes.length) throw new Error('elevenlabs_audio_download_empty');

      let outputPath=outputBase+'.mp3';
      if(need.kind==='speech'&&need.durationSec!==undefined&&need.requires.includes('timing_control')){
        const sourcePath=outputBase+'.source.mp3';
        fs.writeFileSync(sourcePath,bytes);
        const observed=probe(sourcePath);
        fitSpeechTiming({
          sourcePath,
          outputPath,
          observedDuration:observed,
          targetDuration:need.durationSec,
          maxAdjustmentPct:maxSpeechTempoAdjustmentPct,
          runFfmpeg,
        });
      }else{
        fs.writeFileSync(outputPath,bytes);
      }

      const durationSec=probe(outputPath);
      const finalBytes=fs.readFileSync(outputPath);
      const digest=crypto.createHash('sha256').update(finalBytes).digest('hex');

      return {
        artifact:{
          path:outputPath,
          digest,
          kind:'audio',
          mimeType:mimeFor(need.kind),
          durationSec,
        },
        receipt:{
          schema:'evercraft.fallen.production-receipt.v1',
          needId:need.id,
          departmentId,
          continuityDigest:need.continuityDigest,
          artifactDigest:digest,
          commercialRights:config.commercialRights,
          provenance:'complete',
          voiceProfileId,
          durationSec,
          providerModel:'elevenlabs:'+modelId,
          generatedAt:new Date().toISOString(),
        },
        sourceRefs:[
          'provider:elevenlabs',
          'provider-doc:'+DOCS[need.kind],
        ],
      };
    },
  };
}
