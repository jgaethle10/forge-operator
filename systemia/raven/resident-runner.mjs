#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { startRavenPrivateRuntime } from "./private-runtime.mjs";
import { createOwnedCommissionedTeamGate } from "../agent-continuity/owned-proof-source.mjs";
import {
  createHttpInferenceAdapter,
  createRavenTeamReviewExecutor,
} from "./team-review-runtime.mjs";

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || "") : fallback;
}

function loadPrivateToken(file, prefix) {
  const resolved = path.resolve(String(file || "").trim());
  if (!String(file || "").trim()) throw new Error(prefix + "_token_file_required");
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) throw new Error(prefix + "_token_path_not_file");
  if ((stat.mode & 0o077) !== 0) throw new Error(prefix + "_token_file_permissions_too_open");
  const token = fs.readFileSync(resolved, "utf8").trim();
  if (Buffer.byteLength(token, "utf8") < 32) throw new Error(prefix + "_token_too_short");
  return token;
}

export function loadControlToken(file) {
  return loadPrivateToken(file, "raven_control");
}

export function loadInferenceToken(file) {
  return loadPrivateToken(file, "raven_inference");
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
  inferenceOrigin = "",
  inferenceTokenFile = "",
  commissionedEvidenceDir = "",
  commissionedTrustKeysFile = "",
  port = 4321,
  repoRoot = process.cwd(),
} = {}) {
  const resolvedState = path.resolve(String(stateDir || "").trim());
  if (!String(stateDir || "").trim()) throw new Error("raven_state_dir_required");
  const controlToken = loadControlToken(controlTokenFile);
  const normalizedInferenceTokenFile = String(inferenceTokenFile || "").trim();
  const normalizedInferenceOrigin = String(
    inferenceOrigin || (normalizedInferenceTokenFile ? "http://127.0.0.1:4322" : "")
  ).trim();
  if (normalizedInferenceOrigin && !normalizedInferenceTokenFile) {
    throw new Error("raven_inference_origin_requires_token_file");
  }
  const inferenceAdapter = normalizedInferenceTokenFile
    ? createHttpInferenceAdapter({
        origin: normalizedInferenceOrigin,
        token: loadInferenceToken(normalizedInferenceTokenFile),
      })
    : null;
  const evidenceDir = String(commissionedEvidenceDir || "").trim();
  const trustKeysFile = String(commissionedTrustKeysFile || "").trim();
  if (Boolean(evidenceDir) !== Boolean(trustKeysFile)) {
    throw new Error("raven_commissioned_gate_requires_evidence_and_trust_paths");
  }
  const commissionedGate = evidenceDir
    ? createOwnedCommissionedTeamGate({ evidenceDir, trustKeysFile })
    : null;
  const teamReviewExecutor = createRavenTeamReviewExecutor({ inferenceAdapter, commissionedGate });
  const runtime = await startRavenPrivateRuntime({
    stateDir: resolvedState,
    repoRoot,
    host: "127.0.0.1",
    controlToken,
    trustedSubjectRef: String(trustedSubjectRef || "").trim(),
    port: Number(port || 4321),
    runtimeLabel: "Raven Private Runtime",
    workloadClass: "systemia.raven-private-runtime.v1",
    teamReviewExecutor,
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
    inferenceOrigin: arg("--inference-origin", process.env.RAVEN_INFERENCE_ORIGIN || ""),
    inferenceTokenFile: arg("--inference-token-file", process.env.RAVEN_INFERENCE_TOKEN_FILE || ""),
    commissionedEvidenceDir: arg("--commissioned-evidence-dir", process.env.RAVEN_COMMISSIONED_EVIDENCE_DIR || ""),
    commissionedTrustKeysFile: arg("--commissioned-trust-keys-file", process.env.RAVEN_COMMISSIONED_TRUST_KEYS_FILE || ""),
    port: Number(arg("--port", process.env.RAVEN_PRIVATE_PORT || "4321")),
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
    internal_readonly_team_review_enabled: runtime.health().internal_readonly_team_review_enabled,
    ai_inference_enabled: runtime.health().ai_inference_enabled,
    commissioned_proof_gate_configured: Boolean(arg("--commissioned-evidence-dir", process.env.RAVEN_COMMISSIONED_EVIDENCE_DIR || "")) && Boolean(arg("--commissioned-trust-keys-file", process.env.RAVEN_COMMISSIONED_TRUST_KEYS_FILE || "")),
    loopback_url: runtime.url,
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
