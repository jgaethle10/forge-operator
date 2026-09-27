import { createHash } from 'node:crypto';

const ALLOWED_CATEGORIES = new Set(['grocery', 'retail', 'meal', 'service', 'other']);
const clean = (value) => String(value ?? '').trim();
const cents = (value) => Number.isInteger(value) ? value : Number.NaN;
const iso = (value, field) => {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) throw new Error(field + ' must be a valid date-time');
  return date.toISOString();
};

function hashId(...parts) {
  return createHash('sha256')
    .update(parts.map(clean).join('|').toLowerCase())
    .digest('hex')
    .slice(0, 20);
}

export function validateMerchantOffer(raw, options = {}) {
  if (!raw || typeof raw !== 'object') throw new TypeError('merchant offer must be an object');

  const merchantId = clean(raw.merchant_id);
  const merchantName = clean(raw.merchant_name);
  const offerId = clean(raw.offer_id);
  const title = clean(raw.title);
  const category = clean(raw.category).toLowerCase();

  if (!merchantId) throw new Error('merchant_id is required');
  if (!merchantName) throw new Error('merchant_name is required');
  if (!offerId) throw new Error('offer_id is required');
  if (!title) throw new Error('title is required');
  if (!ALLOWED_CATEGORIES.has(category)) throw new Error('unsupported merchant offer category');
  if (!Array.isArray(raw.locations) || raw.locations.length === 0) throw new Error('at least one location is required');

  const validFrom = iso(raw.valid_from, 'valid_from');
  const expiresAt = iso(raw.expires_at, 'expires_at');
  if (new Date(expiresAt).getTime() <= new Date(validFrom).getTime()) {
    throw new Error('expires_at must be after valid_from');
  }

  const now = options.now instanceof Date ? options.now : new Date(options.now ?? Date.now());
  if (new Date(expiresAt).getTime() <= now.getTime()) throw new Error('merchant offer is expired');

  const regular = raw.regular_price_cents == null ? null : cents(raw.regular_price_cents);
  const offer = raw.offer_price_cents == null ? null : cents(raw.offer_price_cents);
  if ((regular == null) !== (offer == null)) {
    throw new Error('regular_price_cents and offer_price_cents must be supplied together');
  }
  if (regular != null && (!Number.isFinite(regular) || !Number.isFinite(offer) || regular < 0 || offer < 0)) {
    throw new Error('prices must be non-negative integer cents');
  }
  if (regular != null && offer > regular) throw new Error('offer price cannot exceed regular price');

  const sponsored = Boolean(raw.sponsored);
  const sponsorLabel = clean(raw.sponsor_label);
  if (sponsored && !sponsorLabel) throw new Error('sponsor_label is required for sponsored offers');

  if (!raw.attestation || typeof raw.attestation !== 'object') throw new Error('attestation is required');
  const submissionId = clean(raw.attestation.submission_id);
  const submittedBy = clean(raw.attestation.submitted_by);
  const submittedAt = iso(raw.attestation.submitted_at, 'attestation.submitted_at');
  if (!submissionId || !submittedBy) throw new Error('attestation submission_id and submitted_by are required');

  const locations = raw.locations.map((location) => {
    const locationId = clean(location?.location_id);
    const label = clean(location?.label);
    if (!locationId || !label) throw new Error('every merchant location needs location_id and label');
    return {
      location_id: locationId,
      label,
      address: clean(location.address) || null,
      lat: Number.isFinite(Number(location.lat)) ? Number(location.lat) : null,
      long: Number.isFinite(Number(location.long)) ? Number(location.long) : null,
    };
  });

  return {
    merchant_id: merchantId,
    merchant_name: merchantName,
    offer_id: offerId,
    title,
    description: clean(raw.description),
    category,
    valid_from: validFrom,
    expires_at: expiresAt,
    regular_price_cents: regular,
    offer_price_cents: offer,
    gross_savings_cents: regular == null ? 0 : regular - offer,
    terms: clean(raw.terms),
    eligibility: clean(raw.eligibility).toLowerCase() || 'unknown',
    inventory_state: clean(raw.inventory_state).toLowerCase() || 'unknown',
    offer_url: clean(raw.offer_url),
    holiday_tags: Array.isArray(raw.holiday_tags) ? raw.holiday_tags.map(clean).filter(Boolean) : [],
    audience_tags: Array.isArray(raw.audience_tags) ? raw.audience_tags.map(clean).filter(Boolean) : [],
    sponsored,
    sponsor_label: sponsorLabel,
    locations,
    attestation: {
      submission_id: submissionId,
      submitted_at: submittedAt,
      submitted_by: submittedBy,
      signature_state: clean(raw.attestation.signature_state).toLowerCase() || 'unsigned',
      signature_id: clean(raw.attestation.signature_id) || null,
    },
  };
}

export function merchantOfferToOpportunities(raw, options = {}) {
  const offer = validateMerchantOffer(raw, options);
  const observedAt = offer.attestation.submitted_at;

  return offer.locations.map((location) => ({
    id: 'merchant-' + hashId(offer.merchant_id, offer.offer_id, location.location_id),
    title: offer.title,
    description: offer.description,
    category: offer.category,
    source_id: 'merchant-feed:' + offer.merchant_id + ':' + offer.offer_id,
    source_name: offer.merchant_name,
    source_url: offer.offer_url,
    observed_at: observedAt,
    expires_at: offer.expires_at,
    evidence_state: 'public',
    confidence: offer.attestation.signature_state === 'verified' ? 0.98 : 0.9,
    eligibility: offer.eligibility,
    gross_savings_cents: offer.gross_savings_cents,
    gross_earnings_cents: 0,
    audience_tags: offer.audience_tags,
    holiday_tags: offer.holiday_tags,
    sponsored: offer.sponsored,
    sponsor_label: offer.sponsor_label,
    location: {
      location_id: location.location_id,
      label: location.label,
      address: location.address,
      lat: location.lat,
      long: location.long,
    },
    actions: offer.offer_url ? [{
      type: 'view_offer',
      label: 'View offer',
      url: offer.offer_url,
    }] : [],
    raw_metadata: {
      source_class: 'merchant_public',
      merchant_id: offer.merchant_id,
      offer_id: offer.offer_id,
      inventory_state: offer.inventory_state,
      terms: offer.terms || null,
      valid_from: offer.valid_from,
      submission_id: offer.attestation.submission_id,
      submitted_by: offer.attestation.submitted_by,
      signature_state: offer.attestation.signature_state,
      signature_id: offer.attestation.signature_id,
    },
  }));
}
