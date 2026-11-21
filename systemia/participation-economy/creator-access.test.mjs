import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomBytes} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createCreatorAccess} from './creator-access.mjs';
const KEY=randomBytes(32),TIME=1800000000;
function token(partial={}){
  const claims={
    aud:'evercraft.home.creator-queue',exp:TIME+600,iat:TIME,
    iss:'evercraft.home.social.dev',role:'creator',
    scopes:['creator.submit','creator.read','creator.withdraw'],
    subject_ref:'creator:one',tenant_ref:'tenant:public-social',v:1,...partial
  };
  const raw='hc1.'+Buffer.from(JSON.stringify(claims)).toString('base64url');
  return raw+'.'+createHmac('sha256',KEY).update(raw).digest('base64url');
}
function story(partial={}){
  return {
    id:'story:pilot',creator_ref:'creator:one',asset_ref:'asset:pilot',
    title:'Before We Were Here',format:'documentary',
    destinations:['home','evermaps','journal','clip'],
    source_refs:['archive:synthetic'],
    heritage:{cemetery_ref:'cemetery:synthetic',location_confidence:'cemetery_only'},
    creator_publish_opt_in:true,creator_revenue_opt_in:true,
    rights_asserted:true,original_work_asserted:true,
    identifies_living_people:false,contains_private_family_content:false,...partial
  };
}
function editor(partial={}){
 return token({role:'editor',scopes:['editor.read','editor.review','editor.list'],
 subject_ref:'editor:one',...partial});
}
function review(partial={}){
  return {decision:'approved',reviewer_ref:'editor:one',evidence_ref:'review:synthetic',
    moderation_clear:true,rights_clear:true,heritage_clear:false,
    factual_clear:false,media_clear:true,living_people_privacy_clear:true,...partial};
}
async function setup(t){
 const root=await mkdtemp(path.join(os.tmpdir(),'evercraft-home-access-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 return createCreatorAccess({root,verification_key:KEY,now:()=>TIME+5});
}
test('signed creator can submit and get a private, non-paying story',async t=>{
 const api=await setup(t),auth=token();
 const s=await api.submit({token:auth,story:story()});
 assert.equal(s.state,'pending');
 const read=await api.get({token:auth,story_id:'story:pilot'});
 assert.equal(read.story_id,s.story_id);
 assert.equal(read.published,false);assert.equal(read.payouts_enabled,false);assert.equal(read.payable_cents,null);
});
test('untrusted creator cannot claim another creator identity',async t=>{
 const api=await setup(t);
 await assert.rejects(api.submit({token:token(),story:story({creator_ref:'creator:other'})}),/creator_mismatch/);
});
test('missing, modified and malformed tokens fail closed',async t=>{
 const api=await setup(t);
 await assert.rejects(api.submit({story:story()}),/token_required/);
 const valid=token();const altered=valid.slice(0,-4)+'AAAA';
 await assert.rejects(api.submit({token:altered,story:story()}),/signature_invalid|token_encoding_invalid/);
 await assert.rejects(api.submit({token:'hc1.fake.fake',story:story()}),/token_invalid/);
});
test('expired, future-dated, overlong and wrong-audience tokens are denied',async t=>{
 const api=await setup(t);
 for(const changed of [
  {exp:TIME+1},{iat:TIME+100},{exp:TIME+3600},{aud:'evercraft.home.operator'}
 ])await assert.rejects(api.submit({token:token(changed),story:story()}),/expired_or_future|lifetime_invalid|audience_invalid/);
});
test('editor role may not submit or withdraw',async t=>{
 const api=await setup(t);
 await assert.rejects(api.submit({token:editor(),story:story()}),/scope_denied/);
 const a=await api.submit({token:token(),story:story()});
 await assert.rejects(api.withdraw({token:editor(),story_id:a.story_id,expected_head_hash:a.head_hash}),/scope_denied/);
});
test('creator may not review or list editor queue',async t=>{
 const api=await setup(t);
 const a=await api.submit({token:token(),story:story()});
 await assert.rejects(api.review({token:token(),story_id:a.story_id,expected_head_hash:a.head_hash,review:review()}),/scope_denied/);
 await assert.rejects(api.list({token:token()}),/scope_denied/);
});
test('editor review is bound to authenticated editor identity',async t=>{
 const api=await setup(t);
 const a=await api.submit({token:token(),story:story()});
 await assert.rejects(api.review({token:editor(),story_id:a.story_id,expected_head_hash:a.head_hash,review:review({reviewer_ref:'editor:impersonated'})}),/reviewer_mismatch/);
 const b=await api.review({token:editor(),story_id:a.story_id,expected_head_hash:a.head_hash,review:review()});
 assert.equal(b.state,'approved');
 assert.equal(b.independent_review_attestation,false);
 assert.ok(b.routes.some(x=>x.state==='candidate_for_trusted_publisher_review'));
 assert.equal(b.published,false);
});
test('editor can list own tenant; creator cannot read another creator story',async t=>{
 const api=await setup(t);
 await api.submit({token:token(),story:story()});
 const other=token({subject_ref:'creator:two'});
 await assert.rejects(api.get({token:other,story_id:'story:pilot'}),/creator_mismatch/);
 const q=await api.list({token:editor()});
 assert.equal(q.length,1);assert.equal(q[0].published,false);
});
test('tenant scope blocks cross-tenant lookups and reviews',async t=>{
 const api=await setup(t);
 const a=await api.submit({token:token(),story:story()});
 assert.equal(await api.get({token:token({tenant_ref:'tenant:other'}),story_id:a.story_id}),null);
 assert.deepEqual(await api.list({token:editor({tenant_ref:'tenant:other'})}),[]);
 await assert.rejects(api.review({token:editor({tenant_ref:'tenant:other'}),story_id:a.story_id,expected_head_hash:a.head_hash,review:review()}),/record_not_found/);
});
test('withdrawal requires creator, survives review and holds every channel',async t=>{
 const api=await setup(t);
 const a=await api.submit({token:token(),story:story()});
 const b=await api.review({token:editor(),story_id:a.story_id,expected_head_hash:a.head_hash,review:review()});
 const c=await api.withdraw({token:token(),story_id:a.story_id,expected_head_hash:b.head_hash});
 assert.equal(c.state,'withdrawn');
 assert.ok(c.routes.every(x=>x.state==='held'&&x.hold_reasons.includes('creator_withdrawn')));
 assert.equal(c.published,false);assert.equal(c.payouts_enabled,false);
});
test('wrong tenant or subject cannot withdraw',async t=>{
 const api=await setup(t);
 const a=await api.submit({token:token(),story:story()});
 await assert.rejects(api.withdraw({token:token({subject_ref:'creator:two'}),story_id:a.story_id,expected_head_hash:a.head_hash}),/creator_mismatch/);
 await assert.rejects(api.withdraw({token:token({tenant_ref:'tenant:other'}),story_id:a.story_id,expected_head_hash:a.head_hash}),/record_not_found/);
});
test('cross-role scopes and invalid claims do not become permissions',async t=>{
 const api=await setup(t);
 for(const changed of [
  {role:'creator',scopes:['editor.list']},
  {role:'editor',scopes:['creator.submit']},
  {role:'creator',scopes:['creator.submit','creator.submit']},
  {v:2},
  {tenant_ref:'../../<unsafe>'},
 ]){
  await assert.rejects(api.submit({token:token(changed),story:story()}),/role_scope_mismatch|scope_invalid|audience_invalid|identity_invalid/);
 }
});
test('short-lived scoped token can perform only its declared operation',async t=>{
 const api=await setup(t),justSubmit=token({scopes:['creator.submit']});
 await api.submit({token:justSubmit,story:story()});
 await assert.rejects(api.get({token:justSubmit,story_id:'story:pilot'}),/scope_denied/);
 await assert.rejects(api.withdraw({token:justSubmit,story_id:'story:pilot',expected_head_hash:'fake'}),/scope_denied/);
});
test('constructor requires strong independent verifier key',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'home-auth-constructor-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 assert.throws(()=>createCreatorAccess({root,verification_key:Buffer.from('weak')}),/strong_secret_required/);
});
