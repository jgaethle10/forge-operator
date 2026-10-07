import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProviderCredentialVault } from "./credential-vault.mjs";
import { askIntelligence, intelligenceOptions } from "./intelligence-router.mjs";

test("intelligence options keep Direct Mode default and never invent readiness", () => {
  const options = intelligenceOptions({ env: {} });
  assert.equal(options.default_mode, "direct");
  assert.equal(options.external_provider_required, false);
  assert.deepEqual(options.options.map((row) => row.key), ["evercraft", "openai", "gemini"]);
  assert.equal(options.options.find((row) => row.key === "evercraft").available, false);
  assert.equal(options.options.find((row) => row.key === "openai").state, "model_not_configured");
});

test("OpenAI becomes selectable only when both model and sealed credential exist", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "home-intelligence-options-"));
  try {
    const vault = new ProviderCredentialVault({ stateDir: root });
    vault.put({
      provider: "openai",
      environment: "live",
      label: "home-test",
      apiKeyId: "openai",
      apiSecret: "test-secret-value-long-enough",
      actorRef: "user:test",
    });
    const options = intelligenceOptions({
      credentialVault: vault,
      env: { EVERCRAFT_OPENAI_MODEL: "test-model" },
    });
    const openai = options.options.find((row) => row.key === "openai");
    assert.equal(openai.available, true);
    assert.equal(openai.state, "ready");
    assert.equal(openai.model, "test-model");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("unavailable selected provider fails closed without an external call", async () => {
  let calls = 0;
  const result = await askIntelligence({
    provider: "openai",
    message: "Review this bounded internal plan.",
    env: { EVERCRAFT_OPENAI_MODEL: "test-model" },
    fetchImpl: async () => { calls += 1; throw new Error("should_not_call"); },
  }, process.cwd());
  assert.equal(result.state, "blocked");
  assert.equal(result.external_provider_used, false);
  assert.equal(calls, 0);
});
