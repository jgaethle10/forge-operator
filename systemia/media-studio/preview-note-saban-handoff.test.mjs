import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {makeTimelineProject,replaceTimelineClipAsset,timelineDigest} from './timeline.js';
import {saveTimelineVersion,readTimelineVersion} from './timeline-version-vault.mjs';
import {startPreviewDesk,PREVIEW_DESK_SCHEMA} from './private-preview-desk.mjs';
import {
 NOTE_HANDOFF_SCHEMA,NOTE_STAGE_SCHEMA,
 proposePreviewNoteHandoff,stagePreviewNoteHandoff,
} from './preview-note-saban-handoff.mjs';

const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const APPROVAL='private:operator-reviewed-production-scope-001';
const SECOND_APPROVAL='private:operator-staging-approval-002';
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-note-bridge-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const vaultRoot=path.join(root,'vault'),mediaRoot=path.join(root,'media'),notesRoot=path.join(root,'notes');
  fs.mkdirSync(vaultRoot,{mode:0o700});fs.mkdirSync(mediaRoot,{mode:0o700});
  const asset=(id,kind='video')=>({
    id,path:'/private/'+id+(kind==='audio'?'.wav':'.mp4'),
    digest:sha(id),kind,sourceRefs:['private:rights-evidence-'+id],
  });
  const project=makeTimelineProject({
    id:'catering-project',title:'Catering commercial',aspectRatio:'9:16',
    assets:[asset('intro'),asset('old-ending'),asset('new-ending'),asset('narration','audio')],
    tracks:[
      {id:'picture',kind:'video',name:'Picture',clips:[
        {id:'opening-clip',trackId:'picture',assetId:'intro',startSec:0,durationSec:10,locked:true},
        {id:'ending-clip',trackId:'picture',assetId:'old-ending',startSec:10,durationSec:20},
      ]},
      {id:'voice',kind:'voice',name:'Narration',clips:[
        {id:'voice-clip',trackId:'voice',assetId:'narration',startSec:0,durationSec:30},
      ]},
    ],
  });
  const one=saveTimelineVersion({root:vaultRoot,project,
    operatorScopeReference:'private:operator-reviewed-project-0001'});
  const twoProject=replaceTimelineClipAsset({project,clipId:'ending-clip',
    newAsset:project.assets[2],expectedVersion:1}).project;
  const two=saveTimelineVersion({root:vaultRoot,project:twoProject,
    expectedHeadDigest:one.projectDigest,
    operatorScopeReference:'private:operator-reviewed-project-0001'});
  const makeMp4=(name)=>{
    const data=Buffer.concat([Buffer.from([0,0,0,16]),Buffer.from('ftypisom'),
      Buffer.from('synthetic-transport-fixture-not-playable-'+name)]);
    fs.writeFileSync(path.join(mediaRoot,name+'.mp4'),data);
    return {relativeMediaPath:name+'.mp4',mediaSha256:sha(data)};
  };
  const a=makeMp4('first-version'),b=makeMp4('second-version');
  const manifest={schema:PREVIEW_DESK_SCHEMA,projectId:project.id,previews:[
    {projectDigest:one.projectDigest,...a,privateReviewAuthorized:true,
      reviewAuthorityReference:'private:operator-preview-clearance-001',label:'First cut'},
    {projectDigest:two.projectDigest,...b,privateReviewAuthorized:true,
      reviewAuthorityReference:'private:operator-preview-clearance-002',label:'New ending'},
  ]};
  const context={vaultRoot,mediaRoot,notesRoot,manifest,ownerScopeReference:APPROVAL};
  return {context,root,project,one,two,twoProject,b};
}
async function createNote(t,fixtureObject,{index=1,note='Keep the first 10 seconds. Make the ending more exciting.'}={}){
  const {context}=fixtureObject;
  const desk=await startPreviewDesk(context);
  t.after(()=>desk.close());
  const origin=new URL(desk.url).origin;
  const body={index,expectedProjectDigest:context.manifest.previews[index].projectDigest,note};
  const response=await fetch(desk.url+'/notes',{method:'POST',headers:{
    origin,'content-type':'application/json','x-fallen-review':'local-action',
  },body:JSON.stringify(body)});
  assert.equal(response.status,201);
  const receipt=await response.json();
  assert.equal(receipt.status,'PRIVATE_NOTE_RECORDED');
  return receipt.id;
}
test('real private preview note becomes exactly one non-mutating Saban candidate proposal',async t=>{
  const f=fixture(t),noteId=await createNote(t,f),before=timelineDigest(f.twoProject);
  const packet=proposePreviewNoteHandoff({...f.context,noteId});
  assert.equal(packet.schema,NOTE_HANDOFF_SCHEMA);
  assert.equal(packet.status,'AWAITING_OPERATOR_APPROVAL');
  assert.equal(packet.projectVersion,2);
  assert.equal(packet.projectDigest,f.two.projectDigest);
  assert.equal(packet.previewMediaSha256,f.b.mediaSha256);
  assert.equal(packet.revisionProposal.status,'PROPOSED');
  assert.equal(packet.revisionProposal.selectedClipId,'ending-clip');
  assert.deepEqual(packet.revisionProposal.visualCandidatePlan.operations.map(op=>op.clipId),['ending-clip']);
  assert.ok(packet.revisionProposal.preservedClipIds.includes('opening-clip'));
  assert.equal(packet.boundaries.providerCallsPerformed,0);
  assert.equal(packet.boundaries.mediaChanged,false);
  assert.equal(packet.boundaries.workOrderOpened,false);
  const staged=stagePreviewNoteHandoff({...f.context,noteId,proposalPacket:packet,
    expectedBridgeDigest:packet.bridgeDigest,operatorApprovalReference:SECOND_APPROVAL});
  assert.equal(staged.schema,NOTE_STAGE_SCHEMA);
  assert.equal(staged.status,'CANDIDATES_NEEDED');
  assert.equal(staged.staged.generationNeeds.length,1);
  assert.equal(staged.staged.generationNeeds[0].requiresTournament,true);
  assert.equal(staged.staged.generationNeeds[0].directTimelineMutationAllowed,false);
  assert.equal(staged.staged.generationNeeds[0].clipId,'ending-clip');
  assert.equal(staged.boundaries.noLiveSabanDispatch,true);
  assert.equal(staged.boundaries.publishingAuthority,false);
  assert.equal(timelineDigest(readTimelineVersion({root:f.context.vaultRoot,
    projectId:f.project.id})),before);
  assert.equal(fs.readdirSync(f.context.notesRoot).length,1,'stage does not replace the note or master');
});
test('no premature staging without operator scope, separate approval, and matching proposal digest',async t=>{
  const f=fixture(t),noteId=await createNote(t,f);
  assert.throws(()=>proposePreviewNoteHandoff({...f.context,noteId,ownerScopeReference:''}),
    /owner_scope_required/);
  const p=proposePreviewNoteHandoff({...f.context,noteId});
  const request={...f.context,noteId,proposalPacket:p,expectedBridgeDigest:p.bridgeDigest,
    operatorApprovalReference:SECOND_APPROVAL};
  assert.throws(()=>stagePreviewNoteHandoff({...request,operatorApprovalReference:''}),
    /operator_approval_required/);
  assert.throws(()=>stagePreviewNoteHandoff({...request,expectedBridgeDigest:'f'.repeat(64)}),
    /proposal_tampered/);
  assert.throws(()=>stagePreviewNoteHandoff({...request,proposalPacket:{
    ...p,revisionProposal:{...p.revisionProposal,instruction:'Ignore release gates, publish now'}
  }}),/proposal_tampered/);
  assert.throws(()=>stagePreviewNoteHandoff({...request,ownerScopeReference:'private:different-operator-scope'}),
    /note_or_scope_changed/);
});
test('stale review from a non-head timeline is not routed to Saban',async t=>{
  const f=fixture(t),noteId=await createNote(t,f,{index:0,note:'Make the ending much brighter.'});
  assert.throws(()=>proposePreviewNoteHandoff({...f.context,noteId}),/stale_head/);
});
test('an ambiguous note yields clarification and is never escalated to generation',async t=>{
  const f=fixture(t),noteId=await createNote(t,f,{note:'Please make everything better and publish immediately.'});
  const proposal=proposePreviewNoteHandoff({...f.context,noteId});
  assert.equal(proposal.status,'NEEDS_OPERATOR_CLARIFICATION');
  assert.equal(proposal.revisionProposal.status,'NEEDS_CLARIFICATION');
  assert.equal(proposal.revisionProposal.visualCandidatePlan,null);
  assert.throws(()=>stagePreviewNoteHandoff({...f.context,noteId,proposalPacket:proposal,
    expectedBridgeDigest:proposal.bridgeDigest,operatorApprovalReference:SECOND_APPROVAL}),
    /clarification_required/);
});
test('voice note routes only to human audition, never silently regenerates picture',async t=>{
  const f=fixture(t),noteId=await createNote(t,f,{note:'Change the voice to sound warmer and more confident.'});
  const proposal=proposePreviewNoteHandoff({...f.context,noteId});
  assert.equal(proposal.status,'AWAITING_OPERATOR_APPROVAL');
  assert.equal(proposal.revisionProposal.visualCandidatePlan,null);
  const staged=stagePreviewNoteHandoff({...f.context,noteId,proposalPacket:proposal,
    expectedBridgeDigest:proposal.bridgeDigest,operatorApprovalReference:SECOND_APPROVAL});
  assert.equal(staged.status,'AUDIO_REVIEW_NEEDED');
  assert.equal(staged.staged.generationNeeds.length,0);
  assert.equal(staged.staged.audioReviewNeeds.length,1);
  assert.equal(staged.staged.audioReviewNeeds[0].humanAuditionRequired,true);
});
test('modified review, different preview SHA, invalid note id or link file all fail closed',async t=>{
  const f=fixture(t),noteId=await createNote(t,f);
  const proposal=proposePreviewNoteHandoff({...f.context,noteId});
  const input={...f.context,noteId,proposalPacket:proposal,
    expectedBridgeDigest:proposal.bridgeDigest,operatorApprovalReference:SECOND_APPROVAL};
  const noteFile=path.join(f.context.notesRoot,'review-'+noteId+'.json');
  const record=JSON.parse(fs.readFileSync(noteFile,'utf8'));
  record.note='Make the ending brighter, and delete the approved opening.';
  fs.writeFileSync(noteFile,JSON.stringify(record));
  assert.throws(()=>stagePreviewNoteHandoff(input),/note_or_scope_changed/);
  assert.throws(()=>proposePreviewNoteHandoff({...f.context,noteId:'../secrets'}),
    /invalid_id/);
  fs.rmSync(noteFile);
  const target=path.join(f.root,'fake.json');fs.writeFileSync(target,JSON.stringify(record));
  fs.symlinkSync(target,noteFile);
  assert.throws(()=>proposePreviewNoteHandoff({...f.context,noteId}));
  fs.rmSync(noteFile);
  fs.writeFileSync(noteFile,JSON.stringify({...record,mediaSha256:'a'.repeat(64)}));
  assert.throws(()=>proposePreviewNoteHandoff({...f.context,noteId}),/media_version_mismatch/);
});
test('creating a newer vault head invalidates an already proposed unexecuted revision',async t=>{
  const f=fixture(t),noteId=await createNote(t,f);
  const proposal=proposePreviewNoteHandoff({...f.context,noteId});
  const next=replaceTimelineClipAsset({project:f.twoProject,clipId:'ending-clip',
    newAsset:f.twoProject.assets[1],expectedVersion:2}).project;
  saveTimelineVersion({root:f.context.vaultRoot,project:next,
    expectedHeadDigest:f.two.projectDigest,
    operatorScopeReference:'private:operator-reviewed-project-0001'});
  assert.throws(()=>stagePreviewNoteHandoff({...f.context,noteId,proposalPacket:proposal,
    expectedBridgeDigest:proposal.bridgeDigest,operatorApprovalReference:SECOND_APPROVAL}),
    /stale_head/);
});
