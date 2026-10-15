import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { evercraftOsSha256, verifyPackageAttestation } from "./package-trust.mjs";
import { EvercraftOsPublisherTrustEpochStore } from "./publisher-trust-epoch.mjs";

function required(value, field) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(field + "_required");
  return text;
}

function safeProduct(value) {
  const text = required(value, "product_key");
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(text)) throw new Error("product_key_invalid");
  return text;
}

function digest(value, field = "sha256") {
  const text = required(value, field);
  if (!/^sha256:[a-f0-9]{64}$/.test(text)) throw new Error(field + "_invalid");
  return text;
}

function hashSuffix(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function lstatIfPresent(file) {
  try { return fs.lstatSync(file); }
  catch (error) { if (error?.code === "ENOENT") return null; throw error; }
}

function assertPlainFile(file, label) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    throw new Error(label + "_not_owned_regular_file");
  }
}

function assertPlainDirectory(dir, label) {
  const stat = fs.lstatSync(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(label + "_not_owned_directory");
  }
}

function fsyncDirectory(dir) {
  // Power-loss durability best effort on filesystems that support directory fsync.
  let fd;
  try { fd = fs.openSync(dir, "r"); fs.fsyncSync(fd); }
  catch { /* Platform/filesystem dependent. */ }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = file + "." + process.pid + "." + randomUUID() + ".tmp";
  const fd = fs.openSync(tmp, "wx", 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(value, null, 2) + "\n");
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
  fsyncDirectory(path.dirname(file));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function artifactBytes(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") return Buffer.from(value, "utf8");
  throw new Error("artifact_bytes_invalid");
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

export class EvercraftOsPackageStore {
  constructor({ rootDir, trustProvider } = {}) {
    if (!rootDir) throw new Error("package_store_root_required");
    if (!(trustProvider instanceof EvercraftOsPublisherTrustEpochStore)) {
      throw new Error("package_store_root_anchored_trust_provider_required");
    }
    this.rootDir = path.resolve(rootDir);
    this.trustProvider = trustProvider;
    this.packagesRoot = path.join(this.rootDir, "packages");
    this.activationsRoot = path.join(this.rootDir, "activations");
  }

  packagePath(productKey, packageFingerprint) {
    const product = safeProduct(productKey);
    const fingerprint = digest(packageFingerprint, "package_fingerprint");
    const target = path.resolve(this.packagesRoot, product, fingerprint.slice("sha256:".length));
    const productRoot = path.resolve(this.packagesRoot, product);
    if (!target.startsWith(productRoot + path.sep)) throw new Error("package_store_path_escape");
    return target;
  }

  activationPath(productKey, nodeId) {
    const product = safeProduct(productKey);
    const node = required(nodeId, "node_id");
    return path.resolve(this.activationsRoot, product + "--" + hashSuffix(node).slice(0, 24) + ".json");
  }

  stage({ attestation, artifacts = [], expectedContractVersion = null, expectedReleaseRef = null, now = new Date() } = {}) {
    if (attestation?.schema !== "evercraft.os.signed-package-attestation.v1") {
      throw new Error("package_store_signed_attestation_required");
    }
    const body = attestation.body;
    const product = safeProduct(body?.product_key);
    const packageFingerprint = digest(body?.package_fingerprint, "package_fingerprint");
    const trustState = this.trustProvider.current();
    if (trustState.state !== "verified" || !trustState.trust_store) {
      return {
        state: "held",
        reason: "publisher_trust_epoch_not_verified",
        trust_state: trustState,
        mutation_performed: false,
      };
    }
    const verification = verifyPackageAttestation({
      attestation,
      trustStore: trustState.trust_store,
      expectedProductKey: product,
      expectedPackageFingerprint: packageFingerprint,
      expectedContractVersion,
      expectedReleaseRef,
      now,
    });
    if (verification.state !== "verified") {
      return {
        state: "held",
        reason: verification.reason,
        verification,
        mutation_performed: false,
      };
    }
    const verificationReceipt = digest(verification.receipt?.receipt_hash, "verification_receipt_hash");
    const expectedHashes = sortedUnique((body.artifact_hashes || []).map((value) => digest(value, "artifact_hash")));
    const supplied = artifacts.map((row) => {
      const bytes = artifactBytes(row?.bytes);
      const computed = evercraftOsSha256(bytes);
      const declared = row?.sha256 ? digest(row.sha256, "artifact_hash") : computed;
      if (declared !== computed) throw new Error("artifact_declared_hash_mismatch");
      return { sha256: computed, bytes };
    });
    const suppliedHashes = sortedUnique(supplied.map((row) => row.sha256));
    if (JSON.stringify(suppliedHashes) !== JSON.stringify(expectedHashes)) {
      throw new Error("package_store_artifact_set_mismatch");
    }

    const target = this.packagePath(product, packageFingerprint);
    if (lstatIfPresent(target)) {
      const existing = this.inspect(product, packageFingerprint);
      if (existing.integrity !== "verified") throw new Error("package_store_existing_package_integrity_hold");
      return { state: "already_staged", mutation_performed: false, package: existing };
    }

    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    assertPlainDirectory(this.packagesRoot, "packages_root");
    assertPlainDirectory(path.dirname(target), "packages_product_root");
    const temp = target + ".stage-" + randomUUID();
    fs.mkdirSync(path.join(temp, "blobs"), { recursive: true, mode: 0o700 });
    try {
      for (const artifact of supplied) {
        const file = path.join(temp, "blobs", artifact.sha256.slice("sha256:".length) + ".blob");
        const fd = fs.openSync(file, "wx", 0o600);
        try { fs.writeFileSync(fd, artifact.bytes); fs.fsyncSync(fd); }
        finally { fs.closeSync(fd); }
      }
      const manifestBody = {
        schema: "evercraft.os.staged-package.v1",
        product_key: product,
        package_fingerprint: packageFingerprint,
        contract_version: required(body.contract_version, "contract_version"),
        release_ref: required(body.release_ref, "release_ref"),
        publisher_ref: required(body.publisher_ref, "publisher_ref"),
        key_id: required(body.key_id, "key_id"),
        signed_body_hash: digest(attestation.signed_body_hash, "signed_body_hash"),
        verification_receipt_hash: verificationReceipt,
        publisher_trust_epoch: trustState.epoch,
        publisher_trust_epoch_hash: trustState.epoch_hash,
        publisher_trust_store_hash: trustState.trust_store_hash,
        signed_attestation: structuredClone(attestation),
        artifact_hashes: expectedHashes,
        executable_bits_materialized: false,
        process_started: false,
        service_enabled: false,
        install_authority_granted: false,
        execution_authority_granted: false,
      };
      const manifest = { ...manifestBody, manifest_hash: evercraftOsSha256(manifestBody) };
      atomicJson(path.join(temp, "manifest.json"), manifest);
      fsyncDirectory(path.join(temp, "blobs"));
      fsyncDirectory(temp);
      fs.renameSync(temp, target);
      fsyncDirectory(path.dirname(target));
    } catch (error) {
      fs.rmSync(temp, { recursive: true, force: true });
      throw error;
    }

    const staged = this.inspect(product, packageFingerprint);
    return { state: "staged", mutation_performed: true, package: staged };
  }

  inspect(productKey, packageFingerprint) {
    const product = safeProduct(productKey);
    const fingerprint = digest(packageFingerprint, "package_fingerprint");
    const target = this.packagePath(product, fingerprint);
    const manifestFile = path.join(target, "manifest.json");
    if (!lstatIfPresent(target) && !lstatIfPresent(manifestFile)) {
      return {
        schema: "evercraft.os.staged-package-state.v1",
        product_key: product,
        package_fingerprint: fingerprint,
        materialized: false,
        integrity: "not_present",
      };
    }
    try {
      assertPlainDirectory(this.packagesRoot, "packages_root");
      assertPlainDirectory(path.dirname(target), "packages_product_root");
      assertPlainDirectory(target, "staged_package_root");
      assertPlainDirectory(path.join(target, "blobs"), "staged_package_blobs_root");
      assertPlainFile(manifestFile, "staged_package_manifest");
      const manifest = readJson(manifestFile);
      const { manifest_hash, ...body } = manifest;
      if (manifest_hash !== evercraftOsSha256(body)) throw new Error("staged_package_manifest_hash_mismatch");
      if (manifest.product_key !== product || manifest.package_fingerprint !== fingerprint) {
        throw new Error("staged_package_manifest_binding_mismatch");
      }
      const trustState = this.trustProvider.current();
      if (trustState.state !== "verified" || !trustState.trust_store) {
        throw new Error("publisher_trust_epoch_not_verified");
      }
      const currentVerification = verifyPackageAttestation({
        attestation: manifest.signed_attestation,
        trustStore: trustState.trust_store,
        expectedProductKey: product,
        expectedPackageFingerprint: fingerprint,
        expectedContractVersion: manifest.contract_version,
        expectedReleaseRef: manifest.release_ref,
        now: new Date(),
      });
      if (currentVerification.state !== "verified") {
        throw new Error("publisher_trust_reverification_hold:" + (currentVerification.reason || "unknown"));
      }
      for (const artifactHash of manifest.artifact_hashes || []) {
        const expected = digest(artifactHash, "artifact_hash");
        const file = path.join(target, "blobs", expected.slice("sha256:".length) + ".blob");
        if (!lstatIfPresent(file)) throw new Error("staged_package_blob_missing");
        assertPlainFile(file, "staged_package_blob");
        const actual = evercraftOsSha256(fs.readFileSync(file));
        if (actual !== expected) throw new Error("staged_package_blob_hash_mismatch");
      }
      return {
        schema: "evercraft.os.staged-package-state.v1",
        product_key: product,
        package_fingerprint: fingerprint,
        materialized: true,
        integrity: "verified",
        release_ref: manifest.release_ref,
        contract_version: manifest.contract_version,
        publisher_ref: manifest.publisher_ref,
        verification_receipt_hash: manifest.verification_receipt_hash,
        publisher_trust_epoch: trustState.epoch,
        publisher_trust_epoch_hash: trustState.epoch_hash,
        publisher_trust_store_hash: trustState.trust_store_hash,
        artifact_count: (manifest.artifact_hashes || []).length,
        path: target,
        executable_bits_materialized: false,
        process_started: false,
        service_enabled: false,
      };
    } catch (error) {
      return {
        schema: "evercraft.os.staged-package-state.v1",
        product_key: product,
        package_fingerprint: fingerprint,
        materialized: true,
        integrity: "held",
        reason: String(error?.message || error),
        path: target,
      };
    }
  }

  reconcileActivation({ productKey, nodeId, transitionLedger } = {}) {
    const product = safeProduct(productKey);
    const node = required(nodeId, "node_id");
    if (!transitionLedger) throw new Error("package_store_transition_ledger_required");
    const integrity = transitionLedger.verifyIntegrity();
    if (integrity.state !== "verified") {
      return { state: "held", reason: "transition_ledger_integrity_hold", integrity, mutation_performed: false };
    }
    const transition = transitionLedger.currentState(product, node);
    if (!transition.installed) return { state: "held", reason: "app_not_installed", mutation_performed: false };
    if (!transition.last_transition_receipt_hash) {
      return { state: "held", reason: "authorized_transition_required_for_activation", mutation_performed: false };
    }
    const staged = this.inspect(product, transition.package_fingerprint);
    if (staged.integrity !== "verified") {
      return { state: "held", reason: "target_package_not_verified_staged", package: staged, mutation_performed: false };
    }
    const file = this.activationPath(product, node);
    const body = {
      schema: "evercraft.os.package-activation.v1",
      product_key: product,
      node_id: node,
      package_fingerprint: transition.package_fingerprint,
      transition_receipt_hash: transition.last_transition_receipt_hash,
      staged_verification_receipt_hash: staged.verification_receipt_hash,
      activated_at: new Date().toISOString(),
      process_started: false,
      service_enabled: false,
      execution_authority_granted: false,
    };
    const pointer = { ...body, activation_hash: evercraftOsSha256(body) };
    // A path substitution must not be accepted as an ordinary activation pointer.
    if (lstatIfPresent(file)) assertPlainFile(file, "existing_activation_pointer");
    const existing = lstatIfPresent(file) ? readJson(file) : null;
    if (
      existing?.package_fingerprint === pointer.package_fingerprint &&
      existing?.transition_receipt_hash === pointer.transition_receipt_hash
    ) {
      const state = this.inspectActivation(product, node);
      if (state.integrity !== "verified") return { state: "held", reason: "existing_activation_integrity_hold", activation: state, mutation_performed: false };
      return { state: "already_active", activation: state, mutation_performed: false };
    }
    atomicJson(file, pointer);
    return { state: "activated_metadata", activation: this.inspectActivation(product, node), mutation_performed: true };
  }

  inspectActivation(productKey, nodeId) {
    const product = safeProduct(productKey);
    const node = required(nodeId, "node_id");
    const file = this.activationPath(product, node);
    if (!lstatIfPresent(file)) {
      return { schema: "evercraft.os.package-activation-state.v1", product_key: product, node_id: node, active: false, integrity: "not_present" };
    }
    try {
      assertPlainDirectory(this.activationsRoot, "activation_root");
      assertPlainFile(file, "activation_pointer");
      const activation = readJson(file);
      const { activation_hash, ...body } = activation;
      if (activation_hash !== evercraftOsSha256(body)) throw new Error("package_activation_hash_mismatch");
      if (activation.product_key !== product || activation.node_id !== node) throw new Error("package_activation_binding_mismatch");
      const staged = this.inspect(product, activation.package_fingerprint);
      if (staged.integrity !== "verified") throw new Error("active_package_integrity_hold:" + (staged.reason || staged.integrity));
      return {
        schema: "evercraft.os.package-activation-state.v1",
        product_key: product,
        node_id: node,
        active: true,
        integrity: "verified",
        package_fingerprint: activation.package_fingerprint,
        transition_receipt_hash: activation.transition_receipt_hash,
        activation_hash,
        process_started: false,
        service_enabled: false,
        execution_authority_granted: false,
      };
    } catch (error) {
      return {
        schema: "evercraft.os.package-activation-state.v1",
        product_key: product,
        node_id: node,
        active: true,
        integrity: "held",
        reason: String(error?.message || error),
      };
    }
  }
}
