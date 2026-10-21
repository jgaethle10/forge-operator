import fs from "node:fs";
import path from "node:path";
import { createPrivateKey, createPublicKey, randomUUID, sign, verify } from "node:crypto";
import { evercraftOsSha256, publisherPublicKeyFingerprint } from "./package-trust.mjs";
import { EvercraftOsPublisherRootRegistry } from "./publisher-root-registry.mjs";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function canonicalBytes(value) {
  return Buffer.from(JSON.stringify(canonical(value)), "utf8");
}

function required(value, field) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(field + "_required");
  return text;
}

function keyId(value) {
  const text = required(value, "root_key_id");
  if (!/^[a-zA-Z0-9._:-]{1,120}$/.test(text)) throw new Error("root_key_id_invalid");
  return text;
}

function epochNumber(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new Error("publisher_trust_epoch_invalid");
  return number;
}

function iso(value, field) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(field + "_invalid");
  return date.toISOString();
}

function normalizeRootKeys(keys) {
  if (!Array.isArray(keys) || keys.length === 0) throw new Error("publisher_trust_pinned_root_keys_required");
  const seen = new Set();
  return keys.map((row) => {
    const id = keyId(row?.key_id);
    if (seen.has(id)) throw new Error("duplicate_publisher_root_key_id:" + id);
    seen.add(id);
    const publicKeyPem = required(row?.public_key_pem, "root_public_key_pem");
    const key = createPublicKey(publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") throw new Error("publisher_root_key_must_be_ed25519");
    const fingerprint = publisherPublicKeyFingerprint(publicKeyPem);
    if (row?.public_key_fingerprint && row.public_key_fingerprint !== fingerprint) {
      throw new Error("publisher_root_key_fingerprint_mismatch:" + id);
    }
    return {
      key_id: id,
      public_key_pem: publicKeyPem,
      public_key_fingerprint: fingerprint,
    };
  });
}

function verifyTrustStoreIntegrity(trustStore) {
  if (trustStore?.schema !== "evercraft.os.publisher-trust-store.v1") {
    throw new Error("publisher_trust_store_invalid");
  }
  const { trust_store_hash, ...body } = trustStore;
  if (trust_store_hash !== evercraftOsSha256(body)) {
    throw new Error("publisher_trust_store_hash_mismatch");
  }
  return trustStore;
}

function appendJsonl(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const fd = fs.openSync(file, "a", 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(value) + "\n");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  const fd = fs.openSync(tmp, "wx", 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(value, null, 2) + "\n");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map(JSON.parse);
}

export function buildPublisherTrustEpochBody({
  epoch,
  previousEpochHash = null,
  trustStore,
  rootKeyId,
  issuedAt = new Date(),
} = {}) {
  const store = verifyTrustStoreIntegrity(trustStore);
  const number = epochNumber(epoch);
  if (number === 1 && previousEpochHash !== null) throw new Error("publisher_trust_epoch_one_previous_hash_forbidden");
  if (number > 1 && !/^sha256:[a-f0-9]{64}$/.test(String(previousEpochHash || ""))) {
    throw new Error("publisher_trust_previous_epoch_hash_required");
  }
  return {
    schema: "evercraft.os.publisher-trust-epoch.v1",
    epoch: number,
    previous_epoch_hash: previousEpochHash,
    root_key_id: keyId(rootKeyId),
    trust_store_hash: store.trust_store_hash,
    trust_store: structuredClone(store),
    issued_at: iso(issuedAt, "issued_at"),
    authority: {
      publisher_provenance_only: true,
      install_authority_granted: false,
      update_authority_granted: false,
      execution_authority_granted: false,
      payment_authority_granted: false,
    },
  };
}

export function signPublisherTrustEpoch({ body, privateKeyPem } = {}) {
  if (body?.schema !== "evercraft.os.publisher-trust-epoch.v1") throw new Error("publisher_trust_epoch_body_invalid");
  const key = createPrivateKey(required(privateKeyPem, "root_private_key_pem"));
  if (key.asymmetricKeyType !== "ed25519") throw new Error("publisher_root_private_key_must_be_ed25519");
  return {
    schema: "evercraft.os.signed-publisher-trust-epoch.v1",
    body: structuredClone(body),
    signature_algorithm: "Ed25519",
    signature: sign(null, canonicalBytes(body), key).toString("base64url"),
    signed_body_hash: evercraftOsSha256(body),
  };
}

export function verifyPublisherTrustEpoch({
  signedEpoch,
  pinnedRootKeys,
  expectedEpoch = null,
  expectedPreviousEpochHash = undefined,
} = {}) {
  try {
    if (signedEpoch?.schema !== "evercraft.os.signed-publisher-trust-epoch.v1") {
      throw new Error("signed_publisher_trust_epoch_schema_invalid");
    }
    const body = signedEpoch.body;
    if (body?.schema !== "evercraft.os.publisher-trust-epoch.v1") throw new Error("publisher_trust_epoch_body_invalid");
    if (signedEpoch.signature_algorithm !== "Ed25519") throw new Error("publisher_trust_epoch_signature_algorithm_invalid");
    if (signedEpoch.signed_body_hash !== evercraftOsSha256(body)) throw new Error("publisher_trust_epoch_signed_body_hash_mismatch");
    const roots = normalizeRootKeys(pinnedRootKeys);
    const root = roots.find((row) => row.key_id === body.root_key_id);
    if (!root) throw new Error("publisher_trust_epoch_root_not_pinned");
    verifyTrustStoreIntegrity(body.trust_store);
    if (body.trust_store_hash !== body.trust_store.trust_store_hash) throw new Error("publisher_trust_epoch_store_binding_mismatch");
    const epoch = epochNumber(body.epoch);
    if (expectedEpoch !== null && epoch !== expectedEpoch) throw new Error("publisher_trust_epoch_sequence_mismatch");
    if (expectedPreviousEpochHash !== undefined && body.previous_epoch_hash !== expectedPreviousEpochHash) {
      throw new Error("publisher_trust_epoch_previous_hash_mismatch");
    }
    const signatureOk = verify(
      null,
      canonicalBytes(body),
      createPublicKey(root.public_key_pem),
      Buffer.from(signedEpoch.signature, "base64url")
    );
    if (!signatureOk) throw new Error("publisher_trust_epoch_signature_invalid");
    const epochHash = evercraftOsSha256(body);
    return {
      schema: "evercraft.os.publisher-trust-epoch-verification.v1",
      state: "verified",
      epoch,
      epoch_hash: epochHash,
      previous_epoch_hash: body.previous_epoch_hash,
      root_key_id: body.root_key_id,
      root_key_fingerprint: root.public_key_fingerprint,
      trust_store: structuredClone(body.trust_store),
      trust_store_hash: body.trust_store_hash,
      install_authority_granted: false,
      update_authority_granted: false,
      execution_authority_granted: false,
      payment_authority_granted: false,
    };
  } catch (error) {
    return {
      schema: "evercraft.os.publisher-trust-epoch-verification.v1",
      state: "held",
      reason: String(error?.message || error),
      install_authority_granted: false,
      update_authority_granted: false,
      execution_authority_granted: false,
      payment_authority_granted: false,
    };
  }
}

export class EvercraftOsPublisherTrustEpochStore {
  constructor({ stateDir, pinnedRootKeys = null, rootRegistry = null } = {}) {
    if (!stateDir) throw new Error("publisher_trust_epoch_state_dir_required");
    this.stateDir = path.resolve(stateDir);
    if (rootRegistry !== null && !(rootRegistry instanceof EvercraftOsPublisherRootRegistry)) {
      throw new Error("publisher_trust_root_registry_invalid");
    }
    if (!rootRegistry && !pinnedRootKeys) throw new Error("publisher_trust_root_anchor_required");
    this.rootRegistry = rootRegistry;
    this.pinnedRootKeys = rootRegistry ? null : normalizeRootKeys(pinnedRootKeys);
    this.eventsFile = path.join(this.stateDir, "publisher-trust-epochs.jsonl");
    this.headFile = path.join(this.stateDir, "publisher-trust-head.json");
  }

  #currentRootContext() {
    if (this.rootRegistry) {
      const state = this.rootRegistry.current();
      return {
        verification_roots: state.all_root_keys,
        expected_root_key_id: state.current_signing_root_id,
        root_rotation_hash: state.latest_rotation_hash,
        root_registry_hash: state.root_registry_hash,
      };
    }
    return {
      verification_roots: this.pinnedRootKeys,
      expected_root_key_id: null,
      root_rotation_hash: null,
      root_registry_hash: null,
    };
  }

  #rootContextForRecord(record) {
    if (this.rootRegistry) {
      const state = this.rootRegistry.stateAtRotationHash(record.root_rotation_hash ?? null);
      if (record.root_registry_hash !== state.root_registry_hash) {
        throw new Error("publisher_trust_epoch_root_registry_hash_mismatch");
      }
      return {
        verification_roots: state.all_root_keys,
        expected_root_key_id: state.current_signing_root_id,
        root_rotation_hash: state.latest_rotation_hash,
        root_registry_hash: state.root_registry_hash,
      };
    }
    if ((record.root_rotation_hash ?? null) !== null || (record.root_registry_hash ?? null) !== null) {
      throw new Error("publisher_trust_epoch_unexpected_root_registry_binding");
    }
    return {
      verification_roots: this.pinnedRootKeys,
      expected_root_key_id: null,
      root_rotation_hash: null,
      root_registry_hash: null,
    };
  }

  #verifyRecords() {
    const records = readJsonl(this.eventsFile);
    let previousRecord = null;
    let previousEpochHash = null;
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      if (record?.schema !== "evercraft.os.publisher-trust-epoch-record.v1") {
        throw new Error("publisher_trust_epoch_record_schema_invalid:" + index);
      }
      const { record_hash, ...recordBody } = record;
      if (record_hash !== evercraftOsSha256(recordBody)) throw new Error("publisher_trust_epoch_record_hash_mismatch:" + index);
      if ((record.previous_record_hash || null) !== (previousRecord?.record_hash || null)) {
        throw new Error("publisher_trust_epoch_record_chain_mismatch:" + index);
      }
      const rootContext = this.#rootContextForRecord(record);
      if (rootContext.expected_root_key_id && record.signed_epoch?.body?.root_key_id !== rootContext.expected_root_key_id) {
        throw new Error("publisher_trust_epoch_root_not_current:" + index);
      }
      const verification = verifyPublisherTrustEpoch({
        signedEpoch: record.signed_epoch,
        pinnedRootKeys: rootContext.verification_roots,
        expectedEpoch: index + 1,
        expectedPreviousEpochHash: previousEpochHash,
      });
      if (verification.state !== "verified") throw new Error(verification.reason);
      if (record.epoch_hash !== verification.epoch_hash) throw new Error("publisher_trust_epoch_record_epoch_hash_mismatch:" + index);
      previousEpochHash = verification.epoch_hash;
      previousRecord = record;
    }

    let head = null;
    if (fs.existsSync(this.headFile)) {
      head = JSON.parse(fs.readFileSync(this.headFile, "utf8"));
      if (head?.schema !== "evercraft.os.publisher-trust-head.v1") throw new Error("publisher_trust_head_schema_invalid");
      const { head_hash, ...body } = head;
      if (head_hash !== evercraftOsSha256(body)) throw new Error("publisher_trust_head_hash_mismatch");
      if (head.epoch_count !== records.length) throw new Error("publisher_trust_head_count_mismatch");
      if (head.latest_epoch_hash !== previousEpochHash) throw new Error("publisher_trust_head_epoch_hash_mismatch");
      if (head.latest_record_hash !== (previousRecord?.record_hash || null)) throw new Error("publisher_trust_head_record_hash_mismatch");
    } else if (records.length > 0) {
      throw new Error("publisher_trust_head_missing");
    }
    return { records, head, latestEpochHash: previousEpochHash };
  }

  #writeHead(records) {
    const last = records.at(-1) || null;
    const body = {
      schema: "evercraft.os.publisher-trust-head.v1",
      epoch_count: records.length,
      latest_epoch_hash: last?.epoch_hash || null,
      latest_record_hash: last?.record_hash || null,
      updated_at: new Date().toISOString(),
    };
    atomicJson(this.headFile, { ...body, head_hash: evercraftOsSha256(body) });
  }

  accept(signedEpoch) {
    const current = this.#verifyRecords();
    const duplicate = current.records.find((row) => row.signed_epoch?.signed_body_hash === signedEpoch?.signed_body_hash);
    if (duplicate) {
      return {
        schema: "evercraft.os.publisher-trust-epoch-acceptance.v1",
        state: "duplicate",
        epoch: duplicate.epoch,
        epoch_hash: duplicate.epoch_hash,
        mutation_performed: false,
      };
    }
    const expectedEpoch = current.records.length + 1;
    const rootContext = this.#currentRootContext();
    if (rootContext.expected_root_key_id && signedEpoch?.body?.root_key_id !== rootContext.expected_root_key_id) {
      return {
        schema: "evercraft.os.publisher-trust-epoch-acceptance.v1",
        state: "held",
        reason: "publisher_trust_epoch_root_not_current",
        mutation_performed: false,
      };
    }
    const verification = verifyPublisherTrustEpoch({
      signedEpoch,
      pinnedRootKeys: rootContext.verification_roots,
      expectedEpoch,
      expectedPreviousEpochHash: current.latestEpochHash,
    });
    if (verification.state !== "verified") {
      return {
        schema: "evercraft.os.publisher-trust-epoch-acceptance.v1",
        state: "held",
        reason: verification.reason,
        mutation_performed: false,
      };
    }
    const body = {
      schema: "evercraft.os.publisher-trust-epoch-record.v1",
      epoch: verification.epoch,
      epoch_hash: verification.epoch_hash,
      previous_record_hash: current.records.at(-1)?.record_hash || null,
      root_rotation_hash: rootContext.root_rotation_hash,
      root_registry_hash: rootContext.root_registry_hash,
      signed_epoch: structuredClone(signedEpoch),
      accepted_at: new Date().toISOString(),
      mutation_performed: true,
      install_authority_granted: false,
      update_authority_granted: false,
    };
    const record = { ...body, record_hash: evercraftOsSha256(body) };
    appendJsonl(this.eventsFile, record);
    const next = [...current.records, record];
    this.#writeHead(next);
    return {
      schema: "evercraft.os.publisher-trust-epoch-acceptance.v1",
      state: "accepted",
      epoch: verification.epoch,
      epoch_hash: verification.epoch_hash,
      record_hash: record.record_hash,
      trust_store_hash: verification.trust_store_hash,
      mutation_performed: true,
      install_authority_granted: false,
      update_authority_granted: false,
    };
  }

  current() {
    const verified = this.#verifyRecords();
    const latest = verified.records.at(-1);
    if (!latest) {
      return {
        schema: "evercraft.os.publisher-trust-current.v1",
        state: "not_configured",
        trust_store: null,
        mutation_performed: false,
      };
    }
    const rootContext = this.#rootContextForRecord(latest);
    if (rootContext.expected_root_key_id && latest.signed_epoch?.body?.root_key_id !== rootContext.expected_root_key_id) {
      throw new Error("publisher_trust_current_root_not_authorized");
    }
    const epoch = verifyPublisherTrustEpoch({
      signedEpoch: latest.signed_epoch,
      pinnedRootKeys: rootContext.verification_roots,
      expectedEpoch: latest.epoch,
      expectedPreviousEpochHash: latest.signed_epoch.body.previous_epoch_hash,
    });
    if (epoch.state !== "verified") throw new Error("publisher_trust_current_verification_failed:" + epoch.reason);
    return {
      schema: "evercraft.os.publisher-trust-current.v1",
      state: "verified",
      epoch: epoch.epoch,
      epoch_hash: epoch.epoch_hash,
      root_key_id: epoch.root_key_id,
      root_key_fingerprint: epoch.root_key_fingerprint,
      trust_store: epoch.trust_store,
      trust_store_hash: epoch.trust_store_hash,
      mutation_performed: false,
      install_authority_granted: false,
      update_authority_granted: false,
    };
  }

  currentTrustStore() {
    const current = this.current();
    if (current.state !== "verified" || !current.trust_store) {
      throw new Error("publisher_trust_epoch_not_configured");
    }
    return current.trust_store;
  }

  verifyIntegrity() {
    try {
      const verified = this.#verifyRecords();
      return {
        schema: "evercraft.os.publisher-trust-integrity.v1",
        state: "verified",
        epoch_count: verified.records.length,
        latest_epoch_hash: verified.latestEpochHash,
        mutation_performed: false,
      };
    } catch (error) {
      return {
        schema: "evercraft.os.publisher-trust-integrity.v1",
        state: "held",
        reason: String(error?.message || error),
        mutation_performed: false,
      };
    }
  }
}
