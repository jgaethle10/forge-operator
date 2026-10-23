import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('RC01 remains a standalone, offline, illustrative visual proof', () => {
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /<svg id="carArt"/);
  assert.doesNotMatch(html, /<script\s+[^>]*src=/i);
  assert.doesNotMatch(html, /<link\s+[^>]*href=["']https?:/i);
  assert.match(html, /Original concept coupe/);
  assert.match(html, /Not affiliated with Les Schwab/);
});

test('accessible shopping-preview controls and reversible comparison are present', () => {
  for (const key of ['paint', 'style', 'size', 'finish']) {
    assert.match(html, new RegExp(`data-key=["']${key}["']|data-key="\\$\\{attribute\\}"`));
  }
  for (const id of ['compareButton', 'reset', 'share', 'quote']) {
    assert.ok(html.includes(`id="${id}"`), `Missing #${id}`);
  }
  assert.match(html, /pointercancel/);
  assert.match(html, /aria-pressed/);
});

test('concept quote never claims fitment, stock, pricing, contact or payment', () => {
  for (const flag of ['illustrative_only:true', 'fitment_verified:false', 'inventory_verified:false', 'price_verified:false', 'shop_contacted:false']) {
    assert.ok(html.includes(flag), `Missing safety flag ${flag}`);
  }
  assert.match(html, /FITMENT NOT VERIFIED/);
  assert.match(html, /Nothing here is available to buy/);
  assert.match(html, /No order or lead has been submitted/);
});

test('shareable inputs are allowlisted before model updates', () => {
  assert.match(html, /function safeParam\(/);
  assert.match(html, /safeParam\(k,u\.searchParams\.get\(k\)\)/);
  assert.match(html, /if\(!safeParam\(k,v\)\)return/);
});
