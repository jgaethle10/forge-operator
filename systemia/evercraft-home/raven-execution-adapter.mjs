import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  createCapabilityRegistry,
  executeGoalWorkWithAdapter,
} from "../organism/capability-runtime.mjs";

const READ_ONLY_WORK_TYPES = Object.freeze(["analyze", "research", "qa"]);

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function shortHash(value, length = 16) {
  return crypto.createHash("sha256").update(String(value ?? "")).digest("hex").slice(0, length);
}

function normalizeBridgeUrl(value) {
  const raw = clean(value).replace(/\/$/, "");
  if (!raw) return "";
  const url = new URL(raw);
  const loopback = ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) {
    throw new Error("raven_nexus_work_url_must_be_https_or_loopback_http");
  }
  if (/base44\.(app|com)$/i.test(url.hostname) || url.hostname.includes("base44.app")) {
    throw new Error("legacy_provider_not_allowed_in_owned_raven_execution_path");
  }
  return raw;
}

function safeArray(value, limit = 50) {
  return [...new Set((Array.isArray(value) ? value : []).map(clean).filter(Boolean))].slice(0, limit);
}

function persistReceipt(receiptDir, receipt) {
  const dir = clean(receiptDir);
  if (!dir) return null;
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `${receipt.request_id}.json`);
  fs.writeFileSync(file, JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600 });
  return file;
}

export function ravenReadOnlyWorkTypes() {
  return [...READ_ONLY_WORK_TYPES];
}

export function createRavenReadOnlyTeamAdapter({
  bridgeUrl = "",
  bridgeToken = "",
  receiptDir = "",
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
} = {}) {
  const normalizedUrl = normalizeBridgeUrl(bridgeUrl);
  const token = clean(bridgeToken);

  return {
    capability_key: "raven.nexus.readonly-team-review.v1",
    work_types: [...READ_ONLY_WORK_TYPES],
    authority: "systemia+passport+bounded-nexus",
    human_gate_required: false,

    async execute({ work, goal, context }) {
      if (!normalizedUrl || !token) {
        return {
          result: "blocked",
          blocker: "Owned Raven Nexus work bridge is not configured.",
          evidence_refs: [],
          output: {
            state: "bridge_not_configured",
            base44_required: false,
          },
        };
      }
      if (typeof fetchImpl !== "function") {
        return {
          result: "blocked",
          blocker: "Fetch implementation unavailable for owned Raven Nexus bridge.",
        };
      }

      const workType = clean(work?.work_type).toLowerCase();
      if (!READ_ONLY_WORK_TYPES.includes(workType)) {
        return {
          result: "blocked",
          blocker: `Work type ${workType || "<empty>"} is outside the read-only Raven execution allowlist.`,
        };
      }

      const missionKey = clean(work?.mission_key || goal?.mission_key || goal?.goal_key);
      const workKey = clean(work?.work_key);
      const requestId = `raven-${shortHash(JSON.stringify({
        missionKey,
        workKey,
        title: clean(work?.title),
        workType,
        objective: clean(context?.objective || goal?.objective),
      }))}`;

      const request = {
        schema: "evercraft.nexus.team-review.request.v1",
        request_id: requestId,
        mission_key: missionKey,
        work_key: workKey,
        work_type: workType,
        objective: clean(context?.objective || goal?.objective),
        title: clean(work?.title),
        assigned_agents: safeArray(work?.assigned_agents),
        requested_team: "role_lenses",
        response_contract: {
          verdict_required: true,
          disagreements_required: true,
          failure_modes_required: true,
          evidence_refs_required_when_claiming_external_facts: true,
        },
        constraints: {
          internal_analysis_only: true,
          read_only: true,
          no_external_messages: true,
          no_publication: true,
          no_deployment: true,
          no_purchase: true,
          no_payment: true,
          no_account_changes: true,
          no_credential_return: true,
        },
      };

      const startedAt = now().toISOString();
      let response;
      let body;
      try {
        response = await fetchImpl(`${normalizedUrl}/v1/team-review`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "authorization": `Bearer ${token}`,
          },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(120000),
        });
        body = await response.json().catch(() => ({
          status: "failed",
          error: "Owned Raven Nexus bridge returned non-JSON output.",
        }));
      } catch (error) {
        return {
          result: "blocked",
          blocker: error instanceof Error ? error.message : String(error),
          evidence_refs: [],
          output: {
            state: "bridge_unreachable",
            base44_required: false,
          },
        };
      }

      const completedAt = now().toISOString();
      const providerReceipt = clean(body?.provider_receipt);
      const results = Array.isArray(body?.results) ? body.results.slice(0, 100) : [];
      const summary = clean(body?.summary || body?.text);
      const status = clean(body?.status || (response.ok ? "completed" : "failed")).toLowerCase();

      if (!response.ok || status !== "completed") {
        return {
          result: "blocked",
          blocker: clean(body?.blocked_reason || body?.error || `Owned Raven Nexus bridge HTTP ${response.status}`),
          evidence_refs: providerReceipt ? [providerReceipt] : [],
          output: {
            state: status || "failed",
            provider: clean(body?.provider || "raven-nexus"),
            base44_required: false,
          },
        };
      }

      if (!summary && results.length === 0) {
        return {
          result: "blocked",
          blocker: "Owned Raven Nexus bridge claimed completion without a review result.",
          evidence_refs: providerReceipt ? [providerReceipt] : [],
        };
      }

      const receiptCore = {
        schema: "evercraft.raven.team-review-execution-receipt.v1",
        request_id: requestId,
        mission_key: missionKey,
        work_key: workKey,
        work_type: workType,
        provider: clean(body?.provider || "raven-nexus"),
        provider_receipt: providerReceipt || null,
        started_at: clean(body?.started_at || startedAt),
        completed_at: clean(body?.completed_at || completedAt),
        result_count: results.length,
        response_sha256: crypto.createHash("sha256").update(JSON.stringify({ summary, results })).digest("hex"),
        base44_required: false,
        external_side_effects_authorized: false,
      };
      const receiptHash = shortHash(JSON.stringify(receiptCore), 24);
      const receipt = {
        ...receiptCore,
        receipt_ref: `raven-team-review:${requestId}:${receiptHash}`,
      };
      const receiptPath = persistReceipt(receiptDir, receipt);

      return {
        result: "complete",
        receipt_ref: receipt.receipt_ref,
        evidence_refs: providerReceipt ? [providerReceipt] : [],
        output: {
          state: "completed",
          provider: receipt.provider,
          summary,
          results,
          receipt_path: receiptPath,
          response_sha256: receipt.response_sha256,
          raven_receipt: body?.raven_receipt || null,
          base44_required: false,
        },
      };
    },
  };
}

