#!/usr/bin/env node
// Synthetic-only console smoke tests. No external access, private records, or delivery transport.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('./console.html', import.meta.url), 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/i);
assert.ok(match, 'console must contain application script');

function boot({offline = false} = {}) {
  const nodes = new Map();
  const routes = [];
  let tick;
  let failSource = offline;
  function el(id) {
    if (!nodes.has(id)) {
      nodes.set(id, {
        value: id === 'token' ? 'synthetic_private_canary_token_of_adequate_length' : '',
        innerHTML: '', textContent: '', disabled: false,
        classList: { add() {}, remove() {}, toggle() {} },
        addEventListener() {}, querySelectorAll() { return []; },
        reset() {}, click() { return this.onclick?.(); },
      });
    }
    return nodes.get(id);
  }
  const response = {
    count: 2,
    records: [
      {
        ordinal: 1, business: 'Synthetic Seller', buyer: 'Role Only',
        pain: 'Test problem', tier: 'due_named_buyer_review',
        flags: ['obtain_original_problem_statement_or_source_excerpt'],
        followup: '2026-11-19', sent_history: [],
      },
      {
        ordinal: 2, business: 'Example Firm', buyer: '',
        pain: 'Unconfirmed source text', tier: 'source_evidence_review',
        flags: ['obtain_original_problem_statement_or_source_excerpt'],
        followup: '', sent_history: [],
      },
    ],
  };
  const fetch = async (route) => {
    routes.push(route);
    if (failSource && route === '/api/revenue-desk-review') {
      return { ok: false, json: async () => ({ error: 'source offline' }) };
    }
    return { ok: true, json: async () => route === '/api/opportunities'
      ? { records: [] } : response };
  };
  const context = {
    document: { getElementById: el, visibilityState: 'visible' },
    window: { addEventListener() {} },
    navigator: { clipboard: { writeText: async () => {} } },
    fetch,
    setInterval(fn, ms) { tick = { fn, ms }; return 1; },
  };
  new vm.Script(match[1], { filename: 'console-inline.js' }).runInNewContext(context);
  return { el, routes, get tick() { return tick; }, setOffline(value) { failSource = value; } };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('auth enters workspace and auto-loads read-only Revenue Desk signal queue', async () => {
  const h = boot();
  await h.el('connect').onclick();
  await flush();
  assert.deepEqual(h.routes.slice(0, 2), ['/api/opportunities', '/api/revenue-desk-review']);
  assert.match(h.el('sourcePulseMetrics').innerHTML, /Source records/);
  assert.match(h.el('sourcePulseMetrics').innerHTML, />2<\/b>/);
  assert.match(h.el('sourceRows').innerHTML, /Check original evidence/);
  assert.match(h.el('sourceStatus').textContent, /outreach disabled/);
});

test('source checks refresh every five minutes only while visible and authenticated', async () => {
  const h = boot();
  await h.el('connect').onclick();
  await flush();
  assert.equal(h.tick.ms, 300000);
  const count = h.routes.filter(x => x === '/api/revenue-desk-review').length;
  h.tick.fn();
  await flush();
  assert.equal(h.routes.filter(x => x === '/api/revenue-desk-review').length, count + 1);
});

test('failed source request reports staleness instead of zero leads or fake deliveries', async () => {
  const h = boot();
  await h.el('connect').onclick();
  await flush();
  h.setOffline(true);
  await h.el('sourceLoad').click();
  assert.match(h.el('sourceStatus').textContent, /stale/);
  assert.match(h.el('sourcePulseTime').textContent, /unavailable/);
  assert.equal(h.el('sourceLoad').disabled, false);
});

test('source review runs no outbound transport', async () => {
  const h = boot();
  await h.el('connect').onclick();
  await flush();
  assert.ok(h.routes.every(x => x === '/api/opportunities' || x === '/api/revenue-desk-review'));
  assert.equal(h.el('rows').innerHTML, '');
});
