import fs from "node:fs";
import path from "node:path";
import { runCompetitionProviderProbes } from "./provider-runtime.mjs";

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || "") : fallback;
}

function truthy(value) {
  return ["1", "true", "yes", "ready"].includes(String(value || "").trim().toLowerCase());
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o750 });
  const tmp = file + "." + process.pid + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(tmp, file);
}

const out = path.resolve(
  arg("--out", process.env.SYSTEMIA_COMPETITION_PROVIDER_RECEIPT || "artifacts/competition-provider/latest.json")
);
const result = await runCompetitionProviderProbes({ env: process.env });
result.observed_at = new Date().toISOString();

atomicJson(out, result);
process.stdout.write(JSON.stringify({
  ok: result.summary?.failed_count === 0,
  state: result.summary?.state || "unknown",
  route: result.route,
  receipt: out,
  verified_count: result.summary?.verified_count || 0,
  held_count: result.summary?.held_count || 0,
  failed_count: result.summary?.failed_count || 0,
  secret_values_persisted: false,
  base44_used: false,
  public_fabric_used: false,
  submission_authority_enabled: false,
  staking_authority_enabled: false,
}) + "\n");

// Provider rejection is a degraded receipt, not a crash loop. Systemia can surface it
// without hammering provider APIs or losing the evidence needed for repair.
process.exitCode = 0;
