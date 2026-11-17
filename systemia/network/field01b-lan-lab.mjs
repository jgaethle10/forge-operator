import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { FileCourier } from './file-courier.mjs';
import { DurableReplayLedger } from './durable-state.mjs';
import { openEnvelope, sealEnvelope } from './secure-envelope.mjs';
import { fingerprintPublicKey } from '../compute/device-identity.mjs';

// Only a synthetic, explicitly authorized transport lab. Not a carrier,
// production message service, emergency channel, or hardware attestation.
const REQUEST_SCHEMA = 'evercraft.network.field01b.lab-delivery.v1';
const ACK_SCHEMA = 'evercraft.network.field01b.lab-ack.v1';
const PAYLOAD_SCHEMA = 'evercraft.network.field01b.synthetic-payload.v1';
const ENDPOINT = '/v1/field01b/synthetic-deliver';
const MAX_BODY = 12 * 1024;
const MAX_AGE_MS = 2 * 60_000;
const MAX_TRIAL_MS = 10 * 60_000;
const sha = bytes => 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex');
const fail = reason => { throw new Error(reason); };
const plain = x => x && typeof x === 'object' && !Array.isArray(x);
const ownKeys = (o, expected) => plain(o) &&
  Object.keys(o).sort().join('|') === [...expected].sort().join('|');
const loopback = ip => ip === '127.0.0.1';
const privateIPv4 = ip => {
  if (net.isIP(ip) !== 4) return false;
  const x = ip.split('.').map(Number);
  return x[0] === 10 ||
    (x[0] === 172 && x[1] >= 16 && x[1] <= 31) ||
    (x[0] === 192 && x[1] === 168);
};
const identityValid = i => i && typeof i.node_id === 'string' &&
  /^[a-z][a-z0-9._:-]{2,79}$/.test(i.node_id) &&
  typeof i.public_key_pem === 'string' &&
  typeof i.private_key_pem === 'string';
const validKey = k => Buffer.isBuffer(k) && k.length === 32;
const validNonce = v => typeof v === 'string' && /^[a-f0-9]{32}$/.test(v);
const validId = v => typeof v === 'string' && /^field01b_[a-f0-9]{24}$/.test(v);
const validPem = s => {
  try {
    return typeof s === 'string' && crypto.createPublicKey(s).asymmetricKeyType === 'ed25519';
  } catch { return false; }
};
const signed = (object, privateKey) =>
  crypto.sign(null, Buffer.from(JSON.stringify(object)), privateKey).toString('base64');
const verified = (object, signature, publicKey) => {
  if (typeof signature !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(signature) ||
      signature.length > 256) return false;
  try { return crypto.verify(null, Buffer.from(JSON.stringify(object)), publicKey, Buffer.from(signature, 'base64')); }
  catch { return false; }
};

export function checkField01BTarget(target, { operatorConsent = false } = {}) {
  if (typeof target !== 'string' || target.length > 250) fail('field_target_invalid');
  let u;
  try { u = new URL(target); } catch { fail('field_target_invalid'); }
  if (u.protocol !== 'http:' || !u.port || u.username || u.password ||
      u.pathname !== '/' || u.search || u.hash ||
      !(loopback(u.hostname) || privateIPv4(u.hostname))) {
    fail('field_target_must_be_explicit_private_ipv4');
  }
  if (!loopback(u.hostname) && operatorConsent !== true) fail('field_operator_consent_required');
  return u.origin;
}

function checkBind(bindAddress, operatorConsent) {
  if (loopback(bindAddress)) return;
  if (!privateIPv4(bindAddress)) fail('field_bind_requires_assigned_private_ipv4');
  if (operatorConsent !== true) fail('field_operator_consent_required');
  const assigned = Object.values(os.networkInterfaces()).flatMap(rows => rows || [])
    .some(row => row.family === 'IPv4' && row.address === bindAddress && !row.internal);
  if (!assigned) fail('field_bind_ip_not_assigned_to_local_interface');
}

