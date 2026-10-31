/**
 * Experimental Evercraft PQ envelope, isolated from live Relay routes.
 * Node >=24.7 with OpenSSL ML-KEM-768 required. No algorithm downgrade.
 * This provides recipient confidentiality/integrity, NOT sender authentication or replay protection.
 */
import * as crypto from 'node:crypto';

const SCHEMA = 'systemia.crypto.pq-envelope.v1';
const ALGORITHM = 'ML-KEM-768+HKDF-SHA256+AES-256-GCM';
const MAX_BODY = 16 * 1024 * 1024;
const MAX_CONTEXT = 128;
const fail = () => new Error('PQ envelope rejected');

function requirePq() {
  if (typeof crypto.encapsulate !== 'function' || typeof crypto.decapsulate !== 'function') {
    throw new Error('ML-KEM unavailable: Node >=24.7 with ML-KEM provider required; refusing downgrade');
  }
}
function keyObject(key, kind) {
  const result = kind === 'public' ? crypto.createPublicKey(key) : crypto.createPrivateKey(key);
  if (result.asymmetricKeyType !== 'ml-kem-768') throw new TypeError('ML-KEM-768 key required');
  return result;
}
function fingerprint(publicKey) {
  return crypto.createHash('sha256').update(publicKey.export({type:'spki',format:'der'})).digest('hex');
}
function bytes(text, length) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]+$/.test(text)) throw fail();
  const result = Buffer.from(text, 'base64url');
  if (result.toString('base64url') !== text || (length && result.length !== length)) throw fail();
  return result;
}
function contextValue(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > MAX_CONTEXT || !/^[a-z0-9._:\/-]+$/.test(value)) {
    throw new TypeError('Explicit ASCII route context (1-128 chars) required');
  }
  return value;
}
function headerBytes(header) { return Buffer.from(JSON.stringify(header), 'utf8'); }
function derivedKey(sharedKey, salt, header) {
  return Buffer.from(crypto.hkdfSync('sha256', sharedKey, salt, Buffer.concat([
    Buffer.from('evercraft/pq-envelope/v1\0'), headerBytes(header)
  ]), 32));
}
export function pqRuntime() {
  return Object.freeze({schema:SCHEMA, algorithm:ALGORITHM,
    available: typeof crypto.encapsulate === 'function' && typeof crypto.decapsulate === 'function',
    node:process.versions.node});
}
export function generatePqRecipient() {
  requirePq();
  const {publicKey, privateKey} = crypto.generateKeyPairSync('ml-kem-768');
  return {publicKey, privateKey, recipientKeyId:fingerprint(publicKey)};
}
export function encryptPqEnvelope({recipientPublicKey, plaintext, context}) {
  requirePq();
  const route = contextValue(context);
  const recipient = keyObject(recipientPublicKey, 'public');
  const body = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext ?? '');
  if (body.length > MAX_BODY) throw new RangeError('Envelope body exceeds 16 MiB');
  const {sharedKey, ciphertext:kemCiphertext} = crypto.encapsulate(recipient);
  const salt = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const header = {
    schema:SCHEMA, algorithm:ALGORITHM, context:route,
    recipient_key_id:fingerprint(recipient),
    kem_ciphertext:kemCiphertext.toString('base64url'),
    salt:salt.toString('base64url'), iv:iv.toString('base64url')
  };
  const key = derivedKey(sharedKey,salt,header);
  const cipher = crypto.createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(headerBytes(header));
  const encrypted = Buffer.concat([cipher.update(body),cipher.final()]);
  return {header, ciphertext:encrypted.toString('base64url'), tag:cipher.getAuthTag().toString('base64url')};
}
export function decryptPqEnvelope({recipientPrivateKey, envelope, expectedContext}) {
  requirePq();
  const route = contextValue(expectedContext);
  try {
    const privateKey = keyObject(recipientPrivateKey,'private');
    const h = envelope?.header;
    if (!h || h.schema !== SCHEMA || h.algorithm !== ALGORITHM || h.context !== route) throw fail();
    if (Object.keys(h).sort().join(',') !== ['schema','algorithm','context','recipient_key_id','kem_ciphertext','salt','iv'].sort().join(',')) throw fail();
    const derivedPublic = crypto.createPublicKey(privateKey);
    if (h.recipient_key_id !== fingerprint(derivedPublic)) throw fail();
    const kemCiphertext = bytes(h.kem_ciphertext);
    const salt = bytes(h.salt,32);
    const iv = bytes(h.iv,12);
    const tag = bytes(envelope.tag,16);
    const data = envelope.ciphertext === '' ? Buffer.alloc(0) : bytes(envelope.ciphertext);
    if (data.length > MAX_BODY) throw fail();
    const sharedKey = crypto.decapsulate(privateKey,kemCiphertext);
    const key = derivedKey(sharedKey,salt,h);
    const decipher = crypto.createDecipheriv('aes-256-gcm',key,iv);
    decipher.setAAD(headerBytes(h));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data),decipher.final()]);
  } catch {
    throw fail();
  }
}
