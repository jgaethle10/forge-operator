import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

export const CANONICAL_FORWARD_PAPER_CUTOFF = "2026-09-30T23:10:52.172Z";
export const CANONICAL_FORWARD_PAPER_ARTIFACT_DIGEST =
  "sha256:fad591be832d023188e60908afee9252713545e0cb42ae3cc2ebcea698ac7a96";

const DEFAULT_CANONICAL_MANIFEST_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "frozen-forward-paper-cohorts.v1.json"
);

export function loadCanonicalFrozenCohorts({
  manifest_file = DEFAULT_CANONICAL_MANIFEST_FILE,
} = {}) {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(manifest_file), "utf8"));
  if (manifest?.schema !== "evercraft.daytrade.forward-paper-canonical-manifest.v1") {
    throw new Error("edge_forward_paper_canonical_manifest_schema_mismatch");
  }
  if (manifest?.source?.github_artifact_digest !== CANONICAL_FORWARD_PAPER_ARTIFACT_DIGEST) {
    throw new Error("edge_forward_paper_canonical_artifact_digest_mismatch");
  }
  if (manifest?.source?.original_manifest_generated_at !== CANONICAL_FORWARD_PAPER_CUTOFF) {
    throw new Error("edge_forward_paper_canonical_cutoff_mismatch");
  }

  const cohorts = Array.isArray(manifest.cohorts) ? manifest.cohorts : [];
  if (manifest.cohort_count !== 6 || cohorts.length !== 6) {
    throw new Error("edge_forward_paper_canonical_cohort_count_mismatch");
  }

  const signalKeys = new Set();
  const cohortIds = new Set();
  for (const cohort of cohorts) {
    validateFrozenProtocol(cohort);
    if (
      cohort.enrolled_at !== CANONICAL_FORWARD_PAPER_CUTOFF ||
      cohort.observation_cutoff !== CANONICAL_FORWARD_PAPER_CUTOFF
    ) {
      throw new Error("edge_forward_paper_canonical_protocol_cutoff_mismatch");
    }
    if (cohort.minimum_forward_events !== 20 || cohort.minimum_distinct_origins !== 5) {
      throw new Error("edge_forward_paper_canonical_sample_gate_mismatch");
    }
    if (cohort.live_trade_authority !== false || cohort.immutable !== true) {
      throw new Error("edge_forward_paper_canonical_authority_mismatch");
    }
    if (signalKeys.has(cohort.signal_key) || cohortIds.has(cohort.cohort_id)) {
      throw new Error("edge_forward_paper_canonical_duplicate");
    }
    signalKeys.add(cohort.signal_key);
    cohortIds.add(cohort.cohort_id);
  }

  return JSON.parse(JSON.stringify(manifest));
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

function forwardEventKey(row) {
  const source = String(row?.source_observation_id || "").trim();
  if (source) return "source:" + source;
  return [
    "fallback",
    String(row?.origin_entity_ref || "unknown"),
    String(row?.observed_at || "unknown"),
  ].join("|");
}

export function scoreForwardPaperCluster(protocols = [], measurements = []) {
  const members = (protocols || []).filter(Boolean);
  if (!members.length) throw new Error("edge_forward_paper_cluster_protocols_required");
  for (const protocol of members) validateFrozenProtocol(protocol);

  const clusterKeys = [...new Set(members.map((protocol) => String(protocol.cluster_key || "")))];
  if (clusterKeys.length !== 1 || !clusterKeys[0]) {
    throw new Error("edge_forward_paper_cluster_mismatch");
  }

  const bySignal = new Map(members.map((protocol) => [protocol.signal_key, protocol]));
  const eventMap = new Map();
  let rawMemberMeasurements = 0;
  let retroactiveRowsIgnored = 0;

  for (const row of measurements || []) {
    const protocol = bySignal.get(row?.signal_key);
    if (!protocol) continue;
    const observed = new Date(row?.observed_at).getTime();
    const cutoff = new Date(protocol.observation_cutoff).getTime();
    if (!Number.isFinite(observed) || observed <= cutoff) {
      retroactiveRowsIgnored += 1;
      continue;
    }

    const raw = Number(row.forward_return || 0) - Number(row.benchmark_return || 0);
    const expectedSign = protocol.learned_direction === "NEGATIVE_EXCESS_RETURN" ? -1 : 1;
    const signedNet = expectedSign * raw - (Number(protocol.transaction_cost_bps) / 10000);
    const key = forwardEventKey(row);
    if (!eventMap.has(key)) {
      eventMap.set(key, {
        event_key: key,
        observed_at: row.observed_at,
        origins: new Set(),
        signals: new Set(),
        signed_net_values: [],
      });
    }
    const event = eventMap.get(key);
    if (row.origin_entity_ref) event.origins.add(row.origin_entity_ref);
    event.signals.add(protocol.signal_key);
    event.signed_net_values.push(signedNet);
    rawMemberMeasurements += 1;
  }

  const events = [...eventMap.values()]
    .map((event) => ({
      event_key: event.event_key,
      observed_at: event.observed_at,
      origin_entities: [...event.origins].sort(),
      member_signal_count: event.signals.size,
      member_measurement_count: event.signed_net_values.length,
      mean_signed_excess_return_net:
        event.signed_net_values.reduce((a,b) => a + b, 0) / event.signed_net_values.length,
    }))
    .sort((a,b) => new Date(a.observed_at) - new Date(b.observed_at));

  const origins = [...new Set(events.flatMap((event) => event.origin_entities))];
  const meanNet = events.length
    ? events.reduce((sum, event) => sum + event.mean_signed_excess_return_net, 0) / events.length
    : 0;
  const minimumForwardEvents = Math.max(...members.map((protocol) => Number(protocol.minimum_forward_events || 0)));
  const minimumDistinctOrigins = Math.max(...members.map((protocol) => Number(protocol.minimum_distinct_origins || 0)));

  const checks = {
    minimum_forward_events: events.length >= minimumForwardEvents,
    minimum_distinct_origins: origins.length >= minimumDistinctOrigins,
    frozen_cluster_direction_positive_after_costs: meanNet > 0,
    correlated_members_counted_by_underlying_event: true,
    no_retroactive_events_counted: true,
  };
  const sampleReady =
    checks.minimum_forward_events &&
    checks.minimum_distinct_origins &&
    checks.no_retroactive_events_counted;
  const status = !sampleReady
    ? "FORWARD_PAPER_CLUSTER_PENDING"
    : checks.frozen_cluster_direction_positive_after_costs
      ? "FORWARD_PAPER_CLUSTER_PASS"
      : "FORWARD_PAPER_CLUSTER_FAIL";

  return {
    schema: "evercraft.daytrade.forward-paper-cluster-score.v1",
    cluster_key: clusterKeys[0],
    member_cohort_count: members.length,
    member_signal_keys: members.map((protocol) => protocol.signal_key).sort(),
    raw_member_measurements: rawMemberMeasurements,
    forward_events: events.length,
    effective_independent_events: events.length,
    distinct_origins: origins.length,
    minimum_forward_events: minimumForwardEvents,
    minimum_distinct_origins: minimumDistinctOrigins,
    mean_signed_excess_return_net: meanNet,
    independence_ratio: rawMemberMeasurements ? events.length / rawMemberMeasurements : 0,
    retroactive_rows_ignored: retroactiveRowsIgnored,
    events,
    checks,
    sample_ready: sampleReady,
    status,
    correlated_members_not_independent_edges: true,
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
