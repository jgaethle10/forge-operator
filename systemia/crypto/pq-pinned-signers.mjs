/**
 * LAB ONLY: immutable, expiring, externally provisioned sender-key pins.
 * This module DOES NOT enroll keys or authenticate the source of a snapshot.
 * A trusted Systemia approval/signing and distribution process must supply
 * snapshots, independently from the untrusted encrypted messages.
 */
import * as crypto from 'node:crypto';
import {openSignedPqMessageAsync} from './pq-signed-envelope.mjs';

const MAX_SNAPSHOT_MS=15*60*1000;
const FAIL='Pinned PQ sender rejected';

function senderId(value) {
  if (typeof value!=='string' || !/^[a-z0-9][a-z0-9._:-]{0,127}$/.test(value))
    throw new TypeError('Canonical sender ID required');
  return value;
}
function publicKey(value) {
  const key=value instanceof crypto.KeyObject?value:crypto.createPublicKey(value);
  if (key.type!=='public' || key.asymmetricKeyType!=='ml-dsa-65')
    throw new TypeError('ML-DSA-65 public key required');
  return key;
}
function fingerprint(key) {
  return crypto.createHash('sha256').update(key.export({type:'spki',format:'der'})).digest('hex');
}
function validTime(time) {
  return Number.isSafeInteger(time) && time>=0;
}

/**
 * Trusted source must create and distribute a fresh approved snapshot.
 * Retention of an OLD snapshot cannot prove that a key has not been revoked;
 * short expiry is intentional and causes a fail-closed outage unless renewed.
 */
export function createPinnedPqSignerRegistry({
  entries,snapshotValidFromMs,snapshotValidUntilMs
}={}) {
  if (!validTime(snapshotValidFromMs) || !validTime(snapshotValidUntilMs) ||
      snapshotValidUntilMs<=snapshotValidFromMs ||
      snapshotValidUntilMs-snapshotValidFromMs>MAX_SNAPSHOT_MS)
    throw new RangeError('A bounded 15-minute snapshot validity window is required');
  if (!Array.isArray(entries) || entries.length<1 || entries.length>10000)
    throw new TypeError('Nonempty bounded pinned signer entries required');
  const pins=new Map();
  for(const entry of entries) {
    const sender=senderId(entry?.sender);
    const key=publicKey(entry?.publicKey);
    const id=fingerprint(key);
    if (entry.keyId!==id) throw new Error('Pinned key fingerprint mismatch');
    if (!['active','revoked'].includes(entry.status)) throw new TypeError('Explicit signer status required');
    if (!validTime(entry.notBeforeMs) || !validTime(entry.notAfterMs) ||
        entry.notAfterMs<=entry.notBeforeMs)
      throw new RangeError('Explicit signer key validity window required');
    const composite=JSON.stringify([sender,id]);
    if (pins.has(composite)) throw new Error('Duplicate pinned signer entry');
    pins.set(composite,Object.freeze({
      sender,id,key,status:entry.status,
      notBeforeMs:entry.notBeforeMs,notAfterMs:entry.notAfterMs
    }));
  }
  return Object.freeze({
    schema:'systemia.crypto.pinned-signer-registry.lab.v1',
    count:pins.size,
    snapshotValidUntilMs,
    resolve({sender,keyId,nowMs=Date.now()}={}) {
      if (!validTime(nowMs) || nowMs<snapshotValidFromMs || nowMs>=snapshotValidUntilMs) return null;
      if (typeof keyId!=='string' || !/^[a-f0-9]{64}$/.test(keyId)) return null;
      let id;
      try {id=senderId(sender);} catch {return null;}
      const pin=pins.get(JSON.stringify([id,keyId]));
      return pin && pin.status==='active' &&
        nowMs>=pin.notBeforeMs && nowMs<pin.notAfterMs ? pin.key : null;
    }
  });
}

/** Resolve a pinned signer; never accept a public key carried by the message. */
export async function openPinnedPqMessageAsync({
  registry,signedMessage,expectedSender,
  recipientPrivateKey,expectedContext,replayGuard,nowMs=Date.now()
}={}) {
  try {
    if (!registry || typeof registry.resolve!=='function') throw new Error('No trust registry');
    const senderPublicKey=registry.resolve({
      sender:expectedSender,keyId:signedMessage?.payload?.sender_key_id,nowMs
    });
    if (!senderPublicKey) throw new Error('Signer not pinned or no longer trusted');
    return await openSignedPqMessageAsync({
      signedMessage,senderPublicKey,expectedSender,
      recipientPrivateKey,expectedContext,replayGuard,nowMs
    });
  } catch {throw new Error(FAIL);}
}