function ensurePrivateState(dir) {
  if (typeof dir !== 'string' || !path.isAbsolute(dir)) fail('field_state_root_must_be_absolute');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const st = fs.lstatSync(dir);
  if (!st.isDirectory() || st.isSymbolicLink() ||
      (st.mode & 0o077) !== 0 ||
      (typeof process.getuid === 'function' && st.uid !== process.getuid())) fail('field_state_root_not_private');
  const journal = path.join(dir, 'replay-ledger.jsonl');
  if (fs.existsSync(journal)) {
    const file = fs.lstatSync(journal);
    if (!file.isFile() || file.isSymbolicLink() || (file.mode & 0o077) !== 0 ||
        (typeof process.getuid === 'function' && file.uid !== process.getuid())) fail('field_journal_not_private');
  }
}

function assertLab(identity, peerPublicKeyPem, labKey) {
  if (!identityValid(identity)) fail('field_identity_required');
  if (!validPem(peerPublicKeyPem)) fail('field_pinned_ed25519_peer_required');
  if (!validKey(labKey)) fail('field_32_byte_lab_key_required');
  try {
    if (!verified({ probe: 'identity-pair' }, signed({ probe: 'identity-pair' }, identity.private_key_pem),
        identity.public_key_pem)) fail('field_identity_keypair_mismatch');
  } catch { fail('field_identity_keypair_invalid'); }
}

function writeJson(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'",
    'connection': 'close'
  });
  res.end(JSON.stringify(body));
}

async function boundedIncoming(req) {
  const chunks = [];
  let size = 0, overflow = false;
  for await (const data of req) {
    size += data.length;
    if (size > MAX_BODY) { overflow = true; continue; }
    chunks.push(data);
  }
  if (overflow) fail('request_too_large');
  let parsed;
  try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { fail('request_invalid_json'); }
  return parsed;
}

function validateEnvelope(envelope, senderNodeId, receiverNodeId, now) {
  if (!plain(envelope) || envelope.schema !== 'evercraft.secure-envelope.v1' ||
      envelope.source !== senderNodeId || envelope.destination !== receiverNodeId ||
      envelope.kind !== 'network.field01b.synthetic' || envelope.key_id !== 'field01b-lab' ||
      envelope.irreversible !== false || !validId(envelope.message_id)) fail('field_envelope_scope_invalid');
  const created = Date.parse(envelope.created_at);
  const expiry = Date.parse(envelope.expires_at);
  if (!Number.isFinite(created) || !Number.isFinite(expiry) ||
      created > now + 30_000 || created < now - MAX_AGE_MS ||
      expiry <= now || expiry > created + MAX_AGE_MS) fail('field_envelope_expired_or_future');
}

function validatePayload(payload) {
  if (!ownKeys(payload, ['schema', 'challenge']) ||
      payload.schema !== PAYLOAD_SCHEMA || !validNonce(payload.challenge)) fail('field_only_synthetic_challenges_allowed');
}

