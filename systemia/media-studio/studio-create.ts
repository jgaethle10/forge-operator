import crypto from 'node:crypto';
import type { AspectRatio, ProductionNeed, SourceAsset } from './types.js';
import { makeTimelineProject, type FallenTimelineProject, type TimelineAsset, type TimelineTrack } from './timeline.js';

export interface StudioSourceAsset extends SourceAsset {
  digest:string;
  sourceRefs:string[];
  evidenceState?:'observed'|'public_source'|'licensed'|'modeled'|'inferred'|'synthetic_visualization';
}

export interface StudioDraftScene {
  id:string;
  durationSec:number;
  visual:{
    assetId?:string;
    prompt?:string;
    sourceRefs:string[];
  };
  narration?:{
    text:string;
    speakerId?:string;
    voiceProfileId?:string;
    language?:string;
  };
  sfx?:Array<{
    id:string;
    prompt:string;
    offsetSec?:number;
    durationSec?:number;
    volume?:number;
  }>;
  screenText?:string;
}

export interface StudioDraftPlan {
  schema:'evercraft.fallen.studio-draft-plan.v1';
  id:string;
  title:string;
  prompt:string;
  aspectRatio:AspectRatio;
  fps?:number;
  sourceAssets:StudioSourceAsset[];
  scenes:StudioDraftScene[];
  music?:{
    prompt:string;
    volume?:number;
  };
  captions?:{
    enabled:boolean;
    style?:'clean'|'bold'|'documentary';
  };
  continuityDigest:string;
}

export interface StudioScriptCue {
  id:string;
  sceneId:string;
  startSec:number;
  durationSec:number;
  text:string;
  speakerId?:string;
  voiceProfileId?:string;
  language?:string;
}

export interface StudioCaptionCue {
  id:string;
  startSec:number;
  endSec:number;
  text:string;
}

export interface StudioDraftBundle {
  schema:'evercraft.fallen.studio-draft-bundle.v1';
  project:FallenTimelineProject;
  productionNeeds:ProductionNeed[];
  script:StudioScriptCue[];
  captions:StudioCaptionCue[];
  boundaries:{
    generationNeedsArePlaceholders:true;
    generatedVisualsRequireTournament:true;
    productionAdmissionRequiredBeforeReplacement:true;
    paidGenerationAuthorityGranted:false;
    publicationAuthorityGranted:false;
  };
}

