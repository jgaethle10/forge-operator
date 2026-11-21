import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomBytes} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createCreatorAccess} from './creator-access.mjs';

const KEY=randomBytes(32),TIME=1800000000;
const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.from('Home-media-pilot-synthetic-bytes')]);
const baseline={tenant_ref:'tenant:public',subject_ref:'creator:one',role:'creator',
  scopes:['creator.submit','creator.read','creator.withdraw','creator.media']};
function token(patch={}){
 const claims={v:1,iss:'evercraft.home.social.dev',aud:'evercraft.home.creator-queue',
  iat:TIME,exp:TIME+600,...baseline,...patch};
 const message='hc1.'+Buffer.from(JSON.stringify(claims)).toString('base64url');
 return message+'.'+createHmac('sha256',KEY).update(message).digest('base64url');
}
function story(asset_ref,patch={}){
 return {
  id:'story:real-media-pilot',creator_ref:'creator:one',asset_ref,
  title:'Before We Were Here (synthetic intake)',format:'documentary',
  destinations:['home','journal','clip','evermaps'],source_refs:['archive:synthetic'],
  heritage:{cemetery_ref:'cemetery:synthetic',location_confidence:'cemetery_only'},
  creator_publish_opt_in:true,creator_revenue_opt_in:false,rights_asserted:true,
  original_work_asserted:true,identifies_living_people:false,
  contains_private_family_content:false,...patch
 };
}
async function setup(t){
 const root=await mkdtemp(path.join(os.tmpdir(),'home-media-access-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 return createCreatorAccess({root,verification_key:KEY,now:()=>TIME+5});
}
test('authenticated creator uploads bytes, then submits a matching content-bound story',async t=>{
 const api=await setup(t),auth=token();
 const receipt=await api.uploadMedia({token:auth,bytes:png,declared_mime:'image/png'});
 assert.match(receipt.asset_ref,/^asset:sha256:[a-f0-9]{64}$/);
 const result=await api.submitWithMedia({token:auth,story:story(receipt.asset_ref)});
 assert.equal(result.asset_ref,receipt.asset_ref);
 assert.equal(result.state,'pending');
 assert.equal(result.published,false);
 assert.equal(result.payouts_enabled,false);
 assert.equal(result.payable_cents,null);
});
test('unuploaded asset cannot enter the content-verified submission path',async t=>{
 const api=await setup(t);
 await assert.rejects(api.submitWithMedia({token:token(),story:story('asset:sha256:'+'a'.repeat(64))}),/media_asset_missing/);
});
test('creator two cannot claim creator one media even with the exact digest',async t=>{
 const api=await setup(t);
 const own=await api.uploadMedia({token:token(),bytes:png});
 const second=token({subject_ref:'creator:two'});
 await assert.rejects(api.submitWithMedia({token:second,story:story(own.asset_ref,{creator_ref:'creator:two'})}),/media_asset_missing/);
});
test('cross-tenant media receipt does not authorize a submission',async t=>{
 const api=await setup(t);
 const own=await api.uploadMedia({token:token(),bytes:png});
 await assert.rejects(api.submitWithMedia({token:token({tenant_ref:'tenant:other'}),story:story(own.asset_ref)}),/media_asset_missing/);
});
test('media upload requires media scope and creator role',async t=>{
 const api=await setup(t);
 await assert.rejects(api.uploadMedia({token:token({scopes:['creator.submit']}),bytes:png}),/scope_denied/);
 await assert.rejects(api.uploadMedia({token:token({role:'editor',subject_ref:'editor:one',scopes:['editor.review']}),bytes:png}),/scope_denied/);
});
test('content-declared type mismatch produces no usable media receipt',async t=>{
 const api=await setup(t);
 await assert.rejects(api.uploadMedia({token:token(),bytes:png,declared_mime:'video/mp4'}),/media_type_mismatch/);
});
test('owner cannot submit other subject even after valid upload',async t=>{
 const api=await setup(t);
 const r=await api.uploadMedia({token:token(),bytes:png});
 await assert.rejects(api.submitWithMedia({token:token(),story:story(r.asset_ref,{creator_ref:'creator:two'})}),/creator_mismatch/);
});
test('media upload and verified submission do not create public URLs or earnings',async t=>{
 const api=await setup(t),auth=token();
 const r=await api.uploadMedia({token:auth,bytes:png});
 assert.equal(r.public_url,null);assert.equal(r.published,false);
 assert.equal(r.malware_scanned,false);
 const s=await api.submitWithMedia({token:auth,story:story(r.asset_ref,{creator_revenue_opt_in:true})});
 assert.equal(s.monetization_state,'opted_in_pending_verified_campaign_and_terms');
 assert.equal(s.earnings_cents,null);assert.equal(s.financial_authority_granted,false);
});
