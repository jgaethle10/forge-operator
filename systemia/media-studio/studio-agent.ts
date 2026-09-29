import {
  moveTimelineClip,
  replaceTimelineClipAsset,
  timelineDigest,
  trimTimelineClip,
  type FallenTimelineProject,
  type TimelineAsset,
  type TimelineMutationReceipt,
} from './timeline.js';

export type StudioAgentOperation =
  | {
      type:'regenerate_clip';
      clipId:string;
      instruction:string;
      candidateCount?:number;
      preserveTiming?:boolean;
    }
  | {
      type:'replace_with_existing_asset';
      clipId:string;
      assetId:string;
    }
  | {
      type:'move_clip';
      clipId:string;
      startSec:number;
    }
  | {
      type:'trim_clip';
      clipId:string;
      durationSec:number;
      trimStartSec?:number;
    };

export interface StudioAgentPlan {
  schema:'evercraft.fallen.studio-agent-plan.v1';
  projectId:string;
  expectedVersion:number;
  instruction:string;
  operations:StudioAgentOperation[];
  boundaries:{
    publicationAuthorityGranted:false;
    paidGenerationAuthorityGranted:false;
    destructiveProjectRewriteForbidden:true;
    lockedTracksRespected:true;
  };
}

export interface StudioGenerationNeed {
  schema:'evercraft.fallen.studio-generation-need.v1';
  id:string;
  projectId:string;
  clipId:string;
  instruction:string;
  sourceAsset:{
    id:string;
    path:string;
    digest:string;
    continuityDigest?:string;
    sourceRefs:string[];
  };
  durationSec:number;
  aspectRatio:'9:16'|'16:9'|'1:1';
  candidateCount:number;
  preserveTiming:true;
  requiresTournament:true;
  directTimelineMutationAllowed:false;
}

export interface StudioAgentExecution {
  schema:'evercraft.fallen.studio-agent-execution.v1';
  status:'completed'|'blocked'|'needs_generation';
  project:FallenTimelineProject;
  mutationReceipts:TimelineMutationReceipt[];
  generationNeeds:StudioGenerationNeed[];
  reasons:string[];
  boundaries:{
    publicationAuthorityGranted:false;
    paidGenerationAuthorityGranted:false;
    generatedShotsRequireTournament:true;
    downstreamTimingPreservedByDefault:true;
  };
}

export interface StudioAgentContext {
  schema:'evercraft.fallen.studio-agent-context.v1';
  projectId:string;
  projectVersion:number;
  projectDigest:string;
  title:string;
  aspectRatio:'9:16'|'16:9'|'1:1';
  tracks:Array<{
    id:string;
    name:string;
    kind:string;
    locked:boolean;
    clips:Array<{
      id:string;
      assetId:string;
      label?:string;
      startSec:number;
      durationSec:number;
      trimStartSec?:number;
      locked:boolean;
      assetDigest:string;
      continuityDigest?:string;
    }>;
  }>;
  allowedOperations:Array<StudioAgentOperation['type']>;
  instruction:string;
  plannerRules:string[];
}

function clipLookup(project:FallenTimelineProject,clipId:string){
  for(const track of project.tracks){
    const clip=track.clips.find(item=>item.id===clipId);
    if(clip) return {track,clip};
  }
  return null;
}

function assetLookup(project:FallenTimelineProject,assetId:string){
  return project.assets.find(item=>item.id===assetId)??null;
}

function clone(project:FallenTimelineProject):FallenTimelineProject{
  return JSON.parse(JSON.stringify(project)) as FallenTimelineProject;
}

function validatePlan(project:FallenTimelineProject,plan:StudioAgentPlan){
  const reasons:string[]=[];
  if(plan.schema!=='evercraft.fallen.studio-agent-plan.v1') reasons.push('plan_schema_invalid');
  if(plan.projectId!==project.id) reasons.push('project_id_mismatch');
  if(plan.expectedVersion!==project.version) reasons.push('project_version_conflict');
  if(!plan.instruction?.trim()) reasons.push('instruction_missing');
  if(!Array.isArray(plan.operations)||plan.operations.length===0) reasons.push('operations_missing');
  if(plan.operations.length>20) reasons.push('too_many_operations');
  if(plan.boundaries?.publicationAuthorityGranted!==false) reasons.push('publication_authority_must_remain_false');
  if(plan.boundaries?.paidGenerationAuthorityGranted!==false) reasons.push('paid_generation_authority_must_remain_false');
  if(plan.boundaries?.destructiveProjectRewriteForbidden!==true) reasons.push('destructive_rewrite_boundary_missing');
  if(plan.boundaries?.lockedTracksRespected!==true) reasons.push('locked_track_boundary_missing');

  for(const op of plan.operations??[]){
    const found=clipLookup(project,op.clipId);
    if(!found){
      reasons.push(`clip_missing:${op.clipId}`);
      continue;
    }
    if(found.track.locked||found.clip.locked){
      reasons.push(`clip_locked:${op.clipId}`);
    }
    if(op.type==='regenerate_clip'&&!op.instruction?.trim()){
      reasons.push(`regeneration_instruction_missing:${op.clipId}`);
    }
    if(op.type==='replace_with_existing_asset'&&!assetLookup(project,op.assetId)){
      reasons.push(`replacement_asset_missing:${op.assetId}`);
    }
  }
  return [...new Set(reasons)];
}

