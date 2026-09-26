import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

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
assert.equal(receipt.results[0]?.blocked_reason, 'authorized_probe_bridge_not_configured');
console.log('CHUM provider probe truth-state proof passed.');
