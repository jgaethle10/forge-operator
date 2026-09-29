import assert from 'node:assert/strict';
import { buildIBMiFulfillmentPlan, verifyIBMiFulfillmentAuthority } from './ibmi-rescue-fulfillment.mjs';

const order = {
  order_key:'order-real-001',
  offer_key:'ibmi_estate_xray_250',
  product_key:'ibmi-rescue',
  provider:'stripe',
  customer_email:'buyer@example.com',
  business_name:'Example Manufacturing',
  amount_cents:25000,
  currency:'usd',
  billing_mode:'one_time',
  state:'paid',
  synthetic:false,
  verified_at:'2026-09-28T23:00:00Z',
  mission_key:'legacy-software-modernization-radar-2026-09-13',
  revenue_lane_key:'ibmi-rescue-machine-commerce-20260924',
};
const receipt = {
  receipt_key:'receipt-real-001',
  order_key:'order-real-001',
  offer_key:'ibmi_estate_xray_250',
  product_key:'ibmi-rescue',
  provider:'stripe',
  amount_cents:25000,
  currency:'usd',
  synthetic:false,
  verification_path:'provider_refetch',
  verified_at:'2026-09-28T23:00:00Z',
  evidence_ref:'stripe:checkout.session:cs_live_example',
};

const verified = verifyIBMiFulfillmentAuthority({order,receipt});
assert.equal(verified.authorized,true);
assert.equal(verified.authority_basis,'provider_verified_non_synthetic_payment');

const plan = buildIBMiFulfillmentPlan({order,receipt,now:new Date('2026-09-28T23:01:00Z')});
assert.equal(plan.authorized,true);
assert.equal(plan.state,'intake_required');
assert.equal(plan.offer_key,'ibmi_estate_xray_250');
assert.equal(plan.tasks[0].work_key,'customer-intake');
assert.equal(plan.tasks[0].human_gate_required,true);
assert.equal(plan.authority.private_system_access,'not_authorized_by_payment');
assert.equal(plan.authority.production_cutover,'not_authorized');
assert.equal(plan.tasks.at(-1).payment_request,'requires_separate_human_confirmation');

const synthetic = buildIBMiFulfillmentPlan({
  order:{...order,order_key:'qa-order',synthetic:true},
  receipt:{...receipt,receipt_key:'qa-receipt',order_key:'qa-order',synthetic:true},
});
assert.equal(synthetic.authorized,false);
assert(synthetic.reasons.includes('synthetic_order'));
assert(synthetic.reasons.includes('synthetic_receipt'));

const checkoutOnly = buildIBMiFulfillmentPlan({
  order:{...order,state:'checkout_open',verified_at:''},
  receipt:null,
});
assert.equal(checkoutOnly.authorized,false);
assert(checkoutOnly.reasons.includes('missing_receipt'));

const mismatch = verifyIBMiFulfillmentAuthority({
  order,
  receipt:{...receipt,amount_cents:150000},
});
assert.equal(mismatch.authorized,false);
assert(mismatch.reasons.includes('amount_mismatch'));

console.log(JSON.stringify({
  ok:true,
  real_payment_authorizes_fulfillment:true,
  synthetic_rejected:true,
  checkout_only_rejected:true,
  private_access_not_granted_by_payment:true,
  production_cutover_not_granted_by_payment:true,
}));
