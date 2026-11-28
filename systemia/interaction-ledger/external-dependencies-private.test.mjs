import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readPrivateDependencyReview as read,reconcileDependencyExport as reconcile,dependencyHeartbeatStatus as status} from './external-dependencies-private.mjs';
const now=new Date('2026-11-27T18:00:00Z');
const exportData={schema:'evercraft.crm.external-dependencies-export.v1',scope:'authorized_external_dependencies',coverage:'partial',exported_at:now.toISOString(),
 requests:[{request_id:'req1',type:'public_records',subject_ref:'private-agency',scope_ref:'private-scope',state:'submitted',
 submitted_at:'2026-10-13T18:00:00Z',submission_evidence_ref:'private-send',thread_ref:'private-thread',
 mission_ref:'private-mission',owner_ref:'private-owner',intent_snapshot_ref:'private-intent',continuation_plan_ref:'private-plan'}],
 receipts:[{event_id:'reply1',kind:'response',subject_ref:'private-agency',thread_ref:'private-thread',occurred_at:now.toISOString(),evidence_ref:'private-reply',artifact_ref:'private-artifact'}],
 reviewed_continuation_ids:[]};
function fixture(t){
 const p=fs.mkdtempSync(path.join(os.tmpdir(),'crm-test-'));t.after(()=>fs.rmSync(p,{recursive:true,force:true}));
 const root=path.join(p,'source'),parent=path.join(p,'state'),dir=path.join(parent,'kaidance-crm-dependencies');
 for(const d of [root,parent,dir])fs.mkdirSync(d,{mode:0o700});
 const file=path.join(dir,'request-export.json');
 fs.writeFileSync(file,JSON.stringify(exportData),{mode:0o600});
 return {file,dir,args:{enabled:true,root,outDir:path.join(parent,'kaidance-company-heartbeat'),now}};
}
test('fresh owner-private export produces continuation but public bridge is status only',t=>{
 const {args}=fixture(t),result=read(args);
 assert.equal(result.status,'private_review_ready');assert.equal(result.coverage_verified,false);
 assert.equal(result.source_coverage,'partial');assert.equal(result.projection.candidates[0].mission_ref,'private-mission');
 assert.deepEqual(status(result),{status:'private_review_ready',execution_authorized:false,publication_authorized:false});
 assert.ok(!JSON.stringify(status(result)).includes('private-mission'));
});
test('repeat read deterministic; reviewed id suppresses candidate after export update',t=>{
 const {args,file}=fixture(t),first=read(args);
 assert.deepEqual(read(args),first);
 fs.writeFileSync(file,JSON.stringify({...exportData,reviewed_continuation_ids:[first.projection.candidates[0].continuation_id]}));
 assert.equal(read(args).projection.candidates.length,0);
});
test('missing configuration, stale and malformed export held',t=>{
 const {args,file}=fixture(t);
 assert.equal(read({...args,enabled:false}).status,'not_configured');
 assert.equal(read({...args,now:new Date(+now+900001)}).status,'stale_or_missing_export');
 fs.writeFileSync(file,'broken');assert.equal(read(args).status,'private_export_unavailable');
 assert.equal(reconcile({...exportData,coverage:'unknown'},now).status,'invalid_export');
});
test('unsafe file mode, symlinks and hardlinks held',t=>{
 const {args,file,dir}=fixture(t);
 fs.chmodSync(file,0o644);assert.equal(read(args).status,'private_export_unavailable');
 fs.chmodSync(file,0o600);const copy=path.join(dir,'copy');fs.linkSync(file,copy);
 assert.equal(read(args).status,'private_export_unavailable');
 fs.unlinkSync(file);fs.symlinkSync(copy,file);
 assert.equal(read(args).status,'private_export_unavailable');
});
test('conflicting records never leak details or get accepted',()=>{
 const result=reconcile({...exportData,receipts:[...exportData.receipts,{...exportData.receipts[0],artifact_ref:'different'}]},now);
 assert.equal(result.status,'invalid_or_conflicting_records');assert.equal(result.projection,undefined);
 assert.equal(status(result).status,'held');
});
