/**
 * LAB ONLY. Authenticated trust-snapshot verification with external ML-DSA-65
 * root pin and mandatory, persistent anti-rollback admission.
 * No root enrollment, network transport, privileged key distribution or
 * production switch-over is implemented here.
 */
import * as crypto from 'node:crypto';
import {createPinnedPqSignerRegistry} from './pq-pinned-signers.mjs';

const SCHEMA='systemia.crypto.signed-trust-snapshot.lab.v1';
const MAX_WINDOW_MS=15*60*1000;
const MAX_ENTRIES=256;
const MAX_BYTES=1024*1024;
const ERROR='PQ trust snapshot rejected';
const trustedImports=new WeakSet();
const fields=(v,keys)=>v && typeof v==='object' && !Array.isArray(v) &&
  Object.keys(v).sort().join('\0')===keys.slice().sort().join('\0');
const safeTime=v=>Number.isSafeInteger(v) && v>=0;
const authorityId=v=>typeof v==='string' && /^[a-z0-9][a-z0-9._:-]{0,127}$/.test(v);
const senderId=authorityId;
const keyHash=k=>crypto.createHash('sha256').update(k.export({type:'spki',format:'der'})).digest('hex');
const signatureKey=(source,type)=>{
  const key=source instanceof crypto.KeyObject?source:
    type==='public'?crypto.createPublicKey(source):crypto.createPrivateKey(source);
  if (key.type!==type || key.asymmetricKeyType!=='ml-dsa-65')
    throw new TypeError('Externally provisioned ML-DSA-65 '+type+' root key required');
  return key;
};
const signerPublicKey=v=>{
  if (typeof v!=='string' || v.length>10000 || v.length<100)
    throw new TypeError('PEM sender public key required');
  const key=crypto.createPublicKey(v);
  if (key.type!=='public' || key.asymmetricKeyType!=='ml-dsa-65')
    throw new TypeError('ML-DSA-65 sender public key required');
  return key;
};
function canonical(value) {
  if (value===null || typeof value==='boolean' || typeof value==='string') return JSON.stringify(value);
  if (typeof value==='number' && Number.isSafeInteger(value)) return String(value);
  if (Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  if (value && typeof value==='object' &&
      (Object.getPrototypeOf(value)===Object.prototype || Object.getPrototypeOf(value)===null))
    return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  throw new TypeError('Unsupported trust snapshot value');
}
function assertPayload(p) {
  if (!fields(p,['schema','authority','revision','root_key_id','valid_from_ms','valid_until_ms','entries']))
    throw new TypeError('Unexpected trust snapshot fields');
  if (p.schema!==SCHEMA || !authorityId(p.authority) ||
      !Number.isSafeInteger(p.revision) || p.revision<1 ||
      !/^[a-f0-9]{64}$/.test(p.root_key_id||''))
    throw new TypeError('Invalid trust snapshot identity');
  if (!safeTime(p.valid_from_ms) || !safeTime(p.valid_until_ms) ||
      p.valid_until_ms<=p.valid_from_ms ||
      p.valid_until_ms-p.valid_from_ms>MAX_WINDOW_MS)
    throw new TypeError('Trust snapshot must expire within 15 minutes');
  if (!Array.isArray(p.entries) || !p.entries.length || p.entries.length>MAX_ENTRIES)
    throw new TypeError('Trust snapshot entry count invalid');
  const seen=new Set();
  for (const e of p.entries) {
    if (!fields(e,['sender','key_id','public_key_pem','status','not_before_ms','not_after_ms']) ||
        !senderId(e.sender) || !/^[a-f0-9]{64}$/.test(e.key_id||'') ||
        !['active','revoked'].includes(e.status) ||
        !safeTime(e.not_before_ms) || !safeTime(e.not_after_ms) ||
        e.not_after_ms<=e.not_before_ms)
      throw new TypeError('Invalid sender trust entry');
    if (keyHash(signerPublicKey(e.public_key_pem))!==e.key_id)
      throw new TypeError('Sender key fingerprint mismatch');
    const tuple=JSON.stringify([e.sender,e.key_id]);
    if (seen.has(tuple)) throw new TypeError('Duplicate signer pin');
    seen.add(tuple);
  }
  const bytes=Buffer.from(canonical(p),'utf8');
  if (bytes.length>MAX_BYTES) throw new RangeError('Trust snapshot oversized');
  return bytes;
}

/**
 * Offline/approved control-plane function. The root private key must not be
 * stored in source, browser code, GitHub Actions or live message workers.
 */
export function signPqTrustSnapshot({
  rootPrivateKey,authority,revision,validFromMs,validUntilMs,entries
}) {
  const key=signatureKey(rootPrivateKey,'private');
  const payload={
    schema:SCHEMA,authority,revision,
    root_key_id:keyHash(crypto.createPublicKey(key)),
    valid_from_ms:validFromMs,valid_until_ms:validUntilMs,
    entries:entries.map(e=>({
      sender:e.sender,key_id:e.keyId,public_key_pem:e.publicKeyPem,
      status:e.status,not_before_ms:e.notBeforeMs,not_after_ms:e.notAfterMs
    }))
  };
  const encoded=assertPayload(payload);
  return {payload,signature:crypto.sign(null,encoded,key).toString('base64url')};
}

/**
 * The root public key and expected authority must come from an OUT-OF-BAND
 * trusted pin. The revisionGuard must durably arbitrate accepted revisions
 * across EVERY node in this trust domain; absence or uncertainty denies.
 */
export async function importSignedPqTrustSnapshot({
  signedSnapshot,trustedRootPublicKey,expectedAuthority,revisionGuard,nowMs=Date.now()
}={}) {
  try {
    if (!revisionGuard || typeof revisionGuard.admit!=='function' || !safeTime(nowMs))
      throw new TypeError('Durable revision guard required');
    const key=signatureKey(trustedRootPublicKey,'public');
    const p=signedSnapshot?.payload;
    if (!fields(signedSnapshot,['payload','signature'])) throw new TypeError('Unexpected envelope fields');
    const encoded=assertPayload(p);
    if (p.authority!==expectedAuthority || p.root_key_id!==keyHash(key) ||
        nowMs<p.valid_from_ms || nowMs>=p.valid_until_ms)
      throw new Error('Wrong authority, root or snapshot validity');
    if (typeof signedSnapshot.signature!=='string' ||
        !/^[A-Za-z0-9_-]+$/.test(signedSnapshot.signature))
      throw new TypeError('Invalid signature encoding');
    const sig=Buffer.from(signedSnapshot.signature,'base64url');
    if (sig.toString('base64url')!==signedSnapshot.signature ||
        !crypto.verify(null,encoded,key,sig))
      throw new Error('Trust snapshot signature invalid');
    const registry=createPinnedPqSignerRegistry({
      entries:p.entries.map(e=>({
        sender:e.sender,keyId:e.key_id,publicKey:e.public_key_pem,
        status:e.status,notBeforeMs:e.not_before_ms,notAfterMs:e.not_after_ms
      })),
      snapshotValidFromMs:p.valid_from_ms,snapshotValidUntilMs:p.valid_until_ms
    });
    const digest=crypto.createHash('sha256').update(encoded).digest('hex');
    if (await revisionGuard.admit({authority:p.authority,revision:p.revision,digest})!==true)
      throw new Error('Snapshot rollback or revision conflict');
    const imported=Object.freeze({registry,authority:p.authority,revision:p.revision,digest,
      validFromMs:p.valid_from_ms,validUntilMs:p.valid_until_ms});
    trustedImports.add(imported);
    return imported;
  } catch {
    throw new Error(ERROR);
  }
}

/** Reject caller-constructed trust metadata that bypassed signature verification. */
export function isVerifiedPqTrustImport(value) {
  return value!==null && typeof value==='object' && trustedImports.has(value);
}
