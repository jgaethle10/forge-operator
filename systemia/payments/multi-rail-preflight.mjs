import { verifyBankDestination } from './bank-destination-policy.mjs';

// Evercraft Payments owns the order. This module does not process money.
// All provider status comes from Raven Nexus server-side probes, not browser input.
export const PAYMENT_METHODS = Object.freeze({
  card:            {provider:'stripe', channel:'hosted'},
  apple_pay:       {provider:'stripe', channel:'hosted'},
  google_pay:      {provider:'stripe', channel:'hosted'},
  cash_app_pay:    {provider:'stripe', channel:'hosted'},
  paypal:          {provider:'paypal', channel:'hosted'},
  venmo:           {provider:'paypal', channel:'hosted'},
  ach_debit:       {provider:'ach_processor', channel:'hosted'},
  ach_credit:      {provider:'bank', channel:'manual'},
  zelle:           {provider:'zelle_business_bank', channel:'manual'},
  cash_app_transfer:{provider:'cash_app_business', channel:'manual'},
  venmo_transfer:  {provider:'venmo_business', channel:'manual'}
});

export function listPaymentMethods() {
  return Object.keys(PAYMENT_METHODS);
}

const validKey = value => typeof value === 'string' &&
  /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
const isVerifiedProvider = state => state?.connected === true &&
  state?.merchant_approved === true &&
  state?.live_checkout_canary_passed === true &&
  state?.canary_age_ok === true;
const isVerifiedDestination = (state, method) => state?.business_account_eligible === true &&
  state?.receiving_details_owner_approved === true &&
  validKey(state?.instruction_reference) &&
  (!['ach_credit','zelle'].includes(method) || verifyBankDestination(method, state.bank_evidence));

// providerReadiness and manualReadiness must be loaded by a trusted backend.
// Never put bank details, PayPal secrets, tokens, or Cash App credentials here.
export function preparePaymentAttempt({
  orderId, productKey, offerKey, amountCents, currency = 'USD', method,
  providerReadiness = {}, manualReadiness = {}
} = {}) {
  if (![orderId, productKey, offerKey].every(validKey)) throw new Error('valid canonical order and offer keys required');
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error('positive integer amountCents required');
  if (String(currency).toUpperCase() !== 'USD') throw new Error('USD only until other currencies are verified');
  const rail = PAYMENT_METHODS[method];
  if (!rail) throw new Error('unsupported payment method');
  const status = rail.channel === 'hosted'
    ? (isVerifiedProvider(providerReadiness[rail.provider]) ? 'provider_handoff_eligible' : 'blocked_unverified_provider')
    : (isVerifiedDestination(manualReadiness[method], method) ? 'manual_instructions_eligible' : 'blocked_unverified_destination');

  return Object.freeze({
    schema: 'evercraft.payments.method-attempt.v1',
    order_id: orderId,
    product_key: productKey,
    offer_key: offerKey,
    amount_cents: amountCents,
    currency: 'USD',
    payment_method: method,
    settlement_provider: rail.provider,
    channel: rail.channel,
    status,
    instruction_reference: status === 'manual_instructions_eligible'
      ? manualReadiness[method].instruction_reference : null,
    commerce_layer: 'evercraft_payments',
    provider_boundary: 'raven_nexus',
    order_truth: 'evercraft_payments',
    payment_state: 'unpaid',
    fulfillment_authorized: false,
    entitlement_authorized: false,
    provider_receipt_verified: false,
    requires_authoritative_receipt: true,
    // One order may have separate attempts, but retries must not create duplicate economic orders.
    attempt_key: `${orderId}:${method}`
  });
}

// Safe UI gate: a provider redirect is not a paid receipt.
// A screenshot, browser callback, claimed transfer, or transaction ID submitted
// by the payer cannot unlock fulfillment. Only backend-verified settlement may.
export function classifyPayerConfirmation(attempt, confirmation = {}) {
  if (!attempt || attempt.schema !== 'evercraft.payments.method-attempt.v1') {
    throw new Error('canonical payment attempt required');
  }
  return Object.freeze({
    order_id: attempt.order_id,
    payment_method: attempt.payment_method,
    status: confirmation?.customer_claimed_paid ? 'awaiting_authoritative_reconciliation' : 'awaiting_payment',
    payment_state: 'unpaid',
    fulfillment_authorized: false,
    entitlement_authorized: false,
    provider_receipt_verified: false
  });
}
