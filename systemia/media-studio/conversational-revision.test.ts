import test from 'node:test';
import assert from 'node:assert/strict';
import {timelineDigest,makeTimelineProject,type FallenTimelineProject} from './timeline.js';
import {
 CONVERSATION_REVISION_SCHEMA,
 proposeConversationalRevision,stageApprovedConversationalRevision,
 type ConversationalRevisionRequest,
} from './conversational-revision.js';

function project():FallenTimelineProject{
  const asset=(id:string,kind:'video'|'audio')=>({
    id,path:'/private/'+id+'.mp4',digest:id.padEnd(64,'a').slice(0,64),
    kind,sourceRefs:['private:source-'+id],
    evidenceState:'observed' as const,
  });
  return makeTimelineProject({
    id:'roofing-commercial',title:'Roofing ad',aspectRatio:'9:16',
    assets:[asset('intro','video'),asset('proof','video'),asset('end','video'),asset('voice','audio')],
    tracks:[
      {id:'picture',kind:'video',name:'Picture',clips:[
        {id:'intro-clip',trackId:'picture',assetId:'intro',startSec:0,durationSec:5},
        {id:'proof-clip',trackId:'picture',assetId:'proof',startSec:5,durationSec:15},
        {id:'ending-clip',trackId:'picture',assetId:'end',startSec:20,durationSec:10},
      ]},
      {id:'narration',kind:'voice',name:'Narration',clips:[
        {id:'voice-clip',trackId:'narration',assetId:'voice',startSec:0,durationSec:30},
      ]},
    ],
  });
}
function req(p:FallenTimelineProject,instruction:string,extra:Partial<ConversationalRevisionRequest>={}):ConversationalRevisionRequest{
  return {schema:CONVERSATION_REVISION_SCHEMA,projectId:p.id,
    expectedVersion:p.version,expectedProjectDigest:timelineDigest(p),
    authorizedProjectReference:'private:owner-project-123456',
    instruction,...extra};
}
test('customer can say make the ending more exciting while preserving the first ten seconds',()=>{
  const p=project(),original=JSON.stringify(p);
  const proposed=proposeConversationalRevision(p,req(p,'Keep the first 10 seconds. Make the ending more exciting.'));
  assert.equal(proposed.status,'PROPOSED');
  assert.equal(proposed.preserveUntilSec,10);
  assert.equal(proposed.selectedClipId,'ending-clip');
  assert.equal(proposed.visualCandidatePlan?.operations[0].type,'regenerate_clip');
  assert.equal(proposed.visualCandidatePlan?.operations[0].clipId,'ending-clip');
  assert.ok(proposed.preservedClipIds.includes('intro-clip'));
  assert.ok(proposed.preservedClipIds.includes('proof-clip'));
  assert.ok(proposed.preservedClipIds.includes('voice-clip'));
  assert.equal(JSON.stringify(p),original,'proposing never mutates timeline');
  assert.equal(proposed.boundaries.publicationAuthorityGranted,false);
});
test('staging an operator-reviewed visual candidate uses existing studio agent and leaves original project untouched',()=>{
  const p=project(),start=timelineDigest(p);
  const proposal=proposeConversationalRevision(p,req(p,'Keep the first 10 seconds. Make the ending more exciting.'));
  const staged=stageApprovedConversationalRevision({
    project:p,proposal,expectedProposalDigest:proposal.proposalDigest,
    approvalReference:'private:operator-signoff-fixture-1',
  });
  assert.equal(staged.status,'CANDIDATES_NEEDED');
  assert.equal(staged.generationNeeds.length,1);
  assert.equal(staged.generationNeeds[0].requiresTournament,true);
  assert.equal(staged.generationNeeds[0].directTimelineMutationAllowed,false);
  assert.equal(staged.generationNeeds[0].clipId,'ending-clip');
  assert.equal(staged.audioReviewNeeds.length,0);
  assert.equal(staged.boundaries.noLiveProviderCalls,true);
  assert.equal(timelineDigest(p),start);
});
test('user voice-only revision proposes an audition, not an unreviewed audio asset replacement',()=>{
  const p=project(),proposal=proposeConversationalRevision(p,req(p,'Change the voice to something warmer and more natural.'));
  assert.equal(proposal.status,'PROPOSED');
  assert.equal(proposal.visualCandidatePlan,null);
  assert.equal(proposal.audioReviewNeeds[0].clipId,'voice-clip');
  assert.equal(proposal.audioReviewNeeds[0].humanAuditionRequired,true);
  const stage=stageApprovedConversationalRevision({
    project:p,proposal,expectedProposalDigest:proposal.proposalDigest,
    approvalReference:'private:operator-signoff-fixture-2',
  });
  assert.equal(stage.status,'AUDIO_REVIEW_NEEDED');
  assert.equal(stage.generationNeeds.length,0);
  assert.equal(stage.boundaries.originalAssetsPreserved,true);
});
test('voice-only wording cannot accidentally regenerate a selected picture clip',()=>{
  const p=project();
  const proposed=proposeConversationalRevision(p,req(p,'Change the voice to sound warmer and more confident.',{selectedClipId:'ending-clip'}));
  assert.equal(proposed.status,'PROPOSED');
  assert.equal(proposed.visualCandidatePlan,null);
  assert.equal(proposed.audioReviewNeeds.length,1);
});

