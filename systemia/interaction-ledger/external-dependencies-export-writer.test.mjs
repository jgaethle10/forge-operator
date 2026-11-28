import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {writePrivateDependencyExport as write} from './external-dependencies-export-writer.mjs';
import {readPrivateDependencyReview as read} from './external-dependencies-private.mjs';
const now=new Date('2026-11-27T18:00:00Z');
const request={request_id:'r1',type:'public_records',subject_ref:'agency',scope_ref:'scope',state:'submitted',
 submitted_at:'2026-10-13T18:00:00Z',submission_evidence_ref:'sent',thread_ref:'thread',
 mission_ref:'mission',owner_ref:'owner',intent_snapshot_ref:'intent',continuation_plan_ref:'plan'};
const reply={event_id:'reply',kind:'response',subject_ref:'agency',thread_ref:'thread',occurred_at:now.toISOString(),
 evidence_ref:'receipt',artifact_ref:'artifact'};
function fixture(t){
 const p=fs.mkdtempSync(path.join(os.tmpdir(),'crm-writer-'));t.after(()=>fs.rmSync(p,{recursive:true,force:true}));
 const root=path.join(p,'source'),parent=path.join(p,'state'),dir=path.join(parent,'kaidance-crm-dependencies');
 for(const d of [root,parent,dir])fs.mkdirSync(d,{mode:0o700});
 const args={root,outDir:path.join(parent,'kaidance-company-heartbeat'),now};
 const file=path.join(dir,'request-export.json');
 return {file,args,save:(changes={})=>write({...args,expectedHash:null,requests:[request],receipts:[reply],coverage:'partial',...changes})};
}
test('private export survives independent readback, reviewed continuation is suppressed durably',t=>{
 const {save,args,file}=fixture(t),first=save();
 assert.equal(first.revision,1);assert.equal(fs.statSync(file).mode&0o777,0o600);
 const result=read({...args,enabled:true});
 assert.equal(result.status,'private_review_ready');assert.equal(result.projection.candidates.length,1);
 const id=result.projection.candidates[0].continuation_id;
 const ack={continuation_id:id,review_evidence_ref:'review',reviewer_ref:'reviewer',reviewed_at:now.toISOString()};
 const second=save({expectedHash:first.hash,acknowledgments:[ack]});
 assert.equal(second.revision,2);assert.equal(read({...args,enabled:true}).projection.candidates.length,0);
 assert.equal(JSON.parse(fs.readFileSync(file)).previous_hash,first.hash);
 assert.throws(()=>save({expectedHash:second.hash}),/history_removal_refused/);
});
test('stale writer and orphaned lock cannot overwrite current export',t=>{
 const {save,file}=fixture(t);const first=save();const before=fs.readFileSync(file);
 assert.throws(()=>save(),/export_revision_conflict/);
 fs.mkdirSync(file+'.lock');
 assert.throws(()=>save({expectedHash:first.hash}),/EEXIST/);
 assert.deepEqual(fs.readFileSync(file),before);
});
test('original intent and historical response cannot be overwritten or removed',t=>{
 const {save}=fixture(t),first=save();
 assert.throws(()=>save({expectedHash:first.hash,requests:[{...request,intent_snapshot_ref:'different'}]}),/historical_binding_change_refused/);
 assert.throws(()=>save({expectedHash:first.hash,receipts:[]}),/history_removal_refused/);
 assert.throws(()=>save({expectedHash:first.hash,receipts:[{...reply,case_ref:'added'}]}),/historical_binding_change_refused/);
});
test('unknown or unsupported review cannot suppress work; arbitrary raw content is dropped',t=>{
 const {save,file}=fixture(t);
 assert.throws(()=>save({acknowledgments:[{continuation_id:'fake',review_evidence_ref:'review',reviewer_ref:'owner',reviewed_at:now.toISOString()}]}),/continuation_review_evidence_required/);
 save({requests:[{...request,body:'private-raw-body'}]});
 assert.ok(!fs.readFileSync(file,'utf8').includes('private-raw-body'));
});
test('missing context may be recovered without rewriting existing intent; hold cannot silently release',t=>{
 const {save}=fixture(t);
 const missing={...request,intent_snapshot_ref:null,follow_up_hold:true};
 const first=save({requests:[missing]});
 const second=save({expectedHash:first.hash,requests:[{...request,follow_up_hold:true}]});
 assert.equal(second.revision,2);
 assert.throws(()=>save({expectedHash:second.hash,requests:[{...request,follow_up_hold:false}]}),/hold_release_requires_separate_review/);
});
