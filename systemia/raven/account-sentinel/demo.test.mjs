import test from 'node:test';
import assert from 'node:assert/strict';
import { runDemoScenario, DEMO_SCENARIOS } from './demo.mjs';
import { createAccountSentinelGateway } from './gateway.mjs';
import { createDemoAuditLedger } from './ledger.mjs';

for (const scenario of DEMO_SCENARIOS) {
  test(`scenario ${scenario.id}`, async () => {
    const out = await runDemoScenario(scenario.id);
    const expectedAllow = scenario.id === 'authorized';
    assert.equal(out.result.allowed, expectedAllow);
    assert.equal(out.audit_valid, true);
    assert.equal(out.environment, 'SIMULATION_ONLY');
    assert.equal(out.provider_reads, scenario.id === 'provider_offline' || expectedAllow ? 1 : 0);
    assert.equal(out.result.data === null, !expectedAllow);
    if (expectedAllow) assert.equal(out.result.data.simulated, true);
  });
}

test('privileged providers cannot be omitted', () => {
  assert.throws(() => createAccountSentinelGateway({}), /required_privileged_provider_missing/);
});
test('audit receipts are chained and can detect a modified copy', async () => {
  const audit = createDemoAuditLedger();
  const a = await audit.append({ kind: 'denied', operation: 'transfer.create', reason: 'blocked' });
  const b = await audit.append({ kind: 'denied', operation: 'balance.read', reason: 'scope' });
  assert.notEqual(a.hash, b.hash);
  assert.equal(audit.verify(), true);
  const extracted = audit.entries();
  extracted[0].event.reason = 'forged';
  assert.equal(audit.entries()[0].event.reason, 'blocked');
});
test('rejects forged privileged fields before contacting identity', async () => {
  let called = 0;
  const g = createAccountSentinelGateway({
    identity: { resolve: async () => { called++; return null; } },
    consent: { get: async () => null }, connectors: { get: async () => null },
    revocations: { snapshot: async () => ({ fresh: true, revoked_ids: new Set() }) },
    bankReader: { read: async () => { throw new Error('never'); } },
    audit: { append: async () => ({ hash: 'fake-test' }) }, trustedPublicKeys: {},
  });
  const out = await g.read({ session_proof: 'x', grant_ref: 'x', request: {},
    trustedPrincipal: { authenticated: true } });
  assert.equal(out.reason, 'invalid_gateway_request');
  assert.equal(called, 0);
});
