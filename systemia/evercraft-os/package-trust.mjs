import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";

function clean(value) {
  return String(value ?? "").trim();
}

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

export function evercraftOsSha256(value) {
  return "sha256:" + createHash("sha256")
    .update(Buffer.isBuffer(value) ? value : typeof value === "string" ? value : canonicalBytes(value))
    .digest("hex");
}

function required(value, field) {
  const text = clean(value);
  if (!text) throw new Error(field + "_required");
  return text;
}

function packageFingerprint(value, field = "package_fingerprint") {
  const text = required(value, field);
  if (!/^sha256:[a-f0-9]{64}$/.test(text)) throw new Error(field + "_invalid");
  return text;
}

function iso(value, field) {
  const text = required(value, field);
  const time = Date.parse(text);
  if (!Number.isFinite(time)) throw new Error(field + "_invalid");
  return new Date(time).toISOString();
}

function safeKeyId(value) {
  const text = required(value, "key_id");
  if (!/^[a-zA-Z0-9._:-]{1,120}$/.test(text)) throw new Error("key_id_invalid");
  return text;
}

function safeProduct(value) {
  const text = required(value, "product_key");
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(text)) throw new Error("product_key_invalid");
  return text;
}

function safeNode(value) {
  const text = required(value, "node_id");
  if (!/^[a-zA-Z0-9._:-]{1,160}$/.test(text)) throw new Error("node_id_invalid");
  return text;
}

export function publisherPublicKeyFingerprint(publicKeyPem) {
  const key = createPublicKey(required(publicKeyPem, "public_key_pem"));
  if (key.asymmetricKeyType !== "ed25519") throw new Error("publisher_key_must_be_ed25519");
  return evercraftOsSha256(key.export({ type: "spki", format: "der" }));
}

export function buildPublisherTrustStore({ keys = [], generatedAt = new Date() } = {}) {
  if (!Array.isArray(keys) || keys.length === 0) throw new Error("publisher_trust_keys_required");
  const seen = new Set();
  const normalized = keys.map((row) => {
    const keyId = safeKeyId(row?.key_id);
    if (seen.has(keyId)) throw new Error("duplicate_publisher_key_id:" + keyId);
    seen.add(keyId);
    const publisherRef = required(row?.publisher_ref, "publisher_ref");
    const publicKeyPem = required(row?.public_key_pem, "public_key_pem");
    const fingerprint = publisherPublicKeyFingerprint(publicKeyPem);
    if (row?.public_key_fingerprint && row.public_key_fingerprint !== fingerprint) {
      throw new Error("publisher_key_fingerprint_mismatch:" + keyId);
    }
    const state = clean(row?.state || "active").toLowerCase();
    if (!["active", "revoked"].includes(state)) throw new Error("publisher_key_state_invalid:" + keyId);
    const allowedProducts = [...new Set((row?.allowed_products || []).map(safeProduct))].sort();
    if (allowedProducts.length === 0) throw new Error("publisher_key_products_required:" + keyId);
    const notBefore = row?.not_before ? iso(row.not_before, "not_before") : null;
    const notAfter = row?.not_after ? iso(row.not_after, "not_after") : null;
    if (notBefore && notAfter && Date.parse(notAfter) <= Date.parse(notBefore)) {
      throw new Error("publisher_key_window_invalid:" + keyId);
    }
    return {
      key_id: keyId,
      publisher_ref: publisherRef,
      public_key_pem: publicKeyPem,
      public_key_fingerprint: fingerprint,
      state,
      allowed_products: allowedProducts,
      not_before: notBefore,
      not_after: notAfter,
      revocation_receipt_ref: state === "revoked" ? required(row?.revocation_receipt_ref, "revocation_receipt_ref") : null,
    };
  });
  const body = {
    schema: "evercraft.os.publisher-trust-store.v1",
    generated_at: generatedAt instanceof Date ? generatedAt.toISOString() : iso(generatedAt, "generated_at"),
    keys: normalized,
    wildcard_product_trust_allowed: false,
    publisher_signature_grants_install_authority: false,
  };
  return { ...body, trust_store_hash: evercraftOsSha256(body) };
}

