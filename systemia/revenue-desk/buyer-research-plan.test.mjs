import test from 'node:test';
import assert from 'node:assert/strict';
import {planBuyerResearch} from './buyer-research-plan.mjs';
const now=new Date('2026-11-24T21:00:00Z');
const row={candidate_ref:'sam:'+'a'.repeat(32),source_url:'https://sam.gov/opp/'+'a'.repeat(32)+'/view',buyer:'Synthetic agency',title:'Website development',deadline:'2026-12-01T12:00:00Z',deadline_timezone:null,suggested_lane:'software',stage:'research_required',qualified:false,contact_authorized:false};
const plan=(records,opts={})=>planBuyerResearch({schema:'evercraft.kaidance.discovery-checkpoint.v1',records},{now,...opts});
test('stable evidence-first job identity without execution authority',()=>{
 const a=plan([row]);const b=plan([row],{now:new Date(+now+1000)});
 assert.equal(a.jobs.length,1);assert.equal(a.jobs[0].job_ref,b.jobs[0].job_ref);
 assert.equal(a.jobs[0].execution_authorized,false);assert.equal(a.jobs[0].contact_authorized,false);
 assert.equal(a.dispatch_performed,false);assert.equal(a.qualified_count,0);
 assert.ok(a.jobs[0].required_evidence.includes('payment_terms'));
});
test('rejects wrong host, stale deadline, authority escalation, duplicate and unknown lane',()=>{
 const a=plan([row,row,{...row,source_url:'https://example.org'},{...row,deadline:'2026-11-01T12:00:00Z'},{...row,contact_authorized:true},{...row,suggested_lane:'unknown'}]);
 assert.equal(a.jobs.length,1);assert.equal(a.held,5);
});
test('earliest deadline first with bounded output',()=>{
 const b={...row,candidate_ref:'sam:'+'b'.repeat(32),deadline:'2026-11-25T12:00:00Z'};
 const a=plan([row,b],{limit:1});assert.equal(a.jobs[0].source_ref,b.candidate_ref);assert.equal(a.eligible_for_research,2);
});
test('empty and invalid checkpoint do not invent work',()=>{
 assert.equal(plan([]).jobs.length,0);assert.throws(()=>planBuyerResearch({records:[]}));
});
