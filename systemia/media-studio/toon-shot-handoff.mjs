import crypto from 'node:crypto';

const schema='evercraft.fallen.toon-shot-handoff.v1';
const hex64=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const clean=value=>typeof value==='string'?value.trim():'';
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'
  ?Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)]))
  :value;
const sha=value=>crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
function requireValid(condition,code){if(!condition)throw new Error('toon_handoff_'+code);}
function indexed(items,label){
  requireValid(Array.isArray(items),'missing_'+label);
  const result=new Map();
  for(const item of items){
    const id=clean(item?.id);
    requireValid(id,'missing_'+label+'_id');
    requireValid(!result.has(id),'duplicate_'+label+':'+id);
    result.set(id,item);
  }
  return result;
}
// This small authored control surface is only for the original Fox Cel canary.
// It is not an inferred performance model and does not attest character identity.
const PREVIEW_MOTION_KEYS=['specimenProfile','reach','blinkAtSec','gazeX','lanternLift','tailEnergy'];
function normalizePreviewMotion(value,durationSec,shotId){
  if(value===undefined)return null;
  requireValid(value&&typeof value==='object'&&!Array.isArray(value),'preview_motion_object_invalid:'+shotId);
  requireValid(Object.keys(value).length===PREVIEW_MOTION_KEYS.length &&
    PREVIEW_MOTION_KEYS.every(key=>Object.hasOwn(value,key)),
    'preview_motion_fields_invalid:'+shotId);
  requireValid(value.specimenProfile==='original_fox_v1','preview_motion_specimen_not_supported:'+shotId);
  for(const field of ['reach','lanternLift','tailEnergy']){
    requireValid(typeof value[field]==='number'&&Number.isFinite(value[field])&&
      value[field]>=0&&value[field]<=1,'preview_motion_range_invalid:'+shotId+':'+field);
  }
  requireValid(typeof value.gazeX==='number'&&Number.isFinite(value.gazeX)&&
    value.gazeX>=-1&&value.gazeX<=1,'preview_motion_range_invalid:'+shotId+':gazeX');
  requireValid(typeof value.blinkAtSec==='number'&&Number.isFinite(value.blinkAtSec)&&
    value.blinkAtSec>=0&&value.blinkAtSec<=durationSec,
    'preview_motion_range_invalid:'+shotId+':blinkAtSec');
  return Object.fromEntries(PREVIEW_MOTION_KEYS.map(k=>[k,value[k]]));
}

function requireDirection(value,label){
  requireValid(clean(value).length>=3,'direction_missing:'+label);
  requireValid(clean(value).length<=700,'direction_too_long:'+label);
  return clean(value);
}

/**
 * Turns a real Fallen Series Mode episode into an explicit, frame-addressable animation
 * work order. This function NEVER runs or assumes media providers, audio or rendering.
 *
 * Character directions and cue placement are author-authored, not fabricated.
 * Missing identity, location, acting, audio, or dialogue mapping rejects the packet.
 */
