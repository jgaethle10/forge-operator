import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateOutreachQueue } from './outreach-queue.mjs';

const at = new Date('2026-10-19T14:00:00Z');
const sample = (changes={}) => ({
  prospect_key: 'qualified-a', subject_ref: 'contact:opaque-a', business: 'Example firm', channel: 'email',
  source_url: 'https://example.com/explicit-rfp', source_kind: 'explicit_public_request', source_verified: true,
  request_posted_at: '2026-10-18T12:00:00Z', request_expires_at: '2026-10-21T12:00:00Z',
  message: 'Specific reply to an actual solicitation', offer_key: 'website-audit',
  pain_evidence_state: 'source_grounded', proof_state: 'public_https_verified',
  human_approval_state: 'explicit', human_approval_ref: 'approved:review-1', budget_usd: 25000,
  ...changes,
});
const ledger = { preflightContact: () => ({ decision: 'allow', reasons: [] }) };
const assess = (leads,opts={}) => evaluateOutreachQueue({ leads, ledger, actor_ref:'operator:authorized', at, ...opts });

test('approval, source evidence, ledger and proof still cannot produce a send',()=>{
 const result=assess([sample()]);
 assert.equal(result.permit_candidates,1);
 assert.equal(result.records[0].stage,'permit_required');
 assert.equal(result.records[0].send_authorized,false);
 assert.equal(result.sending_enabled,false);
 assert.equal(result.send_attempts,0);
});
test('missing explicit review, missing proof, opt-out or unverified source fail closed',()=>{
 const r=assess([
  sample({subject_ref:'a',human_approval_state:'none',human_approval_ref:''}),
  sample({subject_ref:'b',proof_state:'missing'}),
  sample({subject_ref:'c',opted_out:true}),
  sample({subject_ref:'d',source_verified:false}),
 ]);
 assert.equal(r.permit_candidates,0);
 assert.ok(r.records.every(x=>x.stage==='held'));
});
test('expired solicitations, duplicate targets, and unsanctioned sources are held',()=>{
 const a=sample({request_expires_at:'2026-10-18T00:00:00Z'});
 const b=sample({subject_ref:'other',source_kind:'harvested_email'});
 const c=sample({subject_ref:'third'});
 const r=assess([a,b,c,c]);
 assert.equal(r.permit_candidates,1);
 assert.equal(r.reasons.duplicate_batch_target,1);
 assert.equal(r.reasons.request_stale_or_expired,1);
 assert.equal(r.reasons.solicitation_evidence_unverified,1);
});
test('ledger denies even fully reviewed candidate',()=>{
 const r=assess([sample()], {ledger:{preflightContact:()=>({decision:'deny',reasons:['channel_opted_out']})}});
 assert.equal(r.permit_candidates,0);
 assert.deepEqual(r.records[0].ledger_reasons,['channel_opted_out']);
});
test('missing ledger or throwing ledger fails closed',()=>{
 assert.equal(assess([sample()],{ledger:null}).records[0].reason,'interaction_ledger_required');
 assert.equal(assess([sample()],{ledger:{preflightContact:()=>{throw Error('unavailable')}}}).records[0].reason,'ledger_preflight_error');
});
test('output does not publish contact details, URL or message text',()=>{
 const r=assess([sample({subject_ref:'contact:private@example.com',message:'Super private custom pitch'})]);
 const serialized=JSON.stringify(r);
 assert.equal(serialized.includes('private@example.com'),false);
 assert.equal(serialized.includes('Super private'),false);
 assert.equal(serialized.includes('example.com/explicit-rfp'),false);
});
test('enforce bounded workload and reject invalid clock',()=>{
 assert.throws(()=>assess(new Array(1001).fill(sample())),/outreach_batch_size_invalid/);
 assert.throws(()=>evaluateOutreachQueue({leads:[],at:'invalid'}),/outreach_at_invalid/);
});
