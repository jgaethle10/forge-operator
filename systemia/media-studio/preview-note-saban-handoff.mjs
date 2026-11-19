#!/usr/bin/env node
// Fallen: operator-local note -> verified timeline -> bounded Saban candidate plan.
// An untrusted customer review note is DATA. It NEVER authorizes provider calls,
// video mutation, payments, publishing, or customer communication.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readTimelineVersion,readTimelineVersionHistory} from './timeline-version-vault.mjs';
import {PREVIEW_NOTE_SCHEMA,preparePreviewDesk} from './private-preview-desk.mjs';
import {
  CONVERSATION_REVISION_SCHEMA,
  proposeConversationalRevision,
  stageApprovedConversationalRevision,
} from './conversational-revision.ts';

export const NOTE_HANDOFF_SCHEMA='evercraft.fallen.preview-note-handoff.v1';
export const NOTE_STAGE_SCHEMA='evercraft.fallen.preview-note-stage.v1';
const SHA=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const PRIVATE=/^private:[A-Za-z0-9_./:-]{6,140}$/;
const stable=value=>Array.isArray(value)?value.map(stable):
  value&&typeof value==='object'?Object.fromEntries(
    Object.entries(value).sort(([a],[b])=>a.localeCompare(b))
      .map(([key,item])=>[key,stable(item)])):value;
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
function fileJson(filename,maxBytes=65536){
  const flags=fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0);
  const fd=fs.openSync(filename,flags);
  try{
    const stat=fs.fstatSync(fd);
    if(!stat.isFile()||stat.size===0||stat.size>maxBytes)
      throw Error('fallen_note_handoff_unsafe_file');
    return JSON.parse(fs.readFileSync(fd,'utf8'));
  }finally{fs.closeSync(fd);}
}
function notesDirectory(root){
  const resolved=path.resolve(root);
  const stat=fs.lstatSync(resolved);
  if(stat.isSymbolicLink()||!stat.isDirectory())throw Error('fallen_note_handoff_unsafe_notes_directory');
  return resolved;
}
function inspectBoundNote({vaultRoot,mediaRoot,notesRoot,manifest,noteId}){
  if(!UUID.test(noteId||''))throw Error('fallen_note_handoff_invalid_id');
  const folder=notesDirectory(notesRoot);
  const raw=fileJson(path.join(folder,'review-'+noteId+'.json'),8192);
  if(raw?.schema!==PREVIEW_NOTE_SCHEMA||raw.id!==noteId||
    raw.projectId!==manifest?.projectId||!Number.isSafeInteger(raw.projectVersion)||
    !SHA.test(raw.projectDigest||'')||!SHA.test(raw.mediaSha256||'')||
    raw.state!=='PRIVATE_OPERATOR_REVIEW_REQUIRED'||
    raw.sabanExecution!==false||raw.videoEdited!==false||
    raw.clientApproved!==false||raw.published!==false||raw.paymentRequested!==false||
    !Number.isFinite(Date.parse(raw.createdAt))||
    typeof raw.note!=='string'||raw.note.trim().length<12||raw.note.trim().length>800)
    throw Error('fallen_note_handoff_invalid_review_note');
  const desk=preparePreviewDesk({vaultRoot,mediaRoot,notesRoot,manifest});
  const selected=desk.previews.filter(p=>p.digest===raw.projectDigest&&
    p.mediaSha256===raw.mediaSha256&&p.version===raw.projectVersion);
  if(selected.length!==1)throw Error('fallen_note_handoff_media_version_mismatch');
  const history=readTimelineVersionHistory({root:vaultRoot,projectId:raw.projectId});
  if(history.head?.version!==raw.projectVersion||history.head?.projectDigest!==raw.projectDigest)
    throw Error('fallen_note_handoff_stale_head');
  const project=readTimelineVersion({root:vaultRoot,projectId:raw.projectId,projectDigest:raw.projectDigest});
  return {raw,project,noteDigest:digest(raw),selected:selected[0]};
}
function proposalHash(packet){
  const {bridgeDigest,...unsigned}=packet;
  return digest(unsigned);
}
/** Proposal only. Requires an operator-selected owner scope, not customer text authority. */
export function proposePreviewNoteHandoff(input){
  if(!PRIVATE.test(input?.ownerScopeReference||''))
    throw Error('fallen_note_handoff_owner_scope_required');
  const {raw,project,noteDigest,selected}=inspectBoundNote(input);
  const proposal=proposeConversationalRevision(project,{
    schema:CONVERSATION_REVISION_SCHEMA,projectId:project.id,
    expectedVersion:project.version,expectedProjectDigest:raw.projectDigest,
    authorizedProjectReference:input.ownerScopeReference,
    instruction:raw.note,
  });
  const packet={
    schema:NOTE_HANDOFF_SCHEMA,
    status:proposal.status==='PROPOSED'?'AWAITING_OPERATOR_APPROVAL':'NEEDS_OPERATOR_CLARIFICATION',
    projectId:project.id,projectVersion:project.version,
    projectDigest:raw.projectDigest,previewMediaSha256:raw.mediaSha256,
    noteId:raw.id,noteDigest,previewVersionLabel:selected.label,
    ownerScopeReference:input.ownerScopeReference,
    revisionProposal:proposal,
    boundaries:{
      noteIsUntrustedCustomerData:true,ownerScopeReferenceNotCryptographicallyAuthenticated:true,
      readOnlyUntilOperatorApproval:true,providerCallsPerformed:0,mediaChanged:false,
      projectVersionAdvanced:false,workOrderOpened:false,
      clientMessaged:false,paymentAuthority:false,publishingAuthority:false,
    },
  };
  return {...packet,bridgeDigest:proposalHash(packet)};
}
/** Revalidate the unchanged note, actual media SHA and current vault head before
 * staging ONLY candidate needs via the existing Studio Agent. No live jobs run.
 */
