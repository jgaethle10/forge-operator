import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startRavenPrivateRuntime } from "./private-runtime.mjs";
import { createRavenTeamReviewExecutor } from "./team-review-runtime.mjs";

function reviewRequest() {
  return {
    schema: "evercraft.nexus.team-review.request.v1",
    request_id: "private-runtime-review-001",
    mission_key: "private-runtime-review-proof",
    work_key: "raven-command",
    work_type: "analyze",
    objective: "Challenge a bounded turnaround plan before any external action.",
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

test("private Raven runtime serves authenticated owned team review", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "raven-team-review-"));
  const controlToken = "private-runtime-review-control-token-0123456789";
  const calls = [];
  const teamReviewExecutor = createRavenTeamReviewExecutor({
    inferenceAdapter: {
      async infer({ request_id, role }) {
        calls.push({ request_id, role });
        return {
          text: role === "synthesis"
            ? "FINAL VERDICT: GO WITH CHANGES. Validate margin and capacity first."
            : "VERDICT: GO WITH CHANGES. Bounded role review for " + role + ".",
          provider: "proof-provider",
          provider_receipt: "provider:" + role,
        };
      },
    },
  });

  let runtime;
  try {
    runtime = await startRavenPrivateRuntime({
      stateDir: root,
      repoRoot: path.resolve("."),
      controlToken,
      trustedSubjectRef: "user:proof",
      teamReviewExecutor,
    });

    const health = await fetch(runtime.url + "/health").then((r) => r.json());
    assert.equal(health.ai_inference_enabled, true);
    assert.equal(health.internal_readonly_team_review_enabled, true);
    assert.equal(health.base44_required, false);

    const denied = await fetch(runtime.url + "/v1/team-review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(reviewRequest()),
    });
    assert.equal(denied.status, 401);

    const response = await fetch(runtime.url + "/v1/team-review", {
      method: "POST",
      headers: {
        authorization: "Bearer " + controlToken,
        "content-type": "application/json",
      },
      body: JSON.stringify(reviewRequest()),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.status, "completed");
    assert.match(body.summary, /GO WITH CHANGES/);
    assert.equal(body.base44_used, false);
    assert.equal(body.external_side_effects_authorized, false);
    assert.equal(calls.filter((row) => row.role !== "synthesis").length, 6);
    assert.equal(calls.at(-1).role, "synthesis");
    assert.equal(JSON.stringify(body).includes(controlToken), false);
  } finally {
    if (runtime) await runtime.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
