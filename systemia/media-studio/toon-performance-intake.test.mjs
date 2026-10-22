import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {spawnSync} from 'node:child_process';
import {verifyToonPerformanceBundle} from './toon-performance-intake.mjs';
import {renderToonPoseAnimatic} from './toon-pose-animatic.mjs';
import {runwayGen45Endpoint} from './visual-provider-runway.ts';

const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?
  Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)])):x;
const digest=x=>sha(Buffer.from(JSON.stringify(stable(x))));

// Minimal generated PNG fixture: this is not approved art.
function crc32(buffer){
  let crc=0xffffffff;
  for(const b of buffer){
    crc^=b;
    for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}
function pngChunk(kind,data){
  const tag=Buffer.from(kind);
  const len=Buffer.alloc(4);len.writeUInt32BE(data.length);
  const checksum=Buffer.alloc(4);checksum.writeUInt32BE(crc32(Buffer.concat([tag,data])));
  return Buffer.concat([len,tag,data,checksum]);
}
function png(width=960,height=540,rgb=[36,49,82]){
  const header=Buffer.alloc(13);
  header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);
  header[8]=8;header[9]=2;
  const rows=Buffer.alloc(height*(width*3+1));
  for(let y=0;y<height;y++){
    const start=y*(width*3+1);
    rows[start]=0;
    for(let x=0;x<width;x++){
      const offset=start+1+x*3;
      rows[offset]=rgb[0];rows[offset+1]=rgb[1];rows[offset+2]=rgb[2];
    }
  }
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    pngChunk('IHDR',header),pngChunk('IDAT',zlib.deflateSync(rows)),pngChunk('IEND',Buffer.alloc(0)),
  ]);
}
function packet(){
  const core={
    schema:'evercraft.fallen.toon-shot-handoff.v1',state:'preproduction_work_orders_only',
    deliveryReady:false,publicationAuthority:false,boundaries:{videoRendered:false},
    frameCount:120,
    shots:[{
      id:'hero-1',visualNeedId:'need-video-1',startFrame:0,frameCount:120,
      fps:24,durationSec:5,aspectRatio:'16:9',locationId:'grove',
      action:'Listen then react',soundDirection:'One owned voice line',
      characters:[{id:'hero',name:'The Hero',lockedTraits:{hair:'auburn'},
        referenceAssetIds:['hero-frame-001','hero-frame-002','hero-frame-003'],voiceProfileId:'voice-foundry-hero',
        acting:{objective:'Find the light',physicalAction:'Look, then turn',
          face:'Surprise',gazeTarget:'Light',hands:'Maintain anatomy'}}],
      dialogue:[{id:'cue-1',speakerId:'hero',text:'Look at that light.',
        voiceProfileId:'voice-foundry-hero',emotion:'wonder'}],
    }],
  };
  return {...core,digest:digest(core)};
}
function fixture(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-toon-perf-'));
  const image=png();fs.writeFileSync(path.join(dir,'hero.png'),image);
  const r=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi',
    '-i','sine=frequency=320:duration=1.2','-ar','32000','-ac','1',
    '-c:a','pcm_s16le',path.join(dir,'line.wav')],{encoding:'utf8'});
  if(r.status!==0)throw new Error('ffmpeg_test_fixture_unavailable:'+(r.stderr||''));
  const audio=fs.readFileSync(path.join(dir,'line.wav'));
  const pkt=packet();
  const manifest={
    schema:'evercraft.fallen.toon-performance-sources.v1',
    packetDigest:pkt.digest,shotId:'hero-1',actorId:'hero',
    image:{file:'hero.png',sha256:sha(image),referenceAssetId:'hero-frame-001',
      rightsClaim:'owned',reviewState:'declared_approved',
      reviewEvidenceRef:'human-review:hero-art-001'},
    dialogueAudio:{file:'line.wav',sha256:sha(audio),cueId:'cue-1',
      text:'Look at that light.',voiceProfileId:'voice-foundry-hero',
      sourceKind:'voice_foundry_export',rightsClaim:'owned',
      reviewState:'declared_approved',reviewEvidenceRef:'human-review:voice-001'},
  };
  return {dir,pkt,manifest};
}

