import crypto from 'node:crypto';
import registry from './product-fulfillment-registry.json' with { type: 'json' };

const clean = (v) => String(v ?? '').trim();
const nowIso = (now) => (now instanceof Date ? now : new Date(now || Date.now())).toISOString();

export function getFulfillmentProfile(publicId) {
  return registry.products.find((row) => row.public_id === clean(publicId)) || null;
}

export function verifyUniversalPaymentAuthority({ payment, publicId } = {}) {
  const profile = getFulfillmentProfile(publicId || payment?.public_id);
  const reasons = [];
  if (!profile) reasons.push('unknown_sell_now_product');
  if (!payment) reasons.push('missing_payment_evidence');
  if (payment) {
    if (payment.synthetic === true) reasons.push('synthetic_payment');
    if (payment.verified !== true) reasons.push('provider_not_verified');
    if (!['paid','complete','completed'].includes(clean(payment.state).toLowerCase())) reasons.push('payment_not_complete');
    if (!clean(payment.provider)) reasons.push('missing_provider');
    if (!clean(payment.evidence_ref)) reasons.push('missing_provider_evidence_ref');
    if (!(Number(payment.amount_cents) > 0)) reasons.push('invalid_paid_amount');
    if (clean(payment.public_id) && profile && clean(payment.public_id) !== profile.public_id) reasons.push('product_mismatch');
  }
  return {
    authorized: reasons.length === 0,
    reasons,
    profile,
    authority_basis: reasons.length ? 'insufficient_payment_authority' : 'provider_verified_non_synthetic_payment'
  };
}

function idFor(payment, profile) {
  const raw = [profile.public_id, payment.order_key || '', payment.receipt_key || '', payment.evidence_ref || ''].join('|');
  return 'fulfillment:' + crypto.createHash('sha256').update(raw).digest('hex').slice(0,24);
}

