import crypto from 'node:crypto';

const SUPPORTED_OFFERS = new Map([
  ['ibmi_estate_xray_250', {
    name:'IBM i Estate X-Ray',
    tier:'xray',
    amount_cents:25000,
    deliverables:[
      'bounded dependency map',
      'verified-fact versus assumption register',
      'compatibility and integration risk register',
      'test and rollback next-step plan',
    ],
  }],
  ['ibmi_74_deadline_xray_250', {
    name:'IBM i 7.4 Deadline X-Ray',
    tier:'xray',
    amount_cents:25000,
    deliverables:[
      'bounded dependency map',
      '7.4-specific support and upgrade assumption register',
      'compatibility and vendor-risk register',
      'test and rollback next-step plan',
    ],
  }],
  ['ibmi_upgrade_proof_sprint_1500', {
    name:'IBM i Upgrade Proof Sprint',
    tier:'proof_sprint',
    amount_cents:150000,
    deliverables:[
      'deeper workload dependency reconstruction',
      'behavior and compatibility evidence package',
      'test and rollback plan',
      'human-review-ready modernization handoff',
    ],
  }],
]);

function clean(value) {
  return String(value ?? '').trim();
}

function sha(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
}

export function verifyIBMiFulfillmentAuthority({ order, receipt } = {}) {
  const reasons = [];
  if (!order) reasons.push('missing_order');
  if (!receipt) reasons.push('missing_receipt');
  if (reasons.length) return { authorized:false, reasons };

  const offer = SUPPORTED_OFFERS.get(clean(order.offer_key));
  if (!offer) reasons.push('unsupported_offer');
  if (clean(order.product_key) !== 'ibmi-rescue') reasons.push('wrong_order_product');
  if (clean(receipt.product_key) !== 'ibmi-rescue') reasons.push('wrong_receipt_product');
  if (order.synthetic === true) reasons.push('synthetic_order');
  if (receipt.synthetic === true) reasons.push('synthetic_receipt');
  if (clean(order.state) !== 'paid') reasons.push('order_not_paid');
  if (!clean(order.verified_at)) reasons.push('order_not_provider_verified');
  if (!clean(receipt.verified_at)) reasons.push('receipt_not_verified');
  if (!clean(receipt.evidence_ref)) reasons.push('receipt_missing_evidence');
  if (!['provider_refetch','webhook','manual_verified'].includes(clean(receipt.verification_path))) reasons.push('invalid_verification_path');
  if (clean(order.order_key) !== clean(receipt.order_key)) reasons.push('order_key_mismatch');
  if (clean(order.offer_key) !== clean(receipt.offer_key)) reasons.push('offer_key_mismatch');
  if (Number(order.amount_cents) !== Number(receipt.amount_cents)) reasons.push('amount_mismatch');
  if (clean(order.currency).toLowerCase() !== clean(receipt.currency).toLowerCase()) reasons.push('currency_mismatch');
  if (offer && Number(order.amount_cents) !== offer.amount_cents) reasons.push('unexpected_offer_amount');

  return {
    authorized: reasons.length === 0,
    reasons,
    offer: offer || null,
    authority_basis: reasons.length === 0
      ? 'provider_verified_non_synthetic_payment'
      : 'insufficient_payment_authority',
  };
}

export function buildIBMiFulfillmentPlan({ order, receipt, now = new Date() } = {}) {
  const verification = verifyIBMiFulfillmentAuthority({ order, receipt });
  if (!verification.authorized) {
    return {
      schema:'evercraft.ibmi-rescue.fulfillment.v1',
      authorized:false,
      state:'blocked_payment_authority',
      reasons:verification.reasons,
      order_key:clean(order?.order_key) || null,
      receipt_key:clean(receipt?.receipt_key) || null,
      generated_at:(now instanceof Date ? now : new Date(now)).toISOString(),
    };
  }

  const at = now instanceof Date ? now : new Date(now);
  const orderKey = clean(order.order_key);
  const receiptKey = clean(receipt.receipt_key);
  const offerKey = clean(order.offer_key);
  const packageKey = 'ibmi-fulfillment:' + sha(orderKey + '|' + receiptKey).slice(0,20);

  const tasks = [
    {
      work_key:'customer-intake',
      title:'Collect bounded customer intake and explicit evidence authorization',
      state:'ready',
      human_gate_required:true,
      completion_rule:'Customer or authorized representative defines the workload boundary and authorizes the supplied evidence for analysis.',
    },
    {
      work_key:'admit-evidence',
      title:'Admit only customer-authorized evidence into Legacy Rescue',
      state:'blocked_dependency',
      dependency_keys:['customer-intake'],
      private_system_access:'not_authorized_by_payment',
      completion_rule:'Evidence is customer-supplied or separately authorized; provenance and scope are recorded.',
    },
    {
      work_key:'reconstruct-dependencies',
      title:'Reconstruct the bounded IBM i dependency graph',
      state:'blocked_dependency',
      dependency_keys:['admit-evidence'],
      production_mutation:false,
    },
    {
      work_key:'characterize-risk',
      title:'Separate verified behavior and dependencies from assumptions and unknowns',
      state:'blocked_dependency',
      dependency_keys:['reconstruct-dependencies'],
      production_mutation:false,
    },
    {
      work_key:'test-rollback-plan',
      title:'Build the evidence-backed test and rollback plan',
      state:'blocked_dependency',
      dependency_keys:['characterize-risk'],
      production_mutation:false,
    },
    {
      work_key:'evidence-qa',
      title:'Run adversarial QA on evidence, claims, provenance, uncertainty and scope',
      state:'blocked_dependency',
      dependency_keys:['test-rollback-plan'],
      production_mutation:false,
    },
    {
      work_key:'customer-delivery',
      title:'Deliver the bounded evidence package',
      state:'blocked_dependency',
      dependency_keys:['evidence-qa'],
      human_review_required:true,
      completion_rule:'Human-reviewed package is delivered to the authorized customer contact.',
    },
    {
      work_key:'expansion-review',
      title:'Review whether a larger Proof Sprint or modernization engagement is justified',
      state:'blocked_dependency',
      dependency_keys:['customer-delivery'],
      human_gate_required:true,
      payment_request:'requires_separate_human_confirmation',
    },
  ];

  return {
    schema:'evercraft.ibmi-rescue.fulfillment.v1',
    authorized:true,
    state:'intake_required',
    package_key:packageKey,
    mission_key:clean(order.mission_key) || 'legacy-software-modernization-radar-2026-09-13',
    revenue_lane_key:clean(order.revenue_lane_key) || null,
    order_key:orderKey,
    receipt_key:receiptKey,
    offer_key:offerKey,
    offer_name:verification.offer.name,
    offer_tier:verification.offer.tier,
    amount_cents:Number(order.amount_cents),
    currency:clean(order.currency).toLowerCase(),
    customer_email:clean(order.customer_email) || null,
    business_name:clean(order.business_name) || null,
    verified_at:clean(receipt.verified_at),
    payment_evidence_ref:clean(receipt.evidence_ref),
    deliverables:verification.offer.deliverables,
    tasks,
    authority:{
      paid_fulfillment:'authorized_by_provider_verified_non_synthetic_receipt',
      private_system_access:'not_authorized_by_payment',
      credentials:'not_requested_by_default',
      preferred_evidence_path:'customer_supplied_exports_or_separately_authorized_read_only_evidence',
      production_mutation:'not_authorized',
      production_cutover:'not_authorized',
      additional_payment_request:'human_gate',
    },
    generated_at:at.toISOString(),
  };
}
