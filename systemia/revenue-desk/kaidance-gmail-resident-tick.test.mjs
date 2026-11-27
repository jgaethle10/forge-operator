import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runResidentGmailTick} from './kaidance-gmail-resident-tick.mjs';
import {patchExactRunner} from './kaidance-gmail-exact-runner-overlay.mjs';
const at=Date.parse('2026-11-27T05:55:00Z'),tick=Math.floor(at/300000);
const observed_at=new Date(at+2000).toISOString();
const refreshReceipt={status:'refresh_verified',checkpoint_advanced:true,checkpoint_persisted:true,send_authority:false,contact_clearance:false,quota_authority:false,private_records_exported:0,provider_listed_count:2,reporting_messages:1,outside_window_count:1,observed_at};
const observation={status:'recent_metadata_observed_not_authoritative',observed_at,snapshot_records:1,private_records_exported:0,contact_clearance:false,outreach_authorized:false,quota_authority:false,rolling_24h_at_capture:{outbound_messages:0,parsed_recipient_units:0,outbound_missing_recipients:0,inbound_messages:1,detected_bounces:0,detected_auto_replies:0}};
function setup(){
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'gmail-tick-'))),outDir=path.join(root,'kaidance-company-heartbeat');
 fs.mkdirSync(outDir,{mode:0o700});
 return {root,outDir,opts:{root,outDir,tickAt:new Date(at),clock:()=>at+3000,enabled:true,expectedMailbox:'owner@example.test'}};
}
test('existing resident tick invokes one bounded refresh and emits only verified observation',()=>{
 const {root,opts}=setup();let calls=0;
 try{
  const r=runResidentGmailTick({...opts,refresh:x=>{calls++;assert.equal(x.enabled,true);return refreshReceipt},observe:()=>({summary:observation})});
  assert.equal(calls,1);assert.equal(r.status,'refresh_and_observation_verified');assert.equal(r.tick,tick);assert.equal(r.send_authority,false);assert.equal(r.buyer_replies_verified,0);
  assert.equal(r.rolling_24h_at_capture.inbound_messages,1);
  assert.ok(!JSON.stringify(r).includes('@example.test'));
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('disabled, hosted CI, duplicate tick, tick boundary and invalid output never refresh',()=>{
 const {root,outDir,opts}=setup();
 try{
  const refresh=()=>assert.fail('unexpected refresh');
  for(const [change,status] of [[{enabled:false},'not_admitted'],[{githubActions:true},'not_admitted'],[{clock:()=>at+300000},'hold_tick_boundary'],[{outDir:root},'hold_output_binding']]){
   assert.equal(runResidentGmailTick({...opts,...change,refresh}).status,status);
  }
  fs.writeFileSync(path.join(outDir,'state.json'),JSON.stringify({tick}),{mode:0o600});
  assert.equal(runResidentGmailTick({...opts,refresh}).status,'hold_tick_already_recorded');
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('failed refresh and stale/mismatched observation cannot surface old counts',()=>{
 const {root,opts}=setup();
 try{
  const held=runResidentGmailTick({...opts,refresh:()=>({status:'hold_refresh_timeout'}),observe:()=>assert.fail('no stale fallback')});
  assert.equal(held.status,'hold_refresh_unverified');assert.equal(held.rolling_24h_at_capture,undefined);
  const bad=runResidentGmailTick({...opts,refresh:()=>refreshReceipt,observe:()=>({summary:{...observation,observed_at:new Date(at).toISOString()}})});
  assert.equal(bad.status,'hold_observation_unverified');assert.equal(bad.rolling_24h_at_capture,undefined);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('runner overlay refuses all non-exact source',()=>{
 assert.throws(()=>patchExactRunner('wrong source'),/gmail_overlay_runner_blob_mismatch/);
});