export function stagePreviewNoteHandoff(input){
  const {expectedBridgeDigest,proposalPacket,operatorApprovalReference,...context}=input||{};
  if(!PRIVATE.test(operatorApprovalReference||''))
    throw Error('fallen_note_handoff_operator_approval_required');
  if(!SHA.test(expectedBridgeDigest||'')||
    proposalPacket?.schema!==NOTE_HANDOFF_SCHEMA||
    proposalPacket?.bridgeDigest!==expectedBridgeDigest||
    proposalHash(proposalPacket)!==expectedBridgeDigest)
    throw Error('fallen_note_handoff_proposal_tampered');
  const current=proposePreviewNoteHandoff(context);
  if(current.bridgeDigest!==expectedBridgeDigest)
    throw Error('fallen_note_handoff_note_or_scope_changed');
  if(current.status!=='AWAITING_OPERATOR_APPROVAL')
    throw Error('fallen_note_handoff_clarification_required');
  const {project}=inspectBoundNote(context);
  const staged=stageApprovedConversationalRevision({
    project,proposal:current.revisionProposal,
    expectedProposalDigest:current.revisionProposal.proposalDigest,
    approvalReference:operatorApprovalReference,
  });
  return {
    schema:NOTE_STAGE_SCHEMA,status:staged.status,
    projectId:project.id,projectDigest:current.projectDigest,projectVersion:project.version,
    noteId:current.noteId,noteDigest:current.noteDigest,previewMediaSha256:current.previewMediaSha256,
    bridgeDigest:current.bridgeDigest,operatorApprovalReference,staged,
    boundaries:{
      operatorApprovalReferenceNotCryptographicallyAuthenticated:true,
      noLiveSabanDispatch:true,noProviderCalls:true,noGeneratedMedia:true,
      originalVaultHeadUnchanged:true,sourceAssetsPreserved:true,
      humanTournamentAndMediaQualityStillRequired:true,
      paymentAuthority:false,publishingAuthority:false,customerDelivery:false,
    },
  };
}
function writePrivatePacket(filename,value){
  const resolved=path.resolve(filename);
  const dir=path.dirname(resolved);
  const stat=fs.lstatSync(dir);
  if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('fallen_note_handoff_output_directory_unsafe');
  fs.writeFileSync(resolved,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
}
async function cli(){
  const [mode,configFile,noteId,third,fourth,fifth]=process.argv.slice(2);
  if(!['propose','stage'].includes(mode)||!configFile||!noteId)
    throw Error('Usage: node --import tsx preview-note-saban-handoff.mjs propose <private-config.json> <note-id> <output.json> | stage <private-config.json> <note-id> <proposal.json> <private:approval-ref> <output.json>');
  const config=fileJson(path.resolve(configFile),16384);
  if(config?.schema!=='evercraft.fallen.private-note-operator-config.v1')
    throw Error('fallen_note_handoff_config_invalid');
  const context={vaultRoot:config.vaultRoot,mediaRoot:config.mediaRoot,
    notesRoot:config.notesRoot,manifest:config.manifest,noteId,
    ownerScopeReference:config.ownerScopeReference};
  if(mode==='propose'){
    if(!third||fourth||fifth)throw Error('fallen_note_handoff_propose_args_invalid');
    const proposal=proposePreviewNoteHandoff(context);
    writePrivatePacket(third,proposal);
    console.log(JSON.stringify({status:proposal.status,projectId:proposal.projectId,
      noteId:proposal.noteId,outputPath:path.resolve(third),providerCalls:0,published:false}));
    return;
  }
  if(!third||!fourth||!fifth)throw Error('fallen_note_handoff_stage_args_invalid');
  const proposalPacket=fileJson(path.resolve(third),65536);
  const staged=stagePreviewNoteHandoff({...context,
    proposalPacket,expectedBridgeDigest:proposalPacket.bridgeDigest,
    operatorApprovalReference:fourth});
  writePrivatePacket(fifth,staged);
  console.log(JSON.stringify({status:staged.status,projectId:staged.projectId,
    noteId:staged.noteId,outputPath:path.resolve(fifth),providerCalls:0,published:false}));
}
if(process.argv[1]&&import.meta.url===new URL('file://'+path.resolve(process.argv[1])).href){
  cli().catch(e=>{console.error(e instanceof Error?e.message:'fallen_note_handoff_failed');process.exitCode=1;});
}
