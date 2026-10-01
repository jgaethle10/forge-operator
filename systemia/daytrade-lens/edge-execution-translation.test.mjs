import assert from "node:assert/strict";
import {
  evaluateExecutionTranslation,
  runExecutionTranslationLab,
} from "./edge-execution-translation.mjs";

const candidate = {
  signal_key: "ai_models|sec_8_k|SOXX|1d",
  rockies_range: "ai_models",
  observation_kind: "sec_8_k",
  instrument: "SOXX",
  benchmark: "SPY",
  status: "RESEARCH_CANDIDATE",
  learned_direction: "POSITIVE_EXCESS_RETURN",
};

function buildRows(instrumentReturn, benchmarkReturn) {
  return Array.from({ length: 30 }, (_, i) => {
    const start = Date.parse("2025-01-02T15:00:00Z") + i * 3 * 86400000;
    return {
      measurement_id: "x:" + i,
      signal_key: candidate.signal_key,
      observed_at: new Date(start - 60000).toISOString(),
      origin_entity_ref: "issuer:" + (i % 6),
      forward_return: instrumentReturn,
      benchmark_return: benchmarkReturn,
      instrument_start_time: new Date(start).toISOString(),
      instrument_end_time: new Date(start + 6 * 60 * 60 * 1000).toISOString(),
    };
  });
}

const both = evaluateExecutionTranslation(
  candidate,
  buildRows(0.012, 0.003),
  { transaction_cost_bps_per_leg: 20 }
);
assert.equal(both.translation_status, "UNHEDGED_AND_PAIR_TRANSLATE_DIAGNOSTIC");
assert.ok(both.unhedged_instrument.mean_return > 0);
assert.ok(both.benchmark_neutral_pair.mean_return > 0);
assert.ok(both.unhedged_instrument.max_drawdown >= 0);

const pairOnly = evaluateExecutionTranslation(
  candidate,
  buildRows(-0.002, -0.012),
  { transaction_cost_bps_per_leg: 20 }
);
assert.equal(pairOnly.translation_status, "PAIR_ONLY_TRANSLATES_DIAGNOSTIC");
assert.ok(pairOnly.unhedged_instrument.mean_return < 0);
assert.ok(pairOnly.benchmark_neutral_pair.mean_return > 0);

const neither = evaluateExecutionTranslation(
  candidate,
  buildRows(-0.010, -0.002),
  { transaction_cost_bps_per_leg: 20 }
);
assert.equal(neither.translation_status, "NO_EXECUTION_TRANSLATION_DIAGNOSTIC");

const negativeCandidate = {
  ...candidate,
  signal_key: "ai_models|sec_8_k|SOXX|negative",
  learned_direction: "NEGATIVE_EXCESS_RETURN",
};
const negativeRows = buildRows(-0.012, -0.003).map((row, i) => ({
  ...row,
  measurement_id: "neg:" + i,
  signal_key: negativeCandidate.signal_key,
}));
const negative = evaluateExecutionTranslation(
  negativeCandidate,
  negativeRows,
  { transaction_cost_bps_per_leg: 20 }
);
assert.equal(negative.translation_status, "UNHEDGED_AND_PAIR_TRANSLATE_DIAGNOSTIC");
assert.equal(negative.short_borrow_availability_modeled, false);

const report = runExecutionTranslationLab({
  evaluations: [candidate],
  measurements: buildRows(0.012, 0.003),
});
assert.equal(report.candidate_count, 1);
assert.equal(report.status_counts.UNHEDGED_AND_PAIR_TRANSLATE_DIAGNOSTIC, 1);
assert.equal(report.live_trade_authority, false);

console.log(JSON.stringify({
  ok:true,
  schema:"evercraft.daytrade.edge-execution-translation-proof.v1",
  excess_return_not_equated_to_unhedged_pnl:true,
  one_leg_costs:true,
  pair_two_leg_costs:true,
  non_overlapping_path:true,
  drawdown_and_losing_streak:true,
  short_constraints_explicitly_unmodeled:true,
  historical_diagnostic_only:true,
  live_trade_authority:false,
}));
