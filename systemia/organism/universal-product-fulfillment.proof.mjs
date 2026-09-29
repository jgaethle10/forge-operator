import assert from 'node:assert/strict';
import fs from 'node:fs';
import { auditFulfillmentRegistry, buildUniversalFulfillmentPlan, getFulfillmentProfile } from './universal-product-fulfillment.mjs';

const catalog = JSON.parse(fs.readFileSync('public/.well-known/evercraft-machine-catalog.json','utf8'));
const SELL_NOW = catalog.offers
  .filter((offer) => offer.commercial_state === 'sell_now')
  .map((offer) => offer.public_id)
  .sort();

const audit = auditFulfillmentRegistry({ sellNowIds: SELL_NOW });
assert.equal(audit.pass, true);
assert.equal(audit.expected_sell_now_count, SELL_NOW.length);
assert.equal(SELL_NOW.length, 14, 'current canonical sell-now count changed; add/remove fulfillment profiles deliberately');
assert.equal(audit.covered_sell_now_count, SELL_NOW.length);
assert.deepEqual(audit.missing, []);
assert.deepEqual(audit.invalid, []);

for (const id of SELL_NOW) {
  const profile = getFulfillmentProfile(id);
  assert(profile, id + ' missing profile');
  assert(profile.intake.length > 0, id + ' missing intake');
  assert(profile.deliverables.length > 0, id + ' missing deliverables');
  assert(profile.qa.length > 0, id + ' missing QA');
  assert(profile.specialist_roles.includes('Systemia'), id + ' must include Systemia');
}

const payment = {
  public_id:'website-launch-service-v1',
  provider:'stripe',
  state:'paid',
  verified:true,
  synthetic:false,
  amount_cents:50000,
  currency:'usd',
  order_key:'order-001',
  receipt_key:'receipt-001',
  evidence_ref:'stripe:checkout.session:cs_live_example',
  verified_at:'2026-09-29T02:00:00Z'
};
const plan = buildUniversalFulfillmentPlan({ payment, now:new Date('2026-09-29T02:01:00Z') });
assert.equal(plan.authorized, true);
assert.equal(plan.state, 'intake_required');
assert.equal(plan.team.execution_fabric, 'Saban');
assert.equal(plan.completion_receipt_required, true);
assert(plan.tasks.some((t) => t.work_key === 'parallel-quality-pass'));
assert(plan.tasks.some((t) => t.work_key === 'completion-receipt'));
assert.equal(plan.authority.production_mutation, 'not_authorized_by_payment');

const synthetic = buildUniversalFulfillmentPlan({ payment:{...payment,synthetic:true} });
assert.equal(synthetic.authorized,false);
assert(synthetic.reasons.includes('synthetic_payment'));

const checkoutOnly = buildUniversalFulfillmentPlan({ payment:{...payment,state:'checkout_open',verified:false,evidence_ref:''} });
assert.equal(checkoutOnly.authorized,false);
assert(checkoutOnly.reasons.includes('provider_not_verified'));
assert(checkoutOnly.reasons.includes('payment_not_complete'));

console.log(JSON.stringify({
  ok:true,
  sell_now_profiles:audit.covered_sell_now_count,
  universal_receipt_required:true,
  saban_wired:true,
  synthetic_rejected:true,
  checkout_only_rejected:true
}));