export async function executeSystemiaRavenPlan({
  systemiaPlan,
  workKey = "raven-command",
  bridgeUrl = "",
  bridgeToken = "",
  receiptDir = "",
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
} = {}) {
  if (!systemiaPlan || systemiaPlan.schema !== "evercraft.systemia.control-plane-plan.v1") {
    throw new Error("valid_systemia_plan_required");
  }

  const decision = (systemiaPlan.dispatch || []).find((row) => row.work_key === workKey);
  if (!decision) throw new Error("raven_work_route_missing");
  const work = (systemiaPlan.goal?.tasks || []).find((row) => row.work_key === workKey);
  if (!work) throw new Error("raven_goal_work_missing");

  if (decision.hold) {
    return {
      ok: false,
      executed: false,
      reason: "systemia_hold",
      blocker: decision.hold,
      state: systemiaPlan.goal,
    };
  }
  if (decision.execution_gate_required || decision.human_gate_required) {
    return {
      ok: false,
      executed: false,
      reason: "consequential_work_not_supported_in_readonly_lane",
      blocker: "Owned Raven execution v1 is intentionally limited to non-consequential internal analysis.",
      state: systemiaPlan.goal,
    };
  }
  if (!READ_ONLY_WORK_TYPES.includes(clean(work.work_type).toLowerCase())) {
    return {
      ok: false,
      executed: false,
      reason: "work_type_not_allowlisted",
      blocker: `Work type ${clean(work.work_type)} is outside the read-only Raven execution allowlist.`,
      state: systemiaPlan.goal,
    };
  }

  const registry = createCapabilityRegistry([
    createRavenReadOnlyTeamAdapter({
      bridgeUrl,
      bridgeToken,
      receiptDir,
      fetchImpl,
      now,
    }),
  ]);

  return executeGoalWorkWithAdapter({
    state: systemiaPlan.goal,
    workKey,
    registry,
    context: {
      objective: systemiaPlan.mission?.objective || systemiaPlan.goal?.objective || "",
      systemia_authority: systemiaPlan.receipt?.authority || "",
      admission_receipt_hash: systemiaPlan.receipt?.receipt_hash || "",
    },
    now: now(),
  });
}
