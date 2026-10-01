import assert from "node:assert/strict";
import {
  FIVE_MINUTE_LAG_BARS,
  EXECUTION_DELAY_STRESS_BARS,
  ALTERNATE_BENCHMARKS_BY_INSTRUMENT,
  buildMatchedPlaceboHypotheses,
  measureRockiesHypotheses,
  evaluateEdgeFamilies,
  benjaminiHochberg,
  fetchAlpacaBars,
  filterCoreSessionBars,
} from "./edge-research-factory.mjs";

function bars(start, count, drift) {
  const out = [];
  let price = 100;
  for (let i = 0; i < count; i++) {
    price *= 1 + drift;
    out.push({
      t: new Date(Date.parse(start) + i * 5 * 60_000).toISOString(),
      c: price,
    });
  }
  return out;
}

const filtered = filterCoreSessionBars([
  { t: "2026-09-01T13:25:00Z", c: 99 },
  { t: "2026-09-01T13:30:00Z", c: 100 },
  { t: "2026-09-01T19:55:00Z", c: 101 },
  { t: "2026-09-01T20:00:00Z", c: 102 },
]);
assert.deepEqual(filtered.map((row) => row.t), [
  "2026-09-01T13:30:00Z",
  "2026-09-01T19:55:00Z",
]);

const hypothesis = {
  hypothesis_id: "edgehyp:proof",
  source_observation_id: "ctxobs:proof",
  observed_at: "2026-09-01T13:30:00Z",
  rockies_range: "grid_energy",
  observation_kind: "grid_stress",
  research_instruments: ["XLU"],
  lag_windows: [{ key: "15m", minutes: 15 }],
  source_family: "regional_grid_operators",
  independent_source_family_count: 2,
  provenance_refs: ["public:grid:proof"],
  evidence_state: "verified",
  anomaly_score: 0.8,
  source_reliability: 0.9,
};

const placebos = buildMatchedPlaceboHypotheses([hypothesis]);
assert.equal(placebos.length, 2);
assert.deepEqual(placebos.map((row) => row.placebo_offset_days).sort((a,b)=>a-b), [-7, 7]);
assert.ok(placebos.every((row) => row.placebo_for_source_observation_id === hypothesis.source_observation_id));
assert.ok(placebos.every((row) => new Date(row.observed_at).getUTCDay() === new Date(hypothesis.observed_at).getUTCDay()));

const nearbyReal = {
  ...hypothesis,
  hypothesis_id: "edgehyp:nearby",
  source_observation_id: "ctxobs:nearby",
  observed_at: "2026-09-08T13:30:00Z",
};
const excludedPlacebos = buildMatchedPlaceboHypotheses([hypothesis, nearbyReal]);
assert.equal(
  excludedPlacebos.some((row) =>
    row.placebo_for_source_observation_id === hypothesis.source_observation_id &&
    row.placebo_offset_days === 7
  ),
  false
);

const measured = measureRockiesHypotheses([hypothesis], {
  XLU: bars("2026-09-01T13:30:00Z", 10, 0.002),
  SPY: bars("2026-09-01T13:30:00Z", 10, 0.0005),
  QQQ: bars("2026-09-01T13:30:00Z", 10, 0.001),
});
assert.equal(measured.length, 1);
assert.equal(measured[0].lag_bars, FIVE_MINUTE_LAG_BARS["15m"]);
assert.equal(measured[0].live_trade_authority, false);
assert.ok(measured[0].alternate_benchmarks.QQQ);
assert.ok(Number.isFinite(measured[0].alternate_benchmarks.QQQ.excess_return));
assert.deepEqual(ALTERNATE_BENCHMARKS_BY_INSTRUMENT.SOXX, ["QQQ", "SMH"]);
assert.deepEqual(
  Object.keys(measured[0].execution_delay_stress).sort(),
  Object.keys(EXECUTION_DELAY_STRESS_BARS).sort()
);
assert.equal(measured[0].execution_delay_stress["5m"].delay_bars, 1);
assert.equal(measured[0].execution_delay_stress["15m"].delay_bars, 3);
assert.equal(measured[0].execution_delay_stress["30m"].delay_bars, 6);
assert.ok(
  new Date(measured[0].execution_delay_stress["30m"].instrument_start_time).getTime() >
    new Date(measured[0].instrument_start_time).getTime()
);
assert.equal(
  new Date(measured[0].instrument_start_time).getTime() >= new Date(hypothesis.observed_at).getTime(),
  true
);

const many = [];
for (let i = 0; i < 50; i++) {
  many.push({
    ...measured[0],
    measurement_id: "m:" + i,
    source_observation_id: "o:" + i,
    observed_at: new Date(Date.parse("2026-01-01T15:00:00Z") + i * 86400000).toISOString(),
    source_family: i % 2 ? "grid_operator" : "utility_public_status",
    forward_return: (i < 35 ? 0.0030 : 0.0025) + (i % 5) * 0.0001,
    benchmark_return: 0.0005 + (i % 3) * 0.00002,
  });
}
const evaluated = evaluateEdgeFamilies(many, {
  transaction_cost_bps: 2,
  false_discovery_rate: 0.10,
});
assert.equal(evaluated.length, 1);
assert.equal(evaluated[0].distinct_source_families, 2);
assert.equal(evaluated[0].candidate_checks.minimum_source_family_diversity, true);
assert.equal(evaluated[0].status, "RESEARCH_CANDIDATE");
assert.equal(evaluated[0].live_trade_authority, false);

