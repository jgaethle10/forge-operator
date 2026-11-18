import crypto from 'node:crypto';
import {
  executeStudioAgentPlan,
  type StudioAgentPlan,
  type StudioAgentExecution,
} from './studio-agent.js';
import {timelineDigest,type FallenTimelineProject,type TimelineClip,type TimelineTrack} from './timeline.js';

export const CONVERSATION_REVISION_SCHEMA='evercraft.fallen.conversational-revision.v1' as const;
export const CONVERSATION_STAGE_SCHEMA='evercraft.fallen.conversational-revision-stage.v1' as const;

export interface ConversationalRevisionRequest {
  schema:typeof CONVERSATION_REVISION_SCHEMA;
  projectId:string;
  expectedVersion:number;
  expectedProjectDigest:string;
  /** Opaque, operator-supplied scoping reference. It is NOT an authentication assertion. */
  authorizedProjectReference:string;
  instruction:string;
  selectedClipId?:string;
}
export type RevisionStatus='PROPOSED'|'NEEDS_CLARIFICATION'|'BLOCKED';
export interface RevisionProposal {
  schema:typeof CONVERSATION_REVISION_SCHEMA;
  status:RevisionStatus;
  projectId:string;
  expectedVersion:number;
  expectedProjectDigest:string;
  authorizedProjectReference:string;
  instruction:string;
  selectedClipId:string|null;
  preserveUntilSec:number;
  preservedClipIds:string[];
  visualCandidatePlan:StudioAgentPlan|null;
  audioReviewNeeds:Array<{
    clipId:string;trackId:string;instruction:string;
    humanAuditionRequired:true;existingAudioPreserved:true;
  }>;
  reasons:string[];
  proposalDigest:string;
  boundaries:{
    proposedOnly:true;
    automaticTimelineMutation:false;
    paidProviderExecutionAuthorized:false;
    publicationAuthorityGranted:false;
    finalMasterApprovalRequired:true;
    privateProjectAuthorizationMustBeVerifiedByCaller:true;
  };
}
type Located={track:TimelineTrack;clip:TimelineClip};
function stable(value:unknown):unknown{
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object')return Object.fromEntries(
    Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b))
      .map(([key,v])=>[key,stable(v)]));
  return value;
}
function hash(value:unknown){
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
function clips(project:FallenTimelineProject):Located[]{
  return project.tracks.flatMap(track=>track.clips.map(clip=>({track,clip})));
}
function isLocked(located:Located){return located.track.locked===true||located.clip.locked===true;}
function end(item:Located){return item.clip.startSec+item.clip.durationSec;}
function overlapsProtected(item:Located,until:number){return until>0&&item.clip.startSec<until&&end(item)>0;}
function preservePrefix(instruction:string):number|null{
  const match=instruction.match(/\b(?:keep|preserve|leave|don't change|do not change)\s+(?:the\s+)?(?:first|opening)\s+(\d+(?:\.\d+)?)\s*(?:seconds?|secs?)\b/i);
  return match?Number(match[1]):null;
}
function proposalDigest(input:Omit<RevisionProposal,'proposalDigest'>){return hash(input);}
function base(project:FallenTimelineProject,request:ConversationalRevisionRequest,status:RevisionStatus,reasons:string[],
  preserveUntilSec:number,selectedClipId:string|null,visualCandidatePlan:StudioAgentPlan|null,
  audioReviewNeeds:RevisionProposal['audioReviewNeeds']):RevisionProposal{
  const preservedClipIds=clips(project).filter(item=>
    !visualCandidatePlan?.operations.some(op=>op.clipId===item.clip.id)).map(item=>item.clip.id);
  const raw:Omit<RevisionProposal,'proposalDigest'>={
    schema:CONVERSATION_REVISION_SCHEMA,status,projectId:project.id,
    expectedVersion:request.expectedVersion,expectedProjectDigest:request.expectedProjectDigest,
    authorizedProjectReference:request.authorizedProjectReference,
    instruction:request.instruction,selectedClipId,preserveUntilSec,preservedClipIds,
    visualCandidatePlan,audioReviewNeeds,reasons,
    boundaries:{
      proposedOnly:true,automaticTimelineMutation:false,
      paidProviderExecutionAuthorized:false,publicationAuthorityGranted:false,
      finalMasterApprovalRequired:true,privateProjectAuthorizationMustBeVerifiedByCaller:true,
    },
  };
  return {...raw,proposalDigest:proposalDigest(raw)};
}

/** Deterministic narrow-language interpreter, not a general generative editor.
 * A request yields proposed work only. Never modifies source media or a timeline.
 */
export function proposeConversationalRevision(
  project:FallenTimelineProject,request:ConversationalRevisionRequest
):RevisionProposal{
  if(request.schema!==CONVERSATION_REVISION_SCHEMA)throw new Error('fallen_revision_request_schema_invalid');
  if(request.projectId!==project.id)throw new Error('fallen_revision_project_mismatch');
  const actualDigest=timelineDigest(project);
  if(request.expectedVersion!==project.version||request.expectedProjectDigest!==actualDigest)
    throw new Error('fallen_revision_stale_project');
  if(typeof request.authorizedProjectReference!=='string'||
     !/^private:[\w./:-]{6,140}$/.test(request.authorizedProjectReference))
    throw new Error('fallen_revision_owner_scope_reference_missing');
  const instruction=typeof request.instruction==='string'?request.instruction.trim():'';
  if(instruction.length<12||instruction.length>1200)throw new Error('fallen_revision_instruction_invalid');
  const normalized={...request,instruction};
  const keep=preservePrefix(instruction);
  const all=clips(project),total=Math.max(0,...all.map(end));
  if(keep!==null&&(!Number.isFinite(keep)||keep<=0||keep>=total))
    return base(project,normalized,'NEEDS_CLARIFICATION',['protected_time_range_invalid'],0,null,null,[]);
  const protectedSec=keep??0;
  const reasons:string[]=[];
  const voiceRequested=/\b(?:change|replace|redo|new|different|rework|adjust)\b[^.!?]{0,100}\b(?:voice|narration|voiceover)\b|\b(?:voice|narration|voiceover)\b[^.!?]{0,50}\b(?:change|replace|redo|different|rework)\b/i.test(instruction);
  const pictureRequested=/\b(?:change|make|redo|replace|improve|adjust|rework|regenerate)\b/i.test(instruction)&&
    /\b(?:ending|end|final shot|opening|intro|beginning|shot|scene)\b/i.test(instruction);
  let target:Located|null=null;
  const selectedVisualIntent=Boolean(request.selectedClipId)&&/\b(?:visual|picture|footage|cinematic|brighter|darker|exciting|shot|scene|frame|color)\b/i.test(instruction);
  if(request.selectedClipId&&(pictureRequested||selectedVisualIntent)){
    const matches=all.filter(x=>x.clip.id===request.selectedClipId&&x.track.kind==='video');
    if(matches.length!==1)reasons.push('selected_picture_clip_missing_or_ambiguous');
    else target=matches[0];
  }else if(pictureRequested){
    const pics=all.filter(x=>x.track.kind==='video');
    if(/\b(?:ending|final shot|the end)\b/i.test(instruction)){
      const final=Math.max(0,...pics.map(end));
      const matches=pics.filter(x=>Math.abs(end(x)-final)<.001);
      if(matches.length===1)target=matches[0];
      else reasons.push('ending_picture_clip_ambiguous');
    }else if(/\b(?:opening|intro|beginning)\b/i.test(instruction)){
      const first=Math.min(Infinity,...pics.map(x=>x.clip.startSec));
      const matches=pics.filter(x=>Math.abs(x.clip.startSec-first)<.001);
      if(matches.length===1)target=matches[0];
      else reasons.push('opening_picture_clip_ambiguous');
    }else reasons.push('select_the_picture_clip_to_change');
  }
  if(target&&isLocked(target))reasons.push('selected_picture_clip_locked');
  if(target&&overlapsProtected(target,protectedSec))reasons.push('selected_picture_clip_overlaps_preserved_time');
  if(request.selectedClipId&&!target&&!voiceRequested&&!reasons.length)
    reasons.push('selected_clip_change_not_understood');

  const audioReviewNeeds:RevisionProposal['audioReviewNeeds']=[];
  if(voiceRequested){
    const voiceClips=all.filter(x=>x.track.kind==='voice');
    if(!voiceClips.length)reasons.push('no_voice_track_for_voice_change');
    else if(voiceClips.some(x=>overlapsProtected(x,protectedSec)))
      reasons.push('voice_revision_overlaps_preserved_time');
    else if(voiceClips.some(isLocked))reasons.push('voice_track_or_clip_locked');
    else for(const x of voiceClips)audioReviewNeeds.push({
      clipId:x.clip.id,trackId:x.track.id,instruction,
      humanAuditionRequired:true,existingAudioPreserved:true,
    });
  }
  if(!target&&!voiceRequested&&!reasons.length)reasons.push('revision_target_not_understood');
  if(!pictureRequested&&!voiceRequested&&request.selectedClipId===undefined&&!reasons.length)
    reasons.push('revision_intent_not_understood');
  const status:RevisionStatus=reasons.length?'NEEDS_CLARIFICATION':'PROPOSED';
  const visualCandidatePlan=(!reasons.length&&target)?{
    schema:'evercraft.fallen.studio-agent-plan.v1' as const,
    projectId:project.id,expectedVersion:project.version,instruction,
    operations:[{type:'regenerate_clip' as const,clipId:target.clip.id,
      instruction,candidateCount:4,preserveTiming:true}],
    boundaries:{
      publicationAuthorityGranted:false as const,paidGenerationAuthorityGranted:false as const,
      destructiveProjectRewriteForbidden:true as const,lockedTracksRespected:true as const,
    },
  }:null;
  return base(project,normalized,status,reasons,protectedSec,target?.clip.id||null,visualCandidatePlan,
    reasons.length?[]:audioReviewNeeds);
}

export interface StagedConversationalRevision {
  schema:typeof CONVERSATION_STAGE_SCHEMA;
  status:'CANDIDATES_NEEDED'|'AUDIO_REVIEW_NEEDED'|'BLOCKED';
  projectId:string;projectDigest:string;proposalDigest:string;
  generationNeeds:StudioAgentExecution['generationNeeds'];
  audioReviewNeeds:RevisionProposal['audioReviewNeeds'];
  preservedClipIds:string[];
  reasons:string[];
  boundaries:{
    noLiveProviderCalls:true;sourceProjectUnchanged:true;
    paymentAuthority:false;publicationAuthority:false;
    originalAssetsPreserved:true;humanReviewRequired:true;
  };
}

/** Operator approval stages candidate tasks, never performs generation or final editing. */
export function stageApprovedConversationalRevision(input:{
  project:FallenTimelineProject;
  proposal:RevisionProposal;
  expectedProposalDigest:string;
  approvalReference:string;
}):StagedConversationalRevision{
  const {project,proposal,expectedProposalDigest,approvalReference}=input;
  if(typeof approvalReference!=='string'||!/^private:[\w./:-]{6,140}$/.test(approvalReference))
    throw new Error('fallen_revision_approval_reference_missing');
  const {proposalDigest:claimedDigest,...unsigned}=proposal;
  const calc=proposalDigest(unsigned);
  if(calc!==claimedDigest||calc!==expectedProposalDigest)throw new Error('fallen_revision_proposal_tampered');
  if(proposal.expectedProjectDigest!==timelineDigest(project)||proposal.expectedVersion!==project.version)
    throw new Error('fallen_revision_stale_at_approval');
  const regenerated=proposeConversationalRevision(project,{
    schema:CONVERSATION_REVISION_SCHEMA,projectId:project.id,expectedVersion:project.version,
    expectedProjectDigest:proposal.expectedProjectDigest,
    authorizedProjectReference:proposal.authorizedProjectReference,
    instruction:proposal.instruction,
    ...(proposal.selectedClipId?{selectedClipId:proposal.selectedClipId}:{})
  });
  if(regenerated.proposalDigest!==proposal.proposalDigest)throw new Error('fallen_revision_proposal_no_longer_matches');
  if(proposal.status!=='PROPOSED')throw new Error('fallen_revision_unresolved_clarification');
  const before=timelineDigest(project);
  const execution=proposal.visualCandidatePlan?
    executeStudioAgentPlan({project,plan:proposal.visualCandidatePlan}):null;
  if(execution?.status==='blocked'||(execution&&timelineDigest(execution.project)!==before))
    throw new Error('fallen_revision_cannot_mutate_existing_project');
  return {
    schema:CONVERSATION_STAGE_SCHEMA,
    status:execution?.generationNeeds.length?'CANDIDATES_NEEDED':proposal.audioReviewNeeds.length?'AUDIO_REVIEW_NEEDED':'BLOCKED',
    projectId:project.id,projectDigest:before,proposalDigest:proposal.proposalDigest,
    generationNeeds:execution?.generationNeeds??[],
    audioReviewNeeds:proposal.audioReviewNeeds,
    preservedClipIds:proposal.preservedClipIds,
    reasons:[],boundaries:{
      noLiveProviderCalls:true,sourceProjectUnchanged:true,
      paymentAuthority:false,publicationAuthority:false,
      originalAssetsPreserved:true,humanReviewRequired:true,
    },
  };
}