test('real verified source bytes route a high fidelity start-frame without a paid model call',()=>{
  const x=fixture();
  try{
    const result=verifyToonPerformanceBundle({packet:x.pkt,shotId:'hero-1',
      bundleDir:x.dir,manifest:x.manifest,
      endpoints:[runwayGen45Endpoint(true)]});
    assert.equal(result.state,'bytes_verified_creative_and_provider_admission_pending');
    assert.equal(result.identity.width,960);
    assert.equal(result.dialogue.audioDecoded,true);
    assert.ok(result.dialogue.acoustic.rms>.007);
    assert.equal(result.dialogue.acoustic.measurementOnlyNotExpressiveVoiceProof,true);
    assert.equal(result.dialogue.voiceIdentityVerified,false);
    assert.equal(result.actualProviderGeneration,false);
    assert.equal(result.providerExecutionEligible,false);
    assert.equal(result.publicationAuthority,false);
    assert.equal(result.modelPlan.status,'routed');
    assert.equal(result.modelPlan.jobs[0].references[0].locator.kind,'data_uri');
    assert.match(result.highFidelityRequest.references[0].locator.value,/^data:image\/png;base64,/);
  }finally{fs.rmSync(x.dir,{recursive:true,force:true})}
});

test('bad bytes, wrong voice, unsafe paths, fake scratch voice and unverified provider fail closed',()=>{
  const x=fixture();
  const run=manifest=>verifyToonPerformanceBundle({packet:x.pkt,shotId:'hero-1',
    bundleDir:x.dir,manifest,endpoints:[runwayGen45Endpoint()]});
  try{
    const denied=run(x.manifest);
    assert.equal(denied.modelPlan.status,'blocked');
    assert.equal(denied.publicationAuthority,false);
    assert.throws(()=>run({...x.manifest,dialogueAudio:{...x.manifest.dialogueAudio,
      sourceKind:'scratch_espeak'}}),/scratch_speech_not_accepted/);
    assert.throws(()=>run({...x.manifest,dialogueAudio:{...x.manifest.dialogueAudio,
      voiceProfileId:'other'}}),/dialogue_cue_or_voice_declaration_mismatch/);
    assert.throws(()=>run({...x.manifest,image:{...x.manifest.image,
      file:'../private.png'}}),/file_path_unsafe/);
    assert.throws(()=>run({...x.manifest,image:{...x.manifest.image,
      sha256:'b'.repeat(64)}}),/asset_sha_mismatch/);
    assert.throws(()=>run({...x.manifest,image:{...x.manifest.image,
      referenceAssetId:'not-the-character'}}),/identity_asset_unknown/);
    assert.throws(()=>run({...x.manifest,dialogueAudio:null}),/dialogue_audio_missing/);
    const silent=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y',
      '-f','lavfi','-i','anullsrc=channel_layout=mono:sample_rate=32000',
      '-t','1.2','-c:a','pcm_s16le',path.join(x.dir,'silent.wav')],{encoding:'utf8'});
    assert.equal(silent.status,0);
    const silentBytes=fs.readFileSync(path.join(x.dir,'silent.wav'));
    assert.throws(()=>run({...x.manifest,dialogueAudio:{...x.manifest.dialogueAudio,
      file:'silent.wav',sha256:sha(silentBytes)}}),/speech_audio_essentially_silent/);
    assert.throws(()=>run({...x.manifest,image:{...x.manifest.image,
      reviewState:'unreviewed'}}),/identity_review_not_declared/);
    fs.symlinkSync(path.join(x.dir,'hero.png'),path.join(x.dir,'linked.png'));
    assert.throws(()=>run({...x.manifest,image:{...x.manifest.image,
      file:'linked.png'}}),/asset_not_regular_file/);
  }finally{fs.rmSync(x.dir,{recursive:true,force:true})}
});


