import crypto from "node:crypto";

export const TEAM_REVIEW_WORK_TYPES = Object.freeze(["analyze", "research", "qa"]);

export const TEAM_REVIEW_ROLES = Object.freeze([
  Object.freeze({
    reviewer_id: "commercial",
    label: "Commercial",
    brief: "Challenge revenue logic, customer acquisition, pricing, attribution, deal structure, and whether the proposed wedge can create collected contribution.",
  }),
  Object.freeze({
    reviewer_id: "operations",
    label: "Operations",
    brief: "Challenge capacity, fulfillment, staffing, inventory, workflow burden, sequencing, and whether execution creates more work than value.",
  }),
  Object.freeze({
    reviewer_id: "finance",
    label: "Finance",
    brief: "Challenge contribution margin, cash timing, cost allocation, downside exposure, baseline math, revenue-share economics, and measurement design.",
  }),
  Object.freeze({
    reviewer_id: "risk",
    label: "Risk & Evidence",
    brief: "Challenge unsupported claims, legal or compliance assumptions, evidence quality, brand risk, authority boundaries, and missing facts.",
  }),
  Object.freeze({
    reviewer_id: "customer",
    label: "Customer",
    brief: "Challenge offer desirability, customer friction, trust, positioning, retention logic, and whether the intervention actually improves the operator/customer experience.",
  }),
  Object.freeze({
    reviewer_id: "challenger",
    label: "Challenger",
    brief: "Argue against the plan. Identify the strongest reason to hold, reject, narrow, or choose a different target. Surface failure modes other reviewers may normalize.",
  }),
]);

function clean(value, max = 20000) {
  return String(value ?? "").replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, max);
}

function sha256(value) {
  return "sha256:" + crypto.createHash("sha256").update(String(value)).digest("hex");
}

function safeArray(value, limit = 100) {
  return [...new Set((Array.isArray(value) ? value : []).map((v) => clean(v, 2000)).filter(Boolean))].slice(0, limit);
}

function assertRequest(request) {
  if (!request || request.schema !== "evercraft.nexus.team-review.request.v1") {
    throw new Error("team_review_request_schema_invalid");
  }
  if (!clean(request.request_id, 200)) throw new Error("team_review_request_id_required");
  if (!clean(request.mission_key, 260)) throw new Error("team_review_mission_key_required");
  if (!clean(request.work_key, 260)) throw new Error("team_review_work_key_required");
  const workType = clean(request.work_type, 80).toLowerCase();
  if (!TEAM_REVIEW_WORK_TYPES.includes(workType)) throw new Error("team_review_work_type_not_allowed");
  if (!clean(request.objective, 16000)) throw new Error("team_review_objective_required");
  if (!["role_lenses", "commissioned"].includes(request.requested_team)) throw new Error("team_review_requested_team_invalid");

  const required = [
    "internal_analysis_only",
    "read_only",
    "no_external_messages",
    "no_publication",
    "no_deployment",
    "no_purchase",
    "no_payment",
    "no_account_changes",
    "no_credential_return",
  ];
  for (const key of required) {
    if (request.constraints?.[key] !== true) throw new Error("team_review_constraint_missing:" + key);
  }
  return workType;
}

function rolePrompt(request, role) {
  return [
    "SYSTEMIA-ADMITTED INTERNAL REVIEW",
    "You are one bounded reviewer inside Raven Nexus. You do not have authority to contact anyone, publish, deploy, purchase, pay, change accounts, or take external action.",
    "",
    "REVIEW ROLE: " + role.label,
    role.brief,
    "",
    "MISSION: " + clean(request.mission_key, 260),
    "WORK TYPE: " + clean(request.work_type, 80),
    "OBJECTIVE / PACKET:",
    clean(request.objective, 16000),
    "",
    "RESPONSE REQUIREMENTS:",
    "Return a concise review with: VERDICT (GO, GO WITH CHANGES, HOLD, or NO-GO); strongest point; biggest weakness; missing evidence; recommended next action; and concrete failure modes.",
    "Do not invent external facts. If a factual claim needs evidence not present in the packet, label it NEEDS EVIDENCE.",
    "Do not collapse disagreement to be agreeable.",
  ].join("\n");
}

