import test from "node:test";
import assert from "node:assert/strict";
import { classifyCompetitionOpportunity, compileHumanGateQueue, runCompetitionControlPlane } from "./control-plane.mjs";

const NOW = new Date("2026-10-05T21:00:00Z");

test("keeps team blockers off Jesse's human queue", () => {
  const result = classifyCompetitionOpportunity({
    opportunity_id: "qloo-2026",
    provider: "devpost",
    title: "Qloo Agentic Hackathon",
    deadline: "2026-10-31T03:45:00Z",
    rules: { verification_state: "verified", eligible: true },
    authorization: { provider_authenticated: false },
    build: { state: "not_started", raven_qa_state: "not_run", submission_package_ready: false },
  }, { now: NOW });

  assert.equal(result.state, "internal_repair_required");
  assert.deepEqual(result.human_gates, []);
  assert.ok(result.team_blockers.includes("provider_auth_session_missing"));
  assert.ok(result.team_blockers.includes("provider_submission_executor_not_owned"));
  assert.equal(result.notify_human, false);
  assert.equal(result.next_team_action, "establish_raven_provider_session");
});

test("terms and MFA become human gates while team keeps building", () => {
  const result = classifyCompetitionOpportunity({
    opportunity_id: "aws-agentic-2026",
    provider: "devpost",
    title: "AWS Agentic AI Partner Hackathon",
    deadline: "2026-10-28T20:00:00Z",
    rules: {
      verification_state: "verified",
      eligible: true,
      new_terms_required: true,
      mfa_required: true,
    },
    authorization: {
      provider_authenticated: true,
      terms_state: "not_accepted",
      mfa_satisfied: false,
      submission_executor: "browser_required",
    },
    build: { state: "not_started", raven_qa_state: "not_run", submission_package_ready: false },
  }, { now: NOW });

  assert.equal(result.state, "team_can_advance_human_gate_pending");
  assert.deepEqual(result.human_gates, ["accept_terms", "mfa"]);
  assert.equal(result.team_can_continue_preparation, true);
  assert.equal(result.notify_human, true);
});

test("verified Kaggle lane becomes autonomous only after build, QA and package", () => {
  const result = classifyCompetitionOpportunity({
    opportunity_id: "google-gemma-2026",
    provider: "kaggle",
    title: "Google Gemma 4 Developer Agent Competition",
    deadline: "2026-11-13T00:00:00Z",
    rules: { verification_state: "verified", eligible: true, new_terms_required: false },
    authorization: {
      provider_authenticated: true,
      submission_executor: "api",
      terms_state: "entered",
    },
    build: { state: "built", raven_qa_state: "passed", submission_package_ready: true },
  }, { now: NOW });

  assert.equal(result.state, "autonomous_submission_ready");
  assert.equal(result.submission_ready, true);
  assert.deepEqual(result.human_gates, []);
  assert.deepEqual(result.team_blockers, []);
  assert.equal(result.next_team_action, "submit_and_verify_provider_receipt");
});

test("gate queue is deadline ordered and deduplicated", () => {
  const items = [
    { provider: "devpost", opportunity_id: "b", title: "B", deadline: "2026-10-30T00:00:00Z", human_gates: ["accept_terms", "accept_terms"] },
    { provider: "devpost", opportunity_id: "a", title: "A", deadline: "2026-10-20T00:00:00Z", human_gates: ["mfa"] },
  ];
  const queue = compileHumanGateQueue(items);
  assert.equal(queue.length, 2);
  assert.equal(queue[0].opportunity_id, "a");
});

test("control plane never calls drafts or blockers a submission", () => {
  const receipt = runCompetitionControlPlane([{
    opportunity_id: "x",
    provider: "devpost",
    title: "X",
    deadline: "2026-10-30T00:00:00Z",
    rules: { verification_state: "unverified", eligible: true },
    authorization: {},
    build: {},
  }], { now: NOW });

  assert.equal(receipt.summary.autonomous_submission_ready, 0);
  assert.equal(receipt.policy.success_requires_provider_receipt, true);
});
