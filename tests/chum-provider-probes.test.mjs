import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { resolveLiveCanaryEvidence, runtimeRequiresReverification } from '../systemia/chum/live-canary-evidence.mjs';

const suite = JSON.parse(fs.readFileSync('chum-probes/probe-suite.json', 'utf8'));
const testCase = suite.cases.find((row) => row.enabled && row.expected_fit);
assert.ok(testCase?.case_id);

execFileSync(process.execPath, ['systemia/chum/provider-probes.mjs'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    CHUM_PROBE_BRIDGE_URL: '',
    CHUM_PROBE_BRIDGE_TOKEN: '',
    NEXUS_PROBE_BRIDGE_URL: '',
    NEXUS_PROBE_BRIDGE_TOKEN: '',
    CHUM_REQUIRE_PROBE_BRIDGE: 'false',
    CHUM_PROBE_PROVIDERS: suite.providers[0],
    CHUM_PROBE_CASES: testCase.case_id
  }
});

const receipt = JSON.parse(fs.readFileSync('artifacts/chum/provider-probe-latest.json', 'utf8'));
assert.equal(receipt.bridge_configured, false);
assert.equal(receipt.measurement_state, 'blocked_bridge_not_configured');
assert.equal(receipt.summary.completed, 0);
assert.equal(receipt.summary.blocked, 1);
assert.equal(receipt.summary.failed, 0);
assert.equal(receipt.summary.consumer_completed, 0);
assert.equal(receipt.summary.machine_completed, 0);
assert.equal(receipt.results[0]?.blocked_reason, 'authorized_probe_bridge_not_configured');
console.log('CHUM provider probe truth-state proof passed.');

const evidence = 'https://raw.githubusercontent.com/jgaethle10/forge-operator/main/conformance/runtime-observations/example.json';
const ownedRoute = 'https://example.evercraft.invalid/mcp';
const verified = {
  live_canary_evidence: evidence,
  conformance_state: 'live_read_only_mcp_verified',
  machine_commerce_handoff_state: 'bounded_read_only_mcp_verified',
  mcp: ownedRoute,
  live_canary_endpoint: ownedRoute
};
assert.equal(resolveLiveCanaryEvidence({ productConformance: verified }), evidence);
assert.equal(resolveLiveCanaryEvidence({ productConformance: { ...verified, live_canary_endpoint: '' } }), null);
assert.equal(resolveLiveCanaryEvidence({ productConformance: { ...verified, live_canary_endpoint: 'https://different.evercraft.invalid/mcp' } }), null);
assert.equal(resolveLiveCanaryEvidence({ productConformance: { ...verified, conformance_state: 'verification_required' } }), null);
assert.equal(resolveLiveCanaryEvidence({ productConformance: { ...verified, machine_commerce_handoff_state: 'not_verified' } }), null);
assert.equal(resolveLiveCanaryEvidence({ offer: { live_canary_evidence: evidence } }), evidence);
assert.equal(runtimeRequiresReverification({
  legacy_provider_runtime: 'retired',
  runtime_route_state: 'owned_route_pending_external_verification',
  conformance_state: 'owned_runtime_reverification_pending',
  live_canary_evidence_state: 'historical_pre_cutover_not_current',
  mcp_registry: { endpoint_state: 'legacy_endpoint_retired_owned_republication_pending' }
}), true);
assert.equal(runtimeRequiresReverification({
  legacy_provider_runtime: '',
  runtime_route_state: 'owned_route_verified',
  conformance_state: 'live_read_only_mcp_verified',
  live_canary_evidence_state: 'current',
  mcp_registry: { endpoint_state: 'owned_endpoint_verified' }
}), false);

const syncSource = fs.readFileSync('systemia/chum/sync-public-discovery.mjs', 'utf8');
assert.match(syncSource, /runtimeReverificationRequired/);
assert.match(syncSource, /resolveLiveCanaryEvidence/);
assert.match(syncSource, /legacy provider runtime retired/);
console.log('CHUM live-canary evidence binding proof passed.');