/** @param {any} input */
export function compileToonShotHandoff(input={}){
  const {bible,episode,shots,fps=24}=input;
  requireValid(bible?.schema==='evercraft.fallen.series-bible.v1','bible_schema');
  requireValid(episode?.schema==='evercraft.fallen.series-plan.v1','episode_schema');
  requireValid(episode.seriesId===bible.id,'series_mismatch');
  requireValid(episode.continuity?.status==='pass','continuity_not_passed');
  requireValid(episode.continuity.bibleDigest===sha(bible),'bible_digest_mismatch');
  requireValid(hex64(episode.canonReceipt),'canon_receipt_missing');
  requireValid(episode.filmPlan?.schema==='evercraft.media.plan.v1','film_plan_missing');
  requireValid(Number.isInteger(fps)&&fps>=24&&fps<=60,'fps_invalid');
  const aspectRatio=episode.filmPlan.aspectRatio;
  requireValid(['16:9','9:16','1:1'].includes(aspectRatio),'aspect_invalid');
  const entities=indexed(bible.entities,'entity');
  const needs=indexed(episode.productionNeeds,'need');
  const dialogues=indexed(episode.dialogue,'dialogue');
  const videoNeeds=episode.productionNeeds.filter(need=>need.kind==='video');
  const speechNeeds=episode.productionNeeds.filter(need=>need.kind==='speech');
  requireValid(Array.isArray(shots)&&shots.length>0,'shots_missing');
  requireValid(videoNeeds.length>0,'video_needs_missing');
  requireValid(shots.length===videoNeeds.length,'visual_need_count_mismatch');
  requireValid(shots.length<=60,'too_many_shots');
  for(const cue of episode.dialogue){
    const speaker=entities.get(cue.speakerId);
    requireValid(speaker?.kind==='character','speaker_not_character:'+cue.id);
    requireValid(clean(speaker.voiceProfileId)===cue.voiceProfileId,'voice_lock_mismatch:'+cue.id);
    const need=needs.get('need-'+cue.id);
    requireValid(need?.kind==='speech'&&need.speakerId===cue.speakerId&&
      need.voiceProfileId===cue.voiceProfileId&&need.continuityDigest===episode.continuity.bibleDigest,
      'speech_need_mismatch:'+cue.id);
  }
  requireValid(speechNeeds.length===dialogues.size,'speech_need_count_mismatch');

  const usedNeeds=new Set(),usedCues=new Set(),usedShots=new Set();
  let lastFrame=0;
  const timelines=shots.map((shot,index)=>{
    const shotId=clean(shot?.id);
    requireValid(shotId,'shot_id_missing');
    requireValid(!usedShots.has(shotId),'duplicate_shot:'+shotId);
    usedShots.add(shotId);
    const need=needs.get(shot.visualNeedId);
    requireValid(need?.kind==='video','unknown_visual_need:'+shotId);
    requireValid(!usedNeeds.has(need.id),'duplicate_visual_need:'+need.id);
    usedNeeds.add(need.id);
    requireValid(need.continuityDigest===episode.continuity.bibleDigest,'visual_continuity_mismatch:'+shotId);
    requireValid(need.aspectRatio===aspectRatio,'visual_aspect_mismatch:'+shotId);
    requireValid(Number.isFinite(shot.durationSec)&&shot.durationSec>0,'duration_invalid:'+shotId);
    const tolerance=Math.max(.25,(need.durationSec||0)*.05);
    requireValid(Number.isFinite(need.durationSec)&&Math.abs(need.durationSec-shot.durationSec)<=tolerance,
      'visual_duration_mismatch:'+shotId);
    const location=entities.get(shot.locationId);
    requireValid(location?.kind==='location','location_not_in_bible:'+shotId);
    // A location declaration is NOT an actual rendered/environment reference.
    requireValid(Array.isArray(shot.characters)&&shot.characters.length>0,'visible_character_missing:'+shotId);
    requireValid(shot.characters.length<=12,'too_many_characters:'+shotId);
    const characterIds=new Set();
    const characters=shot.characters.map(character=>{
      const id=clean(character.entityId),entity=entities.get(id);
      requireValid(entity?.kind==='character','character_not_in_bible:'+shotId+':'+id);
      requireValid(!characterIds.has(id),'duplicate_character:'+shotId+':'+id);
      characterIds.add(id);
      requireValid(Array.isArray(entity.referenceAssetIds)&&entity.referenceAssetIds.length>0,
        'character_reference_missing:'+shotId+':'+id);
      requireValid(Object.keys(entity.immutableTraits||{}).length>0,
        'character_traits_missing:'+shotId+':'+id);
      const acting={
        objective:requireDirection(character.acting?.objective,shotId+':'+id+':objective'),
        physicalAction:requireDirection(character.acting?.physicalAction,shotId+':'+id+':physicalAction'),
        face:requireDirection(character.acting?.face,shotId+':'+id+':face'),
        gazeTarget:requireDirection(character.acting?.gazeTarget,shotId+':'+id+':gazeTarget'),
        hands:requireDirection(character.acting?.hands,shotId+':'+id+':hands'),
      };
      return {id,name:entity.name,lockedTraits:entity.immutableTraits,
        referenceAssetIds:[...entity.referenceAssetIds],voiceProfileId:entity.voiceProfileId||null,
        acting,identityVerified:false,performanceVerified:false,rigVerified:false};
    });
    const shotCues=[];
    for(const cueId of shot.dialogueCueIds||[]){
      const cue=dialogues.get(cueId);
      requireValid(cue,'unknown_dialogue_cue:'+shotId+':'+cueId);
      requireValid(!usedCues.has(cueId),'duplicate_dialogue_cue:'+cueId);
      requireValid(characterIds.has(cue.speakerId),'speaker_not_visible:'+shotId+':'+cueId);
      usedCues.add(cueId);
      shotCues.push({id:cueId,speakerId:cue.speakerId,text:cue.text,
        emotion:cue.emotion||null,delivery:cue.delivery||null,
        voiceProfileId:cue.voiceProfileId,
        speechNeedId:'need-'+cueId,
        voiceAudioVerified:false,phonemeTimingVerified:false,lipSyncVerified:false});
    }
    const action= requireDirection(shot.action,shotId+':action');
    const soundDirection=requireDirection(shot.soundDirection,shotId+':sound');
    const endFrame=Math.round(shots.slice(0,index+1).reduce((sum,x)=>sum+x.durationSec,0)*fps);
    requireValid(endFrame>lastFrame,'frame_allocation_invalid:'+shotId);
    const startFrame=lastFrame;lastFrame=endFrame;
    return {
      id:shotId,visualNeedId:need.id,
      sequenceIndex:index,locationId:location.id,
      aspectRatio,durationSec:shot.durationSec,startFrame,frameCount:endFrame-startFrame,fps,
      action,soundDirection,characters,dialogue:shotCues,
      previewMotion:normalizePreviewMotion(shot.previewMotion,shot.durationSec,shotId),
      execution:{
        identityReference:'not_verified',
        environmentReference:'not_verified',
        animationRig:'not_verified',actorPerformance:'not_verified',
        mouthPhonemeSync:shotCues.length?'not_verified':'not_applicable',
        authoredOrLicensedMusic:'not_verified',finalVideo:'not_rendered',
        visualAnatomyReview:'not_performed',audioMaster:'not_performed',
      },
      qualityGates:['identity_fingerprint','character_face_and_hand_anatomy',
        'eyelines_and_action_continuity','art_direction_and_environment',
        'physical_animation_and_rig','soundtrack_and_rights',
        ...(shotCues.length?['verified_voice_lock','phonemes_visemes_and_dialogue_sync']:[]),
        'rendered_video_frame_evidence','master_audio_video_qc'],
    };
  });
  requireValid(usedNeeds.size===videoNeeds.length,'visual_needs_unallocated');
  requireValid(usedCues.size===dialogues.size,'dialogue_cues_unallocated');
  const totalSec=shots.reduce((sum,item)=>sum+item.durationSec,0);
  const core={
    schema,seriesId:bible.id,episodeId:episode.episodeId,canonReceipt:episode.canonReceipt,
    bibleDigest:episode.continuity.bibleDigest,
    aspectRatio,fps,frameCount:lastFrame,durationSec:totalSec,
    shots:timelines,
    state:'preproduction_work_orders_only',
    deliveryReady:false,publicationAuthority:false,
    requiredDownstreamReceipts:['source_asset_and_reference_digest','identity_and_continuity_admission',
      'animation_and_frame_observation','voice_and_lipsync','music_sfx_and_rights',
      'master_qc','clip_or_customer_delivery'],
    boundaries:{providerCallsPerformed:false,assetsGenerated:false,
      voicesGenerated:false,videoRendered:false,sourceReferencesNotProofOfMedia:true},
  };
  return {...core,digest:sha(core)};
}

