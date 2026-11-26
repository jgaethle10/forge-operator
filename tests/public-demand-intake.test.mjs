import test from 'node:test';
import assert from 'node:assert/strict';
import {planPublicDemandResearch} from '../systemia/revenue-desk/public-demand-intake.mjs';
const hit={url:'https://example.org/purchasing/website-rfp',title:'Website redesign RFP',lane:'software'};
test('public search pointers remain unqualified and require original evidence',()=>{
 const p=planPublicDemandResearch({hits:[{...hit,qualified:true,contact_authorized:true}]});
 assert.equal(p.jobs.length,1);
 assert.equal(p.jobs[0].qualified,false);
 assert.equal(p.jobs[0].contact_authorized,false);
 assert.equal(p.jobs[0].execution_authorized,false);
 assert.ok(p.jobs[0].required_evidence.includes('contact_history_and_suppression_review'));
 assert.equal(p.search_performed,false);
});
test('fragment variants deduplicate',()=>{
 const p=planPublicDemandResearch({hits:[hit,{...hit,url:hit.url+'#details'}]});
 assert.equal(p.jobs.length,1);
});
test('unsafe and unsupported pointers are rejected',()=>{
 const urls=['http://example.org/rfp','https://127.0.0.1/rfp','https://host.local/rfp','https://user@example.org/rfp','https://example.org:8443/rfp'];
 assert.equal(planPublicDemandResearch({hits:urls.map(url=>({...hit,url}))}).jobs.length,0);
});
test('bounds are explicit and truncation is reported',()=>{
 const p=planPublicDemandResearch({hits:[hit,{...hit,url:hit.url+'2'}],limit:1});
 assert.equal(p.jobs.length,1);assert.equal(p.truncated,true);
 assert.throws(()=>planPublicDemandResearch({hits:[hit],limit:41}));
});
