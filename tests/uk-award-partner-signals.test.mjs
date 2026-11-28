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

test('missing award date permits restricted research without inventing award timing',()=>{
 const r=release();delete r.awards[0].date;
 const result=planUkAwardPartners({releases:[r]},{now});
 assert.equal(result.signals.length,1);
 const s=result.signals[0];
 assert.equal(s.awarded_at,null);
 assert.equal(s.release_published_at,r.date);
 assert.equal(s.award_date_status,'missing_requires_research');
 assert.equal(s.award_date_verified,false);
 assert.equal(s.qualified,false);
 assert.equal(s.contact_authorized,false);
 assert.equal(s.execution_authorized,false);
 assert.ok(s.required_evidence.includes('award_date_and_delivery_status'));
 assert.equal(result.diagnostics.undated_award_research_signals,1);
});
test('undated old releases and malformed explicit dates remain held',()=>{
 const old=release();delete old.awards[0].date;old.date='2025-01-01T00:00:00Z';
 const malformed=release();malformed.awards[0].date='not-a-date';
 for(const r of [old,malformed])assert.equal(planUkAwardPartners({releases:[r]},{now}).signals.length,0);
});

test('adjacent infrastructure work is a bounded hypothesis only',()=>{
 const r=release();r.tender.description='Highway maintenance and drainage works';
 const p=planUkAwardPartners({releases:[r]},{now});
 assert.equal(p.signals.length,1);
 const s=p.signals[0];
 assert.equal(s.lane,'infrastructure-research');
 assert.equal(s.fit_basis,'adjacent_scope_hypothesis');
 assert.match(s.scope_excerpt,/Highway maintenance/);
 assert.equal(s.subcontract_demand_verified,false);
 assert.equal(s.contact_authorized,false);
 assert.equal(s.execution_authorized,false);
 assert.equal(s.qualified,false);
 assert.equal(p.diagnostics.adjacent_scope_signals,1);
});
test('explicit EV scope takes precedence over adjacent civil scope',()=>{
 const r=release();r.tender.description='Civil engineering and electric vehicle charging';
 const p=planUkAwardPartners({releases:[r]},{now});
 assert.equal(p.signals[0].lane,'ev-planning');
 assert.equal(p.signals[0].fit_basis,'explicit_scope_keyword');
 assert.equal(p.diagnostics.adjacent_scope_signals,0);
});
test('adjacent scope cannot override cancellation or missing supplier identity',()=>{
 for(const mutate of [r=>r.tag=['awardCancellation'],r=>r.awards[0].suppliers[0].id='']){
 const r=release();r.tender.description='Facilities management';mutate(r);
 assert.equal(planUkAwardPartners({releases:[r]},{now}).signals.length,0);
 }
});
