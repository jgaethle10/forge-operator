import type { TimelineAudioMasterSettings, TimelineTrackKind } from './timeline.js';

export interface NormalizedAudioMasterPolicy {
  targetLufs:number;
  truePeakDb:number;
  lra:number;
  dialogueDucking:boolean;
  duckThreshold:number;
  duckRatio:number;
  attackMs:number;
  releaseMs:number;
  sampleRate:number;
}

export interface AudioMasterClipRef {
  label:string;
  trackKind:Extract<TimelineTrackKind,'voice'|'music'|'sfx'>;
}

export interface AudioMasterGraph {
  filters:string[];
  outputLabel?:string;
  policy:NormalizedAudioMasterPolicy;
  buses:{
    voice?:string;
    music?:string;
    sfx?:string;
    duckedMusic?:string;
  };
}

function finite(value:number|undefined,fallback:number){
  return Number.isFinite(value)?Number(value):fallback;
}

export function normalizeAudioMasterPolicy(
  settings:TimelineAudioMasterSettings|undefined,
):NormalizedAudioMasterPolicy{
  const targetLufs=Math.max(-24,Math.min(-8,finite(settings?.targetLufs,-14)));
  const truePeakDb=Math.max(-6,Math.min(-.1,finite(settings?.truePeakDb,-1)));
  const lra=Math.max(1,Math.min(20,finite(settings?.lra,11)));
  const duckThreshold=Math.max(.001,Math.min(1,finite(settings?.duckThreshold,.05)));
  const duckRatio=Math.max(1,Math.min(20,finite(settings?.duckRatio,8)));
  const attackMs=Math.max(1,Math.min(2000,finite(settings?.attackMs,20)));
  const releaseMs=Math.max(10,Math.min(5000,finite(settings?.releaseMs,350)));
  const sampleRate=Math.max(22050,Math.min(96000,Math.round(finite(settings?.sampleRate,48000))));
  return {
    targetLufs,
    truePeakDb,
    lra,
    dialogueDucking:settings?.dialogueDucking!==false,
    duckThreshold,
    duckRatio,
    attackMs,
    releaseMs,
    sampleRate,
  };
}

function bus(
  kind:'voice'|'music'|'sfx',
  labels:string[],
  filters:string[],
  sampleRate:number,
  durationSec:number,
){
  if(!labels.length) return undefined;
  const output=kind+'bus';
  if(labels.length===1){
    filters.push(`[${labels[0]}]aresample=${sampleRate},apad,atrim=duration=${durationSec}[${output}];`);
    return output;
  }
  filters.push(
    labels.map(label=>`[${label}]`).join('')+
    `amix=inputs=${labels.length}:duration=longest:dropout_transition=0:normalize=0,aresample=${sampleRate},apad,atrim=duration=${durationSec}[${output}];`
  );
  return output;
}

function peakLinear(db:number){
  return Math.pow(10,db/20);
}

export function buildAudioMasterGraph(input:{
  clips:AudioMasterClipRef[];
  durationSec:number;
  settings?:TimelineAudioMasterSettings;
}):AudioMasterGraph{
  if(!Number.isFinite(input.durationSec)||input.durationSec<=0){
    throw new Error('audio_master_duration_invalid');
  }

  const policy=normalizeAudioMasterPolicy(input.settings);
  const filters:string[]=[];
  const voiceLabels=input.clips.filter(item=>item.trackKind==='voice').map(item=>item.label);
  const musicLabels=input.clips.filter(item=>item.trackKind==='music').map(item=>item.label);
  const sfxLabels=input.clips.filter(item=>item.trackKind==='sfx').map(item=>item.label);

  let voice=bus('voice',voiceLabels,filters,policy.sampleRate,input.durationSec);
  let music=bus('music',musicLabels,filters,policy.sampleRate,input.durationSec);
  const sfx=bus('sfx',sfxLabels,filters,policy.sampleRate,input.durationSec);
  let duckedMusic:string|undefined;

  if(voice&&music&&policy.dialogueDucking){
    filters.push(`[${voice}]asplit=2[voiceprogram][voicekey];`);
    filters.push(
      `[${music}][voicekey]sidechaincompress=`+
      `threshold=${policy.duckThreshold}:ratio=${policy.duckRatio}:`+
      `attack=${policy.attackMs}:release=${policy.releaseMs}[musicducked];`
    );
    voice='voiceprogram';
    music='musicducked';
    duckedMusic=music;
  }

  const program=[voice,music,sfx].filter(Boolean) as string[];
  if(!program.length){
    return {
      filters,
      outputLabel:undefined,
      policy,
      buses:{voice,music,sfx,duckedMusic},
    };
  }

  const pre='masterpre';
  if(program.length===1){
    filters.push(`[${program[0]}]anull[${pre}];`);
  }else{
    filters.push(
      program.map(label=>`[${label}]`).join('')+
      `amix=inputs=${program.length}:duration=longest:dropout_transition=0:normalize=0[${pre}];`
    );
  }

  const limiter=Math.min(.999,peakLinear(policy.truePeakDb));
  filters.push(
    `[${pre}]loudnorm=I=${policy.targetLufs}:TP=${policy.truePeakDb}:LRA=${policy.lra}:linear=true,`+
    `alimiter=limit=${limiter.toFixed(6)},apad,atrim=duration=${input.durationSec}[aout];`
  );

  return {
    filters,
    outputLabel:'aout',
    policy,
    buses:{voice,music,sfx,duckedMusic},
  };
}