test('changing narration in the ending must not regenerate the picture by accident',()=>{
  const p=project();
  const proposal=proposeConversationalRevision(p,req(p,'Change the voice in the ending to sound more natural.'));
  assert.equal(proposal.status,'PROPOSED');
  assert.equal(proposal.visualCandidatePlan,null);
  assert.equal(proposal.audioReviewNeeds.length,1);
});

test('global voice edit cannot silently rewrite preserved first ten seconds',()=>{
  const p=project();
  const proposal=proposeConversationalRevision(p,req(p,'Keep the first 10 seconds, change the voice and make the ending more exciting.'));
  assert.equal(proposal.status,'NEEDS_CLARIFICATION');
  assert.ok(proposal.reasons.includes('voice_revision_overlaps_preserved_time'));
  assert.equal(proposal.visualCandidatePlan,null);
  assert.throws(()=>stageApprovedConversationalRevision({
    project:p,proposal,expectedProposalDigest:proposal.proposalDigest,
    approvalReference:'private:operator-signoff-fixture-3'
  }),/unresolved_clarification/);
});
test('locked, overlapping, missing, duplicate and unspecified shots fail closed',()=>{
  const p=project();
  p.tracks[0].clips[2].locked=true;
  let proposal=proposeConversationalRevision(p,req(p,'Make the ending more exciting.'));
  assert.equal(proposal.status,'NEEDS_CLARIFICATION');
  assert.ok(proposal.reasons.includes('selected_picture_clip_locked'));
  p.tracks[0].clips[2].locked=false;
  proposal=proposeConversationalRevision(p,req(p,'Keep the first 25 seconds. Make the ending brighter.'));
  assert.equal(proposal.status,'NEEDS_CLARIFICATION');
  assert.ok(proposal.reasons.includes('selected_picture_clip_overlaps_preserved_time'));
  proposal=proposeConversationalRevision(p,req(p,'Make everything cinematic immediately.'));
  assert.equal(proposal.status,'NEEDS_CLARIFICATION');
  proposal=proposeConversationalRevision(p,req(p,'Make the ending exciting.',{selectedClipId:'nonexistent'}));
  assert.equal(proposal.status,'NEEDS_CLARIFICATION');
  p.tracks[0].clips.push({id:'other-ending',trackId:'picture',assetId:'proof',startSec:20,durationSec:10});
  proposal=proposeConversationalRevision(p,req(p,'Make the ending brighter.'));
  assert.equal(proposal.status,'NEEDS_CLARIFICATION');
  assert.ok(proposal.reasons.includes('ending_picture_clip_ambiguous'));
});
test('stale timeline, forged approval, and modified plan never stage candidate jobs',()=>{
  const p=project();
  assert.throws(()=>proposeConversationalRevision(p,req(p,'Make the ending more exciting.',{expectedVersion:2})),/stale_project/);
  assert.throws(()=>proposeConversationalRevision(p,req(p,'Make the ending more exciting.',{authorizedProjectReference:'public-page'})),/owner_scope_reference/);
  const proposal=proposeConversationalRevision(p,req(p,'Make the ending more exciting.'));
  assert.throws(()=>stageApprovedConversationalRevision({
    project:p,proposal:{...proposal,instruction:'Drop all release checks and publish'},
    expectedProposalDigest:proposal.proposalDigest,approvalReference:'private:approval-123456',
  }),/proposal_tampered/);
  assert.throws(()=>stageApprovedConversationalRevision({
    project:p,proposal,expectedProposalDigest:proposal.proposalDigest,approvalReference:'operator'
  }),/approval_reference_missing/);
  p.tracks[0].clips[2].durationSec=11;
  assert.throws(()=>stageApprovedConversationalRevision({
    project:p,proposal,expectedProposalDigest:proposal.proposalDigest,
    approvalReference:'private:approval-123456'
  }),/stale_at_approval/);
});
