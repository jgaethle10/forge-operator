import test from 'node:test';
import assert from 'node:assert/strict';
import { probeRomanUrl, checkRomanContinuity } from './roman-continuity-canary.mjs';

const html = '<!doctype html><html><head><title>Vote for Roman</title></head><body>Public site</body></html>';
const reply = (body = html, status = 200, headers = { 'content-type': 'text/html' }) =>
  new Response(body, { status, headers });

const target = 'https://voteroman.com/';

test('confirms only a recognizable fetched HTML page from an approved origin', async () => {
  const outcome = await probeRomanUrl(target, { fetchImpl: async () => reply() });
  assert.equal(outcome.state, 'page_fetched');
  assert.equal(outcome.status, 200);
});

test('follows only HTTPS redirects between approved campaign hosts', async () => {
  const calls = [];
  const outcome = await probeRomanUrl(target, { fetchImpl: async url => {
    calls.push(url);
    return calls.length === 1 ? reply(null, 302, { location: 'https://www.voteroman.com/' }) : reply();
  }});
  assert.equal(outcome.state, 'page_fetched');
  assert.equal(calls.length, 2);
});

test('rejects redirects to other origins or HTTP', async () => {
  for (const destination of ['https://external.example.com/', 'http://www.voteroman.com/']) {
    const outcome = await probeRomanUrl(target, { fetchImpl: async () => reply(null, 302, { location: destination }) });
    assert.equal(outcome.state, 'unsafe_or_external_redirect');
  }
});

test('blocked bot probes are inconclusive, never proof of a site outage', async () => {
  for (const status of [401, 402, 403, 429]) {
    const outcome = await probeRomanUrl(target, { fetchImpl: async () => reply('restricted', status) });
    assert.equal(outcome.state, 'access_restricted_inconclusive');
  }
});

test('classifies 503 and 404 as observed errors without claiming global downtime', async () => {
  assert.equal((await probeRomanUrl(target, { fetchImpl: async () => reply('error', 503) })).state, 'upstream_http_error');
  assert.equal((await probeRomanUrl(target, { fetchImpl: async () => reply('missing', 404) })).state, 'route_http_error');
});

test('rejects missing HTML and missing candidate identity', async () => {
  assert.equal((await probeRomanUrl(target, { fetchImpl: async () => reply('json', 200, { 'content-type': 'application/json' }) })).state, 'non_html_response');
  assert.equal((await probeRomanUrl(target, { fetchImpl: async () => reply('<html>Unrelated</html>') })).state, 'campaign_identity_unverified');
});

test('network failures and endless redirects fail closed', async () => {
  assert.equal((await probeRomanUrl(target, { fetchImpl: async () => { throw Object.assign(new Error('blocked'), { name: 'TypeError' }); } })).state, 'network_inconclusive');
  assert.equal((await probeRomanUrl(target, { fetchImpl: async () => reply(null, 302, { location: '/' }) })).state, 'redirect_limit_inconclusive');
});

test('whole-site report never implies production migration or multi-region proof', async () => {
  const report = await checkRomanContinuity({ fetchImpl: async () => reply() });
  assert.equal(report.classification, 'reachable_from_one_runner');
  assert.equal(report.independent_multiregion_verified, false);
  assert.equal(report.live_migration_or_cutover_verified, false);
  const mixed = await checkRomanContinuity({ fetchImpl: async url => url.includes('www.') ? reply('blocked', 402) : reply() });
  assert.equal(mixed.classification, 'partial_from_one_runner');
});
