import crypto from 'node:crypto';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

export interface StudioMasterQcPolicy {
  expectedDurationSec?:number;
  durationToleranceSec?:number;
  minShortEdge?:number;
  minFps?:number;
  maxBlackRatio?:number;
  maxFreezeRatio?:number;
  maxSilenceRatio?:number;
  requireAudio?:boolean;
  allowedVideoCodecs?:string[];
  allowedAudioCodecs?:string[];
}

export interface StudioMasterQcReceipt {
  schema:'evercraft.fallen.master-qc-receipt.v1';
  status:'accepted'|'rejected';
  path:string;
  sha256:string;
  measurements:{
    durationSec:number;
    width:number;
    height:number;
    fps:number;
    videoCodec:string;
    audioCodec?:string;
    hasAudio:boolean;
    blackDurationSec:number;
    freezeDurationSec:number;
    silenceDurationSec:number;
    blackRatio:number;
    freezeRatio:number;
    silenceRatio:number;
    geometry?:{
      encodedAspectRatio:number;
      displayAspectRatio:number;
      sampleAspectRatio?:string;
      expectedAspectRatio?:'9:16'|'16:9'|'1:1';
      aspectErrorPercent?:number;
      expectedFps?:number;
      frameRateErrorFps?:number;
    };
  };
  policy:Required<StudioMasterQcPolicy>;
  reasons:string[];
  evidenceRefs:string[];
  boundaries:{
    technicalQcOnly:true;
    creativeTournamentStillRequired:true;
    truthAndRightsGatesStillRequired:true;
    publicationAuthorityGranted:false;
  };
  assessedAt:string;
}

type Probe={
  streams?:Array<{
    codec_type?:string;
    codec_name?:string;
    width?:number;
    height?:number;
    avg_frame_rate?:string;
    sample_aspect_ratio?:string;
    display_aspect_ratio?:string;
  }>;
  format?:{duration?:string};
};

const DEFAULT_POLICY:Required<StudioMasterQcPolicy>={
  expectedDurationSec:0,
  durationToleranceSec:.15,
  minShortEdge:1080,
  minFps:23.9,
  maxBlackRatio:.08,
  maxFreezeRatio:.35,
  maxSilenceRatio:.85,
  requireAudio:true,
  allowedVideoCodecs:['h264'],
  allowedAudioCodecs:['aac'],
};

function run(binary:string,args:string[]){
  const result=spawnSync(binary,args,{encoding:'utf8',maxBuffer:64*1024*1024});
  if(result.error) throw new Error(binary+'_failed:'+result.error.message);
  if(result.status!==0){
    throw new Error(binary+'_failed:'+String(result.stderr||'').trim().slice(-2000));
  }
  return {stdout:String(result.stdout||''),stderr:String(result.stderr||'')};
}

