import test from "node:test";
import assert from "node:assert/strict";
import {
  createHttpInferenceAdapter,
  createRavenTeamReviewExecutor,
  TEAM_REVIEW_ROLES,
} from "./team-review-runtime.mjs";

function request() {
  return {
    schema: "evercraft.nexus.team-review.request.v1",
    request_id: "tieton-proof-001",
    mission_key: "evercraft-recovery-tieton-20261005",
    work_key: "raven-command",
    work_type: "analyze",
    objective: "Review the proposed Tieton Recovery pilot. Challenge margins, capacity, attribution, deal structure, and whether the target should be held.",
    requested_team: "role_lenses",
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
}

test("team review requires a real inference adapter", () => {
  assert.equal(createRavenTeamReviewExecutor({ inferenceAdapter: null }), null);
});

test("HTTP inference adapter rejects Base44 as an execution provider", () => {
  assert.throws(() => createHttpInferenceAdapter({
    origin: "https://example.base44.app",
    token: "secret-secret-secret-secret-secret-secret",
  }), /legacy_provider_not_allowed/);
});

test("team review preserves independent role runs before synthesis", async () => {
  const calls = [];
  const adapter = {
    async infer({ request_id, role, prompt }) {
      calls.push({ request_id, role, prompt });
      if (role === "synthesis") {
        return {
          text: "FINAL VERDICT: GO WITH CHANGES. Validate contribution margin and capacity before choosing the wedge.",
          provider: "proof-provider",
          provider_receipt: "provider:synthesis",
        };
      }
      return {
        text: "VERDICT: GO WITH CHANGES. Role " + role + " found one bounded concern.",
        provider: "proof-provider",
        provider_receipt: "provider:" + role,
      };
    },
  };
  let tick = 0;
  const execute = createRavenTeamReviewExecutor({
    inferenceAdapter: adapter,
    now: () => new Date(1760000000000 + tick++ * 1000),
  });
  const result = await execute(request());
  assert.equal(result.status, "completed");
  assert.equal(result.results.length, TEAM_REVIEW_ROLES.length);
  assert.equal(calls.filter((row) => row.role !== "synthesis").length, TEAM_REVIEW_ROLES.length);
  assert.equal(calls.at(-1).role, "synthesis");
  assert.match(result.summary, /GO WITH CHANGES/);
  assert.equal(result.raven_receipt.base44_used, false);
  assert.equal(result.raven_receipt.external_side_effects_authorized, false);
});

test("all reviewer failures fail closed without fake synthesis", async () => {
  const execute = createRavenTeamReviewExecutor({
    inferenceAdapter: { async infer() { throw new Error("provider unavailable"); } },
  });
  const result = await execute(request());
  assert.equal(result.status, "blocked");
  assert.match(result.blocked_reason, /all raven review lanes failed/i);
});

test("consequence constraint removal is rejected before inference", async () => {
  let called = false;
  const execute = createRavenTeamReviewExecutor({
    inferenceAdapter: {
      async infer() {
        called = true;
        return { text: "should not run" };
      },
    },
  });
  const bad = request();
  bad.constraints.no_payment = false;
  await assert.rejects(() => execute(bad), /team_review_constraint_missing:no_payment/);
  assert.equal(called, false);
});
