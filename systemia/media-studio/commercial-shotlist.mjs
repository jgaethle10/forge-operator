#!/usr/bin/env node
// Source-first 30-second commercial planner. Creative work planning only, never publication authority.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {assertRelayFloorBrief} from './relay-floor-gate.mjs';

const ROLES=[
  'story_architect','cinematography_director','visual_evidence_scout','data_graphics_director',
  'world_builder','edit_rhythm_director','sound_director','voice_performance_director',
  'music_composer','sound_design_engineer','mixing_engineer','brand_art_director',
  'documentary_truth_guard','beauty_judge'
];
const BEATS=new Set(['hook','problem','proof','transformation','cta']);
const MEDIA=new Set(['video','image']);
const EVIDENCE=new Set(['observed','licensed','synthetic_visualization']);
const RIGHTS=new Set(['owned','licensed']);

function objectDigest(value){
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function fileDigest(file){
  const hash=crypto.createHash('sha256');
  const fd=fs.openSync(file,'r'),buffer=Buffer.allocUnsafe(1024*1024);
  try{
    for(;;){
      const n=fs.readSync(fd,buffer,0,buffer.length,null);
      if(!n)break;
      hash.update(buffer.subarray(0,n));
    }
  }finally{fs.closeSync(fd);}
  return hash.digest('hex');
}
const clean=value=>String(value??'').trim();
function requireText(value,key){
  if(!clean(value))throw new Error('commercial_brief_'+key+'_missing');
  return clean(value);
}
function ensureArray(value,key){
  if(!Array.isArray(value)||!value.length)throw new Error('commercial_brief_'+key+'_missing');
  return value;
}
function seconds(value,key){
  const n=Number(value);
  if(!Number.isFinite(n)||n<=0)throw new Error('commercial_brief_'+key+'_invalid');
  return n;
}

export function planSourceFirstCommercial(brief,{checkFiles=true}={}){
  if(brief?.schema!=='evercraft.fallen.commercial-brief.v1')throw new Error('commercial_brief_schema_invalid');
  const id=requireText(brief.id,'id');
  const brand=requireText(brief.brand,'brand');
  const audience=requireText(brief.audience,'audience');
  const offer=requireText(brief.offer,'offer');
  const durationSec=seconds(brief.durationSec,'duration');
  const formats=ensureArray(brief.formats,'formats');
  if(formats.some(x=>!['9:16','16:9','1:1'].includes(x)))throw new Error('commercial_brief_format_unsupported');
  const assets=ensureArray(brief.sourceAssets,'source_assets');
  // Opt-in floor for human-led cinematic spots. Never downgrade this to a slideshow.
  assertRelayFloorBrief(brief);
  const scenes=ensureArray(brief.scenes,'scenes');
  if(scenes.length<3)throw new Error('commercial_brief_minimum_three_scenes');
  if(scenes[0]?.beat!=='hook'||scenes.at(-1)?.beat!=='cta')throw new Error('commercial_brief_hook_cta_required');

  const assetMap=new Map();
  const excluded=new Set(brief.excludedPreviousAssetDigests||[]);
  for(const asset of assets){
    const assetId=requireText(asset.id,'asset_id');
    if(assetMap.has(assetId))throw new Error('commercial_asset_duplicate:'+assetId);
    if(!MEDIA.has(asset.mediaKind))throw new Error('commercial_asset_media_kind_invalid:'+assetId);
    if(!RIGHTS.has(asset.rights))throw new Error('commercial_asset_rights_unverified:'+assetId);
    if(!EVIDENCE.has(asset.evidenceState))throw new Error('commercial_asset_evidence_unknown:'+assetId);
    if(!/^[a-f0-9]{64}$/i.test(String(asset.sha256||'')))throw new Error('commercial_asset_digest_invalid:'+assetId);
    if(excluded.has(asset.sha256))throw new Error('commercial_previous_campaign_footage_reused:'+assetId);
    ensureArray(asset.sourceRefs,'source_refs');
    ensureArray(asset.subjects,'subjects');
    const location=requireText(asset.path,'asset_path');
    if(checkFiles){
      if(!fs.existsSync(location)||!fs.statSync(location).isFile())throw new Error('commercial_asset_unavailable:'+assetId);
      if(fileDigest(location).toLowerCase()!==asset.sha256.toLowerCase())throw new Error('commercial_asset_digest_mismatch:'+assetId);
    }
    assetMap.set(assetId,asset);
  }

  const ids=new Set();
  let position=0;
  const timeline=[],sfxSpots=[],voiceTakes=[],musicMap=[],sabanJobs=[];
  for(const [index,scene] of scenes.entries()){
    const sceneId=requireText(scene.id,'scene_id');
    if(ids.has(sceneId))throw new Error('commercial_scene_duplicate:'+sceneId);
    ids.add(sceneId);
    if(!BEATS.has(scene.beat))throw new Error('commercial_scene_beat_invalid:'+sceneId);
    const time=seconds(scene.durationSec,'scene_duration');
    const intention=requireText(scene.intent,'scene_intent');
    const visualSource=assetMap.get(scene.assetId);
    if(!visualSource)throw new Error('commercial_scene_asset_missing:'+sceneId);
    const subjects=ensureArray(scene.mustShowSubjects,'must_show_subjects');
    for(const subject of subjects){
      if(!visualSource.subjects.includes(subject))throw new Error('commercial_must_show_not_proven:'+sceneId+':'+subject);
    }
    // The opening must contain relevant action in real/owned/licensed footage.
    if(index===0 && (visualSource.mediaKind!=='video'||visualSource.evidenceState==='synthetic_visualization'))
      throw new Error('commercial_opening_real_action_required');
    if(index>0 && scene.assetId===scenes[index-1].assetId)
      throw new Error('commercial_adjacent_repeated_hero_footage:'+sceneId);
    if(visualSource.evidenceState==='synthetic_visualization'&&scene.syntheticLabel!==true)
      throw new Error('commercial_synthetic_visual_unlabeled:'+sceneId);
    const voiceLine=clean(scene.voiceLine),voiceMood=clean(scene.voiceMood);
    if(voiceLine && !voiceMood)throw new Error('commercial_voice_direction_missing:'+sceneId);
    if(voiceLine){
      const words=voiceLine.split(/\s+/).length;
      if(words/time>3)throw new Error('commercial_voice_timing_unrealistic:'+sceneId);
      voiceTakes.push({sceneId,text:voiceLine,direction:voiceMood,startSec:Number(position.toFixed(3)),
        endSec:Number((position+time).toFixed(3)),auditionsRequired:3,
        humanPerformanceApprovalRequired:true,voiceProfileLockRequired:true});
    }
    const energy=Number(scene.scoreEnergy);
    if(!Number.isFinite(energy)||energy<0||energy>1)throw new Error('commercial_music_energy_invalid:'+sceneId);
    musicMap.push({sceneId,startSec:Number(position.toFixed(3)),durationSec:time,
      energy,emotion:requireText(scene.scoreMood,'score_mood'),originalMotifRequired:true,
      stemLicensingRequired:true});
    for(const effect of scene.sfxCues||[]){
      const spot=Number(effect.atSec);
      if(!Number.isFinite(spot)||spot<0||spot>=time||!clean(effect.description))
        throw new Error('commercial_sfx_spot_invalid:'+sceneId);
      sfxSpots.push({sceneId,atSec:Number((position+spot).toFixed(3)),
        description:clean(effect.description),assetState:'needs_verified_source_or_generation',
        soundDesignApprovalRequired:true});
    }
    const startSec=Number(position.toFixed(3));
    position+=time;
    const item={
      id:sceneId,beat:scene.beat,startSec,endSec:Number(position.toFixed(3)),
      durationSec:time,assetId:visualSource.id,assetSha256:visualSource.sha256,
      sourceRefs:[...visualSource.sourceRefs],rights:visualSource.rights,
      evidenceState:visualSource.evidenceState,
      subjectIds:[...subjects],intent:intention,
      videoFirst:true,voiceLine,voiceMood,scoreEnergy:energy
    };
    timeline.push(item);
    sabanJobs.push({kind:'fallen_creative_shot',key:id+':'+sceneId,
      shot:{id:'commercial-'+id+'-'+sceneId,sourceType:'scene',sourceId:sceneId,
        beat:scene.beat,aspectRatio:formats[0],durationSec:time,storyPrompt:brand+': '+offer,
        intent:intention,subjectIds:[...subjects],coverage:subjects.map((subject,i)=>({
          id:sceneId+'-coverage-'+i,subjectId:subject,subjectLabel:subject,
          preferredTreatment:'real_source_footage',matchedAssetIds:[visualSource.id],
          status:'covered'
        })),sourcePath:visualSource.path,mediaKind:visualSource.mediaKind}});
  }
  if(Math.abs(position-durationSec)>0.01)throw new Error('commercial_total_duration_mismatch');
  const result={
    schema:'evercraft.fallen.source-first-commercial-plan.v1',id,brand,audience,offer,durationSec,
    formats:[...new Set(formats)],timeline,sfxSpots,voiceTakes,musicMap,
    sabanInventory:{jobs:sabanJobs},
    releaseGates:{
      sourceDigestsVerified:checkFiles,assetRightsDeclared:true,
      voiceAuditionsMustBeListenedTo:true,musicStemsMustBeVerified:true,
      soundSyncMustBeApproved:true,visualTournamentRequired:true,
      finalEncodedAudioQcRequired:true,finalClientReviewRequired:true,
      finalVideoMasterCreated:false,publicationAuthority:false
    },
    status:'ready_for_creative_execution_not_final_delivery'
  };
  return {...result,planDigest:objectDigest(result)};
}

export function writeCommercialPlan(brief,outputDir,options={}){
  const planned=planSourceFirstCommercial(brief,options);
  const dir=path.resolve(outputDir);
  fs.mkdirSync(dir,{recursive:true});
  for(const [name,data] of [
    ['source-first-plan.json',planned],
    ['saban-creative-inventory.json',planned.sabanInventory],
    ['voice-auditions.json',planned.voiceTakes],
    ['music-cue-map.json',planned.musicMap],
    ['sound-spotting-sheet.json',planned.sfxSpots]
  ]){
    const file=path.join(dir,name);
    if(fs.existsSync(file))throw new Error('commercial_output_exists:'+name);
    fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n',{flag:'wx'});
  }
  return planned;
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{
    const [input,output]=process.argv.slice(2);
    if(!input||!output)throw new Error('Usage: node commercial-shotlist.mjs <brief.json> <output-directory>');
    const result=writeCommercialPlan(JSON.parse(fs.readFileSync(input,'utf8')),output);
    console.log(JSON.stringify({id:result.id,status:result.status,shots:result.timeline.length,
      sabanJobs:result.sabanInventory.jobs.length,planDigest:result.planDigest},null,2));
  }catch(e){console.error(e.message||String(e));process.exitCode=2;}
}
