import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const number=x=>Number.isFinite(Number(x))?Number(x):null;
const round=x=>Math.round(x*1000)/1000;
const cap=(x,limit)=>Math.min(limit,Math.max(0,x));
function run(executable,args){
 const r=spawnSync(executable,args,{encoding:'utf8',maxBuffer:8*1024*1024,timeout:120000});
 if(r.error)throw new Error('voice_pacing_process_error:'+r.error.message);
 if(r.status!==0)throw new Error('voice_pacing_process_failed:'+String(r.stderr).slice(-300));
 return r;
}
/** Objective quiet-interval measurements, NOT breath recognition, acting or ASR. */
export function inspectVoicePacing(filePath,options={}){
 if(typeof filePath!=='string'||!filePath.trim()||!fs.existsSync(filePath)||!fs.statSync(filePath).isFile())throw new Error('voice_pacing_audio_missing');
 const noiseDb=options.noiseDb??-36;
 const minPauseSec=options.minPauseSec??.18;
 const longPauseSec=options.longPauseSec??1.2;
 if(!Number.isFinite(noiseDb)||noiseDb < -90||noiseDb > -10||!Number.isFinite(minPauseSec)||minPauseSec<.08||minPauseSec>3||!Number.isFinite(longPauseSec)||longPauseSec<minPauseSec||longPauseSec>12)throw new Error('voice_pacing_settings_invalid');
 const probe=run('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type','-of','json',filePath]);
 const details=JSON.parse(probe.stdout);
 if(!details.streams?.some(s=>s.codec_type==='audio'))throw new Error('voice_pacing_no_audio_stream');
 const duration=number(details.format?.duration);
 if(duration===null||duration<=0)throw new Error('voice_pacing_duration_invalid');
 const s=run('ffmpeg',['-nostats','-hide_banner','-i',filePath,'-vn','-af','silencedetect=noise='+noiseDb+'dB:d='+minPauseSec,'-f','null','-']);
 const events=[];
 for(const line of s.stderr.split(/\r?\n/)){
  const start=line.match(/silence_start:\s*([\d.]+)/);
  const end=line.match(/silence_end:\s*([\d.]+)/);
  if(start)events.push({type:'start',time:cap(number(start[1])??0,duration)});
  if(end)events.push({type:'end',time:cap(number(end[1])??0,duration)});
 }
 const intervals=[];
 let open=null;
 for(const event of events){
  if(event.type==='start'){if(open===null)open=event.time;}
  else if(open!==null){
   if(event.time>open)intervals.push({startSec:round(open),endSec:round(event.time),durationSec:round(event.time-open)});
   open=null;
  }
 }
 if(open!==null&&duration>open)intervals.push({startSec:round(open),endSec:round(duration),durationSec:round(duration-open)});
 const quiet=intervals.reduce((sum,x)=>sum+x.durationSec,0);
 const nonQuietSec=Math.max(0,duration-quiet);
 const leading=intervals[0]?.startSec===0?intervals[0].durationSec:0;
 const last=intervals.at(-1);
 const trailing=last&&Math.abs(last.endSec-duration)<.025?last.durationSec:0;
 const warnings=[];
 if(nonQuietSec<.2)warnings.push('no_nonquiet_speech_candidate_detected');
 if(leading>=.7)warnings.push('large_leading_quiet_section_review');
 if(trailing>=.9)warnings.push('large_trailing_quiet_section_review');
 if(intervals.some(x=>x.durationSec>=longPauseSec&&x.startSec>.1&&x.endSec<duration-.1))warnings.push('long_internal_pause_review');
 if(nonQuietSec/duration<.35)warnings.push('unusually_low_nonquiet_ratio_review');
 const hash=crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
 return {
  schema:'evercraft.voice-foundry.pacing-inspection.v1',
  audioDigest:hash,durationSec:round(duration),noiseThresholdDb:noiseDb,minPauseSec,longPauseSec,
  quietIntervals:intervals,quietIntervalCount:intervals.length,quietDurationSec:round(quiet),
  nonQuietDurationSec:round(nonQuietSec),nonQuietRatio:round(nonQuietSec/duration),
  leadingQuietSec:leading,trailingQuietSec:trailing,
  warnings,status:warnings.length?'needs_human_rhythm_review':'measured_not_performance_approved',
  acousticLimitations:['silence_is_not_breath','quiet_is_not_proof_of_pause_intent','no_recognition_of_words','no_emotional_quality_score'],
  editorialQualityApproved:false,publicationAuthorityGranted:false
 };
}