import test from 'node:test';
import assert from 'node:assert/strict';
import {screenNotices,collectSam} from './sam-buyer-source.mjs';
const now=new Date('2026-11-24T20:00:00Z');
const row={noticeId:'a'.repeat(32),title:'Website development',fullParentPathName:'Example agency',type:'Solicitation',active:'Yes',responseDeadLine:'2026-12-01T20:00:00Z',pointOfContact:[{email:'private@example.test'}]};
test('open relevant solicitation becomes one research candidate only',()=>{
 const a=screenNotices([row,row],now);
 assert.equal(a.length,1);assert.equal(a[0].qualified,false);assert.equal(a[0].contact_authorized,false);assert.ok(!JSON.stringify(a).includes('private@example.test'));
});
test('closed, ambiguous deadline, award, irrelevant and market research notices excluded',()=>{
 assert.equal(screenNotices([{...row,active:'No'},{...row,responseDeadLine:'2026-11-24T19:59:00Z'},{...row,responseDeadLine:'2026-12-01'},{...row,award:{}},{...row,title:'Office furniture'},{...row,type:'Sources Sought'}],now).length,0);
});
test('bounded API reads report incomplete coverage, never send',async()=>{
 const receipt=await collectSam({apiKey:'synthetic',now,maxPages:1,fetchImpl:async(u)=>{
 assert.equal(u.hostname,'api.sam.gov');assert.equal(u.searchParams.get('offset'),'0');
 return {ok:true,json:async()=>({totalRecords:101,offset:0,limit:100,opportunitiesData:Array(100).fill(row)})};
 }});
 assert.equal(receipt.coverage_complete,false);assert.equal(receipt.qualified_count,0);assert.equal(receipt.send_performed,false);assert.equal(receipt.candidates.length,1);assert.ok(!JSON.stringify(receipt).includes('synthetic'));
});
test('missing key, rate limit and invalid paging fail closed',async()=>{
 await assert.rejects(collectSam({now}),/sam_key_required/);
 await assert.rejects(collectSam({now,apiKey:'synthetic',fetchImpl:async()=>({ok:false,status:429})}),/sam_http_429/);
 await assert.rejects(collectSam({now,apiKey:'synthetic',fetchImpl:async()=>({ok:true,json:async()=>({})})}),/sam_invalid_page/);
});
