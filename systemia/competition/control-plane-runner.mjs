import fs from "node:fs";
import path from "node:path";
import { runCompetitionControlPlane } from "./control-plane.mjs";
import { applyAuthorizationLedger, summarizeAuthorizationLedger } from "./authorization-ledger.mjs";

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || "") : fallback;
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o750 });
  const tmp = file + "." + process.pid + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(tmp, file);
}

const inbox = path.resolve(arg("--inbox", process.env.SYSTEMIA_COMPETITION_OPPORTUNITY_INBOX || "artifacts/competition-provider/opportunities.json"));
const registryPath = path.resolve(arg("--registry", process.env.SYSTEMIA_COMPETITION_OPPORTUNITY_REGISTRY || "systemia/competition/opportunity-registry.json"));
const out = path.resolve(arg("--out", process.env.SYSTEMIA_COMPETITION_CONTROL_PLANE_RECEIPT || "artifacts/competition-provider/control-plane/latest.json"));
const ledgerPath = path.resolve(arg("--authorization-ledger", process.env.SYSTEMIA_COMPETITION_AUTHORIZATION_LEDGER || "artifacts/competition-provider/authorization-ledger.json"));

let opportunities = [];
const sources = [registryPath, inbox];
const byId = new Map();
for (const source of sources) {
  if (!fs.existsSync(source)) continue;
  try {
    const parsed = JSON.parse(fs.readFileSync(source, "utf8"));
    const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.opportunities) ? parsed.opportunities : [];
    for (const row of rows) {
      const key = String(row?.opportunity_id || "").trim();
      if (key) byId.set(key, { ...(byId.get(key) || {}), ...row });
    }
  } catch {}
}
opportunities = [...byId.values()];

let authorizationLedger = {};
if (fs.existsSync(ledgerPath)) {
  try { authorizationLedger = JSON.parse(fs.readFileSync(ledgerPath, "utf8")); } catch { authorizationLedger = {}; }
}

const resolvedOpportunities = applyAuthorizationLedger(opportunities, authorizationLedger);
const receipt = runCompetitionControlPlane(resolvedOpportunities);
receipt.authorization_ledger = summarizeAuthorizationLedger(authorizationLedger);
atomicJson(out, receipt);
process.stdout.write(JSON.stringify({
  ok: true,
  state: receipt.summary.human_gate_count > 0 ? "human_gate_pending" : receipt.summary.autonomous_submission_ready > 0 ? "autonomous_ready" : "team_work_pending",
  opportunity_count: receipt.summary.opportunity_count,
  human_gate_count: receipt.summary.human_gate_count,
  autonomous_submission_ready: receipt.summary.autonomous_submission_ready,
  internal_repair_required: receipt.summary.internal_repair_required,
  receipt: out,
}) + "\n");
