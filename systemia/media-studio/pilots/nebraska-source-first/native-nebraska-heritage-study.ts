/**
 * Nebraska real-source heritage bridge: genuine filmed Lincoln sky -> genuine 1973 Husker football crowd photograph.
 * The still is not animated or represented as 1973 video. The 2011 source audio stops at the still cut.
 * No football/game/interview sound is added. Review study only, no publishing or release authority.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {makeTimelineProject} from '../../timeline.js';
import {renderTimelineExport} from '../../timeline-export.js';
import {buildRealArchiveStudy} from './lincoln-archive-canary.mjs';

const PD={
 title:'The annual spring football game at the University of Nebraska is a stadium-packing event',
 uri:'https://commons.wikimedia.org/wiki/File:THE_ANNUAL_SPRING_FOOTBALL_GAME_AT_THE_UNIVERSITY_OF_NEBRASKA_IS_A_STADIUM-PACKING_EVENT._IT_IS_AN_INTRA-SQUAD_GAME..._-_NARA_-_547323.jpg',
 url:'https://upload.wikimedia.org/wikipedia/commons/b/b6/THE_ANNUAL_SPRING_FOOTBALL_GAME_AT_THE_UNIVERSITY_OF_NEBRASKA_IS_A_STADIUM-PACKING_EVENT._IT_IS_AN_INTRA-SQUAD_GAME..._-_NARA_-_547323.jpg',
 sha1:'8476a2db33115d25a2fc0a60ea8618dea3795209',
 naraId:'547323',date:'May 1973',author:"Charles O'Rear",recordCreator:'U.S. Environmental Protection Agency DOCUMERICA',
 rights:'Public domain, U.S. federal government employee work on official duty',
};
const hash=(file:string,alg:string)=>crypto.createHash(alg).update(fs.readFileSync(file)).digest('hex');
const run=(name:string,args:string[],timeout=180000)=>{
 const r=spawnSync(name,args,{encoding:'utf8',timeout,maxBuffer:1024*1024*6});
 if(r.error||r.status!==0)throw Error(name+'_failed:'+String(r.stderr||r.error?.message||r.status).slice(-700));
 return r.stdout;
};
const probe=(file:string)=>JSON.parse(run('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file]));
export function assertNaraPhoto(source:string){
 if(!fs.existsSync(source))throw Error('nara_photo_missing');
 if(fs.statSync(source).size<300000||fs.statSync(source).size>2200000)throw Error('nara_photo_byte_size_unexpected');
 const sha1=hash(source,'sha1');
 if(sha1!==PD.sha1)throw Error('nara_source_digest_mismatch:'+sha1);
 const info=probe(source);
 const video=info.streams?.find((s:any)=>s.codec_type==='video');
 if(!video||video.width!==2033||video.height!==3000)throw Error('nara_photo_dimensions_invalid');
 return {sha1,bytes:fs.statSync(source).size,width:video.width,height:video.height};
}
export function assertHeritageBoundary(receipt:any){
 return receipt?.schema==='evercraft.fallen.nebraska-heritage-study.v1' &&
 receipt?.isReal1973GameVideo===false && receipt?.is2026FootballFootage===false &&
 receipt?.photo?.naraId==='547323' && receipt?.photo?.sha1===PD.sha1 &&
 receipt?.founderApproved===false && receipt?.publicationAuthorityGranted===false &&
 receipt?.sound?.inventedCrowdAudio===false && receipt?.sound?.scorePresent===false;
}
export function renderNebraskaHeritage(outDir:string){
 fs.mkdirSync(outDir,{recursive:true});
 const sky=buildRealArchiveStudy(path.join(outDir,'sky'));
 const originalPhoto=path.join(outDir,'NARA_547323_1973_original.jpg');
 run('curl',['--fail','--location','--silent','--show-error','--max-time','90','--retry','2',
  '--user-agent','EvercraftFilmResearch/0.1 (Nebraska DOCUMERICA archival provenance)',
  '--output',originalPhoto,PD.url]);
 const source=assertNaraPhoto(originalPhoto);
 // Preserve the full portrait source, rather than cropping people out to fill 16:9.
 // Adaptation remains documented and independently derived from the pinned master.
 const framed=path.join(outDir,'NARA_547323_review_framed.png');
 run('ffmpeg',['-y','-v','error','-i',originalPhoto,'-vf',
  'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x131114',
  '-frames:v','1',framed]);
 const srt=path.join(outDir,'heritage-date-caption.ass');
 // This is factual catalog labeling, not cinematic title animation.
 // Place a restrained 29px label in the left black pillarbox, off the historic faces.
 fs.writeFileSync(srt,[
  '[Script Info]','Title: Archive provenance label','ScriptType: v4.00+',
  'PlayResX: 1920','PlayResY: 1080','',
  '[V4+ Styles]',
  'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
  'Style: Archive,DejaVu Sans,29,&H00E5E2DD,&H00E5E2DD,&H80000000,&H80000000,0,0,0,0,100,100,0,0,1,1,0,1,48,40,75,1','',
  '[Events]','Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  'Dialogue: 0,0:00:08.00,0:00:11.80,Archive,,0,0,0,,LINCOLN  /  MAY 1973',
  ''
 ].join('\n'));
 const skyFile=sky.master.path;
 const assets=[
  {id:'sky',path:skyFile,kind:'video' as const,digest:hash(skyFile,'sha256'),
   sourceRefs:[sky.source.page,'captured:2011-08-06','source-original-sha1:'+sky.source.sha1],evidenceState:'public_source' as const},
  {id:'heritage-photo',path:framed,kind:'image' as const,digest:hash(framed,'sha256'),
   sourceRefs:[PD.uri,'NARA:547323','original-sha1:'+source.sha1,'public-domain:US-EPA'],evidenceState:'public_source' as const},
  {id:'heritage-caption',path:srt,kind:'captions' as const,digest:hash(srt,'sha256'),
   sourceRefs:['editorial-caption:NARA:547323','capture-month:1973-05'],evidenceState:'observed' as const},
 ];
 const timeline=makeTimelineProject({
  id:'evercraft-nebraska-heritage-archive-rc04',title:'Nebraska film archival proof: place and football memory',
  aspectRatio:'16:9',fps:24,assets,
  audioMaster:{targetLufs:-18,truePeakDb:-1.5,lra:9,dialogueDucking:false,sampleRate:48000},
  tracks:[
   {id:'picture',kind:'video',name:'Real location and historical still',clips:[
    {id:'observed-sky-2011',trackId:'picture',assetId:'sky',startSec:0,durationSec:8},
    {id:'historical-football-crowd-1973',trackId:'picture',assetId:'heritage-photo',startSec:8,durationSec:4}
   ]},
   {id:'natural-sound',kind:'sfx',name:'Original location microphone only',clips:[
    {id:'sky-captured-audio',trackId:'natural-sound',assetId:'sky',startSec:0,durationSec:8,volume:1}
   ]},
   {id:'captions',kind:'captions',name:'Factual archive dating',clips:[
    {id:'nara-date-1973',trackId:'captions',assetId:'heritage-caption',startSec:0,durationSec:12}
   ]}
  ],
 });
 const movie=path.join(outDir,'Evercraft_Nebraska_1973_Archive_Bridge_RC04.mp4');
 const result=renderTimelineExport({project:timeline,outputPath:movie});
 // A syntactically valid subtitle asset is not evidence that the archive date is visible.
 // Inspect the left black margin at 9s for real bright, burned-in caption glyph pixels.
 const captionProbe=spawnSync('ffmpeg',['-v','error','-ss','9','-i',movie,
  '-vf','crop=490:115:15:930,format=gray','-frames:v','1','-f','rawvideo','pipe:1'],
  {encoding:null,maxBuffer:1024*1024,timeout:60000});
 const pixels=Buffer.isBuffer(captionProbe.stdout)?captionProbe.stdout:Buffer.from(captionProbe.stdout||'');
 if(captionProbe.status!==0||pixels.length!==490*115)throw Error('heritage_caption_pixels_unavailable');
 let ink=0;for(const brightness of pixels){if(brightness>160)ink++;}
 if(ink<1000)throw Error('heritage_archive_date_not_visibly_burned_in:'+ink);

 if(result.videoCodec!=='h264'||result.audioCodec!=='aac'||Math.abs(result.durationSec-12)>.12)throw Error('heritage_master_format_invalid');
 run('ffmpeg',['-v','error','-xerror','-i',movie,'-map','0:v:0','-map','0:a:0','-f','null','-']);
 const stills=[];
 for(const t of [4,8.5,10.5]){
  const file=path.join(outDir,'review-'+t.toString().replace('.','_')+'.jpg');
  run('ffmpeg',['-y','-v','error','-ss',String(t),'-i',movie,'-frames:v','1',file]);
  stills.push({t,file:path.basename(file),sha256:hash(file,'sha256')});
 }
 const receipt={schema:'evercraft.fallen.nebraska-heritage-study.v1',
  status:'private_edit_and_source_review',isReal1973GameVideo:false,is2026FootballFootage:false,
  founderApproved:false,publicationAuthorityGranted:false,
  photo:{...PD,sha1:source.sha1,bytes:source.bytes,preparation:'Letterboxed into 16:9 without cropping; static image for four seconds'},
  sky:{sourcePage:sky.source.page,originalSha1:sky.source.sha1,captureDate:'2011-08-06'},
  timeline:{schema:timeline.schema,sha256:hash(movie,'sha256'),movie:path.basename(movie),receipt:result},
  sound:{inventedCrowdAudio:false,scorePresent:false,actual2011LocationSoundUntilSec:8,
    silentPhotoFinalFourSeconds:true,audioAppearanceAuditionPending:true},
  reviewStills:stills,
  editorial:{sourceSubjectIsNebraskaFootball:true,footballVisualIsArchivalStill:true,
    dateIsVisibleByCaption:true,hasInShotActionOnArchive:false,needsCreativeReview:true,
    licensesRequireHumanConfirmation:true,publishingUnapproved:true}};
 if(!assertHeritageBoundary(receipt))throw Error('heritage_truth_boundary_failed');
 fs.writeFileSync(path.join(outDir,'native-nebraska-heritage-project.json'),JSON.stringify(timeline,null,2)+'\n');
 fs.writeFileSync(path.join(outDir,'native-nebraska-heritage-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
 fs.writeFileSync(path.join(outDir,'ATTRIBUTIONS.txt'),
  'Video: August 2011 sky in Lincoln, Nebraska by CrunchySkies. CC BY-SA 3.0. '+sky.source.page+'\n'+
  'Historic photograph: May 1973 Nebraska spring football fans, Charles O\'Rear / US EPA DOCUMERICA, National Archives ID 547323. U.S. federal government public domain. '+PD.uri+'\n'+
  'Editorial adaptations: video excerpt, original microphone recording, uncropped portrait photo framing and factual source date caption. No original sounds from 1973 survive in this cut.\n'+
  'CC BY-SA footage may impose ShareAlike obligations on an adapted derivative; rights/legal review and human film approval remain pending.\n');
 return receipt;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
 try{const dir=process.argv[2];if(!dir)throw Error('usage: node --import tsx native-nebraska-heritage-study.ts <outdir>');
  const r=renderNebraskaHeritage(dir);
  console.log(JSON.stringify({status:r.status,photoSha1:r.photo.sha1,movieSha256:r.timeline.sha256,filmDuration:r.timeline.receipt.durationSec}));}
 catch(e){console.error(String(e));process.exitCode=1;}
}
