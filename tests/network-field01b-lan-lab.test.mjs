import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FileCourier } from '../systemia/network/file-courier.mjs';
import { sealEnvelope } from '../systemia/network/secure-envelope.mjs';
import {
  checkField01BTarget,
  startField01BLanReceiver,
  enqueueField01BSynthetic,
  deliverField01BQueued
} from '../systemia/network/field01b-lan-lab.mjs';

const fresh = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-field01b-lan-test-'));
  const identity = node_id => {
    const keys = crypto.generateKeyPairSync('ed25519');
    return {
      node_id,
      public_key_pem: keys.publicKey.export({ format: 'pem', type: 'spki' }),
      private_key_pem: keys.privateKey.export({ format: 'pem', type: 'pkcs8' })
    };
  };
  return {
    root, sender: identity('sender-node001'), receiver: identity('receiver-node002'),
    third: identity('stranger-node003'),
    key: crypto.randomBytes(32),
    courierRoot: path.join(root, 'outbox'),
    stateDir: path.join(root, 'receiver-state'),
    clean: () => fs.rmSync(root, { recursive: true, force: true })
  };
};
const senderOptions = f => ({
  identity: f.sender, receiverNodeId: f.receiver.node_id,
  receiverPublicKeyPem: f.receiver.public_key_pem,
  labKey: f.key, courierRoot: f.courierRoot
});
const receiverOptions = f => ({
  identity: f.receiver, senderNodeId: f.sender.node_id,
  senderPublicKeyPem: f.sender.public_key_pem,
  labKey: f.key, stateDir: f.stateDir
});

test('never connects to public hosts or a private host without explicit consent', () => {
  assert.equal(checkField01BTarget('http://127.0.0.1:3030/'), 'http://127.0.0.1:3030');
  const rejected = [
    'https://192.168.1.6:8080/', 'http://8.8.8.8:53/',
    'http://localhost:3030/', 'http://example.com:3030/',
    'http://0.0.0.0:3030/', 'http://169.254.3.3:3030/',
    'http://[::1]:3030/', 'http://127.0.0.1:3030/private',
    'http://127.0.0.1:3030/?q=secret',
    'http://user:pass@127.0.0.1:3030/'
  ];
  for (const url of rejected) assert.throws(() => checkField01BTarget(url));
  assert.throws(() => checkField01BTarget('http://192.168.5.8:5555/'), /consent_required/);
  assert.equal(checkField01BTarget('http://192.168.5.8:5555/', {
    operatorConsent: true
  }), 'http://192.168.5.8:5555');
});

test('outage -> local encrypted queue -> authenticated HTTP recovery -> durable replay denial after restart', async () => {
  const f = fresh();
  let server = null;
  try {
    const queued = enqueueField01BSynthetic({
      ...senderOptions(f), challenge: 'a'.repeat(32)
    });
    assert.match(queued.message_id, /^field01b_[a-f0-9]{24}$/);
    const courier = new FileCourier({ root: f.courierRoot });
    const saved = courier.importEnvelopes()[0].envelope;
    assert.equal(courier.list().length, 1);
    const offline = await deliverField01BQueued({
      ...senderOptions(f), target: 'http://127.0.0.1:1'
    });
    assert.equal(offline.observations[0].status, 'RETRY_PENDING');
    assert.equal(offline.remaining_queued, 1);

    server = await startField01BLanReceiver(receiverOptions(f));
    assert.match(server.url, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal(server.synthetic_only, true);
    assert.equal(server.physical_field_verified, false);
    const accepted = await deliverField01BQueued({
      ...senderOptions(f), target: server.url
    });
    assert.equal(accepted.observations[0].status, 'DELIVERED');
    assert.match(accepted.observations[0].receipt_sha256, /^sha256:[a-f0-9]{64}$/);
    assert.equal(accepted.remaining_queued, 0);
    assert.equal(accepted.verified_physical_devices, false);
    assert.equal(accepted.verified_radio_link, false);
    assert.equal(accepted.verified_cellular_service, false);
    assert.equal(accepted.field01b_qualified, false);
    assert.equal(server.ledgerSummary().executed_count, 1);

    await server.stop();
    server = null;
    server = await startField01BLanReceiver(receiverOptions(f));
    assert.equal(server.ledgerSummary().executed_count, 1);
    courier.exportEnvelope(saved);
    const repeat = await deliverField01BQueued({
      ...senderOptions(f), target: server.url
    });
    assert.equal(repeat.observations[0].status, 'HELD_REPLAY');
    assert.equal(repeat.remaining_queued, 1);
    assert.equal(server.ledgerSummary().executed_count, 1);
  } finally { await server?.stop(); f.clean(); }
});

test('forged sender, wrong sender identity, corrupt ciphertext and bad JSON never commit delivery', async () => {
  const f = fresh();
  let server;
  try {
    server = await startField01BLanReceiver(receiverOptions(f));
    const envelope = sealEnvelope({
      key: f.key, key_id: 'field01b-lab', source: f.sender.node_id,
      destination: f.receiver.node_id, kind: 'network.field01b.synthetic',
      irreversible: false,
      message_id: 'field01b_' + crypto.randomBytes(12).toString('hex'),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      payload: { schema: 'evercraft.network.field01b.synthetic-payload.v1',
        challenge: 'b'.repeat(32) }
    });
    const signedBy = (e, key) => crypto.sign(null, Buffer.from(JSON.stringify(e)), key).toString('base64');
    const post = async body => fetch(server.url + '/v1/field01b/synthetic-deliver', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body)
    });
    const forged = await post({
      schema: 'evercraft.network.field01b.lab-delivery.v1',
      sender_id: f.sender.node_id, envelope,
      signature: signedBy(envelope, f.third.private_key_pem)
    });
    assert.equal(forged.status, 403);
    const wrongSender = await post({
      schema: 'evercraft.network.field01b.lab-delivery.v1',
      sender_id: f.third.node_id, envelope,
      signature: signedBy(envelope, f.sender.private_key_pem)
    });
    assert.equal(wrongSender.status, 403);
    const mutated = { ...envelope, ciphertext: (envelope.ciphertext[0] === 'A' ? 'B' : 'A') + envelope.ciphertext.slice(1) };
    const tampered = await post({
      schema: 'evercraft.network.field01b.lab-delivery.v1',
      sender_id: f.sender.node_id, envelope: mutated,
      signature: signedBy(mutated, f.sender.private_key_pem)
    });
    assert.equal(tampered.status, 422);
    assert.equal((await post('{bad json')).status, 422);
    assert.equal((await post('X'.repeat(20_000))).status, 413);
    assert.equal((await fetch(server.url + '/v1/not-a-route')).status, 404);
    assert.equal(server.ledgerSummary().executed_count, 0);
  } finally { await server?.stop(); f.clean(); }
});

