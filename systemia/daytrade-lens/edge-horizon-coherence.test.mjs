import assert from "node:assert/strict";
import {
  evaluateHorizonCoherence,
  runHorizonCoherenceLab,
} from "./edge-horizon-coherence.mjs";

const candidate = {
  signal_key: "ai_models|sec_8_k|SOXX|1d",
  rockies_range: "ai_models",
  observation_kind: "sec_8_k",
  instrument: "SOXX",
  benchmark: "SPY",
  lag_key: "1d",
  learned_direction: "POSITIVE_EXCESS_RETURN",
  status: "RESEARCH_CANDIDATE",
};

function rows(lagKey, edge) {
  return Array.from({ length: 30 }, (_, i) => ({
    measurement_id: lagKey + ":" + i,
    signal_key: "ai_models|sec_8_k|SOXX|" + lagKey,
    rockies_range: "ai_models",
    observation_kind: "sec_8_k",
    instrument: "SOXX",
    benchmark: "SPY",
    lag_key: lagKey,
    origin_entity_ref: "issuer:" + (i % 6),
    forward_return: edge + (i % 3) * 0.0002,
    benchmark_return: 0.001,
  }));
}

const report = {
  evaluations: [
    candidate,
    { ...candidate, signal_key: "ai_models|sec_8_k|SOXX|3d", lag_key: "3d" },
    { ...candidate, signal_key: "ai_models|sec_8_k|SOXX|5d", lag_key: "5d" },
  ],
  measurements: [
    ...rows("1d", 0.008),
    ...rows("3d", 0.010),
    ...rows("5d", 0.012),
  ],
};

const coherent = evaluateHorizonCoherence(candidate, report, {
  transaction_cost_bps: 20,
});
assert.equal(coherent.horizon_coherence_status, "HORIZON_COHERENT_DIAGNOSTIC");
assert.equal(coherent.horizons.length, 3);
assert.ok(coherent.horizons.every((row) => row.mean_signed_net_in_candidate_direction > 0));
assert.equal(coherent.eligibility_mutated, false);

const fragileReport = {
  ...report,
  measurements: [
    ...rows("1d", 0.008),
    ...rows("3d", 0.010),
    ...rows("5d", -0.008),
  ],
};
const fragile = evaluateHorizonCoherence(candidate, fragileReport, {
  transaction_cost_bps: 20,
});
assert.equal(fragile.horizon_coherence_status, "HORIZON_FRAGILE_DIAGNOSTIC");
assert.equal(
  fragile.checks.all_ready_horizons_positive_in_frozen_candidate_direction,
  false
);

const negativeCandidate = {
  ...candidate,
  signal_key: "ai_models|sec_8_k|SOXX|1d-neg",
  learned_direction: "NEGATIVE_EXCESS_RETURN",
};
const negativeReport = {
  evaluations: [
    negativeCandidate,
    { ...negativeCandidate, signal_key: "ai_models|sec_8_k|SOXX|3d-neg", lag_key: "3d" },
    { ...negativeCandidate, signal_key: "ai_models|sec_8_k|SOXX|5d-neg", lag_key: "5d" },
  ],
  measurements: [
    ...rows("1d", -0.008),
    ...rows("3d", -0.010),
    ...rows("5d", -0.012),
  ],
};
const negative = evaluateHorizonCoherence(negativeCandidate, negativeReport, {
  transaction_cost_bps: 20,
});
assert.equal(negative.horizon_coherence_status, "HORIZON_COHERENT_DIAGNOSTIC");

const lab = runHorizonCoherenceLab(report, { transaction_cost_bps: 20 });
assert.equal(lab.candidate_count, 3);
assert.equal(lab.coherent_count, 3);
assert.equal(lab.historical_exploratory_only, true);
assert.equal(lab.live_trade_authority, false);

console.log(JSON.stringify({
  ok:true,
  schema:"evercraft.daytrade.edge-horizon-coherence-proof.v1",
  neighbor_1d_3d_5d_checked:true,
  frozen_candidate_direction_used:true,
  positive_and_negative_directions_supported:true,
  exploratory_only:true,
  eligibility_mutated:false,
  live_trade_authority:false,
}));
