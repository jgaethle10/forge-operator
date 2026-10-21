import { spawnSync } from 'node:child_process';

/**
 * Observe the *encoded final output* rather than trusting an export's requested
 * loudness target. FFmpeg ebur128 follows ITU-R BS.1770/EBU R128 measurement.
 * The returned measurements say nothing about dialogue intelligibility,
 * musical taste, mastering approval, rights, or publication readiness.
 */
export interface AudioLoudnessEvidence {
  integratedLufs:number|null;
  loudnessRangeLu:number|null;
  truePeakDbtp:number|null;
  maxShortTermLufs:number|null;
  analysis:'ffmpeg_ebur128_peak_true';
  evidenceStatus:'measured'|'unmeasurable';
  artisticApproval:false;
  publicationAuthorityGranted:false;
}

function metric(pattern:RegExp,text:string):number|null{
  const match=pattern.exec(text);
  if(!match)throw new Error('audio_loudness_summary_incomplete');
  const value=Number(match[1]);
  return Number.isFinite(value)?value:null;
}

/** Parse summary only, never mistake frame-by-frame provisional I / TPK for final results. */
export function parseEbuR128Summary(output:string):AudioLoudnessEvidence{
  const offset=output.lastIndexOf('Summary:');
  if(offset<0)throw new Error('audio_loudness_summary_missing');
  const summary=output.slice(offset);
  const integratedLufs=metric(/Integrated loudness:\s*I:\s*([-+]?\d+(?:\.\d+)?|-?inf)\s*LUFS/i,summary);
  const loudnessRangeLu=metric(/Loudness range:\s*LRA:\s*([-+]?\d+(?:\.\d+)?|-?inf)\s*LU/i,summary);
  const truePeakDbtp=metric(/True peak:\s*Peak:\s*([-+]?\d+(?:\.\d+)?|-?inf)\s*dBFS/i,summary);

  // The short-term meter only stabilizes after 3s of signal. These are
  // diagnostic observations, not a short-form advertisement loudness gate.
  const observed=[...output.slice(0,offset).matchAll(/\bS:\s*([-+]?\d+(?:\.\d+)?|-?inf)\s+(?:I:|LRA:)/gi)]
    .map(m=>Number(m[1])).filter(value=>Number.isFinite(value)&&value>-100);
  const maxShortTermLufs=observed.length?Math.max(...observed):null;
  return {
    integratedLufs,loudnessRangeLu,truePeakDbtp,maxShortTermLufs,
    analysis:'ffmpeg_ebur128_peak_true',
    evidenceStatus:integratedLufs===null||truePeakDbtp===null?'unmeasurable':'measured',
    artisticApproval:false,
    publicationAuthorityGranted:false,
  };
}

export function measureAudioLoudness(filePath:string):AudioLoudnessEvidence{
  if(!filePath?.trim())throw new Error('audio_loudness_path_required');
  const result=spawnSync('ffmpeg',[
    '-hide_banner','-nostats','-v','info','-i',filePath,
    '-map','0:a:0','-vn','-af','ebur128=peak=true','-f','null','-',
  ],{encoding:'utf8',maxBuffer:64*1024*1024});
  if(result.error)throw new Error('audio_loudness_ffmpeg_unavailable:'+result.error.message);
  if(result.status!==0)throw new Error('audio_loudness_ffmpeg_failed:'+String(result.stderr||'').slice(-500));
  return parseEbuR128Summary(String(result.stderr||''));
}