const oneSource = many.map((row) => ({ ...row, source_family: "one_source" }));
const rejected = evaluateEdgeFamilies(oneSource, {
  transaction_cost_bps: 2,
  false_discovery_rate: 0.10,
});
assert.equal(rejected[0].candidate_checks.minimum_source_family_diversity, false);
assert.equal(rejected[0].status, "NOT_VALIDATED");

const authoritative = many.map((row, i) => ({
  ...row,
  source_family: "sec_filings",
  source_authority_class: "official_regulatory_filing",
  origin_entity_ref: "sec:cik:" + String(i % 6).padStart(10, "0"),
}));
const authoritativeEval = evaluateEdgeFamilies(authoritative, {
  transaction_cost_bps: 2,
  false_discovery_rate: 0.10,
});
assert.equal(authoritativeEval[0].candidate_checks.minimum_source_family_diversity, false);
assert.equal(authoritativeEval[0].candidate_checks.authoritative_multi_origin_diversity, true);
assert.equal(authoritativeEval[0].candidate_checks.evidence_diversity_pass, true);
assert.equal(authoritativeEval[0].distinct_origin_entities, 6);
assert.ok(authoritativeEval[0].holdout_origin_entities >= 3);
assert.equal(authoritativeEval[0].status, "RESEARCH_CANDIDATE");


const authoritativeNegative = many.map((row, i) => ({
  ...row,
  measurement_id: "neg:" + i,
  source_observation_id: "neg-o:" + i,
  source_family: "sec_filings",
  source_authority_class: "official_regulatory_filing",
  origin_entity_ref: "sec:cik:" + String(i % 6).padStart(10, "0"),
  forward_return: (i % 5 === 0 ? 0.001 : -0.004) - (i >= 35 ? 0.0005 : 0),
  benchmark_return: 0,
}));
const authoritativeNegativeEval = evaluateEdgeFamilies(authoritativeNegative, {
  transaction_cost_bps: 20,
  false_discovery_rate: 0.10,
});
assert.equal(authoritativeNegativeEval[0].candidate_checks.authoritative_multi_origin_diversity, true);
assert.equal(authoritativeNegativeEval[0].status, "RESEARCH_CANDIDATE");
assert.equal(authoritativeNegativeEval[0].learned_direction, "NEGATIVE_EXCESS_RETURN");
assert.ok(authoritativeNegativeEval[0].base_evaluation.holdout.mean_strategy_return_net > 0);
assert.ok(authoritativeNegativeEval[0].origin_balanced_holdout_mean_strategy_return_net > 0);
assert.ok(authoritativeNegativeEval[0].origin_balanced_holdout_mean_excess_return_net < 0);

const tooFewOrigins = many.map((row, i) => ({
  ...row,
  source_family: "sec_filings",
  source_authority_class: "official_regulatory_filing",
  origin_entity_ref: "sec:cik:" + String(i % 2).padStart(10, "0"),
}));
const tooFewEval = evaluateEdgeFamilies(tooFewOrigins, {
  transaction_cost_bps: 2,
  false_discovery_rate: 0.10,
});
assert.equal(tooFewEval[0].candidate_checks.authoritative_multi_origin_diversity, false);
assert.equal(tooFewEval[0].candidate_checks.evidence_diversity_pass, false);
assert.equal(tooFewEval[0].status, "NOT_VALIDATED");

let fetchCalls = 0;
const paginationUrls = [];
const fakeFetch = async (url) => {
  fetchCalls += 1;
  paginationUrls.push(String(url));
  const payload = fetchCalls === 1
    ? { bars: [{ t: "2026-01-01T14:30:00Z", c: 100 }], next_page_token: "p2" }
    : { bars: [{ t: "2026-01-01T14:35:00Z", c: 101 }], next_page_token: null };
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
const paged = await fetchAlpacaBars("TEST", {
  start: "2026-01-01T00:00:00Z",
  end: "2026-12-31T23:59:59Z",
  key: "proof-key",
  secret: "proof-secret",
  fetchImpl: fakeFetch,
});
assert.equal(fetchCalls, 2);
assert.equal(paged.length, 2);
assert.ok(paginationUrls[1].includes("page_token=p2"));

let loopCalls = 0;
const loopingFetch = async () => {
  loopCalls += 1;
  return new Response(JSON.stringify({
    bars: [],
    next_page_token: "same-token",
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
await assert.rejects(
  () => fetchAlpacaBars("LOOP", {
    start: "2026-01-01T00:00:00Z",
    end: "2026-12-31T23:59:59Z",
    key: "proof-key",
    secret: "proof-secret",
    fetchImpl: loopingFetch,
  }),
  /pagination_loop/
);
assert.equal(loopCalls, 2);

const bh = benjaminiHochberg([
  { id: "a", development_p_approx: 0.001 },
  { id: "b", development_p_approx: 0.02 },
  { id: "c", development_p_approx: 0.20 },
]);
assert.ok(bh[0].development_q_bh <= bh[1].development_q_bh);
assert.ok(bh[1].development_q_bh <= bh[2].development_q_bh);

console.log(JSON.stringify({
  ok: true,
  schema: "evercraft.daytrade.edge-research-factory-proof.v1",
  no_lookahead: true,
  benchmark_adjusted: true,
  core_session_horizons: true,
  source_diversity_required: true,
  authoritative_multi_origin_screen: true,
  origin_balanced_strategy_cost_accounting: true,
  negative_direction_cost_regression_guard: true,
  alpaca_pagination: true,
  pagination_loop_guard: true,
  false_discovery_control: "benjamini_hochberg",
  live_trade_authority: false,
}));
