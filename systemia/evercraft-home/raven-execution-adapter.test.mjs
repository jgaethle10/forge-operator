import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createRavenReadOnlyTeamAdapter,
  executeSystemiaRavenPlan,
  ravenReadOnlyWorkTypes,
} from "./raven-execution-adapter.mjs";
import { planSystemiaMission } from "./systemia-adapter.mjs";

test("owned Raven execution allowlist is internal and read-only", () => {
  assert.deepEqual(ravenReadOnlyWorkTypes(), ["analyze", "research", "qa"]);
});

test("Raven adapter fails closed without an owned Nexus bridge", async () => {
  const adapter = createRavenReadOnlyTeamAdapter();
  const outcome = await adapter.execute({
    work: { mission_key: "m1", work_key: "w1", work_type: "analyze", title: "Review" },
    goal: { mission_key: "m1", objective: "Review the plan" },
    context: {},
  });
  assert.equal(outcome.result, "blocked");
  assert.match(outcome.blocker, /not configured/i);
  assert.equal(outcome.output.base44_required, false);
});

test("Systemia refuses the legacy Raven bridge without a durable dispatch checkpoint", async () => {
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
  const planned = planSystemiaMission({
    objective: "Challenge a recovery pilot before external outreach.",
    tasks: [{
      work_key: "raven-command",
      work_type: "analyze",
      title: "Challenge a recovery pilot before external outreach.",
    }],
  }, repoRoot);

  const receiptDir = fs.mkdtempSync(path.join(os.tmpdir(), "raven-held-"));
  try {
    let called = 0;
    const result = await executeSystemiaRavenPlan({
      systemiaPlan: planned.plan,
      bridgeUrl: "https://nexus.example",
      bridgeToken: "fixture-not-a-real-token",
      receiptDir,
      fetchImpl: async () => {
        called += 1;
        throw new Error("legacy executor must not invoke network before durable checkpoint");
      },
      now: () => new Date("2026-10-16T17:00:00Z"),
    });

    // A legacy executor has no persisted pre-dispatch attempt. The bounded
    // adapter description MUST NOT downgrade the Systemia execution gate.
    assert.equal(called, 0);
    assert.equal(result.ok, false);
    assert.equal(result.executed, false);
    assert.equal(result.reason, "durable_dispatch_required");
    assert.equal(result.receipt.durable_checkpoint_persisted, false);
    assert.equal(result.receipt.external_effect_verified, false);
    assert.deepEqual(fs.readdirSync(receiptDir), []);
  } finally {
    fs.rmSync(receiptDir, { recursive: true, force: true });
  }
});

test("Raven adapter unit fixture writes a sanitized receipt without claiming Systemia admission", async () => {
  const receiptDir = fs.mkdtempSync(path.join(os.tmpdir(), "raven-fixture-"));
  let called = 0;
  try {
    const adapter = createRavenReadOnlyTeamAdapter({
      bridgeUrl: "https://nexus.example",
      bridgeToken: "fixture-not-a-real-token",
      receiptDir,
      now: () => new Date("2026-10-16T17:00:00Z"),
      fetchImpl: async (url, options) => {
        called += 1;
        assert.equal(url, "https://nexus.example/v1/team-review");
        assert.equal(options.headers.authorization, "Bearer fixture-not-a-real-token");
        const request = JSON.parse(options.body);
        assert.equal(request.constraints.read_only, true);
        assert.equal(request.constraints.no_external_messages, true);
        assert.equal(request.constraints.no_publication, true);
        assert.equal(request.constraints.no_payment, true);
        assert.equal(request.requested_team, "commissioned");
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              status: "completed",
              provider: "nexus-test-fixture",
              provider_receipt: "synthetic:provider:receipt:123",
              summary: "GO WITH CHANGES",
              results: [{ agent: "Talon", verdict: "GO WITH CHANGES", concern: "Validate costs." }],
            };
          },
        };
      },
    });
    const result = await adapter.execute({
      work: { mission_key: "test-mission", work_key: "raven-command", work_type: "analyze", title: "Fixture review" },
      goal: { mission_key: "test-mission", objective: "Internal review" },
      context: { objective: "Internal review" },
    });
    assert.equal(called, 1);
    assert.equal(result.result, "complete");
    assert.equal(result.output.summary, "GO WITH CHANGES");
    assert.equal(result.output.base44_required, false);
    const receipts = fs.readdirSync(receiptDir);
    assert.equal(receipts.length, 1);
    const receipt = JSON.parse(fs.readFileSync(path.join(receiptDir, receipts[0]), "utf8"));
    assert.equal(receipt.base44_required, false);
    assert.equal(receipt.external_side_effects_authorized, false);
    assert.equal(JSON.stringify(receipt).includes("fixture-not-a-real-token"), false);
    // Direct adapter fixture is NOT a canonical Systemia dispatch/admission receipt.
    assert.equal(receipt.schema, "evercraft.raven.team-review-execution-receipt.v1");
  } finally {
    fs.rmSync(receiptDir, { recursive: true, force: true });
  }
});

test("owned Raven execution refuses consequential lanes before provider invocation", async () => {
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
  const planned = planSystemiaMission({
    objective: "Publish a public post.",
    tasks: [{
      work_key: "raven-command",
      work_type: "publish",
      title: "Publish a public post.",
    }],
  }, repoRoot);
  let called = false;
  const result = await executeSystemiaRavenPlan({
    systemiaPlan: planned.plan,
    bridgeUrl: "https://nexus.example",
    bridgeToken: "test-secret",
    fetchImpl: async () => {
      called = true;
      throw new Error("must not be called");
    },
  });
  assert.equal(called, false);
  assert.equal(result.executed, false);
  assert.match(result.reason, /consequential|allowlisted/);
});
