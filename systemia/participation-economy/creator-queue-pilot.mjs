// Synthetic creator-queue walkthrough: no real grave, film, account, or payment.
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {openCreatorRecordStore} from './creator-record-store.mjs';
const root=await mkdtemp(path.join(os.tmpdir(),'home-creator-pilot-'));
const tenant_ref='tenant:synthetic';
const story={
  id:'story:synthetic-headstone',creator_ref:'creator:synthetic',asset_ref:'asset:placeholder',
  title:'Before We Were Here: synthetic pilot',format:'documentary',
  destinations:['home','evermaps','journal','clip'],
  source_refs:['archive:synthetic-unverified'],
  heritage:{cemetery_ref:'cemetery:synthetic',location_confidence:'cemetery_only'},
  creator_publish_opt_in:true,creator_revenue_opt_in:true,
  rights_asserted:true,original_work_asserted:true,
  identifies_living_people:false,contains_private_family_content:false
};
const summarize=p=>({
  status:p.state,revision:p.revision,published:p.published,
  payouts_enabled:p.payouts_enabled,payable_cents:p.payable_cents,
  routes:p.routes.map(r=>({destination:r.destination,state:r.state}))
});
try{
 const inbox=openCreatorRecordStore({root});
 const a=await inbox.submit({tenant_ref,story});
 const b=await inbox.review({tenant_ref,story_id:story.id,expected_head_hash:a.head_hash,
  review:{decision:'approved',reviewer_ref:'reviewer:synthetic',evidence_ref:'review:synthetic',
   moderation_clear:true,rights_clear:true,heritage_clear:false,
   factual_clear:false,media_clear:true,living_people_privacy_clear:true}});
 const restart=await openCreatorRecordStore({root}).get({tenant_ref,story_id:story.id});
 const c=await inbox.withdraw({tenant_ref,story_id:story.id,
  expected_head_hash:restart.head_hash,actor_ref:'creator:synthetic'});
 console.log(JSON.stringify({
  schema:'evercraft.home.creator-pilot.v0.1',
  demonstration:'synthetic_unverified_no_media_no_money_movement',
  persisted_after_restart:b.head_hash===restart.head_hash,
  submitted:summarize(a),reviewed:summarize(b),withdrawn:summarize(c)
 },null,2));
}finally{await rm(root,{recursive:true,force:true});}
