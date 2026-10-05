import fs from "node:fs";
import path from "node:path";
import { runCompetitionControlPlane } from "./control-plane.mjs";

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
const out = path.resolve(arg("--out", process.env.SYSTEMIA_COMPETITION_CONTROL_PLANE_RECEIPT || "artifacts/competition-provider/control-plane/latest.json"));

let opportunities = [];
if (fs.existsSync(inbox)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(inbox, "utf8"));
    opportunities = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.opportunities) ? parsed.opportunities : [];
  } catch {
    opportunities = [];
  }
}

const receipt = runCompetitionControlPlane(opportunities);
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
