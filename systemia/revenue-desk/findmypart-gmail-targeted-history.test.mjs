import test from 'node:test';
import assert from 'node:assert/strict';
import {selectShopTargets,reviewTargetedHistory} from './findmypart-gmail-targeted-history.mjs';
const now=Date.parse('2026-11-27T06:00:00Z');
const target={work_key:'findmypart:shop:example',host:'example.test'};
const queue={schema:'evercraft.kaidance.company-heartbeat.queue.v1',observed_at:new Date(now).toISOString(),execution_authorized:false,candidates:[{work_key:target.work_key,source_url:'https://www.example.test/parts',execution_authorized:false,outreach_authorized:false,buyer_need_confirmed:false}]};
test('only current read-only shop targets are admitted',()=>{
 assert.deepEqual(selectShopTargets(queue,now),[target]);
 assert.throws(()=>selectShopTargets(queue,now+31*60000),/queue_binding_hold/);
 for(const change of [{source_url:'https://user:pass@example.test/'},{outreach_authorized:true},{buyer_need_confirmed:true}]){
  const q=structuredClone(queue);Object.assign(q.candidates[0],change);
  assert.throws(()=>selectShopTargets(q,now),/gmail_targeted_/);
 }
});
const ok=x=>({ok:true,json:async()=>x});
const row=(id,threadId,from,to,sent,t,extra=[])=>({id,threadId,internalDate:String(t),labelIds:sent?['SENT']:['INBOX'],payload:{headers:[{name:'From',value:from},{name:'To',value:to},...extra]}});
test('historical exact-domain outbound and same-thread inbound are positive evidence only',async()=>{
 const rows={
  a:row('a','t','owner@owner.test','buyer@example.test',true,now-7*86400000),
  b:row('b','t','buyer@example.test','owner@owner.test',false,now-6*86400000),
  c:row('c','x','buyer@example.test','owner@owner.test',false,now-5*86400000),
  d:row('d','t','bot@example.test','owner@owner.test',false,now-4*86400000,[{name:'Auto-Submitted',value:'auto-replied'}]),
  e:row('e','t','someone@notexample.test','owner@owner.test',false,now-3*86400000)
 };
 const fetchImpl=async(url,req)=>{
  const u=new URL(url);assert.equal(req.method,'GET');
  if(u.pathname.endsWith('/messages')){
   assert.equal(u.searchParams.get('includeSpamTrash'),'true');assert.match(u.searchParams.get('q'),/from:example.test/);
   return ok({messages:Object.keys(rows).map(id=>({id}))});
  }
  assert.equal(u.searchParams.get('format'),'metadata');return ok(rows[u.pathname.split('/').at(-1)]);
 };
 const r=await reviewTargetedHistory({targets:[target],accessToken:'synthetic-readonly-token',fetchImpl,sleep:async()=>{},clock:()=>now});
 assert.equal(r.results[0].exact_domain_outbound,1);assert.equal(r.results[0].exact_domain_inbound,3);assert.equal(r.results[0].same_thread_reply_candidates,1);
 assert.equal(r.buyer_replies_verified,0);assert.equal(r.send_authority,false);assert.equal(r.full_history_confirmed,false);
 assert.ok(!JSON.stringify(r).includes('@'));
});
test('empty matches never clear contact and truncated search is labeled',async()=>{
 const opts={targets:[target],accessToken:'synthetic-readonly-token',sleep:async()=>{},clock:()=>now};
 const empty=await reviewTargetedHistory({...opts,fetchImpl:async()=>ok({})});
 assert.equal(empty.results[0].state,'no_domain_match_not_clearance');
 assert.equal(empty.results[0].contact_clearance,false);
 const truncated=await reviewTargetedHistory({...opts,fetchImpl:async(url)=>{
  const u=new URL(url);
  if(u.pathname.endsWith('/messages'))return ok({messages:Array.from({length:50},(_,i)=>({id:'m'+i})),nextPageToken:'more'});
  const id=u.pathname.split('/').at(-1);return ok(row(id,'t','other@other.test','owner@owner.test',false,now-1000));
 }});
 assert.equal(truncated.results[0].search_truncated,true);assert.equal(truncated.metadata_requests,50);
 await assert.rejects(reviewTargetedHistory({...opts,fetchImpl:async()=>({ok:false,status:403})}),/gmail_authorization_or_scope_hold_list_403/);
});
