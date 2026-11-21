/**
 * LAB ONLY: PQ sender authentication and replay gate for encrypted Evercraft envelopes.
 * No live Relay integration. Requires externally pinned sender public keys.
 * The replay store must be atomic and durable before a distributed rollout.
 */
import * as crypto from 'node:crypto';
import {encryptPqEnvelope, decryptPqEnvelope, pqRuntime} from './pq-envelope.mjs';

const SCHEMA = 'systemia.crypto.pq-signed-envelope.v1';
const SIGNATURE = 'ML-DSA-65';
const MAX_TTL_MS = 300_000;
const CLOCK_SKEW_MS = 30_000;
const DENIED = 'Signed PQ envelope rejected';

function reject() { throw new Error(DENIED); }

function signingKey(value, kind) {
  const k = value instanceof crypto.KeyObject
    ? value
    : kind === 'public' ? crypto.createPublicKey(value) : crypto.createPrivateKey(value);
  if (k.type !== kind || k.asymmetricKeyType !== 'ml-dsa-65') throw new TypeError('ML-DSA-65 signing key required');
  return k;
}

function keyId(publicKey) {
  return crypto.createHash('sha256')
    .update(publicKey.export({type:'spki',format:'der'})).digest('hex');
}

function senderId(value) {
  const s = String(value ?? '');
  if (!/^[a-z0-9][a-z0-9._:-]{0,127}$/.test(s)) throw new TypeError('Bound sender ID required');
  return s;
}

function decode(value, maxLength) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) reject();
  const data = Buffer.from(value, 'base64url');
  if (data.length > maxLength || data.toString('base64url') !== value) reject();
  return data;
}

function messageBytes(payload) {
  // Version-specific JSON field order is part of this lab's wire format.
  // Do not use as a cross-language canonical JSON protocol without standardization.
  return Buffer.from(JSON.stringify(payload), 'utf8');
}

export function pqSignedRuntime() {
  return Object.freeze({...pqRuntime(), signatureAlgorithm:SIGNATURE});
}

export function generatePqSigner() {
  const {publicKey,privateKey} = crypto.generateKeyPairSync('ml-dsa-65');
  return {publicKey,privateKey,senderKeyId:keyId(publicKey)};
}

export function signAndEncryptPqMessage({
  senderPrivateKey, sender, recipientPublicKey, plaintext, context,
  nowMs=Date.now(), ttlSeconds=300
}) {
  const key=signingKey(senderPrivateKey,'private');
  const id=senderId(sender);
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new RangeError('Invalid issuance time');
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 300) throw new RangeError('TTL must be 1-300 seconds');
  const payload={
    schema:SCHEMA,
    sender_id:id,
    sender_key_id:keyId(crypto.createPublicKey(key)),
    issued_at_ms:nowMs,
    expires_at_ms:nowMs+ttlSeconds*1000,
    nonce:crypto.randomBytes(24).toString('base64url'),
    envelope:encryptPqEnvelope({recipientPublicKey,plaintext,context})
  };
  const signature=crypto.sign(null,messageBytes(payload),key);
  return {payload,signature:signature.toString('base64url')};
}

/**
 * The trusted signer public key and expected sender identity come from the caller's
 * independent trust registry, not the envelope.
 * consume() MUST be an atomic insert-if-absent for the tuple returned here.
 */
function verifySignedPqEnvelope({
  signedMessage, senderPublicKey, expectedSender, recipientPrivateKey,
  expectedContext, nowMs=Date.now()
}) {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) reject();
  const k=signingKey(senderPublicKey,'public');
  const p=signedMessage?.payload;
  if (!p || Object.keys(p).sort().join(',') !==
    ['schema','sender_id','sender_key_id','issued_at_ms','expires_at_ms','nonce','envelope'].sort().join(',')) reject();
  if (p.schema !== SCHEMA || p.sender_id !== senderId(expectedSender) || p.sender_key_id !== keyId(k)) reject();
  if (!Number.isSafeInteger(p.issued_at_ms) || !Number.isSafeInteger(p.expires_at_ms)) reject();
  if (p.issued_at_ms > nowMs+CLOCK_SKEW_MS || p.expires_at_ms <= nowMs) reject();
  if (p.expires_at_ms <= p.issued_at_ms || p.expires_at_ms-p.issued_at_ms > MAX_TTL_MS) reject();
  if (decode(p.nonce,24).length !== 24) reject();
  const signature=decode(signedMessage.signature,4096);
  if (!crypto.verify(null,messageBytes(p),k,signature)) reject();

  // Never release plaintext until the replay admission commits successfully.
  const plaintext=decryptPqEnvelope({
    recipientPrivateKey,envelope:p.envelope,expectedContext
  });
  return {
    plaintext,senderId:p.sender_id,senderKeyId:p.sender_key_id,messageNonce:p.nonce,
    replayToken:{
      senderId:p.sender_id, senderKeyId:p.sender_key_id, context:expectedContext,
      nonce:p.nonce, expiresAtMs:p.expires_at_ms+CLOCK_SKEW_MS, nowMs
    }
  };
}

/** Synchronous replay guard: for local single-process and local SQLite labs only. */
export function openSignedPqMessage({
  signedMessage, senderPublicKey, expectedSender, recipientPrivateKey,
  expectedContext, replayGuard, nowMs=Date.now()
}) {
  if (!replayGuard || typeof replayGuard.consume !== 'function') reject();
  try {
    const verified=verifySignedPqEnvelope({
      signedMessage,senderPublicKey,expectedSender,recipientPrivateKey,expectedContext,nowMs
    });
    if (replayGuard.consume(verified.replayToken)!==true) reject();
    const {replayToken,...result}=verified;
    return result;
  } catch { reject(); }
}

/**
 * Async admission for a SHARED transactional replay backend.
 * An awaited, globally committed true is required before plaintext is returned.
 * Transport and trust registry remain external and disabled in the lab.
 */
export async function openSignedPqMessageAsync({
  signedMessage, senderPublicKey, expectedSender, recipientPrivateKey,
  expectedContext, replayGuard, nowMs=Date.now()
}) {
  if (!replayGuard || typeof replayGuard.consume !== 'function') reject();
  try {
    const verified=verifySignedPqEnvelope({
      signedMessage,senderPublicKey,expectedSender,recipientPrivateKey,expectedContext,nowMs
    });
    const admitted=await replayGuard.consume(verified.replayToken);
    if (admitted!==true) reject();
    const {replayToken,...result}=verified;
    return result;
  } catch { reject(); }
}

/** Ephemeral, single-process test helper. Not safe for production/multi-node use. */
export function createLabMemoryReplayGuard({maxEntries=10_000}={}) {
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 100_000)
    throw new RangeError('Invalid replay capacity');
  const seen=new Map();
  return Object.freeze({
    consume({senderId:sender, senderKeyId:signer, context, nonce, expiresAtMs, nowMs}) {
      if (!Number.isSafeInteger(expiresAtMs) || !Number.isSafeInteger(nowMs)) return false;
      for (const [key,expiry] of seen) if (expiry <= nowMs) seen.delete(key);
      const tuple=JSON.stringify([sender,signer,context,nonce]);
      if (seen.has(tuple) || seen.size >= maxEntries) return false;
      seen.set(tuple,expiresAtMs);
      return true;
    },
    size() { return seen.size; }
  });
}
