import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeUk} from '../systemia/revenue-desk/uk-buyer-source.mjs';
import {planBuyerResearch} from '../systemia/revenue-desk/buyer-research-plan.mjs';
const now=new Date('2026-11-24T12:00:00Z');
const release={ocid:'ocds-test-001',id:'123456-2026',date:'2026-11-24T09:00:00Z',tag:['tender'],buyer:{name:'Example Authority'},tender:{status:'active',title:'Video production services',tenderPeriod:{endDate:'2026-12-12T12:00:00Z'}}};
const normalize=(...releases)=>normalizeUk({releases},{now});
test('current relevant tender yields a research candidate only',()=>{
 const r=normalize(release);
 assert.equal(r.candidates.length,1);
 assert.equal(r.qualified_count,0);
 assert.equal(r.send_performed,false);
 assert.equal(r.candidates[0].contact_authorized,false);
 assert.equal(r.candidates[0].source_url,'https://www.find-tender.service.gov.uk/Notice/123456-2026');
});
test('expired, irrelevant and cancelled notices are not candidates',()=>{
 for(const tender of [{...release.tender,tenderPeriod:{endDate:'2026-11-23T12:00:00Z'}},{...release.tender,title:'Office furniture'},{...release.tender,status:'cancelled'}]){
  assert.equal(normalize({...release,tender}).candidates.length,0);
 }
});
test('later cancellation suppresses earlier release within same package',()=>{
 assert.equal(normalize(release,{...release,date:'2026-11-24T10:00:00Z',tag:['tenderCancellation'],tender:{...release.tender,status:'cancelled'}}).candidates.length,0);
});
test('UK candidate becomes research job but not contact authority',()=>{
 const records=normalize(release).candidates;
 const p=planBuyerResearch({schema:'evercraft.kaidance.discovery-checkpoint.v1',records},{now});
 assert.equal(p.jobs.length,1);
 assert.equal(p.jobs[0].contact_authorized,false);
 assert.equal(p.jobs[0].execution_authorized,false);
});
test('spoofed host or non-notice path cannot enter UK research queue',()=>{
 const c=normalize(release).candidates[0];
 for(const source_url of ['https://example.com/Notice/123456-2026','https://www.find-tender.service.gov.uk/other']){
  assert.equal(planBuyerResearch({schema:'evercraft.kaidance.discovery-checkpoint.v1',records:[{...c,source_url}]},{now}).jobs.length,0);
 }
});
