import { createHash } from "node:crypto";

const HUMAN_GATE_TYPES = new Set([
  "accept_terms",
  "identity_verification",
  "mfa",
  "captcha",
  "payment_authorization",
  "staking_authorization",
  "personal_eligibility_attestation",
]);

const DEFAULT_PROVIDER_CAPABILITIES = {
  kaggle: { authenticated_transport: "api", submission_executor: "api" },
  numerai: { authenticated_transport: "api", submission_executor: "api" },
  devpost: { authenticated_transport: "browser_session", submission_executor: "browser_required" },
  lablab: { authenticated_transport: "browser_session", submission_executor: "browser_required" },
  band: { authenticated_transport: "desktop_session", submission_executor: "desktop_required" },
  amd: { authenticated_transport: "browser_session", submission_executor: "browser_required" },
};

function sha256(value) {
  return "sha256:" + createHash("sha256").update(String(value)).digest("hex");
}

function bool(value) {
  return value === true;
}

function lower(value) {
  return String(value || "").trim().toLowerCase();
}

function deadlineState(deadline, now) {
  if (!deadline) return "unknown";
  const value = Date.parse(deadline);
  if (!Number.isFinite(value)) return "unknown";
  return value <= now.getTime() ? "closed" : "open";
}

function termsAccepted(value) {
  return ["accepted", "already_accepted", "entered"].includes(lower(value));
}

function rulesVerified(rules = {}) {
  return lower(rules.verification_state) === "verified";
}

function providerCapabilities(provider, overrides = {}) {
  return {
    ...(DEFAULT_PROVIDER_CAPABILITIES[lower(provider)] || {
      authenticated_transport: "unknown",
      submission_executor: "unknown",
    }),
    ...(overrides || {}),
  };
}

