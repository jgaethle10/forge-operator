import test from 'node:test';
import assert from 'node:assert/strict';
import {triageReview} from '../systemia/revenue-desk/public-demand-triage.mjs';
const packet=(header='November 16, 2027',deadline='December 7, 2026')=>({schema:'evercraft.public-demand.review-packet.v1',source_url:'https://example.org/rfp.pdf',qualified:false,contact_authorized:false,execution_authorized:false,send_performed:false,evidence:{dates:{truncated:false,excerpts:[{page:1,line:1,excerpt:'   '+header+'\n'},{page:4,line:3,excerpt:'All proposals from bidders must be submitted by '+deadline+' at 5:00 PM (CST).'}]}}});
test('future header relative to deadline produces explicit conflict hold',()=>{
 const r=triageReview(packet());
 assert.equal(r.state,'hold_document_date_conflict');
 assert.equal(r.header_date_candidates[0].date,'2027-11-16');
 assert.equal(r.deadline_date_candidates[0].date,'2026-12-07');
 assert.equal(r.qualified,false);
 assert.equal(r.contact_authorized,false);
});
test('consistent dates are not qualification',()=>{
 assert.equal(triageReview(packet('November 16, 2026')).state,'commercial_review_required');
 assert.equal(triageReview(packet('November 31, 2026')).state,'hold_manual_date_review');
});
test('ambiguous or truncated evidence remains held',()=>{
 const p=packet('November 16, 2026');
 p.evidence.dates.truncated=true;
 assert.equal(triageReview(p).state,'hold_manual_date_review');
 p.evidence.dates.truncated=false;
 p.evidence.dates.excerpts.push({page:5,line:1,excerpt:'Proposal deadline: December 8, 2026'});
 assert.equal(triageReview(p).state,'hold_manual_date_review');
 assert.throws(()=>triageReview({...p,contact_authorized:true}),/invalid_review_packet/);
});