export async function startField01BLanReceiver({
  bindAddress = '127.0.0.1', port = 0, identity, senderPublicKeyPem,
  senderNodeId, labKey, stateDir, operatorConsent = false,
  trialMs = 120_000
} = {}) {
  checkBind(bindAddress, operatorConsent);
  assertLab(identity, senderPublicKeyPem, labKey);
  if (!/^[a-z][a-z0-9._:-]{2,79}$/.test(senderNodeId || '') ||
      senderNodeId === identity.node_id) fail('field_sender_identity_invalid');
  if (!Number.isInteger(port) || port < 0 || port > 65535) fail('field_port_invalid');
  if (!Number.isInteger(trialMs) || trialMs < 1000 || trialMs > MAX_TRIAL_MS) fail('field_trial_duration_invalid');
  ensurePrivateState(stateDir);
  const replay = new DurableReplayLedger({ root: stateDir });
  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      writeJson(res, 200, { schema: 'evercraft.network.field01b.lab-health.v1',
        state: 'synthetic_lab_only', physical_field_verified: false });
      return;
    }
    if (req.url !== ENDPOINT || req.method !== 'POST') {
      writeJson(res, 404, { status: 'NO_ROUTE' });
      return;
    }
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) {
      writeJson(res, 415, { status: 'UNSUPPORTED_CONTENT_TYPE' });
      return;
    }
    try {
      const request = await boundedIncoming(req);
      if (!ownKeys(request, ['schema', 'sender_id', 'envelope', 'signature']) ||
          request.schema !== REQUEST_SCHEMA || request.sender_id !== senderNodeId ||
          !verified(request.envelope, request.signature, senderPublicKeyPem)) {
        fail('field_sender_signature_invalid');
      }
      const envelope = request.envelope;
      validateEnvelope(envelope, senderNodeId, identity.node_id, Date.now());
      if (replay.hasExecuted(envelope.message_id)) fail('field_replay_detected');
      const opened = openEnvelope({ envelope, key: labKey, expected_destination: identity.node_id });
      validatePayload(opened.payload);
      const envelopeHash = sha(Buffer.from(JSON.stringify(envelope)));
      // Acknowledgement may only be emitted after a durable, fsynced replay commit.
      replay.markExecuted({
        message_id: envelope.message_id, mission_id: 'field01b-synthetic',
        kind: envelope.kind, irreversible: false, execution_receipt_hash: envelopeHash
      });
      const ack = {
        schema: ACK_SCHEMA, sender_id: senderNodeId, receiver_id: identity.node_id,
        message_id: envelope.message_id, envelope_sha256: envelopeHash,
        challenge_sha256: sha(Buffer.from(opened.payload.challenge)),
        received_at: new Date().toISOString(), ledger_head_hash: replay.summary().head_hash,
        physical_field_verified: false
      };
      writeJson(res, 200, { ack, signature: signed(ack, identity.private_key_pem) });
    } catch (e) {
      const reason = String(e?.message || '');
      const status = reason === 'request_too_large' ? 413 :
        reason === 'field_replay_detected' ? 409 :
        reason === 'field_sender_signature_invalid' ? 403 : 422;
      writeJson(res, status, { status: 'HELD', reason: reason.slice(0, 100) });
    }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 1000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, bindAddress, resolve);
  });
  const boundPort = server.address().port;
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    await new Promise(resolve => server.close(resolve));
  };
  const timer = setTimeout(() => { stop().catch(() => {}); }, trialMs);
  timer.unref();
  return {
    url: 'http://' + bindAddress + ':' + boundPort,
    receiver_fingerprint: fingerprintPublicKey(identity.public_key_pem),
    pinned_sender_fingerprint: fingerprintPublicKey(senderPublicKeyPem),
    synthetic_only: true, physical_field_verified: false,
    stop,
    ledgerSummary: () => replay.summary()
  };
}

export function enqueueField01BSynthetic({
  courierRoot, identity, receiverNodeId, labKey, challenge = crypto.randomBytes(16).toString('hex')
} = {}) {
  if (!identityValid(identity) || !/^[a-z][a-z0-9._:-]{2,79}$/.test(receiverNodeId || '') ||
      receiverNodeId === identity.node_id || !validKey(labKey) || !validNonce(challenge)) {
    fail('field_queue_scope_invalid');
  }
  ensurePrivateState(courierRoot);
  const envelope = sealEnvelope({
    key: labKey, key_id: 'field01b-lab', source: identity.node_id,
    destination: receiverNodeId, kind: 'network.field01b.synthetic',
    irreversible: false, message_id: 'field01b_' + crypto.randomBytes(12).toString('hex'),
    expires_at: new Date(Date.now() + MAX_AGE_MS).toISOString(),
    payload: { schema: PAYLOAD_SCHEMA, challenge }
  });
  const result = new FileCourier({ root: courierRoot }).exportEnvelope(envelope);
  return {
    schema: 'evercraft.network.field01b.lab-queued.v1',
    message_id: result.message_id, content_hash: result.content_hash,
    queued_locally: true, physical_field_verified: false
  };
}

async function readBoundedResponse(response) {
  if (!response.body) fail('field_ack_missing');
  const length = response.headers.get('content-length');
  if (length && Number(length) > MAX_BODY) fail('field_ack_too_large');
  const chunks = [];
  let count = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      count += value.byteLength;
      if (count > MAX_BODY) { await reader.cancel(); fail('field_ack_too_large'); }
      chunks.push(Buffer.from(value));
    }
  } finally { try { reader.releaseLock(); } catch {} }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { fail('field_ack_invalid_json'); }
}

