#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { EvercraftIdentity } from './identity.mjs';
import { EvercraftIdentityChallengeBroker } from './challenge-broker.mjs';
import { EvercraftSecretStore } from '../secret-store/secret-store.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-challenge-proof-'));
const delivered = [];
const credential = randomBytes(24).toString('base64url');
const replacementCredential = randomBytes(24).toString('base64url');

try {
  const identity = new EvercraftIdentity({ stateDir: path.join(root, 'identity') });
  const secretStore = new EvercraftSecretStore({
    stateDir: path.join(root, 'secrets'),
    masterKey: randomBytes(32)
  });
  const broker = new EvercraftIdentityChallengeBroker({
    stateDir: path.join(root, 'challenges'),
    identity,
    secretStore,
    deliverChallenge: async (item) => {
      delivered.push(item);
      return { receipt_ref: 'proof:delivery:' + delivered.length };
    }
  });

  const begun = await broker.beginRegistration({
    appKey: 'proof-app',
    body: { email: 'new-person@example.invalid', password: credential, display_name: 'New Person' }
  });
  assert.equal(begun.status, 'verification_required');
  assert.match(delivered[0].code, /^\d{6}$/);

  const disk = fs.readdirSync(path.join(root, 'challenges'), { recursive: true })
    .map((name) => path.join(root, 'challenges', name))
    .filter((name) => fs.existsSync(name) && fs.statSync(name).isFile())
    .map((name) => fs.readFileSync(name, 'utf8'))
    .join('\n');
  assert.equal(disk.includes(credential), false);
  assert.equal(disk.includes(delivered[0].code), false);

  const verified = await broker.verifyRegistration({
    appKey: 'proof-app',
    body: { email: 'new-person@example.invalid', otpCode: delivered[0].code }
  });
  assert.equal(verified.verified, true);
  assert.equal(
    identity.authenticatePassword({ login: 'new-person@example.invalid', password: credential }).subject_ref,
    verified.subject_ref
  );

  const recovery = await broker.beginReset({
    appKey: 'proof-app',
    body: { email: 'new-person@example.invalid' }
  });
  assert.equal(recovery.status, 'accepted');
  assert.equal(recovery.delivery_state, 'not_disclosed');
  const resetToken = delivered.at(-1).resetToken;
  assert.ok(resetToken);

  const challengeDiskAfterReset = fs.readdirSync(path.join(root, 'challenges'), { recursive: true })
    .map((name) => path.join(root, 'challenges', name))
    .filter((name) => fs.existsSync(name) && fs.statSync(name).isFile())
    .map((name) => fs.readFileSync(name, 'utf8'))
    .join('\n');
  assert.equal(challengeDiskAfterReset.includes(resetToken), false);

  const reset = await broker.completeReset({
    appKey: 'proof-app',
    body: { resetToken, newPassword: replacementCredential }
  });
  assert.equal(reset.reset, true);
  assert.throws(
    () => identity.authenticatePassword({ login: 'new-person@example.invalid', password: credential }),
    /identity_credentials_invalid/
  );
  assert.equal(
    identity.authenticatePassword({ login: 'new-person@example.invalid', password: replacementCredential }).subject_ref,
    verified.subject_ref
  );

  const unknownRecovery = await broker.beginReset({
    appKey: 'proof-app',
    body: { email: 'missing-person@example.invalid' }
  });
  assert.deepEqual(unknownRecovery, recovery);
  assert.equal(delivered.length, 2);

  console.log(JSON.stringify({
    schema: 'evercraft.identity.challenge-broker-proof.v1',
    status: 'pass',
    challenge_delivery_receipted: true,
    pending_credential_not_plaintext: true,
    code_not_plaintext: true,
    subject_provisioned_only_after_verification: true,
    recovery_token_not_plaintext: true,
    recovery_account_state_not_disclosed: true,
    credential_replacement_revokes_old_credential: true
  }));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
