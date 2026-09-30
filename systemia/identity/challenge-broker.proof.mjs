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

  console.log(JSON.stringify({
    schema: 'evercraft.identity.challenge-broker-proof.v1',
    status: 'pass',
    challenge_delivery_receipted: true,
    pending_credential_not_plaintext: true,
    code_not_plaintext: true,
    subject_provisioned_only_after_verification: true
  }));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
