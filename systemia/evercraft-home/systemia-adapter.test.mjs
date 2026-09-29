import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { planSystemiaMission, readSystemiaInventory } from "./systemia-adapter.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

test("Direct Mode can read Systemia source inventory without claiming runtime health", () => {
  const inventory = readSystemiaInventory(repoRoot);
  assert.equal(inventory.schema, "evercraft.systemia.machine-inventory.v1");
  assert.ok(inventory.summary.total > 0);
  assert.match(inventory.evidence_semantics, /not a claim of live deployment/i);
});

test("Direct Mode mission planning preserves Systemia authority and never executes", () => {
  const result = planSystemiaMission({
    objective: "Inspect Evercraft Home health",
    tasks: [{ work_key: "inspect-home", work_type: "qa", title: "Inspect Home health" }],
  }, repoRoot);

  assert.equal(result.state, "planned_not_executed");
  assert.equal(result.execution_authority_granted, false);
  assert.equal(result.plan.receipt.authority, "systemia-organism");
  assert.equal(result.plan.receipt.execution_authority_granted, false);
});
