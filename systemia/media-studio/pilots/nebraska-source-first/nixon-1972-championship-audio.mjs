/**
 * Research ONLY: public mirror of Nixon Presidential Library tape 662-010.
 * The Library documents participants Robert Devaney, Johnny Rodgers,
 * Jerry Tagge, etc. This test does NOT establish audible identity or legal
 * clearance for commercial documentary use. No automatic film inclusion.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
export const source={
 conversation:'662-010',
 originalArchive:'Richard Nixon Presidential Library and Museum, NARA, White House Tapes',
 originalUrl:'https://www.nixonlibrary.gov/white-house-tapes/662/conversation-662-010',
 officialFindingAid:'https://www.nixonlibrary.gov/sites/default/files/forresearchers/find/tapes/tape662/37-wht-audiotape-662-log.pdf',
 date:'1972-02-01',place:'Oval Office, Washington, D.C.',
 knownParticipants:['Richard Nixon','Bob Devaney','Jerry Tagge','Johnny Rodgers','Rich Glover'],
 researchMirror:'https://nixon.nyc3.digitaloceanspaces.com/audio/662-010.mp3',
 mirroredBy:'Easy Nixon / independent archive using released NARA recordings',
 rights:'National Archives recording publicly released; legal/publication and participant context review still required',
 publicationAllowed:false
};
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const invoke=(binary,args,timeout=120000)=>{
 const r=spawnSync(binary,args,{encoding:'utf8',timeout,maxBuffer:3*1024*1024});
 if(r.status!==0||r.error)throw Error(binary+'_failed:'+String(r.stderr||r.error?.message||r.status).slice(-650));
 return r.stdout;
};
export function checkAudioFile(file){
 if(!fs.existsSync(file)||fs.statSync(file).size<180000||fs.statSync(file).size>100000000)
  throw Error('original_nebraska_tape_missing_or_invalid_size');
 const header=Buffer.alloc(512);
 const fd=fs.openSync(file,'r');
 try{fs.readSync(fd,header,0,header.length,0);}finally{fs.closeSync(fd);}
 const first=header.toString('utf8');
 if(/<!doctype|<html|access denied|forbidden|error 404/i.test(first))
  throw Error('original_nebraska_tape_html_or_denied');
 const p=JSON.parse(invoke('ffprobe',['-v','error','-show_format','-show_streams','-of','json',file]));
 const audio=p.streams?.find(x=>x.codec_type==='audio');
 const duration=Number(p.format?.duration);
 if(!audio||!Number.isFinite(duration)||duration<60||duration>3600)
  throw Error('original_nebraska_tape_unrecognized_codec_or_length');
 return {bytes:fs.statSync(file).size,sha256:sha(file),codec:audio.codec_name,
  sampleRate:Number(audio.sample_rate||0),channels:audio.channels,durationSec:duration,
  // This is NOT independent verification of the actual speakers or what they say.
  speakersPersonallyAuditioned:false,wordsIndependentlyChecked:false};
}
export function checkResearchBoundary(x){
 return x?.schema==='evercraft.fallen.nixon-662-010-research-audio.v1'&&
 x.source?.conversation==='662-010'&&x.source?.date==='1972-02-01'&&
 x?.publicationAuthorityGranted===false&&x?.sourceAudioPresent===true&&
 x?.speakerIdentityAudited===false&&x?.transcriptVerified===false&&
 x?.fileSubstitutedIntoEpisode===false;
}
export function acquire(outdir){
 fs.mkdirSync(outdir,{recursive:true});
 const audioFile=path.join(outdir,'NARA_Nixon_662-010_1972_Nebraska_Champions_UNVERIFIED_RESEARCH.mp3');
 invoke('curl',['--fail','--location','--silent','--show-error','--retry','2','--max-time','110',
  '--user-agent','EvercraftHistoricalResearch/0.1 (archive preview only)',
  '--output',audioFile,source.researchMirror],125000);
 const verified=checkAudioFile(audioFile);
 const checks=[];
 for(const sec of [3,Math.floor(verified.durationSec/2),Math.max(3,Math.floor(verified.durationSec-12))]){
  try{
   const out=invoke('ffmpeg',['-v','error','-ss',String(sec),'-t','3','-i',audioFile,
    '-f','s16le','-ac','1','-ar','16000','pipe:1'],45000);
   // We decode fully to /dev/null separately; don't use decoded samples for speaker claims.
   checks.push({sampleSec:sec,decodeStatus:'passed'});
  }catch(e){throw Error('nebraska_original_sound_window_corrupt:'+sec+':'+String(e));}
 }
 invoke('ffmpeg',['-v','error','-xerror','-i',audioFile,'-f','null','-'],120000);
 const report={schema:'evercraft.fallen.nixon-662-010-research-audio.v1',source,
  media:{...verified,filename:path.basename(audioFile)},sampleChecks:checks,
  sourceAudioPresent:true,speakerIdentityAudited:false,transcriptVerified:false,
  sourceMasterComparedToNARA:false,fileSubstitutedIntoEpisode:false,
  publicationAuthorityGranted:false,
  status:'acquired_from_independent_public_mirror_research_review_only',
  humanNeeds:['listen and confirm individual actual speakers','validate precise original quotations and date with official finding aid',
   'check independent mirror provenance against NARA original release','investigate image and voice reuse restrictions','editor/founder creative approval']};
 if(!checkResearchBoundary(report))throw Error('historical_audio_claim_exceeds_evidence');
 fs.writeFileSync(path.join(outdir,'NIXON_662_010_RESEARCH_RECEIPT.json'),JSON.stringify(report,null,2)+'\n');
 fs.writeFileSync(path.join(outdir,'README.txt'),
  'PRIVATE RESEARCH AUDIO ONLY. NARA Nixon White House Tapes conversation 662-010 (Feb 1, 1972), publicly mirrored by Easy Nixon. Original speaker content and public reuse rights not independently reviewed. DO NOT publish, quote, identify speaker turns or add audio to a film without audio audition and permission review. Original NARA: '+source.originalUrl+'\n');
 return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
 try{if(!process.argv[2])throw Error('Usage: node nixon-1972-championship-audio.mjs <output-directory>');
  const r=acquire(process.argv[2]);
  console.log(JSON.stringify({status:r.status,durationSec:r.media.durationSec,codec:r.media.codec,
   bytes:r.media.bytes,sha256:r.media.sha256,admittedToFilm:r.fileSubstitutedIntoEpisode}));}
 catch(e){console.error(String(e));process.exitCode=1;}
}