function hashFile(filePath:string){
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function parseRate(value?:string){
  if(!value) return 0;
  const [a,b]=value.split('/').map(Number);
  if(!Number.isFinite(a)||!Number.isFinite(b)||b===0) return 0;
  return a/b;
}

function parseAspectFraction(value?:string){
  const match=/^(\d+):(\d+)$/.exec(value??'');
  if(!match) return undefined;
  const numerator=Number(match[1]);
  const denominator=Number(match[2]);
  if(!Number.isFinite(numerator)||!Number.isFinite(denominator)||numerator<=0||denominator<=0){
    return undefined;
  }
  return numerator/denominator;
}

function expectedAspectFraction(value?:'9:16'|'16:9'|'1:1'){
  if(value==='9:16') return 9/16;
  if(value==='16:9') return 16/9;
  if(value==='1:1') return 1;
  return undefined;
}

function sumMatches(text:string,pattern:RegExp){
  let total=0;
  for(const match of text.matchAll(pattern)){
    const value=Number(match[1]);
    if(Number.isFinite(value)&&value>0) total+=value;
  }
  return total;
}

function silenceDuration(text:string,totalDuration:number){
  const starts=[...text.matchAll(/silence_start:\s*([0-9.]+)/g)].map(m=>Number(m[1]));
  const ends=[...text.matchAll(/silence_end:\s*([0-9.]+)/g)].map(m=>Number(m[1]));
  let total=0;
  for(let i=0;i<starts.length;i+=1){
    const start=starts[i];
    const end=Number.isFinite(ends[i])?ends[i]:totalDuration;
    if(Number.isFinite(start)&&Number.isFinite(end)&&end>start) total+=end-start;
  }
  return Math.max(0,Math.min(totalDuration,total));
}

function ratio(part:number,total:number){
  if(!Number.isFinite(total)||total<=0) return 0;
  return Number(Math.max(0,Math.min(1,part/total)).toFixed(4));
}

export function assessStudioMaster(input:{
  filePath:string;
  expectedSha256?:string;
  policy?:StudioMasterQcPolicy;
  expectedAspectRatio?:'9:16'|'16:9'|'1:1';
  expectedFps?:number;
}):StudioMasterQcReceipt{
  if(!fs.existsSync(input.filePath)) throw new Error('master_qc_file_missing');
  const sha256=hashFile(input.filePath);
  if(input.expectedSha256&&sha256.toLowerCase()!==input.expectedSha256.toLowerCase()){
    throw new Error('master_qc_digest_mismatch');
  }

  const policy:Required<StudioMasterQcPolicy>={
    ...DEFAULT_POLICY,
    ...(input.policy??{}),
    allowedVideoCodecs:[...(input.policy?.allowedVideoCodecs??DEFAULT_POLICY.allowedVideoCodecs)],
    allowedAudioCodecs:[...(input.policy?.allowedAudioCodecs??DEFAULT_POLICY.allowedAudioCodecs)],
  };

  const probe=JSON.parse(run('ffprobe',[
    '-v','error',
    '-show_streams',
    '-show_format',
    '-of','json',
    input.filePath,
  ]).stdout) as Probe;

  const video=probe.streams?.find(stream=>stream.codec_type==='video');
  const audio=probe.streams?.find(stream=>stream.codec_type==='audio');
  const durationSec=Number(probe.format?.duration??0);
  const width=Number(video?.width??0);
  const height=Number(video?.height??0);
  const fps=parseRate(video?.avg_frame_rate);
  const videoCodec=String(video?.codec_name??'');
  const audioCodec=audio?.codec_name?String(audio.codec_name):undefined;
  const encodedAspectRatio=width>0&&height>0?width/height:0;
  const sampleAspectRatio=parseAspectFraction(video?.sample_aspect_ratio);
  const displayAspectRatio=encodedAspectRatio*(sampleAspectRatio??1);
  const expectedAspect=expectedAspectFraction(input.expectedAspectRatio);
  const aspectErrorPercent=expectedAspect&&displayAspectRatio>0
    ?Number((Math.abs(displayAspectRatio-expectedAspect)/expectedAspect*100).toFixed(3))
    :undefined;
  const frameRateErrorFps=Number.isFinite(input.expectedFps)&&Number(input.expectedFps)>0
    ?Number(Math.abs(fps-Number(input.expectedFps)).toFixed(3))
    :undefined;

  const blackLog=video?run('ffmpeg',[
    '-v','info',
    '-i',input.filePath,
    '-vf','blackdetect=d=0.4:pic_th=0.98:pix_th=0.10',
    '-an',
    '-f','null','-',
  ]).stderr:'';
  const freezeLog=video?run('ffmpeg',[
    '-v','info',
    '-i',input.filePath,
    '-vf','freezedetect=n=0.003:d=0.75',
    '-an',
    '-f','null','-',
  ]).stderr:'';
  const silenceLog=audio?run('ffmpeg',[
    '-v','info',
    '-i',input.filePath,
    '-af','silencedetect=n=-50dB:d=0.5',
    '-vn',
    '-f','null','-',
  ]).stderr:'';

  const blackDurationSec=sumMatches(blackLog,/black_duration:([0-9.]+)/g);
  const freezeDurationSec=sumMatches(freezeLog,/freeze_duration:\s*([0-9.]+)/g);
  const silenceDurationSec=audio?silenceDuration(silenceLog,durationSec):durationSec;

  const measurements={
    durationSec,
    width,
    height,
    fps,
    videoCodec,
    audioCodec,
    hasAudio:Boolean(audio),
    blackDurationSec:Number(blackDurationSec.toFixed(3)),
    freezeDurationSec:Number(freezeDurationSec.toFixed(3)),
    silenceDurationSec:Number(silenceDurationSec.toFixed(3)),
    blackRatio:ratio(blackDurationSec,durationSec),
    freezeRatio:ratio(freezeDurationSec,durationSec),
    silenceRatio:ratio(silenceDurationSec,durationSec),
    geometry:{
      encodedAspectRatio:Number(encodedAspectRatio.toFixed(6)),
      displayAspectRatio:Number(displayAspectRatio.toFixed(6)),
      sampleAspectRatio:video?.sample_aspect_ratio,
      expectedAspectRatio:input.expectedAspectRatio,
      aspectErrorPercent,
      expectedFps:input.expectedFps,
      frameRateErrorFps,
    },
  };

  const reasons:string[]=[];
  if(!video) reasons.push('video_stream_missing');
  if(policy.requireAudio&&!audio) reasons.push('audio_stream_missing');
  if(video&&!policy.allowedVideoCodecs.includes(videoCodec)){
    reasons.push('video_codec_invalid:'+videoCodec);
  }
  if(audio&&policy.allowedAudioCodecs.length&&!policy.allowedAudioCodecs.includes(audioCodec??'')){
    reasons.push('audio_codec_invalid:'+(audioCodec??'missing'));
  }
  if(Math.min(width,height)<policy.minShortEdge) reasons.push('short_edge_below_min');
  if(fps<policy.minFps) reasons.push('fps_below_min');
  // Modern owned social and film exports require square pixels. A non-square SAR
  // changes displayed geometry even when encoded width/height appear correct.
  if(video&&sampleAspectRatio!==undefined&&Math.abs(sampleAspectRatio-1)>.001){
    reasons.push('non_square_pixel_aspect_ratio');
  }
  if(input.expectedAspectRatio&&aspectErrorPercent===undefined){
    reasons.push('expected_aspect_ratio_unverifiable');
  }else if(aspectErrorPercent!==undefined&&aspectErrorPercent>1.2){
    reasons.push('output_aspect_ratio_mismatch');
  }
  if(input.expectedFps!==undefined&&(!Number.isFinite(input.expectedFps)||input.expectedFps<=0)){
    reasons.push('expected_fps_invalid');
  }else if(frameRateErrorFps!==undefined&&frameRateErrorFps>.15){
    reasons.push('output_fps_mismatch');
  }
  if(policy.expectedDurationSec>0&&Math.abs(durationSec-policy.expectedDurationSec)>policy.durationToleranceSec){
    reasons.push('duration_out_of_tolerance');
  }
  if(measurements.blackRatio>policy.maxBlackRatio) reasons.push('black_ratio_excessive');
  if(measurements.freezeRatio>policy.maxFreezeRatio) reasons.push('freeze_ratio_excessive');
  if(audio&&measurements.silenceRatio>policy.maxSilenceRatio) reasons.push('silence_ratio_excessive');

  return {
    schema:'evercraft.fallen.master-qc-receipt.v1',
    status:reasons.length?'rejected':'accepted',
    path:input.filePath,
    sha256,
    measurements,
    policy,
    reasons,
    evidenceRefs:[
      'sha256:'+sha256,
      'ffprobe:streams+format',
      'ffmpeg:blackdetect',
      'ffmpeg:freezedetect',
      ...(audio?['ffmpeg:silencedetect']:[]),
    ],
    boundaries:{
      technicalQcOnly:true,
      creativeTournamentStillRequired:true,
      truthAndRightsGatesStillRequired:true,
      publicationAuthorityGranted:false,
    },
    assessedAt:new Date().toISOString(),
  };
}
