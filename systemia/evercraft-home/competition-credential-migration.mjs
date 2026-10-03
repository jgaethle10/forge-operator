import { generateKeyPairSync, privateDecrypt, randomUUID } from "node:crypto";
import { runCompetitionProviderProbes } from "../competition/provider-runtime.mjs";

function clean(v) { return String(v ?? "").trim(); }

export class CompetitionCredentialMigrationDoor {
  constructor({ vault, ttlMs = 10 * 60 * 1000, probeImpl = runCompetitionProviderProbes } = {}) {
    if (!vault) throw new Error("credential_vault_required");
    this.vault = vault;
    this.ttlMs = Math.max(60_000, Number(ttlMs || 600_000));
    this.probeImpl = probeImpl;
    this.active = null;
  }

  complete() {
    return this.vault.list({ provider: "kaggle" }).length > 0 &&
      this.vault.list({ provider: "numerai" }).length > 0;
  }

  status() {
    return {
      schema: "evercraft.raven.competition-credential-migration-status.v1",
      state: this.complete() ? "complete" : this.active ? "challenge_active" : "ready_for_challenge",
      complete: this.complete(),
      secret_material_returned: false,
      plaintext_persisted: false,
      base44_required_after_completion: false,
    };
  }

  challenge() {
    if (this.complete()) {
      return { ...this.status(), public_key_pem: null, challenge_id: null };
    }
    const now = Date.now();
    if (!this.active || this.active.expiresAt <= now) {
      const pair = generateKeyPairSync("rsa", {
        modulusLength: 4096,
        publicExponent: 0x10001,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      });
      this.active = {
        challengeId: "raven_competition_migration_" + randomUUID(),
        publicKey: pair.publicKey,
        privateKey: pair.privateKey,
        expiresAt: now + this.ttlMs,
        attempts: 0,
      };
    }
    return {
      schema: "evercraft.raven.competition-credential-migration-challenge.v1",
      state: "challenge_active",
      challenge_id: this.active.challengeId,
      public_key_pem: this.active.publicKey,
      algorithm: "RSA-OAEP-4096-SHA256",
      expires_at: new Date(this.active.expiresAt).toISOString(),
      expected_providers: ["kaggle", "numerai"],
      secret_material_returned: false,
    };
  }

  async accept({ challenge_id, ciphertext_base64 } = {}) {
    if (this.complete()) return { ...this.status(), state: "already_complete" };
    if (!this.active) throw new Error("migration_challenge_required");
    if (this.active.expiresAt <= Date.now()) {
      this.active = null;
      throw new Error("migration_challenge_expired");
    }
    if (clean(challenge_id) !== this.active.challengeId) throw new Error("migration_challenge_mismatch");
    if (++this.active.attempts > 8) {
      this.active = null;
      throw new Error("migration_attempt_limit");
    }

    let plaintext;
    try {
      plaintext = privateDecrypt({
        key: this.active.privateKey,
        oaepHash: "sha256",
      }, Buffer.from(clean(ciphertext_base64), "base64"));
      const payload = JSON.parse(plaintext.toString("utf8"));
      if (clean(payload.challenge_id) !== this.active.challengeId) {
        throw new Error("migration_payload_challenge_mismatch");
      }
      const kaggle = clean(payload.kaggle_api_token);
      const numeraiPublic = clean(payload.numerai_public_id);
      const numeraiSecret = clean(payload.numerai_secret_key);
      if (kaggle.length < 16 || numeraiPublic.length < 8 || numeraiSecret.length < 16) {
        throw new Error("migration_payload_credentials_invalid");
      }

      const probes = await this.probeImpl({
        env: {
          RAVEN_KAGGLE_ACCESS_TOKEN: kaggle,
          RAVEN_NUMERAI_PUBLIC_ID: numeraiPublic,
          RAVEN_NUMERAI_SECRET_KEY: numeraiSecret,
        },
      });
      const byProvider = new Map((probes.providers || []).map((row) => [row.provider, row]));
      if (byProvider.get("kaggle")?.state !== "authenticated_listing_verified") {
        throw new Error("kaggle_credential_verification_failed");
      }
      if (byProvider.get("numerai")?.state !== "authenticated_listing_verified") {
        throw new Error("numerai_credential_verification_failed");
      }

      const kaggleMeta = this.vault.put({
        provider: "kaggle",
        environment: "live",
        label: "competition-foundry",
        apiKeyId: "kaggle-api-token",
        apiSecret: kaggle,
        actorRef: "raven-nexus-legacy-migration",
      });
      const numeraiMeta = this.vault.put({
        provider: "numerai",
        environment: "live",
        label: "competition-foundry",
        apiKeyId: numeraiPublic,
        apiSecret: numeraiSecret,
        actorRef: "raven-nexus-legacy-migration",
      });

      this.active.privateKey = "";
      this.active = null;
      return {
        schema: "evercraft.raven.competition-credential-migration-receipt.v1",
        state: "verified_and_sealed",
        complete: true,
        providers: [
          { provider: "kaggle", credential_ref: kaggleMeta.credential_ref, fingerprint: kaggleMeta.credential_fingerprint },
          { provider: "numerai", credential_ref: numeraiMeta.credential_ref, fingerprint: numeraiMeta.credential_fingerprint },
        ],
        provider_auth_verified: true,
        secret_material_returned: false,
        plaintext_persisted: false,
        base44_required_after_completion: false,
        migrated_at: new Date().toISOString(),
      };
    } finally {
      if (plaintext) plaintext.fill(0);
    }
  }
}
