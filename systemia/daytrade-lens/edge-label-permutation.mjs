import crypto from "node:crypto";

function mean(values) {
  return values.length ? values.reduce((a,b) => a + b, 0) / values.length : 0;
}

function expectedSign(candidate) {
  return candidate?.learned_direction === "NEGATIVE_EXCESS_RETURN" ? -1 : 1;
}

function signedNet(row, sign, costBps) {
  const raw = Number(row.forward_return || 0) - Number(row.benchmark_return || 0);
  return sign * raw - Number(costBps || 0) / 10000;
}

function shaInt(seed) {
  return crypto.createHash("sha256").update(String(seed)).digest().readUInt32BE(0);
}

function rng(seed) {
  let x = shaInt(seed) || 1;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17; x >>>= 0;
    x ^= x << 5; x >>>= 0;
    return (x >>> 0) / 4294967296;
  };
}

function bh(rows) {
  const ranked = rows
    .map((row) => row)
    .sort((a,b) => a.label_permutation_p_value - b.label_permutation_p_value);
  let running = 1;
  for (let i = ranked.length - 1; i >= 0; i--) {
    const rank = i + 1;
    const q = Math.min(
      running,
      ranked[i].label_permutation_p_value * ranked.length / rank
    );
    ranked[i].label_permutation_q_bh = q;
    ranked[i].label_permutation_p_bonferroni = Math.min(
      1,
      ranked[i].label_permutation_p_value * ranked.length
    );
    running = q;
  }
  return rows;
}

export function evaluateLabelPermutation(candidate, actualRows, placeboRows, {
  transaction_cost_bps = 5,
  iterations = 5000,
  minimum_events = 20,
  minimum_distinct_origins = 5,
  seed = null,
} = {}) {
  const sign = expectedSign(candidate);
  const actualByObservation = new Map(
    actualRows.map((row) => [row.source_observation_id, row])
  );
  const placeboByActual = new Map();
  for (const row of placeboRows) {
    const key = row.placebo_for_source_observation_id;
    if (!key || !actualByObservation.has(key)) continue;
    if (!placeboByActual.has(key)) placeboByActual.set(key, []);
    placeboByActual.get(key).push(row);
  }

  const events = [];
  for (const [sourceObservationId, actual] of actualByObservation.entries()) {
    const placebos = placeboByActual.get(sourceObservationId) || [];
    if (!placebos.length) continue;
    const actualNet = signedNet(actual, sign, transaction_cost_bps);
    const placeboMean = mean(
      placebos.map((row) => signedNet(row, sign, transaction_cost_bps))
    );
    events.push({
      source_observation_id: sourceObservationId,
      origin_entity_ref: actual.origin_entity_ref || null,
      actual_signed_net: actualNet,
      placebo_mean_signed_net: placeboMean,
      delta: actualNet - placeboMean,
      placebo_count: placebos.length,
    });
  }

  const deltas = events.map((row) => row.delta);
  const observed = mean(deltas);
  const origins = [...new Set(
    events.map((row) => row.origin_entity_ref).filter(Boolean)
  )];
  const random = rng(seed || candidate.signal_key + ":label-permutation");
  let asExtreme = 0;
  for (let i = 0; i < iterations; i++) {
    const permuted = deltas.map((delta) => (random() < 0.5 ? -delta : delta));
    if (mean(permuted) >= observed) asExtreme += 1;
  }
  const p = deltas.length
    ? (asExtreme + 1) / (iterations + 1)
    : 1;

  const checks = {
    matched_underlying_events_at_least_minimum:
      events.length >= minimum_events,
    matched_distinct_origins_at_least_minimum:
      origins.length >= minimum_distinct_origins,
    observed_actual_minus_placebo_positive:
      observed > 0,
    raw_label_permutation_p_below_05:
      p < 0.05,
  };

  return {
    schema: "evercraft.daytrade.edge-label-permutation-candidate.v1",
    signal_key: candidate.signal_key,
    cluster_key: [
      candidate.rockies_range,
      candidate.observation_kind,
      candidate.benchmark || "SPY",
    ].join("|"),
    learned_direction: candidate.learned_direction,
    transaction_cost_bps,
    underlying_events: events.length,
    distinct_origins: origins.length,
    observed_actual_minus_placebo: observed,
    iterations,
    label_permutation_p_value: p,
    label_permutation_q_bh: 1,
    label_permutation_p_bonferroni: 1,
    checks,
    raw_status: Object.values(checks).every(Boolean)
      ? "LABEL_PERMUTATION_SEPARATED_RAW"
      : "LABEL_PERMUTATION_NOT_SEPARATED_RAW",
    historical_diagnostic_only: true,
    historical_exploratory_only: true,
    eligibility_mutated: false,
    live_trade_authority: false,
  };
}

export function runLabelPermutationLab(report, options = {}) {
  const candidates = (report?.evaluations || []).filter(
    (row) => row.status === "RESEARCH_CANDIDATE"
  );
  const actual = report?.measurements || [];
  const placebo = report?.placebo_measurements || [];
  if (candidates.length && (!actual.length || !placebo.length)) {
    throw new Error("edge_label_permutation_evidence_missing");
  }

  const reviews = bh(candidates.map((candidate) =>
    evaluateLabelPermutation(
      candidate,
      actual.filter((row) => row.signal_key === candidate.signal_key),
      placebo.filter((row) => row.signal_key === candidate.signal_key),
      options
    )
  ));

  for (const review of reviews) {
    review.multiple_testing_checks = {
      bh_q_below_05: review.label_permutation_q_bh < 0.05,
      bonferroni_p_below_05:
        review.label_permutation_p_bonferroni < 0.05,
    };
    review.label_permutation_status =
      review.raw_status === "LABEL_PERMUTATION_SEPARATED_RAW" &&
      review.multiple_testing_checks.bh_q_below_05
        ? "LABEL_PERMUTATION_SEPARATED_DIAGNOSTIC"
        : "LABEL_PERMUTATION_NOT_SEPARATED_DIAGNOSTIC";
  }

  return {
    schema: "evercraft.daytrade.edge-label-permutation-lab.v1",
    generated_at: new Date().toISOString(),
    candidate_count: reviews.length,
    bh_separated_count: reviews.filter(
      (row) =>
        row.label_permutation_status ===
        "LABEL_PERMUTATION_SEPARATED_DIAGNOSTIC"
    ).length,
    bonferroni_separated_count: reviews.filter(
      (row) => row.multiple_testing_checks.bonferroni_p_below_05
    ).length,
    family_multiple_testing_control:
      "benjamini_hochberg_plus_bonferroni_diagnostic",
    reviews,
    historical_diagnostic_only: true,
    historical_exploratory_only: true,
    eligibility_mutated: false,
    live_trade_authority: false,
  };
}
