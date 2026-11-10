import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DIRECTION_SCHEMA='evercraft.fallen.client-commercial-direction.v1';
const ASPECTS=new Set(['9:16','16:9','1:1']);
const ROLES=new Set(['hook','proof','body','cta']);
const HEX=/^[a-f0-9]{64}$/i;
const clean=x=>typeof x==='string'?x.trim():'';
const unique=a=>[...new Set(a)];
const duration=x=>Number.isFinite(x)&&x>0;
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const words=s=>(clean(s).match(/[\p{L}\p{N}]+(?:['\u2019-][\p{L}\p{N}]+)*/gu)||[]).length;
const badOpening=/\b(?:ever had an idea|we know that feeling|in today'?s fast.paced world|unlock the power|game.changer|revolutionary solution)\b/i;
const RISKY_TEXT=/\b(?:guaranteed|number one|#1|best in (?:town|the world)|zero risk|100% effective)\b/i;

function containsClaimRef(ref,sourceRefs){return clean(ref)&&sourceRefs.includes(ref);}
function isVideoOrImage(asset){return asset?.kind==='video'||asset?.kind==='image';}
function numericPause(p){return Number.isInteger(p)&&p>=0&&p<=2500;}

export function evaluateCommercialDirection(input){
  if(input?.schema!==DIRECTION_SCHEMA)throw new Error('fallen_direction_schema_invalid');
  const blockers=[],warnings=[];
  const fail=(code,condition)=>{if(!condition)blockers.push(code);};
  const advise=(code,condition)=>{if(!condition)warnings.push(code);};
  const projectId=clean(input.id),name=clean(input.brand?.name);
  fail('project_id_missing',Boolean(projectId));
  fail('brand_missing',Boolean(name));
  fail('customer_goal_missing',Boolean(clean(input.goal)));
  fail('audience_missing',Boolean(clean(input.audience)));
  fail('confirmed_offer_missing',Boolean(clean(input.offer?.text))&&input.offer?.confirmed===true);
  fail('cta_unconfirmed',input.cta?.confirmed===true&&Boolean(clean(input.cta?.text)));
  fail('aspect_ratio_invalid',ASPECTS.has(input.aspectRatio));
  fail('duration_not_30_second_spot',Math.abs(Number(input.durationSec)-30)<0.01);
  fail('brand_lineage_missing',Array.isArray(input.brand?.sourceRefs)&&input.brand.sourceRefs.some(x=>clean(x)));
  const offerRefs=Array.isArray(input.offer?.evidenceRefs)?unique(input.offer.evidenceRefs.filter(x=>clean(x))):[];
  fail('offer_evidence_missing',offerRefs.length>0);
  fail('music_direction_missing',Boolean(clean(input.music?.brief)));
  const assets=Array.isArray(input.sourceAssets)?input.sourceAssets:[];
  const seenAssets=new Set();
  for(const asset of assets){
    const id=clean(asset?.id);
    if(!id||seenAssets.has(id))blockers.push('asset_id_invalid_or_duplicate');
    seenAssets.add(id);
    fail('asset_digest_missing:'+id,HEX.test(clean(asset?.digest)));
    fail('asset_source_refs_missing:'+id,Array.isArray(asset?.sourceRefs)&&asset.sourceRefs.some(x=>clean(x)));
    fail('asset_rights_unverified:'+id,['owned','licensed','public_domain'].includes(asset?.rights));
    fail('asset_visual_kind_invalid:'+id,isVideoOrImage(asset));
    fail('asset_path_missing:'+id,Boolean(clean(asset?.path)));
  }
  const beats=Array.isArray(input.beats)?input.beats:[];
  fail('insufficient_story_beats',beats.length>=3&&beats.length<=10);
  const ids=new Set();
  const sourceUses=new Map();
  let cursor=0;
  let voiceCount=0;
  const shotPlan=[],studioScenes=[],voiceSheet=[],musicSheet=[],creativeJobs=[];
  for(const [index,beat] of beats.entries()){
    const id=clean(beat?.id),role=beat?.role;
    if(!id||ids.has(id))blockers.push('beat_id_invalid_or_duplicate');
    ids.add(id);
    fail('beat_role_invalid:'+id,ROLES.has(role));
    fail('beat_duration_invalid:'+id,duration(beat?.durationSec));
    const sec=duration(beat?.durationSec)?beat.durationSec:0;
    const action=clean(beat?.physicalAction);
    fail('physical_action_missing:'+id,action.length>=10);
    const visual=beat?.visual||{};
    const selectedAsset=clean(visual.assetId);
    const visualRefs=Array.isArray(visual.sourceRefs)?unique(visual.sourceRefs.filter(x=>clean(x))):[];
    fail('visual_source_refs_missing:'+id,visualRefs.length>0);
    fail('visual_subject_not_confirmed:'+id,Boolean(clean(beat.subject)));
    if(selectedAsset){
      const asset=assets.find(a=>a.id===selectedAsset);
      fail('visual_asset_not_found:'+id,seenAssets.has(selectedAsset));
      fail('visual_asset_kind_invalid:'+id,isVideoOrImage(asset));
      if(visual.trimStartSec!==undefined){
        fail('visual_trim_invalid:'+id,asset?.kind==='video'&&Number.isFinite(visual.trimStartSec)&&visual.trimStartSec>=0);
      }
      if(Number.isFinite(asset?.durationSec)){
        fail('visual_clip_outside_source:'+id,(visual.trimStartSec??0)+sec<=asset.durationSec+.05);
      }
      const uses=sourceUses.get(selectedAsset)||[];
      uses.push({id,offset:visual.trimStartSec});
      sourceUses.set(selectedAsset,uses);
    }else{
      fail('visual_prompt_missing:'+id,Boolean(clean(visual.prompt)));
      warnings.push('new_visual_requires_generation_or_acquisition:'+id);
    }
    fail('no_text_only_scene:'+id,beat.textOnly!==true);
    if(role==='proof'){
      const refs=Array.isArray(beat.proofRefs)?beat.proofRefs:[];
      fail('proof_source_missing:'+id,refs.length>0&&refs.every(r=>containsClaimRef(r,offerRefs)));
    }
    if(role==='hook'){
      fail('hook_not_product_first',index===0&&sec<=5&&sec>=1&&action.length>=12);
      advise('hook_needs_visible_subject_in_first_second',beat.subjectVisibleAtStart===true);
    }
    const narration=beat?.narration||{};
    const spoken=clean(narration.text);
    if(spoken){
      voiceCount++;
      const before=narration.pauseBeforeMs??0,after=narration.pauseAfterMs??0;
      fail('voice_pause_invalid:'+id,numericPause(before)&&numericPause(after));
      const available=Math.max(0,sec-(Number(before)+Number(after))/1000-.35);
      const wpm=available>0?Math.round(words(spoken)*60/available):Infinity;
      fail('narration_must_be_rewritten_for_timing:'+id,available>=0.65&&wpm<=175);
      advise('narration_too_sparse_for_natural_read:'+id,wpm>=65);
      advise('unoriginal_opening_copy:'+id,!(role==='hook'&&badOpening.test(spoken)));
      advise('claim_language_requires_extra_review:'+id,!RISKY_TEXT.test(spoken));
      fail('voice_emphasis_invalid:'+id,
        !narration.emphasis||Array.isArray(narration.emphasis));
      const pronunciation=narration.pronunciation||{};
      if(Object.values(pronunciation).some(x=>!clean(x)))blockers.push('empty_pronunciation:'+id);
      voiceSheet.push({
        beatId:id,startSec:Number(cursor.toFixed(3)),endSec:Number((cursor+sec).toFixed(3)),
        words:words(spoken),plannedWordsPerMinute:wpm,pauseBeforeMs:before,pauseAfterMs:after,
        emotionalIntention:clean(narration.intention)||'to be directed by voice performer',
        emphasis:Array.isArray(narration.emphasis)?narration.emphasis:[],
        pronunciation,voiceProfileId:clean(narration.voiceProfileId)||null,
        humanAuditionRequired:true,automaticTimeStretchAllowed:false,
      });
    }
    if(role==='cta'){
      fail('cta_not_last_beat',index===beats.length-1);
      fail('cta_copy_mismatch',clean(beat.screenText)===clean(input.cta?.text));
    }
    const treatment={
      beatId:id,role,startSec:Number(cursor.toFixed(3)),durationSec:sec,subject:clean(beat.subject),
      action,camera:clean(beat.camera)||'motivated subject-following movement',
      sourceRefs:visualRefs,assetId:selectedAsset||null,
      sourceTrimStartSec:visual.trimStartSec??null,
      visualNeed:selectedAsset?'reuse_approved_source':'unresolved_coverage',
      intent:clean(beat.intent)||action,
    };
    shotPlan.push(treatment);
    const cameraPrompt=[clean(visual.prompt),action,clean(beat.camera),
      'Keep subject visible and maintain brand identity. No generic floating titles.'].filter(Boolean).join(' ');
    studioScenes.push({
      id,durationSec:sec,visual:{
        ...(selectedAsset?{assetId:selectedAsset}:{prompt:cameraPrompt}),
        ...(visual.trimStartSec!==undefined?{trimStartSec:visual.trimStartSec}:{}),
        sourceRefs:visualRefs,
      },
      ...(spoken?{narration:{text:spoken,language:clean(narration.language)||'en',
        ...(clean(narration.voiceProfileId)?{voiceProfileId:clean(narration.voiceProfileId)}:{})}}:{}),
      ...(clean(beat.screenText)?{screenText:clean(beat.screenText)}:{}),
      ...(Array.isArray(beat.sfx)&&beat.sfx.length?{sfx:beat.sfx}:{}),
    });
    musicSheet.push({
      beatId:id,startSec:Number(cursor.toFixed(3)),endSec:Number((cursor+sec).toFixed(3)),
      intensity:Math.max(0,Math.min(1,Number.isFinite(beat.musicIntensity)?beat.musicIntensity:0.3)),
      editHit:clean(beat.musicTransition)||null,
      dialoguePriority:spoken.length>0,
    });
    creativeJobs.push({
      kind:'fallen_creative_shot',
      key:'commercial-'+projectId+'-'+id,
      shot:{id:'commercial-'+projectId+'-'+id,sourceType:'scene',sourceId:projectId,
        beat:role,storyPrompt:cameraPrompt,intent:action,durationSec:sec,
        aspectRatio:input.aspectRatio,coverage:[],sourceRefs:visualRefs},
    });
    cursor+=sec;
  }
  for(const [assetId,uses] of sourceUses){
    if(uses.length<2)continue;
    fail('reused_source_requires_trim:'+assetId,uses.every(use=>Number.isFinite(use.offset)));
    if(uses.every(use=>Number.isFinite(use.offset))){
      fail('reused_source_repeats_same_segment:'+assetId,new Set(uses.map(use=>use.offset)).size===uses.length);
    }
    const asset=assets.find(a=>a.id===assetId);
    advise('reused_source_duration_unverified:'+assetId,Number.isFinite(asset?.durationSec));
  }
  fail('missing_hook',beats[0]?.role==='hook');
  fail('missing_proof',beats.some(beat=>beat.role==='proof'));
  fail('missing_cta',beats.at(-1)?.role==='cta');
  fail('commercial_duration_mismatch',Math.abs(cursor-30)<=0.15);
  advise('no_spoken_performance',voiceCount>0);
  const uniqueBlockers=unique(blockers),uniqueWarnings=unique(warnings);
  const status=uniqueBlockers.length?'blocked':'ready_for_director_review';
  const continuityDigest=digest({brand:input.brand,projectId,offerEvidence:offerRefs});
  const studioDraftPlan=status==='ready_for_director_review'?{
    schema:'evercraft.fallen.studio-draft-plan.v1',
    id:projectId,title:name+' | 30-second commercial',
    prompt:clean(input.goal)+' for '+clean(input.audience)+'. Offer: '+clean(input.offer.text),
    aspectRatio:input.aspectRatio,fps:30,sourceAssets:assets,scenes:studioScenes,
    music:{prompt:clean(input.music.brief),volume:.16},
    captions:{enabled:true,style:'clean'},continuityDigest,
  }:null;
  return {
    schema:'evercraft.fallen.commercial-creative-direction-report.v1',
    status,projectId:projectId||null,durationSec:Number(cursor.toFixed(3)),
    blockers:uniqueBlockers,warnings:uniqueWarnings,
    shotPlan,voiceSheet,musicSheet,creativeJobs,
    studioDraftPlan,continuityDigest,
    boundaries:{
      noMediaWasGenerated:true,noCustomerClaimsInvented:true,
      sourceRightsNotIndependentlyAuthenticated:true,
      paidProviderGenerationAuthorized:false,
      visualAndVoiceAuditionsRequired:true,
      clientPreviewAuthorityGranted:false,
      paymentAuthorityGranted:false,publicationAuthorityGranted:false,
    },
  };
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [, ,source,out]=process.argv;
  try{
    if(!source||!out)throw Error('Usage: node commercial-creative-direction.mjs <private-brief.json> <private-plan.json>');
    const brief=JSON.parse(fs.readFileSync(source,'utf8'));
    const report=evaluateCommercialDirection(brief);
    fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});
    fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n','utf8');
    console.log(JSON.stringify({status:report.status,blockers:report.blockers,
      warnings:report.warnings,output:path.resolve(out)},null,2));
    if(report.status!=='ready_for_director_review')process.exitCode=2;
  }catch(e){console.error(e instanceof Error?e.message:String(e));process.exitCode=1;}
}
