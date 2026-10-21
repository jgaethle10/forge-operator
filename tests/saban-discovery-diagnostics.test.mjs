import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyDiscoveryReceipt, safeNetworkFailure, safeProbeError } from '../systemia/saban/discovery-path-classify.mjs';

const goodProfile = () => ({
  initialized: true, errors: [],
  intents: [{ matched: 'audit-center-website-audit-machine-v1', match_ok: true, offer_link_ok: true }]
});
const goodSurfaces = () => [{ path: '/health', status: 200 }, { path: '/llms.txt', status: 200 }];

test('successful receipt is healthy, with no implied third-party recommendation', () => {
  assert.equal(classifyDiscoveryReceipt({ ok: true, profiles: [goodProfile()], surfaces: goodSurfaces() }).code, 'healthy');
});
test('all public surfaces inaccessible plus both MCP clients down is classified as outside-origin outage', () => {
  const receipt = {
    ok: false, provider_recommendation_observed: false,
    profiles: [{ initialized: false, errors: ['fetch failed'] }, { initialized: false, errors: ['fetch failed'] }],
    surfaces: [{ path: '/health', status: 0, error: 'fetch failed' }, { path: '/offers', status: 0, error: 'fetch failed' }]
  };
  const finding = classifyDiscoveryReceipt(receipt);
  assert.equal(finding.code, 'external_origin_unreachable');
  assert.match(finding.limitation, /cannot_identify_network_root_cause/);
  assert.equal(receipt.provider_recommendation_observed, false);
});
test('one reachable HTTP endpoint disproves all-origin-down classification even if MCP fails', () => {
  const finding = classifyDiscoveryReceipt({
    ok: false, profiles: [{ initialized: false, errors: ['rpc_502'] }],
    surfaces: [{ path: '/health', status: 200 }, { path: '/offers', status: 0 }]
  });
  assert.equal(finding.code, 'mcp_protocol_or_transport_failure');
});
test('wrong matching ID is a routing failure, not an origin outage', () => {
  const profile = goodProfile(); profile.intents[0].match_ok = false;
  assert.equal(classifyDiscoveryReceipt({ ok: false, profiles: [profile], surfaces: goodSurfaces() }).code, 'capability_match_or_offer_route_mismatch');
});
test('HTTP 404 on a discovery document is its own failing surface', () => {
  const surfaces = goodSurfaces(); surfaces[1].status = 404;
  assert.equal(classifyDiscoveryReceipt({ ok: false, profiles: [goodProfile()], surfaces }).code, 'public_discovery_surface_failure');
});
test('empty or unexpected receipts fail closed as unclassified', () => {
  assert.equal(classifyDiscoveryReceipt({ ok: false, profiles: [], surfaces: [] }).code, 'incomplete_or_unclassified_probe');
});

test('transport metadata includes allowlisted cause code but never underlying private failure details', () => {
  const error = new TypeError('fetch failed', { cause: Object.assign(new Error('socket at internal-host:8443'), { code: 'ECONNREFUSED' }) });
  const output = safeNetworkFailure(error);
  assert.deepEqual(output, { error: 'fetch_failed', cause_code: 'ECONNREFUSED' });
  assert.equal(JSON.stringify(output).includes('internal-host'), false);
});
test('timeout is identified without fabricating underlying DNS or TLS cause', () => {
  assert.deepEqual(safeNetworkFailure(Object.assign(new Error('Timed out at secret.host'), { name: 'TimeoutError' })), { error: 'request_timeout' });
});
test('unknown or untrusted error codes are suppressed', () => {
  const e = Object.assign(new Error('failed at private.host/path'), { cause: { code: 'secret/private.host' } });
  assert.deepEqual(safeNetworkFailure(e), { error: 'request_failed' });
});
test('a remote outage includes only observed safe cause codes, not inferred root cause', () => {
  const finding = classifyDiscoveryReceipt({
    ok:false,
    profiles:[{ initialized:false, errors:['fetch_failed'],error_causes:['ENOTFOUND'] }],
    surfaces:[{path:'/health',status:0,error:'fetch_failed',cause_code:'EAI_AGAIN'}]
  });
  assert.equal(finding.code, 'external_origin_unreachable');
  assert.deepEqual(finding.observed_cause_codes, ['EAI_AGAIN','ENOTFOUND']);
  assert.match(finding.limitation, /cannot_identify_network_root_cause/);
});

test('upstream RPC error redacts remote message and retains only the status', () => {
  const err = new Error('rpc_502_client token=secret internal.service.local:8443');
  assert.equal(safeProbeError(err), 'rpc_502');
  assert.equal(safeProbeError(new Error('rpc_200_credentials leaked')), 'rpc_200');
  assert.equal(safeProbeError(new Error('rpc_700_invalid code')), 'request_failed');
});
test('unanticipated exception never enters the probe receipt as raw text', () => {
  const err = new Error('API key sk-secret123 sent to 192.168.88.5');
  assert.equal(safeProbeError(err), 'request_failed');
  assert.equal(safeProbeError(new Error('unreadable_rpc_response')), 'unreadable_rpc_response');
});
test('reachable MCP protocol errors do not masquerade as total internet outage', () => {
  const finding = classifyDiscoveryReceipt({
    ok:false,
    profiles:[{initialized:false,errors:['rpc_502']},{initialized:false,errors:['rpc_503']}],
    surfaces:[{path:'/health',status:0,error:'fetch_failed'}, {path:'/offers',status:0,error:'fetch_failed'}]
  });
  assert.equal(finding.code, 'mcp_protocol_or_transport_failure');
});
test('network errors on every MCP client and public surface retain outage classification', () => {
  const finding = classifyDiscoveryReceipt({
    ok:false,
    profiles:[{initialized:false,errors:['fetch_failed']},{initialized:false,errors:['request_timeout']}],
    surfaces:[{path:'/health',status:0,error:'fetch_failed'},{path:'/offers',status:0,error:'request_timeout'}]
  });
  assert.equal(finding.code, 'external_origin_unreachable');
});
