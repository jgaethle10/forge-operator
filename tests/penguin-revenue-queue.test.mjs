import test from 'node:test';
import assert from 'node:assert/strict';
import {createRevenueQueue} from '../scripts/penguin-revenue-queue.mjs';
const web={company:'Example',site:'https://example.org/',observations:[{issue:'other',source:'https://example.org/',checked_at:'2026-11-18',evidence:'The public footer shows a placeholder email contact.'}]};
test('unifies public observations and client signals without contact authority',()=>{
 const result=createRevenueQueue({webProspects:[web],clientSignals:[{
  prospect_key:'buyer-01',business:'Sample Contractor',source_kind:'client_request',
  observed_at:'2026-11-18T10:00:00Z',evidence_refs:['internal:request-01'],
  need_tags:['website_diagnosis'],scope_requested:true,budget_confirmed:false
 }],now:new Date('2026-11-18T20:00:00Z')});
 assert.equal(result.summary.total,2);
 assert.equal(result.queue[0].stage,'review_evidence');
 assert.equal(result.queue[1].buyer_confirmed,false);
 assert.equal(result.queue[1].send_authorized,false);
 assert.equal(result.authority.can_send,false);
 assert.equal(result.authority.can_charge,false);
});
test('does not promote an unsourced lead into a buyer',()=>{
 const result=createRevenueQueue({clientSignals:[{prospect_key:'unknown-1',business:'Unknown'}],now:new Date('2026-11-18T20:00:00Z')});
 assert.equal(result.queue[0].stage,'research_only');
 assert.equal(result.queue[0].buyer_confirmed,false);
});
