import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assessUkCapture} from '../systemia/revenue-desk/uk-research-evidence.mjs';
const now=new Date('2026-11-26T06:30:00Z');
const ocid='ocds-example-test';
const job={job_ref:'buyer-research:'+'a'.repeat(64),source_ref:'uk:'+createHash('sha256').update(ocid).digest('hex').slice(0,40),source_url:'https://www.find-tender.service.gov.uk/Notice/111612-2026',buyer:'Example Council',title:'Example Car Park',offer_lane_hint:'ev-planning',stage:'research_pending',contact_authorized:false,execution_authorized:false,required_evidence:['eligibility_and_submission_rules']};
const capture=()=>({retrieved_at:'2026-11-26T06:10:00Z',retrieval_url:'https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?limit=100',release:{id:'111612-2026',ocid,buyer:{name:job.buyer},tag:['tender'],tender:{title:job.title,status:'active',description:'Road reconstruction with EV charging infrastructure',tenderPeriod:{endDate:'2026-12-17T12:00:00+00:00'},value:{amount:1212000,currency:'GBP'}}}});
test('civil works produce partner-review hint, never qualification or authority',()=>{
 const raw=JSON.stringify(capture());
 const r=assessUkCapture(job,raw,{now});
 assert.equal(r.disposition,'partner_fit_review');
 assert.equal(r.capture_sha256,createHash('sha256').update(raw).digest('hex'));
 assert.equal(r.capture_verification,'local_artifact_integrity_only');
 assert.equal(r.qualified,false);assert.equal(r.contact_authorized,false);assert.equal(r.execution_authorized,false);assert.equal(r.send_performed,false);
});
test('notice and buyer mismatches fail closed',()=>{
 for(const field of ['id','ocid','buyer']){const c=capture();c.release[field]='wrong';assert.throws(()=>assessUkCapture(job,JSON.stringify(c),{now}),/capture_identity_mismatch/);}
});
test('spoofed source and stale or future captures fail closed',()=>{
 const c=capture();c.retrieval_url='https://example.test/api/1.0/ocdsReleasePackages';assert.throws(()=>assessUkCapture(job,JSON.stringify(c),{now}),/invalid_capture_source/);
 for(const at of ['2026-11-24T00:00:00Z','2026-11-27T00:00:00Z']){const x=capture();x.retrieved_at=at;assert.throws(()=>assessUkCapture(job,JSON.stringify(x),{now}),/capture_stale_or_invalid/);}
});
test('inactive and expired source evidence remains held',()=>{
 const a=capture();a.release.tender.status='cancelled';
 const b=capture();b.release.tender.tenderPeriod.endDate='2026-11-25T00:00:00Z';
 for(const c of [a,b])assert.equal(assessUkCapture(job,JSON.stringify(c),{now}).disposition,'hold_inactive_or_deadline');
});
test('preauthorized jobs and malformed notice targets are rejected',()=>{
 assert.throws(()=>assessUkCapture({...job,contact_authorized:true},JSON.stringify(capture()),{now}),/invalid_job/);
 assert.throws(()=>assessUkCapture({...job,source_url:'https://example.test/Notice/111612-2026'},JSON.stringify(capture()),{now}),/invalid_notice_url/);
});
