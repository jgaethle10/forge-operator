import test from 'node:test';
import assert from 'node:assert/strict';
import {scanMerchantRevenueOpportunities as scan} from '../systemia/payments/merchant-opportunity-scanner.mjs';
const base={
 merchant_id:'merchant-001',opted_in:true,
 approved_scopes:['quotes:read_aggregates','bookings:read_aggregates','checkout:read_aggregates','invoices:read_aggregates'],
 metrics:{unfollowed_approved_quotes:4,repeat_customers_without_plan:12,failed_checkouts:8,completed_jobs_uninvoiced:1},
 evidence_ref:'merchant:aggregate:20261014',
 observed_at:'2026-10-14T22:00:00Z',now:'2026-10-14T23:00:00Z',
};
test('without merchant opt-in, no scout results',()=>{
 const r=scan({...base,opted_in:false});
 assert.equal(r.status,'HELD');assert.equal(r.recommendations.length,0);
});
test('four signals are review-only, never customer action, payment or earned share',()=>{
 const r=scan(base);
 assert.equal(r.status,'ADVISORY_ONLY');assert.equal(r.recommendations.length,4);
 assert.equal(r.communications_sent,false);assert.equal(r.payment_created,false);
 assert.equal(r.revenue_share_claimed_cents,0);assert.equal(r.measured_increment_cents,null);
 assert.equal(r.agent_execution_authority,false);
 assert.ok(r.recommendations.every(x=>x.merchant_approval_required&&x.financial_outcome==='unknown'));
});
test('no signal from data beyond its exact approved permission scope',()=>{
 const r=scan({...base,approved_scopes:['checkout:read_aggregates']});
 assert.deepEqual(r.recommendations.map(x=>x.kind),['checkout_recovery_review']);
});
test('stale or future source observations fail closed',()=>{
 assert.equal(scan({...base,observed_at:'2026-09-30T22:00:00Z'}).status,'HELD');
 assert.equal(scan({...base,observed_at:'2026-10-15T22:00:00Z'}).status,'HELD');
});
test('negative and fractional aggregate counts are invalid',()=>{
 assert.equal(scan({...base,metrics:{failed_checkouts:-3}}).status,'HELD');
 assert.equal(scan({...base,metrics:{failed_checkouts:2.2}}).status,'HELD');
});
