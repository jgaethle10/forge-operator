import assert from "node:assert/strict";
import { buildClusterAdversarialSummary } from "./edge-cluster-adversarial-summary.mjs";

const candidates = [
  {
    signal_key:"ai_models|sec_8_k|SOXX|1d",
    rockies_range:"ai_models",
    observation_kind:"sec_8_k",
    benchmark:"SPY",
    status:"RESEARCH_CANDIDATE",
  },
  {
    signal_key:"ai_models|sec_8_k|SMH|1d",
    rockies_range:"ai_models",
    observation_kind:"sec_8_k",
    benchmark:"SPY",
    status:"RESEARCH_CANDIDATE",
  },
];

const rows=(field,value)=>candidates.map((candidate)=>({
  signal_key:candidate.signal_key,
  [field]:value,
}));

const summary=buildClusterAdversarialSummary({
  report:{evaluations:candidates},
  adversarial:{candidate_reviews:rows("adversarial_status","FORWARD_PAPER_ELIGIBLE")},
  stressLab:{reviews:rows("stress_status","STRESS_SURVIVOR")},
  breakerLab:{reviews:candidates.map((candidate)=>({
    signal_key:candidate.signal_key,
    breaker_status:"BREAKER_SURVIVOR",
    extended_breaker_status:"EXTENDED_BREAKER_SURVIVOR",
  }))},
  timingLab:{reviews:candidates.map((candidate)=>({
    signal_key:candidate.signal_key,
    timing_status:"TIMING_ROBUST_DIAGNOSTIC",
    extended_timing_status:"EXTENDED_TIMING_ROBUST_DIAGNOSTIC",
  }))},
  overlapLab:{reviews:rows("overlap_status","OVERLAP_ROBUST_DIAGNOSTIC")},
  placeboLab:{reviews:rows("placebo_status","PLACEBO_SEPARATED_DIAGNOSTIC")},
  randomPlaceboLab:{reviews:rows("random_placebo_status","RANDOM_PLACEBO_SEPARATED_DIAGNOSTIC")},
  labelPermutationLab:{reviews:rows("label_permutation_status","LABEL_PERMUTATION_SEPARATED_DIAGNOSTIC")},
  regimeFragilityLab:{reviews:rows("regime_status","REGIME_ROBUST_DIAGNOSTIC")},
  eventContaminationLab:{reviews:rows("contamination_status","CONTAMINATION_ROBUST_DIAGNOSTIC")},
  benchmarkLab:{reviews:rows("benchmark_status","BENCHMARK_ROBUST_DIAGNOSTIC")},
  horizonCoherenceLab:{reviews:rows("horizon_coherence_status","HORIZON_COHERENT_DIAGNOSTIC")},
  walkForwardLab:{reviews:rows("walk_forward_status","WALK_FORWARD_ROBUST_DIAGNOSTIC")},
  executionTranslationLab:{reviews:rows("translation_status","UNHEDGED_ONLY_TRANSLATES_DIAGNOSTIC")},
  currentRunForwardClusterScores:{
    scores:[{
      cluster_key:"ai_models|sec_8_k|SPY",
      status:"FORWARD_CLUSTER_PENDING",
      live_trade_authority:false,
    }],
  },
});

assert.equal(summary.cluster_count,1);
assert.equal(summary.candidate_count,2);
assert.equal(summary.clusters[0].candidate_count,2);
assert.equal(summary.clusters[0].diagnostic_counts.stress_survivor,2);
assert.equal(summary.clusters[0].diagnostic_counts.extended_breaker_survivor,2);
assert.equal(summary.clusters[0].diagnostic_counts.label_permutation_bh_separated,2);
assert.equal(
  summary.clusters[0].current_run_forward_cluster_score.status,
  "FORWARD_CLUSTER_PENDING"
);
assert.equal(summary.clusters[0].correlated_members_not_independent_edges,true);
assert.equal(summary.clusters[0].cluster_is_independence_reporting_unit,true);
assert.equal(summary.descriptive_rollup_only,true);
assert.equal(summary.live_trade_authority,false);

console.log(JSON.stringify({
  ok:true,
  schema:"evercraft.daytrade.edge-cluster-adversarial-summary-proof.v1",
  correlated_siblings_grouped:true,
  candidate_and_cluster_receipts_preserved:true,
  forward_cluster_score_attached:true,
  descriptive_only:true,
  eligibility_mutated:false,
  live_trade_authority:false,
}));
