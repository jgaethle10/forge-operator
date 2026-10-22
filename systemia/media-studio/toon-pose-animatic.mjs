import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {verifyToonPerformanceBundle} from './toon-performance-intake.mjs';

const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function guard(ok,code){if(!ok)throw new Error('toon_animatic_'+code)}
function exec(binary,args,encoding='utf8',timeout=180000){
  const r=spawnSync(binary,args,{encoding,timeout,maxBuffer:5*1024*1024,
    stdio:['ignore','pipe','pipe']});
  if(r.error)throw new Error('toon_animatic_'+binary+'_error:'+r.error.message);
  if(r.status!==0)throw new Error('toon_animatic_'+binary+'_failed:'+String(r.stderr).slice(-800));
  return r.stdout;
}
function fileHash(file){return sha(fs.readFileSync(file))}
function segmentDurations(frames,duration){
  return frames.map((frame,i)=>(frames[i+1]?.atSec??duration)-frame.atSec);
}
/**
 * Generates a playable, locally encoded multipose STORYBOARD ANIMATIC.
 * It shows camera framing and pose changes from real supplied art and voice.
 * It does NOT animate a character rig, lip sync, or judge aesthetic appeal.
 *
 * Never calls paid models, never creates an authorized Clip delivery.
 */
export function renderToonPoseAnimatic({
  packet,shotId,bundleDir,manifest,outDir,width=960,height=540,fps=24,
}={}){
  guard(Number.isInteger(width)&&width>=640&&width<=1920&&width%2===0,
    'width_invalid');
  guard(Number.isInteger(height)&&height>=360&&height<=1080&&height%2===0,
    'height_invalid');
  guard(Number.isInteger(fps)&&fps>=24&&fps<=30,'fps_invalid');
  guard(typeof outDir==='string'&&outDir.trim().length>0,'output_missing');
  const verified=verifyToonPerformanceBundle({packet,shotId,bundleDir,manifest});
  const frames=verified.sceneFrames;
  guard(Array.isArray(frames)&&frames.length>=2,'approved_multi_pose_sequence_required');
  guard(verified.dialogue?.audioDecoded===true,'real_recorded_dialogue_required');
  const shot=packet.shots.find(s=>s.id===shotId);
  guard(shot&&Number.isFinite(shot.durationSec)&&shot.durationSec>1&&shot.durationSec<=10,
    'shot_duration_invalid');
  const durations=segmentDurations(frames,shot.durationSec);
  guard(durations.every(s=>s>=.45),'pose_segment_too_short');
  guard(durations.reduce((a,b)=>a+b,0)>0,'empty_segment');
  const root=fs.realpathSync(bundleDir);
  const output=path.resolve(outDir);
  guard(output!==root&&!output.startsWith(root+path.sep),'output_inside_source_bundle');
  fs.mkdirSync(output,{recursive:true});
  const movie=path.join(output,'animatic-review.mp4');
  const args=['-hide_banner','-loglevel','error','-y'];
  for(const [i,frame] of frames.entries()){
    args.push('-loop','1','-framerate',String(fps),
      '-t',String(durations[i]),'-i',path.join(root,frame.file));
  }
  args.push('-i',path.join(root,manifest.dialogueAudio.file));
  const filters=[];
  for(let i=0;i<frames.length;i++){
    // One authored drawing per actual acting beat. The camera gradually pushes
    // in, but the drawing itself is never misrepresented as character animation.
    // Slight alternation prevents identical compositional crops at every cut.
    const dx=i%2===0?'iw/2-(iw/zoom/2)':'(iw-iw/zoom)*0.35';
    const dy=i%2===0?'ih/2-(ih/zoom/2)':'(ih-ih/zoom)*0.55';
    filters.push('['+i+':v]scale='+Math.ceil(width*1.1)+':'+Math.ceil(height*1.1)+
      ':force_original_aspect_ratio=increase,crop='+Math.ceil(width*1.1)+
      ':'+Math.ceil(height*1.1)+',zoompan=z=\\'min(zoom+0.001,1.12)\\':x=\\''+
      dx+'\\':y=\\''+dy+'\\':d=1:s='+width+'x'+height+':fps='+fps+
      ',setsar=1,trim=duration='+durations[i]+',setpts=PTS-STARTPTS[v'+i+']');
  }
  filters.push(frames.map((_,i)=>'[v'+i+']').join('')+
    'concat=n='+frames.length+':v=1:a=0,fps='+fps+',format=yuv420p[video]');
  const audioIndex=frames.length;
  filters.push('['+audioIndex+':a]aresample=48000,asetpts=PTS-STARTPTS,'+
    'adelay=220,apad,atrim=duration='+shot.durationSec+
    ',afade=t=in:st=0:d=0.04,afade=t=out:st='+
    Math.max(0,shot.durationSec-.25)+':d=0.25[audio]');
  args.push('-filter_complex',filters.join(';'),'-map','[video]','-map','[audio]',
    '-c:v','libx264','-preset','fast','-crf','20',
    '-c:a','aac','-b:a','160k','-ar','48000','-pix_fmt','yuv420p',
    '-frames:v',String(Math.round(shot.durationSec*fps)),
    '-movflags','+faststart',movie);
  exec('ffmpeg',args);
  const probe=JSON.parse(exec('ffprobe',['-v','error','-count_frames',
    '-show_streams','-show_format','-of','json',movie]));
  const video=probe.streams?.find(s=>s.codec_type==='video');
  const audio=probe.streams?.find(s=>s.codec_type==='audio');
  guard(video?.codec_name==='h264'&&video.width===width&&video.height===height,
    'video_decode_invalid');
  guard(audio?.codec_name==='aac','voice_audio_missing');
  const renderedDuration=Number(probe.format?.duration);
  guard(Number.isFinite(renderedDuration)&&
    Math.abs(renderedDuration-shot.durationSec)<.18,'duration_mismatch');
  const count=Number(video.nb_read_frames||video.nb_frames);
  guard(count===Math.round(shot.durationSec*fps),'frame_count_mismatch');
  const sampled=[];
  for(const [i,frame] of frames.entries()){
    const sec=frame.atSec+durations[i]*.5;
    const pixels=exec('ffmpeg',['-hide_banner','-loglevel','error',
      '-ss',String(sec),'-i',movie,'-frames:v','1',
      '-vf','scale=64:36,format=gray','-f','rawvideo','pipe:1'],null);
    guard(Buffer.isBuffer(pixels)&&pixels.length===64*36,'sample_decode_failed');
    sampled.push({poseId:frame.id,timeSec:Number(sec.toFixed(3)),
      imageSha256:frame.sha256,framePixelSha256:sha(pixels),
      performanceBeat:frame.performanceBeat});
  }
  guard(new Set(sampled.map(s=>s.framePixelSha256)).size===sampled.length,
    'pose_cuts_visually_unchanged');
  const core={
    schema:'evercraft.fallen.toon-animatic-render-receipt.v1',
    state:'rendered_storyboard_animatic_not_character_animation',
    shotId,packetDigest:verified.packetDigest,actorId:verified.actorId,
    videoPath:movie,sha256:fileHash(movie),
    dialogueAudioSha256:verified.dialogue.sha256,
    frameCount:count,width,height,fps,durationSec:renderedDuration,
    actualAssetBytesVerified:true,distinctPoseFramesVerified:true,
    sampledPoseFrames:sampled,
    audienceApproved:false,voiceQualityApproved:false,identityLikenessApproved:false,
    characterRigAnimated:false,lipSyncVerified:false,musicMastered:false,
    providerGenerated:false,commercialRightsIndependentlyVerified:false,
    masterReady:false,publicationAuthority:false,
    warnings:[
      'This output is an edited, camera-moved storyboard animatic, NOT character animation.',
      'Artwork/voice rights and human creative approval are declarations, not independently verified.',
      'Voice is the supplied recording, not newly generated or altered to invent an approved delivery.',
    ],
  };
  fs.writeFileSync(path.join(output,'animatic-receipt.json'),
    JSON.stringify({...core,receiptDigest:sha(Buffer.from(JSON.stringify(core)))},null,2)+'\n');
  return core;
}
