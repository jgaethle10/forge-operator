import test from "node:test";
import assert from "node:assert/strict";
import { admitCompetitionMission, buildCompetitionGoalPlan } from "./mission-admission.mjs";

test("competition mission lets team build before a deferred human gate", () => {
  const opportunity = {
    opportunity_id: "qloo-agentic-hackathon-2026",
    provider: "devpost",
    title: "Qloo Agentic Hackathon",
    evidence: { source: "https://qloo.devpost.com/rules" },
  };
  const classification = {
    state: "team_can_advance_human_gate_deferred",
    human_gates: ["accept_terms", "personal_eligibility_attestation"],
  };
  const admitted = admitCompetitionMission({ opportunity, classification, now: new Date("2026-10-05T21:00:00Z") });
  assert.equal(admitted.admitted, true);
  assert.equal(admitted.goal_state.status, "ready");
  assert.deepEqual(admitted.goal_state.next_work_keys, ["verify-rules-and-eligibility"]);

  const draft = admitted.goal_state.tasks.find((task) => task.work_key === "prepare-provider-draft");
  const gate = admitted.goal_state.tasks.find((task) => task.work_key === "human-provider-gate");
  const build = admitted.goal_state.tasks.find((task) => task.work_key === "build-entry");
  const submit = admitted.goal_state.tasks.find((task) => task.work_key === "provider-submit");
  assert.ok(draft);
  assert.deepEqual(draft.dependency_keys, ["package-submission"]);
  assert.equal(gate.human_gate_required, true);
  assert.deepEqual(gate.dependency_keys, ["prepare-provider-draft"]);
  assert.deepEqual(build.dependency_keys, ["select-competition-build"]);
  assert.deepEqual(submit.dependency_keys, ["human-provider-gate"]);
});

test("pre-authorized competition omits human gate and preserves provider receipt requirement", () => {
  const plan = buildCompetitionGoalPlan({
    opportunity: { opportunity_id: "gemma", title: "Gemma", provider: "kaggle" },
    classification: { human_gates: [] },
  });
  assert.equal(plan.some((task) => task.work_key === "human-provider-gate"), false);
  assert.deepEqual(plan.find((task) => task.work_key === "provider-submit").dependency_keys, ["package-submission"]);
  assert.deepEqual(plan.find((task) => task.work_key === "verify-provider-receipt").dependency_keys, ["provider-submit"]);
  assert.deepEqual(plan.find((task) => task.work_key === "track-judging-and-prize").dependency_keys, ["verify-provider-receipt"]);
});

test("closed or ineligible competitions are not admitted", () => {
  const admitted = admitCompetitionMission({
    opportunity: { opportunity_id: "closed", title: "Closed", provider: "devpost" },
    classification: { state: "closed", human_gates: [] },
  });
  assert.equal(admitted.admitted, false);
});


test("provider-native Kaggle mission does not invent a browser draft step", () => {
  const admitted = admitCompetitionMission({
    opportunity: {
      opportunity_id: "gemma-2026",
      provider: "kaggle",
      title: "Gemma",
      evidence: { source: "https://www.kaggle.com/competitions/example" },
    },
    classification: { state: "team_work_pending", human_gates: [] },
    now: new Date("2026-10-05T21:00:00Z"),
  });
  assert.equal(admitted.admitted, true);
  assert.equal(admitted.goal_state.tasks.some((task) => task.work_key === "prepare-provider-draft"), false);
  assert.deepEqual(
    admitted.goal_state.tasks.find((task) => task.work_key === "provider-submit").dependency_keys,
    ["package-submission"]
  );
});
