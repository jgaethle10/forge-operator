#!/usr/bin/env node
// HAVENLY: real-footage intake to source-first Fallen production, not video generation.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {writeCommercialPlan} from './commercial-shotlist.mjs';

const SCENES=Object.freeze([
 {id:'arrival',beat:'hook',durationSec:4,subject:'door-key-arrival',intent:'A real door opens, keys settle on a surface; capture genuine room tone',scoreEnergy:.1,scoreMood:'quietly welcoming',sfxCues:[{atSec:2,description:'real key contact'}]},
 {id:'counter',beat:'proof',durationSec:4,subject:'cleaner-counter-action',intent:'Observed hand and cloth wipe a kitchen surface in continuous actual cleaning work',scoreEnergy:.22,scoreMood:'warm felt piano',sfxCues:[{atSec:1,description:'cloth contact on real counter'}]},
 {id:'water',beat:'proof',durationSec:4,subject:'running-water-detail',intent:'Real water moving through a sink, not a simulated liquid effect',scoreEnergy:.34,scoreMood:'intimate piano with natural water',sfxCues:[{atSec:.6,description:'original water foley'}]},
 {id:'bedding',beat:'transformation',durationSec:5,subject:'bedding-fabric-action',intent:'Real bedding pulled into place with uninterrupted fabric movement',scoreEnergy:.47,scoreMood:'felt piano joined by soft strings',sfxCues:[{atSec:1,description:'original bedding fabric rustle'}]},
 {id:'room-reveal',beat:'transformation',durationSec:5,subject:'finished-room-reveal',intent:'Genuine finished room with natural daylight and unaltered condition',scoreEnergy:.64,scoreMood:'warm strings broaden without artificial riser',sfxCues:[]},
 {id:'care-detail',beat:'proof',durationSec:4,subject:'real-team-or-work-detail',intent:'Actual cleaning team hands or work detail; do not depict Nikki without separate express likeness approval',scoreEnergy:.60,scoreMood:'soft melodic resolution',voiceLine:'Come home to a space that feels cared for.',voiceMood:'human, intimate, unhurried, emotionally sincere',sfxCues:[]},
 {id:'ending',beat:'cta',durationSec:4,subject:'natural-home-ending',intent:'Real interior hold for Havenly logo and contact information to be added after brand review',scoreEnergy:.32,scoreMood:'natural piano cadence and decay',voiceLine:'Havenly Cleaning. Come home to a haven.',voiceMood:'warm, calm, clear brand signature',sfxCues:[]}
]);
const REQUIRED_FORMATS=['9:16','1:1','16:9'];
function hashFile(file){
 const hash=crypto.createHash('sha256'),fd=fs.openSync(file,'r'),buffer=Buffer.allocUnsafe(1024*1024);
 try{while(true){const n=fs.readSync(fd,buffer,0,buffer.length,null);if(!n)break;hash.update(buffer.subarray(0,n));}}
 finally{fs.closeSync(fd);}
 return hash.digest('hex');
}
function probeVideo(file){
 const r=spawnSync('ffprobe',['-v','error','-show_format','-show_streams','-of','json',file],{encoding:'utf8',maxBuffer:2*1024*1024});
 if(r.error||r.status!==0)throw new Error('havenly_video_probe_failed');
 let parsed;try{parsed=JSON.parse(r.stdout);}catch{throw new Error('havenly_video_probe_invalid');}
 const stream=(parsed.streams||[]).find(x=>x.codec_type==='video');
 if(!stream||!Number.isFinite(Number(parsed.format?.duration)))throw new Error('havenly_video_stream_missing');
 return {durationSec:Number(parsed.format.duration),width:stream.width,height:stream.height,codec:stream.codec_name};
}
function requireRefArray(value,context){
 if(!Array.isArray(value)||!value.length||value.some(x=>typeof x!=='string'||!x.trim()))
  throw new Error('havenly_source_refs_missing:'+context);
 return [...new Set(value)];
}
function secondsSrt(t){
 const sec=Math.floor(t%60),min=Math.floor(t/60)%60,hour=Math.floor(t/3600);
 return [hour,min,sec].map(v=>String(v).padStart(2,'0')).join(':')+',000';
}
export function preflightHavenlyIntake(manifest){
 if(manifest?.schema!=='evercraft.havenly.live-footage-intake.v1')
  throw new Error('havenly_intake_schema_invalid');
 if(typeof manifest.productionId!=='string'||! /^[a-z0-9][a-z0-9-]{2,60}$/.test(manifest.productionId))
  throw new Error('havenly_production_id_invalid');
 if(!Array.isArray(manifest.clips)||manifest.clips.length!==SCENES.length)
  throw new Error('havenly_required_seven_real_clips');
 const byId=new Map(manifest.clips.map(x=>[x?.sceneId,x]));
 if(byId.size!==SCENES.length||SCENES.some(x=>!byId.has(x.id)))
  throw new Error('havenly_missing_or_duplicate_scene');
 const prior=new Set(manifest.excludedPreviousAssetDigests||[]);
 const used=new Set(),assets=[],scenes=[],ledger=[];
 for(const scene of SCENES){
  const row=byId.get(scene.id);
  if(typeof row.path!=='string'||!row.path.trim())throw new Error('havenly_media_path_missing:'+scene.id);
  const p=path.resolve(row.path);
  if(!fs.existsSync(p)||!fs.statSync(p).isFile())throw new Error('havenly_real_media_missing:'+scene.id);
  const digest=hashFile(p);
  if(prior.has(digest))throw new Error('havenly_previous_commercial_footage_reused:'+scene.id);
  if(used.has(digest))throw new Error('havenly_repeated_hero_source:'+scene.id);
  used.add(digest);
  const probe=probeVideo(p);
  if(probe.durationSec+0.03<scene.durationSec)throw new Error('havenly_clip_too_short:'+scene.id);
  if(row.mediaType!=='real_recorded_video')throw new Error('havenly_live_action_source_required:'+scene.id);
  if(row.rights!=='owned'&&row.rights!=='licensed')throw new Error('havenly_rights_not_declared:'+scene.id);
  if(row.commercialUseApproved!==true||row.propertyFilmingPermission!==true)
    throw new Error('havenly_commercial_and_property_permission_required:'+scene.id);
  if(row.peopleVisible===true&&row.personConsentApproved!==true)
    throw new Error('havenly_visible_person_consent_required:'+scene.id);
  if(row.containsNikki===true&&row.nikkiLikenessPermission!==true)
    throw new Error('havenly_nikki_portrait_permission_required:'+scene.id);
  if(row.representsHavenlyJob===true&&row.clientJobRepresentationPermission!==true)
    throw new Error('havenly_actual_job_claim_unapproved:'+scene.id);
  const refs=requireRefArray(row.sourceRefs,scene.id);
  const consent=requireRefArray(row.reviewRefs,scene.id);
  const aid='havenly-'+scene.id;
  const subject=scene.subject;
  assets.push({id:aid,path:p,sha256:digest,mediaKind:'video',rights:row.rights,
    evidenceState:'observed',sourceRefs:[...refs,...consent.map(x=>'rights-review:'+x)],subjects:[subject]});
  scenes.push({id:scene.id,beat:scene.beat,durationSec:scene.durationSec,
    assetId:aid,intent:scene.intent,mustShowSubjects:[subject],
    scoreEnergy:scene.scoreEnergy,scoreMood:scene.scoreMood,
    ...(scene.voiceLine?{voiceLine:scene.voiceLine,voiceMood:scene.voiceMood}:{}),
    sfxCues:scene.sfxCues});
  ledger.push({sceneId:scene.id,sourcePath:p,sha256:digest,
    durationSec:probe.durationSec,codec:probe.codec,width:probe.width,height:probe.height,
    rightsDeclared:row.rights,sourceRefs:refs,reviewRefs:consent,
    propertyPermissionDeclared:true,commercialUseDeclared:true,
    identifiablePersonsDeclared:row.peopleVisible===true,
    independentRightsVerificationPerformed:false});
 }
 const brief={schema:'evercraft.fallen.commercial-brief.v1',
  id:manifest.productionId,brand:'HAVENLY Cleaning',
  audience:'Yakima Valley homeowners and property managers',
  offer:'Request cleaning or turnover service in the Yakima Valley',
  durationSec:30,formats:REQUIRED_FORMATS,sourceAssets:assets,scenes,
  excludedPreviousAssetDigests:[...prior]};
 const needs={
  schema:'evercraft.havenly.production-needs.v1',productionId:manifest.productionId,
  brandAssets:['approved-logo-master','approved-brand-colors-and-font','verified-contact-call-to-action'],
  voiceTakes:scenes.filter(x=>x.voiceLine).map(x=>({sceneId:x.id,scriptText:x.voiceLine,
    performance:'audition three emotionally distinct human-sounding takes',status:'not_recorded_or_approved'})),
  originalMusic:{description:'76-84 BPM intimate felt piano, acoustic warmth, soft strings, 30s + tail',
    status:'not_composed_or_approved'},
  sfx:scenes.flatMap(x=>x.sfxCues.map(c=>({sceneId:x.id,atSec:c.atSec,
    description:c.description,status:'original_foley_needed'}))),
  allFormats:REQUIRED_FORMATS,
  publicationAuthorityGranted:false,finalVideoCreated:false,finalCreativeApproved:false
 };
 const captions=[
  '1\n'+secondsSrt(22)+' --> '+secondsSrt(26)+'\nCome home to a space\nthat feels cared for.',
  '2\n'+secondsSrt(26)+' --> '+secondsSrt(30)+'\nHavenly Cleaning.\nCome home to a haven.'
 ].join('\n\n')+'\n';
 return {brief,ledger,needs,captions,phase:'verified_input_bytes_not_finished_commercial'};
}
export function createHavenlyProductionIntake(manifest,outDir){
 const work=preflightHavenlyIntake(manifest),dest=path.resolve(outDir);
 if(fs.existsSync(dest))throw new Error('havenly_intake_output_already_exists');
 fs.mkdirSync(path.dirname(dest),{recursive:true});
 const scratch=fs.mkdtempSync(dest+'.staging-');
 try{
  const plan=writeCommercialPlan(work.brief,scratch);
  for(const [file,data] of [
   ['havenly-real-footage-brief.json',work.brief],
   ['source-rights-ledger.json',work.ledger],
   ['creative-audio-brand-needs.json',work.needs],
   ['production-intake-receipt.json',{
     schema:'evercraft.havenly.production-intake-receipt.v1',
     productionId:manifest.productionId,
     sourceFirstPlanDigest:plan.planDigest,footageClipsVerified:work.ledger.length,
     outputReadyForAudioAssembly:false,customerMediaPublished:false,
     visualQualityIndependentlyVerified:false,
     reviewRightsDeclarationsIndependentlyAuthenticated:false
   }]
  ])fs.writeFileSync(path.join(scratch,file),JSON.stringify(data,null,2)+'\n',{flag:'wx'});
  fs.writeFileSync(path.join(scratch,'captions-draft.srt'),work.captions,{flag:'wx'});
  fs.renameSync(scratch,dest);
  return {status:'source_first_shot_plans_built_from_real_files',
    outputDir:dest,planDigest:plan.planDigest,shots:work.ledger.length,
    pending:['approved_voice','original_score','foley','logo','client_final_review'],
    publicationAuthorityGranted:false};
 }catch(e){fs.rmSync(scratch,{recursive:true,force:true});throw e;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{
  const [input,out]=process.argv.slice(2);
  if(!input||!out)throw new Error('Usage: node havenly-real-footage-intake.mjs <intake.json> <new-output-dir>');
  console.log(JSON.stringify(createHavenlyProductionIntake(
   JSON.parse(fs.readFileSync(input,'utf8')),out),null,2));
 }catch(e){console.error(e.message||String(e));process.exitCode=2;}
}
