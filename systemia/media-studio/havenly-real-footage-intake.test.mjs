import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {preflightHavenlyIntake,createHavenlyProductionIntake} from './havenly-real-footage-intake.mjs';

const ids=['arrival','counter','water','bedding','room-reveal','care-detail','ending'];
function ffmpeg(args){
 const x=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-y',...args],{encoding:'utf8'});
 if(x.error||x.status!==0)throw new Error(x.error?.message||x.stderr);
}
function specimen(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'havenly-real-intake-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const clips=ids.map((sceneId,i)=>{
  const file=path.join(dir,sceneId+'.mp4');
  ffmpeg(['-f','lavfi','-i','testsrc2=size=320x180:rate=24',
    '-vf','drawbox=x='+String((i+1)*28)+':y=30:w=21:h=18:color=white:t=fill',
    '-t','5.25','-an','-c:v','mpeg4','-q:v','9',file]);
  return {sceneId,path:file,mediaType:'real_recorded_video',
    rights:'owned',commercialUseApproved:true,propertyFilmingPermission:true,
    peopleVisible:false,containsNikki:false,representsHavenlyJob:false,
    sourceRefs:['ci:source:'+sceneId],reviewRefs:['ci:declared-approval:'+sceneId]};
 });
 return {dir,input:{schema:'evercraft.havenly.live-footage-intake.v1',
    productionId:'havenly-test-v2',clips}};
}
test('seven truly present hashed and declared videos become one 30-second source-first production package',{timeout:90000},t=>{
 const {dir,input}=specimen(t),outDir=path.join(dir,'plan');
 const first=preflightHavenlyIntake(input);
 assert.equal(first.brief.durationSec,30);
 assert.equal(first.brief.scenes.length,7);
 assert.equal(first.ledger.length,7);
 assert.equal(first.needs.voiceTakes.length,2);
 assert.equal(first.needs.sfx.length,4);
 assert.match(first.captions,/00:00:22,000 --> 00:00:26,000/);
 assert.match(first.captions,/00:00:26,000 --> 00:00:30,000/);
 const produced=createHavenlyProductionIntake(input,outDir);
 assert.equal(produced.shots,7);
 assert.equal(produced.publicationAuthorityGranted,false);
 const plan=JSON.parse(fs.readFileSync(path.join(outDir,'source-first-plan.json'),'utf8'));
 const receipt=JSON.parse(fs.readFileSync(path.join(outDir,'production-intake-receipt.json'),'utf8'));
 assert.equal(plan.timeline.length,7);
 assert.equal(plan.voiceTakes.length,2);
 assert.equal(plan.sabanInventory.jobs.length,7);
 assert.equal(receipt.outputReadyForAudioAssembly,false);
 assert.equal(receipt.reviewRightsDeclarationsIndependentlyAuthenticated,false);
 assert.equal(new Set(first.ledger.map(x=>x.sha256)).size,7);
 assert.throws(()=>createHavenlyProductionIntake(input,outDir),/output_already_exists/);
});
test('hard block absent real video, repeated hero file, previous commercial footage and too-short source',{timeout:90000},t=>{
 const {input}=specimen(t);
 input.clips[0].path='/a/file/that/does/not/exist.mp4';
 assert.throws(()=>preflightHavenlyIntake(input),/media_missing/);
 input.clips[0].path=input.clips[1].path;
 assert.throws(()=>preflightHavenlyIntake(input),/repeated_hero_source/);
 const a=crypto.createHash('sha256').update(fs.readFileSync(input.clips[1].path)).digest('hex');
 input.excludedPreviousAssetDigests=[a];
 assert.throws(()=>preflightHavenlyIntake(input),/previous_commercial_footage_reused/);
});
test('reject unapproved commercial usage, property access, people and Nikki likeness',{timeout:90000},t=>{
 const {input}=specimen(t),x=input.clips[2];
 x.commercialUseApproved=false;
 assert.throws(()=>preflightHavenlyIntake(input),/commercial_and_property_permission_required/);
 x.commercialUseApproved=true;x.propertyFilmingPermission=false;
 assert.throws(()=>preflightHavenlyIntake(input),/commercial_and_property_permission_required/);
 x.propertyFilmingPermission=true;x.peopleVisible=true;
 assert.throws(()=>preflightHavenlyIntake(input),/visible_person_consent_required/);
 x.personConsentApproved=true;x.containsNikki=true;
 assert.throws(()=>preflightHavenlyIntake(input),/nikki_portrait_permission_required/);
 x.nikkiLikenessPermission=true;x.representsHavenlyJob=true;
 assert.throws(()=>preflightHavenlyIntake(input),/actual_job_claim_unapproved/);
 x.clientJobRepresentationPermission=true;x.mediaType='synthetic_visualization';
 assert.throws(()=>preflightHavenlyIntake(input),/live_action_source_required/);
});
test('missing one scene and unverified source references cannot be disguised as a complete ad',{timeout:90000},t=>{
 const {input}=specimen(t);
 input.clips.pop();
 assert.throws(()=>preflightHavenlyIntake(input),/required_seven_real_clips/);
 input.clips.push({...input.clips[0],sceneId:'ending'});
 assert.throws(()=>preflightHavenlyIntake(input),/repeated_hero_source/);
 input.clips[input.clips.length-1].path=path.join(path.dirname(input.clips[0].path),'ending.mp4');
 input.clips[0].reviewRefs=[];
 assert.throws(()=>preflightHavenlyIntake(input),/source_refs_missing/);
});
