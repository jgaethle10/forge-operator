import fs from "node:fs";
import path from "node:path";
import { executeSubmissionJob } from "./submission-runtime.mjs";

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

const jobDir = path.resolve(arg("--job-dir", process.env.SYSTEMIA_COMPETITION_JOB_DIR || "artifacts/competition-provider/jobs"));
const outDir = path.resolve(arg("--out-dir", process.env.SYSTEMIA_COMPETITION_SUBMISSION_DIR || "artifacts/competition-provider/submissions"));
const authority = arg("--authority", process.env.SYSTEMIA_COMPETITION_SUBMISSION_AUTHORITY || "authorized_existing_terms_only");

fs.mkdirSync(jobDir, { recursive: true, mode: 0o750 });
fs.mkdirSync(outDir, { recursive: true, mode: 0o750 });

const jobs = fs.readdirSync(jobDir)
  .filter((name) => name.endsWith(".json"))
  .sort();

const receipts = [];
for (const name of jobs) {
  const jobPath = path.join(jobDir, name);
  let job;
  try {
    job = JSON.parse(fs.readFileSync(jobPath, "utf8"));
  } catch {
    continue;
  }
  const jobId = String(job.job_id || path.basename(name, ".json"));
  const receiptPath = path.join(outDir, jobId + ".json");

  if (fs.existsSync(receiptPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
      if (existing.state === "submitted_provider_receipt_verified") {
        receipts.push(existing);
        continue;
      }
    } catch {}
  }

  const receipt = await executeSubmissionJob({
    ...job,
    job_id: jobId,
    submission_authority: authority,
  });
  atomicJson(receiptPath, receipt);
  receipts.push(receipt);
}

const summary = {
  schema: "evercraft.systemia.competition-submission-cycle.v1",
  route: ["systemia", "build_test", "raven_qa", "raven_nexus", "provider_api"],
  job_count: jobs.length,
  receipt_count: receipts.length,
  submitted_count: receipts.filter((row) => row.state === "submitted_provider_receipt_verified").length,
  human_gate_count: receipts.filter((row) => row.state === "held_human_terms_gate").length,
  failed_count: receipts.filter((row) => ["provider_submission_failed", "provider_receipt_unverified"].includes(row.state)).length,
  staking_authority_enabled: false,
  payment_authority_enabled: false,
  base44_used: false,
  public_fabric_used: false,
  observed_at: new Date().toISOString(),
};
atomicJson(path.join(outDir, "latest-cycle.json"), summary);
process.stdout.write(JSON.stringify(summary) + "\n");
