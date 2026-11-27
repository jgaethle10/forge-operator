import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {observeOwnedGmail,summarizeRecentGmail} from './kaidance-gmail-observation.mjs';
const now=new Date('2026-11-27T05:05:00Z');
const at='2026-11-27T05:01:55Z';
const row=(id,direction,t=at)=>({message_id:id,direction,occurred_at:t,from_address:'private@example.test',to_addresses:['other@example.test'],is_auto_reply:false,is_bounce:false});
const fixture=()=>({schema:'evercraft.systemia.gmail-owned-metadata-snapshot.v1',source:'authenticated_gmail_readonly_api',mailbox_scope:'lookback_hours_30',observed_at:at,listing_exhausted:true,provider_send_performed:false,full_history_confirmed:false,listing_pages:1,messages:[row('private-id-1','outbound'),row('private-id-2','inbound'),row('old-id','outbound','2026-11-26T02:00:00Z')]});
test('bounded capture counts are not quota or buyer authority',()=>{
 const s=summarizeRecentGmail(fixture(),now);
 assert.equal(s.status,'recent_metadata_observed_not_authoritative');
 assert.deepEqual(s.rolling_24h_at_capture,{outbound_messages:1,parsed_recipient_units:1,outbound_missing_recipients:0,inbound_messages:1,detected_bounces:0,detected_auto_replies:0});
 assert.equal(s.snapshot_records,3);
 for(const k of ['quota_authority','outreach_authorized','contact_clearance','full_history_confirmed'])assert.equal(s[k],false);
 assert.equal(s.buyer_replies_verified,0);
 assert.ok(!JSON.stringify(s).includes('private-id'));
 assert.ok(!JSON.stringify(s).includes('@example.test'));
});
test('malformed, duplicate, stale and incomplete snapshots fail closed',()=>{
 for(const mutate of [s=>s.messages.push(s.messages[0]),s=>s.listing_exhausted=false,s=>s.provider_send_performed=true,s=>s.full_history_confirmed=true,s=>s.messages[0].occurred_at='2026-11-28T00:00:00Z',s=>s.messages[0].to_addresses=null]){
  const s=fixture();mutate(s);assert.equal(summarizeRecentGmail(s,now).status,'hold_invalid_snapshot');
 }
 assert.equal(summarizeRecentGmail(fixture(),new Date('2026-11-27T05:32:00Z')).status,'hold_stale_snapshot');
});
test('owner-only latest snapshot read; no fallback on invalid newer or symlink',()=>{
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'gmail-observe-')));
 try{
  const a=path.join(root,'recent-20261127T050100Z.json'),b=path.join(root,'recent-20261127T050200Z.json');
  fs.writeFileSync(a,JSON.stringify(fixture()),{mode:0o600});
  const original=fs.readFileSync(a);
  assert.equal(observeOwnedGmail({root,now}).mailFile,a);
  assert.equal(observeOwnedGmail({now}).summary.status,'not_admitted');
  fs.symlinkSync(a,b);assert.equal(observeOwnedGmail({root,now}).mailFile,null);
  fs.unlinkSync(b);fs.writeFileSync(b,'bad',{mode:0o600});
  assert.equal(observeOwnedGmail({root,now}).summary.status,'hold_private_snapshot_binding');
  assert.deepEqual(fs.readFileSync(a),original);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
