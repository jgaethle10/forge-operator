import fs from "node:fs";
import path from "node:path";
import { createPrivateKey, createPublicKey, randomUUID, sign, verify } from "node:crypto";
import { evercraftOsSha256, publisherPublicKeyFingerprint } from "./package-trust.mjs";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}
function canonicalBytes(value) { return Buffer.from(JSON.stringify(canonical(value)), "utf8"); }
function required(value, field) { const text = String(value ?? "").trim(); if (!text) throw new Error(field + "_required"); return text; }
function safeKeyId(value, field = "root_key_id") {
  const text = required(value, field);
  if (!/^[a-zA-Z0-9._:-]{1,120}$/.test(text)) throw new Error(field + "_invalid");
  return text;
}
function iso(value, field) { const d = value instanceof Date ? value : new Date(value); if (!Number.isFinite(d.getTime())) throw new Error(field + "_invalid"); return d.toISOString(); }
function rotationNumber(value) { const n = Number(value); if (!Number.isInteger(n) || n < 1) throw new Error("publisher_root_rotation_epoch_invalid"); return n; }
function normalizeRoot(row) {
  const id = safeKeyId(row?.key_id);
  const pem = required(row?.public_key_pem, "root_public_key_pem");
  const key = createPublicKey(pem);
  if (key.asymmetricKeyType !== "ed25519") throw new Error("publisher_root_key_must_be_ed25519");
  const fingerprint = publisherPublicKeyFingerprint(pem);
  if (row?.public_key_fingerprint && row.public_key_fingerprint !== fingerprint) throw new Error("publisher_root_key_fingerprint_mismatch:" + id);
  return { key_id: id, public_key_pem: pem, public_key_fingerprint: fingerprint };
}
function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  const fd = fs.openSync(tmp, "wx", 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(value, null, 2) + "\n"); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
}
function appendJsonl(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const fd = fs.openSync(file, "a", 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(value) + "\n"); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
}
function readJsonl(file) { if (!fs.existsSync(file)) return []; return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map(JSON.parse); }

export function buildPublisherRootRotationBody({
  rotationEpoch,
  previousRotationHash = null,
  fromRootKeyId,
  toRootKeyId,
  toPublicKeyPem,
  issuedAt = new Date(),
} = {}) {
  const epoch = rotationNumber(rotationEpoch);
  if (epoch === 1 && previousRotationHash !== null) throw new Error("publisher_root_rotation_one_previous_hash_forbidden");
  if (epoch > 1 && !/^sha256:[a-f0-9]{64}$/.test(String(previousRotationHash || ""))) {
    throw new Error("publisher_root_previous_rotation_hash_required");
  }
  const toRoot = normalizeRoot({ key_id: toRootKeyId, public_key_pem: toPublicKeyPem });
  const from = safeKeyId(fromRootKeyId, "from_root_key_id");
  if (from === toRoot.key_id) throw new Error("publisher_root_rotation_same_key_forbidden");
  return {
    schema: "evercraft.os.publisher-root-rotation.v1",
    rotation_epoch: epoch,
    previous_rotation_hash: previousRotationHash,
    from_root_key_id: from,
    to_root_key_id: toRoot.key_id,
    to_public_key_pem: toRoot.public_key_pem,
    to_public_key_fingerprint: toRoot.public_key_fingerprint,
    issued_at: iso(issuedAt, "issued_at"),
    authority: {
      trust_anchor_rotation_only: true,
      install_authority_granted: false,
      update_authority_granted: false,
      execution_authority_granted: false,
      payment_authority_granted: false,
    },
  };
}

