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

  assert.equal(result.state, "team_can_advance_human_gate_deferred");
  assert.deepEqual(result.human_gates, ["accept_terms", "mfa"]);
  assert.equal(result.team_can_continue_preparation, true);
  assert.equal(result.notify_human, false);
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

test("gate queue is deadline ordered, deduplicated, and only includes due gates", () => {
  const items = [
    { provider: "devpost", opportunity_id: "b", title: "B", deadline: "2026-10-30T00:00:00Z", human_gates: ["accept_terms", "accept_terms"], human_gate_packets: [{ gate: "accept_terms", actionable: true, action_url: "https://example.com/gate", action: "Complete the provider gate.", why: "Provider requires account-holder action.", after: "Systemia resumes." }], notify_human: true },
    { provider: "devpost", opportunity_id: "a", title: "A", deadline: "2026-10-20T00:00:00Z", human_gates: ["mfa"], human_gate_packets: [{ gate: "mfa", actionable: true, action_url: "https://example.com/gate", action: "Complete the provider gate.", why: "Provider requires account-holder action.", after: "Systemia resumes." }], notify_human: true },
    { provider: "devpost", opportunity_id: "deferred", title: "Deferred", deadline: "2026-10-10T00:00:00Z", human_gates: ["accept_terms"], notify_human: false },
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


test("human gate becomes due once team preparation is complete", () => {
  const result = classifyCompetitionOpportunity({
    opportunity_id: "ready-devpost",
    provider: "devpost",
    title: "Ready Devpost Entry",
    deadline: "2026-10-30T00:00:00Z",
    rules: {
      verification_state: "verified",
      eligible: true,
      new_terms_required: true,
    },
    authorization: {
      provider_authenticated: true,
      terms_state: "not_accepted",
      submission_executor: "api",
    },
    build: { state: "built", raven_qa_state: "passed", submission_package_ready: true },
    human_gate_details: {
      accept_terms: {
        action_url: "https://example.com/competition/rules",
        action: "Open the provider page and click Accept Rules.",
        why: "The provider requires the account holder to accept the current competition rules before entry.",
        after: "Systemia resumes provider submission and verifies the external receipt.",
      },
    },
  }, { now: NOW });

  assert.equal(result.state, "held_human_gate");
  assert.equal(result.human_gate_due, true);
  assert.equal(result.notify_human, true);
});


test("vague human gate stays with Systemia instead of notifying Jesse", () => {
  const result = classifyCompetitionOpportunity({
    opportunity_id: "unclear-kaggle",
    provider: "kaggle",
    title: "Unclear Kaggle Entry",
    deadline: "2026-11-30T00:00:00Z",
    rules: {
      verification_state: "verified",
      eligible: true,
      new_terms_required: true,
    },
    authorization: {
      provider_authenticated: true,
      terms_state: "not_accepted",
      submission_executor: "api",
    },
    build: { state: "built", raven_qa_state: "passed", submission_package_ready: true },
  }, { now: NOW });

  assert.equal(result.notify_human, false);
  assert.equal(result.human_gate_actionable, false);
  assert.ok(result.team_blockers.includes("human_gate_packet_incomplete"));
  assert.equal(result.next_team_action, "prepare_exact_human_gate_packet");
  assert.equal(compileHumanGateQueue([result]).length, 0);
});

test("human gate queue carries the exact click packet", () => {
  const result = classifyCompetitionOpportunity({
    opportunity_id: "clear-kaggle",
    provider: "kaggle",
    title: "Clear Kaggle Entry",
    deadline: "2026-11-30T00:00:00Z",
    rules: {
      verification_state: "verified",
      eligible: true,
      new_terms_required: true,
    },
    authorization: {
      provider_authenticated: true,
      terms_state: "not_accepted",
      submission_executor: "api",
    },
    build: { state: "built", raven_qa_state: "passed", submission_package_ready: true },
    human_gate_details: {
      accept_terms: {
        action_url: "https://example.com/competition/rules",
        action: "Click Accept Rules.",
        why: "Provider requires account-holder acceptance.",
        after: "Systemia takes submission back over.",
      },
    },
  }, { now: NOW });

  const queue = compileHumanGateQueue([result]);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].action_url, "https://example.com/competition/rules");
  assert.equal(queue[0].action, "Click Accept Rules.");
  assert.equal(queue[0].after, "Systemia takes submission back over.");
});