test('valid signature and encryption with non-synthetic payload is rejected without replay commit', async () => {
  const f = fresh();
  let server;
  try {
    server = await startField01BLanReceiver(receiverOptions(f));
    const envelope = sealEnvelope({
      key: f.key, key_id: 'field01b-lab', source: f.sender.node_id,
      destination: f.receiver.node_id, kind: 'network.field01b.synthetic',
      irreversible: false,
      message_id: 'field01b_' + crypto.randomBytes(12).toString('hex'),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      payload: { schema: 'invalid.personal-or-business-message', challenge: 'c'.repeat(32) }
    });
    const signature = crypto.sign(null, Buffer.from(JSON.stringify(envelope)), f.sender.private_key_pem).toString('base64');
    const response = await fetch(server.url + '/v1/field01b/synthetic-deliver', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ schema: 'evercraft.network.field01b.lab-delivery.v1',
        sender_id: f.sender.node_id, envelope, signature })
    });
    assert.equal(response.status, 422);
    assert.equal(server.ledgerSummary().executed_count, 0);
  } finally { await server?.stop(); f.clean(); }
});

test('incorrect pinned receiver identity never clears local outbox', async () => {
  const f = fresh();
  let server;
  try {
    server = await startField01BLanReceiver(receiverOptions(f));
    enqueueField01BSynthetic(senderOptions(f));
    const wrongPeer = await deliverField01BQueued({
      ...senderOptions(f), receiverPublicKeyPem: f.third.public_key_pem,
      target: server.url
    });
    assert.equal(wrongPeer.observations[0].status, 'HELD_VALIDATION');
    assert.equal(wrongPeer.remaining_queued, 1);
    assert.equal(server.ledgerSummary().executed_count, 1);
    const corrected = await deliverField01BQueued({
      ...senderOptions(f), target: server.url
    });
    assert.equal(corrected.observations[0].status, 'HELD_REPLAY');
    assert.equal(corrected.remaining_queued, 1);
  } finally { await server?.stop(); f.clean(); }
});

test('persisted replay journal corruption fails closed at server startup', async () => {
  const f = fresh();
  let server;
  try {
    server = await startField01BLanReceiver(receiverOptions(f));
    enqueueField01BSynthetic(senderOptions(f));
    const good = await deliverField01BQueued({ ...senderOptions(f), target: server.url });
    assert.equal(good.observations[0].status, 'DELIVERED');
    await server.stop(); server = null;
    const file = path.join(f.stateDir, 'replay-ledger.jsonl');
    const data = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, data.replace('"message_id":"', '"message_id":"forged-'));
    await assert.rejects(() => startField01BLanReceiver(receiverOptions(f)), /hash_mismatch/);
  } finally { await server?.stop(); f.clean(); }
});

test('denies missing keys, public interface binding and scope confusion', async () => {
  const f = fresh();
  try {
    await assert.rejects(() => startField01BLanReceiver({
      ...receiverOptions(f), bindAddress: '0.0.0.0', operatorConsent: true
    }), /private_ipv4/);
    await assert.rejects(() => startField01BLanReceiver({
      ...receiverOptions(f), bindAddress: '192.168.100.77', operatorConsent: true
    }), /not_assigned/);
    await assert.rejects(() => startField01BLanReceiver({
      ...receiverOptions(f), labKey: Buffer.from('weak')
    }), /32_byte/);
    assert.throws(() => enqueueField01BSynthetic({
      ...senderOptions(f), challenge: 'hello'
    }), /scope_invalid/);
    assert.throws(() => enqueueField01BSynthetic({
      ...senderOptions(f), receiverNodeId: f.sender.node_id
    }), /scope_invalid/);
  } finally { f.clean(); }
});
