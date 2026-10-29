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

test("Systemia plan can execute through owned Raven bridge and persist a sanitized receipt", async () => {
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
  let called = 0;
  const fakeFetch = async (url, options) => {
    called += 1;
    assert.equal(url, "https://nexus.example/v1/team-review");
    assert.equal(options.headers.authorization, "Bearer test-secret");
    const request = JSON.parse(options.body);
    assert.equal(request.constraints.read_only, true);
    assert.equal(request.constraints.no_external_messages, true);
    assert.equal(request.constraints.no_publication, true);
    assert.equal(request.requested_team, "role_lenses");
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          status: "completed",
          provider: "nexus-test",
          provider_receipt: "provider:receipt:123",
          summary: "GO WITH CHANGES",
          results: [
            { agent: "Talon", verdict: "GO WITH CHANGES", concern: "Validate contribution margin before subscription launch." },
            { agent: "Sentinel", verdict: "HOLD OFFER", concern: "Do not claim distress beyond public evidence." }
          ]
        };
      }
    };
  };

  const result = await executeSystemiaRavenPlan({
    systemiaPlan: planned.plan,
    bridgeUrl: "https://nexus.example",
    bridgeToken: "test-secret",
    receiptDir,
    fetchImpl: fakeFetch,
    now: () => new Date("2026-10-06T04:00:00Z"),
  });

  assert.equal(called, 1);
  assert.equal(result.ok, true);
  assert.equal(result.executed, true);
  assert.equal(result.reason, "complete");
  assert.equal(result.output.base44_required, false);
  assert.equal(result.output.summary, "GO WITH CHANGES");
  assert.equal(result.state.status, "complete");

  const receipts = fs.readdirSync(receiptDir);
  assert.equal(receipts.length, 1);
  const receipt = JSON.parse(fs.readFileSync(path.join(receiptDir, receipts[0]), "utf8"));
  assert.equal(receipt.base44_required, false);
  assert.equal(receipt.external_side_effects_authorized, false);
  assert.equal(JSON.stringify(receipt).includes("test-secret"), false);
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
