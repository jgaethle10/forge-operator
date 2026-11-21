import test from 'node:test';
import assert from 'node:assert/strict';
import {searchGrants,normalizeGrantHit} from '../../scripts/opportunity-radar/grants-gov.mjs';
const hit={id:'12345',number:'ABC-123',title:'Watershed data',agencyName:'Example agency',oppStatus:'posted',closeDate:'11/30/2026'};
test('normalizes search hits without inventing eligibility or deadline',()=>{
 const result=normalizeGrantHit(hit,'2026-10-25T20:00:00Z');
 assert.equal(result.eligibility,'unknown'); assert.equal(result.deadline_at,null);
 assert.equal(result.status,'unknown'); assert.equal(result.no_contact_without_approval,true);
});
test('uses official read-only search2 API with bounded keyword and status',async()=>{
 let url,options;
 const fake=async(u,o)=>{url=u;options=o;return {ok:true,json:async()=>({errorcode:0,data:{hitCount:1,oppHits:[hit]}})}};
 const result=await searchGrants({keyword:'watershed',fetchImpl:fake,checkedAt:'2026-10-25T20:00:00Z'});
 assert.equal(url,'https://api.grants.gov/v1/api/search2');
 assert.equal(JSON.parse(options.body).oppStatuses,'posted|forecasted');
 assert.equal(result.records.length,1);
});
test('rejects invalid payload and server errors',async()=>{
 await assert.rejects(searchGrants({keyword:'water',fetchImpl:async()=>({ok:true,json:async()=>({errorcode:5})})}));
 await assert.rejects(searchGrants({keyword:'water',fetchImpl:async()=>({ok:false,status:503})}));
 await assert.rejects(searchGrants({keyword:' '.repeat(2)}));
});
