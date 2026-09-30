import fs from 'node:fs';
import path from 'node:path';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

function clean(value) {
  return String(value ?? '').trim();
}

function safeKey(value, field) {
  const key = clean(value);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(key)) throw new Error(`${field}_invalid`);
  return key;
}

function sha(value) {
  const input = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));
  return 'sha256:' + createHash('sha256').update(input).digest('hex');
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function normalizeMasterKey(input) {
  const key = Buffer.isBuffer(input) ? Buffer.from(input) : Buffer.from(clean(input), 'base64');
  if (key.length !== 32) throw new Error('secret_store_master_key_must_be_32_bytes');
  return key;
}

export class EvercraftSecretStore {
  constructor({ stateDir, masterKey } = {}) {
    if (!stateDir) throw new Error('secret_store_state_dir_required');
    this.stateDir = path.resolve(stateDir);
    this.masterKey = normalizeMasterKey(masterKey);
    this.entriesDir = path.join(this.stateDir, 'entries');
    this.receiptsFile = path.join(this.stateDir, 'receipts.jsonl');
  }

  #location(namespaceInput, nameInput) {
    const namespace = safeKey(namespaceInput, 'secret_namespace');
    const name = safeKey(nameInput, 'secret_name');
    const namespaceHash = createHash('sha256').update(namespace).digest('hex').slice(0, 32);
    const nameHash = createHash('sha256').update(name).digest('hex');
    return {
      namespace,
      name,
      file: path.join(this.entriesDir, namespaceHash, `${nameHash}.json`)
    };
  }

  #aad(namespace, name, version) {
    return Buffer.from(JSON.stringify({
      schema: 'evercraft.secret-store.aad.v1',
      namespace,
      name,
      version
    }));
  }

  #appendReceipt(body) {
    const receipt = { ...body, receipt_hash: sha(body) };
    fs.mkdirSync(this.stateDir, { recursive: true, mode: 0o700 });
    fs.appendFileSync(this.receiptsFile, JSON.stringify(receipt) + '\n', { mode: 0o600 });
    return receipt;
  }

  #readEnvelope(location) {
    if (!fs.existsSync(location.file)) throw new Error('secret_not_found');
    const envelope = JSON.parse(fs.readFileSync(location.file, 'utf8'));
    if (envelope?.schema !== 'evercraft.secret-store.envelope.v1') throw new Error('secret_envelope_schema_invalid');
    if (envelope.namespace_hash !== sha(location.namespace) || envelope.name_hash !== sha(location.name)) {
      throw new Error('secret_envelope_identity_mismatch');
    }
    return envelope;
  }

  setSecret(namespace, name, value, { metadata = {}, now = new Date() } = {}) {
    const location = this.#location(namespace, name);
    const plaintext = Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(String(value ?? ''), 'utf8');
    if (plaintext.length === 0) throw new Error('secret_value_required');
    if (plaintext.length > 1024 * 1024) throw new Error('secret_value_too_large');

    let version = 1;
    if (fs.existsSync(location.file)) {
      version = Number(this.#readEnvelope(location).version || 0) + 1;
    }

    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.masterKey, iv, { authTagLength: TAG_BYTES });
    const aad = this.#aad(location.namespace, location.name, version);
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    const at = new Date(now).toISOString();

    const envelope = {
      schema: 'evercraft.secret-store.envelope.v1',
      cipher: ALGORITHM,
      namespace_hash: sha(location.namespace),
      name_hash: sha(location.name),
      version,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {},
      created_at: at,
      plaintext_sha256: sha(plaintext)
    };
    atomicJson(location.file, envelope);

    const receipt = this.#appendReceipt({
      schema: 'evercraft.secret-store.mutation-receipt.v1',
      receipt_id: `secret_mutation_${randomUUID()}`,
      operation: 'set',
      namespace_hash: envelope.namespace_hash,
      name_hash: envelope.name_hash,
      version,
      plaintext_sha256: envelope.plaintext_sha256,
      ciphertext_sha256: sha(ciphertext),
      mutated_at: at,
      secret_value_emitted: false
    });
    return { version, receipt };
  }

  getSecret(namespace, name) {
    const location = this.#location(namespace, name);
    const envelope = this.#readEnvelope(location);
    const iv = Buffer.from(envelope.iv, 'base64');
    const tag = Buffer.from(envelope.tag, 'base64');
    const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
    const decipher = createDecipheriv(ALGORITHM, this.masterKey, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(this.#aad(location.namespace, location.name, envelope.version));
    decipher.setAuthTag(tag);
    let plaintext;
    try {
      plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
      throw new Error('secret_decryption_failed');
    }
    if (sha(plaintext) !== envelope.plaintext_sha256) throw new Error('secret_plaintext_hash_mismatch');
    return {
      value: plaintext,
      version: envelope.version,
      metadata: structuredClone(envelope.metadata || {}),
      plaintext_sha256: envelope.plaintext_sha256
    };
  }

  getSecretText(namespace, name) {
    return this.getSecret(namespace, name).value.toString('utf8');
  }

  metadata(namespace, name) {
    const location = this.#location(namespace, name);
    const envelope = this.#readEnvelope(location);
    return {
      schema: 'evercraft.secret-store.metadata.v1',
      namespace_hash: envelope.namespace_hash,
      name_hash: envelope.name_hash,
      version: envelope.version,
      metadata: structuredClone(envelope.metadata || {}),
      created_at: envelope.created_at,
      plaintext_sha256: envelope.plaintext_sha256,
      secret_value_emitted: false
    };
  }

  deleteSecret(namespace, name, { now = new Date() } = {}) {
    const location = this.#location(namespace, name);
    const envelope = this.#readEnvelope(location);
    fs.rmSync(location.file, { force: true });
    return this.#appendReceipt({
      schema: 'evercraft.secret-store.mutation-receipt.v1',
      receipt_id: `secret_mutation_${randomUUID()}`,
      operation: 'delete',
      namespace_hash: envelope.namespace_hash,
      name_hash: envelope.name_hash,
      version: envelope.version,
      mutated_at: new Date(now).toISOString(),
      secret_value_emitted: false
    });
  }

  health() {
    fs.mkdirSync(this.stateDir, { recursive: true, mode: 0o700 });
    const probe = path.join(this.stateDir, `.health-${process.pid}-${randomBytes(4).toString('hex')}`);
    fs.writeFileSync(probe, 'ok', { mode: 0o600 });
    fs.unlinkSync(probe);
    return {
      schema: 'evercraft.secret-store.health.v1',
      state: 'healthy',
      encryption: ALGORITHM,
      master_key_persisted_by_store: false,
      plaintext_in_receipts: false
    };
  }
}