export function buildPackageAttestationBody({
  productKey,
  packageFingerprint: fingerprint,
  contractVersion,
  releaseRef,
  publisherRef,
  keyId,
  artifactHashes = [],
  issuedAt = new Date(),
  expiresAt,
} = {}) {
  const issued = issuedAt instanceof Date ? issuedAt.toISOString() : iso(issuedAt, "issued_at");
  const expires = expiresAt instanceof Date ? expiresAt.toISOString() : iso(expiresAt, "expires_at");
  if (Date.parse(expires) <= Date.parse(issued)) throw new Error("package_attestation_window_invalid");
  const artifacts = [...new Set((artifactHashes || []).map((value) => packageFingerprint(value, "artifact_hash")))].sort();
  return {
    schema: "evercraft.os.package-attestation.v1",
    product_key: safeProduct(productKey),
    package_fingerprint: packageFingerprint(fingerprint),
    contract_version: required(contractVersion, "contract_version"),
    release_ref: required(releaseRef, "release_ref"),
    publisher_ref: required(publisherRef, "publisher_ref"),
    key_id: safeKeyId(keyId),
    artifact_hashes: artifacts,
    issued_at: issued,
    expires_at: expires,
    authority: {
      provenance_attested: true,
      install_authority_granted: false,
      update_authority_granted: false,
      execution_authority_granted: false,
      payment_authority_granted: false,
    },
  };
}

export function signPackageAttestation({ body, privateKeyPem } = {}) {
  if (body?.schema !== "evercraft.os.package-attestation.v1") throw new Error("package_attestation_body_invalid");
  const key = createPrivateKey(required(privateKeyPem, "private_key_pem"));
  if (key.asymmetricKeyType !== "ed25519") throw new Error("publisher_private_key_must_be_ed25519");
  const signature = sign(null, canonicalBytes(body), key).toString("base64url");
  return {
    schema: "evercraft.os.signed-package-attestation.v1",
    body: structuredClone(body),
    signature_algorithm: "Ed25519",
    signature,
    signed_body_hash: evercraftOsSha256(body),
  };
}

function held(reason, detail = {}) {
  return {
    schema: "evercraft.os.package-verification.v1",
    state: "held",
    reason,
    ...detail,
    provenance_verified: false,
    install_authority_granted: false,
    update_authority_granted: false,
    execution_authority_granted: false,
    payment_authority_granted: false,
  };
}

