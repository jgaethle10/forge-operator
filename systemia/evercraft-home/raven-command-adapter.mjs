import { planSystemiaMission } from "./systemia-adapter.mjs";

const LANES = Object.freeze({
  operations: { work_type: "analyze", label: "Operations" },
  research: { work_type: "research", label: "Research" },
  security: { work_type: "security", label: "Security" },
  publishing: { work_type: "publish", label: "Publishing" },
  infrastructure: { work_type: "deploy", label: "Infrastructure" },
  quality: { work_type: "qa", label: "Quality" },
});

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function ravenCommandLanes() {
  return Object.entries(LANES).map(([key, value]) => ({
    key,
    label: value.label,
    work_type: value.work_type,
  }));
}

export function planRavenCommand({ message, lane = "operations" } = {}, repoRoot) {
  const objective = clean(message);
  if (objective.length < 3) throw new Error("raven_command_too_short");
  if (objective.length > 4000) throw new Error("raven_command_too_long");

  const laneKey = clean(lane).toLowerCase() || "operations";
  const laneDef = LANES[laneKey];
  if (!laneDef) throw new Error("raven_command_lane_invalid");

  const result = planSystemiaMission({
    objective,
    success_condition: "Systemia produces a bounded, receipted plan for the founder request without granting execution authority.",
    tasks: [{
      work_key: "raven-command",
      work_type: laneDef.work_type,
      title: objective,
      context_required: ["research", "security", "quality"].includes(laneKey),
    }],
    context_refs: ["evercraft-home:raven-command-desk"],
  }, repoRoot);

  const dispatch = Array.isArray(result.plan?.dispatch) ? result.plan.dispatch : [];
  return {
    schema: "evercraft.home.raven-command-plan.v1",
    state: "planned_not_executed",
    lane: laneKey,
    lane_label: laneDef.label,
    work_type: laneDef.work_type,
    mission_key: result.plan?.mission?.mission_key || null,
    routed_components: [...new Set(dispatch.map((row) => row.specialist_component).filter(Boolean))],
    execution_components: [...new Set(dispatch.map((row) => row.execution_component).filter(Boolean))],
    holds: dispatch.map((row) => row.hold).filter(Boolean),
    execution_gate_required: dispatch.some((row) => row.execution_gate_required === true),
    execution_authority_granted: false,
    ai_inference_used: false,
    standalone_raven_runtime_used: false,
    systemia_authority: result.plan?.receipt?.authority || null,
    evidence_semantics:
      "This proves Systemia admission and routing only. It is not a conversational AI response, specialist execution, deployment, publication, external communication, or other completed action.",
    plan: result.plan,
  };
}