function synthesisPrompt(request, reviews) {
  const rendered = reviews.map((r) => [
    "REVIEWER: " + r.label + " (" + r.reviewer_id + ")",
    r.text,
  ].join("\n")).join("\n\n---\n\n");

  return [
    "SYSTEMIA-ADMITTED RAVEN TEAM SYNTHESIS",
    "Synthesize the independent role reviews below. Preserve material disagreement instead of averaging it away.",
    "Do not add external facts that are not present in the mission packet or reviewer outputs.",
    "",
    "MISSION OBJECTIVE:",
    clean(request.objective, 16000),
    "",
    "ROLE REVIEWS:",
    rendered,
    "",
    "RETURN:",
    "1. FINAL VERDICT: GO, GO WITH CHANGES, HOLD, or NO-GO.",
    "2. CONSENSUS: points supported by multiple lanes.",
    "3. DISAGREEMENTS: where lanes materially differ.",
    "4. REQUIRED CHANGES BEFORE ACTION.",
    "5. FIRST ACTION ONLY.",
    "6. MEASUREMENT / RECEIPT STANDARD.",
  ].join("\n");
}

export function createHttpInferenceAdapter({
  origin = "",
  token = "",
  fetchImpl = globalThis.fetch,
  timeoutMs = 120000,
} = {}) {
  const base = clean(origin, 2000).replace(/\/$/, "");
  const secret = clean(token, 8000);
  if (!base || !secret) return null;

  const url = new URL(base);
  const loopback = ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) {
    throw new Error("raven_inference_origin_must_be_https_or_loopback_http");
  }
  if (url.hostname.includes("base44.app") || /(^|\.)base44\.com$/i.test(url.hostname)) {
    throw new Error("legacy_provider_not_allowed_for_raven_inference");
  }

  return {
    adapter_id: "raven.http-inference.v1",
    async infer({ request_id, role, prompt }) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(base + "/v1/infer", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "authorization": "Bearer " + secret,
          },
          body: JSON.stringify({
            schema: "evercraft.raven.inference.request.v1",
            request_id,
            role,
            input: prompt,
            constraints: {
              internal_analysis_only: true,
              no_external_actions: true,
              no_credential_return: true,
            },
          }),
          signal: controller.signal,
        });
        const body = await response.json().catch(() => ({
          status: "failed",
          error: "inference_adapter_non_json_response",
        }));
        if (!response.ok || body?.status !== "completed" || !clean(body?.text, 50000)) {
          const error = new Error(clean(body?.blocked_reason || body?.error || ("inference_http_" + response.status), 2000));
          error.provider_receipt = clean(body?.provider_receipt, 1000);
          throw error;
        }
        return {
          text: clean(body.text, 50000),
          provider: clean(body.provider || "configured-inference-gateway", 200),
          model: clean(body.model, 300) || null,
          provider_receipt: clean(body.provider_receipt, 1000) || null,
          started_at: clean(body.started_at, 100) || null,
          completed_at: clean(body.completed_at, 100) || null,
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export function createRavenTeamReviewExecutor({
  inferenceAdapter,
  roles = TEAM_REVIEW_ROLES,
  now = () => new Date(),
  commissionedGate = null,
} = {}) {
  if (!inferenceAdapter || typeof inferenceAdapter.infer !== "function") return null;
  const reviewers = roles.filter(Boolean).slice(0, 12);

  return async function executeTeamReview(request) {
    assertRequest(request);
    const startedAt = now().toISOString();
    const commissioned = request.requested_team === "commissioned";
    let preflight = null;
    if (commissioned) {
      if (!commissionedGate || typeof commissionedGate.preflight !== "function") {
        return {
          status: "blocked",
          blocked_reason: "commissioned_team_verifier_not_configured",
          commissioned_identity_verified: false,
          inference_calls_performed: 0,
        };
      }
      try {
        preflight = await commissionedGate.preflight(request, {
          reviewerIds: reviewers.map((role) => role.reviewer_id),
        });
      } catch {
        return {
          status: "blocked",
          blocked_reason: "commissioned_team_preflight_unavailable",
          commissioned_identity_verified: false,
          inference_calls_performed: 0,
        };
      }
      if (!preflight?.allowed) {
        return {
          status: "blocked",
          blocked_reason: preflight?.reason || "commissioned_team_preflight_denied",
          commissioned_identity_verified: false,
          inference_calls_performed: 0,
        };
      }
    }
    const outputs = await Promise.all(reviewers.map(async (role) => {
      const callId = clean(request.request_id, 200) + ":" + role.reviewer_id;
      try {
        const result = await inferenceAdapter.infer({
          request_id: callId,
          role: role.reviewer_id,
          prompt: rolePrompt(request, role) +
            (commissioned ? "\nSIGNED COMMISSIONED ROLE ID: " +
              preflight.reviewer_assignments[role.reviewer_id] : ""),
        });
        return {
          reviewer_id: role.reviewer_id,
          label: role.label,
          status: "completed",
          text: result.text,
          provider: result.provider,
          model: result.model,
          provider_receipt: result.provider_receipt,
          response_sha256: sha256(result.text),
        };
      } catch (error) {
        return {
          reviewer_id: role.reviewer_id,
          label: role.label,
          status: "failed",
          text: "",
          provider: null,
          model: null,
          provider_receipt: clean(error?.provider_receipt, 1000) || null,
          error: clean(error?.message || error, 2000),
        };
      }
    }));

    const completed = outputs.filter((row) => row.status === "completed");
    if (completed.length === 0) {
      return {
        status: "blocked",
        blocked_reason: "All Raven review lanes failed or were unavailable.",
        started_at: startedAt,
        completed_at: now().toISOString(),
        results: outputs,
        provider_receipt: null,
      };
    }

    let synthesis = null;
    try {
      synthesis = await inferenceAdapter.infer({
        request_id: clean(request.request_id, 200) + ":synthesis",
        role: "synthesis",
        prompt: synthesisPrompt(request, completed),
      });
    } catch (error) {
      return {
        status: "blocked",
        blocked_reason: "Raven review lanes returned, but synthesis failed: " + clean(error?.message || error, 1500),
        started_at: startedAt,
        completed_at: now().toISOString(),
        results: outputs,
        provider_receipt: clean(error?.provider_receipt, 1000) || null,
      };
    }

    let completion = null;
    if (commissioned) {
      try {
        completion = await commissionedGate.completion({
          request, preflight, reviewers: completed, synthesis,
        });
      } catch {
        completion = { allowed: false, reason: "commissioned_team_completion_unavailable" };
      }
      if (!completion?.allowed) {
        return {
          status: "blocked",
          blocked_reason: completion?.reason || "commissioned_team_completion_denied",
          started_at: startedAt,
          completed_at: now().toISOString(),
          results: outputs,
          commissioned_identity_verified: false,
          inference_calls_performed: outputs.length + 1,
        };
      }
    }

    const receiptCore = {
      schema: "evercraft.raven.team-review-receipt.v1",
      review_mode: request.requested_team,
      commissioned_identity_verified: commissioned && completion?.allowed === true,
      actual_all_roster_liveness_verified: false,
      commissioned_completion_ref: completion?.completion_ref || null,
      request_id: clean(request.request_id, 200),
      mission_key: clean(request.mission_key, 260),
      work_key: clean(request.work_key, 260),
      completed_reviewers: completed.map((row) => row.reviewer_id),
      failed_reviewers: outputs.filter((row) => row.status !== "completed").map((row) => row.reviewer_id),
      synthesis_sha256: sha256(synthesis.text),
      reviewer_hashes: completed.map((row) => row.response_sha256),
      external_side_effects_authorized: false,
      base44_used: false,
      completed_at: now().toISOString(),
    };
    const receiptHash = sha256(JSON.stringify(receiptCore));

    return {
      status: "completed",
      provider: synthesis.provider,
      provider_receipt: synthesis.provider_receipt || receiptHash,
      summary: synthesis.text,
      results: outputs,
      started_at: startedAt,
      completed_at: receiptCore.completed_at,
      raven_receipt: { ...receiptCore, receipt_hash: receiptHash },
      review_mode: request.requested_team,
      commissioned_identity_verified: commissioned && completion?.allowed === true,
    };
  };
}
