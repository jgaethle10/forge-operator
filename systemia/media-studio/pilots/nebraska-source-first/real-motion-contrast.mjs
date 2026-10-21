#!/usr/bin/env node
/** A two-shot filmmaking craft benchmark: genuine Lincoln sky + real Nebraska City machinery.
 * NOT an accepted scene in the Huskers documentary. No inferred football action or invented Foley.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {buildRealArchiveStudy} from './lincoln-archive-canary.mjs';

const LATHE=Object.freeze({
  page:'https://commons.wikimedia.org/wiki/File:Kregel_Windmill_Factory_Museum_Turret_Lathe_2.webm',
  download:'https://upload.wikimedia.org/wikipedia/commons/1/13/Kregel_Windmill_Factory_Museum_Turret_Lathe_2.webm',
  author:'CastIronSeasoner',capturedDate:'2026-04-21',
  location:'Kregel Windmill Factory Museum, Nebraska City, Nebraska',
  license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',
  expectedSha1:'2858bfee9858dda6dc184222991e6e742681e3e9',expectedBytes:5310921,
});
const SKY=Object.freeze({page:'https://commons.wikimedia.org/wiki/File:August_2011_sky_in_Lincoln,_Nebraska.webm',
 author:'CrunchySkies',capturedDate:'2011-08-06',location:'Lincoln, Nebraska',
 license:'CC BY-SA 3.0',licenseUrl:'https://creativecommons.org/licenses/by-sa/3.0/'});
const sha=(file,algo)=>crypto.createHash(algo).update(fs.readFileSync(file)).digest('hex');
const exec=(bin,args)=>{
 const r=spawnSync(bin,args,{encoding:'utf8',maxBuffer:1024*1024*6,timeout:180000});
 if(r.error||r.status!==0)throw Error(bin+':'+String(r.stderr||r.error?.message||r.status).slice(-700));
 return String(r.stdout||'');
};
export function inspectSource(file,expectedSha1,expectedBytes){
 if(!fs.existsSync(file))throw Error('source_file_missing');
 if(fs.statSync(file).size!==expectedBytes)throw Error('source_bytes_mismatch');
 if(sha(file,'sha1')!==expectedSha1)throw Error('source_sha1_mismatch');
 return {sha1:expectedSha1,bytes:expectedBytes};
}
export function validateProof(receipt){
 if(receipt?.schema!=='evercraft.fallen.real-motion-contrast.v1')return false;
 if(receipt?.publicationAuthorityGranted!==false||receipt?.isNebraskaGameFootage!==false)return false;
 if(receipt?.sources?.length!==2||receipt.sources[0]?.capturedDate!=='2011-08-06'||receipt.sources[1]?.capturedDate!=='2026-04-21')return false;
 if(receipt.sources[0]?.license!=='CC BY-SA 3.0'||receipt.sources[1]?.license!=='CC BY 4.0')return false;
 if(receipt.master?.videoCodec!=='h264'||receipt.master?.audioCodec!=='aac')return false;
 return true;
}
export function renderTwoShotStudy(outputDir){
 fs.mkdirSync(outputDir,{recursive:true});
 const skyDir=path.join(outputDir,'sky');
 const skyReceipt=buildRealArchiveStudy(skyDir);
 const skyFile=skyReceipt.master.path;
 const latheFile=path.join(outputDir,'Kregel_2026_original.webm');
 exec('curl',['--fail','--location','--silent','--show-error','--max-time','100','--retry','2',
  '--user-agent','EvercraftFilmResearch/0.1 (cinema provenance verification)',
  '--output',latheFile,LATHE.download]);
 const sourceProof=inspectSource(latheFile,LATHE.expectedSha1,LATHE.expectedBytes);
 const inspect=JSON.parse(exec('ffprobe',['-v','error','-show_streams','-show_format','-of','json',latheFile]));
 const latheAudio=inspect.streams?.find(x=>x.codec_type==='audio');
 const latheVideo=inspect.streams?.find(x=>x.codec_type==='video');
 if(!latheAudio||!latheVideo||Number(inspect.format?.duration)<3.83)throw Error('genuine_lathe_audio_or_video_missing');
 if(!skyReceipt.source.sourceAudioPresent)throw Error('genuine_sky_audio_missing');
 const master=path.join(outputDir,'Evercraft_Real_Motion_Two_Shot_Study_01.mp4');
 // Visual cut at 8s. Lathe sound arrives 0.4s earlier, using authentic onset
 // and the original file's recorded audio, never a synthesizer or fabricated foley.
 // The lathe picture starts 0.4s into source so sound and action line up.
 const filter=[
  '[0:v]fps=24,scale=1280:720:flags=lanczos,setsar=1,trim=duration=8,setpts=PTS-STARTPTS[v0]',
  '[1:v]trim=start=0.40:duration=3.44,setpts=PTS-STARTPTS,fps=24,scale=1280:720:flags=lanczos,setsar=1,format=yuv420p[v1]',
  '[v0][v1]concat=n=2:v=1:a=0[v]',
  '[0:a]atrim=duration=7.60,asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo[a0]',
  '[1:a]atrim=duration=3.84,asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo[a1]',
  '[a0][a1]concat=n=2:v=0:a=1[a]'
 ].join(';');
 exec('ffmpeg',['-y','-v','error','-i',skyFile,'-i',latheFile,
  '-filter_complex',filter,'-map','[v]','-map','[a]',
  '-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p',
  '-c:a','aac','-b:a','160k','-ar','48000','-ac','2','-movflags','+faststart',master]);
 exec('ffmpeg',['-v','error','-xerror','-i',master,'-map','0:v:0','-map','0:a:0','-f','null','-']);
 const probe=JSON.parse(exec('ffprobe',['-v','error','-show_streams','-show_format','-of','json',master]));
 const streams=probe.streams||[];
 const video=streams.find(x=>x.codec_type==='video'),audio=streams.find(x=>x.codec_type==='audio');
 const duration=Number(probe.format?.duration);
 if(video?.codec_name!=='h264'||audio?.codec_name!=='aac'||Math.abs(duration-11.44)>.2)throw Error('master_duration_or_codecs_invalid:'+duration);
 const frames=[];
 for(const sec of [2,6,8.5,10.5]){
  const name='frame-'+sec.toString().replace('.','_')+'.png';
  const still=path.join(outputDir,name);
  exec('ffmpeg',['-y','-v','error','-ss',String(sec),'-i',master,'-frames:v','1',still]);
  frames.push({timeSec:sec,file:name,sha256:sha(still,'sha256')});
 }
 const receipt={
  schema:'evercraft.fallen.real-motion-contrast.v1',state:'review_only_not_documentary_footage',
  isNebraskaGameFootage:false,publicationAuthorityGranted:false,
  sources:[
   {...SKY,originalSha1:skyReceipt.source.sha1,originalBytes:skyReceipt.source.bytes,
    excerpt:'source seconds 2 through 10; continuous handheld footage; original audio'},
   {...LATHE,originalSha1:sourceProof.sha1,originalBytes:sourceProof.bytes,
    excerpt:'source video seconds 0.40 through 3.84; original audio starts .40s before visual cut'}
  ],master:{file:path.basename(master),sha256:sha(master,'sha256'),durationSec:duration,
   videoCodec:video.codec_name,audioCodec:audio.codec_name,frames},
  editorial:{structure:'8s uninterrupted Lincoln 2011 sky hard cut to 3.44s working Nebraska City machine',
   cutMotivation:'organic outdoor motion contrasted with observed mechanical work',
   sound:'genuine captured audio only, no score, no invented dialogue, 0.40s authentic machine sound J-cut',
   noStadiumNoFootball:true,notYetCreativeApproved:true,masterSoundNotIndependentlyListened:true,
   noAudienceReceptionTest:true},
  boundaries:{licensingStillNeedsHumanReview:true,
    sourceContextPreserved:true,mixedAttributionAndShareAlikeObligationsRequireReview:true,
    archivalFootageNeverRepresents2026Game:true,phonePlaybackUnverified:true}
 };
 if(!validateProof(receipt))throw Error('truth_contract_failed');
 fs.writeFileSync(path.join(outputDir,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
 fs.writeFileSync(path.join(outputDir,'CREDITS.txt'),
  'REVIEW STUDY, NOT 2026 NEBRASKA GAME FOOTAGE.\n\n'+
  'Shot 1: August 2011 sky in Lincoln, Nebraska, by CrunchySkies, CC BY-SA 3.0: '+SKY.page+'\n'+SKY.licenseUrl+
  '\nShot 2: Kregel Windmill Factory Museum Turret Lathe 2, by CastIronSeasoner, CC BY 4.0: '+LATHE.page+
  '\n'+LATHE.licenseUrl+'\n'+
  'Edits: excerpts, two-shot juxtaposition, source-sound J-cut and codec transcode.\n'+
  'The CC BY-SA component may trigger ShareAlike obligations for the adapted work; legal/editorial license review remains required.\n');
 return receipt;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
 try{const dir=process.argv[2];if(!dir)throw Error('Usage: node real-motion-contrast.mjs <outdir>');
  const r=renderTwoShotStudy(dir);console.log(JSON.stringify({state:r.state,sha256:r.master.sha256,duration:r.master.durationSec,sources:r.sources.map(x=>x.originalSha1)}));}
 catch(e){console.error(String(e));process.exitCode=1;}
}
