import { createHash } from 'node:crypto';

/**
 * Pure, read-only evaluation of permissioned public marketplace observations.
 * It performs no network I/O, bidding, purchasing, messaging or scheduling.
 * Source adapters must supply listing availability and *completed sale* evidence.
 */
export const LISTING_SCHEMA = 'evercraft.asset-radar.listing.v1';
export const REPORT_SCHEMA = 'evercraft.asset-radar.assessment.v1';
export const DEFAULT_POLICY = Object.freeze({
  maximum_listing_age_minutes: 120,
  maximum_comp_age_days: 180,
  minimum_distinct_sold_comps: 2,
  maximum_purchase_to_value_ratio: 0.50,
  minimum_net_upside_cents: 10_000,
  resale_fee_basis_points: 1_300,
  resale_shipping_cents: 1_500,
  risk_reserve_basis_points: 1_000,
});

// Caller-supplied options may only tighten screening. A malicious or mistaken
// override cannot lower comp count, fee reserves or economic thresholds.
function resolvePolicy(overrides = {}) {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
    throw new TypeError('invalid_asset_radar_policy');
  }
  const rules = { ...DEFAULT_POLICY };
  const checks = {
    maximum_listing_age_minutes: v => Number.isSafeInteger(v) && v > 0 && v <= DEFAULT_POLICY.maximum_listing_age_minutes,
    maximum_comp_age_days: v => Number.isSafeInteger(v) && v > 0 && v <= DEFAULT_POLICY.maximum_comp_age_days,
    minimum_distinct_sold_comps: v => Number.isSafeInteger(v) && v >= DEFAULT_POLICY.minimum_distinct_sold_comps && v <= 100,
    maximum_purchase_to_value_ratio: v => Number.isFinite(v) && v > 0 && v <= DEFAULT_POLICY.maximum_purchase_to_value_ratio,
    minimum_net_upside_cents: v => Number.isSafeInteger(v) && v >= DEFAULT_POLICY.minimum_net_upside_cents,
    resale_fee_basis_points: v => Number.isSafeInteger(v) && v >= DEFAULT_POLICY.resale_fee_basis_points && v <= 10_000,
    resale_shipping_cents: v => Number.isSafeInteger(v) && v >= DEFAULT_POLICY.resale_shipping_cents,
    risk_reserve_basis_points: v => Number.isSafeInteger(v) && v >= DEFAULT_POLICY.risk_reserve_basis_points && v <= 10_000,
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (!checks[key]?.(value)) throw new TypeError('unsafe_asset_radar_policy_override:' + key);
    rules[key] = value;
  }
  return rules;
}

const BLOCKED_CATEGORIES = new Set([
  'weapon', 'firearm', 'ammunition', 'explosive', 'hazardous-chemical',
  'prescription-drug', 'recreational-drug', 'stolen-property', 'counterfeit',
  'wildlife-contraband', 'nicotine', 'alcohol', 'gambling-device',
]);

function isNonnegativeInteger(value) { return Number.isSafeInteger(value) && value >= 0; }
function clean(value) { return typeof value === 'string' ? value.trim() : ''; }
function validUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password;
  } catch { return false; }
}
function validTime(value, now, maxAgeMs) {
  const ms = Date.parse(value);
  return Number.isFinite(ms) && ms <= now.getTime() && (now.getTime() - ms) <= maxAgeMs;
}
function centsTimesBps(cents, bps) { return Math.ceil(cents * bps / 10_000); }
function normalized(value) { return clean(value).toLowerCase(); }
function addReason(reasons, reason) { if (!reasons.includes(reason)) reasons.push(reason); }