export function signPublisherRootRotation({ body, fromPrivateKeyPem, toPrivateKeyPem } = {}) {
  if (body?.schema !== "evercraft.os.publisher-root-rotation.v1") throw new Error("publisher_root_rotation_body_invalid");
  const oldKey = createPrivateKey(required(fromPrivateKeyPem, "from_root_private_key_pem"));
  const newKey = createPrivateKey(required(toPrivateKeyPem, "to_root_private_key_pem"));
  if (oldKey.asymmetricKeyType !== "ed25519" || newKey.asymmetricKeyType !== "ed25519") throw new Error("publisher_root_rotation_keys_must_be_ed25519");
  const bytes = canonicalBytes(body);
  return {
    schema: "evercraft.os.signed-publisher-root-rotation.v1",
    body: structuredClone(body),
    signature_algorithm: "Ed25519",
    from_root_signature: sign(null, bytes, oldKey).toString("base64url"),
    to_root_possession_signature: sign(null, bytes, newKey).toString("base64url"),
    signed_body_hash: evercraftOsSha256(body),
  };
}

export function verifyPublisherRootRotation({ signedRotation, fromRoot } = {}) {
  try {
    if (signedRotation?.schema !== "evercraft.os.signed-publisher-root-rotation.v1") throw new Error("signed_publisher_root_rotation_schema_invalid");
    const body = signedRotation.body;
    if (body?.schema !== "evercraft.os.publisher-root-rotation.v1") throw new Error("publisher_root_rotation_body_invalid");
    if (signedRotation.signature_algorithm !== "Ed25519") throw new Error("publisher_root_rotation_signature_algorithm_invalid");
    if (signedRotation.signed_body_hash !== evercraftOsSha256(body)) throw new Error("publisher_root_rotation_signed_body_hash_mismatch");
    const from = normalizeRoot(fromRoot);
    if (from.key_id !== body.from_root_key_id) throw new Error("publisher_root_rotation_from_key_mismatch");
    const to = normalizeRoot({ key_id: body.to_root_key_id, public_key_pem: body.to_public_key_pem, public_key_fingerprint: body.to_public_key_fingerprint });
    const bytes = canonicalBytes(body);
    if (!verify(null, bytes, createPublicKey(from.public_key_pem), Buffer.from(signedRotation.from_root_signature, "base64url"))) {
      throw new Error("publisher_root_rotation_old_signature_invalid");
    }
    if (!verify(null, bytes, createPublicKey(to.public_key_pem), Buffer.from(signedRotation.to_root_possession_signature, "base64url"))) {
      throw new Error("publisher_root_rotation_new_possession_invalid");
    }
    return {
      schema: "evercraft.os.publisher-root-rotation-verification.v1",
      state: "verified",
      rotation_epoch: body.rotation_epoch,
      rotation_hash: evercraftOsSha256(body),
      previous_rotation_hash: body.previous_rotation_hash,
      from_root: from,
      to_root: to,
      install_authority_granted: false,
      update_authority_granted: false,
    };
  } catch (error) {
    return {
      schema: "evercraft.os.publisher-root-rotation-verification.v1",
      state: "held",
      reason: String(error?.message || error),
      install_authority_granted: false,
      update_authority_granted: false,
    };
  }
}

export class EvercraftOsPublisherRootRegistry {
  constructor({ stateDir, bootstrapRootKeys, bootstrapSigningRootId = null } = {}) {
    if (!stateDir) throw new Error("publisher_root_registry_state_dir_required");
    if (!Array.isArray(bootstrapRootKeys) || bootstrapRootKeys.length === 0) throw new Error("publisher_root_registry_bootstrap_keys_required");
    const normalized = bootstrapRootKeys.map(normalizeRoot);
    const ids = new Set(normalized.map((row) => row.key_id));
    if (ids.size !== normalized.length) throw new Error("duplicate_publisher_bootstrap_root_key_id");
    const signingId = bootstrapSigningRootId ? safeKeyId(bootstrapSigningRootId, "bootstrap_signing_root_id") : normalized[0].key_id;
    if (!ids.has(signingId)) throw new Error("bootstrap_signing_root_not_found");
    this.stateDir = path.resolve(stateDir);
    this.bootstrapRoots = normalized;
    this.bootstrapSigningRootId = signingId;
    this.eventsFile = path.join(this.stateDir, "publisher-root-rotations.jsonl");
    this.headFile = path.join(this.stateDir, "publisher-root-head.json");
  }

