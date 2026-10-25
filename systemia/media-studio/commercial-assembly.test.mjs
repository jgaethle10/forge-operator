import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {compileApprovedCommercial,renderApprovedCommercial} from './commercial-assembly.mjs';

function ffmpeg(args){
  const r=spawnSync('ffmpeg',['-nostdin','-hide_banner','-v','error',...args],{encoding:'utf8',maxBuffer:2*1024*1024});
  if(r.error||r.status!==0)throw new Error(String(r.error?.message||r.stderr));
}
function sha(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function approval(file,overrides={}){
  return {path:file,sha256:sha(file),rights:'owned',sourceRefs:['approved-fixture:'+path.basename(file)],
    reviewRefs:['fixture-owner-review'],...overrides};
}
function specimen(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-approved-commercial-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const sources=[];
  for(let i=0;i<3;i++){
    const file=path.join(dir,'source-'+i+'.mp4');
    ffmpeg(['-y','-f','lavfi','-i','testsrc2=size=320x180:rate=30,drawbox=x='+(i*20)+':y=25:w=18:h=12:color=white:t=fill',
      '-t','1.1','-an','-c:v','mpeg4','-q:v','8',file]);
    sources.push({id:'v'+i,path:file,sha256:sha(file),mediaKind:'video',
      rights:'owned',evidenceState:'observed',
      sourceRefs:['fixture-video:'+i],subjects:['action-'+i]});
  }
  const voices=[];
  const lines=['A cleaner place.','Details make the difference.','Book your next clean.'];
  for(let i=0;i<3;i++){
    const file=path.join(dir,'voice-'+i+'.wav');
    ffmpeg(['-y','-f','lavfi','-i','sine=frequency='+(330+i*80)+':sample_rate=48000',
      '-t','.72','-af','volume=0.22','-c:a','pcm_s16le',file]);
    voices.push({...approval(file),sceneId:'beat'+i,scriptText:lines[i],
      voiceProfileId:'locked-demo-voice',durationSec:.72,offsetSec:.1});
  }
  const music=path.join(dir,'score.wav');
  ffmpeg(['-y','-f','lavfi','-i','sine=frequency=185:sample_rate=48000',
    '-t','3.1','-af','volume=0.07','-c:a','pcm_s16le',music]);
  const sound=path.join(dir,'wipe.wav');
  ffmpeg(['-y','-f','lavfi','-i','sine=frequency=660:sample_rate=48000',
    '-t','.25','-af','volume=0.12','-c:a','pcm_s16le',sound]);
  const captions=path.join(dir,'captions.srt');
  fs.writeFileSync(captions,'1\n00:00:00,000 --> 00:00:01,000\nA cleaner place.\n\n2\n00:00:01,000 --> 00:00:02,000\nDetails make the difference.\n\n3\n00:00:02,000 --> 00:00:03,000\nBook your next clean.\n');
  const brief={schema:'evercraft.fallen.commercial-brief.v1',id:'specimen-001',brand:'Test Cleaning',
    audience:'test audience',offer:'Request an estimate',durationSec:3,formats:['16:9'],
    sourceAssets:sources,scenes:sources.map((asset,i)=>({
      id:'beat'+i,beat:i===0?'hook':i===2?'cta':'proof',assetId:asset.id,
      durationSec:1,intent:'Show the subject action '+i,
      mustShowSubjects:['action-'+i],voiceLine:lines[i],
      voiceMood:'naturally spoken',scoreEnergy:.25+i*.2,scoreMood:'warmth',
      sfxCues:i===1?[{atSec:.5,description:'wipe contact'}]:[]
    }))};
  return {dir,input:{schema:'evercraft.fallen.commercial-assembly.v1',
    brief,format:'16:9',fps:30,destinations:['youtube'],title:'Test Cleaning',
    approvedAudio:{voices,music:approval(music),
      sfx:[{...approval(sound),sceneId:'beat1',atSec:1.5,durationSec:.25}],
      captions:approval(captions)}}};
}
test('creates editable video, voice, music, sound and captions tracks from actual hashed files',t=>{
  const {input}=specimen(t);
  const plan=compileApprovedCommercial(input);
  assert.equal(plan.status,'ready_to_render_not_creatively_approved_by_system');
  assert.equal(plan.deliveryRequest.qualityMode,'commercial');
  assert.deepEqual(plan.deliveryRequest.project.tracks.map(x=>x.kind),
    ['video','voice','music','sfx','captions']);
  assert.equal(plan.deliveryRequest.project.tracks[0].clips.length,3);
  assert.equal(plan.deliveryRequest.project.tracks[1].clips.length,3);
  assert.equal(plan.deliveryRequest.project.tracks[3].clips[0].startSec,1.5);
  assert.equal(plan.deliveryRequest.project.audioMaster.targetLufs,-16);
  assert.equal(plan.gates.publicationAuthorityGranted,false);
  assert.equal(plan.gates.humanListeningVerifiedBySystem,false);
});
test('rejects false audio rights, tampered voice, wrong script and unlocked identity',t=>{
  const {input}=specimen(t);
  input.approvedAudio.voices[0].rights='unknown';
  assert.throws(()=>compileApprovedCommercial(input),/rights_missing/);
  input.approvedAudio.voices[0].rights='owned';
  input.approvedAudio.voices[0].scriptText='an unrelated line';
  assert.throws(()=>compileApprovedCommercial(input),/script_mismatch/);
  input.approvedAudio.voices[0].scriptText=input.brief.scenes[0].voiceLine;
  input.approvedAudio.voices[0].voiceProfileId='';
  assert.throws(()=>compileApprovedCommercial(input),/identity_unlocked/);
  input.approvedAudio.voices[0].voiceProfileId='locked';
  fs.appendFileSync(input.approvedAudio.voices[0].path,'tampered');
  assert.throws(()=>compileApprovedCommercial(input),/hash_mismatch/);
});
test('missing or unapproved music, SFX, and captions cannot masquerade as customer-ready',t=>{
  const {input}=specimen(t);
  const originalSfx=input.approvedAudio.sfx[0];
  input.approvedAudio.sfx=[];
  assert.throws(()=>compileApprovedCommercial(input),/sfx_cue_count_mismatch/);
  input.approvedAudio.sfx=[originalSfx];
  const cap=input.approvedAudio.captions;
  input.approvedAudio.captions=undefined;
  assert.throws(()=>compileApprovedCommercial(input),/captions_required/);
  input.approvedAudio.captions=cap;
  input.approvedAudio.music.reviewRefs=[];
  assert.throws(()=>compileApprovedCommercial(input),/review_evidence_missing/);
});
test('renders a playable H264/AAC MP4 and requires encoded commercial audio QC', {timeout:180000},t=>{
  const {dir,input}=specimen(t);
  const result=renderApprovedCommercial(input,path.join(dir,'deliver'));
  assert.equal(result.status,'rendered_and_technically_qc_accepted');
  assert.equal(result.qualityMode,'commercial');
  assert.equal(result.boundaries.platformPublished,false);
  assert.equal(result.boundaries.publicationAuthorityGranted,false);
  assert.ok(fs.statSync(result.videoPath).size>4000);
  const qc=JSON.parse(fs.readFileSync(result.audioQcReceiptPath,'utf8'));
  const manifest=JSON.parse(fs.readFileSync(result.clipManifestPath,'utf8'));
  assert.equal(qc.status,'accepted');
  assert.equal(qc.sha256,result.mediaSha256);
  assert.equal(manifest.media.sha256,result.mediaSha256);
  assert.equal(manifest.provenance.commercialAudioQcReceiptPath,result.audioQcReceiptPath);
  assert.equal(manifest.boundaries.publicationAuthorityGranted,false);
});