function digest(value:unknown){
  const stable=(input:unknown):unknown=>{
    if(Array.isArray(input)) return input.map(stable);
    if(input&&typeof input==='object'){
      return Object.fromEntries(Object.entries(input as Record<string,unknown>)
        .sort(([a],[b])=>a.localeCompare(b))
        .map(([key,item])=>[key,stable(item)]));
    }
    return input;
  };
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function assertPlan(plan:StudioDraftPlan){
  if(plan.schema!=='evercraft.fallen.studio-draft-plan.v1') throw new Error('studio_draft_schema_invalid');
  if(!plan.id?.trim()) throw new Error('studio_draft_id_missing');
  if(!plan.title?.trim()) throw new Error('studio_draft_title_missing');
  if(!plan.prompt?.trim()) throw new Error('studio_draft_prompt_missing');
  if(!plan.continuityDigest?.trim()) throw new Error('studio_draft_continuity_digest_missing');
  if(!plan.scenes?.length) throw new Error('studio_draft_scenes_missing');
  const sceneIds=new Set<string>();
  for(const scene of plan.scenes){
    if(!scene.id?.trim()) throw new Error('studio_draft_scene_id_missing');
    if(sceneIds.has(scene.id)) throw new Error(`studio_draft_duplicate_scene:${scene.id}`);
    sceneIds.add(scene.id);
    if(!Number.isFinite(scene.durationSec)||scene.durationSec<=0) throw new Error(`studio_draft_scene_duration_invalid:${scene.id}`);
    if(!scene.visual?.sourceRefs?.length) throw new Error(`studio_draft_visual_source_refs_missing:${scene.id}`);
    if(!scene.visual.assetId&&!scene.visual.prompt?.trim()) throw new Error(`studio_draft_visual_missing:${scene.id}`);
    if(scene.narration&&!scene.narration.text?.trim()) throw new Error(`studio_draft_narration_text_missing:${scene.id}`);
  }
}

function sourceAssetToTimeline(asset:StudioSourceAsset):TimelineAsset{
  if(!/^[a-f0-9]{64}$/i.test(asset.digest)) throw new Error(`studio_draft_source_digest_invalid:${asset.id}`);
  if(!asset.sourceRefs?.length) throw new Error(`studio_draft_source_refs_missing:${asset.id}`);
  return {
    id:asset.id,
    path:asset.path,
    digest:asset.digest,
    kind:asset.kind,
    sourceRefs:[...asset.sourceRefs],
    evidenceState:asset.evidenceState??(asset.rights==='owned'||asset.rights==='licensed'?'licensed':'public_source'),
  };
}

function placeholder(need:ProductionNeed):TimelineAsset{
  const kind=need.kind==='image'?'image':need.kind==='video'||need.kind==='lip_sync'?'video':'audio';
  return {
    id:`asset-${need.id}`,
    path:`pending://production/${need.id}`,
    digest:digest(need),
    kind,
    sourceRefs:[`production-need:${need.id}`],
    evidenceState:kind==='audio'?undefined:'synthetic_visualization',
    continuityDigest:need.continuityDigest,
  };
}

function captionText(text:string){
  return text.replace(/\s+/g,' ').trim();
}

export function compileStudioDraft(plan:StudioDraftPlan):StudioDraftBundle{
  assertPlan(plan);
  const sourceById=new Map(plan.sourceAssets.map(asset=>[asset.id,asset] as const));
  if(sourceById.size!==plan.sourceAssets.length) throw new Error('studio_draft_duplicate_source_asset');

  const assets:TimelineAsset[]=plan.sourceAssets.map(sourceAssetToTimeline);
  const needs:ProductionNeed[]=[];
  const script:StudioScriptCue[]=[];
  const captions:StudioCaptionCue[]=[];
  const picture:TimelineTrack={id:'picture',kind:'video',name:'Picture',clips:[]};
  const voice:TimelineTrack={id:'voice',kind:'voice',name:'Voice',clips:[]};
  const music:TimelineTrack={id:'music',kind:'music',name:'Music',clips:[]};
  const sfx:TimelineTrack={id:'sfx',kind:'sfx',name:'Sound Effects',clips:[]};

  let cursor=0;
  for(const scene of plan.scenes){
    let visualAssetId=scene.visual.assetId;
    if(visualAssetId){
      const source=sourceById.get(visualAssetId);
      if(!source) throw new Error(`studio_draft_source_asset_missing:${visualAssetId}`);
      if(source.kind!=='image'&&source.kind!=='video') throw new Error(`studio_draft_source_visual_kind_invalid:${visualAssetId}`);
    }else{
      const need:ProductionNeed={
        id:`${plan.id}-${scene.id}-visual`,
        kind:'video',
        prompt:scene.visual.prompt,
        durationSec:scene.durationSec,
        aspectRatio:plan.aspectRatio,
        continuityDigest:plan.continuityDigest,
        requires:['commercial_rights','provenance_receipt','timing_control'],
        status:'planned',
      };
      needs.push(need);
      const pending=placeholder(need);
      assets.push(pending);
      visualAssetId=pending.id;
    }

    picture.clips.push({
      id:`${scene.id}-picture`,
      trackId:picture.id,
      assetId:visualAssetId,
      startSec:cursor,
      durationSec:scene.durationSec,
      label:scene.screenText||scene.id,
    });

    if(scene.narration){
      const cue:StudioScriptCue={
        id:`${scene.id}-narration`,
        sceneId:scene.id,
        startSec:cursor,
        durationSec:scene.durationSec,
        text:captionText(scene.narration.text),
        speakerId:scene.narration.speakerId,
        voiceProfileId:scene.narration.voiceProfileId,
        language:scene.narration.language,
      };
      script.push(cue);
      if(plan.captions?.enabled){
        captions.push({
          id:`${scene.id}-caption`,
          startSec:cursor,
          endSec:cursor+scene.durationSec,
          text:cue.text,
        });
      }

      const speechNeed:ProductionNeed={
        id:`${plan.id}-${scene.id}-speech`,
        kind:'speech',
        prompt:cue.text,
        durationSec:scene.durationSec,
        speakerId:scene.narration.speakerId,
        voiceProfileId:scene.narration.voiceProfileId,
        language:scene.narration.language,
        continuityDigest:plan.continuityDigest,
        requires:[
          ...(scene.narration.voiceProfileId?(['voice_profile'] as const):[]),
          'commercial_rights',
          'provenance_receipt',
          'timing_control',
        ],
        status:'planned',
      };
      needs.push(speechNeed);
      const pending=placeholder(speechNeed);
      assets.push(pending);
      voice.clips.push({
        id:`${scene.id}-voice`,
        trackId:voice.id,
        assetId:pending.id,
        startSec:cursor,
        durationSec:scene.durationSec,
        volume:1,
        label:cue.text,
      });
    }

    for(const effect of scene.sfx??[]){
      const offset=Math.max(0,effect.offsetSec??0);
      const duration=Math.max(.1,Math.min(scene.durationSec-offset,effect.durationSec??Math.min(2,scene.durationSec-offset)));
      const need:ProductionNeed={
        id:`${plan.id}-${scene.id}-sfx-${effect.id}`,
        kind:'sfx',
        prompt:effect.prompt,
        durationSec:duration,
        continuityDigest:plan.continuityDigest,
        requires:['commercial_rights','provenance_receipt','timing_control'],
        status:'planned',
      };
      needs.push(need);
      const pending=placeholder(need);
      assets.push(pending);
      sfx.clips.push({
        id:`${scene.id}-sfx-${effect.id}`,
        trackId:sfx.id,
        assetId:pending.id,
        startSec:cursor+offset,
        durationSec:duration,
        volume:effect.volume??.75,
        label:effect.prompt,
      });
    }

    cursor+=scene.durationSec;
  }

  if(plan.music){
    const need:ProductionNeed={
      id:`${plan.id}-music`,
      kind:'music',
      prompt:plan.music.prompt,
      durationSec:cursor,
      continuityDigest:plan.continuityDigest,
      requires:['commercial_rights','provenance_receipt','timing_control'],
      status:'planned',
    };
    needs.push(need);
    const pending=placeholder(need);
    assets.push(pending);
    music.clips.push({
      id:'music-bed',
      trackId:music.id,
      assetId:pending.id,
      startSec:0,
      durationSec:cursor,
      volume:plan.music.volume??.18,
      label:plan.music.prompt,
    });
  }

  const tracks=[picture];
  if(voice.clips.length) tracks.push(voice);
  if(music.clips.length) tracks.push(music);
  if(sfx.clips.length) tracks.push(sfx);

  return {
    schema:'evercraft.fallen.studio-draft-bundle.v1',
    project:makeTimelineProject({
      id:plan.id,
      title:plan.title,
      aspectRatio:plan.aspectRatio,
      fps:plan.fps??30,
      assets,
      tracks,
    }),
    productionNeeds:needs,
    script,
    captions,
    boundaries:{
      generationNeedsArePlaceholders:true,
      generatedVisualsRequireTournament:true,
      productionAdmissionRequiredBeforeReplacement:true,
      paidGenerationAuthorityGranted:false,
      publicationAuthorityGranted:false,
    },
  };
}
