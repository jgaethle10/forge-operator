import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkFaieFirstDollar, FAIE_DOORS } from '../scripts/faie-first-dollar-canary.mjs';

function fakeFetch({ price = 250, confirm = true, intakeOk = true, catalogOk = true, html = true } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, method: options.method });
    if (url === FAIE_DOORS.read_only_offers) {
      return new Response(JSON.stringify({
        ok: catalogOk,
        confirmation_required: confirm,
        offers: [{ offer_key: 'signal_brief_250', price_usd: price, billing: 'one_time' }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url === FAIE_DOORS.buyer_intake && !intakeOk) {
      return new Response('down', { status: 503 });
    }
    return new Response(html ? '<!doctype html><html><body>FAIE</body></html>' : 'not html', {
      status: 200, headers: { 'content-type': html ? 'text/html' : 'text/plain' },
    });
  };
  return { fetchImpl, calls };
}

test('read-only surfaces can pass without implying checkout, payment, fulfillment or revenue', async () => {
  const fake = fakeFetch();
  const report = await checkFaieFirstDollar({ fetchImpl: fake.fetchImpl });
  assert.equal(report.buyer_preflight, 'READY_FOR_MANUAL_END_TO_END_QA');
  assert.equal(report.verified_checkout_creation, false);
  assert.equal(report.verified_processor_payment, false);
  assert.equal(report.verified_fulfillment, false);
  assert.equal(report.collected_revenue_usd, null);
  assert.equal(fake.calls.length, 3);
  assert.ok(fake.calls.every((call) => call.method === 'GET'));
  assert.deepEqual(new Set(fake.calls.map((call) => call.url)), new Set(Object.values(FAIE_DOORS)));
});

test('wrong price fails closed', async () => {
  const fake = fakeFetch({ price: 99 });
  const report = await checkFaieFirstDollar({ fetchImpl: fake.fetchImpl });
  assert.equal(report.buyer_preflight, 'HELD');
  assert.equal(report.public_surfaces.catalog.exact_price_verified, false);
});

test('missing explicit human confirmation fails closed', async () => {
  const fake = fakeFetch({ confirm: false });
  assert.equal((await checkFaieFirstDollar({ fetchImpl: fake.fetchImpl })).buyer_preflight, 'HELD');
});

test('buyer intake HTTP failure fails closed', async () => {
  const fake = fakeFetch({ intakeOk: false });
  const report = await checkFaieFirstDollar({ fetchImpl: fake.fetchImpl });
  assert.equal(report.buyer_preflight, 'HELD');
  assert.equal(report.public_surfaces.buyer_intake.error, 'http_error');
});

test('200 page without valid HTML fails closed', async () => {
  const fake = fakeFetch({ html: false });
  assert.equal((await checkFaieFirstDollar({ fetchImpl: fake.fetchImpl })).buyer_preflight, 'HELD');
});

test('invalid JSON or offline fetch fails closed', async () => {
  const invalid = async (url) => url === FAIE_DOORS.read_only_offers
    ? new Response('<oops>', { headers: { 'content-type': 'text/plain' } })
    : new Response('<html></html>', { headers: { 'content-type': 'text/html' } });
  const result = await checkFaieFirstDollar({ fetchImpl: invalid });
  assert.equal(result.buyer_preflight, 'HELD');
  assert.equal(result.public_surfaces.catalog.error, 'catalog_not_json');

  const offline = await checkFaieFirstDollar({ fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(offline.buyer_preflight, 'HELD');
});

test('reject invalid timeout', async () => {
  await assert.rejects(() => checkFaieFirstDollar({ timeoutMs: -10 }), RangeError);
});
