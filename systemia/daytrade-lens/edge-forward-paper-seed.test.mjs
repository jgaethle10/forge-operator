import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { freezeForwardPaperCohort } from "./edge-forward-paper.mjs";
import {
  seedFrozenEnrollment,
  seedFrozenEnrollmentFile,
} from "./edge-forward-paper-seed.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "edge-seed-root-"));
const source = fs.mkdtempSync(path.join(os.tmpdir(), "edge-seed-source-"));

const review = {
  signal_key: "ai_models|sec_8_k|SOXX|1d",
  cluster_key: "ai_models|sec_8_k|SPY",
  adversarial_status: "FORWARD_PAPER_ELIGIBLE",
};
const evaluation = {
  signal_key: review.signal_key,
  rockies_range: "ai_models",
  observation_kind: "sec_8_k",
  instrument: "SOXX",
  benchmark: "SPY",
  lag_key: "1d",
  learned_direction: "POSITIVE_EXCESS_RETURN",
};
const cohort = freezeForwardPaperCohort(review, evaluation, {
  enrolled_at: "2026-09-30T23:10:52.172Z",
  transaction_cost_bps: 5,
  minimum_forward_events: 20,
  minimum_distinct_origins: 5,
});

const enrollment = {
  schema: "evercraft.daytrade.forward-paper-enrollment.v1",
  cohorts: [cohort],
  live_trade_authority: false,
};

const receipt = seedFrozenEnrollment(enrollment, { root });
assert.equal(receipt.source_cohort_count, 1);
assert.equal(receipt.durable_cohort_count, 1);
assert.equal(receipt.verification[0].enrolled_at, "2026-09-30T23:10:52.172Z");
assert.equal(receipt.verification[0].observation_cutoff, "2026-09-30T23:10:52.172Z");
assert.equal(receipt.verification[0].protocol_hash, cohort.protocol_hash);
assert.equal(receipt.restart_reopen_verified, true);
assert.equal(receipt.live_trade_authority, false);

const duplicate = seedFrozenEnrollment(enrollment, { root });
assert.equal(duplicate.enrollments[0].state, "duplicate");
assert.equal(duplicate.verification[0].cohort_id, cohort.cohort_id);

const file = path.join(source, "forward-paper-cohorts.json");
fs.writeFileSync(file, JSON.stringify(enrollment, null, 2));
const root2 = fs.mkdtempSync(path.join(os.tmpdir(), "edge-seed-root2-"));
const fromFile = seedFrozenEnrollmentFile({ enrollmentPath: file, root: root2 });
assert.equal(fromFile.verification[0].protocol_hash, cohort.protocol_hash);


const canonicalPath = path.resolve(
  "systemia/daytrade-lens/frozen/forward-paper-cohorts-2026-09-30.json"
);
const canonical = JSON.parse(fs.readFileSync(canonicalPath, "utf8"));
assert.equal(canonical.cohort_count, 6);
assert.equal(canonical.cohorts.length, 6);
assert.ok(canonical.cohorts.every((row) => row.enrolled_at === "2026-09-30T23:10:52.172Z"));
assert.ok(canonical.cohorts.every((row) => row.observation_cutoff === "2026-09-30T23:10:52.172Z"));
assert.deepEqual(
  canonical.cohorts.map((row) => row.protocol_hash).sort(),
  [
    "22ea75a0c57431c6a7f24a19fd33b66ca646b7df6b55acbca95ac4c0e247532f",
    "29a22b58b874a6e2e67f335ce623907533236a0661661fbca5f51a593a80a50a",
    "54602e95f170ad2f4c5f799cc45923e161a654e28312b0c01602f0cdd875fae0",
    "d129c116e7639b613c6c29f664b8419bf686802277f56b18a5a7499df00d684b",
    "ead63d28c4c2ff1b4f662b1bb493dd1ff4f4ba05105b0d53803125d8712d95df",
    "f50c186a5a795bbe41f6720cf59303762d305711aaf0228fa6089f777475abc6",
  ].sort()
);
const canonicalRoot = fs.mkdtempSync(path.join(os.tmpdir(), "edge-seed-canonical-"));
const canonicalReceipt = seedFrozenEnrollment(canonical, { root: canonicalRoot });
assert.equal(canonicalReceipt.source_cohort_count, 6);
assert.equal(canonicalReceipt.durable_cohort_count, 6);
assert.ok(canonicalReceipt.verification.every((row) => row.preserved_exactly === true));
assert.equal(canonicalReceipt.restart_reopen_verified, true);

console.log(JSON.stringify({
  ok:true,
  schema:"evercraft.daytrade.forward-paper-seed-proof.v1",
  original_enrollment_timestamp_preserved:true,
  original_observation_cutoff_preserved:true,
  protocol_hash_preserved:true,
  cohort_id_preserved:true,
  idempotent_seed:true,
  restart_reopen_verified:true,
  canonical_six_cohort_receipt_preserved:true,
  live_trade_authority:false,
}));