export async function deliverField01BQueued({
  courierRoot, target, identity, receiverNodeId, receiverPublicKeyPem,
  labKey, operatorConsent = false, request = fetch
} = {}) {
  assertLab(identity, receiverPublicKeyPem, labKey);
  if (!/^[a-z][a-z0-9._:-]{2,79}$/.test(receiverNodeId || '') ||
      receiverNodeId === identity.node_id) fail('field_receiver_identity_invalid');
  ensurePrivateState(courierRoot);
  const origin = checkField01BTarget(target, { operatorConsent });
  const courier = new FileCourier({ root: courierRoot });
  const results = [];
  for (const entry of courier.importEnvelopes().slice(0, 20)) {
    const file = entry.file_name;
    if (entry.status !== 'READY') {
      results.push({ file, status: 'HELD_' + entry.status });
      continue;
    }
    const envelope = entry.envelope;
    try {
      validateEnvelope(envelope, identity.node_id, receiverNodeId, Date.now());
      const opened = openEnvelope({ envelope, key: labKey, expected_destination: receiverNodeId });
      validatePayload(opened.payload);
      const message = {
        schema: REQUEST_SCHEMA, sender_id: identity.node_id, envelope,
        signature: signed(envelope, identity.private_key_pem)
      };
      const start = Date.now();
      const response = await request(origin + ENDPOINT, {
        method: 'POST', redirect: 'manual', cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(message), signal: AbortSignal.timeout(5000)
      });
      const payload = await readBoundedResponse(response);
      if (response.status !== 200) {
        results.push({ file, status: response.status === 409 ? 'HELD_REPLAY' : 'RETRY_PENDING',
          response_status: response.status });
        continue;
      }
      if (!ownKeys(payload, ['ack', 'signature'])) fail('field_ack_schema_invalid');
      const ack = payload.ack;
      const arrivedAt = Date.parse(ack?.received_at);
      if (!ownKeys(ack, ['schema', 'sender_id', 'receiver_id', 'message_id',
        'envelope_sha256', 'challenge_sha256', 'received_at',
        'ledger_head_hash', 'physical_field_verified']) ||
        ack.schema !== ACK_SCHEMA || ack.sender_id !== identity.node_id ||
        ack.receiver_id !== receiverNodeId || ack.message_id !== envelope.message_id ||
        ack.envelope_sha256 !== sha(Buffer.from(JSON.stringify(envelope))) ||
        ack.challenge_sha256 !== sha(Buffer.from(opened.payload.challenge)) ||
        ack.physical_field_verified !== false ||
        !/^[a-f0-9]{64}$/.test(ack.ledger_head_hash) ||
        !Number.isFinite(arrivedAt) || Math.abs(Date.now() - arrivedAt) > 60_000 ||
        !verified(ack, payload.signature, receiverPublicKeyPem)) fail('field_ack_untrusted');
      const removed = courier.acknowledge(file);
      results.push({
        message_id: envelope.message_id, status: removed.removed ? 'DELIVERED' : 'HELD_ACK_FAILURE',
        round_trip_ms: Date.now() - start,
        receipt_sha256: sha(Buffer.from(JSON.stringify(ack))),
        pinned_receiver_fingerprint: fingerprintPublicKey(receiverPublicKeyPem),
        physical_field_verified: false
      });
    } catch (e) {
      const reason = String(e?.message || 'delivery_error');
      const state = /expired|scope|invalid|untrusted|replay|signature|challenge|ack_/.test(reason)
        ? 'HELD_VALIDATION' : 'RETRY_PENDING';
      results.push({ file, status: state, reason: reason.slice(0, 100) });
    }
  }
  return {
    schema: 'evercraft.network.field01b.lab-delivery-report.v1',
    observations: results, remaining_queued: courier.list().length,
    observed_synthetic_http_only: true, verified_physical_devices: false,
    verified_radio_link: false, verified_cellular_service: false,
    field01b_qualified: false
  };
}
