import assert from 'node:assert/strict';
import test from 'node:test';
import { collectEbayBrowseListings } from './ebay-browse-collector.mjs';
import { assessListing } from './engine.mjs';

const detail = id => ({
  itemId: id,
  itemWebUrl: 'https://www.ebay.com/itm/123456789012',
  title: 'Fictional collectible demonstration only',
  buyingOptions: ['FIXED_PRICE'],
  estimatedAvailabilities: [{ estimatedAvailabilityStatus: 'IN_STOCK' }],
  itemEndDate: '2026-10-30T03:00:00Z',
  price: { currency: 'USD', value: '99.00' },
  shippingOptions: [{
    shippingCost: { currency: 'USD', value: '6.00' },
    shipToLocationUsedForEstimate: { country: 'US', postalCode: '98901' },
  }],
});
const ok = value => ({ ok: true, status: 200, json: async () => value });
const denied = status => ({ ok: false, status });
const creds = {
  access_approved: true,
  permission_ref: 'test-permission-record',
  client_id: 'fictional-client',
  client_secret: 'fictional-secret',
  zip: '98901',
  queries: ['rare trading card'],
  now: () => new Date('2026-10-20T03:00:00Z'),
};
function stub({ mismatch = false, detailStatus = 200, tokenStatus = 200, searchBody = null } = {}) {
  const calls = [];
  const fetch_impl = async (url, init) => {
    const target = String(url);
    calls.push({ url: target, method: init.method, headers: init.headers });
    if (target.endsWith('/identity/v1/oauth2/token')) {
      return tokenStatus === 200 ? ok({ access_token: 'fictional-access-token' }) : denied(tokenStatus);
    }
    if (target.includes('/item_summary/search?')) {
      return ok(searchBody ?? { itemSummaries: [
        { itemId: 'v1|123456789012|0' }, { itemId: 'v1|123456789012|0' },
      ] });
    }
    if (target.includes('/buy/browse/v1/item/')) {
      if (detailStatus !== 200) return denied(detailStatus);
      return ok(detail(mismatch ? 'v1|other|0' : 'v1|123456789012|0'));
    }
    throw new Error('unexpected_external_endpoint');
  };
  return { fetch_impl, calls };
}
test('gated official read-only search records evidence but does not hallucinate comps', async () => {
  const mocked = stub();
  const result = await collectEbayBrowseListings({ ...creds, fetch_impl: mocked.fetch_impl });
  assert.equal(result.search_calls, 1);
  assert.equal(result.item_detail_calls, 1);
  assert.equal(result.packet_count, 1);
  assert.equal(result.packets[0].listing.availability, 'active_verified');
  assert.equal(result.packets[0].sold_comps.length, 0);
  assert.equal(result.packets[0].listing.tax_cents, null);
  assert.equal(result.packets[0].listing.seller_review_state, 'unreviewed');
  assert.equal(assessListing(result.packets[0], { now: creds.now() }).status, 'WATCH_UNVERIFIED');
  assert.equal(result.bids_or_purchases_made, 0);
  assert.equal(result.seller_messages_sent, 0);
  assert.ok(mocked.calls.every(c => c.url.startsWith('https://api.ebay.com/')));
  assert.deepEqual(mocked.calls.map(c => c.method), ['POST','GET','GET']);
  assert.ok(!JSON.stringify(result).includes('fictional-secret'));
  assert.ok(!JSON.stringify(result).includes('fictional-access-token'));
});
test('no network without explicitly approved entitlement and credential prerequisites', async () => {
  const mocked = stub();
  for (const config of [
    { access_approved: false }, { permission_ref: '' }, { client_secret: '' },
    { zip: 'bad' }, { queries: [] }, { queries: ['a','b','c'] },
  ]) {
    await assert.rejects(collectEbayBrowseListings({ ...creds, ...config, fetch_impl: mocked.fetch_impl }));
  }
  assert.equal(mocked.calls.length, 0);
});
test('provider authorization failure is not retried or interpreted as an empty market', async () => {
  const mocked = stub({ tokenStatus: 403 });
  await assert.rejects(collectEbayBrowseListings({ ...creds, fetch_impl: mocked.fetch_impl }), /source_access_denied/);
  assert.equal(mocked.calls.length, 1);
});
test('mismatched item ID, inaccessible details and missing search result are visible, not invented', async () => {
  for (const special of [
    { mismatch: true },
    { detailStatus: 403 },
    { searchBody: {} },
  ]) {
    const mocked = stub(special);
    const result = await collectEbayBrowseListings({ ...creds, fetch_impl: mocked.fetch_impl });
    assert.equal(result.packets.length, 0);
    assert.ok(result.diagnostics.some(d => /mismatch|denied|missing/.test(d.code)));
  }
});
test('deduplicates overlapping queries and caps detail calls to four', async () => {
  const mocked = stub({ searchBody: { itemSummaries: [
    { itemId: 'a' }, { itemId: 'b' }, { itemId: 'c' }, { itemId: 'd' }, { itemId: 'e' },
  ] } });
  const fetch_impl = async (url, init) => {
    if (String(url).includes('/buy/browse/v1/item/')) {
      const id = decodeURIComponent(String(url).split('/').at(-1));
      return ok(detail(id));
    }
    return mocked.fetch_impl(url, init);
  };
  const result = await collectEbayBrowseListings({
    ...creds, queries: ['rare trading card','vintage game'], fetch_impl,
  });
  assert.equal(result.item_detail_calls, 4);
  assert.equal(result.packets.length, 4);
  assert.equal(result.bids_or_purchases_made, 0);
});
