// Transitional Bluevine invoice path. The business owns the bank account;
// the customer pays via a bank/provider-authorized transfer or hosted link.
// This module NEVER creates a Bluevine invoice, debits an account or marks an order paid.
const key = s => typeof s === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(s);
const allowedCurrency = currency => String(currency).toUpperCase() === 'USD';

export function createBluevineReceivable({
  orderId, offerKey, amountCents, currency = 'USD',
  settlementInstitution = 'bluevine',
  recipientLegalName = 'Evercraft LLC',
  ownerAttestedBusinessAccount = false
} = {}) {
  if (![orderId, offerKey].every(key)) throw new Error('canonical order and offer ID required');
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error('positive integer amount required');
  if (!allowedCurrency(currency)) throw new Error('USD only until verified');
  if (settlementInstitution !== 'bluevine') throw new Error('unknown business bank');
  if (recipientLegalName !== 'Evercraft LLC' || ownerAttestedBusinessAccount !== true) {
    throw new Error('founder-attested Evercraft LLC bank ownership required');
  }
  return Object.freeze({
    schema:'evercraft.payments.receivable.v1',
    order_id:orderId,
    offer_key:offerKey,
    amount_cents:amountCents,
    currency:'USD',
    legal_payee:'Evercraft LLC',
    preferred_settlement_institution:'bluevine',
    business_ownership_evidence:'founder_attested_only',
    bank_connection_state:'unverified',
    external_invoice_reference:null,
    invoice_issued:false,
    payment_state:'unpaid',
    fulfillment_authorized:false,
    entitlement_authorized:false,
    method:'bank_credit_or_manual_invoice',
    order_authority:'evercraft_payments',
    provider_boundary:'raven_nexus',
    reconciliation:'bank_or_provider_authority_required'
  });
}

export function recordOfficialInvoiceCreation(receivable, {
  invoiceReference, ownerConfirmsInDashboard = false
} = {}) {
  if (receivable?.schema !== 'evercraft.payments.receivable.v1' ||
      receivable.payment_state !== 'unpaid') {
    throw new Error('valid unpaid receivable required');
  }
  if (ownerConfirmsInDashboard !== true || !key(invoiceReference)) {
    throw new Error('owner verified Bluevine invoice reference required');
  }
  // The invoice ID must be copied from the authenticated Bluevine dashboard.
  // No public checkout link or bank details are inferred.
  return Object.freeze({
    ...receivable,
    external_invoice_reference:invoiceReference,
    invoice_issued:true,
    payment_state:'unpaid',
    reconciliation:'bank_or_provider_authority_required',
    fulfillment_authorized:false,
    entitlement_authorized:false
  });
}

export function acknowledgeCustomerPaymentClaim(receivable, {customerClaimsPaid=false}={}) {
  if (receivable?.schema !== 'evercraft.payments.receivable.v1') {
    throw new Error('valid receivable required');
  }
  return Object.freeze({
    ...receivable,
    payment_state:'unpaid',
    reconciliation:customerClaimsPaid
      ? 'customer_claim_requires_authoritative_bank_verification'
      : 'bank_or_provider_authority_required',
    fulfillment_authorized:false,
    entitlement_authorized:false
  });
}

// Externally reconciled provider transfers belong in a private authenticated
// service, with amount/order matching, unique transaction consumption, refund
// and return handling. No UI/browser/customer input may mark this record paid.
