/**
 * Evercraft Lift v0: policy-only, side-effect-free domain helpers.
 * Not an authorization system, payout processor, or source of settlement truth.
 */
export const LIFT_POLICY_VERSION = 'evercraft.lift.policy.v0';
export const PAYMENT_BOUNDARY = Object.freeze({
  commerce_layer: 'evercraft_payments',
  provider_boundary: 'raven_nexus',
  checkout_enabled: false,
  external_donations_enabled: false,
  direct_beneficiary_payouts_enabled: false,
});

const VALID_CATEGORIES = new Set(['housing', 'utilities', 'food', 'health', 'transport', 'other']);
const VALID_AID = new Set(['bill_payment', 'service', 'goods', 'referral']);

export function reviewListing(caseRecord) {
  const reasons = [];
  if (!caseRecord || typeof caseRecord !== 'object') return { publishable: false, reasons: ['case record required'] };
  if (caseRecord.status !== 'approved') reasons.push('case must be approved');
  if (caseRecord.verification?.identity !== 'verified') reasons.push('private identity review required');
  if (caseRecord.verification?.need !== 'verified') reasons.push('need or provider evidence review required');
  if (caseRecord.consent?.public_listing !== true) reasons.push('explicit public listing consent required');
  if (caseRecord.consent?.data_processing !== true) reasons.push('data processing consent required');
  if (caseRecord.disbursement?.state !== 'approved') reasons.push('disbursement plan approval required');
  if (caseRecord.disbursement?.destination !== 'verified_provider_or_partner') reasons.push('verified vendor or assistance partner required');
  if (!VALID_CATEGORIES.has(caseRecord.category)) reasons.push('supported category required');
  if (!Number.isSafeInteger(caseRecord.goal_cents) || caseRecord.goal_cents <= 0) reasons.push('positive integer goal in cents required');
  if (!caseRecord.public?.title || !caseRecord.public?.region) reasons.push('safe public title and broad region required');
  return { publishable: reasons.length === 0, reasons };
}

/** Only a hardcoded allowlist may ever leave the private review boundary. */
export function publicListing(caseRecord) {
  const gate = reviewListing(caseRecord);
  if (!gate.publishable) throw new Error(`Lift listing blocked: ${gate.reasons.join('; ')}`);
  return Object.freeze({
    id: String(caseRecord.id),
    title: String(caseRecord.public.title).slice(0, 110),
    summary: String(caseRecord.public.summary || '').slice(0, 240),
    region: String(caseRecord.public.region).slice(0, 80),
    category: caseRecord.category,
    goal_cents: caseRecord.goal_cents,
    assistance_kind: VALID_AID.has(caseRecord.assistance_kind) ? caseRecord.assistance_kind : 'referral',
    verification_label: 'reviewed_by_lift',
    payments_available: false,
  });
}

/** A verified resource match is still an introduction, not eligibility or approval. */
export function matchPartnerCandidates(listing, partnerDirectory) {
  if (!Array.isArray(partnerDirectory)) return [];
  return partnerDirectory.filter((p) => p?.active === true &&
    Array.isArray(p.categories) && p.categories.includes(listing.category) &&
    Array.isArray(p.regions) && (p.regions.includes(listing.region) || p.regions.includes('*')) &&
    Array.isArray(p.assistance_kinds) && p.assistance_kinds.includes(listing.assistance_kind)
  ).map((p) => ({ partner_id: String(p.id), name: String(p.public_name), status: 'possible_match_unconfirmed' }));
}

/**
 * Illustrative ledger reducer. Real implementation MUST validate signatures,
 * authenticated order mapping, replay protection, refunds, and payout receipts.
 * Never use this function to trigger fulfillment or issue donor tax receipts.
 */
export function previewFundingTotals(events = []) {
  const seen = new Set();
  let settled = 0; let reversed = 0;
  for (const e of events) {
    if (!e || e.authoritative_receipt_verified !== true || !e.receipt_id || seen.has(e.receipt_id)) continue;
    if (!Number.isSafeInteger(e.amount_cents) || e.amount_cents <= 0) continue;
    if (!['settled', 'reversed'].includes(e.type)) continue;
    seen.add(e.receipt_id);
    if (e.type === 'settled') settled += e.amount_cents;
    if (e.type === 'reversed') reversed += e.amount_cents;
  }
  return { verified_net_cents: Math.max(0, settled - reversed), estimated_only: true };
}

export function contributionGate() {
  return { allowed: false, reason: 'Lift live money movement is disabled until legal, custody, anti-fraud, payout, and receipt checks pass.', ...PAYMENT_BOUNDARY };
}
