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

test("Systemia plan refuses owned Raven bridge before a durable dispatch checkpoint", async () => {
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
  const planned = planSystemiaMission({
    objective: "Challenge the Tieton Recovery pilot before outreach.",
    tasks: [{
      work_key: "raven-command",
      work_type: "analyze",
      title: "Challenge the Tieton Recovery pilot before outreach.",
    }],
  }, repoRoot);

  const receiptDir = fs.mkdtempSync(path.join(os.tmpdir(), "raven-receipts-"));
  let invoked = 0;
  try {
    const result = await executeSystemiaRavenPlan({
      systemiaPlan: planned.plan,
      bridgeUrl: "https://nexus.example",
      bridgeToken: "test-secret",
      receiptDir,
      fetchImpl: async () => {
        invoked += 1;
        throw new Error("provider_must_not_be_called_before_durable_dispatch");
      },
      now: () => new Date("2026-10-06T04:00:00Z"),
    });

    assert.equal(invoked, 0, "an unpersisted Systemia plan must not call a provider");
    assert.equal(result.ok, false);
    assert.equal(result.executed, false);
    assert.equal(result.reason, "durable_dispatch_required");
    assert.equal(result.receipt.result, "held");
    assert.equal(result.receipt.durable_checkpoint_persisted, false);
    assert.equal(result.receipt.external_effect_verified, false);
    assert.equal(result.receipt.capability_key, "raven.nexus.readonly-team-review.v1");
    assert.equal(result.state.tasks.find((row) => row.work_key === "raven-command").status, "pending");
    assert.deepEqual(fs.readdirSync(receiptDir), [], "no provider receipt should be written");
    assert.equal(JSON.stringify(result).includes("test-secret"), false);
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
