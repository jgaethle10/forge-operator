import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCatalog, resolveNetworkNeed } from '../../public/network/community/route-core.mjs';

const catalog = JSON.parse(readFileSync(new URL('../../public/network/community/routes.json', import.meta.url), 'utf8'));
const resolve = input => resolveNetworkNeed(input, catalog);

test('catalog validates and does not claim operation or move money', () => {
  assert.equal(validateCatalog(catalog), true);
  assert.equal(catalog.release_state, 'review_only_not_live');
  assert.equal(catalog.execution_authority, false);
  assert.equal(catalog.money_movement_enabled, false);
});

test('finding a cleaning job never routes to a cleaning CUSTOMER quote', () => {
  const result = resolve({ query: 'I am looking for a cleaning job' });
  assert.equal(result.goal_id, 'work');
  assert.ok(result.planned.some(x => x.id === 'havenly-work-interest'));
  assert.ok(result.planned.some(x => x.id === 'local-job-board'));
  assert.ok(!result.available.some(x => x.id === 'havenly-service'));
  assert.equal(result.external_side_effects_authorized, false);
});

test('job board and Havenly hiring remain explicitly unavailable', () => {
  const result = resolve({ goal_id: 'work' });
  for (const node of result.planned) {
    assert.equal(node.href, null);
    assert.equal(node.action, 'Not available yet');
  }
  assert.ok(result.available.some(x => x.id === 'partner-interest'));
  assert.match(result.available.find(x => x.id === 'partner-interest').boundary, /not an employment application/i);
});

test('service inquiry offers existing Havenly page without claiming a booking', () => {
  const result = resolve({ query: 'Need a house cleaning quote' });
  assert.equal(result.goal_id, 'services');
  const havenly = result.available.find(x => x.id === 'havenly-service');
  assert.equal(havenly.href, '/havenly/');
  assert.match(havenly.boundary, /not a confirmed appointment/i);
});

test('local rewards never claims an earned point or active merchant', () => {
  const result = resolve({ query: 'Where can I earn local rewards?' });
  assert.equal(result.goal_id, 'rewards');
  assert.equal(result.available.length, 1);
  assert.match(result.available[0].boundary, /guaranteed/i);
});

test('business partner page is an interest path, not an enrollment', () => {
  const result = resolve({ goal_id: 'business' });
  const partners = result.available.find(x => x.id === 'partners');
  assert.equal(partners.state, 'human_intake');
  assert.match(partners.boundary, /not a signed agreement/i);
});

test('preserves separate resilience technology route', () => {
  const result = resolve({ query: 'Need application continuity when wifi changes' });
  assert.equal(result.goal_id, 'connectivity');
  assert.equal(result.available[0].href, '/network/');
  assert.match(result.available[0].boundary, /Not a carrier/i);
});

test('no route hallucination for an unknown question', () => {
  const result = resolve({ query: 'I need dragon dentistry on Mars' });
  assert.equal(result.state, 'no_verified_route');
  assert.equal(result.available.length, 0);
});

test('emergency requests do not enter the product marketplace', () => {
  const result = resolve({ query: '911 immediate danger' });
  assert.equal(result.state, 'outside_directory_emergency');
  assert.equal(result.available.length, 0);
});

test('private request text is never echoed into a public result', () => {
  const secret = 'private-example-customer@invalid.test';
  const result = resolve({ query: 'I need house cleaning ' + secret });
  assert.ok(!JSON.stringify(result).includes(secret));
});

test('unknown goal id cannot override selection or grant authority', () => {
  const result = resolve({ goal_id: 'admin', query: 'rewards' });
  assert.equal(result.goal_id, 'rewards');
  assert.equal(result.external_side_effects_authorized, false);
});

test('catalog rejects cross-origin and script links', () => {
  for (const href of ['https://other.example/path', '//other.example', 'javascript:alert(1)', '/foo/../admin', '/foo\\bar']) {
    const copy = structuredClone(catalog);
    copy.nodes.find(n => n.id === 'rewards').href = href;
    assert.throws(() => validateCatalog(copy), /node_href_invalid/);
  }
});

test('catalog rejects a planned job that mysteriously becomes clickable', () => {
  const copy = structuredClone(catalog);
  copy.nodes.find(n => n.id === 'local-job-board').href = '/jobs/';
  assert.throws(() => validateCatalog(copy), /node_href_invalid/);
});

test('catalog rejects missing nodes and silently upgraded release claims', () => {
  const copy = structuredClone(catalog);
  copy.goals[0].nodes.push('nonexistent-network-node');
  assert.throws(() => validateCatalog(copy), /goal_nodes_invalid/);
  const claims = structuredClone(catalog);
  claims.release_state = 'live';
  assert.throws(() => validateCatalog(claims), /catalog_authority_boundary_invalid/);
});

test('same need produces deterministic, replay-safe read-only route results', () => {
  assert.deepEqual(resolve({ query: 'local business referrals' }), resolve({ query: 'local business referrals' }));
});
