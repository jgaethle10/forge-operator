#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { executeRavenCommand } from "../evercraft-home/raven-command-adapter.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRootDefault = path.resolve(here, "..", "..");
const packetPathDefault = path.join(here, "acceptance", "tieton-recovery-packet.json");

function clean(value) {
  return String(value ?? "").trim();
}

function sha256(value) {
  return "sha256:" + crypto.createHash("sha256").update(String(value)).digest("hex");
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = file + "." + process.pid + "." + crypto.randomBytes(4).toString("hex") + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function readPrivateToken(file) {
  const resolved = path.resolve(clean(file));
  if (!clean(file)) throw new Error("raven_control_token_file_required");
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) throw new Error("raven_control_token_path_not_file");
  if ((stat.mode & 0o077) !== 0) throw new Error("raven_control_token_file_permissions_too_open");
  const token = fs.readFileSync(resolved, "utf8").trim();
  if (Buffer.byteLength(token, "utf8") < 32) throw new Error("raven_control_token_too_short");
  return token;
}

export function renderTietonRecoveryPacket(packet) {
  const compact = JSON.stringify(packet, null, 2);
  return [
    "EVERCRAFT RECOVERY / TIETON LIVE ACCEPTANCE REVIEW",
    "Treat PUBLIC_FACTS as evidence-backed facts, HYPOTHESES_NOT_FACTS as unverified hypotheses, and PROPOSED_PILOT as a plan to attack rather than accept.",
    "Return independent lane judgments before synthesis. Missing evidence must remain missing.",
    compact,
  ].join("\n\n");
}

export async function runTietonRecoveryAcceptance({
  repoRoot = repoRootDefault,
  packetPath = packetPathDefault,
  bridgeUrl = "http://127.0.0.1:4321",
  controlToken = "",
  controlTokenFile = "",
  receiptDir = "",
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
} = {}) {
  const packet = JSON.parse(fs.readFileSync(packetPath, "utf8"));
  if (packet?.schema !== "evercraft.recovery.acceptance-packet.v1") {
    throw new Error("tieton_acceptance_packet_schema_invalid");
  }
  const token = clean(controlToken) || readPrivateToken(controlTokenFile);
  const resolvedReceiptDir = path.resolve(
    clean(receiptDir) ||
    path.join(
      os.homedir(),
      ".local",
      "state",
      "evercraft",
      "organism",
      "acceptance",
      "tieton-recovery"
    )
  );
  fs.mkdirSync(resolvedReceiptDir, { recursive: true, mode: 0o700 });

  const objective = renderTietonRecoveryPacket(packet);
  if (objective.length > 16000) throw new Error("tieton_acceptance_packet_too_large");

  const startedAt = now().toISOString();
  const execution = await executeRavenCommand({
    message: objective,
    lane: "operations",
    bridgeUrl,
    bridgeToken: token,
    receiptDir: resolvedReceiptDir,
    fetchImpl,
    now,
  }, repoRoot);
  const completedAt = now().toISOString();

  const results = Array.isArray(execution?.output?.results) ? execution.output.results : [];
  const completedRoles = results
    .filter((row) => row?.status === "completed")
    .map((row) => String(row.reviewer_id || ""))
    .filter(Boolean);
  const requiredRoles = Array.isArray(packet?.acceptance?.required_review_lanes)
    ? packet.acceptance.required_review_lanes.map(String)
    : [];
  const missingRoles = requiredRoles.filter((role) => !completedRoles.includes(role));
  const providerReceipts = results
    .map((row) => String(row?.provider_receipt || ""))
    .filter(Boolean);
  const summary = clean(execution?.output?.summary);
  const ravenReceipt = execution?.output?.raven_receipt || null;
  const checks = {
    execution_completed: execution?.state === "executed" && execution?.execution_performed === true,
    all_required_roles_completed: missingRoles.length === 0,
    exact_required_role_count: completedRoles.length === requiredRoles.length,
    synthesis_present: Boolean(summary),
    provider_receipts_present_for_all_roles: providerReceipts.length === requiredRoles.length,
    raven_receipt_present: Boolean(ravenReceipt?.receipt_hash),
    base44_absent: execution?.base44_required === false && execution?.output?.base44_required === false,
    external_side_effects_unauthorized: execution?.external_side_effects_authorized === false,
  };
  const passed = Object.values(checks).every(Boolean);

  const acceptanceCore = {
    schema: "evercraft.recovery.live-acceptance-receipt.v1",
    acceptance_key: "tieton-recovery-owned-raven-live-v1",
    canonical_mission_key: packet.mission_key,
    systemia_mission_key: execution?.mission_key || null,
    state: passed ? "passed" : "failed",
    started_at: startedAt,
    completed_at: completedAt,
    packet_sha256: sha256(JSON.stringify(packet)),
    execution_response_sha256: clean(execution?.output?.response_sha256) || null,
    review_lane_count: completedRoles.length,
    completed_roles: completedRoles,
    missing_roles: missingRoles,
    providers: [...new Set(results.map((row) => clean(row?.provider)).filter(Boolean))],
    models: [...new Set(results.map((row) => clean(row?.model)).filter(Boolean))],
    role_provider_receipts: providerReceipts,
    team_execution_receipt_ref: execution?.receipt?.receipt_ref || null,
    raven_receipt_hash: ravenReceipt?.receipt_hash || null,
    checks,
    base44_used: false,
    external_side_effects_authorized: false,
  };
  const acceptanceReceipt = {
    ...acceptanceCore,
    receipt_hash: sha256(JSON.stringify(acceptanceCore)),
  };

  atomicJson(path.join(resolvedReceiptDir, "execution.json"), execution);
  atomicJson(path.join(resolvedReceiptDir, "acceptance.json"), acceptanceReceipt);

  return {
    ok: passed,
    state: acceptanceReceipt.state,
    execution,
    acceptance_receipt: acceptanceReceipt,
    receipt_dir: resolvedReceiptDir,
  };
}

