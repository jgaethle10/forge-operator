import {test} from 'node:test';import assert from 'node:assert/strict';import {reviewOwnedDrafts} from './owned-draft-review.mjs';
const now=new Date('2026-11-28T19:00:00Z'),token='fixture-readonly-token';
const msg={id:'m1',labelIds:['DRAFT'],internalDate:String(+now-60000),payload:{mimeType:'text/plain',headers:[{name:'To',value:'Buyer <buyer@example.test>'}],body:{data:Buffer.from('Reviewed scope. [Add valid mailing address before sending.]').toString('base64url')}}};
test('existing reviewed draft gets positive history holds, never authority or private export',async()=>{const r=await reviewOwnedDrafts({accessToken:token,now,reviewedLanes:{d1:{message_id:'m1',lane:'direct_offer'}},fetchImpl:async(u,o)=>{assert.equal(o.method,'GET');assert.equal(u.origin,'https://gmail.googleapis.com');const p=u.pathname;return new Response(JSON.stringify(p.endsWith('/drafts')?{drafts:[{id:'d1',message:{id:'m1'}}]}:p.endsWith('/drafts/d1')?{id:'d1',message:msg}:p.endsWith('/messages')?{messages:[{id:'s1'}]}:{id:'s1',labelIds:['SENT']}));}});assert.equal(r.counts.prior_send_drafts,1);assert.equal(r.counts.placeholder_drafts,1);assert.equal(r.send_authority,false);assert.ok(!JSON.stringify(r).includes('buyer@example.test'));assert.ok(!JSON.stringify(r).includes(token));});
test('unclassified draft is never new outreach',async()=>{const r=await reviewOwnedDrafts({accessToken:token,now,fetchImpl:async(u)=>new Response(JSON.stringify(u.pathname.endsWith('/drafts')?{drafts:[{id:'d1',message:{id:'m1'}}],nextPageToken:'next'}:{id:'d1',message:msg}))});assert.equal(r.counts.commercial_review,0);assert.equal(r.pagination_remaining,true);assert.equal(r.reason_counts.targeted_history_missing_or_incomplete,1);});
test('changed draft holds rather than using stale body',async()=>{const r=await reviewOwnedDrafts({accessToken:token,now,fetchImpl:async(u)=>new Response(JSON.stringify(u.pathname.endsWith('/drafts')?{drafts:[{id:'d1',message:{id:'m1'}}]}:{id:'d1',message:{...msg,id:'m2'}}))});assert.equal(r.read_holds,1);assert.equal(r.reviewed,0);});

test('bounded multi-page list prioritizes existing reviewed drafts and preserves unread counts',async()=>{
 const seen=[];const r=await reviewOwnedDrafts({accessToken:token,now,maxDrafts:1,maxListPages:2,reviewedLanes:{d2:{message_id:'m2',lane:'direct_offer'}},fetchImpl:async u=>{
  const p=u.pathname;seen.push(p);
  if(p.endsWith('/drafts'))return new Response(JSON.stringify(u.searchParams.has('pageToken')?{drafts:[{id:'d2',message:{id:'m2'}}]}:{drafts:[{id:'d1',message:{id:'m1'}}],nextPageToken:'next'}));
  if(p.endsWith('/drafts/d2'))return new Response(JSON.stringify({id:'d2',message:{...msg,id:'m2'}}));
  return new Response(JSON.stringify({messages:[]}));
 }});
 assert.equal(r.listed,2);assert.equal(r.list_pages,2);assert.equal(r.reviewed,1);assert.equal(r.unprocessed,1);assert.equal(r.pagination_remaining,false);
 assert.ok(seen.some(p=>p.endsWith('/drafts/d2')));assert.ok(!seen.some(p=>p.endsWith('/drafts/d1')));
});
test('duplicate draft across pages fails closed',async()=>{
 await assert.rejects(reviewOwnedDrafts({accessToken:token,now,maxDrafts:1,maxListPages:2,fetchImpl:async()=>new Response(JSON.stringify({drafts:[{id:'d1',message:{id:'m1'}}],nextPageToken:'next'}))}),/gmail_draft_inventory_changed/);
});

test('stale message classification cannot trigger contact history review',async()=>{
 const calls=[];const r=await reviewOwnedDrafts({accessToken:token,now,reviewedLanes:{d1:{message_id:'old',lane:'direct_offer'}},fetchImpl:async u=>{
 calls.push(u.pathname);return new Response(JSON.stringify(u.pathname.endsWith('/drafts')?{drafts:[{id:'d1',message:{id:'m1'}}]}:{id:'d1',message:msg}));
 }});
 assert.equal(r.classified,0);assert.equal(r.counts.held,1);assert.ok(!calls.some(p=>p.endsWith('/messages')));
});
test('classified supplier stays nonclosing and private handoff is review-only',async()=>{
 let receipt;const r=await reviewOwnedDrafts({accessToken:token,now,reviewedLanes:{d1:{message_id:'m1',lane:'supplier'}},onPrivateReview:x=>{receipt=x},fetchImpl:async u=>new Response(JSON.stringify(u.pathname.endsWith('/drafts')?{drafts:[{id:'d1',message:{id:'m1'}}]}:u.pathname.endsWith('/drafts/d1')?{id:'d1',message:{...msg,payload:{...msg.payload,body:{data:Buffer.from('Supplier availability question').toString('base64url')}}}}:{messages:[]}))});
 assert.equal(r.classified,1);assert.equal(r.counts.nonclosing_review,1);assert.equal(receipt.external_effects_authorized,false);assert.equal(receipt.rows.length,1);assert.ok(!JSON.stringify(receipt).includes('buyer@example.test'));assert.ok(!JSON.stringify(receipt).includes('Supplier availability question'));
});
