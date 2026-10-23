import crypto from 'node:crypto';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

function run(command,args){
  const result=spawnSync(command,args,{encoding:'utf8',maxBuffer:16*1024*1024,timeout:120000});
  if(result.error) throw new Error('voice_signal_tool_error:'+result.error.message);
  if(result.status!==0) throw new Error('voice_signal_tool_failed:'+command+':'+String(result.stderr||'').slice(-300));
  return result;
}
function finite(value){const num=Number(value);return Number.isFinite(num)?num:null;}
function sha(filePath){const hash=crypto.createHash('sha256');hash.update(fs.readFileSync(filePath));return hash.digest('hex');}
/**
 * Read-only objective audio measurements with available FFmpeg and FFprobe.
 * Results are never a human-quality, speech, licensing or release certification.
 */
export function inspectVoiceSignal(filePath,options={}){
  if(typeof filePath!=='string'||!filePath.trim()||!fs.existsSync(filePath)||!fs.statSync(filePath).isFile()) throw new Error('voice_signal_file_missing');
  const ffprobe=options.ffprobe??'ffprobe';
  const ffmpeg=options.ffmpeg??'ffmpeg';
  const metadata=JSON.parse(run(ffprobe,['-v','error','-show_entries','format=duration:stream=codec_type,sample_rate,channels','-of','json',filePath]).stdout);
  const stream=(metadata.streams??[]).find(s=>s.codec_type==='audio');
  if(!stream) throw new Error('voice_signal_audio_stream_missing');
  const durationSec=finite(metadata.format?.duration);
  if(durationSec===null||durationSec<=0) throw new Error('voice_signal_duration_invalid');
  const loud=run(ffmpeg,['-hide_banner','-nostats','-i',filePath,'-vn','-af','loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json','-f','null','-']);
  const block=loud.stderr.match(/\{\s*"input_i"[\s\S]*?\}/);
  if(!block) throw new Error('voice_signal_loudness_unavailable');
  const metrics=JSON.parse(block[0]);
  const peak=run(ffmpeg,['-hide_banner','-nostats','-i',filePath,'-vn','-af','volumedetect','-f','null','-']);
  const peakMatch=peak.stderr.match(/max_volume:\s*(-?(?:\d+\.?\d*|inf))\s*dB/i);
  const measured={
    durationSec,
    sampleRate:finite(stream.sample_rate),
    channels:finite(stream.channels),
    integratedLufs:finite(metrics.input_i),
    truePeakDbTP:finite(metrics.input_tp),
    loudnessRangeLU:finite(metrics.input_lra),
    samplePeakDbFS:peakMatch?finite(peakMatch[1]):null,
  };
  const reasons=[];
  if(measured.integratedLufs===null || measured.integratedLufs < -60) reasons.push('signal_silent_or_extremely_quiet');
  if(measured.truePeakDbTP===null) reasons.push('true_peak_not_measured');
  if(measured.samplePeakDbFS===null) reasons.push('sample_peak_not_measured');
  if(measured.samplePeakDbFS!==null && measured.samplePeakDbFS >= -.1) reasons.push('sample_peak_clipping_risk');
  if(options.master===true && measured.truePeakDbTP!==null && measured.truePeakDbTP > -1.5) reasons.push('master_true_peak_over_minus_1_5_dbtp');
  const report={
    schema:'evercraft.voice-foundry.signal-inspection.v1',
    audioDigest:sha(filePath),
    ...measured,
    status:reasons.length?'held':'objective_measurements_only',
    reasons,
    doesNotVerify:['human_speech','naturalness','accent','consent','pronunciation','subtitle_alignment','publication_rights'],
    publicationAuthorityGranted:false,
  };
  return report;
}
