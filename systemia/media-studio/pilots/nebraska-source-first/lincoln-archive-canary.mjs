/** Authentic 2011 Lincoln archive intake. Research canary only: NOT 2026 Nebraska game footage. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

export const ARCHIVE={
  page:'https://commons.wikimedia.org/wiki/File:August_2011_sky_in_Lincoln,_Nebraska.webm',
  title:'August 2011 sky in Lincoln, Nebraska',
  author:'CrunchySkies',
  capturedAt:'2011-08-06T20:36:16',
  license:'CC BY-SA 3.0',
  licenseUrl:'https://creativecommons.org/licenses/by-sa/3.0/',
  expectedSha1:'d7fb114b1d2e9b0b12556950e0c45b6797f947ac',
  expectedBytes:10973914,
  urls:[
    'https://upload.wikimedia.org/wikipedia/commons/8/8d/August_2011_sky_in_Lincoln%2C_Nebraska.webm',
    'https://commons.wikimedia.org/wiki/Special:Redirect/file/August_2011_sky_in_Lincoln%2C_Nebraska.webm',
  ],
  footageOf:'Observed Lincoln sky, August 2011. Not a Nebraska football match or 2026 scene.',
};
const hash=(file,alg)=>crypto.createHash(alg).update(fs.readFileSync(file)).digest('hex');
const run=(bin,args)=>{
 const r=spawnSync(bin,args,{encoding:'utf8',maxBuffer:1024*1024*6,timeout:180000});
 if(r.error||r.status!==0)throw Error(bin+'_failed:'+String(r.stderr||r.error?.message||r.status).slice(-1000));
 return String(r.stdout||'');
};
export function inspectArchiveBytes(file){
 if(!fs.existsSync(file))throw Error('archive_not_downloaded');
 const size=fs.statSync(file).size,digest=hash(file,'sha1');
 if(size!==ARCHIVE.expectedBytes)throw Error('archive_byte_length_mismatch:'+size);
 if(digest!==ARCHIVE.expectedSha1)throw Error('archive_sha1_mismatch:'+digest);
 return {bytes:size,sha1:digest};
}
export function archivalReleaseBoundary(receipt){
 return receipt?.publicationAuthorityGranted===false&&
 receipt?.source?.capturedAt===ARCHIVE.capturedAt&&
 receipt?.source?.license===ARCHIVE.license&&
 receipt?.source?.footageOf===ARCHIVE.footageOf&&
 receipt?.claims?.realFootballPlay===false&&
 receipt?.claims?.originalLocationAudioInvented===false;
}
export function buildRealArchiveStudy(outdir){
 fs.mkdirSync(outdir,{recursive:true});
 const original=path.join(outdir,'lincoln-sky-2011-original.webm');
 const errors=[];
 for(const url of ARCHIVE.urls){
  try{
    run('curl',['--fail','--location','--silent','--show-error','--max-time','100',
      '--retry','2','--user-agent','EvercraftFilmResearch/0.1 (editorial verification; https://fabric.systemiacommandcenters.com)',
      '--output',original,url]);
    inspectArchiveBytes(original);
    break;
  }catch(e){errors.push(String(e.message));fs.rmSync(original,{force:true});}
 }
 if(!fs.existsSync(original))throw Error('authentic_archive_intake_failed:'+errors.join(';'));
 const originalDigest=inspectArchiveBytes(original);
 const probe=JSON.parse(run('ffprobe',['-v','error','-show_format','-show_streams','-of','json',original]));
 const video=probe.streams?.find(s=>s.codec_type==='video');
 const recordedAudio=probe.streams?.some(s=>s.codec_type==='audio')===true;
 if(!video||Number(probe.format?.duration)<12)throw Error('original_video_invalid');
 const mp4=path.join(outdir,'Lincoln_2011_Genuine_Archive_Study_8s.mp4');
 const args=['-y','-v','error','-ss','2','-t','8','-i',original,'-map','0:v:0',
  '-vf','scale=1280:720:flags=lanczos,fps=24,format=yuv420p','-c:v','libx264','-preset','veryfast','-crf','21',
  ...(recordedAudio?['-map','0:a:0','-c:a','aac','-b:a','128k']:['-an']),
  '-movflags','+faststart',mp4];
 run('ffmpeg',args);
 const final=JSON.parse(run('ffprobe',['-v','error','-show_format','-show_streams','-of','json',mp4]));
 const fvid=final.streams?.find(s=>s.codec_type==='video');
 const faud=final.streams?.find(s=>s.codec_type==='audio');
 if(fvid?.codec_name!=='h264'||!!faud!==recordedAudio||Math.abs(Number(final.format?.duration)-8)>.1)throw Error('export_codec_audio_or_duration_mismatch');
 run('ffmpeg',['-v','error','-xerror','-i',mp4,'-f','null','-']);
 const stills=[];
 for(const second of [1,4,7]){
  const file=path.join(outdir,'frame-'+second+'.png');
  run('ffmpeg',['-y','-v','error','-ss',String(second),'-i',mp4,'-frames:v','1',file]);
  stills.push({second,relativePath:path.basename(file),sha256:hash(file,'sha256')});
 }
 const receipt={
  schema:'evercraft.fallen.authentic-archive-study.v1',status:'technical_archive_review_only',
  source:{...ARCHIVE,sha1:originalDigest.sha1,bytes:originalDigest.bytes,
    sourceAudioPresent:recordedAudio},
  master:{path:mp4,sha256:hash(mp4,'sha256'),bytes:fs.statSync(mp4).size,
    durationSec:Number(final.format.duration),videoCodec:fvid.codec_name,
    audioCodec:faud?.codec_name??null,resolution:[fvid.width,fvid.height],stills},
  claims:{realFootballPlay:false,originalLocationAudioInvented:false,
    filmedIn2026:false,actualNebraskaFansPresent:false},
  boundaries:{derivativeShareAlikeLicenseApplies:true,
    editorialRightsAndAttributionReviewStillRequired:true,
    doesNotProveIndependentSceneAction:true,
    notPartOfApprovedDocumentaryCut:true,
    publicationAuthorityGranted:false},
  publicationAuthorityGranted:false,
 };
 if(!archivalReleaseBoundary(receipt))throw Error('release_boundary_failed');
 fs.writeFileSync(path.join(outdir,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
 fs.writeFileSync(path.join(outdir,'ATTRIBUTION.txt'),
 `Source: ${ARCHIVE.title} by ${ARCHIVE.author}\nPage: ${ARCHIVE.page}\nLicense: ${ARCHIVE.license} - ${ARCHIVE.licenseUrl}\nCaptured: ${ARCHIVE.capturedAt} in Lincoln, Nebraska\nModified: selected 8-second segment (source seconds 2–10), transcoded to 24 fps H.264/AAC where native audio is present.\nShareAlike terms apply to adapted material. This is NOT footage of Nebraska football or 2026. Do not publish without attribution/rights/editor review.\n`);
 return receipt;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
 try{const out=process.argv[2];if(!out)throw Error('usage: node lincoln-archive-canary.mjs <output_dir>');const receipt=buildRealArchiveStudy(out);console.log(JSON.stringify({status:receipt.status,master:receipt.master.sha256,sourceSha1:receipt.source.sha1,audioPresent:receipt.source.sourceAudioPresent}));}
 catch(e){console.error(String(e));process.exitCode=1;}
}
