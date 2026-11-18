import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {makeTimelineProject,replaceTimelineClipAsset,timelineDigest} from './timeline.js';
import {
 VAULT_SCHEMA,ROLLBACK_SCHEMA,
 saveTimelineVersion,readTimelineVersionHistory,readTimelineVersion,proposeTimelineRollback,
} from './timeline-version-vault.mjs';

const auth='private:approved-operator-scope-1001';
const signoff='private:explicit-operator-rollback-1001';
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-version-vault-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const asset=id=>({id,path:'/private/assets/'+id+'.mp4',digest:sha(id),kind:'video',
    sourceRefs:['private:rights:'+id],evidenceState:'observed'});
  const project=makeTimelineProject({
    id:'roofing-customer-project',title:'Roofing commercial',aspectRatio:'9:16',
    assets:[asset('opening'),asset('ending'),asset('ending-new')],
    tracks:[{id:'picture',kind:'video',name:'Picture',clips:[
      {id:'opening-shot',trackId:'picture',assetId:'opening',startSec:0,durationSec:10,locked:true},
      {id:'ending-shot',trackId:'picture',assetId:'ending',startSec:10,durationSec:20}
    ]}],
  });
  return {root,project,asset};
}
test('first private timeline snapshot keeps exactly the original version and does not copy media',t=>{
  const {root,project}=fixture(t),original=JSON.stringify(project);
  const result=saveTimelineVersion({root,project,operatorScopeReference:auth});
  assert.equal(result.status,'PRIVATE_SNAPSHOT_RECORDED');
  assert.equal(result.version,1);
  assert.equal(result.originalMediaCopied,false);
  assert.equal(result.publicationAuthority,false);
  assert.equal(JSON.stringify(project),original);
  const history=readTimelineVersionHistory({root,projectId:project.id});
  assert.equal(history.schema,VAULT_SCHEMA);
  assert.equal(history.entries.length,1);
  assert.equal(history.head.projectDigest,timelineDigest(project));
  assert.deepEqual(readTimelineVersion({root,projectId:project.id}),JSON.parse(JSON.stringify(project)),
    'JSON snapshots omit optional undefined fields without changing the timeline digest');
  const folder=path.join(root,sha(project.id)),shots=path.join(folder,'snapshots');
  assert.equal(fs.statSync(path.join(folder,'manifest.json')).mode&0o777,0o600);
  assert.equal(fs.statSync(path.join(shots,fs.readdirSync(shots)[0])).mode&0o777,0o600);
  assert.equal(fs.readdirSync(shots).length,1,'only project JSON; never media bytes');
});
test('change one shot, preserve approved opening, stage rollback, restore as a NEW version',t=>{
  const {root,project}=fixture(t);
  const initial=saveTimelineVersion({root,project,operatorScopeReference:auth});
  const next=replaceTimelineClipAsset({project,clipId:'ending-shot',
    newAsset:project.assets[2],expectedVersion:1}).project;
  const updated=saveTimelineVersion({root,project:next,
    expectedHeadDigest:initial.projectDigest,operatorScopeReference:auth});
  assert.equal(updated.version,2);
  assert.equal(readTimelineVersionHistory({root,projectId:project.id}).entries.length,2);
  const previous=readTimelineVersion({root,projectId:project.id,projectDigest:initial.projectDigest});
  assert.equal(previous.tracks[0].clips[1].assetId,'ending');
  const proposal=proposeTimelineRollback({root,projectId:project.id,
    targetProjectDigest:initial.projectDigest,expectedHeadDigest:updated.projectDigest,
    operatorApprovalReference:signoff});
  assert.equal(proposal.schema,ROLLBACK_SCHEMA);
  assert.equal(proposal.status,'ROLLBACK_PROPOSED_NOT_APPLIED');
  assert.equal(proposal.candidate.version,3);
  assert.equal(proposal.candidate.tracks[0].clips[0].assetId,'opening');
  assert.equal(proposal.candidate.tracks[0].clips[1].assetId,'ending');
  assert.equal(proposal.boundaries.originalHistoryRetained,true);
  assert.equal(readTimelineVersion({root,projectId:project.id}).version,2,
    'making a rollback proposal never changes live head');
  const restored=saveTimelineVersion({root,project:proposal.candidate,
    expectedHeadDigest:updated.projectDigest,operatorScopeReference:auth});
  assert.equal(restored.version,3);
  assert.equal(readTimelineVersionHistory({root,projectId:project.id}).entries.length,3);
  assert.equal(readTimelineVersion({root,projectId:project.id}).tracks[0].clips[1].assetId,'ending');
  assert.equal(readTimelineVersion({root,projectId:project.id,projectDigest:updated.projectDigest})
    .tracks[0].clips[1].assetId,'ending-new','old changed version remains in history');
});
test('optimistic version, scope and project validation fail without overwriting existing snapshots',t=>{
  const {root,project}=fixture(t);
  assert.throws(()=>saveTimelineVersion({root,project}),/scope_reference_required/);
  const first=saveTimelineVersion({root,project,operatorScopeReference:auth});
  assert.throws(()=>saveTimelineVersion({root,project,operatorScopeReference:auth}),
    /optimistic_conflict/);
  assert.throws(()=>saveTimelineVersion({root,project,expectedHeadDigest:first.projectDigest,
    operatorScopeReference:auth}),/version_not_advanced/);
  const next=replaceTimelineClipAsset({project,clipId:'ending-shot',
    newAsset:project.assets[2],expectedVersion:1}).project;
  assert.throws(()=>saveTimelineVersion({root,project:{...next,id:'../escape'},
    expectedHeadDigest:first.projectDigest,operatorScopeReference:auth}),/invalid_timeline/);
  assert.throws(()=>saveTimelineVersion({root,project:{...next,
    assets:[{...next.assets[0],digest:'not-a-hash'},...next.assets.slice(1)]},
    expectedHeadDigest:first.projectDigest,operatorScopeReference:auth}),/invalid_source_asset/);
  assert.equal(readTimelineVersionHistory({root,projectId:project.id}).entries.length,1);
});
test('snapshot corruption and symlink replacement are rejected, not treated as a valid rollback',t=>{
  const {root,project}=fixture(t);
  saveTimelineVersion({root,project,operatorScopeReference:auth});
  const shots=path.join(root,sha(project.id),'snapshots');
  const filename=fs.readdirSync(shots)[0],file=path.join(shots,filename);
  const original=fs.readFileSync(file,'utf8');
  fs.writeFileSync(file,original.replace('Roofing commercial','Tampered project'));
  assert.throws(()=>readTimelineVersion({root,projectId:project.id}),
    /snapshot_integrity_failure/);
  fs.rmSync(file);
  const attacker=path.join(root,'attacker.json');
  fs.writeFileSync(attacker,original);
  fs.symlinkSync(attacker,file);
  assert.throws(()=>readTimelineVersion({root,projectId:project.id}),
    /unsafe_file/);
});
test('rollback must preserve current locked visual and its SHA; stale head fails closed',t=>{
  const {root,project}=fixture(t);
  const first=saveTimelineVersion({root,project,operatorScopeReference:auth});
  const next=replaceTimelineClipAsset({project,clipId:'ending-shot',
    newAsset:project.assets[2],expectedVersion:1}).project;
  next.tracks[0].clips[1].locked=true;
  const second=saveTimelineVersion({root,project:next,
    expectedHeadDigest:first.projectDigest,operatorScopeReference:auth});
  assert.throws(()=>proposeTimelineRollback({root,projectId:project.id,
    targetProjectDigest:first.projectDigest,expectedHeadDigest:second.projectDigest,
    operatorApprovalReference:signoff}),/rollback_locked_clip_change/);
  assert.throws(()=>proposeTimelineRollback({root,projectId:project.id,
    targetProjectDigest:first.projectDigest,expectedHeadDigest:first.projectDigest,
    operatorApprovalReference:signoff}),/rollback_stale_head/);
  assert.throws(()=>proposeTimelineRollback({root,projectId:project.id,
    targetProjectDigest:first.projectDigest,expectedHeadDigest:second.projectDigest,
    operatorApprovalReference:'random-approval'}),/approval_reference_required/);
});
