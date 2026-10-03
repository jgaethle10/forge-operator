import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProviderCredentialVault } from "../evercraft-home/credential-vault.mjs";
import { resolveCompetitionProviderSecrets } from "./provider-secret-boundary.mjs";

test("competition provider secret boundary falls back to the owned encrypted vault", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "raven-provider-vault-"));
  try {
    const vault = new ProviderCredentialVault({ stateDir: root });
    vault.put({
      provider: "kaggle",
      environment: "live",
      label: "competition-foundry",
      apiKeyId: "kaggle-api-token",
      apiSecret: "KGAT_owned_vault_secret_abcdefghijklmnopqrstuvwxyz",
      actorRef: "proof",
    });
    vault.put({
      provider: "numerai",
      environment: "live",
      label: "competition-foundry",
      apiKeyId: "numerai-public-id",
      apiSecret: "numerai-secret-key-abcdefghijklmnopqrstuvwxyz",
      actorRef: "proof",
    });

    const secrets = resolveCompetitionProviderSecrets({
      EVERCRAFT_CREDENTIAL_STATE_DIR: root,
    });
    assert.equal(secrets.kaggle.mode, "bearer");
    assert.equal(secrets.kaggle.source, "owned_vault");
    assert.equal(secrets.kaggle.access_token, "KGAT_owned_vault_secret_abcdefghijklmnopqrstuvwxyz");
    assert.equal(secrets.numerai.source, "owned_vault");
    assert.equal(secrets.numerai.public_id, "numerai-public-id");
    assert.equal(secrets.numerai.secret_key, "numerai-secret-key-abcdefghijklmnopqrstuvwxyz");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("runtime bindings still override the owned vault", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "raven-provider-vault-"));
  try {
    const vault = new ProviderCredentialVault({ stateDir: root });
    vault.put({
      provider: "kaggle",
      environment: "live",
      label: "competition-foundry",
      apiKeyId: "kaggle-api-token",
      apiSecret: "KGAT_owned_vault_secret_abcdefghijklmnopqrstuvwxyz",
      actorRef: "proof",
    });
    const secrets = resolveCompetitionProviderSecrets({
      EVERCRAFT_CREDENTIAL_STATE_DIR: root,
      RAVEN_KAGGLE_ACCESS_TOKEN: "KGAT_runtime_binding_abcdefghijklmnopqrstuvwxyz",
    });
    assert.equal(secrets.kaggle.source, "runtime_binding");
    assert.equal(secrets.kaggle.access_token, "KGAT_runtime_binding_abcdefghijklmnopqrstuvwxyz");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
