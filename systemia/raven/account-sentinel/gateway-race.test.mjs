import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createAccountSentinelGateway } from './gateway.mjs';
import { signedGrantMessage } from './policy.mjs';
import { createDemoAuditLedger } from './ledger.mjs';

// Explicit deferred bank responses let the test change authority while two
// financial reads are genuinely in flight, rather than relying on timeouts.
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const grantFor = (claims, key) => ({
  schema: 'evercraft.account-sentinel.signed-grant.v1',
  key_id: 'race-test-signer', claims,
  signature_base64: sign(null, signedGrantMessage(claims), key).toString('base64'),
});
const requestFor = account_ref => ({
  schema: 'evercraft.account-sentinel.request.v1', operation: 'balance.read',
  method: 'GET', connector_id: 'fake-bank-api', account_ref,
});
const build = ({ reader, audit = createDemoAuditLedger() }) => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const claims = {
    schema: 'evercraft.account-sentinel.grant.v1',
    grant_id: 'race-test-grant', subject_id: 'race-person', agent_id: 'race-agent',
    connector_id: 'fake-bank-api', account_refs: ['one', 'two'],
    scopes: ['balances:read'],
    issued_at: new Date(Date.now() - 60_000).toISOString(),
    expires_at: new Date(Date.now() + 30*60_000).toISOString(),
  };
  const revoked = new Set();
  const gateway = createAccountSentinelGateway({
    identity: { resolve: async () => ({
      authenticated: true, auth_source: 'evercraft_identity',
      subject_id: 'race-person', agent_id: 'race-agent',
    }) },
    consent: { get: async () => grantFor(claims, privateKey) },
    connectors: { get: async () => ({
      connector_id: 'fake-bank-api', status: 'active',
      mode: 'delegated_oauth', approved: true, read_only: true,
      scopes: ['balances:read'],
    }) },
    revocations: { snapshot: async () => ({ fresh: true, revoked_ids: new Set(revoked) }) },
    bankReader: { read: reader },
    audit, trustedPublicKeys: {
      'race-test-signer': publicKey.export({ type: 'spki', format: 'pem' }),
    },
  });
  const read = account => gateway.read({
    session_proof: 'fake-authorized-session',
    grant_ref: 'race-test-grant', request: requestFor(account),
  });
  return { revoked, audit, read };
};

test('two pending account reads are both withheld if consent is revoked while blocked', async () => {
  const waiting = new Map();
  const entered = deferred();
  const ctx = build({ reader: ({ account_ref }) => {
    const d = deferred();
    waiting.set(account_ref, d);
    if (waiting.size === 2) entered.resolve();
    return d.promise;
  } });
  const one = ctx.read('one');
  const two = ctx.read('two');
  await entered.promise;
  ctx.revoked.add('race-test-grant');
  waiting.get('one').resolve({ simulated: true, sensitive: 100 });
  waiting.get('two').resolve({ simulated: true, sensitive: 200 });
  const results = await Promise.all([one, two]);
  assert.ok(results.every(result => result.allowed === false && result.data === null &&
    result.reason === 'authority_changed_during_read'));
  assert.equal(ctx.audit.verify(), true);
  assert.equal(ctx.audit.entries().filter(e => e.event.kind === 'read_withheld').length, 2);
  assert.equal(ctx.audit.entries().filter(e => e.event.kind === 'read_completed').length, 0);
});

test('completed authorized read survives, but concurrent later read is withheld', async () => {
  const waiting = new Map();
  const entered = deferred();
  const ctx = build({ reader: ({ account_ref }) => {
    const d = deferred();
    waiting.set(account_ref, d);
    if (waiting.size === 2) entered.resolve();
    return d.promise;
  } });
  const one = ctx.read('one');
  const two = ctx.read('two');
  await entered.promise;
  waiting.get('one').resolve({ simulated: true, sensitive: 100 });
  const first = await one;
  assert.equal(first.allowed, true);
  assert.equal(first.data.sensitive, 100);
  ctx.revoked.add('race-test-grant');
  waiting.get('two').resolve({ simulated: true, sensitive: 200 });
  const second = await two;
  assert.equal(second.allowed, false);
  assert.equal(second.data, null);
  assert.equal(second.reason, 'authority_changed_during_read');
  assert.equal(ctx.audit.verify(), true);
  assert.deepEqual(ctx.audit.entries().filter(e =>
    ['read_completed', 'read_withheld'].includes(e.event.kind)).map(e => e.event.kind),
  ['read_completed', 'read_withheld']);
});
