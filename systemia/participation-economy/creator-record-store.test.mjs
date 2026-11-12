import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {openCreatorRecordStore} from './creator-record-store.mjs';
const tenant_ref='tenant:home-public-test';
const story=(patch={})=>({
 id:'story:headstone001',creator_ref:'creator:pilot',asset_ref:'asset:pilot',
 title:'Before We Were Here: pilot',format:'documentary',
 destinations:['home','evermaps','journal','clip'],source_refs:['archive:sample'],
 heritage:{cemetery_ref:'cemetery:tahoma',marker_ref:'marker:sample',location_confidence:'verified_marker'},
 creator_publish_opt_in:true,creator_revenue_opt_in:true,rights_asserted:true,original_work_asserted:true,
 identifies_living_people:false,contains_private_family_content:false,...patch
});
const review=(patch={})=>({
 decision:'approved',reviewer_ref:'reviewer:editor',evidence_ref:'review:sample',
 moderation_clear:true,rights_clear:true,heritage_clear:true,factual_clear:true,
 media_clear:true,living_people_privacy_clear:true,...patch
});
async function setup(t){
 const root=await mkdtemp(path.join(os.tmpdir(),'evercraft-home-test-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 return {root,inbox:openCreatorRecordStore({root})};
}
test('owned local submission survives process restart',async t=>{
 const {root,inbox}=await setup(t);
 const s=await inbox.submit({tenant_ref,story:story()});
 const reopened=await openCreatorRecordStore({root}).get({tenant_ref,story_id:s.story_id});
 assert.equal(s.revision,1);
 assert.equal(s.head_hash,reopened.head_hash);
 assert.equal(s.state,'pending');assert.equal(s.published,false);
});
test('editor review produces candidates but never publishes or pays',async t=>{
 const {inbox}=await setup(t);
 const s=await inbox.submit({tenant_ref,story:story()});
 const r=await inbox.review({tenant_ref,story_id:s.story_id,expected_head_hash:s.head_hash,review:review()});
 assert.equal(r.revision,2);assert.equal(r.state,'approved');
 assert.ok(r.routes.every(x=>x.state==='candidate_for_trusted_publisher_review'));
 assert.equal(r.published,false);assert.equal(r.payouts_enabled,false);
 assert.equal(r.payable_cents,null);assert.equal(r.independent_review_attestation,false);
});
test('creator withdrawal blocks previously reviewed content after restart',async t=>{
 const {root,inbox}=await setup(t);
 const s=await inbox.submit({tenant_ref,story:story()});
 const r=await inbox.review({tenant_ref,story_id:s.story_id,expected_head_hash:s.head_hash,review:review()});
 const w=await inbox.withdraw({tenant_ref,story_id:s.story_id,expected_head_hash:r.head_hash,actor_ref:'creator:pilot'});
 assert.equal(w.state,'withdrawn');assert.equal(w.monetization_state,'revoked');
 assert.ok(w.routes.every(x=>x.state==='held'&&x.hold_reasons.includes('creator_withdrawn')));
 assert.equal((await openCreatorRecordStore({root}).get({tenant_ref,story_id:s.story_id})).state,'withdrawn');
 await assert.rejects(inbox.review({tenant_ref,story_id:s.story_id,expected_head_hash:w.head_hash,review:review()}),/record_withdrawn/);
});
test('tenant IDs isolate same-named stories',async t=>{
 const {inbox}=await setup(t);
 const a=await inbox.submit({tenant_ref,story:story()});
 assert.equal(await inbox.get({tenant_ref:'tenant:other',story_id:a.story_id}),null);
 const b=await inbox.submit({tenant_ref:'tenant:other',story:story()});
 assert.notEqual(a.head_hash,b.head_hash);
});
test('submission replay is idempotent; mutation conflicts',async t=>{
 const {inbox}=await setup(t);
 const a=await inbox.submit({tenant_ref,story:story()});
 const b=await inbox.submit({tenant_ref,story:story()});
 assert.equal(a.head_hash,b.head_hash);
 await assert.rejects(inbox.submit({tenant_ref,story:story({title:'Modified'})}),/submission_conflict/);
});
test('review requires current optimistic head',async t=>{
 const {inbox}=await setup(t);
 const s=await inbox.submit({tenant_ref,story:story()});
 await assert.rejects(inbox.review({tenant_ref,story_id:s.story_id,expected_head_hash:'bad',review:review()}),/stale_head/);
 await inbox.review({tenant_ref,story_id:s.story_id,expected_head_hash:s.head_hash,review:review()});
 await assert.rejects(inbox.review({tenant_ref,story_id:s.story_id,expected_head_hash:s.head_hash,review:review()}),/stale_head/);
});
test('creator self-review and outsider withdrawal denied',async t=>{
 const {inbox}=await setup(t);
 const s=await inbox.submit({tenant_ref,story:story()});
 await assert.rejects(inbox.review({tenant_ref,story_id:s.story_id,expected_head_hash:s.head_hash,review:review({reviewer_ref:'creator:pilot'})}),/self_review/);
 await assert.rejects(inbox.withdraw({tenant_ref,story_id:s.story_id,expected_head_hash:s.head_hash,actor_ref:'creator:other'}),/creator_mismatch/);
});
test('unexpected private fields and malformed tenant IDs rejected',async t=>{
 const {inbox}=await setup(t);
 await assert.rejects(inbox.submit({tenant_ref,story:story({coordinates:[1,2]})}),/story_shape_invalid/);
 await assert.rejects(inbox.submit({tenant_ref,story:story({private_person_data:{name:'secret'}})}),/story_shape_invalid/);
 await assert.rejects(inbox.submit({tenant_ref:'bad\\id',story:story()}),/tenant_ref_invalid/);
 const safe=await inbox.submit({tenant_ref,story:story({id:'../../historical-ref'})});
 assert.equal(safe.story_id,'../../historical-ref');
});
test('claimed editor approval cannot add hidden data',async t=>{
 const {inbox}=await setup(t);
 const s=await inbox.submit({tenant_ref,story:story()});
 await assert.rejects(inbox.review({tenant_ref,story_id:s.story_id,expected_head_hash:s.head_hash,review:review({private_note:'secret'})}),/review_shape_invalid/);
 await assert.rejects(inbox.review({tenant_ref,story_id:s.story_id,expected_head_hash:s.head_hash,review:review({rights_clear:'yes'})}),/review_boolean_invalid/);
});
test('modified on-disk event fails hash validation',async t=>{
 const {root,inbox}=await setup(t);
 const s=await inbox.submit({tenant_ref,story:story()});
 const a=(await readdir(root))[0],b=(await readdir(path.join(root,a)))[0];
 const filename=path.join(root,a,b,'000001.json'),e=JSON.parse(await readFile(filename,'utf8'));
 e.data.title='Forged headline';
 await writeFile(filename,JSON.stringify(e));
 await assert.rejects(inbox.get({tenant_ref,story_id:s.story_id}),/record_hash_invalid/);
});
test('tenant queue reveals metadata without payables',async t=>{
 const {inbox}=await setup(t);
 await inbox.submit({tenant_ref,story:story()});
 await inbox.submit({tenant_ref,story:story({id:'story:second',title:'Second story'})});
 const q=await inbox.list({tenant_ref});
 assert.deepEqual(q.map(x=>x.story_id),['story:headstone001','story:second']);
 assert.ok(q.every(x=>x.published===false&&!('payable_cents' in x)&&!('asset_ref' in x)));
 assert.deepEqual(await inbox.list({tenant_ref:'tenant:empty'}),[]);
});
test('concurrent reviewers cannot both append same revision',async t=>{
 const {inbox}=await setup(t);
 const s=await inbox.submit({tenant_ref,story:story()});
 const results=await Promise.allSettled([
   inbox.review({tenant_ref,story_id:s.story_id,expected_head_hash:s.head_hash,review:review()}),
   inbox.review({tenant_ref,story_id:s.story_id,expected_head_hash:s.head_hash,review:review({decision:'rejected',evidence_ref:'review:alternate'})})
 ]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(results.filter(x=>x.status==='rejected').length,1);
 assert.equal((await inbox.get({tenant_ref,story_id:s.story_id})).revision,2);
});
test('absence of publication consent holds even approved review',async t=>{
 const {inbox}=await setup(t);
 const s=await inbox.submit({tenant_ref,story:story({creator_publish_opt_in:false,creator_revenue_opt_in:false})});
 const r=await inbox.review({tenant_ref,story_id:s.story_id,expected_head_hash:s.head_hash,review:review()});
 assert.ok(r.routes.every(x=>x.state==='held'&&x.hold_reasons.includes('creator_publication_consent_required')));
 assert.equal(r.monetization_state,'not_opted_in');
});
