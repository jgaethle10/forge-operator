import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type {
  FallenTimelineProject,
  TimelineAsset,
  TimelineClip,
  TimelineTrack,
} from './timeline.js';

const DIMENSIONS = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '1:1': { width: 1080, height: 1080 },
} as const;

export interface TimelineExportPlan {
  schema:'evercraft.fallen.timeline-export-plan.v1';
  projectId:string;
  projectVersion:number;
  width:number;
  height:number;
  fps:number;
  durationSec:number;
  outputPath:string;
  ffmpegArgs:string[];
  inputAssetIds:string[];
  visualClipIds:string[];
  audioClipIds:string[];
  captionClipIds:string[];
  boundaries:{
    localReadyAssetsOnly:true;
    pendingGenerationAssetsRejected:true;
    deterministicTrackOrdering:true;
    captionsBurnedIntoPicture:true;
    mixedAudioNormalized:true;
    publicationAuthorityGranted:false;
  };
}

export interface TimelineExportReceipt {
  schema:'evercraft.fallen.timeline-export-receipt.v1';
  projectId:string;
  projectVersion:number;
  outputPath:string;
  sha256:string;
  sizeBytes:number;
  width:number;
  height:number;
  fps:number;
  durationSec:number;
  videoCodec?:string;
  audioCodec?:string;
  inputAssetIds:string[];
  renderedAt:string;
  publicationAuthorityGranted:false;
}

type InputBinding = {
  asset:TimelineAsset;
  clip:TimelineClip;
  track:TimelineTrack;
  inputIndex:number;
};

function assetMap(project:FallenTimelineProject){
  return new Map(project.assets.map(asset=>[asset.id,asset] as const));
}

function sortedClips(track:TimelineTrack){
  return [...track.clips].sort((a,b)=>a.startSec-b.startSec||a.id.localeCompare(b.id));
}

function timelineDuration(project:FallenTimelineProject){
  const ends=project.tracks.flatMap(track=>track.clips.map(clip=>clip.startSec+clip.durationSec));
  if(!ends.length) throw new Error('timeline_export_empty_timeline');
  return Math.max(...ends);
}

