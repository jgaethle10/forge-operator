#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ProviderCredentialVault } from "../evercraft-home/credential-vault.mjs";
import { normalizeProviderCredentialRequest } from "../evercraft-home/provider-credentials.mjs";

function clean(value) {
  return String(value ?? "").trim();
}

function providerKey(value) {
  const provider = clean(value).toLowerCase();
  if (!["gemini", "openai"].includes(provider)) {
    throw new Error("hosted_raven_provider_must_be_gemini_or_openai");
  }
  return provider;
}

export function ravenInferenceCredentialStatus({ provider, stateDir } = {}) {
  const key = providerKey(provider);
  const root = path.resolve(clean(stateDir));
  if (!clean(stateDir)) throw new Error("provider_credential_state_dir_required");
  if (!fs.existsSync(root)) {
    return {
      schema: "evercraft.raven.local-provider-credential-status.v1",
      provider: key,
      configured: false,
      credential_count: 0,
      secret_material_returned: false,
    };
  }
  const vault = new ProviderCredentialVault({ stateDir: root });
  const credentials = vault.list({ provider: key });
  return {
    schema: "evercraft.raven.local-provider-credential-status.v1",
    provider: key,
    configured: credentials.length > 0,
    credential_count: credentials.length,
    secret_material_returned: false,
  };
}

export function sealRavenInferenceCredential({
  provider,
  stateDir,
  apiKey,
  actorRef = "local:operator",
} = {}) {
  const key = providerKey(provider);
  const root = path.resolve(clean(stateDir));
  if (!clean(stateDir)) throw new Error("provider_credential_state_dir_required");
  const secret = clean(apiKey);
  if (!secret) throw new Error("provider_api_key_required");
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  fs.chmodSync(root, 0o700);
  const normalized = normalizeProviderCredentialRequest(key, { api_key: secret });
  const vault = new ProviderCredentialVault({ stateDir: root });
  const credential = vault.put({
    ...normalized,
    actorRef: clean(actorRef) || "local:operator",
  });
  return {
    schema: "evercraft.raven.local-provider-credential-seal.v1",
    ok: true,
    provider: key,
    state: "credential_sealed",
    credential_ref: credential.credential_ref,
    fingerprint: credential.fingerprint,
    created_at: credential.created_at,
    secret_material_returned: false,
    plaintext_persisted: false,
  };
}

async function readStdin(limit = 32768) {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > limit) throw new Error("provider_api_key_input_too_large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8").trim();
}

function arg(name, fallback = "") {
  const i = process.argv.indexOf(name);
  return i >= 0 ? String(process.argv[i + 1] || "") : fallback;
}

async function main() {
  const command = process.argv[2] || "";
  const provider = arg("--provider");
  const stateDir = arg("--state-dir");
  if (command === "status") {
    process.stdout.write(JSON.stringify(
      ravenInferenceCredentialStatus({ provider, stateDir })
    ) + "\n");
    return;
  }
  if (command === "seal") {
    const apiKey = await readStdin();
    const result = sealRavenInferenceCredential({
      provider,
      stateDir,
      apiKey,
    });
    process.stdout.write(JSON.stringify(result) + "\n");
    return;
  }
  throw new Error("usage: seal-inference-key.mjs status|seal --provider gemini|openai --state-dir PATH");
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invoked === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(JSON.stringify({
      ok: false,
      state: error instanceof Error ? error.message : String(error),
      secret_material_returned: false,
    }) + "\n");
    process.exit(1);
  });
}
