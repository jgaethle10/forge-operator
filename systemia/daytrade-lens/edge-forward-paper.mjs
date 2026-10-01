import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

export function freezeForwardPaperCohort(candidateReview, evaluation, {
  enrolled_at = new Date().toISOString(),
  transaction_cost_bps = 5,
  minimum_forward_events = 20,
  minimum_distinct_origins = 5,
} = {}) {
  if (candidateReview?.adversarial_status !== "FORWARD_PAPER_ELIGIBLE") {
    throw new Error("edge_forward_paper_candidate_not_eligible");
  }
  if (!evaluation?.signal_key || evaluation.signal_key !== candidateReview.signal_key) {
    throw new Error("edge_forward_paper_evaluation_mismatch");
  }

  const protocol = {
    schema: "evercraft.daytrade.forward-paper-protocol.v1",
    signal_key: evaluation.signal_key,
    cluster_key: candidateReview.cluster_key,
    rockies_range: evaluation.rockies_range,
    observation_kind: evaluation.observation_kind,
    instrument: evaluation.instrument,
    benchmark: evaluation.benchmark || "SPY",
    lag_key: evaluation.lag_key,
    learned_direction: evaluation.learned_direction,
    transaction_cost_bps,
    enrolled_at,
    observation_cutoff: enrolled_at,
    minimum_forward_events,
    minimum_distinct_origins,
    pass_criteria: {
      direction_must_match_frozen_direction: true,
      mean_excess_return_net_must_be_positive_in_frozen_direction: true,
      minimum_forward_events,
      minimum_distinct_origins,
      no_retroactive_events: true,
    },
    live_trade_authority: false,
    immutable: true,
  };
  const protocol_hash = digest(protocol);
  return {
    ...protocol,
    protocol_hash,
    cohort_id: "edgepaper_" + protocol_hash.slice(0,20),
  };
}

export function validateFrozenProtocol(protocol) {
  const { protocol_hash, cohort_id, ...body } = protocol || {};
  const actual = digest(body);
  if (!protocol_hash || actual !== protocol_hash) throw new Error("edge_forward_paper_protocol_mutated");
  if (cohort_id !== "edgepaper_" + protocol_hash.slice(0,20)) throw new Error("edge_forward_paper_cohort_id_invalid");
  return true;
}

export function scoreForwardPaperCohort(protocol, measurements = []) {
  validateFrozenProtocol(protocol);
  const cutoff = new Date(protocol.observation_cutoff).getTime();
  const rows = measurements.filter((row) =>
    row.signal_key === protocol.signal_key &&
    new Date(row.observed_at).getTime() > cutoff
  );
  const origins = [...new Set(rows.map((row) => row.origin_entity_ref).filter(Boolean))];
  const signed = rows.map((row) => {
    const raw = Number(row.forward_return || 0) - Number(row.benchmark_return || 0);
    const expectedSign = protocol.learned_direction === "NEGATIVE_EXCESS_RETURN" ? -1 : 1;
    return expectedSign * raw - (Number(protocol.transaction_cost_bps) / 10000);
  });
  const meanNet = signed.length ? signed.reduce((a,b) => a+b,0) / signed.length : 0;
  const checks = {
    minimum_forward_events: rows.length >= Number(protocol.minimum_forward_events),
    minimum_distinct_origins: origins.length >= Number(protocol.minimum_distinct_origins),
    frozen_direction_positive_after_costs: meanNet > 0,
    no_retroactive_events: rows.every((row) => new Date(row.observed_at).getTime() > cutoff),
  };
  const sampleReady =
    checks.minimum_forward_events &&
    checks.minimum_distinct_origins &&
    checks.no_retroactive_events;
  const status = !sampleReady
    ? "FORWARD_PAPER_PENDING"
    : checks.frozen_direction_positive_after_costs
      ? "FORWARD_PAPER_PASS"
      : "FORWARD_PAPER_FAIL";

  return {
    schema: "evercraft.daytrade.forward-paper-score.v1",
    cohort_id: protocol.cohort_id,
    signal_key: protocol.signal_key,
    cluster_key: protocol.cluster_key,
    protocol_hash: protocol.protocol_hash,
    forward_events: rows.length,
    distinct_origins: origins.length,
    mean_signed_excess_return_net: meanNet,
    sample_ready: sampleReady,
    checks,
    status,
    live_trade_authority: false,
  };
}

export function persistFrozenCohorts(adversarialReview, researchReport, {
  state_dir,
  enrolled_at = new Date().toISOString(),
  transaction_cost_bps = 5,
} = {}) {
  if (!state_dir) throw new Error("edge_forward_paper_state_dir_required");
  fs.mkdirSync(state_dir, { recursive: true });
  const evaluations = researchReport?.evaluations || [];
  const cohorts = [];
  for (const review of adversarialReview?.candidate_reviews || []) {
    if (review.adversarial_status !== "FORWARD_PAPER_ELIGIBLE") continue;
    const evaluation = evaluations.find((row) => row.signal_key === review.signal_key);
    if (!evaluation) throw new Error("edge_forward_paper_evaluation_missing");
    const cohort = freezeForwardPaperCohort(review, evaluation, { enrolled_at, transaction_cost_bps });
    const file = path.join(state_dir, cohort.cohort_id + ".json");
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(cohort, null, 2) + "\n", { flag: "wx" });
    const stored = JSON.parse(fs.readFileSync(file, "utf8"));
    validateFrozenProtocol(stored);
    cohorts.push(stored);
  }
  return cohorts;
}