  #replay({ stopAtRotationHash = undefined } = {}) {
    const records = readJsonl(this.eventsFile);
    const roots = new Map(this.bootstrapRoots.map((row) => [row.key_id, row]));
    let currentSigningRootId = this.bootstrapSigningRootId;
    let previousRecord = null;
    let previousRotationHash = null;
    const applied = [];

    if (stopAtRotationHash === null) {
      return this.#stateFromReplay({ roots, currentSigningRootId, previousRotationHash, previousRecord, applied });
    }

    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      if (record?.schema !== "evercraft.os.publisher-root-rotation-record.v1") throw new Error("publisher_root_rotation_record_schema_invalid:" + index);
      const { record_hash, ...recordBody } = record;
      if (record_hash !== evercraftOsSha256(recordBody)) throw new Error("publisher_root_rotation_record_hash_mismatch:" + index);
      if ((record.previous_record_hash || null) !== (previousRecord?.record_hash || null)) throw new Error("publisher_root_rotation_record_chain_mismatch:" + index);
      const signed = record.signed_rotation;
      const body = signed?.body;
      if (body?.rotation_epoch !== index + 1) throw new Error("publisher_root_rotation_sequence_mismatch:" + index);
      if ((body.previous_rotation_hash || null) !== previousRotationHash) throw new Error("publisher_root_rotation_previous_hash_mismatch:" + index);
      if (body.from_root_key_id !== currentSigningRootId) throw new Error("publisher_root_rotation_from_not_current:" + index);
      const from = roots.get(currentSigningRootId);
      if (!from) throw new Error("publisher_root_rotation_from_root_missing:" + index);
      const verified = verifyPublisherRootRotation({ signedRotation: signed, fromRoot: from });
      if (verified.state !== "verified") throw new Error(verified.reason);
      if (record.rotation_hash !== verified.rotation_hash) throw new Error("publisher_root_rotation_record_rotation_hash_mismatch:" + index);
      if (roots.has(verified.to_root.key_id)) throw new Error("publisher_root_rotation_target_key_already_known:" + index);
      roots.set(verified.to_root.key_id, verified.to_root);
      currentSigningRootId = verified.to_root.key_id;
      previousRotationHash = verified.rotation_hash;
      previousRecord = record;
      applied.push(record);
      if (stopAtRotationHash !== undefined && stopAtRotationHash === previousRotationHash) {
        return this.#stateFromReplay({ roots, currentSigningRootId, previousRotationHash, previousRecord, applied });
      }
    }
    if (stopAtRotationHash !== undefined && stopAtRotationHash !== previousRotationHash) throw new Error("publisher_root_rotation_checkpoint_not_found");

    if (stopAtRotationHash === undefined) {
      let head = null;
      if (fs.existsSync(this.headFile)) {
        head = JSON.parse(fs.readFileSync(this.headFile, "utf8"));
        if (head?.schema !== "evercraft.os.publisher-root-head.v1") throw new Error("publisher_root_head_schema_invalid");
        const { head_hash, ...body } = head;
        if (head_hash !== evercraftOsSha256(body)) throw new Error("publisher_root_head_hash_mismatch");
        if (head.rotation_count !== records.length) throw new Error("publisher_root_head_count_mismatch");
        if (head.latest_rotation_hash !== previousRotationHash) throw new Error("publisher_root_head_rotation_hash_mismatch");
        if (head.latest_record_hash !== (previousRecord?.record_hash || null)) throw new Error("publisher_root_head_record_hash_mismatch");
      } else if (records.length > 0) {
        throw new Error("publisher_root_head_missing");
      }
    }
    return this.#stateFromReplay({ roots, currentSigningRootId, previousRotationHash, previousRecord, applied });
  }

  #stateFromReplay({ roots, currentSigningRootId, previousRotationHash, previousRecord, applied }) {
    const allRoots = [...roots.values()];
    const stateCore = {
      schema: "evercraft.os.publisher-root-registry-state.v1",
      current_signing_root_id: currentSigningRootId,
      all_root_keys: allRoots,
      latest_rotation_hash: previousRotationHash,
      latest_record_hash: previousRecord?.record_hash || null,
      rotation_count: applied.length,
    };
    return { ...stateCore, root_registry_hash: evercraftOsSha256(stateCore) };
  }

  #writeHead(records) {
    const last = records.at(-1) || null;
    const body = {
      schema: "evercraft.os.publisher-root-head.v1",
      rotation_count: records.length,
      latest_rotation_hash: last?.rotation_hash || null,
      latest_record_hash: last?.record_hash || null,
      updated_at: new Date().toISOString(),
    };
    atomicJson(this.headFile, { ...body, head_hash: evercraftOsSha256(body) });
  }

  current() { return this.#replay(); }
  stateAtRotationHash(rotationHash) { return this.#replay({ stopAtRotationHash: rotationHash ?? null }); }

  accept(signedRotation) {
    const current = this.#replay();
    const records = readJsonl(this.eventsFile);
    const body = signedRotation?.body;
    const duplicate = records.find((row) => row.signed_rotation?.signed_body_hash === signedRotation?.signed_body_hash);
    if (duplicate) return { schema: "evercraft.os.publisher-root-rotation-acceptance.v1", state: "duplicate", rotation_hash: duplicate.rotation_hash, mutation_performed: false };
    if (body?.rotation_epoch !== records.length + 1) return { schema: "evercraft.os.publisher-root-rotation-acceptance.v1", state: "held", reason: "publisher_root_rotation_sequence_mismatch", mutation_performed: false };
    if ((body.previous_rotation_hash || null) !== current.latest_rotation_hash) return { schema: "evercraft.os.publisher-root-rotation-acceptance.v1", state: "held", reason: "publisher_root_rotation_previous_hash_mismatch", mutation_performed: false };
    if (body.from_root_key_id !== current.current_signing_root_id) return { schema: "evercraft.os.publisher-root-rotation-acceptance.v1", state: "held", reason: "publisher_root_rotation_from_not_current", mutation_performed: false };
    if (current.all_root_keys.some((row) => row.key_id === body.to_root_key_id)) return { schema: "evercraft.os.publisher-root-rotation-acceptance.v1", state: "held", reason: "publisher_root_rotation_target_key_already_known", mutation_performed: false };
    const from = current.all_root_keys.find((row) => row.key_id === current.current_signing_root_id);
    const verified = verifyPublisherRootRotation({ signedRotation, fromRoot: from });
    if (verified.state !== "verified") return { schema: "evercraft.os.publisher-root-rotation-acceptance.v1", state: "held", reason: verified.reason, mutation_performed: false };
    const recordBody = {
      schema: "evercraft.os.publisher-root-rotation-record.v1",
      rotation_epoch: verified.rotation_epoch,
      rotation_hash: verified.rotation_hash,
      previous_record_hash: records.at(-1)?.record_hash || null,
      signed_rotation: structuredClone(signedRotation),
      accepted_at: new Date().toISOString(),
      install_authority_granted: false,
      update_authority_granted: false,
    };
    const record = { ...recordBody, record_hash: evercraftOsSha256(recordBody) };
    appendJsonl(this.eventsFile, record);
    this.#writeHead([...records, record]);
    const next = this.#replay();
    return {
      schema: "evercraft.os.publisher-root-rotation-acceptance.v1",
      state: "accepted",
      rotation_epoch: verified.rotation_epoch,
      rotation_hash: verified.rotation_hash,
      current_signing_root_id: next.current_signing_root_id,
      root_registry_hash: next.root_registry_hash,
      mutation_performed: true,
      install_authority_granted: false,
      update_authority_granted: false,
    };
  }

  verifyIntegrity() {
    try {
      const state = this.#replay();
      return { schema: "evercraft.os.publisher-root-registry-integrity.v1", state: "verified", rotation_count: state.rotation_count, current_signing_root_id: state.current_signing_root_id, root_registry_hash: state.root_registry_hash, mutation_performed: false };
    } catch (error) {
      return { schema: "evercraft.os.publisher-root-registry-integrity.v1", state: "held", reason: String(error?.message || error), mutation_performed: false };
    }
  }
}