export function inspectToonHandoff(packet){
  requireValid(packet?.schema===schema,'packet_schema');
  const {digest,...core}=packet;
  requireValid(sha(core)===digest,'packet_tampered');
  requireValid(packet.deliveryReady===false&&packet.publicationAuthority===false,
    'unearned_publication_authority');
  requireValid(packet.state==='preproduction_work_orders_only'&&packet.boundaries?.videoRendered===false,
    'unearned_render_claim');
  requireValid(packet.shots?.length>0,'packet_shots_missing');
  const total=packet.shots.reduce((frames,shot)=>{
    requireValid(shot.startFrame===frames&&shot.frameCount>0,'frame_discontinuity:'+shot.id);
    return frames+shot.frameCount;
  },0);
  requireValid(total===packet.frameCount,'total_frame_mismatch');
  return {schema:'evercraft.fallen.toon-shot-handoff-inspection.v1',
    state:'preproduction_only',shotCount:packet.shots.length,
    frameCount:total,packetDigest:digest,qualityGatesPending:true};
}


/**
 * Transform an audited shot into provider-facing direction. It improves the actual
 * prompt but does not claim that a provider obeyed it or that output passed visual QA.
 */
export function renderToonShotDirection(packet,shotId){
  inspectToonHandoff(packet);
  const shot=packet.shots.find(item=>item.id===shotId);
  requireValid(shot,'shot_not_found:'+String(shotId));
  const actorDirections=shot.characters.flatMap(character=>[
    'CHARACTER '+character.id+' ('+character.name+'): DO NOT CHANGE identity, silhouette, or locked traits: '+
      Object.entries(character.lockedTraits||{}).map(([key,value])=>key+'='+value).join('; ')+'.',
    'ACTING OBJECTIVE: '+character.acting.objective+'.',
    'PHYSICAL BLOCKING: '+character.acting.physicalAction+'.',
    'FACE: '+character.acting.face+'. EYES: '+character.acting.gazeTarget+'.',
    'HANDS/PAWS: '+character.acting.hands+'. Maintain consistent limb count, digit anatomy, grip and proportions throughout movement.',
  ]);
  const lines=shot.dialogue.map(cue=>
    'DIALOGUE ID '+cue.id+': speaker='+cue.speakerId+'; locked_voice='+cue.voiceProfileId+
    '; text='+JSON.stringify(cue.text)+'; emotion='+(cue.emotion||'natural')+
    '. Mouth motion must follow verified phoneme timings; a text prompt alone does not prove sync.');
  return [
    'FALLEN TOON SHOT DIRECTION. SHOT '+shot.id+'; '+shot.frameCount+' frames at '+shot.fps+' fps.',
    'World/location anchor: '+shot.locationId+'. Setting references must be separately verified.',
    'ACTION: '+shot.action+'.',
    ...actorDirections,...lines,
    'SOUND DIRECTION: '+shot.soundDirection+'. Sound is NOT generated by this visual prompt.',
    'Keep the camera motivated, preserve eyelines, costume, scene geography and hand anatomy.',
    'Do not add fingers, swap faces, invent extra characters, invent spoken words or present modelled action as source footage.',
    'The result requires independent identity, visual anatomy, continuity, dialogue and master QC before approval.',
  ].join('\n');
}
