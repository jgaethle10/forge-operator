import fs from "node:fs";
import path from "node:path";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;

function clean(value) {
  return String(value ?? "").trim();
}

function safeSegment(value, fallback = "default") {
  const segment = clean(value).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return segment || fallback;
}

function atomicWrite(file, value, mode = 0o600) {
  const tmp = file + ".tmp-" + randomBytes(6).toString("hex");
  fs.writeFileSync(tmp, value, { mode });
  fs.renameSync(tmp, file);
  fs.chmodSync(file, mode);
}

export class ProviderCredentialVault {
  constructor({ stateDir } = {}) {
    if (!stateDir) throw new Error("credential_state_dir_required");
    this.stateDir = path.resolve(stateDir);
    this.keyFile = path.join(this.stateDir, ".vault-key");
    fs.mkdirSync(this.stateDir, { recursive: true, mode: 0o700 });
    fs.chmodSync(this.stateDir, 0o700);
    if (!fs.existsSync(this.keyFile)) {
      atomicWrite(this.keyFile, randomBytes(KEY_BYTES), 0o600);
    }
    const key = fs.readFileSync(this.keyFile);
    if (key.length !== KEY_BYTES) throw new Error("credential_vault_key_invalid");
    this.key = key;
  }

  #recordFile(credentialRef) {
    return path.join(this.stateDir, safeSegment(credentialRef) + ".json");
  }

  #fingerprint(value) {
    return createHmac("sha256", this.key).update(String(value)).digest("hex").slice(0, 24);
  }

  put({ provider, environment = "live", label = "default", apiKeyId, apiSecret, actorRef = "unknown" } = {}) {
    const normalizedProvider = safeSegment(provider, "");
    const normalizedEnvironment = safeSegment(environment, "");
    const normalizedLabel = safeSegment(label);
    const keyId = clean(apiKeyId);
    const secret = clean(apiSecret);
    if (!normalizedProvider) throw new Error("credential_provider_required");
    if (!["live", "paper", "sandbox"].includes(normalizedEnvironment)) throw new Error("credential_environment_invalid");
    if (keyId.length < 8) throw new Error("credential_api_key_id_invalid");
    if (secret.length < 16) throw new Error("credential_api_secret_invalid");

    const identity = normalizedProvider + ":" + normalizedEnvironment + ":" + normalizedLabel;
    const credentialRef = "provider_" + normalizedProvider + "_" + normalizedEnvironment + "_" +
      createHash("sha256").update(identity).digest("hex").slice(0, 16);
    const aad = Buffer.from("evercraft.provider-credential.v1:" + credentialRef);
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    cipher.setAAD(aad);

    const plaintext = Buffer.from(JSON.stringify({ api_key_id: keyId, api_secret: secret }), "utf8");
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    plaintext.fill(0);

    const now = new Date().toISOString();
    const record = {
      schema: "evercraft.provider-credential-envelope.v1",
      credential_ref: credentialRef,
      provider: normalizedProvider,
      environment: normalizedEnvironment,
      label: normalizedLabel,
      status: "active",
      api_key_id_last4: keyId.slice(-4),
      credential_fingerprint: this.#fingerprint(keyId + ":" + secret),
      actor_ref: clean(actorRef) || "unknown",
      updated_at: now,
      encryption: {
        algorithm: ALGORITHM,
        iv: iv.toString("base64"),
        tag: tag.toString("base64"),
        ciphertext: ciphertext.toString("base64"),
        aad: aad.toString("base64"),
      },
      secret_material_stored: true,
      plaintext_persisted: false,
    };

    atomicWrite(this.#recordFile(credentialRef), JSON.stringify(record, null, 2) + "\n", 0o600);

    const verified = this.readSecret(credentialRef);
    if (verified.api_key_id !== keyId || verified.api_secret !== secret) {
      throw new Error("credential_vault_roundtrip_failed");
    }

    return this.metadata(record);
  }

  readSecret(credentialRef) {
    const file = this.#recordFile(credentialRef);
    if (!fs.existsSync(file)) throw new Error("credential_not_found");
    const record = JSON.parse(fs.readFileSync(file, "utf8"));
    if (record.status !== "active") throw new Error("credential_inactive");
    const envelope = record.encryption || {};
    if (envelope.algorithm !== ALGORITHM) throw new Error("credential_encryption_unsupported");

    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(envelope.iv, "base64"));
    const aad = Buffer.from(envelope.aad, "base64");
    decipher.setAAD(aad);
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]);
    try {
      return JSON.parse(plaintext.toString("utf8"));
    } finally {
      plaintext.fill(0);
    }
  }

  metadata(record) {
    return {
      schema: "evercraft.provider-credential-metadata.v1",
      credential_ref: record.credential_ref,
      provider: record.provider,
      environment: record.environment,
      label: record.label,
      status: record.status,
      api_key_id_last4: record.api_key_id_last4,
      credential_fingerprint: record.credential_fingerprint,
      updated_at: record.updated_at,
      secret_material_stored: record.secret_material_stored === true,
      plaintext_persisted: false,
      secret_material_echoed: false,
    };
  }

  list({ provider = "" } = {}) {
    const wanted = safeSegment(provider, "");
    const rows = [];
    for (const name of fs.readdirSync(this.stateDir)) {
      if (!name.endsWith(".json") || name.startsWith(".")) continue;
      try {
        const record = JSON.parse(fs.readFileSync(path.join(this.stateDir, name), "utf8"));
        if (record?.schema !== "evercraft.provider-credential-envelope.v1") continue;
        if (wanted && record.provider !== wanted) continue;
        rows.push(this.metadata(record));
      } catch {}
    }
    return rows.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  }
}