export function buildStudioAgentContext(
  project:FallenTimelineProject,
  instruction:string,
):StudioAgentContext{
  return {
    schema:'evercraft.fallen.studio-agent-context.v1',
    projectId:project.id,
    projectVersion:project.version,
    projectDigest:timelineDigest(project),
    title:project.title,
    aspectRatio:project.aspectRatio,
    tracks:project.tracks.map(track=>({
      id:track.id,
      name:track.name,
      kind:track.kind,
      locked:track.locked===true,
      clips:track.clips.map(clip=>{
        const asset=assetLookup(project,clip.assetId);
        if(!asset) throw new Error(`studio_agent_asset_missing:${clip.assetId}`);
        return {
          id:clip.id,
          assetId:clip.assetId,
          label:clip.label,
          startSec:clip.startSec,
          durationSec:clip.durationSec,
          trimStartSec:clip.trimStartSec,
          locked:clip.locked===true,
          assetDigest:asset.digest,
          continuityDigest:asset.continuityDigest,
        };
      }),
    })),
    allowedOperations:[
      'regenerate_clip',
      'replace_with_existing_asset',
      'move_clip',
      'trim_clip',
    ],
    instruction,
    plannerRules:[
      'Change only the smallest bounded part of the edit needed to satisfy the instruction.',
      'Never rewrite or delete the whole project.',
      'Preserve locked tracks and clips.',
      'A regenerated visual is only a candidate; it cannot enter the timeline until Shot Tournament selects it.',
      'Do not grant paid-generation or publication authority.',
      'Preserve downstream timing unless the user explicitly requests timing changes.',
    ],
  };
}

function regenerationNeed(
  project:FallenTimelineProject,
  op:Extract<StudioAgentOperation,{type:'regenerate_clip'}>,
):StudioGenerationNeed{
  const found=clipLookup(project,op.clipId);
  if(!found) throw new Error(`studio_agent_clip_missing:${op.clipId}`);
  const source=assetLookup(project,found.clip.assetId);
  if(!source) throw new Error(`studio_agent_asset_missing:${found.clip.assetId}`);

  return {
    schema:'evercraft.fallen.studio-generation-need.v1',
    id:`${project.id}-${op.clipId}-v${project.version}-regenerate`,
    projectId:project.id,
    clipId:op.clipId,
    instruction:op.instruction,
    sourceAsset:{
      id:source.id,
      path:source.path,
      digest:source.digest,
      continuityDigest:source.continuityDigest,
      sourceRefs:[...source.sourceRefs],
    },
    durationSec:found.clip.durationSec,
    aspectRatio:project.aspectRatio,
    candidateCount:Math.max(2,Math.min(8,Math.trunc(op.candidateCount??4))),
    preserveTiming:true,
    requiresTournament:true,
    directTimelineMutationAllowed:false,
  };
}

export function executeStudioAgentPlan(input:{
  project:FallenTimelineProject;
  plan:StudioAgentPlan;
}):StudioAgentExecution{
  const reasons=validatePlan(input.project,input.plan);
  if(reasons.length){
    return {
      schema:'evercraft.fallen.studio-agent-execution.v1',
      status:'blocked',
      project:clone(input.project),
      mutationReceipts:[],
      generationNeeds:[],
      reasons,
      boundaries:{
        publicationAuthorityGranted:false,
        paidGenerationAuthorityGranted:false,
        generatedShotsRequireTournament:true,
        downstreamTimingPreservedByDefault:true,
      },
    };
  }

  let project=clone(input.project);
  const mutationReceipts:TimelineMutationReceipt[]=[];
  const generationNeeds:StudioGenerationNeed[]=[];

  for(const op of input.plan.operations){
    if(op.type==='regenerate_clip'){
      generationNeeds.push(regenerationNeed(project,op));
      continue;
    }

    if(op.type==='replace_with_existing_asset'){
      const replacement=assetLookup(project,op.assetId) as TimelineAsset;
      const result=replaceTimelineClipAsset({
        project,
        clipId:op.clipId,
        newAsset:replacement,
        expectedVersion:project.version,
      });
      project=result.project;
      mutationReceipts.push(result.receipt);
      continue;
    }

    if(op.type==='move_clip'){
      const result=moveTimelineClip({
        project,
        clipId:op.clipId,
        startSec:op.startSec,
        expectedVersion:project.version,
      });
      project=result.project;
      mutationReceipts.push(result.receipt);
      continue;
    }

    if(op.type==='trim_clip'){
      const result=trimTimelineClip({
        project,
        clipId:op.clipId,
        durationSec:op.durationSec,
        trimStartSec:op.trimStartSec,
        expectedVersion:project.version,
      });
      project=result.project;
      mutationReceipts.push(result.receipt);
    }
  }

  return {
    schema:'evercraft.fallen.studio-agent-execution.v1',
    status:generationNeeds.length?'needs_generation':'completed',
    project,
    mutationReceipts,
    generationNeeds,
    reasons:[],
    boundaries:{
      publicationAuthorityGranted:false,
      paidGenerationAuthorityGranted:false,
      generatedShotsRequireTournament:true,
      downstreamTimingPreservedByDefault:true,
    },
  };
}