function shellSafeSubtitlePath(filePath:string){
  return path.resolve(filePath)
    .replace(/\\/g,'/')
    .replace(/:/g,'\\:')
    .replace(/'/g,"\\'")
    .replace(/,/g,'\\,')
    .replace(/\[/g,'\\[')
    .replace(/\]/g,'\\]');
}

function assertReadyAsset(asset:TimelineAsset,clip:TimelineClip){
  if(!asset.path?.trim()) throw new Error(`timeline_export_asset_path_missing:${asset.id}`);
  if(asset.path.startsWith('pending://')) throw new Error(`timeline_export_pending_asset:${asset.id}`);
  if(asset.kind==='captions' && clip.startSec!==0){
    throw new Error(`timeline_export_caption_must_start_zero:${clip.id}`);
  }
}

function sourceArgs(binding:InputBinding){
  const args:string[]=[];
  if(binding.asset.kind==='image'){
    args.push('-loop','1','-t',String(binding.clip.durationSec),'-i',binding.asset.path);
    return args;
  }
  if(binding.clip.trimStartSec&&binding.clip.trimStartSec>0){
    args.push('-ss',String(binding.clip.trimStartSec));
  }
  args.push('-t',String(binding.clip.durationSec),'-i',binding.asset.path);
  return args;
}

function visualFilter(binding:InputBinding,width:number,height:number,label:string){
  const clip=binding.clip;
  const shift=clip.startSec;
  if(binding.track.kind==='overlay'){
    const scale=Number.isFinite(clip.scale)&&Number(clip.scale)>0?Number(clip.scale):1;
    const x=Number.isFinite(clip.x)?Number(clip.x):0;
    const y=Number.isFinite(clip.y)?Number(clip.y):0;
    const opacity=Math.max(0,Math.min(1,clip.opacity??1));
    return `[${binding.inputIndex}:v]scale=iw*${scale}:ih*${scale},format=rgba,colorchannelmixer=aa=${opacity},setpts=PTS-STARTPTS+${shift}/TB[${label}];`;
  }
  return `[${binding.inputIndex}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,setpts=PTS-STARTPTS+${shift}/TB[${label}];`;
}

function audioFilter(binding:InputBinding,label:string){
  const volume=Math.max(0,binding.clip.volume??1);
  return `[${binding.inputIndex}:a]atrim=duration=${binding.clip.durationSec},asetpts=PTS-STARTPTS+${binding.clip.startSec}/TB,volume=${volume}[${label}];`;
}

function run(binary:string,args:string[]){
  const result=spawnSync(binary,args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  if(result.error) throw new Error(`${binary}_failed:${result.error.message}`);
  if(result.status!==0) throw new Error(`${binary}_failed:${result.stderr||'unknown_error'}`);
  return result.stdout;
}

function hashFile(filePath:string){
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function buildTimelineExportPlan(input:{
  project:FallenTimelineProject;
  outputPath:string;
}):TimelineExportPlan{
  const project=input.project;
  if(project.schema!=='evercraft.fallen.timeline.v1') throw new Error('timeline_export_schema_invalid');
  if(!input.outputPath?.trim()) throw new Error('timeline_export_output_missing');

  const {width,height}=DIMENSIONS[project.aspectRatio];
  const durationSec=timelineDuration(project);
  const assets=assetMap(project);
  const visualBindings:InputBinding[]=[];
  const audioBindings:InputBinding[]=[];
  const captionBindings:InputBinding[]=[];
  const args:string[]=['-y','-f','lavfi','-i',`color=c=black:s=${width}x${height}:r=${project.fps}:d=${durationSec}`];
  let inputIndex=1;

  for(const track of project.tracks){
    for(const clip of sortedClips(track)){
      const asset=assets.get(clip.assetId);
      if(!asset) throw new Error(`timeline_export_asset_missing:${clip.assetId}`);
      assertReadyAsset(asset,clip);
      if(track.kind==='captions'){
        if(asset.kind!=='captions') throw new Error(`timeline_export_caption_asset_kind_invalid:${asset.id}`);
        captionBindings.push({asset,clip,track,inputIndex:-1});
        continue;
      }
      const visualTrack=track.kind==='video'||track.kind==='overlay';
      const audioTrack=track.kind==='voice'||track.kind==='music'||track.kind==='sfx';
      if(visualTrack){
        if(asset.kind!=='image'&&asset.kind!=='video') throw new Error(`timeline_export_visual_asset_kind_invalid:${asset.id}`);
        const binding={asset,clip,track,inputIndex};
        visualBindings.push(binding);
        args.push(...sourceArgs(binding));
        inputIndex+=1;
        continue;
      }
      if(audioTrack){
        if(asset.kind!=='audio'&&asset.kind!=='video') throw new Error(`timeline_export_audio_asset_kind_invalid:${asset.id}`);
        const binding={asset,clip,track,inputIndex};
        audioBindings.push(binding);
        args.push(...sourceArgs(binding));
        inputIndex+=1;
      }
    }
  }

  const filters:string[]=['[0:v]format=yuv420p[base0];'];
  let currentVideo='base0';
  visualBindings.forEach((binding,index)=>{
    const label=`vclip${index}`;
    filters.push(visualFilter(binding,width,height,label));
    const out=`vout${index}`;
    const x=binding.track.kind==='overlay'?(binding.clip.x??0):0;
    const y=binding.track.kind==='overlay'?(binding.clip.y??0):0;
    const start=binding.clip.startSec;
    const end=binding.clip.startSec+binding.clip.durationSec;
    filters.push(`[${currentVideo}][${label}]overlay=x=${x}:y=${y}:enable='between(t,${start},${end})'[${out}];`);
    currentVideo=out;
  });

  captionBindings.forEach((binding,index)=>{
    const out=`captioned${index}`;
    const sub=shellSafeSubtitlePath(binding.asset.path);
    filters.push(`[${currentVideo}]subtitles=filename='${sub}'[${out}];`);
    currentVideo=out;
  });

  let audioOut:string|undefined;
  audioBindings.forEach((binding,index)=>{
    filters.push(audioFilter(binding,`aclip${index}`));
  });
  if(audioBindings.length===1){
    filters.push(`[aclip0]apad,atrim=duration=${durationSec}[aout];`);
    audioOut='aout';
  }else if(audioBindings.length>1){
    const labels=audioBindings.map((_,index)=>`[aclip${index}]`).join('');
    filters.push(`${labels}amix=inputs=${audioBindings.length}:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0.95,apad,atrim=duration=${durationSec}[aout];`);
    audioOut='aout';
  }

  const filterComplex=filters.join('').replace(/;$/,'');
  args.push('-filter_complex',filterComplex,'-map',`[${currentVideo}]`);
  if(audioOut) args.push('-map',`[${audioOut}]`);
  args.push(
    '-r',String(project.fps),
    '-c:v','libx264',
    '-preset','medium',
    '-crf','18',
    '-pix_fmt','yuv420p',
  );
  if(audioOut){
    args.push('-c:a','aac','-b:a','192k','-ar','48000');
  }else{
    args.push('-an');
  }
  args.push('-t',String(durationSec),'-movflags','+faststart',path.resolve(input.outputPath));

  return {
    schema:'evercraft.fallen.timeline-export-plan.v1',
    projectId:project.id,
    projectVersion:project.version,
    width,height,fps:project.fps,durationSec,
    outputPath:path.resolve(input.outputPath),
    ffmpegArgs:args,
    inputAssetIds:[...new Set([...visualBindings,...audioBindings,...captionBindings].map(item=>item.asset.id))],
    visualClipIds:visualBindings.map(item=>item.clip.id),
    audioClipIds:audioBindings.map(item=>item.clip.id),
    captionClipIds:captionBindings.map(item=>item.clip.id),
    boundaries:{
      localReadyAssetsOnly:true,
      pendingGenerationAssetsRejected:true,
      deterministicTrackOrdering:true,
      captionsBurnedIntoPicture:true,
      mixedAudioNormalized:true,
      publicationAuthorityGranted:false,
    },
  };
}

export function renderTimelineExport(input:{
  project:FallenTimelineProject;
  outputPath:string;
}):TimelineExportReceipt{
  const plan=buildTimelineExportPlan(input);
  const assets=assetMap(input.project);
  for(const assetId of plan.inputAssetIds){
    const asset=assets.get(assetId);
    if(!asset) throw new Error(`timeline_export_asset_missing:${assetId}`);
    if(!fs.existsSync(asset.path)) throw new Error(`timeline_export_asset_not_found:${asset.id}`);
  }
  fs.mkdirSync(path.dirname(plan.outputPath),{recursive:true});
  run('ffmpeg',plan.ffmpegArgs);

  const probe=JSON.parse(run('ffprobe',[
    '-v','error',
    '-show_entries','stream=index,codec_type,codec_name,width,height,r_frame_rate',
    '-show_entries','format=duration,size',
    '-of','json',
    plan.outputPath,
  ])) as {
    streams?:Array<{codec_type?:string;codec_name?:string;width?:number;height?:number;r_frame_rate?:string}>;
    format?:{duration?:string;size?:string};
  };
  const video=probe.streams?.find(stream=>stream.codec_type==='video');
  const audio=probe.streams?.find(stream=>stream.codec_type==='audio');
  const duration=Number(probe.format?.duration??plan.durationSec);
  const size=Number(probe.format?.size??fs.statSync(plan.outputPath).size);

  return {
    schema:'evercraft.fallen.timeline-export-receipt.v1',
    projectId:plan.projectId,
    projectVersion:plan.projectVersion,
    outputPath:plan.outputPath,
    sha256:hashFile(plan.outputPath),
    sizeBytes:size,
    width:video?.width??plan.width,
    height:video?.height??plan.height,
    fps:plan.fps,
    durationSec:duration,
    videoCodec:video?.codec_name,
    audioCodec:audio?.codec_name,
    inputAssetIds:plan.inputAssetIds,
    renderedAt:new Date().toISOString(),
    publicationAuthorityGranted:false,
  };
}
