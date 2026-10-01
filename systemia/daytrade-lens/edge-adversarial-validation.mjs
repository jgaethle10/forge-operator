import crypto from "node:crypto";

function uniq(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function mean(values) {
  return values.length ? values.reduce((a,b) => a + b, 0) / values.length : 0;
}

function directionalNetExcess(row, transactionCostBps, expectedSign = 1) {
  const excess = Number(row.forward_return || 0) - Number(row.benchmark_return || 0);
  return Number(expectedSign || 0) * excess - (transactionCostBps / 10000);
}

function sign(value) {
  return value > 0 ? 1 : value < 0 ? -1 : 0;
}

function familyKey(row) {
  return [
    row.rockies_range,
    row.observation_kind,
    row.benchmark || "SPY",
  ].join("|");
}

export function leaveOneOriginOut(rows, {
  transaction_cost_bps = 5,
  expected_sign = 1,
} = {}) {
  const origins = uniq(rows.map((row) => row.origin_entity_ref));
  const folds = origins.map((origin) => {
    const kept = rows.filter((row) => row.origin_entity_ref !== origin);
    const value = mean(kept.map((row) =>
      directionalNetExcess(row, transaction_cost_bps, expected_sign)
    ));
    return {
      omitted_origin: origin,
      observations: kept.length,
      mean_excess_return_net: value,
      sign: sign(value),
      sign_preserved: sign(value) === 1,
    };
  });
  return {
    origin_count: origins.length,
    folds,
    all_signs_preserved: folds.length > 0 && folds.every((fold) => fold.sign_preserved),
    worst_fold_mean_excess_return_net: folds.length
      ? Math.min(...folds.map((fold) => fold.mean_excess_return_net))
      : 0,
  };
}

export function splitByCalendarPeriod(rows, {
  transaction_cost_bps = 5,
  expected_sign = 1,
  period = "quarter",
} = {}) {
  const groups = new Map();
  for (const row of rows) {
    const date = new Date(row.observed_at);
    if (!Number.isFinite(date.getTime())) continue;
    const year = date.getUTCFullYear();
    const key = period === "year"
      ? String(year)
      : `${year}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const periods = [...groups.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([key, group]) => {
    const value = mean(group.map((row) =>
      directionalNetExcess(row, transaction_cost_bps, expected_sign)
    ));
    return {
      period: key,
      observations: group.length,
      mean_excess_return_net: value,
      sign: sign(value),
      sign_preserved: sign(value) === 1,
    };
  });
  return {
    periods,
    period_count: periods.length,
    sign_preservation_rate: periods.length
      ? periods.filter((x) => x.sign_preserved).length / periods.length
      : 0,
  };
}

export function clusterCandidateEvaluations(evaluations = []) {
  const candidates = evaluations.filter((row) => row.status === "RESEARCH_CANDIDATE");
  const groups = new Map();
  for (const row of candidates) {
    const key = familyKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()].map(([key, rows]) => ({
    cluster_key: key,
    candidate_count: rows.length,
    signal_keys: rows.map((row) => row.signal_key),
    instruments: uniq(rows.map((row) => row.instrument)),
    lags: uniq(rows.map((row) => row.lag_key)),
    minimum_development_q_bh: Math.min(...rows.map((row) => Number(row.development_q_bh || 1))),
    live_trade_authority: false,
  }));
}

export function adversarialValidateCandidates(report, {
  transaction_cost_bps = 5,
  minimum_quarter_sign_preservation = 0.75,
} = {}) {
  const evaluations = report?.evaluations || [];
  const measurements = report?.measurements || [];
  const candidateRows = evaluations.filter((row) => row.status === "RESEARCH_CANDIDATE");
  if (candidateRows.length > 0 && measurements.length === 0) {
    throw new Error("edge_adversarial_measurement_evidence_missing");
  }
  const clusters = clusterCandidateEvaluations(evaluations);

  const candidateReviews = evaluations
    .filter((row) => row.status === "RESEARCH_CANDIDATE")
    .map((candidate) => {
      const rows = measurements.filter((row) => row.signal_key === candidate.signal_key);
      const expectedSign = candidate.learned_direction === "NEGATIVE_EXCESS_RETURN" ? -1 : 1;
      const loo = leaveOneOriginOut(rows, {
        transaction_cost_bps,
        expected_sign: expectedSign,
      });
      const quarters = splitByCalendarPeriod(rows, {
        transaction_cost_bps,
        expected_sign: expectedSign,
        period: "quarter",
      });
      const years = splitByCalendarPeriod(rows, {
        transaction_cost_bps,
        expected_sign: expectedSign,
        period: "year",
      });

      const checks = {
        leave_one_origin_out_sign_preserved: loo.all_signs_preserved,
        quarter_regime_sign_preservation:
          quarters.period_count >= 2 &&
          quarters.sign_preservation_rate >= minimum_quarter_sign_preservation,
        multi_origin_holdout: Number(candidate.holdout_origin_entities || 0) >= 3,
        false_discovery_pass: candidate.candidate_checks?.false_discovery_rate_pass === true,
      };

      return {
        schema: "evercraft.daytrade.edge-adversarial-candidate.v1",
        signal_key: candidate.signal_key,
        cluster_key: familyKey(candidate),
        checks,
        leave_one_origin_out: loo,
        calendar_quarters: quarters,
        calendar_years: years,
        adversarial_status: Object.values(checks).every(Boolean)
          ? "FORWARD_PAPER_ELIGIBLE"
          : "REJECT_OR_RESEARCH_MORE",
        live_trade_authority: false,
      };
    });

  return {
    schema: "evercraft.daytrade.edge-adversarial-review.v1",
    review_id: "edgeadv_" + crypto.createHash("sha256")
      .update(JSON.stringify(candidateReviews))
      .digest("hex").slice(0,16),
    generated_at: new Date().toISOString(),
    candidate_count: candidateReviews.length,
    candidate_cluster_count: clusters.length,
    clusters,
    candidate_reviews: candidateReviews,
    forward_paper_eligible_count: candidateReviews.filter(
      (row) => row.adversarial_status === "FORWARD_PAPER_ELIGIBLE"
    ).length,
    live_trade_authority: false,
  };
}
