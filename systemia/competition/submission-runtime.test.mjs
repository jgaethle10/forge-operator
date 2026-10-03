import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { executeSubmissionJob, competitionSubmissionPolicy } from "./submission-runtime.mjs";

function artifact() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "systemia-comp-"));
  const file = path.join(dir, "submission.csv");
  fs.writeFileSync(file, "id,prediction\n1,0.5\n");
  return file;
}

test("policy allows autonomous submission only behind existing accepted terms and Raven QA", () => {
  assert.equal(competitionSubmissionPolicy.submission, "autonomous_existing_terms_only");
  assert.equal(competitionSubmissionPolicy.participation, "human_gate_if_new_terms_required");
  assert.equal(competitionSubmissionPolicy.staking, "disabled");
  assert.equal(competitionSubmissionPolicy.payments, "disabled");
});

test("Kaggle job submits after accepted terms and Raven QA and requires provider receipt", async () => {
  let seen = null;
  const receipt = await executeSubmissionJob({
    job_id: "kaggle-proof",
    provider: "kaggle",
    competition_ref: "example-competition",
    terms_state: "entered",
    raven_qa_state: "passed",
    artifact_path: artifact(),
    message: "Systemia proof",
    submission_authority: "authorized_existing_terms_only",
  }, {
    env: { RAVEN_KAGGLE_ACCESS_TOKEN: "secret-token" },
    runCommandImpl: async (command, args, options) => {
      seen = { command, args, token: options.env.KAGGLE_API_TOKEN };
      return { code: 0, stdout: "Submission ref: 12345678\n", stderr: "", error_name: null };
    },
  });
  assert.equal(seen.command, "kaggle");
  assert.equal(seen.token, "secret-token");
  assert.ok(seen.args.includes("example-competition"));
  assert.equal(receipt.state, "submitted_provider_receipt_verified");
  assert.equal(receipt.provider_submission_ref, "12345678");
  assert.equal(receipt.staking_attempted, false);
  assert.equal(JSON.stringify(receipt).includes("secret-token"), false);
});

test("new Kaggle terms remain a human gate and no provider call occurs", async () => {
  let calls = 0;
  const receipt = await executeSubmissionJob({
    job_id: "terms-gate",
    provider: "kaggle",
    competition_ref: "new-comp",
    terms_state: "not_accepted",
    raven_qa_state: "passed",
    artifact_path: artifact(),
    submission_authority: "authorized_existing_terms_only",
  }, {
    env: { RAVEN_KAGGLE_ACCESS_TOKEN: "secret-token" },
    runCommandImpl: async () => { calls += 1; return { code: 0, stdout: "", stderr: "" }; },
  });
  assert.equal(calls, 0);
  assert.equal(receipt.state, "held_human_terms_gate");
  assert.equal(receipt.terms_accepted_by_agent, false);
});

test("Numerai upload is autonomous after QA without staking authority", async () => {
  let seen = null;
  const receipt = await executeSubmissionJob({
    job_id: "numerai-proof",
    provider: "numerai",
    terms_state: "accepted",
    raven_qa_state: "passed",
    artifact_path: artifact(),
    model_id: "model-123",
    submission_authority: "authorized_existing_terms_only",
  }, {
    env: {
      RAVEN_NUMERAI_PUBLIC_ID: "public-id",
      RAVEN_NUMERAI_SECRET_KEY: "secret-key",
    },
    runCommandImpl: async (command, args, options) => {
      seen = { command, args, publicId: options.env.NUMERAI_PUBLIC_ID };
      return { code: 0, stdout: JSON.stringify({ submission_id: "sub-987" }) + "\n", stderr: "", error_name: null };
    },
  });
  assert.equal(seen.command, "python3");
  assert.equal(seen.publicId, "public-id");
  assert.equal(receipt.state, "submitted_provider_receipt_verified");
  assert.equal(receipt.provider_submission_ref, "sub-987");
  assert.equal(receipt.staking_attempted, false);
  assert.equal(receipt.payment_attempted, false);
  assert.equal(JSON.stringify(receipt).includes("secret-key"), false);
});

test("submission authority defaults fail closed", async () => {
  let calls = 0;
  const receipt = await executeSubmissionJob({
    job_id: "no-authority",
    provider: "kaggle",
    competition_ref: "comp",
    terms_state: "entered",
    raven_qa_state: "passed",
    artifact_path: artifact(),
  }, {
    env: { RAVEN_KAGGLE_ACCESS_TOKEN: "secret-token" },
    runCommandImpl: async () => { calls += 1; return { code: 0, stdout: "", stderr: "" }; },
  });
  assert.equal(calls, 0);
  assert.equal(receipt.state, "held_submission_authority_missing");
});
