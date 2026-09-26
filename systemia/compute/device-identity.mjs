import fs from 'node:fs';
import path from 'node:path';
import {
  createHash,
  generateKeyPairSync,
  sign,
  verify,
} from 'node:crypto';

const sha = (value) => createHash('sha256').update(value).digest('hex');

function identityPaths(root) {
  const dir = path.join(path.resolve(root), '.identity');
  return {
    dir,
    privateKey: path.join(dir, 'ed25519-private.pem'),
    publicKey: path.join(dir, 'ed25519-public.pem'),
    metadata: path.join(dir, 'identity.json'),
  };
}

export function fingerprintPublicKey(publicKeyPem) {
  return `sha256:${sha(String(publicKeyPem))}`;
}

export function loadOrCreateDeviceIdentity({ root, nodeId } = {}) {
  if (!root) throw new Error('root is required');
  if (!nodeId) throw new Error('nodeId is required');
  const files = identityPaths(root);
  fs.mkdirSync(files.dir, { recursive: true, mode: 0o700 });

  if (!fs.existsSync(files.privateKey) || !fs.existsSync(files.publicKey)) {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
    fs.writeFileSync(files.privateKey, privatePem, { mode: 0o600 });
    fs.writeFileSync(files.publicKey, publicPem, { mode: 0o644 });
  }

  const privateKeyPem = fs.readFileSync(files.privateKey, 'utf8');
  const publicKeyPem = fs.readFileSync(files.publicKey, 'utf8');
  const fingerprint = fingerprintPublicKey(publicKeyPem);

  let metadata = null;
  if (fs.existsSync(files.metadata)) {
    metadata = JSON.parse(fs.readFileSync(files.metadata, 'utf8'));
    if (metadata.node_id !== nodeId) {
      throw new Error('device_identity_node_id_mismatch');
    }
    if (metadata.fingerprint !== fingerprint) {
      throw new Error('device_identity_fingerprint_mismatch');
    }
  } else {
    metadata = {
      schema: 'evercraft.compute.device-identity.v1',
      node_id: nodeId,
      fingerprint,
      created_at: new Date().toISOString(),
    };
    fs.writeFileSync(files.metadata, JSON.stringify(metadata, null, 2) + '\n', {
      mode: 0o600,
    });
  }

  return {
    ...metadata,
    public_key_pem: publicKeyPem,
    private_key_pem: privateKeyPem,
  };
}

export function createNodeAttestation({
  identity,
  nonce,
  runtime = 'Evercraft Compute',
  supportedWorkloads = [],
  placementLabels = [],
  observedAt = new Date(),
  processStartedAt,
  bootIdHash = null,
} = {}) {
  if (!identity?.private_key_pem || !identity?.public_key_pem) {
    throw new Error('device identity is required');
  }
  const nonceValue = String(nonce || '');
  if (!/^[A-Za-z0-9._:-]{16,256}$/.test(nonceValue)) {
    throw new Error('attestation nonce is invalid');
  }

  const statement = {
    schema: 'evercraft.compute.node-attestation.v1',
    node_id: identity.node_id,
    device_fingerprint: identity.fingerprint,
    nonce: nonceValue,
    runtime: String(runtime),
    supported_workloads_hash: `sha256:${sha(
      JSON.stringify([...supportedWorkloads].map(String).sort())
    )}`,
    placement_labels: [...new Set(
      [...placementLabels].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)
    )].sort(),
    process_started_at: String(processStartedAt || ''),
    boot_id_hash: bootIdHash ? String(bootIdHash) : null,
    observed_at: observedAt.toISOString(),
    field_claim: false,
  };
  const canonical = JSON.stringify(statement);
  const signature = sign(null, Buffer.from(canonical), identity.private_key_pem)
    .toString('base64');

  return {
    statement,
    public_key_pem: identity.public_key_pem,
    signature,
  };
}

export function verifyNodeAttestation({
  attestation,
  expectedNonce,
  expectedNodeId,
  maxAgeMs = 60_000,
  now = new Date(),
} = {}) {
  if (!attestation?.statement || !attestation?.public_key_pem || !attestation?.signature) {
    return { ok: false, reason: 'attestation_incomplete' };
  }

  const statement = attestation.statement;
  if (statement.schema !== 'evercraft.compute.node-attestation.v1') {
    return { ok: false, reason: 'attestation_schema_invalid' };
  }
  if (String(statement.nonce || '') !== String(expectedNonce || '')) {
    return { ok: false, reason: 'attestation_nonce_mismatch' };
  }
  if (expectedNodeId && String(statement.node_id || '') !== String(expectedNodeId)) {
    return { ok: false, reason: 'attestation_node_mismatch' };
  }
  if (statement.field_claim !== false) {
    return { ok: false, reason: 'node_may_not_self_claim_field_status' };
  }

  const fingerprint = fingerprintPublicKey(attestation.public_key_pem);
  if (fingerprint !== statement.device_fingerprint) {
    return { ok: false, reason: 'attestation_fingerprint_mismatch' };
  }

  const observed = Date.parse(statement.observed_at);
  if (!Number.isFinite(observed) || Math.abs(now.getTime() - observed) > maxAgeMs) {
    return { ok: false, reason: 'attestation_stale' };
  }

  const canonical = JSON.stringify(statement);
  const signatureOk = verify(
    null,
    Buffer.from(canonical),
    attestation.public_key_pem,
    Buffer.from(attestation.signature, 'base64')
  );
  if (!signatureOk) return { ok: false, reason: 'attestation_signature_invalid' };

  return {
    ok: true,
    node_id: statement.node_id,
    device_fingerprint: fingerprint,
    observed_at: statement.observed_at,
    boot_id_hash: statement.boot_id_hash,
    process_started_at: statement.process_started_at,
    placement_labels: Array.isArray(statement.placement_labels)
      ? statement.placement_labels.map(String)
      : [],
    field_claim: statement.field_claim,
  };
}