function pushUnique(list, value) {
  if (!list.includes(value)) list.push(value);
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function buildHumanGatePacket(opportunity, gate) {
  const details = opportunity?.human_gate_details?.[gate] || {};
  const action_url = clean(details.action_url);
  const action = clean(details.action);
  const why = clean(details.why);
  const after = clean(details.after);
  const packet = {
    gate,
    action_url: action_url || null,
    action: action || null,
    why: why || null,
    after: after || null,
    deadline: opportunity?.deadline || null,
  };
  return {
    ...packet,
    actionable: Boolean(packet.action_url && packet.action && packet.why && packet.after),
  };
}

export function classifyCompetitionOpportunity(opportunity, {
  now = new Date(),
  providerOverrides = {},
} = {}) {
  const provider = lower(opportunity?.provider);
  const rules = opportunity?.rules || {};
  const auth = opportunity?.authorization || {};
  const build = opportunity?.build || {};
  const capabilities = providerCapabilities(provider, providerOverrides[provider]);
  const humanGates = [];
  const teamBlockers = [];
  const prepActions = [];

  const dState = deadlineState(opportunity?.deadline, now);
  if (dState === "closed") {
    return {
      opportunity_id: String(opportunity?.opportunity_id || ""),
      provider,
      title: String(opportunity?.title || ""),
      deadline_state: dState,
      state: "closed",
      human_gates: [],
      team_blockers: [],
      team_can_continue_preparation: false,
      next_team_action: null,
      submission_ready: false,
      notify_human: false,
    };
  }

  if (!rulesVerified(rules)) pushUnique(teamBlockers, "rules_not_verified");
  if (rules.eligible === false) pushUnique(teamBlockers, "ineligible");
  else if (rules.eligible !== true) pushUnique(teamBlockers, "eligibility_not_verified");

  if (bool(rules.new_terms_required) && !termsAccepted(auth.terms_state)) {
    pushUnique(humanGates, "accept_terms");
  }
  if (bool(rules.identity_required) && !bool(auth.identity_verified)) {
    pushUnique(humanGates, "identity_verification");
  }
  if (bool(rules.mfa_required) && !bool(auth.mfa_satisfied)) {
    pushUnique(humanGates, "mfa");
  }
  if (bool(rules.captcha_required) && !bool(auth.captcha_satisfied)) {
    pushUnique(humanGates, "captcha");
  }
  if (bool(rules.payment_required) && !bool(auth.payment_authorized)) {
    pushUnique(humanGates, "payment_authorization");
  }
  if (bool(rules.staking_required) && !bool(auth.staking_authorized)) {
    pushUnique(humanGates, "staking_authorization");
  }
  if (bool(rules.eligibility_attestation_required) && !bool(auth.eligibility_attested)) {
    pushUnique(humanGates, "personal_eligibility_attestation");
  }

  if (!bool(auth.provider_authenticated)) {
    pushUnique(teamBlockers, "provider_auth_session_missing");
  }

  const executor = lower(auth.submission_executor || capabilities.submission_executor);
  if (["unknown", "browser_required", "desktop_required", "missing"].includes(executor)) {
    pushUnique(teamBlockers, "provider_submission_executor_not_owned");
  }

  if (!rulesVerified(rules)) prepActions.push("research_and_compile_rules");
  if (!bool(auth.provider_authenticated)) prepActions.push("establish_raven_provider_session");
  if (teamBlockers.includes("provider_submission_executor_not_owned")) prepActions.push("build_owned_provider_executor");
  if (lower(build.state) !== "built") prepActions.push("build_entry");
  if (lower(build.raven_qa_state) !== "passed") prepActions.push("run_raven_qa");
  if (!bool(build.submission_package_ready)) prepActions.push("prepare_submission_package");

  const humanGatePackets = humanGates.map((gate) => buildHumanGatePacket(opportunity, gate));
  const incompleteHumanGatePackets = humanGatePackets.filter((packet) => !packet.actionable);
  if (humanGates.length > 0 && incompleteHumanGatePackets.length > 0) {
    pushUnique(teamBlockers, "human_gate_packet_incomplete");
    prepActions.push("prepare_exact_human_gate_packet");
  }

  const hardStop = teamBlockers.includes("ineligible") || dState === "closed";
  const prepRemaining = prepActions.length > 0 && !hardStop;
  const gateBlocksPreparation = bool(rules.human_gate_blocks_preparation);
  const humanGateDue = humanGates.length > 0 && (gateBlocksPreparation || !prepRemaining);
  const humanGateActionable = humanGateDue && humanGatePackets.length > 0 && humanGatePackets.every((packet) => packet.actionable);
  const submissionReady =
    !hardStop &&
    rulesVerified(rules) &&
    humanGates.length === 0 &&
    teamBlockers.length === 0 &&
    lower(build.state) === "built" &&
    lower(build.raven_qa_state) === "passed" &&
    bool(build.submission_package_ready);

  let state = "team_work_pending";
  if (hardStop) state = "held_ineligible_or_closed";
  else if (submissionReady) state = "autonomous_submission_ready";
  else if (humanGates.length > 0 && !humanGateDue) state = "team_can_advance_human_gate_deferred";
  else if (humanGates.length > 0) state = "held_human_gate";
  else if (teamBlockers.length > 0) state = "internal_repair_required";

  return {
    opportunity_id: String(opportunity?.opportunity_id || ""),
    provider,
    title: String(opportunity?.title || ""),
    value: opportunity?.value ?? null,
    deadline: opportunity?.deadline || null,
    deadline_state: dState,
    state,
    human_gates: humanGates,
    human_gate_packets: humanGatePackets,
    deferred_human_gates: humanGateDue ? [] : humanGates,
    human_gate_due: humanGateDue,
    human_gate_actionable: humanGateActionable,
    team_blockers: teamBlockers,
    team_can_continue_preparation: prepRemaining,
    next_team_action: prepActions[0] || (submissionReady ? "submit_and_verify_provider_receipt" : null),
    submission_ready: submissionReady,
    notify_human: humanGateActionable && humanGates.some((gate) => HUMAN_GATE_TYPES.has(gate)),
  };
}

export function compileHumanGateQueue(classifications = []) {
  const seen = new Set();
  const queue = [];
  for (const item of classifications) {
    if (!item.notify_human) continue;
    for (const gate of item.human_gates || []) {
      const key = [item.provider, item.opportunity_id, gate].join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      const packet = (item.human_gate_packets || []).find((candidate) => candidate.gate === gate);
      if (!packet?.actionable) continue;
      queue.push({
        gate_id: key,
        provider: item.provider,
        opportunity_id: item.opportunity_id,
        title: item.title,
        gate,
        deadline: item.deadline,
        blocking_submission: true,
        action_url: packet.action_url,
        action: packet.action,
        why: packet.why,
        after: packet.after,
      });
    }
  }
  return queue.sort((a, b) => {
    const da = Date.parse(a.deadline || "") || Number.MAX_SAFE_INTEGER;
    const db = Date.parse(b.deadline || "") || Number.MAX_SAFE_INTEGER;
    return da - db || a.gate_id.localeCompare(b.gate_id);
  });
}

export function runCompetitionControlPlane(opportunities = [], options = {}) {
  const classifications = opportunities.map((row) => classifyCompetitionOpportunity(row, options));
  const humanGateQueue = compileHumanGateQueue(classifications);
  const summary = {
    opportunity_count: classifications.length,
    autonomous_submission_ready: classifications.filter((x) => x.state === "autonomous_submission_ready").length,
    team_work_pending: classifications.filter((x) => x.team_can_continue_preparation).length,
    internal_repair_required: classifications.filter((x) => x.state === "internal_repair_required").length,
    human_gate_count: humanGateQueue.length,
    closed_or_ineligible: classifications.filter((x) => ["closed", "held_ineligible_or_closed"].includes(x.state)).length,
  };
  const body = {
    schema: "evercraft.systemia.competition-control-plane.v1",
    route: ["systemia", "competition_control_plane", "raven_qa", "raven_nexus", "provider_executor"],
    policy: {
      user_role: "exception_handler_only",
      team_owns: ["discovery", "rules_research", "fit_analysis", "build", "test", "qa", "packaging", "executor_repair", "receipt_tracking"],
      human_only: [...HUMAN_GATE_TYPES],
      new_terms_auto_accept: false,
      captcha_or_mfa_bypass: false,
      payment_or_staking_auto_authority: false,
      success_requires_provider_receipt: true,
    },
    classifications,
    human_gate_queue: humanGateQueue,
    summary,
    observed_at: new Date().toISOString(),
  };
  return { ...body, receipt_hash: sha256(JSON.stringify(body)) };
}
