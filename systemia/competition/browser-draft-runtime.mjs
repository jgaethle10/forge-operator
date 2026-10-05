import { createHash } from "node:crypto";

function sha256(value) {
  return "sha256:" + createHash("sha256").update(String(value)).digest("hex");
}

function clean(value) {
  return String(value ?? "").trim();
}

function baseReceipt(job, state, extra = {}) {
  const body = {
    schema: "evercraft.systemia.competition-browser-draft-receipt.v1",
    job_id: clean(job?.job_id),
    provider: clean(job?.provider).toLowerCase(),
    competition_ref: clean(job?.competition_ref) || null,
    state,
    draft_attempted: false,
    draft_actions_executed: 0,
    submission_attempted: false,
    provider_submission_receipt_verified: false,
    final_submission_authority: false,
    accepts_new_terms: false,
    payment_authority: false,
    staking_authority: false,
    secret_entry_authority: false,
    human_claim_token_received: false,
    base44_used: false,
    public_fabric_used: false,
    observed_at: new Date().toISOString(),
    ...extra,
  };
  return { ...body, receipt_hash: sha256(JSON.stringify(body)) };
}

function validDraftAction(action = {}) {
  const type = clean(action.type);
  if (["wait", "scroll", "navigate", "fill"].includes(type)) return true;
  if (type === "click") return ["nonbinding", "draft_save"].includes(clean(action.intent));
  return false;
}

export async function executeBrowserDraftJob(job, {
  yard,
  deploymentId = "evercraft-web-browser",
} = {}) {
  if (!yard || typeof yard.browserDelegatedSnapshot !== "function" || typeof yard.browserDelegatedAction !== "function") {
    return baseReceipt(job, "held_yard_browser_executor_unavailable");
  }
  if (clean(job?.raven_qa_state).toLowerCase() !== "passed") {
    return baseReceipt(job, "held_raven_qa_not_passed");
  }
  if (!clean(job?.session_id)) {
    return baseReceipt(job, "held_human_authentication_or_delegation_gate");
  }
  const actions = Array.isArray(job?.draft_actions) ? job.draft_actions : [];
  if (actions.length === 0) {
    return baseReceipt(job, "held_draft_actions_missing");
  }
  if (actions.length > 80 || actions.some((action) => !validDraftAction(action))) {
    return baseReceipt(job, "held_invalid_or_overbroad_draft_actions");
  }

  let before;
  try {
    before = await yard.browserDelegatedSnapshot(deploymentId, { sessionId: job.session_id });
  } catch (error) {
    return baseReceipt(job, "held_human_authentication_or_delegation_gate", {
      executor_error: clean(error?.message || error).slice(0, 240),
    });
  }

  if (before?.result?.mode !== "competition_draft_automation") {
    return baseReceipt(job, "held_delegation_mode_unverified");
  }
  if (before?.result?.delegation?.final_submission_authority !== false) {
    return baseReceipt(job, "held_delegation_authority_mismatch");
  }

  const actionReceipts = [];
  for (const action of actions) {
    let executed;
    try {
      executed = await yard.browserDelegatedAction(deploymentId, {
        sessionId: job.session_id,
        action,
      });
    } catch (error) {
      return baseReceipt(job, "provider_draft_action_failed", {
        draft_attempted: actionReceipts.length > 0,
        draft_actions_executed: actionReceipts.length,
        executor_error: clean(error?.message || error).slice(0, 240),
        action_receipt_refs: actionReceipts.map((row) => row.compute_receipt_hash).filter(Boolean),
      });
    }
    const result = executed?.result || {};
    if (
      result.final_submission_authority !== false ||
      result.payment_authority !== false ||
      result.accepts_new_terms !== false
    ) {
      return baseReceipt(job, "held_delegation_authority_mismatch", {
        draft_attempted: true,
        draft_actions_executed: actionReceipts.length,
      });
    }
    actionReceipts.push({
      type: clean(action.type),
      intent: clean(action.intent) || null,
      compute_receipt_hash: executed.compute_receipt_hash || null,
      selector_sha256: action.selector ? sha256(action.selector) : null,
      char_count: action.type === "fill" ? String(action.value ?? "").length : null,
      secret_text_recorded: false,
    });
  }

  let after;
  try {
    after = await yard.browserDelegatedSnapshot(deploymentId, { sessionId: job.session_id });
  } catch (error) {
    return baseReceipt(job, "provider_draft_postcheck_failed", {
      draft_attempted: true,
      draft_actions_executed: actionReceipts.length,
      action_receipt_refs: actionReceipts.map((row) => row.compute_receipt_hash).filter(Boolean),
      executor_error: clean(error?.message || error).slice(0, 240),
    });
  }

  return baseReceipt(job, "draft_prepared_yard_receipts_verified", {
    draft_attempted: true,
    draft_actions_executed: actionReceipts.length,
    action_receipts: actionReceipts,
    before_snapshot_receipt: before.compute_receipt_hash || null,
    after_snapshot_receipt: after.compute_receipt_hash || null,
    after_screenshot_sha256: after?.result?.screenshot_sha256 || null,
    provider_submission_receipt_verified: false,
    submission_attempted: false,
  });
}

export const browserDraftPolicy = {
  route: ["systemia", "raven_qa", "yard", "evercraft_compute", "authenticated_browser_delegation"],
  purpose: "prepare_provider_draft_only",
  final_submission: "human_gate_when_provider_requires_legal_acceptance_or_attestation",
  accepts_new_terms: false,
  payments: false,
  staking: false,
  secret_entry: false,
};
