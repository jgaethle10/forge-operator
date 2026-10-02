import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateFrozenProtocol } from "./edge-forward-paper.mjs";
import { ForwardPaperDurableState } from "./edge-forward-paper-durable.mjs";

export const CANONICAL_FORWARD_PAPER_CUTOFF = "2026-09-30T23:10:52.172Z";
export const CANONICAL_FORWARD_PAPER_ARTIFACT_DIGEST =
  "sha256:fad591be832d023188e60908afee9252713545e0cb42ae3cc2ebcea698ac7a96";
export const DEFAULT_FROZEN_ENROLLMENT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "frozen",
  "forward-paper-cohorts-2026-09-30.json"
);

export function loadCanonicalFrozenEnrollment({
  enrollmentPath = DEFAULT_FROZEN_ENROLLMENT_PATH,
} = {}) {
  const parsed = JSON.parse(fs.readFileSync(path.resolve(enrollmentPath), "utf8"));
  if (parsed?.schema !== "evercraft.daytrade.forward-paper-canonical-enrollment.v1") {
    throw new Error("edge_forward_seed_canonical_schema_mismatch");
  }
  if (parsed?.generated_at !== CANONICAL_FORWARD_PAPER_CUTOFF) {
    throw new Error("edge_forward_seed_canonical_cutoff_mismatch");
  }
  if (parsed?.source_artifact_digest !== CANONICAL_FORWARD_PAPER_ARTIFACT_DIGEST) {
    throw new Error("edge_forward_seed_canonical_artifact_digest_mismatch");
  }

  const cohorts = Array.isArray(parsed.cohorts) ? parsed.cohorts : [];
  if (parsed.cohort_count !== 6 || cohorts.length !== 6) {
    throw new Error("edge_forward_seed_canonical_cohort_count_mismatch");
  }

  const signalKeys = new Set();
  const cohortIds = new Set();
  for (const cohort of cohorts) {
    validateFrozenProtocol(cohort);
    if (
      cohort.enrolled_at !== CANONICAL_FORWARD_PAPER_CUTOFF ||
      cohort.observation_cutoff !== CANONICAL_FORWARD_PAPER_CUTOFF
    ) {
      throw new Error("edge_forward_seed_canonical_protocol_cutoff_mismatch");
    }
    if (cohort.minimum_forward_events !== 20 || cohort.minimum_distinct_origins !== 5) {
      throw new Error("edge_forward_seed_canonical_sample_gate_mismatch");
    }
    if (cohort.live_trade_authority !== false || cohort.immutable !== true) {
      throw new Error("edge_forward_seed_canonical_authority_mismatch");
    }
    if (signalKeys.has(cohort.signal_key) || cohortIds.has(cohort.cohort_id)) {
      throw new Error("edge_forward_seed_canonical_duplicate");
    }
    signalKeys.add(cohort.signal_key);
    cohortIds.add(cohort.cohort_id);
  }

  return JSON.parse(JSON.stringify(parsed));
}

export function seedFrozenEnrollment(enrollment, { root } = {}) {
  if (!root) throw new Error("edge_forward_seed_durable_root_required");
  const cohorts = Array.isArray(enrollment?.cohorts) ? enrollment.cohorts : [];
  if (!cohorts.length) throw new Error("edge_forward_seed_cohorts_required");

  for (const cohort of cohorts) validateFrozenProtocol(cohort);

  const durable = new ForwardPaperDurableState({ root });
  const enrollments = cohorts.map((cohort) => durable.enroll(cohort));
  const before = durable.summary();

  const reopened = new ForwardPaperDurableState({ root });
  const after = reopened.summary();

  if (
    before.cohort_count !== after.cohort_count ||
    before.measurement_count !== after.measurement_count ||
    before.head_hash !== after.head_hash
  ) {
    throw new Error("edge_forward_seed_restart_mismatch");
  }

  const verification = cohorts.map((source) => {
    const stored = reopened.getBySignal(source.signal_key);
    if (!stored) throw new Error("edge_forward_seed_signal_missing");
    if (stored.cohort_id !== source.cohort_id) throw new Error("edge_forward_seed_cohort_id_changed");
    if (stored.protocol_hash !== source.protocol_hash) throw new Error("edge_forward_seed_protocol_hash_changed");
    if (stored.enrolled_at !== source.enrolled_at) throw new Error("edge_forward_seed_enrolled_at_changed");
    if (stored.observation_cutoff !== source.observation_cutoff) {
      throw new Error("edge_forward_seed_observation_cutoff_changed");
    }
    return {
      signal_key: source.signal_key,
      cohort_id: source.cohort_id,
      protocol_hash: source.protocol_hash,
      enrolled_at: source.enrolled_at,
      observation_cutoff: source.observation_cutoff,
      preserved_exactly: true,
    };
  });

  return {
    schema: "evercraft.daytrade.forward-paper-seed-receipt.v1",
    source_cohort_count: cohorts.length,
    durable_cohort_count: after.cohort_count,
    enrollments: enrollments.map((row) => ({
      state: row.state,
      cohort_id: row.cohort?.cohort_id || null,
      signal_key: row.cohort?.signal_key || null,
      rejected_new_cohort_id: row.rejected_new_cohort_id || null,
    })),
    verification,
    restart_reopen_verified: true,
    head_hash: after.head_hash,
    live_trade_authority: false,
  };
}

export function seedFrozenEnrollmentFile({
  enrollmentPath = DEFAULT_FROZEN_ENROLLMENT_PATH,
  root,
} = {}) {
  const parsed = enrollmentPath === DEFAULT_FROZEN_ENROLLMENT_PATH
    ? loadCanonicalFrozenEnrollment({ enrollmentPath })
    : JSON.parse(fs.readFileSync(path.resolve(enrollmentPath), "utf8"));
  return seedFrozenEnrollment(parsed, { root });
}

async function main() {
  const enrollmentPath =
    process.env.EDGE_FORWARD_PAPER_ENROLLMENT_PATH ||
    process.argv[2] ||
    DEFAULT_FROZEN_ENROLLMENT_PATH;
  const root =
    process.env.EVERCRAFT_EDGE_LAB_DURABLE_ROOT ||
    process.argv[3] ||
    "";
  const receipt = seedFrozenEnrollmentFile({ enrollmentPath, root });
  console.log(JSON.stringify(receipt, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error("Forward-paper seed failed:", error?.message || String(error));
    process.exitCode = 1;
  });
}
