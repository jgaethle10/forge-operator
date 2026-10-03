import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { publicEncrypt } from "node:crypto";
import { ProviderCredentialVault } from "./credential-vault.mjs";
import { CompetitionCredentialMigrationDoor } from "./competition-credential-migration.mjs";

test("one-time Raven migration verifies providers, seals credentials, and never echoes plaintext", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "raven-comp-migrate-"));
  try {
    const vault = new ProviderCredentialVault({ stateDir: root });
    const door = new CompetitionCredentialMigrationDoor({
      vault,
      probeImpl: async ({ env }) => {
        assert.equal(env.RAVEN_KAGGLE_ACCESS_TOKEN, "KGAT_abcdefghijklmnopqrstuvwxyz");
        assert.equal(env.RAVEN_NUMERAI_PUBLIC_ID, "numerai-public-id");
        assert.equal(env.RAVEN_NUMERAI_SECRET_KEY, "numerai-secret-key-abcdefghijklmnopqrstuvwxyz");
        return {
          providers: [
            { provider: "kaggle", state: "authenticated_listing_verified" },
            { provider: "numerai", state: "authenticated_listing_verified" },
          ],
        };
      },
    });

    const challenge = door.challenge();
    const payload = Buffer.from(JSON.stringify({
      challenge_id: challenge.challenge_id,
      kaggle_api_token: "KGAT_abcdefghijklmnopqrstuvwxyz",
      numerai_public_id: "numerai-public-id",
      numerai_secret_key: "numerai-secret-key-abcdefghijklmnopqrstuvwxyz",
    }));
    const encrypted = publicEncrypt({
      key: challenge.public_key_pem,
      oaepHash: "sha256",
    }, payload).toString("base64");
    payload.fill(0);

    const receipt = await door.accept({
      challenge_id: challenge.challenge_id,
      ciphertext_base64: encrypted,
    });
    assert.equal(receipt.state, "verified_and_sealed");
    assert.equal(receipt.complete, true);
    assert.equal(receipt.provider_auth_verified, true);
    const serialized = JSON.stringify(receipt);
    assert.equal(serialized.includes("KGAT_"), false);
    assert.equal(serialized.includes("numerai-secret-key"), false);

    assert.equal(vault.list({ provider: "kaggle" }).length, 1);
    assert.equal(vault.list({ provider: "numerai" }).length, 1);
    assert.equal(vault.readSecret(vault.list({ provider: "kaggle" })[0].credential_ref).api_secret, "KGAT_abcdefghijklmnopqrstuvwxyz");
    const numerai = vault.readSecret(vault.list({ provider: "numerai" })[0].credential_ref);
    assert.equal(numerai.api_key_id, "numerai-public-id");
    assert.equal(numerai.api_secret, "numerai-secret-key-abcdefghijklmnopqrstuvwxyz");

    const after = door.challenge();
    assert.equal(after.state, "complete");
    assert.equal(after.public_key_pem, null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("failed provider verification seals nothing", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "raven-comp-migrate-fail-"));
  try {
    const vault = new ProviderCredentialVault({ stateDir: root });
    const door = new CompetitionCredentialMigrationDoor({
      vault,
      probeImpl: async () => ({
        providers: [
          { provider: "kaggle", state: "auth_rejected" },
          { provider: "numerai", state: "authenticated_listing_verified" },
        ],
      }),
    });
    const challenge = door.challenge();
    const payload = Buffer.from(JSON.stringify({
      challenge_id: challenge.challenge_id,
      kaggle_api_token: "KGAT_abcdefghijklmnopqrstuvwxyz",
      numerai_public_id: "numerai-public-id",
      numerai_secret_key: "numerai-secret-key-abcdefghijklmnopqrstuvwxyz",
    }));
    const encrypted = publicEncrypt({ key: challenge.public_key_pem, oaepHash: "sha256" }, payload).toString("base64");
    payload.fill(0);
    await assert.rejects(
      door.accept({ challenge_id: challenge.challenge_id, ciphertext_base64: encrypted }),
      /kaggle_credential_verification_failed/
    );
    assert.equal(vault.list({ provider: "kaggle" }).length, 0);
    assert.equal(vault.list({ provider: "numerai" }).length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
