import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Fallen commercial audio finishing. Technical QC is not creative approval.
export const STANDARD = Object.freeze({
  targetLufs: -16,
  toleranceLu: 1.5,
  maxTruePeakDbtp: -1,
  masteringPeakDbtp: -1.5,
  targetLra: 9,
  maxSilentRunSec: 1.25,
  maxSilenceRatio: 0.4,
});

function run(binary, args) {
  const r = spawnSync(binary, args, {encoding:'utf8',maxBuffer:32*1024*1024});
  if (r.error || r.status !== 0) {
    throw new Error(binary+'_failed:'+String(r.error?.message || r.stderr || r.status).slice(-1000));
  }
  return {stdout:String(r.stdout||''),stderr:String(r.stderr||'')};
}

function standardFor(overrides={}) {
  const p={...STANDARD,...overrides};
  if (Object.values(p).some(x=>!Number.isFinite(x))) throw new Error('audio_standard_nonfinite');
  if (p.targetLufs < -24 || p.targetLufs > -8) throw new Error('audio_lufs_invalid');
  if (p.toleranceLu < 0 || p.toleranceLu > 5) throw new Error('audio_lufs_tolerance_invalid');
  if (p.maxTruePeakDbtp > -.1 || p.maxTruePeakDbtp < -6 ||
      p.masteringPeakDbtp > p.maxTruePeakDbtp || p.masteringPeakDbtp < -6) throw new Error('audio_peak_policy_invalid');
  if (p.targetLra < 1 || p.targetLra > 20) throw new Error('audio_lra_invalid');
  if (p.maxSilentRunSec < 0 || p.maxSilenceRatio < 0 || p.maxSilenceRatio > 1) throw new Error('audio_silence_policy_invalid');
  return p;
}
function digest(file) {
  const h=crypto.createHash('sha256'), fd=fs.openSync(file,'r'), chunk=Buffer.allocUnsafe(1024*1024);
  try {
    for (;;) {
      const n=fs.readSync(fd,chunk,0,chunk.length,null);
      if (!n) break;
      h.update(chunk.subarray(0,n));
    }
  } finally {fs.closeSync(fd);}
  return h.digest('hex');
}
function finite(value) {
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}
export function silenceRanges(log,duration) {
  const events=[...log.matchAll(/silence_(start|end):\s*(\d+(?:\.\d+)?)/g)];
  const out=[];let begin=null;
  for(const match of events) {
    const at=Number(match[2]);
    if(match[1]==='start' && begin===null) begin=at;
    else if(match[1]==='end' && begin!==null) {
      if(at>begin) out.push([begin,Math.min(at,duration)]);
      begin=null;
    }
  }
  if(begin!==null && duration>begin) out.push([begin,duration]);
  return out;
}
function inspect(file,p) {
  const probe=JSON.parse(run('ffprobe',['-v','error','-show_format','-show_streams','-of','json',file]).stdout);
  const streams=probe.streams||[];
  const audioStreamCount=streams.filter(s=>s.codec_type==='audio').length;
  const hasAudio=audioStreamCount>0;
  const hasVideo=streams.some(s=>s.codec_type==='video');
  const duration=finite(probe.format?.duration)||0;
  if(!hasAudio || duration<=0) return {hasAudio,hasVideo,audioStreamCount,streamCount:audioStreamCount,duration,integratedLufs:null,truePeakDbtp:null,silenceRatio:0,maxSilentRunSec:0,pass1:null};
  const log=run('ffmpeg',['-nostdin','-hide_banner','-v','info','-i',file,
    '-map','0:a:0','-af','loudnorm=I='+p.targetLufs+':TP='+p.maxTruePeakDbtp+':LRA='+p.targetLra+':print_format=json',
    '-f','null','-']).stderr;
  const jsons=[...log.matchAll(/\{\s*"input_i"\s*:[\s\S]*?\}/g)];
  if(!jsons.length) throw new Error('audio_loudnorm_measurement_missing');
  const pass1=JSON.parse(jsons.at(-1)[0]);
  const silence=run('ffmpeg',['-nostdin','-hide_banner','-v','info','-i',file,
    '-map','0:a:0','-af','silencedetect=n=-55dB:d=0.35','-f','null','-']).stderr;
  const ranges=silenceRanges(silence,duration);
  const total=ranges.reduce((s,[a,b])=>s+b-a,0);
  return {hasAudio,hasVideo,audioStreamCount,streamCount:audioStreamCount,duration,integratedLufs:finite(pass1.input_i),
    truePeakDbtp:finite(pass1.input_tp),loudnessRangeLu:finite(pass1.input_lra),
    silenceRatio:Number((total/duration).toFixed(4)),
    maxSilentRunSec:Number(Math.max(0,...ranges.map(([a,b])=>b-a)).toFixed(3)),
    pass1};
}