export function buildUniversalFulfillmentPlan({ payment, publicId, now = new Date() } = {}) {
  const verification = verifyUniversalPaymentAuthority({ payment, publicId });
  if (!verification.authorized) {
    return {
      schema:'evercraft.product-fulfillment.plan.v1',
      authorized:false,
      state:'blocked_payment_authority',
      public_id:clean(publicId || payment?.public_id) || null,
      reasons:verification.reasons,
      generated_at:nowIso(now)
    };
  }

  const profile = verification.profile;
  const humanReview = profile.human_review_before_delivery === true;
  const tasks = [
    {
      work_key:'payment-reconcile',
      owner:'Systemia',
      state:'ready',
      completion_rule:'Provider-verified non-synthetic payment is bound to this product, buyer and purchased scope.'
    },
    {
      work_key:'intake-scope-lock',
      owner:'Systemia',
      state:'blocked_dependency',
      dependency_keys:['payment-reconcile'],
      human_gate_required:true,
      required_fields:profile.intake,
      completion_rule:'Customer scope and required inputs are present; private access is separately authorized if needed.'
    },
    {
      work_key:'specialist-execution',
      owner:'Product specialist',
      execution_fabric:'Saban',
      state:'blocked_dependency',
      dependency_keys:['intake-scope-lock'],
      deliverables:profile.deliverables,
      production_mutation:false
    },
    {
      work_key:'parallel-quality-pass',
      owner:'Saban',
      state:'blocked_dependency',
      dependency_keys:['specialist-execution'],
      checks:profile.qa,
      authority:'evidence_and_quality_only'
    },
    {
      work_key:'delivery-package',
      owner:'Evercraft Shipping',
      state:'blocked_dependency',
      dependency_keys:['parallel-quality-pass'],
      completion_rule:'Purchased deliverables pass Evercraft Shipping v2 preflight: client-safe filenames, non-empty/openable files, render verification for visual documents, MIME/extension consistency, SHA-256 artifact manifest, package digest and duplicate-content checks.'
    },
    ...(humanReview ? [{
      work_key:'human-delivery-review',
      owner:'Human reviewer',
      state:'blocked_dependency',
      dependency_keys:['delivery-package'],
      human_gate_required:true,
      completion_rule:'A human confirms the package matches the purchased promise before customer delivery.'
    }] : []),
    {
      work_key:'customer-delivery',
      owner:'Evercraft Shipping',
      state:'blocked_dependency',
      dependency_keys:[humanReview ? 'human-delivery-review' : 'delivery-package'],
      completion_rule:'The current non-superseded Shipping v3 order is provider-accepted exactly once, then the sent copy is read back to verify recipient, subject and attachment manifest. Thread failure may fall back to fresh outbound only when the prior attempt is proven pre-acceptance or sent-copy absence is verified. Deliberate resends require a separately authorized reissue linked to the original delivery.'
    },
    {
      work_key:'completion-receipt',
      owner:'Systemia',
      state:'blocked_dependency',
      dependency_keys:['customer-delivery'],
      completion_rule:'A verified Shipping v2 delivery receipt plus Shipping v3 chain-of-custody proof records product, order/payment evidence, current package version, package digest, customer-safe artifact manifest, provider message ID, sent-copy verification, QA state and delivered_at.'
    },
    {
      work_key:'expansion-review',
      owner:'Systemia',
      state:'blocked_dependency',
      dependency_keys:['completion-receipt'],
      human_gate_required:true,
      payment_request:'requires_separate_human_confirmation',
      completion_rule:'Any upsell, renewal or larger project is proposed only after the purchased deliverable is complete.'
    }
  ];

  return {
    schema:'evercraft.product-fulfillment.plan.v1',
    authorized:true,
    state:'intake_required',
    fulfillment_key:idFor(payment, profile),
    mission_key:registry.mission_key,
    public_id:profile.public_id,
    product_name:profile.name,
    execution_mode:profile.execution_mode,
    native_state:profile.native_state,
    payment:{
      provider:clean(payment.provider),
      order_key:clean(payment.order_key) || null,
      receipt_key:clean(payment.receipt_key) || null,
      amount_cents:Number(payment.amount_cents),
      currency:clean(payment.currency || 'usd').toLowerCase(),
      evidence_ref:clean(payment.evidence_ref),
      verified_at:clean(payment.verified_at) || null
    },
    intake_required:profile.intake,
    promised_deliverables:profile.deliverables,
    qa_contract:profile.qa,
    team:{
      coordinator:'Systemia',
      execution_fabric:'Saban',
      discovery_and_context:'CHUM',
      specialist_roles:profile.specialist_roles,
      packaging:'Evercraft Shipping',
      shipping_contract:'evercraft.shipping.control-tower.v3',
      final_authority:'human gates preserved'
    },
    tasks,
    authority:{
      payment_scope_only:true,
      private_system_access:'separate_explicit_authorization_required',
      credentials:'not_granted_by_payment',
      production_mutation:'not_authorized_by_payment',
      production_cutover:'not_authorized_by_payment',
      external_communication:'customer_delivery_only_within_purchased_scope',
      expansion_payment_request:'human_gate'
    },
    completion_receipt_required:true,
    generated_at:nowIso(now)
  };
}

export function auditFulfillmentRegistry({ sellNowIds = [] } = {}) {
  const profiles = new Map(registry.products.map((p) => [p.public_id, p]));
  const ids = [...new Set((sellNowIds || []).map(clean).filter(Boolean))];
  const missing = ids.filter((id) => !profiles.has(id));
  const orphaned = registry.products.map((p) => p.public_id).filter((id) => ids.length && !ids.includes(id));
  const invalid = registry.products.filter((p) =>
    !p.public_id || !p.name || !p.execution_mode ||
    !Array.isArray(p.intake) || !p.intake.length ||
    !Array.isArray(p.deliverables) || !p.deliverables.length ||
    !Array.isArray(p.qa) || !p.qa.length ||
    !Array.isArray(p.specialist_roles) || !p.specialist_roles.length
  ).map((p) => p.public_id || 'unknown');

  return {
    schema:'evercraft.product-fulfillment.registry-audit.v1',
    expected_sell_now_count:ids.length,
    profile_count:registry.products.length,
    covered_sell_now_count:ids.filter((id) => profiles.has(id)).length,
    missing,
    orphaned,
    invalid,
    pass:missing.length === 0 && invalid.length === 0
  };
}
