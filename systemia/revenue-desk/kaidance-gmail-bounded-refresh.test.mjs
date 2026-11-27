import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {commitGeneration} from './owned-gmail-atomic-window.mjs';
import {runBoundedGmailRefresh} from './kaidance-gmail-bounded-refresh.mjs';
const mailbox='owner@example.test',at=Date.parse('2026-11-27T05:20:00Z'),now=at+300000;
function fixture(t,cursor='100'){
 return {schema:'evercraft.systemia.gmail-owned-metadata-snapshot.v1',observed_at:new Date(t).toISOString(),mailbox_scope:'lookback_hours_30',requested_query:'in:anywhere -in:drafts after:'+Math.floor((t-30*3600000)/1000)+' before:'+Math.floor(t/1000),listing_pages:1,listing_exhausted:true,messages:[{message_id:'private-id',direction:'outbound',occurred_at:new Date(t-3600000).toISOString(),to_addresses:['other@example.test'],is_bounce:false,is_auto_reply:false}],source:'authenticated_gmail_readonly_api',provider_send_performed:false,full_history_confirmed:false,gmail_sync:{schema:'evercraft.gmail.atomic-window.v2',mailbox,history_id:cursor,include_spam_trash:true,selection_basis:'provider_search_membership',internal_date_coverage_confirmed:false,provider_listed_count:1,outside_window_rows:[]}};
}
function setup(){
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'gmail-bounded-'))),state=path.join(root,'gmail-sync');
 fs.mkdirSync(state,{mode:0o700});fs.mkdirSync(path.join(root,'.secrets'),{mode:0o700});
 commitGeneration(state,fixture(at),mailbox);
 return {root,state,options:{root,enabled:true,expectedMailbox:mailbox,clock:()=>now}};
}
const receipt={state:'gmail_atomic_window_committed',mode:'incremental',checkpoint_persisted:true,send_authority:false,private_records_exported:0,full_history_confirmed:false,internal_date_coverage_confirmed:false,provider_listed_count:1,messages:1};
test('bounded refresh reads back new private generation, emits only redacted receipt',()=>{
 const {root,state,options}=setup();
 try{
  const r=runBoundedGmailRefresh({...options,spawn:(cmd,args,opts)=>{
   assert.equal(cmd,process.execPath);assert.ok(args[0].endsWith('/owned-gmail-atomic-window.mjs'));assert.equal(args[1],'--refresh');
   assert.equal(opts.timeout,45000);assert.equal(opts.killSignal,'SIGKILL');assert.equal(opts.maxBuffer,16384);
   commitGeneration(state,fixture(now,'101'),mailbox);
   return {status:0,stdout:JSON.stringify(receipt)};
  }});
  assert.equal(r.status,'refresh_verified');assert.equal(r.checkpoint_advanced,true);assert.equal(r.reporting_messages,1);
  assert.equal(r.send_authority,false);assert.equal(r.quota_authority,false);
  assert.ok(!JSON.stringify(r).includes('private-id'));assert.ok(!JSON.stringify(r).includes('@example.test'));
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('disabled, active lock, timeout and unverifiable success fail closed',()=>{
 const {root,state,options}=setup();
 try{
  const noSpawn=()=>assert.fail('unexpected spawn');
  assert.equal(runBoundedGmailRefresh({...options,enabled:false,spawn:noSpawn}).status,'not_admitted');
  fs.mkdirSync(path.join(state,'.sync-lock'));
  assert.equal(runBoundedGmailRefresh({...options,spawn:noSpawn}).status,'hold_existing_writer');
  fs.rmdirSync(path.join(state,'.sync-lock'));
  const r=runBoundedGmailRefresh({...options,spawn:()=>({error:{code:'ETIMEDOUT'}})});
  assert.equal(r.status,'hold_refresh_timeout');assert.equal(r.checkpoint_advanced,null);
  assert.equal(runBoundedGmailRefresh({...options,spawn:()=>({status:0,stdout:JSON.stringify(receipt)})}).status,'hold_generation_readback');
  assert.equal(runBoundedGmailRefresh({...options,spawn:()=>({status:0,stdout:'private provider output'})}).status,'hold_receipt_invalid');
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('retention cap holds without deleting any generations',()=>{
 const {root,state,options}=setup();
 try{
  for(let i=1;i<96;i++)commitGeneration(state,fixture(at-i*60000),mailbox);
  const before=fs.readdirSync(state);
  assert.equal(runBoundedGmailRefresh({...options,spawn:()=>assert.fail('must not run')}).status,'hold_retention_review');
  assert.deepEqual(fs.readdirSync(state),before);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
