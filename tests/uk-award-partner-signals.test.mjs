import test from 'node:test';
import assert from 'node:assert/strict';
import {planUkAwardPartners} from '../systemia/revenue-desk/uk-award-partner-signals.mjs';
const now=new Date('2026-11-26T06:30:00Z');
const release=()=>({ocid:'ocds-example',id:'123456-2026',date:'2026-11-25T00:00:00Z',tag:['award'],buyer:{name:'Example Council'},tender:{title:'Civil works',description:'Road reconstruction including electric vehicle charging infrastructure'},awards:[{id:'award-1',status:'active',date:'2026-11-24T00:00:00Z',suppliers:[{id:'org-1',name:'Example Prime'}],value:{amount:1200000,currency:'GBP'}}]});
test('award identifies prime, narrow service hypothesis and no authority',()=>{
 const r=planUkAwardPartners({releases:[release()]},{now});
 assert.equal(r.signals.length,1);
 const s=r.signals[0];
 assert.equal(s.prime_name,'Example Prime');assert.equal(s.lane,'ev-planning');
 assert.equal(s.subcontract_demand_verified,false);assert.equal(s.qualified,false);
 assert.equal(s.contact_authorized,false);assert.equal(s.execution_authorized,false);
 assert.equal(r.send_performed,false);assert.equal(s.advertised_value,undefined);
});
test('duplicate releases and suppliers cannot multiply signals',()=>{
 const a=release();a.awards[0].suppliers.push({...a.awards[0].suppliers[0]});
 assert.equal(planUkAwardPartners({releases:[a,a]},{now}).signals.length,1);
});
test('cancelled, stale, future and unrelated awards are held',()=>{
 const variants=[r=>r.tag=['awardCancellation'],r=>r.awards[0].status='cancelled',r=>r.awards[0].date='2025-01-01T00:00:00Z',r=>r.awards[0].date='2027-01-01T00:00:00Z',r=>r.tender.description='Office supplies',r=>r.tag=['tender']];
 for(const change of variants){const r=release();change(r);assert.equal(planUkAwardPartners({releases:[r]},{now}).signals.length,0);}
});
test('later cancellation suppresses earlier award',()=>{
 const a=release(),b=release();b.date='2026-11-26T01:00:00Z';b.tag=['awardCancellation'];
 assert.equal(planUkAwardPartners({releases:[a,b]},{now}).signals.length,0);
});
test('missing supplier identity and invalid notice are held',()=>{
 for(const change of [r=>r.awards[0].suppliers[0].id='',r=>r.id='not-a-notice']){const r=release();change(r);assert.equal(planUkAwardPartners({releases:[r]},{now}).signals.length,0);}
});
