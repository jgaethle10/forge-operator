function clean(value) {
  return String(value ?? '').trim();
}

function orderKey(order) {
  return clean(order?.order_key || order?.order_id);
}

function parsedMs(value) {
  const ms = Date.parse(clean(value));
  return Number.isFinite(ms) ? ms : null;
}

function normalizedCurrency(value) {
  return clean(value || 'USD').toUpperCase();
}

export function matchingVerifiedReceipt(order, receipts = []) {
  const key = orderKey(order);
  const amount = Number(order?.amount_cents);
  const currency = normalizedCurrency(order?.currency);
  const syntheticOrder = Boolean(order?.synthetic);

  return (Array.isArray(receipts) ? receipts : []).find((receipt) => {
    const receiptOrderKey = clean(receipt?.order_key || receipt?.order_id);
    if (!key || receiptOrderKey !== key) return false;
    if (Number(receipt?.amount_cents) !== amount) return false;
    if (normalizedCurrency(receipt?.currency) !== currency) return false;
    if (!syntheticOrder && Boolean(receipt?.synthetic)) return false;
    return Boolean(
      receipt?.verified_at &&
      clean(receipt?.receipt_key || receipt?.evidence_ref)
    );
  }) || null;
}

export function deriveReceivableTruth({
  order,
  receipts = [],
  providerObservation = null,
  now = new Date(),
  staleAfterHours = 72,
} = {}) {
  if (!order) throw new Error('Evercraft Payments receivable order is required.');

  const key = orderKey(order);
  if (!key) throw new Error('Evercraft Payments receivable requires order_key or order_id.');

  const receipt = matchingVerifiedReceipt(order, receipts);
  const orderState = clean(order?.state || order?.payment_state || 'unknown').toLowerCase();
  const canonicalPaid = Boolean(receipt);
  const orderSaysPaid = ['paid', 'verified_paid'].includes(orderState);
  const providerPaid = Boolean(providerObservation?.paid);

  const checkoutMs = parsedMs(order?.checkout_created_at || order?.created_at || order?.created_at_iso);
  const nowMs = now instanceof Date ? now.getTime() : parsedMs(now);
  const ageHours =
    checkoutMs != null && Number.isFinite(nowMs)
      ? Math.max(0, Math.round(((nowMs - checkoutMs) / 36e5) * 10) / 10)
      : null;

  const staleOpen =
    !canonicalPaid &&
    ['created', 'checkout_open', 'not_verified', 'prepared_for_human_continuation'].includes(orderState) &&
    ageHours != null &&
    ageHours >= staleAfterHours;

  let truthState = orderState;
  if (canonicalPaid && orderSaysPaid) truthState = 'verified_paid';
  else if (canonicalPaid && !orderSaysPaid) truthState = 'receipt_present_order_state_drift';
  else if (!canonicalPaid && orderSaysPaid) truthState = 'paid_state_missing_receipt';
  else if (providerPaid) truthState = 'provider_paid_unreconciled';
  else if (staleOpen) truthState = 'stale_open';

  const attention = [];
  if (truthState === 'receipt_present_order_state_drift') {
    attention.push('repair_order_state_from_verified_receipt');
  }
  if (truthState === 'paid_state_missing_receipt') {
    attention.push('do_not_count_as_revenue_until_receipt_exists');
  }
  if (truthState === 'provider_paid_unreconciled') {
    attention.push('reconcile_provider_payment_into_evercraft_receipt');
  }
  if (truthState === 'stale_open') {
    attention.push('follow_up_or_refresh_checkout');
  }

  return {
    schema: 'evercraft.payments.receivable-truth.v1',
    authority: 'Evercraft Payments',
    settlement_router: 'Raven Nexus',
    order_key: key,
    order_state: orderState,
    truth_state: truthState,
    canonical_paid: canonicalPaid,
    canonical_receipt_key: receipt?.receipt_key || null,
    verified_at: receipt?.verified_at || order?.verified_at || null,
    amount_cents: Number(order?.amount_cents || 0),
    currency: normalizedCurrency(order?.currency),
    synthetic: Boolean(order?.synthetic),
    checkout_age_hours: ageHours,
    stale_open: staleOpen,
    provider_observation: providerObservation || null,
    reconciliation_required: providerPaid && !canonicalPaid,
    attention,
    semantics: {
      checkout_is_not_payment: true,
      provider_observation_is_not_payment_proof: true,
      verified_receipt_is_payment_authority: true,
      settlement_provider_is_replaceable_adapter: true,
    },
  };
}

export function buildReceivablesPortfolio({
  orders = [],
  receipts = [],
  providerObservations = {},
  now = new Date(),
  staleAfterHours = 72,
} = {}) {
  const receivables = (Array.isArray(orders) ? orders : []).map((order) =>
    deriveReceivableTruth({
      order,
      receipts,
      providerObservation: providerObservations?.[orderKey(order)] || null,
      now,
      staleAfterHours,
    })
  );

  const currencies = {};
  for (const row of receivables) {
    currencies[row.currency] ||= {
      currency: row.currency,
      open_cents: 0,
      verified_paid_cents: 0,
      open_count: 0,
      paid_count: 0,
      stale_count: 0,
      reconciliation_count: 0,
    };

    const bucket = currencies[row.currency];
    if (row.canonical_paid && !row.synthetic) {
      bucket.verified_paid_cents += row.amount_cents;
      bucket.paid_count += 1;
    } else if (!['cancelled', 'refunded'].includes(row.order_state)) {
      bucket.open_cents += row.amount_cents;
      bucket.open_count += 1;
    }
    if (row.stale_open) bucket.stale_count += 1;
    if (row.reconciliation_required) bucket.reconciliation_count += 1;
  }

  return {
    schema: 'evercraft.payments.receivables-portfolio.v1',
    authority: 'Evercraft Payments',
    settlement_router: 'Raven Nexus',
    receivables,
    currencies: Object.values(currencies),
    count: receivables.length,
  };
}