export function assessListing(raw, { now = new Date(), policy = {}, trusted_completed_sale_ids = [] } = {}) {
  const rules = resolvePolicy(policy);
  const clock = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(clock.getTime())) throw new TypeError('invalid_now');
  const reasons = [];
  if (!raw || raw.schema !== LISTING_SCHEMA) addReason(reasons, 'invalid_schema');
  const listing = raw?.listing || {};
  const item = raw?.item || {};
  const resale = raw?.resale_costs || {};
  const source = clean(listing.source_id);
  const listingId = clean(listing.listing_id);
  const variant = normalized(item.exact_variant_key);
  const condition = normalized(item.condition_key);
  const prohibited = BLOCKED_CATEGORIES.has(normalized(item.category)) ||
    raw?.provenance?.suspected_stolen === true ||
    raw?.provenance?.suspected_counterfeit === true ||
    raw?.provenance?.legality_confirmed === false;
  if (prohibited) addReason(reasons, 'restricted_or_suspect_asset');
  if (!source || !listingId || !validUrl(listing.url) || !variant || !condition || !clean(item.title)) {
    addReason(reasons, 'incomplete_identity');
  }
  if (listing.currency !== 'USD') addReason(reasons, 'unsupported_currency');
  if (listing.availability !== 'active_verified' || !validTime(listing.availability_checked_at, clock, rules.maximum_listing_age_minutes * 60_000)) {
    addReason(reasons, 'live_availability_unverified_or_stale');
  }
  if (listing.seller_review_state !== 'reviewed' || raw?.provenance?.authenticity_state !== 'credible') {
    addReason(reasons, 'seller_or_authenticity_not_cleared');
  }
  const costFields = ['price_cents', 'shipping_cents', 'tax_cents'];
  if (!costFields.every(field => isNonnegativeInteger(listing[field]))) addReason(reasons, 'incomplete_purchase_cost');
  const extraFields = ['grading_cents', 'repair_cents', 'other_cents'];
  if (!extraFields.every(field => isNonnegativeInteger(resale[field]))) addReason(reasons, 'incomplete_resale_cost');
  if (!Array.isArray(raw?.sold_comps)) addReason(reasons, 'missing_comparables');

  // A sales claim embedded in a listing JSON is NOT a proof of a transaction.
  // Trust IDs are supplied out-of-band by a separately permissioned and audited
  // completed-sales adapter. The public JSON CLI intentionally supplies none.
  const trustedSaleIds = new Set(
    Array.isArray(trusted_completed_sale_ids)
      ? trusted_completed_sale_ids.filter(x => typeof x === 'string' && x.length > 0 && x.length <= 300)
      : []
  );
  const maxCompAgeMs = rules.maximum_comp_age_days * 86_400_000;
  const distinct = new Set();
  const matchedComps = [];
  for (const comp of Array.isArray(raw?.sold_comps) ? raw.sold_comps : []) {
    const identity = `${clean(comp.source_id)}:${clean(comp.sale_id)}`;
    if (!clean(comp.source_id) || !clean(comp.sale_id) || distinct.has(identity) || !trustedSaleIds.has(identity)) continue;
    if (comp.transaction_state !== 'completed_sold_verified' || comp.currency !== 'USD' ||
      !isNonnegativeInteger(comp.sold_price_cents) || comp.sold_price_cents === 0 ||
      !validUrl(comp.source_url) || !validTime(comp.sold_at, clock, maxCompAgeMs) ||
      normalized(comp.exact_variant_key) !== variant || normalized(comp.condition_key) !== condition) continue;
    distinct.add(identity);
    matchedComps.push(comp);
  }
  if (matchedComps.length < rules.minimum_distinct_sold_comps) addReason(reasons, 'insufficient_exact_verified_sold_comps');

  // The lowest matched sale is a deliberately conservative price floor, not an appraisal.
  const conservativeValue = matchedComps.length >= rules.minimum_distinct_sold_comps
    ? Math.min(...matchedComps.map(comp => comp.sold_price_cents)) : null;
  const costsPresent = costFields.every(f => isNonnegativeInteger(listing[f])) &&
    extraFields.every(f => isNonnegativeInteger(resale[f]));
  const purchaseTotal = costsPresent
    ? listing.price_cents + listing.shipping_cents + listing.tax_cents : null;
  let projectedNetUpside = null;
  let expectedResaleProceeds = null;
  let discountRatio = null;
  if (conservativeValue !== null && purchaseTotal !== null) {
    const variableCosts = centsTimesBps(conservativeValue, rules.resale_fee_basis_points) +
      centsTimesBps(conservativeValue, rules.risk_reserve_basis_points);
    const resaleTotal = variableCosts + rules.resale_shipping_cents +
      resale.grading_cents + resale.repair_cents + resale.other_cents;
    expectedResaleProceeds = conservativeValue - resaleTotal;
    projectedNetUpside = expectedResaleProceeds - purchaseTotal;
    discountRatio = purchaseTotal / conservativeValue;
    if (discountRatio > rules.maximum_purchase_to_value_ratio) addReason(reasons, 'discount_below_threshold');
    if (projectedNetUpside < rules.minimum_net_upside_cents) addReason(reasons, 'net_upside_below_threshold');
  }

  // No estimate alone authorizes an alert: every required evidence gate must pass.
  const status = prohibited ? 'REJECTED' : reasons.length ? 'WATCH_UNVERIFIED' : 'QUALIFIED_FOR_HUMAN_REVIEW';
  const watchKey = source && listingId ? `${source}:${listingId}` : null;
  const alertKey = watchKey && costsPresent
    ? createHash('sha256').update(`${watchKey}|${listing.price_cents}|${listing.shipping_cents}|${listing.tax_cents}`).digest('hex')
    : null;
  return {
    schema: REPORT_SCHEMA,
    status,
    listing_url: validUrl(listing.url) ? listing.url : null,
    watch_key: watchKey,
    alert_key: alertKey,
    currency: listing.currency || null,
    cost_to_acquire_cents: purchaseTotal,
    conservative_sold_value_cents: conservativeValue,
    resale_net_proceeds_cents: expectedResaleProceeds,
    estimated_net_upside_cents: projectedNetUpside,
    purchase_to_value_ratio: discountRatio,
    exact_sold_comps: matchedComps.length,
    matched_comp_urls: matchedComps.map(comp => comp.source_url),
    availability_checked_at: listing.availability_checked_at || null,
    reasons,
    purchase_authorized: false,
    bidder_authorized: false,
    outbound_contact_authorized: false,
  };
}

/** Filter duplicate new alerts. The caller owns durable, permissioned state. */
export function newReviewAlerts(assessments, previouslyAlertedKeys = []) {
  const seen = new Set(previouslyAlertedKeys);
  const alerts = [];
  for (const entry of assessments || []) {
    if (entry?.status !== 'QUALIFIED_FOR_HUMAN_REVIEW' || !entry.alert_key || seen.has(entry.alert_key)) continue;
    seen.add(entry.alert_key);
    alerts.push(entry);
  }
  return { alerts, updated_alert_keys: [...seen] };
}
