#!/usr/bin/env node
// EPS: ingest actual owner-cleared, speaking crew/jobsite footage into Fallen.
// Fail closed on missing original bytes, picture motion, natural recorded speech,
// mismatched job evidence, or permissions. Does not authorize publishing.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {writeCommercialPlan} from './commercial-shotlist.mjs';

const SHOTS=Object.freeze([
 {id:'site-first-look',beat:'hook',seconds:5,subject:'speaking-human',speech:"There's some work to do out here.",energy:.14,mood:'observational, curious',sfx:'gate latch and outdoor room tone'},
 {id:'crew-response',beat:'problem',seconds:4,subject:'speaking-human',speech:"Alright. Let's get after it.",energy:.32,mood:'quiet confidence',sfx:'boots on gravel'},
 {id:'clear-the-space',beat:'proof',seconds:5,subject:'visible-human-action',energy:.66,mood:'physical rhythm enters',sfx:'actual rake and leaf contact'},
 {id:'work-the-detail',beat:'proof',seconds:5,subject:'visible-human-action',energy:.83,mood:'physical rhythmic peak',sfx:'real hand tools and work impacts'},
 {id:'reveal-the-work',beat:'transformation',seconds:7,subject:'visible-human-action',energy:.58,mood:'emotion opens without generic riser',sfx:'natural quiet after equipment stops'},
 {id:'moving-signoff',beat:'cta',seconds:4,subject:'visible-human-action',speech:'Evercraft Property Services. Your property, taken care of.',energy:.28,mood:'original warm resolving cadence',sfx:'gentle location ambience tail'}
]);
const nonempty=(s)=>typeof s==='string'&&s.trim().length>0;
function must(s,reason){if(!nonempty(s))throw new Error('eps_source_'+reason+'_missing');return s.trim();}
function refs(v,reason){if(!Array.isArray(v)||!v.length||v.some(x=>!nonempty(x)))throw new Error('eps_source_'+reason+'_missing');return v.map(x=>x.trim());}
function digest(p){const fd=fs.openSync(p,'r'),h=crypto.createHash('sha256'),buf=Buffer.allocUnsafe(1024*1024);try{for(;;){const n=fs.readSync(fd,buf,0,buf.length,null);if(!n)break;h.update(buf.subarray(0,n));}}finally{fs.closeSync(fd)}return h.digest('hex')}
export function buildEPSRealFilmBrief(manifest){
 if(manifest?.schema!=='evercraft.eps.real-performance-intake.v1')throw new Error('eps_source_schema_invalid');
 if(!/^[a-z0-9][a-z0-9-]{2,64}$/.test(String(manifest.productionId||'')))throw new Error('eps_source_production_id_invalid');
 must(manifest.actualEPSJobRef,'single_actual_job');
 must(manifest.verifiedEstimateUrl,'estimate_url');
 if(!/^https:\/\//i.test(manifest.verifiedEstimateUrl))throw new Error('eps_source_estimate_url_not_https');
 if(!Array.isArray(manifest.clips)||manifest.clips.length!==SHOTS.length)throw new Error('eps_source_six_real_clips_required');
 const byId=new Map(manifest.clips.map(c=>[c?.sceneId,c]));
 if(byId.size!==SHOTS.length||SHOTS.some(s=>!byId.has(s.id)))throw new Error('eps_source_missing_or_duplicate_shot');
 const assets=[],scenes=[],ledger=[],seen=new Set(),banned=new Set(manifest.excludedPreviousAssetDigests||[]);
 for(const shot of SHOTS){
  const row=byId.get(shot.id);
  must(row.path,'path:'+shot.id);
  const p=path.resolve(row.path);
  if(!fs.existsSync(p)||!fs.statSync(p).isFile())throw new Error('eps_source_actual_video_missing:'+shot.id);
  const sha256=digest(p);
  if(seen.has(sha256)||banned.has(sha256))throw new Error('eps_source_recycled_or_duplicate_footage:'+shot.id);
  seen.add(sha256);
  if(row.mediaType!=='real_recorded_video'||row.motionVerifiedByHuman!==true)throw new Error('eps_source_actual_physical_action_unreviewed:'+shot.id);
  if(!['owned','licensed'].includes(row.rights)||row.commercialUseApproved!==true)throw new Error('eps_source_commercial_use_unapproved:'+shot.id);
  if(row.epsJobRef!==manifest.actualEPSJobRef)throw new Error('eps_source_inconsistent_job_proof:'+shot.id);
  must(row.clientJobPermissionRef,'client_job_permission:'+shot.id);
  must(row.propertyFilmingPermissionRef,'property_filming_permission:'+shot.id);
  const sourceRefs=refs(row.sourceRefs,'provenance:'+shot.id);
  const reviewRefs=refs(row.reviewRefs,'rights_review:'+shot.id);
  const subjects=refs(row.observedSubjects,'subjects:'+shot.id);
  const need=[shot.subject,...(shot.speech&&shot.id!=='moving-signoff'?['visible-human-action']:[])];
  if(need.some(subject=>!subjects.includes(subject)))throw new Error('eps_source_required_subject_unreviewed:'+shot.id);
  const hasPeople=subjects.includes('visible-human-action')||subjects.includes('speaking-human');
  if(hasPeople)must(row.personConsentRef,'performer_consent:'+shot.id);
  const id='eps-'+shot.id;
  const asset={id,path:p,sha256,mediaKind:'video',rights:row.rights,evidenceState:'observed',
   sourceRefs:[...sourceRefs,...reviewRefs.map(x=>'review:'+x),'job:'+manifest.actualEPSJobRef],
   subjects,motionType:'physical_action',footageClass:'verified_eps_project'};
  assets.push(asset);
  const scene={id:shot.id,beat:shot.beat,durationSec:shot.seconds,assetId:id,
   intent:'Observed EPS property work on documented job '+manifest.actualEPSJobRef+'; '+shot.id.replaceAll('-',' '),
   mustShowSubjects:need,scoreEnergy:shot.energy,scoreMood:shot.mood,
   sfxCues:[{atSec:.6,description:shot.sfx}]};
  if(shot.speech){
   scene.voiceLine=shot.speech;
   scene.voiceMood=shot.id==='moving-signoff'?'conversational, intimate signature voice with restrained confidence':'natural real crew speech, no announcer accent or overdub';
   if(shot.id!=='moving-signoff'){
    scene.onScreenDialogue={text:shot.speech,syncAudioAssetRef:id,performerUseConsentRef:row.personConsentRef};
   }
  }
  scenes.push(scene);
  ledger.push({sceneId:shot.id,path:p,sha256,epsJobRef:manifest.actualEPSJobRef,
   rights:row.rights,clientJobPermissionRef:row.clientJobPermissionRef,
   propertyFilmingPermissionRef:row.propertyFilmingPermissionRef,
   personConsentRef:row.personConsentRef||null,sourceRefs,reviewRefs,
   humanPictureAndRightsReviewStillRequired:true});
 }
 const brief={schema:'evercraft.fallen.commercial-brief.v1',id:manifest.productionId,
  brand:'Evercraft Property Services',audience:'Yakima Valley homeowners and property managers',
  offer:'Request an estimate: '+manifest.verifiedEstimateUrl,durationSec:30,
  formats:['9:16','16:9'],creativeStandard:'relay-floor-v1',
  sourceAssets:assets,scenes,excludedPreviousAssetDigests:[...banned],
  audioDirection:{dialogue:'on-camera recorded conversation with matched local sound',
   score:'original composed music with lift and resolving motif, not a single repeating loop',
   foley:'distinct real location sync sounds in separate stems',
   ambience:'recorded natural outdoor room tone',
   voicePerformanceDirection:'three auditions for final narration; natural speech, emotional restraint',
   mixDirection:'preserve transient space; duck score under speech; phone speaker audition and cinematic final loudness-range check'}};
 return {brief,ledger,needed:{
  schema:'evercraft.eps.production-needs.v1',status:'preproduction_only_not_master',
  onScreenDialogues:scenes.filter(s=>s.onScreenDialogue).map(s=>({sceneId:s.id,line:s.voiceLine,sourceVideoId:s.assetId})),
  narration:{sceneId:'moving-signoff',script:scenes.at(-1).voiceLine,status:'not_recorded_or_approved'},
  audioStems:['dialogue','original_score','sync_foley','outdoor_ambience'],
  stillNeeded:['independent_picture_validation','independent_rights_validation','performance_and_music_auditions','real_multistem_mix','final_client_review'],
  published:false,finishedCommercial:false
 }};
}
export function createEPSRealFilmIntake(manifest,outDir){
 const {brief,ledger,needed}=buildEPSRealFilmBrief(manifest);
 const dest=path.resolve(outDir);
 if(fs.existsSync(dest))throw new Error('eps_source_output_already_exists');
 const temp=fs.mkdtempSync(dest+'.tmp-');
 try{
  const plan=writeCommercialPlan(brief,temp);
  fs.writeFileSync(path.join(temp,'eps-brief.json'),JSON.stringify(brief,null,2)+'\n',{flag:'wx'});
  fs.writeFileSync(path.join(temp,'source-rights-ledger.json'),JSON.stringify(ledger,null,2)+'\n',{flag:'wx'});
  fs.writeFileSync(path.join(temp,'creative-needs.json'),JSON.stringify(needed,null,2)+'\n',{flag:'wx'});
  fs.writeFileSync(path.join(temp,'intake-receipt.json'),JSON.stringify({
   schema:'evercraft.eps.source-intake-receipt.v1',productionId:manifest.productionId,
   sourceFirstPlanDigest:plan.planDigest,verifiedVideoFiles:ledger.length,
   nativeOnCameraSpeechSources:2,
   independentRightsAndHumanPerformanceReviewPending:true,
   soundMixApproved:false,finalVideoRendered:false,publicationAuthorized:false
  },null,2)+'\n',{flag:'wx'});
  fs.renameSync(temp,dest);
  return {status:'real_sources_intaken_for_creative_review',outputDir:dest,
   shots:ledger.length,planDigest:plan.planDigest,finalCommercialReady:false};
 }catch(e){fs.rmSync(temp,{recursive:true,force:true});throw e}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{const [manifestFile,outDir]=process.argv.slice(2);if(!manifestFile||!outDir)throw new Error('Usage: node eps-real-performance-intake.mjs <manifest.json> <new-output-directory>');
  console.log(JSON.stringify(createEPSRealFilmIntake(JSON.parse(fs.readFileSync(manifestFile,'utf8')),outDir),null,2));
 }catch(e){console.error(String(e.message||e));process.exitCode=2}
}
