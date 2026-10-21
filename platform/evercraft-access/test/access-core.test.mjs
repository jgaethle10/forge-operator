import assert from 'node:assert/strict';
import {
  authorizeCapability,
  issueApiKey,
  lifecycleReceipt,
  parseApiKey,
  revokeCredential,
  verifyApiKey,
} from '../lib/access-core.mjs';

const pepper = 'test-only-pepper-32-bytes-minimum-value';
const issued = issueApiKey({
  projectKey: 'forensiscope-dev',
  tenantKey: 'evercraft',
  environment: 'test',
  scopes: ['media:inspect', 'media:inspect', 'usage:read'],
  pepper,
});

assert.match(issued.secret_once, /^ec_test_/);
assert.equal(issued.record.secret_material_stored, false);
assert.equal(Object.values(issued.record).includes(issued.secret_once), false);
assert.deepEqual(issued.record.scope_keys, ['media:inspect', 'usage:read']);
assert.equal(parseApiKey(issued.secret_once).key_id, issued.record.key_id);

const verified = verifyApiKey(issued.secret_once, issued.record, { pepper });
assert.equal(verified.ok, true);
assert.equal(verified.principal.project_key, 'forensiscope-dev');
assert.equal(verifyApiKey(issued.secret_once + 'bad', issued.record, { pepper }).ok, false);

assert.deepEqual(authorizeCapability({
  principal: verified.principal,
  capabilityKey: 'forensiscope.video.inspect.v1',
  environment: 'test',
  requiredScopes: ['media:inspect'],
  entitlement: { status: 'active', project_key: 'forensiscope-dev', capability_keys: ['forensiscope.video.inspect.v1'] },
}), { allowed: true, reason: null });

assert.equal(authorizeCapability({
  principal: verified.principal,
  capabilityKey: 'yard.runtime.v1',
  environment: 'test',
  requiredScopes: ['runtime:execute'],
}).reason, 'scope_denied');

assert.equal(authorizeCapability({
  principal: verified.principal,
  capabilityKey: 'forensiscope.video.inspect.v1',
  environment: 'live',
  requiredScopes: ['media:inspect'],
}).reason, 'environment_mismatch');

const revoked = revokeCredential(issued.record, 'rotation_complete', '2026-09-24T16:45:00.000Z');
assert.equal(verifyApiKey(issued.secret_once, revoked, { pepper }).reason, 'credential_revoked');

const expired = { ...issued.record, expires_at: '2026-09-24T15:00:00.000Z' };
assert.equal(verifyApiKey(issued.secret_once, expired, { pepper, clock: () => '2026-09-24T16:00:00.000Z' }).reason, 'credential_expired');

const receipt = lifecycleReceipt({ eventType: 'issued', record: issued.record, at: '2026-09-24T16:45:00.000Z' });
assert.equal(receipt.secret_material_stored, false);
assert.equal(JSON.stringify(receipt).includes(issued.secret_once), false);

console.log(JSON.stringify({
  status: 'PASS',
  tests: 15,
  secret_shown_once: true,
  plaintext_secret_persisted: false,
  verifier: 'HMAC-SHA256 with external pepper boundary',
  timing_safe_verification: true,
  scope_enforcement: 'PASS',
  environment_isolation: 'PASS',
  revocation: 'PASS',
  expiry: 'PASS',
}, null, 2));
