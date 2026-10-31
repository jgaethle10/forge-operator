import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRouterMappingEvidence as evaluate } from '../scripts/edge-router-mapping-evidence.mjs';

const web = [
  { external: 80, internal: 18080, proto: 'TCP', scope: 'web' },
  { external: 443, internal: 8443, proto: 'TCP', scope: 'web' }
];
const dns = [
  { external: 53, internal: 1053, proto: 'TCP', production: true },
  { external: 53, internal: 1053, proto: 'UDP', production: true }
];
const diagnostic = [
  { external: 53053, internal: 1053, proto: 'TCP', diagnostic: true },
  { external: 53053, internal: 1053, proto: 'UDP', diagnostic: true }
];
const ok = (requested) => ({ requested, success: true });
const fail = (requested) => ({ requested, success: false });
const attempt = (...mappings) => ({ method: 'UPnP-IGD', mappings });

test('web-only success never claims DNS success (or DNS failure)', () => {
  const x = evaluate(web, [attempt(...web.map(ok))]);
  assert.equal(x.scope_mapping_control_ok, true);
  assert.equal(x.production_mapping_control_ok, null);
  assert.equal(x.diagnostic_mapping_control_ok, null);
  assert.equal(x.mapping_evidence_state, 'router_report_only_not_external_reachability');
});

test('web-only partial mapping failure never counts as success', () => {
  const x = evaluate(web, [attempt(ok(web[0]), fail(web[1]))]);
  assert.equal(x.scope_mapping_control_ok, false);
  assert.equal(x.production_mapping_control_ok, null);
});

test('DNS scope needs both protocols to claim successful production mapping', () => {
  const x = evaluate([...dns, ...diagnostic], [attempt(...dns.map(ok))]);
  assert.equal(x.scope_mapping_control_ok, true);
  assert.equal(x.production_mapping_control_ok, true);
  assert.equal(x.diagnostic_mapping_control_ok, false);
});

test('a missing DNS UDP acknowledgement fails the production claim', () => {
  const x = evaluate(dns, [attempt(ok(dns[0]))]);
  assert.equal(x.scope_mapping_control_ok, false);
  assert.equal(x.production_mapping_control_ok, false);
  assert.equal(x.diagnostic_mapping_control_ok, null);
});

test('all scope needs both web and production DNS while diagnostics remain optional', () => {
  const withDns = evaluate([...web, ...dns, ...diagnostic],
    [attempt(...[...web, ...dns].map(ok))]);
  const withoutDns = evaluate([...web, ...dns], [attempt(...web.map(ok))]);
  assert.equal(withDns.scope_mapping_control_ok, true);
  assert.equal(withDns.production_mapping_control_ok, true);
  assert.equal(withDns.diagnostic_mapping_control_ok, false);
  assert.equal(withoutDns.scope_mapping_control_ok, false);
  assert.equal(withoutDns.production_mapping_control_ok, false);
});

test('empty mapping request never returns a vacuously true green status', () => {
  const x = evaluate([], [attempt()]);
  assert.equal(x.scope_mapping_control_ok, false);
  assert.equal(x.production_mapping_control_ok, null);
  assert.equal(x.diagnostic_mapping_control_ok, null);
});

test('wrong internal port cannot satisfy request', () => {
  const x = evaluate(web, [attempt(
    { requested: { ...web[0], internal: 42420 }, success: true },
    ok(web[1])
  )]);
  assert.equal(x.scope_mapping_control_ok, false);
});

test('report can combine equivalent router replies from multiple documented attempts', () => {
  const x = evaluate(web, [attempt(ok(web[0])), attempt(ok(web[1]))]);
  assert.equal(x.scope_mapping_control_ok, true);
});

test('not matching a reported mapping by protocol does not count as success', () => {
  const x = evaluate(dns, [attempt(
    ok(dns[0]),
    { requested: { ...dns[1], proto: 'TCP' }, success: true }
  )]);
  assert.equal(x.production_mapping_control_ok, false);
});

test('unexpected input types fail closed', () => {
  assert.throws(() => evaluate(null, []), TypeError);
  assert.throws(() => evaluate(web, null), TypeError);
});
