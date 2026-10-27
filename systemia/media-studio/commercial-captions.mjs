// Commercial SRT preflight. Not a substitute for human visual/legibility review.
import fs from 'node:fs';
import crypto from 'node:crypto';

const LIMITS={
  '9:16':{maxLineCharacters:32,maxLines:2,maxCharactersPerSecond:21},
  '1:1':{maxLineCharacters:38,maxLines:2,maxCharactersPerSecond:23},
  '16:9':{maxLineCharacters:44,maxLines:2,maxCharactersPerSecond:24}
};
function seconds(value) {
  const parts=/^(\d{2}):([0-5]\d):([0-5]\d),(\d{3})$/.exec(value);
  if(!parts)throw new Error('commercial_caption_timecode_invalid');
  return Number(parts[1])*3600+Number(parts[2])*60+Number(parts[3])+Number(parts[4])/1000;
}
export function parseCommercialSrt(srt){
  if(typeof srt!=='string'||!srt.trim())throw new Error('commercial_caption_srt_empty');
  const normalized=srt.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim();
  const blocks=normalized.split(/\n\s*\n/).filter(Boolean);
  const cues=[];
  for(const [index,block] of blocks.entries()){
    const lines=block.trim().split('\n');
    if(lines.length<3||! /^\d+$/.test(lines[0].trim())||Number(lines[0])!==index+1)
      throw new Error('commercial_caption_index_invalid:'+index);
    const timing=/^(\d{2}:\d{2}:\d{2},\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2},\d{3})$/.exec(lines[1].trim());
    if(!timing)throw new Error('commercial_caption_timing_invalid:'+(index+1));
    const startSec=seconds(timing[1]),endSec=seconds(timing[2]);
    const textLines=lines.slice(2).map(x=>x.trim());
    if(textLines.some(x=>!x||/[<>{}]/.test(x)))
      throw new Error('commercial_caption_text_markup_or_empty:'+(index+1));
    if(endSec<=startSec)throw new Error('commercial_caption_nonpositive_duration:'+(index+1));
    if(cues.length&&startSec<cues.at(-1).endSec-.005)
      throw new Error('commercial_caption_overlapping_cues:'+(index+1));
    cues.push({index:index+1,startSec,endSec,lines:textLines,
      text:textLines.join(' ')});
  }
  return cues;
}
export function preflightCommercialCaptions({filePath,aspectRatio,durationSec,expectedSha256}){
  const bounds=LIMITS[aspectRatio];
  if(!bounds)throw new Error('commercial_caption_aspect_unsupported');
  if(!Number.isFinite(durationSec)||durationSec<=0)
    throw new Error('commercial_caption_program_duration_invalid');
  const bytes=fs.readFileSync(filePath);
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  if(expectedSha256&&expectedSha256.toLowerCase()!==sha256)
    throw new Error('commercial_caption_source_hash_mismatch');
  const cues=parseCommercialSrt(bytes.toString('utf8'));
  if(!cues.length)throw new Error('commercial_caption_no_cues');
  let maxCharCount=0;
  for(const cue of cues){
    if(cue.endSec>durationSec+.05)throw new Error('commercial_caption_beyond_program:'+cue.index);
    if(cue.lines.length>bounds.maxLines)
      throw new Error('commercial_caption_too_many_lines:'+cue.index);
    for(const line of cue.lines){
      const length=Array.from(line).length;
      if(length>bounds.maxLineCharacters)
        throw new Error('commercial_caption_line_too_long:'+cue.index);
      maxCharCount=Math.max(maxCharCount,length);
    }
    // Moderate reading density helps real phone users, without pretending to measure readability.
    const characters=Array.from(cue.text).length;
    if(characters/(cue.endSec-cue.startSec)>bounds.maxCharactersPerSecond)
      throw new Error('commercial_caption_reading_speed_too_fast:'+cue.index);
  }
  return {schema:'evercraft.fallen.commercial-caption-preflight.v1',
    status:'text_and_timing_preflight_accepted',aspectRatio,
    sourceSha256:sha256,cues:cues.length,maxLineCharacters:maxCharCount,
    durationSec,limits:bounds,
    visualSafeAreaVerified:false,humanReadabilityApproved:false,
    publicationAuthorityGranted:false};
}