export function auditCommercialAudio({input,expectedSha256,standard={}}) {
  if(!input || !fs.existsSync(input)) throw new Error('audio_file_missing');
  const p=standardFor(standard),sha256=digest(input);
  if(expectedSha256 && sha256.toLowerCase()!==expectedSha256.toLowerCase()) throw new Error('audio_digest_mismatch');
  const measured=inspect(input,p),reasons=[];
  if(!measured.hasAudio) reasons.push('audio_stream_missing');
  if(measured.audioStreamCount>1) reasons.push('multiple_audio_streams_require_review');
  if(measured.duration<.5) reasons.push('audio_duration_invalid');
  if(measured.hasAudio) {
    if(measured.integratedLufs===null || measured.truePeakDbtp===null) reasons.push('audio_silent_or_unmeasurable');
    else {
      if(Math.abs(measured.integratedLufs-p.targetLufs)>p.toleranceLu) reasons.push('integrated_loudness_out_of_range');
      if(measured.truePeakDbtp>p.maxTruePeakDbtp) reasons.push('true_peak_above_ceiling');
    }
    if(measured.silenceRatio>p.maxSilenceRatio) reasons.push('silence_ratio_excessive');
    if(measured.maxSilentRunSec>p.maxSilentRunSec) reasons.push('long_silent_gap');
  }
  return {schema:'evercraft.fallen.commercial-audio-qc.v1',status:reasons.length?'rejected':'accepted',
    path:path.resolve(input),sha256,policy:p,measurements:measured,reasons,
    evidenceRefs:['sha256:'+sha256,'ffprobe:streams','ffmpeg:loudnorm','ffmpeg:silencedetect'],
    boundaries:{technicalQcOnly:true,creativeListeningReviewRequired:true,voicePerformanceApproved:false,
      musicCompositionApproved:false,rightsVerified:false,publicationAuthorityGranted:false}};
}

export function masterCommercialAudio({input,output,expectedSha256,standard={}}) {
  if(!input || !output || path.resolve(input)===path.resolve(output)) throw new Error('audio_master_paths_invalid');
  if(path.extname(output).toLowerCase()!=='.mp4') throw new Error('audio_master_output_must_be_mp4');
  if(fs.existsSync(output)) throw new Error('audio_master_output_exists');
  const p=standardFor(standard);
  const source=auditCommercialAudio({input,expectedSha256,standard:p});
  const m=source.measurements;
  if(!m.hasAudio || !m.hasVideo) throw new Error('audio_master_requires_picture_and_sound');
  const stats=m.pass1,keys=['input_i','input_tp','input_lra','input_thresh','target_offset'];
  if(!stats || keys.some(key=>finite(stats[key])===null)) throw new Error('audio_master_first_pass_unmeasurable');
  const af=['loudnorm=I='+p.targetLufs,'TP='+p.masteringPeakDbtp,'LRA='+p.targetLra,
    'measured_I='+stats.input_i,'measured_TP='+stats.input_tp,'measured_LRA='+stats.input_lra,
    'measured_thresh='+stats.input_thresh,'offset='+stats.target_offset,'linear=true'].join(':');
  fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});
  const temp=path.join(path.dirname(path.resolve(output)),'.'+path.basename(output)+'.'+process.pid+'.part.mp4');
  try {
    run('ffmpeg',['-nostdin','-y','-hide_banner','-v','warning','-i',input,
      '-map','0:v:0','-map','0:a:0','-c:v','copy','-af',af,
      '-c:a','aac','-b:a','256k','-ar','48000','-movflags','+faststart',temp]);
    const qc=auditCommercialAudio({input:temp,standard:p});
    if(qc.status!=='accepted') throw new Error('audio_master_post_qc_rejected:'+qc.reasons.join(','));
    fs.renameSync(temp,output);
    return {schema:'evercraft.fallen.commercial-audio-master.v1',status:'accepted',
      originalSha256:source.sha256,outputSha256:qc.sha256,output:path.resolve(output),
      before:m,after:qc.measurements,method:'two_pass_ebur128_with_final_aac_qc',
      publicationAuthorityGranted:false};
  } finally {if(fs.existsSync(temp)) fs.rmSync(temp,{force:true});}
}

function main(){
  const [action,...args]=process.argv.slice(2),p={};
  for(let i=0;i<args.length;i+=2) {
    if(!args[i]?.startsWith('--') || !args[i+1]) throw new Error('usage: audit --input FILE | master --input FILE --output FILE');
    p[args[i].slice(2)]=args[i+1];
  }
  const standard={};
  for(const [flag,key] of [['target-lufs','targetLufs'],['tolerance-lu','toleranceLu'],
    ['max-true-peak','maxTruePeakDbtp'],['mastering-peak','masteringPeakDbtp'],
    ['max-silent-run','maxSilentRunSec'],['max-silence-ratio','maxSilenceRatio']])
    if(p[flag]!==undefined) standard[key]=Number(p[flag]);
  const receipt=action==='audit'
    ?auditCommercialAudio({input:p.input,expectedSha256:p['expected-sha256'],standard})
    :action==='master'
    ?masterCommercialAudio({input:p.input,output:p.output,expectedSha256:p['expected-sha256'],standard})
    :null;
  if(!receipt) throw new Error('usage: audit --input FILE | master --input FILE --output FILE');
  process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
  if(receipt.status!=='accepted') process.exitCode=2;
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  try{main();}catch(error){console.error(String(error.message||error));process.exitCode=2;}
}
