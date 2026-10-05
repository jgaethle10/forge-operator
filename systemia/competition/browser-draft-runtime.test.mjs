import test from "node:test";
import assert from "node:assert/strict";
import { executeBrowserDraftJob } from "./browser-draft-runtime.mjs";

function fakeYard() {
  const calls = [];
  return {
    calls,
    async browserDelegatedSnapshot(_deploymentId, { sessionId }) {
      calls.push({ type: "snapshot", sessionId });
      return {
        ok: true,
        compute_receipt_hash: "a".repeat(64),
        result: {
          mode: "competition_draft_automation",
          screenshot_sha256: "b".repeat(64),
          delegation: {
            final_submission_authority: false,
            payment_authority: false,
            accepts_new_terms: false,
          },
        },
      };
    },
    async browserDelegatedAction(_deploymentId, { sessionId, action }) {
      calls.push({ type: "action", sessionId, action });
      return {
        ok: true,
        compute_receipt_hash: "c".repeat(64),
        result: {
          ok: true,
          type: action.type,
          final_submission_authority: false,
          payment_authority: false,
          accepts_new_terms: false,
          secret_text_recorded: false,
        },
      };
    },
  };
}

test("browser draft executor prepares fields without claiming submission", async () => {
  const yard = fakeYard();
  const receipt = await executeBrowserDraftJob({
    job_id: "qloo-draft",
    provider: "devpost",
    competition_ref: "qloo-agentic-hackathon-2026",
    raven_qa_state: "passed",
    session_id: "session-1",
    draft_actions: [
      { type: "fill", selector: "#title", value: "Systemia" },
      { type: "fill", selector: "#description", value: "Bounded description" },
      { type: "click", selector: "#save", intent: "draft_save" },
    ],
  }, { yard });

  assert.equal(receipt.state, "draft_prepared_yard_receipts_verified");
  assert.equal(receipt.draft_actions_executed, 3);
  assert.equal(receipt.submission_attempted, false);
  assert.equal(receipt.provider_submission_receipt_verified, false);
  assert.equal(receipt.final_submission_authority, false);
  assert.equal(receipt.accepts_new_terms, false);
  assert.equal(receipt.human_claim_token_received, false);
  assert.equal(JSON.stringify(receipt).includes("Bounded description"), false);
  assert.equal(yard.calls.filter((x) => x.type === "snapshot").length, 2);
});

test("browser draft executor holds before Raven QA", async () => {
  const yard = fakeYard();
  const receipt = await executeBrowserDraftJob({
    job_id: "unsafe",
    provider: "devpost",
    raven_qa_state: "pending",
    session_id: "session-1",
    draft_actions: [{ type: "fill", selector: "#title", value: "x" }],
  }, { yard });
  assert.equal(receipt.state, "held_raven_qa_not_passed");
  assert.equal(yard.calls.length, 0);
});

test("missing delegated session becomes one human authentication gate", async () => {
  const yard = fakeYard();
  const receipt = await executeBrowserDraftJob({
    job_id: "login",
    provider: "devpost",
    raven_qa_state: "passed",
    draft_actions: [{ type: "fill", selector: "#title", value: "x" }],
  }, { yard });
  assert.equal(receipt.state, "held_human_authentication_or_delegation_gate");
  assert.equal(receipt.submission_attempted, false);
});

test("final-submit shaped actions are rejected before Yard", async () => {
  const yard = fakeYard();
  const receipt = await executeBrowserDraftJob({
    job_id: "submit",
    provider: "devpost",
    raven_qa_state: "passed",
    session_id: "session-1",
    draft_actions: [{ type: "click", selector: "#submit", intent: "final_submit" }],
  }, { yard });
  assert.equal(receipt.state, "held_invalid_or_overbroad_draft_actions");
  assert.equal(yard.calls.length, 0);
});

test("executor fails closed if delegated browser ever reports broader authority", async () => {
  const yard = fakeYard();
  yard.browserDelegatedSnapshot = async () => ({
    ok: true,
    compute_receipt_hash: "a".repeat(64),
    result: {
      mode: "competition_draft_automation",
      delegation: { final_submission_authority: true },
    },
  });
  const receipt = await executeBrowserDraftJob({
    job_id: "authority-drift",
    provider: "devpost",
    raven_qa_state: "passed",
    session_id: "session-1",
    draft_actions: [{ type: "fill", selector: "#title", value: "x" }],
  }, { yard });
  assert.equal(receipt.state, "held_delegation_authority_mismatch");
});
