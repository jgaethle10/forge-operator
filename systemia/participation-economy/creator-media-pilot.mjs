// Read-only, synthetic local media -> creator submission -> review -> withdrawal.
// No real film, public upload endpoint, signed production identity, or payout.
import {mkdtemp,rm} from 'node:fs/promises';
import {randomBytes,createHmac} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {createCreatorAccess} from './creator-access.mjs';
const root=await mkdtemp(path.join(os.tmpdir(),'home-media-pilot-'));
const key=randomBytes(32);
const now=Math.floor(Date.now()/1000);
function token(role,subject_ref,scopes){
 const claims={v:1,iss:'evercraft.home.social.dev',aud:'evercraft.home.creator-queue',
  iat:now,exp:now+60,tenant_ref:'tenant:synthetic',subject_ref,role,scopes};
 const s='hc1.'+Buffer.from(JSON.stringify(claims)).toString('base64url');
 return s+'.'+createHmac('sha256',key).update(s).digest('base64url');
}
const creatorToken=token('creator','creator:synthetic',
  ['creator.media','creator.submit','creator.read','creator.withdraw']);
const editorToken=token('editor','editor:synthetic',['editor.review']);
const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.from('synthetic-thumbnail-payload-not-a-published-film')]);
try{
 const access=createCreatorAccess({root,verification_key:key});
 const receipt=await access.uploadMedia({token:creatorToken,bytes:png,declared_mime:'image/png'});
 const story={
  id:'story:synthetic-cemetery-photo-essay',creator_ref:'creator:synthetic',
  asset_ref:receipt.asset_ref,title:'Before We Were Here: synthetic photo pilot',
  format:'photo_essay',destinations:['home','journal','evermaps'],source_refs:['archive:unverified'],
  heritage:{cemetery_ref:'cemetery:synthetic',location_confidence:'cemetery_only'},
  creator_publish_opt_in:true,creator_revenue_opt_in:true,rights_asserted:true,original_work_asserted:true,
  identifies_living_people:false,contains_private_family_content:false
 };
 const submitted=await access.submitWithMedia({token:creatorToken,story});
 const reviewed=await access.review({
  token:editorToken,story_id:story.id,expected_head_hash:submitted.head_hash,
  review:{decision:'approved',reviewer_ref:'editor:synthetic',evidence_ref:'review:synthetic',
   moderation_clear:true,rights_clear:true,heritage_clear:false,factual_clear:false,
   media_clear:false,living_people_privacy_clear:true}
 });
 const restarted=createCreatorAccess({root,verification_key:key});
 const read=await restarted.get({token:creatorToken,story_id:story.id});
 const withdrawn=await restarted.withdraw({
  token:creatorToken,story_id:story.id,expected_head_hash:read.head_hash
 });
 console.log(JSON.stringify({
  schema:'evercraft.home.media-queue-pilot.v0.1',
  demonstration:'synthetic_local_bytes_not_decoded_no_publication_no_payments',
  media_receipt:receipt,
  media_persisted:receipt.asset_ref===submitted.asset_ref,
  story_persisted_after_restart:read.head_hash===reviewed.head_hash,
  submitted:{revision:submitted.revision,published:submitted.published},
  reviewed:{revision:reviewed.revision,published:reviewed.published},
  withdrawn:{revision:withdrawn.revision,state:withdrawn.state,published:withdrawn.published,
   routes:withdrawn.routes.map(r=>({destination:r.destination,state:r.state}))},
  payouts_enabled:withdrawn.payouts_enabled,payable_cents:withdrawn.payable_cents
 },null,2));
}finally{await rm(root,{recursive:true,force:true});}
