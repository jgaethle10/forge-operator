import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileWebsiteAuditCheckoutEvidence,WEBSITE_AUDIT_OFFER_KEY} from './website-audit-payment-evidence.mjs';

const offer={offer_key:WEBSITE_AUDIT_OFFER_KEY,product_key:'systemia-website-audit',
  amount_cents:4900,currency:'usd',status:'active'};
const contract={offer_key:WEBSITE_AUDIT_OFFER_KEY,status:'ready'};
const sourceOrder=(key)=>({order_key:key,offer_key:WEBSITE_AUDIT_OFFER_KEY,
  provider:'stripe',provider_session_id:'cs_private_'+key,customer_email:'private@example.org',
  amount_cents:4900,currency:'usd',state:'checkout_open',synthetic:false});
const imported=(key)=>({order_key:key,operation:'migration.import_existing_route',
  state:'routed',provider:'stripe',provider_session_id:'cs_private_'+key,synthetic:false});
const complete=(overrides={})=>({
  offers:[offer],contracts:[contract],
  orders:[sourceOrder('a'),sourceOrder('b')],
  attempts:[imported('a'),imported('b')],receipts:[],
  coverage:{offers:true,contracts:true,orders:true,attempts:true,receipts:true},
  ...overrides,
});

test('six-like migrated checkout-open rows are NOT payment/provider proof',()=>{
  const rows=Array.from({length:6},(_,i)=>sourceOrder('key'+i));
  const attempts=rows.map(z=>imported(z.order_key));
  const report=reconcileWebsiteAuditCheckoutEvidence(complete({orders:rows,attempts}));
  assert.equal(report.counts.distinct_local_orders,6);
  assert.equal(report.counts.local_checkout_open_session_references,6);
  assert.equal(report.counts.checkout_sessions_associated_with_migration,6);
  assert.equal(report.counts.checkout_sessions_with_nonmigration_observed_attempt,0);
  assert.equal(report.counts.independently_verified_provider_sessions,null);
  assert.equal(report.counts.independently_verified_settled_orders,null);
  assert.equal(report.counts.independently_verified_net_revenue_cents,null);
  assert.equal(report.settled_payment_verified,false);
  assert.equal(report.publication_authority,false);
  assert.equal(report.next_gate,'authorize_read_only_processor_session_and_payment_reconciliation');
  assert.ok(report.warnings.includes('migration_imports_are_not_provider_verification'));
  assert.equal(JSON.stringify(report).includes('private@example.org'),false);
  assert.equal(JSON.stringify(report).includes('cs_private_'),false);
});
test('missing source scope is unknown, never zero, with a safe coverage gate',()=>{
  const report=reconcileWebsiteAuditCheckoutEvidence({offers:[offer],coverage:{offers:true}});
  assert.equal(report.counts.exact_active_offers,1);
  assert.equal(report.counts.distinct_local_orders,null);
  assert.equal(report.counts.local_qualified_receipt_rows,null);
  assert.equal(report.next_gate,'complete_private_snapshot_coverage');
});
test('observed internal checkout is still not authenticated Stripe evidence',()=>{
  const report=reconcileWebsiteAuditCheckoutEvidence(complete({
    attempts:[{...imported('a'),operation:'create_checkout',state:'observed_open'},imported('b')],
  }));
  assert.equal(report.counts.checkout_sessions_with_nonmigration_observed_attempt,1);
  assert.equal(report.counts.independently_verified_provider_sessions,null);
  assert.equal(report.buyer_checkout_live_verified,false);
});
test('internal settlement-looking receipt is not external payment proof',()=>{
  const report=reconcileWebsiteAuditCheckoutEvidence(complete({
    receipts:[{order_key:'a',offer_key:WEBSITE_AUDIT_OFFER_KEY,
      receipt_key:'private-ref',synthetic:false,verified_at:'2026-10-07T21:00:00Z',
      amount_cents:4900,currency:'usd',provider:'stripe',payment_state:'paid'}],
  }));
  assert.equal(report.counts.local_recorded_receipts,1);
  assert.equal(report.counts.local_qualified_receipt_rows,1);
  assert.ok(report.warnings.includes('internal_receipts_need_provider_reconciliation'));
  assert.equal(report.counts.independently_verified_settled_orders,null);
  assert.equal(report.payment_mutation_authority,false);
  assert.equal(report.delivery_verified,false);
});
test('incorrect offer price and duplicative/unkeyed orders are held',()=>{
  const report=reconcileWebsiteAuditCheckoutEvidence(complete({
    offers:[{...offer,amount_cents:9900}],
    orders:[sourceOrder('a'),sourceOrder('a'),{...sourceOrder('oops'),order_key:''}],
  }));
  assert.ok(report.warnings.includes('exact_offer_not_uniquely_active'));
  assert.ok(report.warnings.includes('duplicate_or_unkeyed_order_rows'));
  assert.equal(report.counts.distinct_local_orders,1);
  assert.equal(report.next_gate,'repair_exact_offer_or_fulfillment_contract');
});
test('unrelated payment records cannot inflate Website Audit counts',()=>{
  const report=reconcileWebsiteAuditCheckoutEvidence(complete({
    orders:[sourceOrder('a'),{...sourceOrder('unrelated'),offer_key:'other.offer'}],
    receipts:[{order_key:'unrelated',offer_key:'other.offer',verified_at:'now',amount_cents:4900}],
  }));
  assert.equal(report.counts.distinct_local_orders,1);
  assert.equal(report.counts.local_recorded_receipts,0);
});
