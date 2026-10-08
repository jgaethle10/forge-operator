import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';
import { createHmac } from 'node:crypto';
import { createRavenPhoneIngress } from './raven-phone-ingress.mjs';

const NOW = '2026-10-08T03:00:00Z';
const SECRET = 'fixture-independent-bridge-signature-secret-v1';
const SOURCE = {
  source_system: 'raven_nexus',
  source_entity: 'PhoneMessage',
  source_record_ref: 'fixture-record',
  idempotency_key: 'raven:PhoneMessage:fixture-record:received',
  provider_type: 'twilio',
  provider_event_ref: 'fixture-provider-event',
  channel: 'sms',
  direction: 'inbound',
  occurred_at: NOW,
  text_content: 'I need a fence estimate',
};
function signed(source = SOURCE) {
  const raw = JSON.stringify(source);
  return {
    raw,
    signature: createHmac('sha256', SECRET).update(NOW + '.' + raw).digest('hex'),
  };
}
function makeRequest(raw, signature, overrides = {}) {
  const req = Readable.from([Buffer.from(raw)]);
  req.url = '/api/communications/raven-inbound';
  req.method = 'POST';
  req.headers = {
    'content-type': 'application/json',
    'x-evercraft-timestamp': NOW,
    'x-evercraft-signature': signature,
    ...overrides,
  };
  return req;
}
function makeResponse() {
  return {
    status: 0, body: '', headers: {},
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(body) { this.body = String(body || ''); },
    json() { return JSON.parse(this.body); },
  };
}
async function request(ingress, record, overrides) {
  const { raw, signature } = signed(record);
  const res = makeResponse();
  const handled = await ingress.handle(makeRequest(raw, signature, overrides), res);
  return { ...res, handled, payload: res.json() };
}
function temporaryStore(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-phone-test-'));
  return Promise.resolve().then(() => run(root)).finally(() => fs.rmSync(root, { recursive: true, force: true }));
}

test('endpoint fails closed without a secret and private state directory', async () => {
  const ingress = createRavenPhoneIngress({});
  assert.equal(ingress.ready, false);
  const res = await request(ingress, SOURCE);
  assert.equal(res.status, 503);
  assert.equal(res.payload.error, 'private_ingress_disabled');
});

test('signed inbound SMS creates one durable PII-free candidate, not a contact', async () => {
  await temporaryStore(async (dir) => {
    const ingress = createRavenPhoneIngress({ secret: SECRET, stateDir: dir, now: () => new Date(NOW) });
    const first = await request(ingress, SOURCE);
    assert.equal(first.handled, true);
    assert.equal(first.status, 202);
    assert.equal(first.payload.status, 'written');
    assert.equal(first.payload.systemia_mission_admitted, false);
    assert.equal(first.payload.customer_contact_authorized, false);
    const stored = fs.readdirSync(dir);
    assert.equal(stored.length, 1);
    const text = fs.readFileSync(path.join(dir, stored[0]), 'utf8');
    assert.equal(text.includes('fence estimate'), false);
    assert.equal(text.includes(SOURCE.provider_event_ref), false);
    assert.equal(JSON.parse(text).lane_candidate, 'eps');
    assert.equal((fs.statSync(path.join(dir, stored[0])).mode & 0o077), 0);
  });
});

test('duplicate provider event yields same receipt and no second stored record', async () => {
  await temporaryStore(async (dir) => {
    const ingress = createRavenPhoneIngress({ secret: SECRET, stateDir: dir, now: () => new Date(NOW) });
    const first = await request(ingress, SOURCE);
    const second = await request(ingress, SOURCE);
    assert.equal(second.status, 200);
    assert.equal(second.payload.status, 'duplicate');
    assert.equal(first.payload.bridge_receipt_key, second.payload.bridge_receipt_key);
    assert.equal(fs.readdirSync(dir).length, 1);
  });
});

test('Twilio SID replay cannot create a second candidate after Raven record recreation', async () => {
  await temporaryStore(async (dir) => {
    const ingress = createRavenPhoneIngress({ secret: SECRET, stateDir: dir, now: () => new Date(NOW) });
    const first = await request(ingress, SOURCE);
    const recreated = await request(ingress, {
      ...SOURCE,
      source_record_ref: 'recreated-db-row',
      idempotency_key: 'raven:PhoneMessage:recreated-db-row:received',
    });
    assert.equal(first.status, 202);
    assert.equal(recreated.status, 200);
    assert.equal(recreated.payload.status, 'duplicate');
    assert.equal(first.payload.bridge_receipt_key, recreated.payload.bridge_receipt_key);
    assert.equal(fs.readdirSync(dir).length, 1);
  });
});

test('a truncated prior record fails closed instead of returning a false duplicate', async () => {
  await temporaryStore(async (dir) => {
    const ingress = createRavenPhoneIngress({ secret: SECRET, stateDir: dir, now: () => new Date(NOW) });
    const first = await request(ingress, SOURCE);
    assert.equal(first.status, 202);
    const [record] = fs.readdirSync(dir);
    fs.writeFileSync(path.join(dir, record), '{"truncated":', { encoding: 'utf8' });
    const retry = await request(ingress, SOURCE);
    assert.equal(retry.status, 503);
    assert.equal(retry.payload.error, 'durable_review_store_unavailable');
    assert.equal(fs.readdirSync(dir).length, 1);
  });
});

test('failed bridge signatures cannot create a stored candidate', async () => {
  await temporaryStore(async (dir) => {
    const ingress = createRavenPhoneIngress({ secret: SECRET, stateDir: dir, now: () => new Date(NOW) });
    const source = signed();
    const response = makeResponse();
    await ingress.handle(makeRequest(source.raw, '0'.repeat(64)), response);
    assert.equal(response.status, 401);
    assert.equal(fs.readdirSync(dir).length, 0);
  });
});

test('relative state directory cannot be used as a private store', async () => {
  const ingress = createRavenPhoneIngress({ secret: SECRET, stateDir: './relative-private', now: () => new Date(NOW) });
  const res = await request(ingress, SOURCE);
  assert.equal(res.status, 503);
  assert.equal(res.payload.error, 'durable_review_store_unavailable');
});

test('unsupported method and oversized payload are rejected', async () => {
  await temporaryStore(async (dir) => {
    const ingress = createRavenPhoneIngress({ secret: SECRET, stateDir: dir, now: () => new Date(NOW) });
    const method = makeRequest('{}', 'a'.repeat(64));
    method.method = 'GET';
    const res1 = makeResponse();
    await ingress.handle(method, res1);
    assert.equal(res1.status, 405);
    const huge = makeRequest('x'.repeat(66000), 'b'.repeat(64));
    const res2 = makeResponse();
    await ingress.handle(huge, res2);
    assert.equal(res2.status, 413);
    assert.equal(fs.readdirSync(dir).length, 0);
  });
});
