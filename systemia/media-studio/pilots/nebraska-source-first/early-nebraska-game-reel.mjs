/**
 * Genuine early Husker football moving-image canary from History Nebraska.
 *
 * Archive RG6137.MI "Early University of Nebraska Scenes", 4m10s silent 16mm
 * copy of 35mm moving footage. Historical analysis suggests the first ~55s
 * are probably 1919 Nebraska/Notre Dame, followed by ~1912-14 action.
 *
 * Copyright: catalog says "believed public domain" in USA, with no
 * determination elsewhere. NOT a claim of global permission or endorsement.
 * Absolutely no fabricated sound, historic speech, playing field or event.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {makeTimelineProject} from '../../timeline.js';
import {renderTimelineExport} from '../../timeline-export.js';

const ID='b8e868d0-911f-4fce-9feb-3316f16b8b0c';
const ARCHIVE={
 page:'https://nebraska.access.preservica.com/uncategorized/IO_'+ID+'/',
 publicDownload:'https://nebraska.access.preservica.com/download/file/IO_'+ID,
 research:'https://history.nebraska.gov/earliest-video-of-husker-football/',
 title:'Early University of Nebraska Scenes',collection:'RG6137.MI',
 label:'Husker game film, likely 1919',
 creator:'Historic University of Nebraska collection; digitized by History Nebraska',
 rights:'Believed free of known US copyright restrictions; status outside USA undetermined',
 rightsState:'historical_archive_stated_US_public_domain_no_global_determination',
 reelDurationSec:250,sourceExcerptStartSec:12,sourceExcerptDurationSec:18
};
function run(cmd,args,timeout=300000){
 const r=spawnSync(cmd,args,{encoding:'utf8',timeout,maxBuffer:1024*1024*6});
 if(r.error||r.status!==0)throw Error(cmd+'_failed:'+String(r.stderr||r.error?.message||r.status).slice(-700));
 return String(r.stdout||'');
}
const sha=(p,alg='sha256')=>crypto.createHash(alg).update(fs.readFileSync(p)).digest('hex');
export function validateReelDownload(file){
 if(!fs.existsSync(file)||fs.statSync(file).size<500000)throw Error('archive_reel_missing_or_too_small');
 const header=fs.readFileSync(file,{encoding:null,flag:'r'}).subarray(0,300).toString('utf8');
 if(/<html|<!doctype|access denied|login|forbidden/i.test(header))throw Error('archive_returned_html_not_video');
 const result=JSON.parse(run('ffprobe',['-v','error','-show_format','-show_streams','-of','json',file]));
 const video=result.streams?.find(x=>x.codec_type==='video');
 if(!video||Number(result.format?.duration)<180||Number(result.format?.duration)>350)
  throw Error('archive_reel_not_250_second_moving_film');
 return {sha256:sha(file),bytes:fs.statSync(file).size,durationSec:Number(result.format.duration),
  codec:video.codec_name,hasAudio:result.streams.some(x=>x.codec_type==='audio')};
}
export function verifyArchiveReceipt(r){
 return r?.schema==='evercraft.fallen.history-nebraska-motion-canary.v1' &&
 r?.source?.collection==='RG6137.MI' && r?.source?.sourceExcerptStartSec===12 &&
 r?.creative?.originalFootballFramesOnly===true && r?.creative?.fabricatedHistoricAudio===false &&
 r?.claims?.exactGameYearConfirmed===false && r?.claims?.currentNebraska2026Footage===false &&
 r?.publicationAuthorityGranted===false;
}
export function renderEarlyHuskerArchive(outDir){
 fs.mkdirSync(outDir,{recursive:true});
 const reel=path.join(outDir,'History_Nebraska_RG6137MI_reel_download');
 run('curl',['--fail','--location','--silent','--show-error','--retry','2',
  '--connect-timeout','30','--max-time','280','--max-filesize','450000000',
  '--user-agent','EvercraftDocumentaryResearch/0.1 (public History Nebraska catalog media test)',
  '--output',reel,ARCHIVE.publicDownload],300000);
 const original=validateReelDownload(reel);
 const excerpt=path.join(outDir,'History_Nebraska_1919_Football_18s_ArchiveSource.mp4');
 // Reproduce genuine frames 12s to 30s. No animated photos, no manufactured
 // player routes or artificial cheering. Original silent footage stays silent.
 run('ffmpeg',['-y','-v','error','-ss','12','-t','18','-i',reel,
  '-map','0:v:0','-vf','fps=24,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p',
  '-c:v','libx264','-preset','veryfast','-crf','20','-an','-movflags','+faststart',excerpt],300000);
 const project=makeTimelineProject({
  id:'real-early-husker-football-archive-motion-rc05',
  title:'Early University of Nebraska game film | authentic archival movement',
  aspectRatio:'16:9',fps:24,
  assets:[{id:'history-nebraska-circa-1919',path:excerpt,kind:'video',digest:sha(excerpt),
   sourceRefs:[ARCHIVE.page,ARCHIVE.research,'RG6137.MI','attributed:likely-1919-not-definitively-dated',
    'catalog:rights-believed-public-domain-US-not-confirmed-worldwide'],
   evidenceState:'public_source'}],
  tracks:[{id:'picture',kind:'video',name:'Historical moving film',clips:[
   {id:'genuine-early-football',trackId:'picture',assetId:'history-nebraska-circa-1919',startSec:0,durationSec:18}
  ]}]
 });
 const movie=path.join(outDir,'Evercraft_Genuine_Early_Nebraska_Football_RC05.mp4');
 const receipt=renderTimelineExport({project,outputPath:movie});
 const probe=JSON.parse(run('ffprobe',['-v','error','-show_format','-show_streams','-of','json',movie]));
 const v=probe.streams.find(x=>x.codec_type==='video'),a=probe.streams.find(x=>x.codec_type==='audio');
 if(v.codec_name!=='h264'||receipt.width!==1920||receipt.height!==1080||a)
  throw Error('historic_film_video_only_codec_requirement_failed');
 run('ffmpeg',['-v','error','-xerror','-i',movie,'-f','null','-'],150000);
 const stills=[];
 for(const time of [3,8,14]){
  const img=path.join(outDir,'original-frame-'+time+'.jpg');
  run('ffmpeg',['-y','-v','error','-ss',String(time),'-i',movie,'-frames:v','1',img]);
  stills.push({time,file:path.basename(img),sha256:sha(img)});
 }
 const report={
  schema:'evercraft.fallen.history-nebraska-motion-canary.v1',
  status:'review_only_archival_moving_game_footage',
  source:{...ARCHIVE,original},
  master:{movie:path.basename(movie),receipt,sha256:sha(movie),stills},
  creative:{originalFootballFramesOnly:true,fabricatedHistoricAudio:false,
   noNarratorNoScoreNoFoley:true,archivalVideoIsNotSynthetic:true,
   independentFrameInspectionPending:true},
  claims:{exactGameYearConfirmed:false,currentNebraska2026Footage:false},
  boundaries:{originalUSPublicDomainBeliefNotGlobalLegalWarranty:true,
   sourceRightsContactForDistributionMayBeNeeded:true,
   personOrOrganizationEndorsementNotImplied:true,founderEditorialReviewRequired:true},
  publicationAuthorityGranted:false
 };
 if(!verifyArchiveReceipt(report))throw Error('archival_footage_cannot_self_admit');
 fs.writeFileSync(path.join(outDir,'timeline.json'),JSON.stringify(project,null,2)+'\n');
 fs.writeFileSync(path.join(outDir,'receipt.json'),JSON.stringify(report,null,2)+'\n');
 fs.writeFileSync(path.join(outDir,'SOURCE_CREDITS.txt'),
  'Source: Early University of Nebraska Scenes, University of Nebraska Collection RG6137.MI, History Nebraska digital archive.\n'+
  'Original: '+ARCHIVE.page+'\nContext and historical date reasoning: '+ARCHIVE.research+'\n'+
  '18-second video excerpt from source seconds 12 to 30. Historic game probably 1919, dating NOT certain.\n'+
  'No historic location audio exists in this study. No added sound, generated dialogue or recreated action.\n'+
  'Rights catalog: believed public domain under US law; no determination for other countries. Review before distribution.\n');
 return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
 try{const out=process.argv[2];if(!out)throw Error('Usage: node --import tsx early-nebraska-game-reel.ts <output>');
  const r=renderEarlyHuskerArchive(out);console.log(JSON.stringify({status:r.status,reelBytes:r.source.original.bytes,
   originalSha256:r.source.original.sha256,masterSha256:r.master.sha256,duration:r.master.receipt.durationSec}));}
 catch(e){console.error(String(e));process.exitCode=1;}
}
