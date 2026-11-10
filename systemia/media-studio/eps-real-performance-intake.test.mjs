import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {buildEPSRealFilmBrief,createEPSRealFilmIntake} from './eps-real-performance-intake.mjs';
const SPECS=[
 ['site-first-look',5,true],['crew-response',4,true],['clear-the-space',5,false],
 ['work-the-detail',5,false],['reveal-the-work',7,false],['moving-signoff',4,false]
];
function sample(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eps-real-video-intake-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const clips=SPECS.map(([sceneId,seconds,speech],i)=>{
  const file=path.join(dir,sceneId+'.mp4');
  const args=['-nostdin','-y','-v','error','-f','lavfi','-i','testsrc2=size=640x360:rate=24:duration='+(seconds+.3)];
  if(speech)args.push('-f','lavfi','-i','sine=frequency='+(330+i*120)+':sample_rate=48000:duration='+(seconds+.3));
  args.push('-vf','drawbox=x='+(i*30)+':y=30:w=25:h=35:color=red:t=fill',
    '-c:v','mpeg4','-q:v','14','-t',String(seconds+.3));
  if(speech)args.push('-c:a','aac');
  else args.push('-an');
  args.push(file);
  const run=spawnSync('ffmpeg',args,{encoding:'utf8',timeout:45000});
  assert.equal(run.status,0,run.stderr||String(run.error));
  return {sceneId,path:file,mediaType:'real_recorded_video',rights:'owned',
   motionVerifiedByHuman:true,commercialUseApproved:true,epsJobRef:'private-test-job-001',
   clientJobPermissionRef:'fixture-approval',propertyFilmingPermissionRef:'fixture-property-permission',
   personConsentRef:'fixture-performer-consent',sourceRefs:['fixture-only:'+sceneId],
   reviewRefs:['synthetic-test-not-real-consent'],
   observedSubjects:speech?['speaking-human','visible-human-action']:['visible-human-action']};
 });
 return {dir,manifest:{schema:'evercraft.eps.real-performance-intake.v1',
  productionId:'eps-private-technical-test-001',actualEPSJobRef:'private-test-job-001',
  verifiedEstimateUrl:'https://example.com/fictional-test-estimate',
  clips}};
}
test('six actual moving encoded source files and embedded on-camera audio create a governed 30s EPS intake', {timeout:180000},t=>{
 const {dir,manifest}=sample(t);
 const {brief,ledger,needed}=buildEPSRealFilmBrief(manifest);
 assert.equal(brief.creativeStandard,'relay-floor-v1');
 assert.equal(brief.scenes.reduce((n,s)=>n+s.durationSec,0),30);
 assert.equal(brief.scenes.filter(s=>s.onScreenDialogue).length,2);
 assert.equal(needed.finishedCommercial,false);
 assert.equal(ledger.length,6);
 const result=createEPSRealFilmIntake(manifest,path.join(dir,'nested','receipt'));
 assert.equal(result.shots,6);
 assert.equal(result.finalCommercialReady,false);
 const plan=JSON.parse(fs.readFileSync(path.join(result.outputDir,'source-first-plan.json'),'utf8'));
 assert.equal(plan.motionObservations.length,6);
 assert.equal(plan.motionObservations.filter(x=>x.hasEmbeddedAudio).length,2);
 assert.equal(plan.releaseGates.publicationAuthority,false);
 assert.equal(plan.sabanInventory.jobs.length,6);
 assert.throws(()=>createEPSRealFilmIntake(manifest,result.outputDir),/output_already_exists/);
 // Rights, identity and missing-audio changes must fail closed independently.
 const one=manifest.clips[0];
 const permission=one.personConsentRef;delete one.personConsentRef;
 assert.throws(()=>buildEPSRealFilmBrief(manifest),/performer_consent/);
 one.personConsentRef=permission;
 one.epsJobRef='unrelated-yard-job';
 assert.throws(()=>buildEPSRealFilmBrief(manifest),/inconsistent_job_proof/);
 one.epsJobRef=manifest.actualEPSJobRef;
 one.mediaType='photo_to_video';
 assert.throws(()=>buildEPSRealFilmBrief(manifest),/actual_physical_action_unreviewed/);
 one.mediaType='real_recorded_video';
 const mute=manifest.clips[2];[one.path,mute.path]=[mute.path,one.path];
 assert.throws(()=>createEPSRealFilmIntake(manifest,path.join(dir,'should-not-exist')),/live_dialogue_audio_stream_missing/);
 assert.equal(fs.existsSync(path.join(dir,'should-not-exist')),false);
});
