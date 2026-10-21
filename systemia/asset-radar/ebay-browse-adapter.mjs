import { LISTING_SCHEMA } from './engine.mjs';

/**
 * Converts a supplied eBay Browse getItem response into the evaluator's packet.
 * No network access or OAuth happens here. The caller MUST independently verify
 * the authorized HTTPS response; caller metadata is not a cryptographic receipt.
 * This adapter NEVER invents seller review, authenticity, sales or a tax quote.
 */
function moneyCents(money) {
  if (!money || money.currency !== 'USD') return null;
  const value = money.value;
  const text = typeof value === 'string' ? value : String(value ?? '');
  if (!/^(0|[1-9]\d*)(?:\.\d{1,2})?$/.test(text)) return null;
  const [dollars, fraction = ''] = text.split('.');
  const cents = Number(dollars) * 100 + Number((fraction + '00').slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}
function clean(value) { return typeof value === 'string' ? value.trim() : ''; }
function ebayUsUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && (u.hostname === 'ebay.com' || u.hostname.endsWith('.ebay.com')) &&
      !u.username && !u.password;
  } catch { return false; }
}
function isoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}
function bestUsShipping(options, destinationPostalCode) {
  const costs = (Array.isArray(options) ? options : []).filter(o => {
    const destination = o?.shipToLocationUsedForEstimate;
    if (destination?.country !== 'US') return false;
    if (destinationPostalCode && destination?.postalCode !== destinationPostalCode) return false;
    return true;
  }).map(o => moneyCents(o.shippingCost)).filter(cents => cents !== null);
  return costs.length ? Math.min(...costs) : null;
}

export function normalizeEbayBrowseItem(item, options = {}) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw new TypeError('invalid_ebay_get_item_response');
  const {
    fetched_at = null,
    source_access = null,
    tax_cents = null,
    tax_verified = false,
    resale_costs = null,
    resale_costs_reviewed = false,
    exact_variant_key = null,
    condition_key = null,
    category = 'unclassified',
    destination_postal_code = null,
  } = options;
  const observed = isoDate(fetched_at);
  const transport = source_access?.authorized === true &&
    source_access?.source === 'ebay_browse_get_item' &&
    source_access?.response_status === 200 &&
    clean(source_access?.request_receipt_ref) &&
    clean(source_access?.permission_ref) &&
    clean(source_access?.item_id) === clean(item.itemId);
  const availability = (Array.isArray(item.estimatedAvailabilities) ? item.estimatedAvailabilities : [])
    .some(x => x?.estimatedAvailabilityStatus === 'IN_STOCK');
  const active = Boolean(transport && observed !== null && ebayUsUrl(item.itemWebUrl) &&
    item.buyingOptions?.includes('FIXED_PRICE') && availability &&
    isoDate(item.itemEndDate) !== null && isoDate(item.itemEndDate) > observed);
  const shippingCents = bestUsShipping(item.shippingOptions, destination_postal_code);
  const explicitTax = tax_verified === true && Number.isSafeInteger(tax_cents) && tax_cents >= 0 ? tax_cents : null;
  const validResale = resale_costs_reviewed === true && resale_costs &&
    ['grading_cents', 'repair_cents', 'other_cents'].every(k => Number.isSafeInteger(resale_costs[k]) && resale_costs[k] >= 0);
  return {
    schema: LISTING_SCHEMA,
    item: {
      title: clean(item.title),
      category: clean(category),
      exact_variant_key: clean(exact_variant_key),
      condition_key: clean(condition_key),
    },
    listing: {
      source_id: 'ebay-browse',
      listing_id: clean(item.itemId),
      url: ebayUsUrl(item.itemWebUrl) ? item.itemWebUrl : null,
      currency: 'USD',
      availability: active ? 'active_verified' : 'unverified',
      availability_checked_at: transport ? fetched_at : null,
      seller_review_state: 'unreviewed',
      price_cents: moneyCents(item.price),
      shipping_cents: shippingCents,
      tax_cents: explicitTax,
    },
    provenance: {
      authenticity_state: 'unverified',
      suspected_stolen: null,
      suspected_counterfeit: null,
      legality_confirmed: null,
    },
    resale_costs: validResale ? {
      grading_cents: resale_costs.grading_cents,
      repair_cents: resale_costs.repair_cents,
      other_cents: resale_costs.other_cents,
    } : { grading_cents: null, repair_cents: null, other_cents: null },
    sold_comps: [],
    source_metadata: {
      provider: 'ebay',
      source_resource: 'browse.getItem',
      marketplace_id: 'EBAY_US',
      request_receipt_ref: transport ? clean(source_access.request_receipt_ref) : null,
      permission_ref: transport ? clean(source_access.permission_ref) : null,
      collected_at: transport ? fetched_at : null,
      seller_feedback_percentage: clean(item.seller?.feedbackPercentage) || null,
      seller_feedback_score: Number.isSafeInteger(item.seller?.feedbackScore) ? item.seller.feedbackScore : null,
      returns_accepted: item.returnTerms?.returnsAccepted ?? null,
      sold_comps_provided_by_browse: false,
      external_action_taken: false,
    },
  };
}