function arg(name, fallback = "") {
  const i = process.argv.indexOf(name);
  return i >= 0 ? String(process.argv[i + 1] || "") : fallback;
}

async function main() {
  const stateRoot = path.resolve(
    arg(
      "--state-root",
      process.env.EVERCRAFT_LOCAL_ORGANISM_ROOT ||
      path.join(os.homedir(), ".local", "state", "evercraft", "organism")
    )
  );
  const controlTokenFile = arg(
    "--control-token-file",
    path.join(
      stateRoot,
      "compute",
      "services",
      "systemia-core",
      ".private-bindings",
      "raven",
      "control-token"
    )
  );
  const receiptDir = arg(
    "--receipt-dir",
    path.join(stateRoot, "acceptance", "tieton-recovery")
  );
  const result = await runTietonRecoveryAcceptance({
    controlTokenFile,
    receiptDir,
  });
  process.stdout.write(JSON.stringify({
    schema: "evercraft.recovery.live-acceptance-cli.v1",
    ok: result.ok,
    state: result.state,
    mission_key: result.acceptance_receipt.systemia_mission_key,
    canonical_mission_key: result.acceptance_receipt.canonical_mission_key,
    completed_roles: result.acceptance_receipt.completed_roles,
    providers: result.acceptance_receipt.providers,
    models: result.acceptance_receipt.models,
    team_execution_receipt_ref: result.acceptance_receipt.team_execution_receipt_ref,
    raven_receipt_hash: result.acceptance_receipt.raven_receipt_hash,
    acceptance_receipt_hash: result.acceptance_receipt.receipt_hash,
    receipt_dir: result.receipt_dir,
    base44_used: false,
    external_side_effects_authorized: false,
  }, null, 2) + "\n");
  if (!result.ok) process.exitCode = 2;
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invoked === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(JSON.stringify({
      schema: "evercraft.recovery.live-acceptance-error.v1",
      ok: false,
      state: error instanceof Error ? error.message : String(error),
      base44_used: false,
      external_side_effects_authorized: false,
    }) + "\n");
    process.exit(1);
  });
}
