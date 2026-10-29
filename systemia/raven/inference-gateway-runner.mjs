#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { startRavenInferenceGateway } from "./inference-gateway.mjs";

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || "") : fallback;
}

export function loadGatewayToken(file) {
  const value = String(file || "").trim();
  if (!value) throw new Error("raven_inference_gateway_token_file_required");
  const resolved = path.resolve(value);
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) throw new Error("raven_inference_gateway_token_path_not_file");
  if ((stat.mode & 0o077) !== 0) throw new Error("raven_inference_gateway_token_file_permissions_too_open");
  const token = fs.readFileSync(resolved, "utf8").trim();
  if (Buffer.byteLength(token, "utf8") < 32) throw new Error("raven_inference_gateway_token_too_short");
  return token;
}

export async function startRavenInferenceResident({
  controlTokenFile,
  provider,
  model,
  credentialStateDir = "",
  port = 4322,
  ollamaOrigin = "",
  commissionedReceiver = null,
  repoRoot = process.cwd(),
} = {}) {
  void repoRoot;
  return startRavenInferenceGateway({
    controlToken: loadGatewayToken(controlTokenFile),
    provider,
    model,
    credentialStateDir,
    port: Number(port || 4322),
    ollamaOrigin: String(ollamaOrigin || "").trim() || undefined,
    // A trusted, process-owned admission/worker adapter may be supplied by
    // the operator's existing runtime bootstrap. The default stays held.
    commissionedReceiver,
  });
}

async function main() {
  const runtime = await startRavenInferenceResident({
    controlTokenFile: arg("--control-token-file", process.env.RAVEN_INFERENCE_GATEWAY_TOKEN_FILE || ""),
    provider: arg("--provider", process.env.RAVEN_INFERENCE_PROVIDER || ""),
    model: arg("--model", process.env.RAVEN_INFERENCE_MODEL || ""),
    credentialStateDir: arg("--credential-state-dir", process.env.RAVEN_PROVIDER_CREDENTIAL_STATE_DIR || process.env.EVERCRAFT_CREDENTIAL_STATE_DIR || ""),
    port: Number(arg("--port", process.env.RAVEN_INFERENCE_GATEWAY_PORT || "4322")),
    ollamaOrigin: arg("--ollama-origin", process.env.RAVEN_OLLAMA_ORIGIN || ""),
  });
  process.stdout.write(JSON.stringify({
    schema: "evercraft.raven.inference-gateway-runner.v1",
    ok: true,
    state: "running",
    url: runtime.url,
    provider: runtime.engine.provider,
    model: runtime.engine.model,
    base44_required: false,
    raw_credentials_exposed: false,
  }) + "\n");

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await runtime.close();
  };
  process.on("SIGTERM", () => shutdown().finally(() => process.exit(0)));
  process.on("SIGINT", () => shutdown().finally(() => process.exit(0)));
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invoked === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(JSON.stringify({
      schema: "evercraft.raven.inference-gateway-runner-error.v1",
      ok: false,
      state: error instanceof Error ? error.message : String(error),
      base44_required: false,
      raw_credentials_exposed: false,
    }) + "\n");
    process.exit(1);
  });
}