test('actually encodes distinct bound acting poses and the supplied recorded audio into an MP4 animatic',()=>{
  const x=fixture();
  const retain=Boolean(process.env.FALLEN_TOON_ANIMATIC_PROOF_DIR);
  const output=retain?path.resolve(process.env.FALLEN_TOON_ANIMATIC_PROOF_DIR):
    fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-toon-animatic-'));
  try{
    const phase2=png(960,540,[64,95,129]);
    const phase3=png(960,540,[142,85,109]);
    fs.writeFileSync(path.join(x.dir,'phase2.png'),phase2);
    fs.writeFileSync(path.join(x.dir,'phase3.png'),phase3);
    const pose=(id,file,hash,ref,t,beat)=>({
      id,file,sha256:hash,referenceAssetId:ref,actorId:'hero',atSec:t,
      rightsClaim:'owned',reviewState:'declared_approved',
      reviewEvidenceRef:'human-review:pose-'+id,
      performanceBeat:beat,
    });
    x.manifest.sceneFrames=[
      pose('pose-establish','hero.png',x.manifest.image.sha256,'hero-frame-001',0,
        'First hold, listening to a sound'),
      pose('pose-turn','phase2.png',sha(phase2),'hero-frame-002',1.6,
        'Head turn, looking for the source'),
      pose('pose-reaction','phase3.png',sha(phase3),'hero-frame-003',3.2,
        'Eyes widen, realizing what it is'),
    ];
    const result=renderToonPoseAnimatic({packet:x.pkt,shotId:'hero-1',
      bundleDir:x.dir,manifest:x.manifest,outDir:output});
    assert.equal(result.state,'rendered_storyboard_animatic_not_character_animation');
    assert.equal(result.frameCount,120);
    assert.equal(result.sampledPoseFrames.length,3);
    assert.equal(new Set(result.sampledPoseFrames.map(p=>p.framePixelSha256)).size,3);
    assert.equal(result.characterRigAnimated,false);
    assert.equal(result.voiceQualityApproved,false);
    assert.equal(result.publicationAuthority,false);
    assert.ok(fs.statSync(path.join(output,'animatic-review.mp4')).size>6000);
    const receipt=JSON.parse(fs.readFileSync(path.join(output,'animatic-receipt.json')));
    assert.equal(receipt.sha256,sha(fs.readFileSync(path.join(output,'animatic-review.mp4'))));
    assert.throws(()=>renderToonPoseAnimatic({packet:x.pkt,shotId:'hero-1',
      bundleDir:x.dir,manifest:{...x.manifest,sceneFrames:[
        x.manifest.sceneFrames[0],{...x.manifest.sceneFrames[1],sha256:x.manifest.sceneFrames[0].sha256},
      ]},outDir:output}),/asset_sha_mismatch/);
  }finally{
    fs.rmSync(x.dir,{recursive:true,force:true});
    if(!retain)fs.rmSync(output,{recursive:true,force:true});
  }
});

test('rejects lone identical image, forged second pose and unsafe missing dialogue before any output',()=>{
  const x=fixture();
  const output=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-toon-empty-'));
  try{
    assert.throws(()=>renderToonPoseAnimatic({packet:x.pkt,shotId:'hero-1',
      bundleDir:x.dir,manifest:x.manifest,outDir:output}),
      /approved_multi_pose_sequence_required/);
    const a={id:'pose-start',actorId:'hero',referenceAssetId:'hero-frame-001',
      file:'hero.png',sha256:x.manifest.image.sha256,atSec:0,
      rightsClaim:'owned',reviewState:'declared_approved',
      reviewEvidenceRef:'human-review:pose-start',performanceBeat:'Listen and hold'};
    const b={...a,id:'pose-end',atSec:2.4,reviewEvidenceRef:'human-review:pose-end',
      performanceBeat:'Raise eyes in surprise'};
    assert.throws(()=>verifyToonPerformanceBundle({packet:x.pkt,shotId:'hero-1',
      bundleDir:x.dir,manifest:{...x.manifest,sceneFrames:[a,b]}}),
      /pose_artwork_must_visibly_differ/);
  }finally{
    fs.rmSync(x.dir,{recursive:true,force:true});
    fs.rmSync(output,{recursive:true,force:true});
  }
});
