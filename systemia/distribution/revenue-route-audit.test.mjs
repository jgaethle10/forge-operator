import test from 'node:test';
import assert from 'node:assert/strict';
import { auditRevenueRoutes } from './revenue-route-audit.mjs';

const now = new Date('2026-10-17T20:00:00Z');
function catalog(offers, extra = {}) {
  return { schema: 'evercraft.chum.sell-now.v1', updated_at: '2026-10-17T19:00:00Z', count: offers.length, offers, ...extra };
}
test('preserves hold and never infers payment from HTTPS link', () => {
  const result = auditRevenueRoutes(catalog([
    { public_id: 'held', commercial_state: 'sell_now', start_url_state: 'held_no_owned_public_origin' },
    { public_id: 'declared', commercial_state: 'sell_now', start_url_state: 'owned_offer_page_available', start_url: 'https://example.org/offer' },
    { public_id: 'free', commercial_state: 'free' },
  ]), {now});
  assert.equal(result.declared_sell_now_count, 2);
  assert.equal(result.declared_sell_now_https_start_count, 1);
  assert.equal(result.sell_now_without_declared_https_start_count, 1);
  assert.equal(result.payment_verified, false);
  assert.equal(result.provider_checkout_verified, false);
});
test('detects stale snapshot', () => {
  const result = auditRevenueRoutes(catalog([], {updated_at: '2026-10-07T00:00:00Z'}), {now});
  assert.equal(result.snapshot_stale, true);
  assert.equal(result.recommendation, 'REFRESH_AND_RECONCILE_WITH_LIVE_CATALOG_BEFORE_DISTRIBUTION');
});
test('detects count mismatch without changing catalog', () => {
  const input = catalog([{public_id:'a', commercial_state:'sell_now'}], {count: 2});
  const before = JSON.stringify(input);
  assert.equal(auditRevenueRoutes(input, {now}).source_count_matches, false);
  assert.equal(JSON.stringify(input), before);
});
test('rejects duplicates and missing identities', () => {
  assert.throws(() => auditRevenueRoutes(catalog([{public_id:'x'},{public_id:'x'}]), {now}), /Duplicate/);
  assert.throws(() => auditRevenueRoutes(catalog([{}]), {now}), /Missing public_id/);
});
test('does not accept relative insecure or expressly held buyer starts', () => {
  const result = auditRevenueRoutes(catalog([
    {public_id:'relative', commercial_state:'sell_now', start_url:'/go'},
    {public_id:'insecure', commercial_state:'sell_now', start_url:'http://example.org'},
    {public_id:'held', commercial_state:'sell_now', start_url:'https://example.org', start_url_state:'held_no_owned_public_origin'},
  ]), {now});
  assert.equal(result.sell_now_without_declared_https_start_count, 3);
});
