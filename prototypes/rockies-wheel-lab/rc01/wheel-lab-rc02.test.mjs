import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const inline = html.split('<script>')[1]?.split('</script>')[0];

test('RC02 inline renderer parses without remote dependency', () => {
  assert.ok(inline);
  assert.doesNotThrow(() => new Script(inline));
  assert.equal(html.includes('<script src='), false);
  assert.equal(html.includes('https://'), false);
});

test('RC02 safe offline sharing never offers an inaccessible file link', () => {
  assert.ok(html.includes('Copy build summary'));
  assert.ok(inline.includes('function buildSummary()'));
  assert.ok(inline.includes('copySummary(buildSummary())'));
  assert.equal(inline.includes('const text=location.href'), false);
  assert.ok(inline.includes('No order, lead, payment or merchant contact was submitted.'));
});

test('RC02 preserves fitment, inventory, pricing, and buyer truth boundaries', () => {
  for (const marker of ['illustrative_only:true', 'fitment_verified:false', 'inventory_verified:false', 'price_verified:false', 'shop_contacted:false']) {
    assert.ok(inline.includes(marker), 'Missing evidence flag: ' + marker);
  }
  assert.ok(html.includes('FITMENT NOT VERIFIED'));
  assert.ok(html.includes('Nothing here is available to buy'));
});
