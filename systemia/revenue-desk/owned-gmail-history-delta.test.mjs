import test from 'node:test';
import assert from 'node:assert/strict';
import {readHistoryCheckpoint,collectHistoryDelta} from './owned-gmail-history-delta.mjs';
const accessToken='synthetic-readonly-token';
const ok=x=>({ok:true,json:async()=>x});
test('profile checkpoint preserves exact large decimal and mailbox identity',async()=>{
 const expectedMailbox='owner@example.test',historyId='900719925474099300';
 const opts={accessToken,expectedMailbox,fetchImpl:async(url,req)=>{
  assert.equal(new URL(url).pathname,'/gmail/v1/users/me/profile');
  assert.equal(req.method,'GET');assert.equal(req.redirect,'error');
  return ok({emailAddress:expectedMailbox,historyId});
 }};
 assert.equal(await readHistoryCheckpoint(opts),historyId);
 await assert.rejects(readHistoryCheckpoint({...opts,fetchImpl:async()=>ok({emailAddress:'wrong@example.test',historyId})}),/profile_identity_or_cursor_invalid/);
});
test('all pages deduplicate additions deletions and labels without floating point cursor conversion',async()=>{
 const startHistoryId='900719925474099300';
 const fetchImpl=async(url,req)=>{
  const q=new URL(url).searchParams;
  assert.equal(q.get('startHistoryId'),startHistoryId);
  assert.equal(req.method,'GET');
  assert.equal(q.has('historyTypes'),false);
  if(!q.has('pageToken'))return ok({historyId:'900719925474099400',nextPageToken:'next',history:[
   {id:'900719925474099310',messages:[{id:'a'}],messagesAdded:[{message:{id:'a'}}]},
   {id:'900719925474099320',messagesDeleted:[{message:{id:'b'}}]}]});
  assert.equal(q.get('pageToken'),'next');
  return ok({historyId:'900719925474099400',history:[
   {id:'900719925474099330',labelsAdded:[{message:{id:'a'}}],labelsRemoved:[{message:{id:'c'}}]}]});
 };
 const d=await collectHistoryDelta({accessToken,startHistoryId,fetchImpl});
 assert.deepEqual(d,{startHistoryId,endHistoryId:'900719925474099400',changedIds:['a','b','c'],pages:2,records:3});
 await assert.rejects(collectHistoryDelta({accessToken,startHistoryId,fetchImpl,maxPages:1}),/page_cap_incomplete/);
 await assert.rejects(collectHistoryDelta({accessToken,startHistoryId,fetchImpl,maxIds:1}),/change_cap_incomplete/);
});
test('expired, malformed and repeated checkpoints cannot become partial success',async()=>{
 const opts={accessToken,startHistoryId:'100'};
 await assert.rejects(collectHistoryDelta({...opts,fetchImpl:async()=>({ok:false,status:404})}),/checkpoint_expired_rebaseline_required/);
 await assert.rejects(collectHistoryDelta({...opts,fetchImpl:async()=>({ok:false,status:403})}),/provider_hold_delta_403/);
 for(const body of [{historyId:'99'},{historyId:'102',history:[{id:'100',messages:[{id:'a'}]}]},{historyId:'102',history:[{id:'101',messagesAdded:[{message:{}}]}]},{historyId:'102',history:[{id:'101'}]}]){
  await assert.rejects(collectHistoryDelta({...opts,fetchImpl:async()=>ok(body)}),/gmail_history_/);
 }
 await assert.rejects(collectHistoryDelta({...opts,fetchImpl:async()=>ok({historyId:'102',nextPageToken:'same'})}),/pagination_invalid/);
 assert.deepEqual(await collectHistoryDelta({...opts,fetchImpl:async()=>ok({historyId:'100'})}),{startHistoryId:'100',endHistoryId:'100',changedIds:[],pages:1,records:0});
});
