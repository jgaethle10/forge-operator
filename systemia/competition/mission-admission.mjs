import { admitGoalPlan, createGoalState } from "../organism/goal-runtime.mjs";

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function slug(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 96);
}

function refs(opportunity) {
  return [
    opportunity?.evidence?.source ? "url:" + opportunity.evidence.source : "",
    opportunity?.opportunity_id ? "competition:" + opportunity.opportunity_id : "",
    opportunity?.provider ? "provider:" + opportunity.provider : "",
  ].filter(Boolean);
}

export function competitionGoalKey(opportunity) {
  return "competition:" + slug(opportunity?.opportunity_id || opportunity?.title || "unknown");
}

export function buildCompetitionGoalPlan({ opportunity, classification }) {
  const prefix = competitionGoalKey(opportunity);
  const plan = [
    {
      work_key: "verify-rules-and-eligibility",
      dedupe_key: prefix + ":verify-rules-and-eligibility",
      title: "Verify official rules, eligibility, deadlines, IP constraints, and required deliverables",
      work_type: "research",
      assigned_agents: ["systemia-organism", "chum"],
    },
    {
      work_key: "select-competition-build",
      dedupe_key: prefix + ":select-competition-build",
      title: "Select the strongest bounded Evercraft capability and competition-period delta",
      work_type: "analysis",
      dependency_keys: ["verify-rules-and-eligibility"],
      assigned_agents: ["systemia-organism", "saban"],
    },
    {
      work_key: "build-entry",
      dedupe_key: prefix + ":build-entry",
      title: "Build the competition entry and required integrations",
      work_type: "build",
      dependency_keys: ["select-competition-build"],
      assigned_agents: ["saban", "yard", "systemia-organism"],
    },
    {
      work_key: "raven-adversarial-qa",
      dedupe_key: prefix + ":raven-adversarial-qa",
      title: "Run Raven QA against rules, functionality, provenance, licensing, and evidence boundaries",
      work_type: "qa",
      dependency_keys: ["build-entry"],
      assigned_agents: ["raven", "systemia-organism"],
    },
    {
      work_key: "package-submission",
      dedupe_key: prefix + ":package-submission",
      title: "Produce repository, demo, video, write-up, setup instructions, and submission fields required by the competition",
      work_type: "package",
      dependency_keys: ["raven-adversarial-qa"],
      assigned_agents: ["systemia-organism", "fallen", "shipping"],
    },
  ];

  const gates = classification?.human_gates || [];
  let submitDeps = ["package-submission"];
  if (gates.length > 0) {
    plan.push({
      work_key: "human-provider-gate",
      dedupe_key: prefix + ":human-provider-gate",
      title: "Complete only the provider actions that genuinely require human authority: " + gates.join(", "),
      work_type: "external_action",
      dependency_keys: ["package-submission"],
      human_gate_required: true,
      assigned_agents: ["human-approved-operator"],
    });
    submitDeps = ["human-provider-gate"];
  }

  plan.push(
    {
      work_key: "provider-submit",
      dedupe_key: prefix + ":provider-submit",
      title: "Submit through the authorized provider executor without accepting new terms or creating financial obligations",
      work_type: "external_action",
      dependency_keys: submitDeps,
      assigned_agents: ["systemia-competition", "raven-nexus"],
    },
    {
      work_key: "verify-provider-receipt",
      dedupe_key: prefix + ":verify-provider-receipt",
      title: "Verify and preserve the external provider submission receipt before marking success",
      work_type: "verify",
      dependency_keys: ["provider-submit"],
      assigned_agents: ["raven", "systemia-organism"],
    },
    {
      work_key: "track-judging-and-prize",
      dedupe_key: prefix + ":track-judging-and-prize",
      title: "Track judging, finalist status, prize outcome, and provider-verified payment without calling an award money early",
      work_type: "monitor",
      dependency_keys: ["verify-provider-receipt"],
      assigned_agents: ["systemia-organism", "raven-nexus"],
    }
  );

  return plan;
}

export function admitCompetitionMission({ opportunity, classification, now = new Date() }) {
  if (!opportunity?.opportunity_id) throw new Error("opportunity_id is required");
  if (!classification) throw new Error("classification is required");
  if (["closed", "held_ineligible_or_closed"].includes(classification.state)) {
    return {
      schema: "evercraft.systemia.competition-mission-admission.v1",
      admitted: false,
      reason: classification.state,
      opportunity_id: opportunity.opportunity_id,
    };
  }

  const goalKey = competitionGoalKey(opportunity);
  let state = createGoalState({
    goalKey,
    missionKey: "competition-autonomy-exception-handler-v1",
    objective: "Produce a valid, competitive, rules-compliant entry for " + clean(opportunity.title) + " while keeping human involvement limited to genuinely non-delegable gates.",
    successCondition: "The entry is submitted through an authorized provider path, a provider-visible receipt is verified, and judging/prize state is tracked without conflating submission or award with payment.",
    contextRefs: refs(opportunity),
    now,
  });
  state = admitGoalPlan({
    state,
    plan: buildCompetitionGoalPlan({ opportunity, classification }),
    now,
  });
  state.evidence_refs = refs(opportunity);

  return {
    schema: "evercraft.systemia.competition-mission-admission.v1",
    admitted: true,
    opportunity_id: opportunity.opportunity_id,
    classification_state: classification.state,
    goal_state: state,
    human_gates: classification.human_gates || [],
    observed_at: now.toISOString(),
  };
}
