// Read-only, sanitized Saban work-state snapshot for Evercraft OS.
// A persisted source snapshot is NOT a verified worker attestation, a live
// scheduler query, evidence of a Systemia mission, or customer fulfillment.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const STATES = ["queued", "leased", "completed", "dead_letter"];
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_JOBS = 10000;
const FRESH_MS = 5 * 60 * 1000;
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function held(state, detail) {
  return {
    schema: "evercraft.home.os-saban-snapshot.v1",
    state, detail, source_kind: null, source_digest: null,
    snapshot_at: null, snapshot_recent: false,
    counts: null, total_jobs: null, retried_jobs: null, checkpointed_jobs: null,
    independently_attested: false, production_dispatch_verified: false,
    mission_admitted_by_this_read: false, customer_fulfillment_verified: false,
    mutation_performed: false, sensitive_job_details_returned: false,
  };
}
function iso(value) {
  return typeof value === "string" && TIME.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value;
}
function projectSabanSnapshot(raw, nowMs) {
  const parsed = JSON.parse(raw);
  const scheduled = parsed?.schema === "evercraft.saban.scheduler-receipt.v1";
  const state = scheduled ? parsed.state : parsed;
  if (state?.schema !== "evercraft.saban.work-state.v1" ||
      !state.jobs || typeof state.jobs !== "object" || Array.isArray(state.jobs) ||
      !iso(state.updated_at)) throw new Error("unsupported_state");
  const jobs = Object.entries(state.jobs);
  if (jobs.length > MAX_JOBS) throw new Error("too_many_jobs");
  const counts = Object.fromEntries(STATES.map(x => [x, 0]));
  let retried = 0, checkpointed = 0;
  for (const [key, job] of jobs) {
    if (!job || typeof job !== "object" || job.job_id !== key ||
        !STATES.includes(job.state) ||
        !Number.isSafeInteger(job.attempts) || job.attempts < 0 || job.attempts > 1000000 ||
        !Number.isSafeInteger(job.max_attempts) || job.max_attempts < 1 ||
        job.attempts > job.max_attempts ||
        (job.state === "leased" && (!job.lease?.worker_id || !iso(job.lease?.expires_at)))) {
      throw new Error("invalid_job_state");
    }
    counts[job.state]++;
    if (job.attempts > 1) retried++;
    if (job.checkpoint != null) checkpointed++;
  }
  if (scheduled) {
    if (parsed.summary?.total !== jobs.length ||
        STATES.some(x => (parsed.summary.counts?.[x] ?? 0) !== counts[x])) {
      throw new Error("inconsistent_scheduler_receipt");
    }
  }
  const time = Date.parse(state.updated_at);
  const age = nowMs - time;
  return {
    schema: "evercraft.home.os-saban-snapshot.v1",
    state: "local_snapshot_observed",
    detail: "Sanitized counts from a permission-restricted persisted Saban snapshot. This does not verify execution, worker identity, mission admission or delivery.",
    source_kind: scheduled ? "scheduler_receipt" : "work_state",
    source_digest: "sha256:" + createHash("sha256").update(raw).digest("hex"),
    snapshot_at: state.updated_at,
    snapshot_recent: age >= 0 && age <= FRESH_MS,
    counts, total_jobs: jobs.length, retried_jobs: retried,
    checkpointed_jobs: checkpointed,
    independently_attested: false, production_dispatch_verified: false,
    mission_admitted_by_this_read: false, customer_fulfillment_verified: false,
    mutation_performed: false, sensitive_job_details_returned: false,
  };
}
export function readEvercraftOsSabanSnapshot({ stateFile = "", now = () => Date.now() } = {}) {
  if (!String(stateFile || "").trim()) return held("not_configured", "No private Saban work-state file is configured for Home.");
  try {
    if (typeof stateFile !== "string" || !path.isAbsolute(stateFile) || !stateFile.endsWith(".json")) throw Error("invalid_path");
    const dir = path.dirname(stateFile);
    const parent = fs.lstatSync(dir);
    const file = fs.lstatSync(stateFile);
    if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o077) !== 0 ||
        !file.isFile() || file.isSymbolicLink() || (file.mode & 0o077) !== 0 ||
        file.size <= 0 || file.size > MAX_BYTES) throw Error("unsafe_file");
    const before = fs.realpathSync(stateFile);
    if (before !== stateFile || fs.realpathSync(dir) !== dir) throw Error("path_redirect");
    const raw = fs.readFileSync(stateFile, "utf8");
    if (Buffer.byteLength(raw, "utf8") > MAX_BYTES) throw Error("oversized_file");
    const clock = now();
    if (!Number.isFinite(clock)) throw Error("invalid_clock");
    return projectSabanSnapshot(raw, clock);
  } catch {
    return held("snapshot_unverified", "The configured Saban snapshot could not be securely read or validated. No job totals are asserted.");
  }
}
