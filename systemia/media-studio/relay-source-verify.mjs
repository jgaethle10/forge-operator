import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

// Technical verification only. Camera pans over stills may show pixel change.
// Human-reviewed source identity, action authenticity, rights and talent consent
// remain independent release blockers.
function run(tool,args,id){
  const r=spawnSync(tool,args,{encoding:null,timeout:20000,maxBuffer:1024*1024});
  if(r.error||r.status!==0) throw new Error('relay_floor_media_probe_failed:'+id+':'+tool);
  return r.stdout;
}
export function verifyRelayFloorSource(asset,{requiredDurationSec=0,requiresAudio=false}={}){
  const id=asset?.id||'unknown';
  if(!asset?.path||!fs.existsSync(asset.path)||!fs.statSync(asset.path).isFile())
    throw new Error('relay_floor_media_source_missing:'+id);
  const raw=run('ffprobe',['-v','error','-show_streams','-show_format','-of','json',asset.path],id);
  let probe;
  try{probe=JSON.parse(raw.toString('utf8'));}catch{throw new Error('relay_floor_media_probe_json_invalid:'+id)}
  const v=(probe.streams||[]).find(s=>s.codec_type==='video');
  if(!v||!Number.isInteger(v.width)||!Number.isInteger(v.height))
    throw new Error('relay_floor_actual_video_required:'+id);
  const hasAudio=(probe.streams||[]).some(s=>s.codec_type==='audio');
  if(requiresAudio&&!hasAudio) throw new Error('relay_floor_live_dialogue_audio_stream_missing:'+id);
  const duration=Number(v.duration||probe.format?.duration);
  if(!Number.isFinite(duration)||duration<requiredDurationSec-0.05)
    throw new Error('relay_floor_source_shorter_than_shot:'+id);
  if(v.width<640||v.height<360) throw new Error('relay_floor_video_resolution_low:'+id);
  const [n,d]=String(v.avg_frame_rate||'0/1').split('/').map(Number);
  const fps=n/d;
  if(!Number.isFinite(fps)||fps<20) throw new Error('relay_floor_video_fps_low:'+id);
  const framesRaw=run('ffmpeg',['-nostdin','-v','error','-i',asset.path,'-t',String(Math.min(4,duration)),
    '-vf','fps=2,scale=32:32:flags=fast_bilinear,format=gray','-an','-f','rawvideo','pipe:1'],id);
  const frameSize=1024,frames=Math.floor(framesRaw.length/frameSize);
  if(frames<2) throw new Error('relay_floor_insufficient_decoded_frames:'+id);
  let maxChangedPixelRatio=0;
  for(let f=1;f<frames;f++){
    let changed=0;
    for(let p=0;p<frameSize;p++)
      if(Math.abs(framesRaw[(f-1)*frameSize+p]-framesRaw[f*frameSize+p])>10) changed++;
    maxChangedPixelRatio=Math.max(maxChangedPixelRatio,changed/frameSize);
  }
  if(maxChangedPixelRatio<0.015) throw new Error('relay_floor_nearly_static_video:'+id);
  return {assetId:id,actualVideo:true,width:v.width,height:v.height,
    durationSec:Number(duration.toFixed(3)),fps:Number(fps.toFixed(2)),inspectedDecodedFrames:frames,
    maxChangedPixelRatio:Number(maxChangedPixelRatio.toFixed(4)),hasEmbeddedAudio:hasAudio,
    humanSubjectAndActionReviewRequired:true,authenticityNotEstablished:true};
}
