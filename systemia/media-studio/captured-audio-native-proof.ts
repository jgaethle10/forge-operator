/**
 * Native Fallen Studio captured-source audio canary.
 * Generated test patterns and beeps are QA fixtures ONLY, not production footage.
 * The actual compiled Studio plan must carry sound through two recorded video sources.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {compileStudioDraft, type StudioDraftPlan} from './studio-create.js';
import {renderTimelineExport} from './timeline-export.js';

const sha=(p:string)=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function run(name:string,args:string[],binary=false){
 const r=spawnSync(name,args,{encoding:binary?null:'utf8',timeout:180000,maxBuffer:7*1024*1024});
 if(r.error||r.status!==0)throw Error(name+'_failed:'+String(r.stderr||r.error?.message||r.status).slice(-800));
 return r.stdout;
}
function fixture(out:string,label:string,hue:string,frequency:number){
 const video=path.join(out,label+'.mp4');
 run('ffmpeg',['-y','-v','error','-f','lavfi','-i',`color=c=${hue}:s=320x180:r=24:d=1.5`,
  '-f','lavfi','-i',`sine=frequency=${frequency}:sample_rate=48000:duration=1.5`,
  '-t','1.5','-c:v','libx264','-preset','veryfast','-crf','24','-pix_fmt','yuv420p',
  '-c:a','aac','-b:a','128k','-ar','48000','-movflags','+faststart',video]);
 return video;
}
function rms(file:string,startSec:number){
 const pcm=run('ffmpeg',['-v','error','-ss',String(startSec),'-t','0.25','-i',file,
  '-vn','-ac','1','-ar','48000','-f','f32le','pipe:1'],true);
 const bytes=Buffer.isBuffer(pcm)?pcm:Buffer.from(pcm);
 if(bytes.length<4000)throw Error('decoded_audio_window_too_short:'+startSec);
 let power=0,n=0;
 for(let i=0;i+4<=bytes.length;i+=4){const v=bytes.readFloatLE(i);power+=v*v;n++;}
 return Number(Math.sqrt(power/n).toFixed(6));
}
export function runCapturedSourceSoundProof(outdir:string){
 fs.mkdirSync(outdir,{recursive:true});
 const a=fixture(outdir,'fixture-red','0x943b35',440);
 const b=fixture(outdir,'fixture-blue','0x244e76',880);
 const p:StudioDraftPlan={
  schema:'evercraft.fallen.studio-draft-plan.v1',
  id:'qa-captured-video-audio-sync',title:'Test only: native source-sound sync',
  prompt:'Test that captured video microphone audio is preserved, NOT a real documentary scene.',
  aspectRatio:'16:9',fps:24,continuityDigest:'qa-generated-fixtures-not-publication',
  sourceAssets:[
   {id:'a',path:a,kind:'video',rights:'owned',digest:sha(a),durationSec:1.5,
    evidenceState:'observed',sourceRefs:['qa:locally-generated-sound-picture-fixture-A']},
   {id:'b',path:b,kind:'video',rights:'owned',digest:sha(b),durationSec:1.5,
    evidenceState:'observed',sourceRefs:['qa:locally-generated-sound-picture-fixture-B']}
  ],
  scenes:[
   {id:'fixture-a',durationSec:1.5,visual:{assetId:'a',sourceRefs:['qa:fixture-a'],
    capturedAudio:{rightsRef:'qa-owned-tone-source-A'}}},
   {id:'fixture-b',durationSec:1.5,visual:{assetId:'b',sourceRefs:['qa:fixture-b'],
    capturedAudio:{rightsRef:'qa-owned-tone-source-B'}}}
  ]
 };
 const bundle=compileStudioDraft(p);
 const picture=bundle.project.tracks.find(t=>t.kind==='video')!.clips;
 const audio=bundle.project.tracks.find(t=>t.kind==='sfx')!.clips;
 assert.equal(picture.length,2);assert.equal(audio.length,2);
 assert.deepEqual(picture.map(t=>t.startSec),audio.map(t=>t.startSec));
 assert.deepEqual(picture.map(t=>t.assetId),audio.map(t=>t.assetId));
 assert.equal(bundle.productionNeeds.length,0);
 assert.equal(bundle.boundaries.publicationAuthorityGranted,false);
 const movie=path.join(outdir,'Native_Fallen_Captured_Source_Audio_QA.mp4');
 const receipt=renderTimelineExport({project:bundle.project,outputPath:movie});
 if(receipt.videoCodec!=='h264'||receipt.audioCodec!=='aac'||Math.abs(receipt.durationSec-3)>.15)
  throw Error('native_captured_source_sound_master_invalid');
 const first=rms(movie,.45),second=rms(movie,2.0);
 if(first<.01||second<.01)throw Error('recorded_source_sound_missing_after_cut:'+first+':'+second);
 run('ffmpeg',['-v','error','-xerror','-i',movie,'-f','null','-']);
 const data={schema:'evercraft.fallen.captured-video-source-audio-proof.v1',
  status:'tested_native_export',sourceType:'generated_qa_fixtures_not_film',
  sha256:sha(movie),durationSec:receipt.durationSec,
  sourceAudioAtSec045:first,sourceAudioAtSec200:second,
  sourceAudioBoundToPicture:true,sourceDigestsVerified:true,publicationAuthorityGranted:false};
 fs.writeFileSync(path.join(outdir,'receipt.json'),JSON.stringify(data,null,2)+'\n');
 return data;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
 try{
  const outdir=process.argv[2]||fs.mkdtempSync(path.join(os.tmpdir(),'fallen-captured-audio-'));
  console.log(JSON.stringify(runCapturedSourceSoundProof(outdir)));
 }catch(e){console.error(String(e));process.exitCode=1;}
}
