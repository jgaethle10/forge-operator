// Owned commerce boundary for Evercraft Clip. No Base44 runtime or payment secrets.
export const CLIP_OFFER = Object.freeze({
  id: 'evercraft-clip-social-video-v1',
  amountCents: 499,
  currency: 'usd',
  maxSourceBytes: 35 * 1024 * 1024,
});

export function validateClipCheckout(input) {
  if (input?.userConfirmedPayment !== true) return { ok: false, code: 'CONFIRMATION_REQUIRED' };
  if (!input?.authenticatedCustomerId) return { ok: false, code: 'AUTH_REQUIRED' };
  if (!input?.orderId || !/^[a-zA-Z0-9_-]{8,160}$/.test(input.orderId)) return { ok: false, code: 'INVALID_ORDER' };
  if (!input?.sourceEvidence?.verified || !Number.isFinite(input.sourceEvidence.bytes) ||
      input.sourceEvidence.bytes <= 0 || input.sourceEvidence.bytes > CLIP_OFFER.maxSourceBytes)
    return { ok: false, code: 'SOURCE_UNVERIFIED' };
  return { ok: true };
}

export function verifyClipPayment({ order, receipt }) {
  if (!order || !receipt) return { verified: false, code: 'MISSING_EVIDENCE' };
  const valid = receipt.providerVerified === true &&
    receipt.paymentStatus === 'paid' && receipt.sessionStatus === 'complete' &&
    receipt.offerId === CLIP_OFFER.id && receipt.orderId === order.id &&
    receipt.customerId === order.customerId &&
    receipt.amountCents === CLIP_OFFER.amountCents &&
    receipt.currency === CLIP_OFFER.currency &&
    receipt.environment === order.environment &&
    receipt.refunded !== true && receipt.disputed !== true;
  return valid ? { verified: true } : { verified: false, code: 'PAYMENT_INVARIANTS_FAILED' };
}

export function releaseClipRendering({ order, receipt }) {
  const result = verifyClipPayment({ order, receipt });
  return { authorized: result.verified, reason: result.verified ? 'VERIFIED_PAYMENT' : result.code };
}
