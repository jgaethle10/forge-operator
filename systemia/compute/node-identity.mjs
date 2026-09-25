import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(dir, 0o700); } catch {}
}

function atomicWrite(file, content, mode = 0o600) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, content, { mode });
  fs.renameSync(tmp, file);
  try { fs.chmodSync(file, mode); } catch {}
}

export function publicIdentityProjection(identity) {
  return {
    schema: 'evercraft.node.identity.v1',
    node_id: identity.node_id,
    algorithm: 'ed25519',
    public_key_spki_b64: identity.public_key_spki_b64,
    public_key_fingerprint_sha256: identity.public_key_fingerprint_sha256,
  };
}

export function ensureNodeIdentity({ root, nodeId } = {}) {
  if (!root) throw new Error('identity root is required');
  if (!nodeId) throw new Error('nodeId is required');

  const dir = path.join(path.resolve(root), '.identity');
  const privateFile = path.join(dir, 'node-ed25519-private.pem');
  const publicFile = path.join(dir, 'node-ed25519-public.spki.b64');
  const manifestFile = path.join(dir, 'node-identity.json');
  ensureDir(dir);

  if (!fs.existsSync(privateFile)) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const publicSpki = publicKey.export({ type: 'spki', format: 'der' });
    atomicWrite(privateFile, privatePem, 0o600);
    atomicWrite(publicFile, Buffer.from(publicSpki).toString('base64') + '\n', 0o600);
  }

  const privatePem = fs.readFileSync(privateFile, 'utf8');
  const privateKey = crypto.createPrivateKey(privatePem);
  const publicKey = crypto.createPublicKey(privateKey);
  const publicSpki = publicKey.export({ type: 'spki', format: 'der' });
  const publicB64 = Buffer.from(publicSpki).toString('base64');
  const fingerprint = sha256(publicSpki);

  const manifest = {
    schema: 'evercraft.node.identity.v1',
    node_id: String(nodeId),
    algorithm: 'ed25519',
    public_key_spki_b64: publicB64,
    public_key_fingerprint_sha256: fingerprint,
    private_key_location: 'local_only',
    created_or_loaded_at: new Date().toISOString(),
  };
  atomicWrite(manifestFile, JSON.stringify(manifest, null, 2) + '\n', 0o600);

  return {
    ...manifest,
    private_key_file: privateFile,
    public_key_file: publicFile,
    manifest_file: manifestFile,
    privateKey,
    publicKey,
  };
}

export function capacityBeaconMessage({
  node_id,
  endpoint,
  issued_at,
  expires_at,
  nonce,
  public_key_fingerprint_sha256,
}) {
  return [
    'evercraft.capacity.beacon.v2',
    String(node_id || ''),
    String(endpoint || ''),
    String(issued_at || ''),
    String(expires_at || ''),
    String(nonce || ''),
    String(public_key_fingerprint_sha256 || ''),
  ].join('\n');
}

export function signCapacityBeacon(identity, fields) {
  const message = capacityBeaconMessage({
    ...fields,
    public_key_fingerprint_sha256: identity.public_key_fingerprint_sha256,
  });
  return crypto.sign(null, Buffer.from(message), identity.privateKey).toString('base64url');
}

export function verifyCapacityBeaconIdentity(beacon, { now = Date.now(), maxFutureSkewMs = 60_000 } = {}) {
  if (beacon.schema !== 'evercraft.capacity.beacon.v2') throw new Error('signed beacon schema required');
  if (beacon.algorithm !== 'ed25519') throw new Error('unsupported beacon signature algorithm');
  const issued = Date.parse(String(beacon.issued_at || ''));
  const expires = Date.parse(String(beacon.expires_at || ''));
  if (!Number.isFinite(issued) || !Number.isFinite(expires)) throw new Error('invalid beacon time');
  if (issued > now + maxFutureSkewMs) throw new Error('beacon issued in future');
  if (expires < now) throw new Error('beacon expired');
  if (!String(beacon.nonce || '') || String(beacon.nonce).length < 16) throw new Error('invalid beacon nonce');

  const spki = Buffer.from(String(beacon.public_key_spki_b64 || ''), 'base64');
  if (!spki.length) throw new Error('public key missing');
  const fingerprint = sha256(spki);
  if (fingerprint !== String(beacon.public_key_fingerprint_sha256 || '')) {
    throw new Error('beacon fingerprint mismatch');
  }

  const publicKey = crypto.createPublicKey({ key: spki, type: 'spki', format: 'der' });
  const message = capacityBeaconMessage(beacon);
  const signature = Buffer.from(String(beacon.signature || ''), 'base64url');
  const verified = crypto.verify(null, Buffer.from(message), publicKey, signature);
  if (!verified) throw new Error('beacon signature invalid');

  return {
    ok: true,
    node_id: String(beacon.node_id || ''),
    public_key_fingerprint_sha256: fingerprint,
    identity_state: 'cryptographically_verified_self_identity',
    authority_state: 'not_granted_by_signature',
  };
}
