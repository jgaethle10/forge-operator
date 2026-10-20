import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeEbayBrowseItem } from './ebay-browse-adapter.mjs';
import { assessListing } from './engine.mjs';

const at = '2026-10-20T03:10:00Z';
const now = new Date('2026-10-20T03:20:00Z');
const item = () => ({
  itemId: 'v1|123456789012|0',
  itemWebUrl: 'https://www.ebay.com/itm/123456789012',
  title: 'Rare card demo, not a real listing',
  price: { value: '240.50', currency: 'USD' },
  buyingOptions: ['FIXED_PRICE'],
  estimatedAvailabilities: [{ estimatedAvailabilityStatus: 'IN_STOCK' }],
  itemEndDate: '2026-10-30T01:00:00Z',
  seller: { username: 'test-seller', feedbackPercentage: '99.9', feedbackScore: 10000 },
  shippingOptions: [{
    shippingCost: { value: '8.25', currency: 'USD' },
    shipToLocationUsedForEstimate: { country: 'US', postalCode: '98901' },
  }],
  returnTerms: { returnsAccepted: true },
});
const approvedMetadata = () => ({
  fetched_at: at,
  source_access: {
    authorized: true,
    source: 'ebay_browse_get_item',
    response_status: 200,
    item_id: 'v1|123456789012|0',
    permission_ref: 'approved-api-application-ref',
    request_receipt_ref: 'trusted-host-fetch-receipt-ref',
  },
  destination_postal_code: '98901',
  exact_variant_key: 'set-number-and-edition',
  condition_key: 'psa-9',
  category: 'trading-card',
  tax_verified: true,
  tax_cents: 2200,
  resale_costs_reviewed: true,
  resale_costs: { grading_cents: 0, repair_cents: 0, other_cents: 0 },
});

test('preserves official price, US shipping and explicitly verified tax, but never invents sold comps', () => {
  const packet = normalizeEbayBrowseItem(item(), approvedMetadata());
  assert.equal(packet.listing.availability, 'active_verified');
  assert.equal(packet.listing.price_cents, 24050);
  assert.equal(packet.listing.shipping_cents, 825);
  assert.equal(packet.listing.tax_cents, 2200);
  assert.equal(packet.sold_comps.length, 0);
  assert.equal(packet.listing.seller_review_state, 'unreviewed');
  assert.equal(packet.provenance.authenticity_state, 'unverified');
  assert.equal(assessListing(packet, { now }).status, 'WATCH_UNVERIFIED');
});

test('does not consider item data a verified API fetch without permissioned transport receipt', () => {
  const options = approvedMetadata();
  delete options.source_access.permission_ref;
  const packet = normalizeEbayBrowseItem(item(), options);
  assert.equal(packet.listing.availability, 'unverified');
  assert.equal(packet.source_metadata.request_receipt_ref, null);
});

test('fails closed when tax quote or resale costs are missing, even if listing is current', () => {
  const options = approvedMetadata();
  delete options.tax_cents;
  options.resale_costs_reviewed = false;
  const packet = normalizeEbayBrowseItem(item(), options);
  assert.equal(packet.listing.tax_cents, null);
  assert.equal(packet.resale_costs.grading_cents, null);
  const result = assessListing(packet, { now });
  assert.ok(result.reasons.includes('incomplete_purchase_cost'));
  assert.ok(result.reasons.includes('incomplete_resale_cost'));
});

test('auction or unavailable or expired listing never becomes active verified', () => {
  const auction = item(); auction.buyingOptions = ['AUCTION'];
  assert.equal(normalizeEbayBrowseItem(auction, approvedMetadata()).listing.availability, 'unverified');
  const soldOut = item(); soldOut.estimatedAvailabilities = [];
  assert.equal(normalizeEbayBrowseItem(soldOut, approvedMetadata()).listing.availability, 'unverified');
  const ended = item(); ended.itemEndDate = '2026-10-19T01:00:00Z';
  assert.equal(normalizeEbayBrowseItem(ended, approvedMetadata()).listing.availability, 'unverified');
});

test('invalid price, unestimated shipping, mismatched destination and insecure URL are not guessed', () => {
  const altered = item();
  altered.price.value = '240.505';
  altered.shippingOptions[0].shipToLocationUsedForEstimate.postalCode = '10001';
  altered.itemWebUrl = 'http://www.ebay.com/itm/123456789012';
  const packet = normalizeEbayBrowseItem(altered, approvedMetadata());
  assert.equal(packet.listing.price_cents, null);
  assert.equal(packet.listing.shipping_cents, null);
  assert.equal(packet.listing.url, null);
  assert.equal(packet.listing.availability, 'unverified');
});

test('does not treat eBay seller feedback as a human authenticity or counterfeit clearance', () => {
  const altered = item();
  altered.seller.feedbackPercentage = '100.0';
  altered.seller.feedbackScore = 1_000_000;
  const packet = normalizeEbayBrowseItem(altered, approvedMetadata());
  assert.equal(packet.listing.seller_review_state, 'unreviewed');
  assert.equal(packet.provenance.authenticity_state, 'unverified');
  assert.equal(packet.provenance.legality_confirmed, null);
});
