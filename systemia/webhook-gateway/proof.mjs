#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHmac, randomBytes } from 'node:crypto';
import { EvercraftSecretStore } from '../secret-store/secret-store.mjs';
import { EvercraftWebhookGateway } from './webhook-gateway.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-webhook-proof-'));
const now = new Date('2026-09-30T20:00:00.000Z');
const timestamp = String(Math.floor(now.getTime() / 1000));
const secret = 'webhook-proof-secret';
const body = Buffer.from(JSON.stringify({ hello: 'world' }));
const signature = createHmac('sha256', secret).update(`${timestamp}.`).update(body).digest('hex');
let deliveries = 0;
try {
  const secrets = new EvercraftSecretStore({ stateDir: path.join(root, 'secrets'), masterKey: randomBytes(32) });
  secrets.setSecret('webhook:proof-app:provider', 'signing-secret', secret);
  const gateway = new EvercraftWebhookGateway({ stateDir: path.join(root, 'webhooks'), secretStore: secrets });
  gateway.registerRoute({
    appKey: 'proof-app',
    routeKey: 'provider',
    secretNamespace: 'webhook:proof-app:provider',
    secretName: 'signing-secret',
    handler: async ({ eventId, bodySha256 }) => { deliveries += 1; return { eventId, bodySha256 }; }
  });
  const headers = {
    'x-evercraft-event-id': 'evt-proof-1',
    'x-evercraft-timestamp': timestamp,
    'x-evercraft-signature': `sha256=${signature}`
  };
  const delivered = await gateway.handle({ appKey: 'proof-app', routeKey: 'provider', headers, body, now });
  assert.equal(delivered.status, 'delivered');
  assert.equal(deliveries, 1);
  const replay = await gateway.handle({ appKey: 'proof-app', routeKey: 'provider', headers, body, now });
  assert.equal(replay.replayed, true);
  assert.equal(deliveries, 1);

  await assert.rejects(
    () => gateway.handle({ appKey: 'proof-app', routeKey: 'provider', headers: { ...headers, 'x-evercraft-signature': 'sha256=' + '00'.repeat(32), 'x-evercraft-event-id': 'evt-proof-bad' }, body, now }),
    /webhook_signature_mismatch/
  );
  const staleTimestamp = String(Math.floor((now.getTime() - 10 * 60 * 1000) / 1000));
  const staleSignature = createHmac('sha256', secret).update(`${staleTimestamp}.`).update(body).digest('hex');
  await assert.rejects(
    () => gateway.handle({ appKey: 'proof-app', routeKey: 'provider', headers: { ...headers, 'x-evercraft-timestamp': staleTimestamp, 'x-evercraft-signature': staleSignature, 'x-evercraft-event-id': 'evt-proof-stale' }, body, now }),
    /webhook_timestamp_outside_replay_window/
  );
  assert.equal(gateway.health().state, 'healthy');

  console.log(JSON.stringify({
    schema: 'evercraft.webhook.proof.v1',
    status: 'pass',
    hmac_verified: true,
    replay_window_enforced: true,
    idempotent_delivery: true,
    replay_does_not_redispatch: true,
    payload_absent_from_receipts: true
  }));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
