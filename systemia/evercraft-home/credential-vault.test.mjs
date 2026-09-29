import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProviderCredentialVault } from "./credential-vault.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "evercraft-credential-vault-"));
try {
  const vault = new ProviderCredentialVault({ stateDir: root });
  const apiKeyId = "PKTESTKEY12345678";
  const apiSecret = "super-secret-alpaca-material-1234567890";
  const stored = vault.put({
    provider: "alpaca",
    environment: "live",
    label: "daytrade-lens",
    apiKeyId,
    apiSecret,
    actorRef: "user:owner-proof",
  });

  assert.equal(stored.provider, "alpaca");
  assert.equal(stored.environment, "live");
  assert.equal(stored.api_key_id_last4, "5678");
  assert.equal(stored.secret_material_stored, true);
  assert.equal(stored.plaintext_persisted, false);
  assert.equal(stored.secret_material_echoed, false);
  assert.ok(stored.credential_ref.startsWith("provider_alpaca_live_"));

  const files = fs.readdirSync(root);
  const recordName = files.find((name) => name.endsWith(".json"));
  assert.ok(recordName);
  const persisted = fs.readFileSync(path.join(root, recordName), "utf8");
  assert.equal(persisted.includes(apiKeyId), false);
  assert.equal(persisted.includes(apiSecret), false);

  const reopened = new ProviderCredentialVault({ stateDir: root });
  assert.deepEqual(reopened.readSecret(stored.credential_ref), {
    api_key_id: apiKeyId,
    api_secret: apiSecret,
  });
  assert.equal(reopened.list({ provider: "alpaca" }).length, 1);

  assert.equal(fs.statSync(root).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(root, ".vault-key")).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.join(root, recordName)).mode & 0o777, 0o600);

  console.log(JSON.stringify({ ok: true, schema: "evercraft.provider-credential-vault-proof.v1" }));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
