import crypto from 'node:crypto';
import dgram from 'node:dgram';
import { publicIdentityProjection, signCapacityBeacon, verifyCapacityBeaconIdentity } from './node-identity.mjs';

function normalizeEndpoint(value) {
  const url = new URL(String(value || ''));
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('endpoint must use http or https');
  if (url.username || url.password) throw new Error('endpoint must not contain credentials');
  if (url.search || url.hash) throw new Error('endpoint must not contain query or fragment');
  return url.toString().replace(/\/$/, '');
}

export function encodeCapacityBeacon({
  nodeId,
  endpoint,
  identity,
  issuedAt = new Date().toISOString(),
  expiresAt = new Date(Date.now() + 15_000).toISOString(),
  nonce = crypto.randomBytes(24).toString('hex'),
} = {}) {
  if (!nodeId) throw new Error('nodeId is required');
  if (!identity?.privateKey) throw new Error('NodeSeed identity is required for capacity beacons');
  const normalizedEndpoint = normalizeEndpoint(endpoint);
  const publicIdentity = publicIdentityProjection(identity);
  if (publicIdentity.node_id !== String(nodeId)) throw new Error('identity node id mismatch');

  const beacon = {
    schema: 'evercraft.capacity.beacon.v2',
    node_id: String(nodeId),
    endpoint: normalizedEndpoint,
    issued_at: String(issuedAt),
    expires_at: String(expiresAt),
    nonce: String(nonce),
    carries_credentials: false,
    algorithm: 'ed25519',
    public_key_spki_b64: publicIdentity.public_key_spki_b64,
    public_key_fingerprint_sha256: publicIdentity.public_key_fingerprint_sha256,
    signature: '',
  };
  beacon.signature = signCapacityBeacon(identity, beacon);
  return Buffer.from(JSON.stringify(beacon));
}

export function parseCapacityBeacon(input, { now = Date.now() } = {}) {
  const raw = Buffer.isBuffer(input) ? input.toString('utf8') : String(input || '');
  const value = JSON.parse(raw);
  if (value.schema !== 'evercraft.capacity.beacon.v2') throw new Error('signed beacon schema required');
  if (value.carries_credentials !== false) throw new Error('beacon must not carry credentials');
  const endpoint = normalizeEndpoint(value.endpoint);
  const identity = verifyCapacityBeaconIdentity(value, { now });
  return {
    schema: value.schema,
    node_id: String(value.node_id || ''),
    endpoint,
    issued_at: new Date(Date.parse(value.issued_at)).toISOString(),
    expires_at: new Date(Date.parse(value.expires_at)).toISOString(),
    nonce: String(value.nonce || ''),
    carries_credentials: false,
    algorithm: 'ed25519',
    public_key_spki_b64: String(value.public_key_spki_b64 || ''),
    public_key_fingerprint_sha256: identity.public_key_fingerprint_sha256,
    signature_verified: true,
    identity_state: identity.identity_state,
    authority_state: identity.authority_state,
  };
}

export async function startCapacityBeacon({
  nodeId,
  endpoint,
  identity,
  address = '239.42.24.42',
  port = 42424,
  intervalMs = 5_000,
} = {}) {
  const socket = dgram.createSocket('udp4');
  const sendNow = () => new Promise((resolve, reject) => {
    const payload = encodeCapacityBeacon({ nodeId, endpoint, identity });
    socket.send(payload, port, address, (error) => error ? reject(error) : resolve());
  });

  const timer = setInterval(() => sendNow().catch(() => {}), Math.max(100, intervalMs));
  timer.unref?.();
  await sendNow();

  return {
    schema: 'evercraft.capacity.beacon-service.v2',
    address,
    port,
    identity_fingerprint_sha256: identity.public_key_fingerprint_sha256,
    sendNow,
    close: async () => {
      clearInterval(timer);
      await new Promise((resolve) => socket.close(resolve));
    },
  };
}

export async function discoverCapacityBeacons({
  bindAddress = '0.0.0.0',
  multicastAddress = '239.42.24.42',
  port = 42424,
  timeoutMs = 1_000,
  joinMulticast = true,
} = {}) {
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  const found = new Map();
  const seenNonces = new Set();

  socket.on('message', (message) => {
    try {
      const beacon = parseCapacityBeacon(message);
      const replayKey = `${beacon.public_key_fingerprint_sha256}:${beacon.nonce}`;
      if (seenNonces.has(replayKey)) return;
      seenNonces.add(replayKey);
      if (Date.parse(beacon.expires_at) >= Date.now()) {
        found.set(beacon.endpoint, beacon);
      }
    } catch {}
  });

  await new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.bind(port, bindAddress, () => {
      try {
        if (joinMulticast) socket.addMembership(multicastAddress);
      } catch {}
      resolve();
    });
  });

  await new Promise((resolve) => setTimeout(resolve, Math.max(50, timeoutMs)));
  await new Promise((resolve) => socket.close(resolve));
  return [...found.values()];
}
