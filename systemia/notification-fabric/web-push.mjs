import crypto from 'node:crypto';

const b64url = (input) => Buffer.from(input).toString('base64url');
const unb64url = (input) => Buffer.from(String(input || ''), 'base64url');

function hkdfExtract(salt, ikm) {
  return crypto.createHmac('sha256', salt).update(ikm).digest();
}

function hkdfExpand(prk, info, length) {
  let output = Buffer.alloc(0);
  let previous = Buffer.alloc(0);
  let counter = 1;
  while (output.length < length) {
    previous = crypto
      .createHmac('sha256', prk)
      .update(Buffer.concat([previous, info, Buffer.from([counter])]))
      .digest();
    output = Buffer.concat([output, previous]);
    counter += 1;
  }
  return output.subarray(0, length);
}

function publicKeyParts(rawPublicKey) {
  if (rawPublicKey.length !== 65 || rawPublicKey[0] !== 0x04) {
    throw new Error('VAPID public key must be an uncompressed P-256 key.');
  }
  return {
    x: b64url(rawPublicKey.subarray(1, 33)),
    y: b64url(rawPublicKey.subarray(33, 65)),
  };
}

function privateKeyObject(publicKey, privateKey) {
  const rawPublic = unb64url(publicKey);
  const rawPrivate = unb64url(privateKey);
  if (rawPrivate.length !== 32) throw new Error('VAPID private key must be 32 bytes.');
  const { x, y } = publicKeyParts(rawPublic);
  return crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', x, y, d: b64url(rawPrivate) },
    format: 'jwk',
  });
}

function vapidJwt(endpoint, subject, publicKey, privateKey, now = Date.now()) {
  const audience = new URL(endpoint).origin;
  const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = b64url(JSON.stringify({
    aud: audience,
    exp: Math.floor(now / 1000) + 12 * 60 * 60,
    sub: subject,
  }));
  const unsigned = `${header}.${payload}`;
  const signature = crypto.sign('sha256', Buffer.from(unsigned), {
    key: privateKeyObject(publicKey, privateKey),
    dsaEncoding: 'ieee-p1363',
  });
  return `${unsigned}.${b64url(signature)}`;
}

export function generateVapidKeys() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwkPrivate = privateKey.export({ format: 'jwk' });
  const jwkPublic = publicKey.export({ format: 'jwk' });
  if (!jwkPrivate.d || !jwkPublic.x || !jwkPublic.y) throw new Error('Unable to export VAPID keys.');
  const rawPublic = Buffer.concat([
    Buffer.from([0x04]),
    unb64url(jwkPublic.x),
    unb64url(jwkPublic.y),
  ]);
  return {
    publicKey: b64url(rawPublic),
    privateKey: jwkPrivate.d,
  };
}

export function encryptWebPushPayload(subscription, payload) {
  const userPublic = unb64url(subscription?.keys?.p256dh);
  const authSecret = unb64url(subscription?.keys?.auth);
  if (userPublic.length !== 65 || userPublic[0] !== 0x04) {
    throw new Error('Subscription p256dh key must be an uncompressed P-256 key.');
  }
  if (!authSecret.length) throw new Error('Subscription auth secret is required.');

  const sender = crypto.createECDH('prime256v1');
  sender.generateKeys();
  const senderPublic = sender.getPublicKey();
  const sharedSecret = sender.computeSecret(userPublic);
  const salt = crypto.randomBytes(16);

  const authPrk = hkdfExtract(authSecret, sharedSecret);
  const keyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0', 'utf8'),
    userPublic,
    senderPublic,
  ]);
  const ikm = hkdfExpand(authPrk, keyInfo, 32);
  const prk = hkdfExtract(salt, ikm);
  const cek = hkdfExpand(prk, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16);
  const nonce = hkdfExpand(prk, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12);

  const plaintext = Buffer.concat([
    Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload), 'utf8'),
    Buffer.from([0x02]),
  ]);
  if (86 + plaintext.length + 16 > 4096) {
    throw new Error('Web Push payload exceeds the single-record 4096 byte body limit.');
  }
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);

  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096, 0);
  const body = Buffer.concat([
    salt,
    recordSize,
    Buffer.from([senderPublic.length]),
    senderPublic,
    ciphertext,
  ]);

  return body;
}

export function prepareWebPushRequest(subscription, payload, options = {}) {
  const endpoint = String(subscription?.endpoint || '').trim();
  if (!endpoint.startsWith('https://')) throw new Error('Push endpoint must use HTTPS.');
  const publicKey = String(options.vapidPublicKey || '').trim();
  const privateKey = String(options.vapidPrivateKey || '').trim();
  const subject = String(options.vapidSubject || '').trim();
  if (!publicKey || !privateKey || !subject) throw new Error('VAPID public key, private key, and subject are required.');
  if (!subject.startsWith('mailto:') && !subject.startsWith('https://')) {
    throw new Error('VAPID subject must be a mailto: or https:// URI.');
  }

  const token = vapidJwt(endpoint, subject, publicKey, privateKey, options.now);
  const topic = String(options.topic || '').trim();
  if (topic && !/^[A-Za-z0-9_-]{1,32}$/.test(topic)) {
    throw new Error('Web Push Topic must be 1-32 URL-safe base64 characters.');
  }
  const headers = {
    Authorization: `vapid t=${token}, k=${publicKey}`,
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    TTL: String(Math.max(0, Math.min(Number(options.ttlSeconds ?? 3600), 2419200))),
    Urgency: options.urgency || 'normal',
  };
  if (topic) headers.Topic = topic;
  return {
    endpoint,
    body: encryptWebPushPayload(subscription, payload),
    headers,
  };
}

export async function sendWebPush(subscription, payload, options = {}) {
  const request = prepareWebPushRequest(subscription, payload, options);
  const response = await fetch(request.endpoint, {
    method: 'POST',
    headers: request.headers,
    body: request.body,
    signal: options.signal,
  });
  const text = await response.text().catch(() => '');
  return {
    ok: response.ok,
    status: response.status,
    endpoint: request.endpoint,
    retryAfter: response.headers.get('retry-after'),
    responseBody: text.slice(0, 1000),
  };
}
