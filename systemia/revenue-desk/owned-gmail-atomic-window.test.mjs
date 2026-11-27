import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {synchronizeWindow,readLatestGeneration,commitGeneration,withSyncLock} from './owned-gmail-atomic-window.mjs';
const mailbox='owner@example.test',accessToken='synthetic-readonly-token',at=Date.parse('2026-11-27T05:20:00Z');
const options={accessToken,expectedMailbox:mailbox,clock:()=>at,sleep:async()=>{}};
const ok=x=>({ok:true,json:async()=>x});
function provider({historyId='100',ids=['a','b'],history=[],profiles=null}={}){
 const gets=[],calls=[];let i=0;
 const fetchImpl=async(url,req)=>{
  assert.equal(req.method,'GET');assert.equal(req.redirect,'error');
  const u=new URL(url);calls.push(u.pathname);
  if(u.pathname.endsWith('/profile'))return ok({emailAddress:mailbox,historyId:profiles?.[i++]||historyId});
  if(u.pathname.endsWith('/history'))return ok({historyId,history});
  if(u.pathname.endsWith('/messages')){
   assert.equal(u.searchParams.get('includeSpamTrash'),'true');
   assert.match(u.searchParams.get('q'),/after:\d+ before:\d+/);
   return ok({messages:ids.map(id=>({id}))});
  }
  assert.equal(u.searchParams.get('format'),'metadata');
  const id=u.pathname.split('/').at(-1);gets.push(id);
  return ok({id,threadId:'thread-'+id,internalDate:String(at-3600000),labelIds:id==='a'?['SENT']:[],payload:{headers:[{name:'To',value:'person@example.test'}]}});
 };
 return {fetchImpl,gets,calls};
}
test('baseline then incremental refresh reuses unchanged rows and refetches changed/new membership',async()=>{
 const first=provider();
 const {snapshot,stats}=await synchronizeWindow({...options,fetchImpl:first.fetchImpl});
 assert.equal(snapshot.gmail_sync.history_id,'100');
 assert.equal(stats.metadata_requests,2);assert.deepEqual(first.gets,['a','b']);
 const next=provider({historyId:'103',ids:['a','c','d'],history:[{id:'101',messagesDeleted:[{message:{id:'b'}}]},{id:'102',messagesAdded:[{message:{id:'c'}}]}]});
 const result=await synchronizeWindow({...options,clock:()=>at+300000,previous:snapshot,fetchImpl:next.fetchImpl});
 assert.deepEqual(next.gets,['c','d']);assert.equal(result.stats.reused_rows,1);
 assert.deepEqual(result.snapshot.messages.map(r=>r.message_id),['a','c','d']);
 assert.equal(result.snapshot.gmail_sync.history_id,'103');
 assert.equal(result.snapshot.full_history_confirmed,false);
 const unchanged=provider({historyId:'103',ids:['a','c','d']});
 const later=await synchronizeWindow({...options,clock:()=>at+600000,previous:result.snapshot,fetchImpl:unchanged.fetchImpl});
 assert.equal(later.stats.metadata_requests,0);assert.equal(later.stats.reused_rows,3);
});
test('unstable mailbox never advances a checkpoint; expired history requires rebaseline',async()=>{
 const first=provider({profiles:['100','101'],historyId:'101'});
 await assert.rejects(synchronizeWindow({...options,maxRounds:1,fetchImpl:first.fetchImpl}),/mailbox_changed_during_capture_hold/);
 const p=provider();const {snapshot}=await synchronizeWindow({...options,fetchImpl:p.fetchImpl});
 await assert.rejects(synchronizeWindow({...options,previous:snapshot,fetchImpl:async(url,req)=>url.includes('/history?')?{ok:false,status:404}:p.fetchImpl(url,req)}),/checkpoint_expired_rebaseline_required/);
 const wrong=structuredClone(snapshot);wrong.gmail_sync.mailbox='wrong@example.test';
 await assert.rejects(synchronizeWindow({...options,previous:wrong,fetchImpl:async()=>assert.fail('no provider call')}),/prior_generation_invalid/);
});
test('exclusive atomic generations preserve prior bytes and refuse duplicate writer or overwrite',async()=>{
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'gmail-sync-')));
 try{
  const p=provider();const {snapshot}=await synchronizeWindow({...options,fetchImpl:p.fetchImpl});
  assert.equal(readLatestGeneration(root,mailbox),null);
  await withSyncLock(root,async()=>{
   await assert.rejects(withSyncLock(root,async()=>assert.fail('concurrent writer')),/exclusive_writer_hold/);
   commitGeneration(root,snapshot,mailbox);
  });
  assert.deepEqual(readLatestGeneration(root,mailbox),snapshot);
  const name=fs.readdirSync(root)[0],file=path.join(root,name),bytes=fs.readFileSync(file);
  assert.equal(fs.statSync(file).mode&0o777,0o600);
  assert.throws(()=>commitGeneration(root,snapshot,mailbox));
  assert.deepEqual(fs.readFileSync(file),bytes);
  assert.deepEqual(fs.readdirSync(root),[name]);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
