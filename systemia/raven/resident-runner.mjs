#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { startRavenPrivateRuntime } from "./private-runtime.mjs";

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || "") : fallback;
}

export function loadControlToken(file) {
  const resolved = path.resolve(String(file || "").trim());
  if (!String(file || "").trim()) throw new Error("raven_control_token_file_required");
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) throw new Error("raven_control_token_path_not_file");
  if ((stat.mode & 0o077) !== 0) throw new Error("raven_control_token_file_permissions_too_open");
  const token = fs.readFileSync(resolved, "utf8").trim();
  if (Buffer.byteLength(token, "utf8") < 32) throw new Error("raven_control_token_too_short");
  return token;
}

export function readDeploymentReceipt(file) {
  const value = String(file || "").trim();
  if (!value) return "";
  const resolved = path.resolve(value);
  if (!fs.existsSync(resolved)) return "";
  const payload = JSON.parse(fs.readFileSync(resolved, "utf8"));
  return String(payload?.receipt_ref || payload?.receipt_hash || "").trim();
}

export async function startRavenResident({
  stateDir,
  controlTokenFile,
  trustedSubjectRef = "",
  deploymentReceiptFile = "",
  repoRoot = process.cwd(),
} = {}) {
  const resolvedState = path.resolve(String(stateDir || "").trim());
  if (!String(stateDir || "").trim()) throw new Error("raven_state_dir_required");
  const controlToken = loadControlToken(controlTokenFile);
  const runtime = await startRavenPrivateRuntime({
    stateDir: resolvedState,
    repoRoot,
    host: "127.0.0.1",
    controlToken,
    trustedSubjectRef: String(trustedSubjectRef || "").trim(),
    runtimeLabel: "Raven Private Runtime",
    workloadClass: "systemia.raven-private-runtime.v1",
  });
  const receipt = readDeploymentReceipt(deploymentReceiptFile);
  if (receipt) runtime.setDeploymentReceipt(receipt);
  return runtime;
}

async function main() {
  const runtime = await startRavenResident({
    stateDir: arg("--state-dir", process.env.RAVEN_PRIVATE_STATE_DIR || ""),
    controlTokenFile: arg("--control-token-file", process.env.RAVEN_PRIVATE_CONTROL_TOKEN_FILE || ""),
    trustedSubjectRef: arg("--trusted-subject-ref", process.env.RAVEN_PRIVATE_TRUSTED_SUBJECT_REF || ""),
    deploymentReceiptFile: arg("--deployment-receipt-file", process.env.RAVEN_PRIVATE_DEPLOYMENT_RECEIPT_FILE || ""),
    repoRoot: process.cwd(),
  });

  process.stdout.write(JSON.stringify({
    schema: "evercraft.raven.resident-runner.v1",
    ok: true,
    state: "running",
    service: runtime.health().service,
    runtime: runtime.health().runtime,
    loopback_only: runtime.health().loopback_only,
    deployment_receipt_bound: runtime.health().deployment_receipt_bound,
    secret_values_persisted: false,
    base44_required: false,
    execution_authority_granted: false,
  }) + "\n");

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await runtime.close();
    process.stdout.write(JSON.stringify({
      schema: "evercraft.raven.resident-runner.v1",
      ok: true,
      state: "stopped",
      secret_values_persisted: false,
    }) + "\n");
  };

  process.on("SIGTERM", () => shutdown().finally(() => process.exit(0)));
  process.on("SIGINT", () => shutdown().finally(() => process.exit(0)));
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invoked === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(JSON.stringify({
      schema: "evercraft.raven.resident-runner-error.v1",
      ok: false,
      state: error instanceof Error ? error.message : String(error),
      secret_values_persisted: false,
    }) + "\n");
    process.exit(1);
  });
}
