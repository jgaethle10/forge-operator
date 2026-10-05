import fs from "node:fs";
import path from "node:path";
import { YardOperator } from "../yard/operator.mjs";
import { executeBrowserDraftJob } from "./browser-draft-runtime.mjs";

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

const jobDir = path.resolve(arg("--job-dir", process.env.SYSTEMIA_COMPETITION_BROWSER_DRAFT_JOB_DIR || "artifacts/competition-provider/browser-draft-jobs"));
const outDir = path.resolve(arg("--out-dir", process.env.SYSTEMIA_COMPETITION_BROWSER_DRAFT_RECEIPT_DIR || "artifacts/competition-provider/browser-draft-receipts"));
const yardState = arg("--yard-state", process.env.SYSTEMIA_YARD_STATE_DIR || "");
const deploymentId = arg("--browser-deployment-id", process.env.SYSTEMIA_COMPETITION_BROWSER_DEPLOYMENT_ID || "evercraft-web-browser");

fs.mkdirSync(jobDir, { recursive: true, mode: 0o750 });
fs.mkdirSync(outDir, { recursive: true, mode: 0o750 });

const jobs = fs.readdirSync(jobDir).filter((name) => name.endsWith(".json")).sort();
const receipts = [];

if (!yardState) {
  const summary = {
    schema: "evercraft.systemia.competition-browser-draft-cycle.v1",
    state: "held_yard_state_unconfigured",
    job_count: jobs.length,
    receipt_count: 0,
    draft_prepared_count: 0,
    submission_attempted_count: 0,
    final_submission_authority: false,
    observed_at: new Date().toISOString(),
  };
  atomicJson(path.join(outDir, "latest-cycle.json"), summary);
  process.stdout.write(JSON.stringify(summary) + "\n");
  process.exit(0);
}

const yard = new YardOperator({ stateDir: path.resolve(yardState) });

for (const name of jobs) {
  const jobPath = path.join(jobDir, name);
  let job;
  try { job = JSON.parse(fs.readFileSync(jobPath, "utf8")); } catch { continue; }
  const jobId = String(job.job_id || path.basename(name, ".json"));
  const receiptPath = path.join(outDir, jobId + ".json");

  if (fs.existsSync(receiptPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
      if (existing.state === "draft_prepared_yard_receipts_verified") {
        receipts.push(existing);
        continue;
      }
    } catch {}
  }

  const receipt = await executeBrowserDraftJob({ ...job, job_id: jobId }, { yard, deploymentId });
  atomicJson(receiptPath, receipt);
  receipts.push(receipt);
}

const summary = {
  schema: "evercraft.systemia.competition-browser-draft-cycle.v1",
  state: receipts.some((row) => row.state === "provider_draft_action_failed")
    ? "degraded"
    : receipts.some((row) => row.state === "held_human_authentication_or_delegation_gate")
      ? "human_authentication_gate"
      : "ready",
  job_count: jobs.length,
  receipt_count: receipts.length,
  draft_prepared_count: receipts.filter((row) => row.state === "draft_prepared_yard_receipts_verified").length,
  human_authentication_gate_count: receipts.filter((row) => row.state === "held_human_authentication_or_delegation_gate").length,
  failed_count: receipts.filter((row) => ["provider_draft_action_failed", "provider_draft_postcheck_failed"].includes(row.state)).length,
  submission_attempted_count: receipts.filter((row) => row.submission_attempted === true).length,
  final_submission_authority: false,
  accepts_new_terms: false,
  payment_authority: false,
  observed_at: new Date().toISOString(),
};
atomicJson(path.join(outDir, "latest-cycle.json"), summary);
process.stdout.write(JSON.stringify(summary) + "\n");