export function verifyPackageAttestation({
  attestation,
  trustStore,
  expectedProductKey,
  expectedPackageFingerprint,
  expectedContractVersion = null,
  expectedReleaseRef = null,
  now = new Date(),
} = {}) {
  if (attestation?.schema !== "evercraft.os.signed-package-attestation.v1") return held("signed_attestation_schema_invalid");
  if (trustStore?.schema !== "evercraft.os.publisher-trust-store.v1") return held("publisher_trust_store_invalid");
  const { trust_store_hash: trustStoreHash, ...trustStoreBody } = trustStore;
  if (trustStoreHash !== evercraftOsSha256(trustStoreBody)) {
    return held("publisher_trust_store_hash_mismatch");
  }
  const body = attestation.body;
  if (body?.schema !== "evercraft.os.package-attestation.v1") return held("attestation_body_schema_invalid");
  if (attestation.signature_algorithm !== "Ed25519") return held("signature_algorithm_invalid");
  if (attestation.signed_body_hash !== evercraftOsSha256(body)) return held("signed_body_hash_mismatch");

  const product = safeProduct(expectedProductKey || body.product_key);
  if (body.product_key !== product) return held("product_key_mismatch");
  if (expectedPackageFingerprint && body.package_fingerprint !== packageFingerprint(expectedPackageFingerprint)) {
    return held("package_fingerprint_mismatch");
  }
  if (expectedContractVersion && body.contract_version !== expectedContractVersion) return held("contract_version_mismatch");
  if (expectedReleaseRef && body.release_ref !== expectedReleaseRef) return held("release_ref_mismatch");

  const key = (trustStore.keys || []).find((row) => row.key_id === body.key_id);
  if (!key) return held("publisher_key_not_trusted", { key_id: body.key_id });
  if (key.state !== "active") return held("publisher_key_revoked", { key_id: body.key_id, revocation_receipt_ref: key.revocation_receipt_ref || null });
  if (key.publisher_ref !== body.publisher_ref) return held("publisher_ref_mismatch", { key_id: body.key_id });
  if (!(key.allowed_products || []).includes(product)) return held("publisher_key_not_authorized_for_product", { key_id: body.key_id });

  const observedAt = now instanceof Date ? now.toISOString() : iso(now, "observed_at");
  const observed = Date.parse(observedAt);
  if (key.not_before && observed < Date.parse(key.not_before)) return held("publisher_key_not_yet_valid", { key_id: body.key_id });
  if (key.not_after && observed >= Date.parse(key.not_after)) return held("publisher_key_expired", { key_id: body.key_id });
  if (observed < Date.parse(body.issued_at)) return held("attestation_not_yet_valid");
  if (observed >= Date.parse(body.expires_at)) return held("attestation_expired");

  let signatureOk = false;
  try {
    const publicKey = createPublicKey(key.public_key_pem);
    signatureOk = verify(null, canonicalBytes(body), publicKey, Buffer.from(attestation.signature, "base64url"));
  } catch {
    signatureOk = false;
  }
  if (!signatureOk) return held("signature_invalid", { key_id: body.key_id });

  const receiptCore = {
    schema: "evercraft.os.package-verification-receipt.v1",
    state: "verified",
    product_key: body.product_key,
    package_fingerprint: body.package_fingerprint,
    contract_version: body.contract_version,
    release_ref: body.release_ref,
    publisher_ref: body.publisher_ref,
    key_id: body.key_id,
    public_key_fingerprint: key.public_key_fingerprint,
    signed_body_hash: attestation.signed_body_hash,
    trust_store_hash: trustStore.trust_store_hash,
    observed_at: observedAt,
    install_authority_granted: false,
    update_authority_granted: false,
    execution_authority_granted: false,
    payment_authority_granted: false,
  };
  const receipt = { ...receiptCore, receipt_hash: evercraftOsSha256(receiptCore) };
  return {
    schema: "evercraft.os.package-verification.v1",
    state: "verified",
    reason: null,
    provenance_verified: true,
    product_key: body.product_key,
    package_fingerprint: body.package_fingerprint,
    receipt,
    install_authority_granted: false,
    update_authority_granted: false,
    execution_authority_granted: false,
    payment_authority_granted: false,
  };
}

export function buildPackageUpdatePlan({
  productKey,
  nodeId,
  subjectRef,
  currentPackageFingerprint,
  nextVerification,
} = {}) {
  const product = safeProduct(productKey);
  const node = safeNode(nodeId);
  const subject = required(subjectRef, "subject_ref");
  const current = packageFingerprint(currentPackageFingerprint, "current_package_fingerprint");
  if (nextVerification?.schema !== "evercraft.os.package-verification.v1" || nextVerification.state !== "verified") {
    throw new Error("verified_next_package_required");
  }
  if (nextVerification.product_key !== product) throw new Error("update_product_mismatch");
  const next = packageFingerprint(nextVerification.package_fingerprint, "next_package_fingerprint");
  if (next === current) throw new Error("update_package_unchanged");
  const verificationReceiptHash = packageFingerprint(
    nextVerification.receipt?.receipt_hash,
    "verification_receipt_hash"
  );
  const body = {
    schema: "evercraft.os.package-update-plan.v1",
    operation: "update",
    product_key: product,
    node_id: node,
    subject_ref: subject,
    resource_ref: `os-app:${product}:node:${node}`,
    current_package_fingerprint: current,
    next_package_fingerprint: next,
    verification_receipt_hash: verificationReceiptHash,
    required_passport_scope: "app.update",
    rollback_pointer: {
      package_fingerprint: current,
      preserved_until_update_receipt: true,
    },
    mutation_performed: false,
    permit_minted: false,
    permit_consumed: false,
    update_authority_granted: false,
    execution_authority_granted: false,
  };
  return { ...body, request_fingerprint: evercraftOsSha256(body) };
}
